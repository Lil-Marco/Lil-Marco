/**
 * A faithful in-process stand-in for the NestJS API described in the TDD, so the
 * app runs end to end without a backend or Safaricom. It implements the rules
 * the Backend Schema says the database must guarantee:
 *
 *  - the same M-Pesa receipt can never be credited twice (unique receipt check)
 *  - at most one PENDING attempt per invoice
 *  - totals always reconcile to their parts
 *  - amount_paid_cents always equals the sum of that invoice's payments
 *  - invoice numbers are unique and gapless per account
 *  - callback and sweeper settle through ONE function
 *
 * Pure TypeScript: no React Native imports, so it is unit-tested under Node.
 */
import { ApiError } from '../errors';
import type {
  Api,
  ApiEvent,
  ClientInput,
  ClientRow,
  InvoiceInput,
  InvoiceListQuery,
  InvoiceListRow,
  Me,
  MpesaStepInput,
  PaymentRow,
  SimScenario,
  SimSettings,
} from '../types';
import type {
  AuditEntry,
  Banner,
  BusinessProfile,
  Client,
  DashboardSummary,
  FailureReason,
  Invoice,
  InvoiceDetail,
  MpesaCredential,
  Notification,
  NotificationKind,
  NotificationPrefs,
  Payment,
  PaymentAttempt,
  PaymentSource,
  PaymentStatus,
  Plan,
  PublicInvoiceResult,
  Receipt,
  Reminder,
  ReminderRule,
  Subscription,
  SubscriptionCharge,
  Usage,
  User,
} from '../../domain/types';
import { computeTotals, totalsReconcile, VAT_BP } from '../../domain/totals';
import { FREE_MONTHLY_LIMIT, PRO_PRICE_CENTS } from '../../domain/plan';
import { formatKes, formatKesShort, toWholeShillings } from '../../domain/money';
import { displayPhone, maskPhone, normalisePhone } from '../../domain/phone';
import {
  addDays,
  daysBetween,
  eatDate,
  eatDateHourToIso,
  periodKeyEat,
  shiftIntoSendWindow,
  todayEat,
} from '../../domain/dates';
import { FREELANCER_FAILURE_COPY, mapResultCode } from '../../domain/resultCodes';

// ---------------------------------------------------------------------------
// Storage shape

interface Secrets {
  consumerKey: string | null;
  consumerSecret: string | null;
  passkey: string | null;
}

interface Account {
  user: User;
  passwordHash: string;
  profile: BusinessProfile;
  mpesa: MpesaCredential;
  secrets: Secrets;
  clients: Client[];
  invoices: Invoice[];
  attempts: (PaymentAttempt & { sim?: SimScenario })[];
  payments: Payment[];
  receipts: Receipt[];
  reminders: Reminder[];
  reminderRules: ReminderRule[];
  notifications: Notification[];
  notificationPrefs: NotificationPrefs;
  audit: AuditEntry[];
  usage: Record<string, number>;
  subscription: Subscription;
  charges: SubscriptionCharge[];
  nextReceiptNo: number;
  dismissedBanners: string[];
  verificationResends: number;
}

export interface DbShape {
  version: 1;
  accounts: Record<string, Account>;
  emailIndex: Record<string, string>;
  sessionUserId: string | null;
  loginFailures: Record<string, string[]>;
  sim: SimSettings;
}

export interface Storage {
  load(): Promise<string | null>;
  save(json: string): Promise<void>;
}

export interface Env {
  now: () => Date;
  randomBytes: (n: number) => Uint8Array;
  setTimer: (fn: () => void, ms: number) => void;
  latencyMs: number;
  logger: { warn: (m: string) => void; info: (m: string) => void };
  publicBaseUrl: string;
}

export { FREE_MONTHLY_LIMIT, PRO_PRICE_CENTS };
const DEFAULT_RULES = [-3, 0, 3, 7, 14];
const STK_WINDOW_MS = 60 * 60 * 1000;
const STK_PER_INVOICE_PER_HOUR = 5;
const SWEEP_AFTER_MS = 90 * 1000;
const MAX_POLLS = 10;

const SIM_RESULT: Record<SimScenario, number | null> = {
  SUCCESS: 0,
  DUPLICATE_CALLBACK: 0,
  LATE_SUCCESS: 0,
  WRONG_PIN: 2001,
  CANCELLED: 1032,
  INSUFFICIENT: 1,
  UNREACHABLE: 1037,
  SYSTEM: 9999,
  NO_RESPONSE: 1019,
};

function emptyDb(): DbShape {
  return {
    version: 1,
    accounts: {},
    emailIndex: {},
    sessionUserId: null,
    loginFailures: {},
    sim: { scenario: 'SUCCESS', callbackDelayMs: 6000 },
  };
}

/** Not a real password hash — the real API uses argon2id. Enough to avoid storing plaintext in the mock. */
function weakHash(s: string): string {
  let h1 = 0xdeadbeef ^ s.length;
  let h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  return `mock$${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
}

export class MockServer implements Api {
  readonly mode = 'mock' as const;
  private db: DbShape = emptyDb();
  private loaded = false;
  private listeners = new Set<(e: ApiEvent) => void>();
  private inflightPay = new Map<string, Promise<{ attemptId: string }>>();
  private idempotency = new Map<string, string>();

  constructor(private storage: Storage, private env: Env) {}

  // -------------------------------------------------------------------------
  // Plumbing

  private async ready() {
    if (this.loaded) return;
    const raw = await this.storage.load();
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as DbShape;
        if (parsed.version === 1) this.db = parsed;
      } catch {
        this.env.logger.warn('Mock DB unreadable; starting fresh');
      }
    }
    this.loaded = true;
  }

  private async delay() {
    if (this.env.latencyMs > 0) await new Promise<void>((r) => this.env.setTimer(r, this.env.latencyMs));
  }

  private async persist() {
    await this.storage.save(JSON.stringify(this.db));
  }

  private emit(e: ApiEvent) {
    this.listeners.forEach((l) => l(e));
  }

  private async commit() {
    await this.persist();
    this.emit({ type: 'changed' });
  }

  subscribe(listener: (e: ApiEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private nowIso() {
    return this.env.now().toISOString();
  }

  private hex(n: number) {
    return Array.from(this.env.randomBytes(n), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  private id() {
    // uuid v7-ish: time-ordered prefix + randomness
    const t = this.env.now().getTime().toString(16).padStart(12, '0');
    const r = this.hex(10);
    return `${t.slice(0, 8)}-${t.slice(8, 12)}-7${r.slice(0, 3)}-${r.slice(3, 7)}-${r.slice(7, 19).padEnd(12, '0')}`;
  }

  private token() {
    const bytes = this.env.randomBytes(32);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    return Array.from(bytes, (b) => alphabet[b & 63]).join('');
  }

  private receiptCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
    const bytes = this.env.randomBytes(8);
    return `TJ${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}`;
  }

  private acct(): Account {
    const id = this.db.sessionUserId;
    const a = id ? this.db.accounts[id] : null;
    if (!a) throw new ApiError('UNAUTHENTICATED', 'Please log in again.');
    return a;
  }

  private findInvoice(a: Account, id: string): Invoice {
    const inv = a.invoices.find((i) => i.id === id);
    // 404, never 403 — existence is not leaked.
    if (!inv) throw new ApiError('NOT_FOUND', 'That invoice doesn’t exist.');
    return inv;
  }

  private audit(a: Account, invoiceId: string | null, action: string, message: string) {
    a.audit.push({ id: this.id(), invoiceId, action, message, createdAt: this.nowIso() });
  }

  private notify(a: Account, kind: NotificationKind, title: string, body: string, invoiceId: string | null) {
    a.notifications.unshift({ id: this.id(), kind, title, body, invoiceId, createdAt: this.nowIso(), readAt: null });
  }

  private clientName(a: Account, clientId: string) {
    return a.clients.find((c) => c.id === clientId)?.name ?? 'Unknown client';
  }

  private usage(a: Account): Usage {
    const period = periodKeyEat(this.env.now());
    const limit = a.user.plan === 'FREE' ? FREE_MONTHLY_LIMIT : null;
    return { period, invoicesSent: a.usage[period] ?? 0, limit };
  }

  private meOf(a: Account): Me {
    return {
      user: { ...a.user },
      profile: { ...a.profile },
      mpesa: { ...a.mpesa },
      usage: this.usage(a),
      subscription: { ...a.subscription },
    };
  }

  // -------------------------------------------------------------------------
  // Auth

  async restoreSession() {
    await this.ready();
    const id = this.db.sessionUserId;
    if (!id || !this.db.accounts[id]) return null;
    this.tick();
    return this.meOf(this.db.accounts[id]);
  }

  private createAccount(name: string, email: string, password: string): Account {
    const now = this.nowIso();
    const userId = this.id();
    const acct: Account = {
      user: { id: userId, name, email, emailVerifiedAt: null, plan: 'FREE', createdAt: now },
      passwordHash: weakHash(password),
      profile: {
        businessName: name,
        logoUri: null,
        phone: null,
        email,
        location: null,
        kraPin: null,
        invoicePrefix: 'INV-',
        nextInvoiceNo: 1,
        paymentTermsDays: 14,
        defaultNotes: 'Thank you for your business.',
        defaultTerms: 'Payment due within 14 days.',
        footerText: '',
        vatEnabled: false,
        profileCompletedAt: null,
        invoicesSentEver: 0,
      },
      mpesa: {
        shortcodeType: null,
        shortcode: null,
        accountNumber: null,
        hasConsumerKey: false,
        hasConsumerSecret: false,
        hasPasskey: false,
        status: 'DISCONNECTED',
        lastVerifiedAt: null,
        wizardStep: 1,
      },
      secrets: { consumerKey: null, consumerSecret: null, passkey: null },
      clients: [],
      invoices: [],
      attempts: [],
      payments: [],
      receipts: [],
      reminders: [],
      // Seeded in the same "transaction" as the user — no half-configured account.
      reminderRules: DEFAULT_RULES.map((offsetDays) => ({ offsetDays, enabled: true })),
      notifications: [],
      notificationPrefs: {
        invoiceViewedEmail: true,
        invoiceViewedInApp: true,
        paymentReceivedEmail: true,
        paymentReceivedInApp: true,
        paymentFailedEmail: false,
        paymentFailedInApp: true,
        weeklySummaryEmail: true,
      },
      audit: [],
      usage: { [periodKeyEat(this.env.now())]: 0 },
      subscription: { plan: 'FREE', status: 'ACTIVE', currentPeriodEnd: null, cancelAtPeriodEnd: false },
      charges: [],
      nextReceiptNo: 1,
      dismissedBanners: [],
      verificationResends: 0,
    };
    this.db.accounts[userId] = acct;
    this.db.emailIndex[email] = userId;
    return acct;
  }

  async signup(input: { name: string; email: string; password: string }) {
    await this.ready();
    await this.delay();
    const email = input.email.trim().toLowerCase();
    const errors: Record<string, string> = {};
    if (!input.name.trim()) errors.name = 'Enter your name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter an email address like name@example.com';
    if (input.password.length < 8) errors.password = 'Use at least 8 characters';
    if (Object.keys(errors).length) throw new ApiError('VALIDATION', 'Check the highlighted fields.', errors);
    if (this.db.emailIndex[email]) throw new ApiError('EMAIL_TAKEN', 'That email is already registered.');
    const a = this.createAccount(input.name.trim(), email, input.password);
    this.db.sessionUserId = a.user.id;
    await this.commit();
  }

  async login(input: { email: string; password: string; keepSignedIn: boolean }) {
    await this.ready();
    await this.delay();
    const email = input.email.trim().toLowerCase();
    const now = this.env.now().getTime();
    const window = 15 * 60 * 1000;
    const fails = (this.db.loginFailures[email] ?? []).filter((t) => now - new Date(t).getTime() < window);
    if (fails.length >= 5) {
      const unlockAt = new Date(new Date(fails[0]).getTime() + window).toISOString();
      throw new ApiError('LOCKED', 'Too many attempts.', null, { unlockAt });
    }
    const userId = this.db.emailIndex[email];
    const a = userId ? this.db.accounts[userId] : null;
    if (!a || a.passwordHash !== weakHash(input.password)) {
      fails.push(this.nowIso());
      this.db.loginFailures[email] = fails;
      await this.persist();
      if (fails.length >= 5) {
        const unlockAt = new Date(new Date(fails[0]).getTime() + window).toISOString();
        throw new ApiError('LOCKED', 'Too many attempts.', null, { unlockAt });
      }
      throw new ApiError('INVALID_CREDENTIALS', 'Email or password is incorrect');
    }
    delete this.db.loginFailures[email];
    this.db.sessionUserId = a.user.id;
    await this.commit();
    return this.meOf(a);
  }

  async logout() {
    await this.ready();
    this.db.sessionUserId = null;
    await this.commit();
  }

  async me() {
    await this.ready();
    this.tick();
    return this.meOf(this.acct());
  }

  async resendVerification() {
    await this.ready();
    await this.delay();
    const a = this.acct();
    a.verificationResends += 1;
    await this.persist();
  }

  async verifyEmail(_token: string) {
    await this.ready();
    const a = this.acct();
    if (a.user.emailVerifiedAt) return 'ALREADY' as const;
    a.user.emailVerifiedAt = this.nowIso();
    await this.commit();
    return 'VERIFIED' as const;
  }

  async simulateVerificationLink() {
    await this.verifyEmail('demo');
  }

  private resetTokens = new Map<string, { email: string; expiresAt: number }>();
  private lastReset: string | null = null;

  async forgotPassword(email: string) {
    await this.ready();
    await this.delay();
    // Same response whether or not the account exists; a token is only minted for a real one.
    const e = email.trim().toLowerCase();
    if (this.db.emailIndex[e]) {
      const t = this.token();
      this.resetTokens.set(t, { email: e, expiresAt: this.env.now().getTime() + 24 * 3600 * 1000 });
      this.lastReset = t;
    }
  }

  lastResetToken() {
    return this.lastReset;
  }

  async resetPassword(token: string, password: string) {
    await this.ready();
    await this.delay();
    const r = this.resetTokens.get(token);
    if (!r || r.expiresAt < this.env.now().getTime()) throw new ApiError('TOKEN_EXPIRED', 'This reset link has expired.');
    if (password.length < 8) throw new ApiError('VALIDATION', 'Check the highlighted fields.', { password: 'Use at least 8 characters' });
    const a = this.db.accounts[this.db.emailIndex[r.email]];
    a.passwordHash = weakHash(password);
    this.resetTokens.delete(token);
    delete this.db.loginFailures[r.email];
    this.db.sessionUserId = a.user.id;
    await this.commit();
    return this.meOf(a);
  }

  async changePassword(current: string, next: string) {
    await this.ready();
    await this.delay();
    const a = this.acct();
    if (a.passwordHash !== weakHash(current)) throw new ApiError('VALIDATION', 'Check the highlighted fields.', { current: 'That isn’t your current password' });
    if (next.length < 8) throw new ApiError('VALIDATION', 'Check the highlighted fields.', { next: 'Use at least 8 characters' });
    a.passwordHash = weakHash(next);
    await this.commit();
  }

  async updateAccount(input: { name: string }) {
    await this.ready();
    const a = this.acct();
    a.user.name = input.name.trim() || a.user.name;
    await this.commit();
  }

  async deleteAccount(confirmBusinessName: string) {
    await this.ready();
    const a = this.acct();
    if (confirmBusinessName.trim() !== a.profile.businessName) {
      throw new ApiError('VALIDATION', 'Type your business name exactly to confirm.', { confirm: 'Type your business name exactly to confirm' });
    }
    delete this.db.emailIndex[a.user.email];
    delete this.db.accounts[a.user.id];
    this.db.sessionUserId = null;
    await this.commit();
  }

  // -------------------------------------------------------------------------
  // Profile & settings

  async updateProfile(patch: Partial<BusinessProfile>) {
    await this.ready();
    await this.delay();
    const a = this.acct();
    const errors: Record<string, string> = {};
    if (patch.businessName !== undefined && !patch.businessName.trim()) errors.businessName = 'Enter your business name';
    if (patch.kraPin && !/^[AP]\d{9}[A-Z]$/i.test(patch.kraPin.trim())) errors.kraPin = 'A KRA PIN looks like A000000000X';
    if (patch.phone) {
      const p = normalisePhone(patch.phone);
      if (!p.ok) errors.phone = p.error;
      else patch.phone = p.value;
    }
    if (patch.paymentTermsDays !== undefined && (patch.paymentTermsDays < 0 || patch.paymentTermsDays > 365)) errors.paymentTermsDays = 'Enter between 0 and 365 days';
    if (patch.nextInvoiceNo !== undefined && patch.nextInvoiceNo < 1) errors.nextInvoiceNo = 'Enter a number of 1 or more';
    if (Object.keys(errors).length) throw new ApiError('VALIDATION', 'Check the highlighted fields.', errors);
    if (patch.kraPin) patch.kraPin = patch.kraPin.trim().toUpperCase();
    // Next number can only move forward — gapless numbering must never reuse a number.
    if (patch.nextInvoiceNo !== undefined && patch.nextInvoiceNo < a.profile.nextInvoiceNo && a.invoices.length > 0) {
      throw new ApiError('VALIDATION', 'Check the highlighted fields.', { nextInvoiceNo: `Must be ${a.profile.nextInvoiceNo} or higher` });
    }
    a.profile = { ...a.profile, ...patch };
    await this.commit();
    return { ...a.profile };
  }

  async getReminderRules() {
    await this.ready();
    return this.acct().reminderRules.map((r) => ({ ...r }));
  }

  async setReminderRules(rules: ReminderRule[]) {
    await this.ready();
    this.acct().reminderRules = rules.map((r) => ({ ...r }));
    await this.commit();
  }

  async getNotificationPrefs() {
    await this.ready();
    return { ...this.acct().notificationPrefs };
  }

  async setNotificationPrefs(p: NotificationPrefs) {
    await this.ready();
    this.acct().notificationPrefs = { ...p };
    await this.commit();
  }

  // -------------------------------------------------------------------------
  // M-Pesa credentials

  async saveMpesaStep(input: MpesaStepInput) {
    await this.ready();
    await this.delay();
    const a = this.acct();
    const m = a.mpesa;
    if (input.shortcodeType) m.shortcodeType = input.shortcodeType;
    if (input.shortcode !== undefined) {
      if (!/^\d{5,7}$/.test(input.shortcode.trim())) {
        throw new ApiError('VALIDATION', 'Check the highlighted fields.', { shortcode: 'A till or paybill number is 5 to 7 digits' });
      }
      m.shortcode = input.shortcode.trim();
    }
    if (input.accountNumber !== undefined) m.accountNumber = input.accountNumber;
    // Secrets are write-only; the real API encrypts them with AES-256-GCM.
    if (input.consumerKey !== undefined) a.secrets.consumerKey = input.consumerKey;
    if (input.consumerSecret !== undefined) a.secrets.consumerSecret = input.consumerSecret;
    if (input.passkey !== undefined) a.secrets.passkey = input.passkey;
    m.hasConsumerKey = !!a.secrets.consumerKey;
    m.hasConsumerSecret = !!a.secrets.consumerSecret;
    m.hasPasskey = !!a.secrets.passkey;
    if (input.consumerKey !== undefined || input.consumerSecret !== undefined || input.passkey !== undefined) {
      if (m.status === 'ACTIVE' || m.status === 'INVALID' || m.status === 'DISCONNECTED') m.status = 'UNVERIFIED';
    }
    if (input.wizardStep) m.wizardStep = input.wizardStep;
    await this.commit();
    return { ...m };
  }

  /** The OAuth handshake. The simulator rejects keys containing "bad" or trailing whitespace, and fails to connect on "offline". */
  async verifyMpesaKeys() {
    await this.ready();
    await this.delay();
    const a = this.acct();
    const s = a.secrets;
    const all = [s.consumerKey ?? '', s.consumerSecret ?? '', s.passkey ?? ''];
    if (all.some((k) => /offline/i.test(k))) {
      throw new ApiError('MPESA_UNAVAILABLE', 'Couldn’t reach Safaricom. Try again');
    }
    if (all.some((k) => !k || /bad/i.test(k) || k !== k.trim())) {
      a.mpesa.status = 'INVALID';
      await this.commit();
      throw new ApiError('MPESA_KEYS_REJECTED', 'Safaricom rejected these keys. Check for a trailing space, and that the app is live, not sandbox.');
    }
    a.mpesa.status = 'UNVERIFIED';
    a.mpesa.wizardStep = 4;
    await this.commit();
    return { ...a.mpesa };
  }

  async sendTestPayment(phone: string) {
    await this.ready();
    await this.delay();
    const a = this.acct();
    const p = normalisePhone(phone);
    if (!p.ok) throw new ApiError('INVALID_PHONE_NUMBER', p.error);
    const attempt = this.newAttempt(a, null, 'TEST', p.value, 100);
    await this.commit();
    return { attemptId: attempt.id };
  }

  async attemptStatus(attemptId: string): Promise<PaymentStatus> {
    await this.ready();
    const a = this.acct();
    this.tick();
    const at = a.attempts.find((x) => x.id === attemptId);
    if (!at) throw new ApiError('NOT_FOUND', 'Not found');
    return this.statusOf(a, at);
  }

  async disconnectMpesa() {
    await this.ready();
    const a = this.acct();
    a.mpesa = { ...a.mpesa, status: 'DISCONNECTED', hasConsumerKey: false, hasConsumerSecret: false, hasPasskey: false, wizardStep: 1 };
    a.secrets = { consumerKey: null, consumerSecret: null, passkey: null };
    await this.commit();
  }

  async liveUnpaidInvoiceCount() {
    await this.ready();
    return this.acct().invoices.filter((i) => ['SENT', 'VIEWED', 'OVERDUE'].includes(i.status)).length;
  }

  // -------------------------------------------------------------------------
  // Clients

  private outstandingFor(a: Account, clientId: string) {
    return a.invoices
      .filter((i) => i.clientId === clientId && ['SENT', 'VIEWED', 'OVERDUE'].includes(i.status))
      .reduce((s, i) => s + Math.max(0, i.totalCents - i.amountPaidCents), 0);
  }

  async listClients(opts: { q?: string; includeArchived?: boolean } = {}): Promise<ClientRow[]> {
    await this.ready();
    const a = this.acct();
    const q = (opts.q ?? '').trim().toLowerCase();
    return a.clients
      .filter((c) => opts.includeArchived || !c.archivedAt)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.email ?? '').includes(q) || (c.phone ?? '').includes(q.replace(/^0/, '')))
      .map((c) => {
        const invs = a.invoices.filter((i) => i.clientId === c.id);
        const last = invs.map((i) => i.issueDate).sort().pop() ?? null;
        return { client: { ...c }, outstandingCents: this.outstandingFor(a, c.id), invoiceCount: invs.length, lastInvoiceDate: last };
      })
      .sort((x, y) => x.client.name.localeCompare(y.client.name));
  }

  async getClient(id: string) {
    await this.ready();
    const a = this.acct();
    const c = a.clients.find((x) => x.id === id);
    if (!c) throw new ApiError('NOT_FOUND', 'That client doesn’t exist.');
    const invoices = a.invoices
      .filter((i) => i.clientId === id)
      .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
      .map((invoice) => ({ invoice: { ...invoice }, clientName: c.name }));
    return { client: { ...c }, outstandingCents: this.outstandingFor(a, id), invoices };
  }

  private validateClient(a: Account, input: ClientInput, selfId: string | null) {
    const errors: Record<string, string> = {};
    if (!input.name.trim()) errors.name = 'Enter the client’s name';
    const email = input.email?.trim().toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter an email address like name@example.com';
    let phone: string | null = null;
    if (input.phone?.trim()) {
      const p = normalisePhone(input.phone);
      if (!p.ok) errors.phone = p.error;
      else phone = p.value;
    }
    if (Object.keys(errors).length) throw new ApiError('VALIDATION', 'Check the highlighted fields.', errors);
    if (email) {
      const dup = a.clients.find((c) => c.id !== selfId && c.email === email);
      if (dup) throw new ApiError('CLIENT_EMAIL_TAKEN', 'You already have a client with this email', { email: 'You already have a client with this email' }, { existingId: dup.id, existingName: dup.name });
    }
    return { email, phone };
  }

  async createClient(input: ClientInput) {
    await this.ready();
    await this.delay();
    const a = this.acct();
    const { email, phone } = this.validateClient(a, input, null);
    const now = this.nowIso();
    const c: Client = {
      id: this.id(),
      name: input.name.trim(),
      email,
      phone,
      company: input.company ?? null,
      notes: input.notes?.trim() || null,
      remindersEnabled: input.remindersEnabled ?? true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    a.clients.push(c);
    await this.commit();
    return { ...c };
  }

  async updateClient(id: string, input: ClientInput) {
    await this.ready();
    await this.delay();
    const a = this.acct();
    const c = a.clients.find((x) => x.id === id);
    if (!c) throw new ApiError('NOT_FOUND', 'That client doesn’t exist.');
    const { email, phone } = this.validateClient(a, input, id);
    Object.assign(c, {
      name: input.name.trim(),
      email,
      phone,
      notes: input.notes?.trim() || null,
      remindersEnabled: input.remindersEnabled ?? c.remindersEnabled,
      updatedAt: this.nowIso(),
    });
    await this.commit();
    return { ...c };
  }

  async deleteClient(id: string) {
    await this.ready();
    const a = this.acct();
    const count = a.invoices.filter((i) => i.clientId === id).length;
    if (count > 0) {
      throw new ApiError('CLIENT_HAS_INVOICES', `This client has ${count} invoice${count === 1 ? '' : 's'}. Archive them instead.`, null, { count });
    }
    a.clients = a.clients.filter((c) => c.id !== id);
    await this.commit();
  }

  async archiveClient(id: string) {
    await this.ready();
    const a = this.acct();
    const c = a.clients.find((x) => x.id === id);
    if (!c) throw new ApiError('NOT_FOUND', 'That client doesn’t exist.');
    c.archivedAt = this.nowIso();
    await this.commit();
  }

  // -------------------------------------------------------------------------
  // Invoices

  async previewNextNumber() {
    await this.ready();
    const p = this.acct().profile;
    return `${p.invoicePrefix}${String(p.nextInvoiceNo).padStart(4, '0')}`;
  }

  private matchesFilter(i: Invoice, filter: InvoiceListQuery['filter']) {
    switch (filter) {
      case 'DRAFT':
        return i.status === 'DRAFT';
      case 'SENT':
        return i.status === 'SENT' || i.status === 'VIEWED';
      case 'OVERDUE':
        return i.status === 'OVERDUE';
      case 'PAID':
        return i.status === 'PAID';
      default:
        return true;
    }
  }

  async listInvoices(q: InvoiceListQuery): Promise<InvoiceListRow[]> {
    await this.ready();
    this.tick();
    const a = this.acct();
    const term = (q.q ?? '').trim().toLowerCase();
    return a.invoices
      .filter((i) => this.matchesFilter(i, q.filter))
      .filter((i) => !q.clientId || i.clientId === q.clientId)
      .filter((i) => !q.from || i.issueDate >= q.from)
      .filter((i) => !q.to || i.issueDate <= q.to)
      .map((invoice) => ({ invoice: { ...invoice }, clientName: this.clientName(a, invoice.clientId) }))
      .filter((r) => {
        if (!term) return true;
        const digits = term.replace(/[^\d]/g, '');
        return (
          r.invoice.number.toLowerCase().includes(term) ||
          r.clientName.toLowerCase().includes(term) ||
          (digits.length > 0 && String(Math.floor(r.invoice.totalCents / 100)).includes(digits))
        );
      })
      .sort((x, y) => (y.invoice.issueDate + y.invoice.createdAt).localeCompare(x.invoice.issueDate + x.invoice.createdAt));
  }

  async getInvoice(id: string): Promise<InvoiceDetail> {
    await this.ready();
    this.tick();
    const a = this.acct();
    const invoice = this.findInvoice(a, id);
    const payments = a.payments.filter((p) => p.invoiceId === id);
    const pending = a.attempts.find((x) => x.invoiceId === id && x.status === 'PENDING') ?? null;
    let banner: InvoiceDetail['banner'] = null;
    const bannerKey = `invoice:${id}`;
    if (!a.dismissedBanners.includes(bannerKey)) {
      const stk = payments.filter((p) => p.source !== 'MANUAL');
      if (invoice.status === 'VOID' && payments.length > 0) {
        banner = { kind: 'voided_invoice_paid', text: 'Payment received on a voided invoice. The money is in your account — sort it out with the client directly.' };
      } else if (payments.length > 1 && invoice.amountPaidCents > invoice.totalCents) {
        const second = stk[stk.length - 1] ?? payments[payments.length - 1];
        banner = {
          kind: 'double_payment',
          text: `This invoice was paid twice. ${formatKesShort(second.amountCents)}${second.payerPhone ? ` from ${displayPhone(second.payerPhone)}` : ''} needs refunding.${second.mpesaReceiptNumber ? ` Receipt ${second.mpesaReceiptNumber}.` : ''}`,
        };
      } else if (invoice.needsReview) {
        banner = { kind: 'underpayment', text: invoice.needsReview };
      }
    }
    return {
      invoice: { ...invoice },
      client: a.clients.find((c) => c.id === invoice.clientId) ?? null,
      payments: payments.map((p) => ({ ...p })),
      receipts: a.receipts.filter((r) => payments.some((p) => p.id === r.paymentId)).map((r) => ({ ...r })),
      attempts: a.attempts.filter((x) => x.invoiceId === id).map(({ sim: _sim, ...x }) => x),
      timeline: a.audit.filter((e) => e.invoiceId === id).sort((x, y) => y.createdAt.localeCompare(x.createdAt)),
      reminders: a.reminders.filter((r) => r.invoiceId === id).sort((x, y) => x.scheduledFor.localeCompare(y.scheduledFor)),
      pendingAttempt: pending ? (({ sim: _s, ...x }) => x)(pending) : null,
      banner,
    };
  }

  private applyInput(a: Account, inv: Invoice, input: InvoiceInput) {
    const lines = input.lineItems.map((l, idx) => ({
      id: this.id(),
      position: idx,
      description: l.description,
      quantityMilli: l.quantityMilli,
      unitPriceCents: l.unitPriceCents,
      lineTotalCents: 0,
    }));
    const vat = input.vat && !!a.profile.kraPin;
    const t = computeTotals(lines, input.discountMode, input.discountInput, vat ? VAT_BP : 0);
    lines.forEach((l, i) => (l.lineTotalCents = t.lineTotals[i]));
    if (!totalsReconcile(t)) throw new Error('Totals do not reconcile'); // the DB check constraint
    Object.assign(inv, {
      clientId: input.clientId ?? '',
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      lineItems: lines,
      subtotalCents: t.subtotalCents,
      discountMode: input.discountMode,
      discountInput: input.discountInput,
      discountCents: t.discountCents,
      taxRateBp: vat ? VAT_BP : 0,
      taxCents: t.taxCents,
      totalCents: t.totalCents,
      notes: input.notes,
      terms: input.terms,
      remindersEnabled: input.remindersEnabled,
      updatedAt: this.nowIso(),
    });
  }

  async createDraft(input: InvoiceInput) {
    await this.ready();
    await this.delay();
    const a = this.acct();
    const now = this.nowIso();
    // Gapless numbering: the number is taken and the counter incremented in the
    // same step as the insert (SELECT … FOR UPDATE on the profile row in the real API).
    const number = `${a.profile.invoicePrefix}${String(a.profile.nextInvoiceNo).padStart(4, '0')}`;
    const inv: Invoice = {
      id: this.id(),
      clientId: '',
      number,
      status: 'DRAFT',
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      currency: 'KES',
      lineItems: [],
      subtotalCents: 0,
      discountMode: 'AMOUNT',
      discountInput: 0,
      discountCents: 0,
      taxRateBp: 0,
      taxCents: 0,
      totalCents: 0,
      amountPaidCents: 0,
      notes: '',
      terms: '',
      publicToken: this.token(),
      tokenRevokedAt: null,
      remindersEnabled: true,
      sentAt: null,
      firstViewedAt: null,
      lastViewedAt: null,
      paidAt: null,
      voidedAt: null,
      lastReminderAt: null,
      queuedForSend: false,
      needsReview: null,
      createdAt: now,
      updatedAt: now,
    };
    this.applyInput(a, inv, input);
    a.profile.nextInvoiceNo += 1;
    a.invoices.push(inv);
    this.audit(a, inv.id, 'invoice.created', 'Draft created');
    await this.commit();
    return { ...inv };
  }

  private assertEditable(a: Account, inv: Invoice) {
    if (a.attempts.some((x) => x.invoiceId === inv.id && x.status === 'PENDING')) {
      throw new ApiError('INVOICE_NOT_EDITABLE', 'A payment is in progress. You can edit once it finishes.');
    }
    if (inv.status === 'PAID' || inv.status === 'VOID' || a.payments.some((p) => p.invoiceId === inv.id)) {
      throw new ApiError('INVOICE_NOT_EDITABLE', 'This invoice can’t be edited any more.');
    }
  }

  async updateInvoice(id: string, input: InvoiceInput) {
    await this.ready();
    await this.delay();
    const a = this.acct();
    const inv = this.findInvoice(a, id);
    this.assertEditable(a, inv);
    this.applyInput(a, inv, input);
    await this.commit();
    return { ...inv };
  }

  async deleteDraft(id: string) {
    await this.ready();
    const a = this.acct();
    const inv = this.findInvoice(a, id);
    if (inv.status !== 'DRAFT') throw new ApiError('INVOICE_NOT_EDITABLE', 'Only drafts can be deleted. Void it instead.');
    a.invoices = a.invoices.filter((i) => i.id !== id);
    a.audit = a.audit.filter((e) => e.invoiceId !== id);
    await this.commit();
  }

  private validateForSend(a: Account, inv: Invoice) {
    const errors: Record<string, string> = {};
    const client = a.clients.find((c) => c.id === inv.clientId);
    if (!client) errors.client = 'Choose who this invoice is for';
    else if (!client.email) errors.clientEmail = 'Add an email so we can send the invoice';
    if (inv.lineItems.length === 0) errors.lineItems = 'Add at least one item';
    inv.lineItems.forEach((l, i) => {
      if (!l.description.trim()) errors[`line.${i}.description`] = 'Describe this item';
      if (l.unitPriceCents <= 0) errors[`line.${i}.price`] = 'Enter a price';
    });
    if (inv.dueDate < inv.issueDate) errors.dueDate = 'Due date can’t be before the issue date';
    if (inv.totalCents <= 0) errors.total = 'The total must be more than KES 0.00';
    if (Object.keys(errors).length) throw new ApiError('VALIDATION', 'Check the highlighted fields.', errors);
    return client!;
  }

  private materialiseReminders(a: Account, inv: Invoice) {
    a.reminders = a.reminders.filter((r) => !(r.invoiceId === inv.id && r.status === 'SCHEDULED'));
    const client = a.clients.find((c) => c.id === inv.clientId);
    if (!inv.remindersEnabled || client?.remindersEnabled === false) return;
    for (const rule of a.reminderRules.filter((r) => r.enabled)) {
      const date = addDays(inv.dueDate, rule.offsetDays);
      const at = shiftIntoSendWindow(eatDateHourToIso(date, 9));
      if (new Date(at).getTime() < this.env.now().getTime()) continue;
      a.reminders.push({ id: this.id(), invoiceId: inv.id, offsetDays: rule.offsetDays, scheduledFor: at, status: 'SCHEDULED', skipReason: null, sentAt: null });
    }
  }

  async sendInvoice(id: string, opts: { message: string; sendCopy: boolean }) {
    await this.ready();
    await this.delay();
    const a = this.acct();
    const inv = this.findInvoice(a, id);
    if (inv.status === 'PAID' || inv.status === 'VOID') throw new ApiError('INVOICE_NOT_EDITABLE', 'This invoice can’t be sent again.');
    const client = this.validateForSend(a, inv);
    const resend = inv.status !== 'DRAFT';
    if (!resend) {
      if (a.mpesa.status !== 'ACTIVE') {
        throw new ApiError('MPESA_NOT_CONNECTED', 'Connect M-Pesa to send this invoice — your client needs a way to pay');
      }
      const usage = this.usage(a);
      if (usage.limit !== null && usage.invoicesSent >= usage.limit) {
        throw new ApiError('PLAN_LIMIT_REACHED', `You’ve sent ${usage.limit} invoices this month.`, null, { usage });
      }
      // Counter is incremented in the same transaction as the send; never count rows.
      a.usage[usage.period] = usage.invoicesSent + 1;
      inv.status = 'SENT';
      inv.sentAt = this.nowIso();
      inv.queuedForSend = false;
      a.profile.invoicesSentEver += 1;
      this.materialiseReminders(a, inv);
      this.audit(a, inv.id, 'invoice.sent', `Sent to ${client.email}${opts.sendCopy ? ' · copy to you' : ''}`);
    } else {
      this.materialiseReminders(a, inv);
      this.audit(a, inv.id, 'invoice.resent', `Changes emailed to ${client.email}`);
    }
    inv.updatedAt = this.nowIso();
    this.tick();
    await this.commit();
    return { ...inv };
  }

  async queueForSend(id: string) {
    await this.ready();
    const a = this.acct();
    const inv = this.findInvoice(a, id);
    inv.queuedForSend = true;
    this.audit(a, inv.id, 'invoice.queued', 'Saved to send automatically when your plan allows');
    await this.commit();
  }

  private remindedToday(inv: Invoice) {
    return !!inv.lastReminderAt && eatDate(inv.lastReminderAt) === todayEat(this.env.now());
  }

  private remindedWithin24h(inv: Invoice) {
    return !!inv.lastReminderAt && this.env.now().getTime() - new Date(inv.lastReminderAt).getTime() < 24 * 3600 * 1000;
  }

  async remind(id: string) {
    await this.ready();
    await this.delay();
    const a = this.acct();
    const inv = this.findInvoice(a, id);
    if (!['SENT', 'VIEWED', 'OVERDUE'].includes(inv.status)) throw new ApiError('INVOICE_NOT_PAYABLE', 'Only unpaid, sent invoices can be reminded.');
    if (this.remindedWithin24h(inv)) throw new ApiError('REMINDED_TODAY', 'Already reminded in the last 24 hours.');
    const now = this.nowIso();
    inv.lastReminderAt = now;
    a.reminders.push({ id: this.id(), invoiceId: id, offsetDays: null, scheduledFor: now, status: 'SENT', skipReason: null, sentAt: now });
    this.audit(a, id, 'reminder.sent', 'Reminder sent by you');
    await this.commit();
  }

  async bulkRemind(ids: string[]) {
    await this.ready();
    const a = this.acct();
    let sent = 0;
    let skipped = 0;
    for (const id of ids) {
      const inv = a.invoices.find((i) => i.id === id);
      if (!inv || !['SENT', 'VIEWED', 'OVERDUE'].includes(inv.status) || this.remindedWithin24h(inv)) {
        skipped++;
        continue;
      }
      const now = this.nowIso();
      inv.lastReminderAt = now;
      a.reminders.push({ id: this.id(), invoiceId: id, offsetDays: null, scheduledFor: now, status: 'SENT', skipReason: null, sentAt: now });
      this.audit(a, id, 'reminder.sent', 'Reminder sent by you');
      sent++;
    }
    await this.commit();
    return { sent, skipped };
  }

  private cancelReminders(a: Account, invoiceId: string, reason: string) {
    for (const r of a.reminders) {
      if (r.invoiceId === invoiceId && r.status === 'SCHEDULED') {
        r.status = 'CANCELLED';
        r.skipReason = reason;
      }
    }
  }

  async markPaidManually(id: string, input: { method: string; date: string; reference: string; note: string }) {
    await this.ready();
    await this.delay();
    const a = this.acct();
    const inv = this.findInvoice(a, id);
    if (!['SENT', 'VIEWED', 'OVERDUE'].includes(inv.status)) throw new ApiError('INVOICE_NOT_PAYABLE', 'Only sent, unpaid invoices can be marked as paid.');
    if (a.attempts.some((x) => x.invoiceId === id && x.status === 'PENDING')) throw new ApiError('ATTEMPT_IN_PROGRESS', 'A payment is in progress. Wait for it to finish.');
    const paidAt = eatDateHourToIso(input.date, 12);
    const remaining = inv.totalCents - inv.amountPaidCents;
    a.payments.push({
      id: this.id(),
      invoiceId: id,
      attemptId: null,
      mpesaReceiptNumber: null,
      amountCents: remaining,
      payerPhone: null,
      paidAt,
      source: 'MANUAL',
      manualMethod: input.method,
      manualReference: input.reference || null,
      note: input.note || null,
      recordedAt: this.nowIso(),
    });
    this.recomputePaid(a, inv);
    inv.status = 'PAID';
    inv.paidAt = paidAt;
    this.cancelReminders(a, id, 'marked as paid');
    this.audit(a, id, 'payment.manual', `Marked as paid manually · ${input.method}${input.reference ? ` · ${input.reference}` : ''}`);
    await this.commit();
  }

  async voidInvoice(id: string, notifyClient: boolean) {
    await this.ready();
    await this.delay();
    const a = this.acct();
    const inv = this.findInvoice(a, id);
    if (inv.status === 'PAID' || inv.status === 'VOID') throw new ApiError('INVOICE_NOT_PAYABLE', 'This invoice can’t be voided.');
    inv.status = 'VOID';
    inv.voidedAt = this.nowIso();
    inv.tokenRevokedAt = this.nowIso();
    this.cancelReminders(a, id, 'invoice voided');
    this.audit(a, id, 'invoice.voided', `Voided${notifyClient ? ' · client told' : ''}. The link no longer works.`);
    await this.commit();
  }

  async duplicateInvoice(id: string) {
    await this.ready();
    const a = this.acct();
    const src = this.findInvoice(a, id);
    const today = todayEat(this.env.now());
    return this.createDraft({
      clientId: src.clientId,
      issueDate: today,
      dueDate: addDays(today, a.profile.paymentTermsDays),
      lineItems: src.lineItems.map((l) => ({ description: l.description, quantityMilli: l.quantityMilli, unitPriceCents: l.unitPriceCents })),
      discountMode: src.discountMode,
      discountInput: src.discountInput,
      vat: src.taxRateBp > 0,
      notes: src.notes,
      terms: src.terms,
      remindersEnabled: src.remindersEnabled,
    });
  }

  async dismissInvoiceBanner(id: string, note: string) {
    await this.ready();
    const a = this.acct();
    const inv = this.findInvoice(a, id);
    a.dismissedBanners.push(`invoice:${id}`);
    inv.needsReview = null;
    this.audit(a, id, 'banner.dismissed', note ? `Resolved: ${note}` : 'Marked as resolved');
    await this.commit();
  }

  publicLink(invoice: Invoice) {
    return `${this.env.publicBaseUrl}/i/${invoice.publicToken}`;
  }

  // -------------------------------------------------------------------------
  // Dashboard

  async summary(): Promise<DashboardSummary> {
    await this.ready();
    this.tick();
    const a = this.acct();
    const period = periodKeyEat(this.env.now());
    const paidThisMonth = a.payments.filter((p) => periodKeyEat(new Date(p.paidAt)) === period);
    const open = a.invoices.filter((i) => ['SENT', 'VIEWED', 'OVERDUE'].includes(i.status));
    const overdue = open.filter((i) => i.status === 'OVERDUE');
    const today = todayEat(this.env.now());
    return {
      paidThisMonthCents: paidThisMonth.reduce((s, p) => s + p.amountCents, 0),
      paidThisMonthCount: new Set(paidThisMonth.map((p) => p.invoiceId)).size,
      outstandingCents: open.reduce((s, i) => s + Math.max(0, i.totalCents - i.amountPaidCents), 0),
      outstandingCount: open.length,
      overdueCents: overdue.reduce((s, i) => s + Math.max(0, i.totalCents - i.amountPaidCents), 0),
      overdueCount: overdue.length,
      oldestOverdueDays: overdue.reduce((m, i) => Math.max(m, daysBetween(i.dueDate, today)), 0),
      draftCount: a.invoices.filter((i) => i.status === 'DRAFT').length,
      hasAnyInvoice: a.invoices.length > 0,
    };
  }

  async needsAttention() {
    await this.ready();
    const a = this.acct();
    const today = todayEat(this.env.now());
    const overdue = a.invoices.filter((i) => i.status === 'OVERDUE').sort((x, y) => x.dueDate.localeCompare(y.dueDate));
    const stale = a.invoices
      .filter((i) => (i.status === 'SENT' || i.status === 'VIEWED') && i.sentAt && daysBetween(eatDate(i.sentAt), today) > 7)
      .sort((x, y) => (x.sentAt ?? '').localeCompare(y.sentAt ?? ''));
    return [...overdue, ...stale].slice(0, 6).map((invoice) => ({ invoice: { ...invoice }, clientName: this.clientName(a, invoice.clientId) }));
  }

  private paymentRows(a: Account, list: Payment[]): PaymentRow[] {
    return list.map((p) => {
      const inv = a.invoices.find((i) => i.id === p.invoiceId);
      return { payment: { ...p }, invoiceNumber: inv?.number ?? '—', clientName: inv ? this.clientName(a, inv.clientId) : '—' };
    });
  }

  async recentPayments() {
    await this.ready();
    const a = this.acct();
    return this.paymentRows(a, [...a.payments].sort((x, y) => y.paidAt.localeCompare(x.paidAt)).slice(0, 5));
  }

  async banners(): Promise<Banner[]> {
    await this.ready();
    const a = this.acct();
    const out: Banner[] = [];
    if (a.mpesa.status === 'INVALID') {
      out.push({ kind: 'MPESA_INVALID', title: 'M-Pesa isn’t accepting your keys.', body: 'Your clients can’t pay right now.', action: 'Fix M-Pesa', dismissible: false });
    } else if (a.mpesa.status !== 'ACTIVE') {
      out.push({ kind: 'MPESA_NOT_CONNECTED', title: 'You can’t get paid yet.', body: 'Connect M-Pesa so your clients have a way to pay.', action: 'Connect now', dismissible: false });
    }
    if (!a.user.emailVerifiedAt) {
      out.push({ kind: 'EMAIL_UNVERIFIED', title: 'Confirm your email.', body: `We sent a link to ${a.user.email}.`, action: 'Resend link', dismissible: true });
    }
    for (const inv of a.invoices) {
      if (a.dismissedBanners.includes(`invoice:${inv.id}`)) continue;
      const pays = a.payments.filter((p) => p.invoiceId === inv.id);
      if ((inv.status === 'VOID' && pays.length) || pays.length > 1 || inv.needsReview) {
        out.push({ kind: 'PAYMENT_ATTENTION', title: 'A payment needs your attention.', body: `${inv.number} · ${this.clientName(a, inv.clientId)}`, action: 'Review', dismissible: false, invoiceId: inv.id });
        break;
      }
    }
    if (a.subscription.status === 'PAST_DUE') {
      out.push({ kind: 'PAST_DUE', title: 'We couldn’t collect your subscription.', body: 'Everything keeps working for now.', action: 'Retry payment', dismissible: false });
    }
    const u = this.usage(a);
    if (u.limit !== null && u.limit - u.invoicesSent === 1) {
      out.push({ kind: 'PLAN_NEAR_LIMIT', title: '1 invoice left this month.', body: `Upgrade to Pro for unlimited invoices — ${formatKesShort(PRO_PRICE_CENTS)} a month.`, action: 'See plans', dismissible: true });
    }
    if (!a.profile.phone) {
      out.push({ kind: 'PROFILE_INCOMPLETE', title: 'Finish your business profile.', body: 'Add a phone number so clients can reach you.', action: 'Finish profile', dismissible: true });
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Payments list

  async listPayments(range: { from?: string | null; to?: string | null } = {}) {
    await this.ready();
    const a = this.acct();
    const list = a.payments
      .filter((p) => !range.from || eatDate(p.paidAt) >= range.from)
      .filter((p) => !range.to || eatDate(p.paidAt) <= range.to)
      .sort((x, y) => y.paidAt.localeCompare(x.paidAt));
    return this.paymentRows(a, list);
  }

  // -------------------------------------------------------------------------
  // Notifications

  async listNotifications() {
    await this.ready();
    return this.acct().notifications.map((n) => ({ ...n }));
  }

  async unreadCount() {
    await this.ready();
    return this.acct().notifications.filter((n) => !n.readAt).length;
  }

  async markNotificationsRead() {
    await this.ready();
    const now = this.nowIso();
    this.acct().notifications.forEach((n) => (n.readAt = n.readAt ?? now));
    await this.commit();
  }

  // -------------------------------------------------------------------------
  // Billing

  async billing() {
    await this.ready();
    this.tick();
    const a = this.acct();
    return { subscription: { ...a.subscription }, usage: this.usage(a), charges: a.charges.map((c) => ({ ...c })) };
  }

  async startUpgrade(plan: Plan, phone: string) {
    await this.ready();
    await this.delay();
    const a = this.acct();
    if (plan !== 'PRO') throw new ApiError('VALIDATION', 'That plan isn’t available yet.');
    const p = normalisePhone(phone);
    if (!p.ok) throw new ApiError('INVALID_PHONE_NUMBER', p.error);
    const attempt = this.newAttempt(a, null, 'SUBSCRIPTION', p.value, PRO_PRICE_CENTS);
    await this.commit();
    return { attemptId: attempt.id };
  }

  async cancelSubscription() {
    await this.ready();
    const a = this.acct();
    a.subscription.cancelAtPeriodEnd = true;
    a.subscription.status = 'CANCELLED';
    await this.commit();
  }

  // -------------------------------------------------------------------------
  // Public pay path — keyed by token, no session.

  private byToken(token: string): { a: Account; inv: Invoice } | null {
    for (const a of Object.values(this.db.accounts)) {
      const inv = a.invoices.find((i) => i.publicToken === token);
      if (inv) return { a, inv };
    }
    return null;
  }

  async getPublicInvoice(token: string): Promise<PublicInvoiceResult> {
    await this.ready();
    await this.delay();
    this.tick();
    const hit = this.byToken(token);
    // Unknown, draft, revoked and voided look identical: P-7, never an amount.
    if (!hit || hit.inv.status === 'DRAFT' || hit.inv.tokenRevokedAt) {
      return {
        kind: 'invalid',
        businessName: hit?.a.profile.businessName ?? null,
        contactEmail: hit?.a.profile.email ?? null,
        contactPhone: hit?.a.profile.phone ? displayPhone(hit.a.profile.phone) : null,
      };
    }
    const { a, inv } = hit;
    const now = this.env.now();
    // First load marks Viewed; loads within an hour write nothing.
    if (!inv.lastViewedAt || now.getTime() - new Date(inv.lastViewedAt).getTime() > 3600 * 1000) {
      const first = !inv.firstViewedAt;
      inv.lastViewedAt = now.toISOString();
      if (first) inv.firstViewedAt = now.toISOString();
      if (inv.status === 'SENT') inv.status = 'VIEWED';
      this.audit(a, inv.id, 'invoice.viewed', first ? 'Viewed by client' : 'Opened again by client');
      if (first && a.notificationPrefs.invoiceViewedInApp) {
        this.notify(a, 'invoice_viewed', `${this.clientName(a, inv.clientId)} opened ${inv.number}`, formatKes(inv.totalCents), inv.id);
      }
      await this.commit();
    }
    const client = a.clients.find((c) => c.id === inv.clientId);
    const payments = a.payments.filter((p) => p.invoiceId === inv.id);
    const settled = payments[0] ?? null;
    const pending = a.attempts.find((x) => x.invoiceId === inv.id && x.status === 'PENDING');
    return {
      kind: 'ok',
      invoice: {
        number: inv.number,
        status: inv.status,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        currency: 'KES',
        subtotalCents: inv.subtotalCents,
        discountCents: inv.discountCents,
        taxRateBp: inv.taxRateBp,
        taxCents: inv.taxCents,
        totalCents: inv.totalCents,
        amountDueCents: Math.max(0, inv.totalCents - inv.amountPaidCents),
        notes: inv.notes,
        terms: inv.terms,
        lineItems: inv.lineItems.map(({ description, quantityMilli, unitPriceCents, lineTotalCents }) => ({ description, quantityMilli, unitPriceCents, lineTotalCents })),
        business: {
          name: a.profile.businessName,
          logoUri: a.profile.logoUri,
          phone: a.profile.phone ? displayPhone(a.profile.phone) : null,
          email: a.profile.email,
          location: a.profile.location,
          kraPin: a.profile.kraPin,
        },
        billedTo: { name: client?.name ?? '', email: null },
        payment: {
          mpesaEnabled: a.mpesa.status === 'ACTIVE',
          suggestedPhone: client?.phone ? displayPhone(client.phone) : null,
        },
        paid:
          inv.status === 'PAID' && settled
            ? { mpesaReceiptNumber: settled.mpesaReceiptNumber, amountCents: settled.amountCents, paidAt: settled.paidAt, payerPhone: settled.payerPhone ? displayPhone(settled.payerPhone) : null, source: settled.source }
            : null,
        inFlight: pending ? { maskedPhone: maskPhone(pending.payerPhone), initiatedAt: pending.initiatedAt } : null,
      },
    };
  }

  async pay(token: string, phone: string, idempotencyKey: string) {
    await this.ready();
    const prior = this.idempotency.get(idempotencyKey);
    if (prior) return { attemptId: prior };
    // Double-tap: a second concurrent request for the same token joins the first.
    const inflight = this.inflightPay.get(token);
    if (inflight) return inflight;
    const p = this.doPay(token, phone).finally(() => this.inflightPay.delete(token));
    this.inflightPay.set(token, p);
    const r = await p;
    this.idempotency.set(idempotencyKey, r.attemptId);
    return r;
  }

  private async doPay(token: string, phone: string) {
    const norm = normalisePhone(phone);
    if (!norm.ok) throw new ApiError('INVALID_PHONE_NUMBER', norm.error);
    await this.delay();
    const hit = this.byToken(token);
    if (!hit || hit.inv.status === 'DRAFT' || hit.inv.tokenRevokedAt) throw new ApiError('NOT_FOUND', 'This invoice link isn’t valid any more');
    const { a, inv } = hit;
    if (inv.status === 'PAID') throw new ApiError('INVOICE_ALREADY_PAID', 'This invoice is already paid');
    if (a.mpesa.status !== 'ACTIVE') throw new ApiError('MPESA_CREDENTIALS_INVALID', 'Payment is temporarily unavailable');
    const now = this.env.now().getTime();
    const existing = a.attempts.find((x) => x.invoiceId === inv.id && x.status === 'PENDING');
    if (existing) {
      if (now - new Date(existing.initiatedAt).getTime() < SWEEP_AFTER_MS) return { attemptId: existing.id };
      // Resolve the stale attempt through the sweeper path before starting another.
      this.sweepOne(a, existing, true);
      if (this.findInvoice(a, inv.id).status === 'PAID') throw new ApiError('INVOICE_ALREADY_PAID', 'This invoice is already paid');
    }
    const recent = a.attempts.filter((x) => x.invoiceId === inv.id && now - new Date(x.initiatedAt).getTime() < STK_WINDOW_MS);
    if (recent.length >= STK_PER_INVOICE_PER_HOUR) {
      const oldest = Math.min(...recent.map((x) => new Date(x.initiatedAt).getTime()));
      throw new ApiError('RATE_LIMITED', 'Too many attempts. Wait a minute and try again', null, { retryAfterSec: Math.ceil((oldest + STK_WINDOW_MS - now) / 1000) });
    }
    const remaining = inv.totalCents - inv.amountPaidCents;
    const attempt = this.newAttempt(a, inv.id, 'INVOICE', norm.value, remaining);
    this.audit(a, inv.id, 'payment.initiated', `Payment started from ${maskPhone(norm.value)} · ${formatKes(toWholeShillings(remaining) * 100)}`);
    await this.commit();
    return { attemptId: attempt.id };
  }

  async paymentStatus(token: string): Promise<PaymentStatus | null> {
    await this.ready();
    this.tick();
    const hit = this.byToken(token);
    if (!hit) return null;
    const { a, inv } = hit;
    const attempts = a.attempts.filter((x) => x.invoiceId === inv.id).sort((x, y) => y.initiatedAt.localeCompare(x.initiatedAt));
    const latest = attempts[0];
    if (!latest) return null;
    return this.statusOf(a, latest);
  }

  private statusOf(a: Account, at: PaymentAttempt): PaymentStatus {
    const inv = at.invoiceId ? a.invoices.find((i) => i.id === at.invoiceId) ?? null : null;
    const pay = a.payments.find((p) => p.attemptId === at.id);
    const charge = at.purpose === 'SUBSCRIPTION' && at.status === 'SUCCESS' ? a.charges.find((c) => c.id === at.id) : null;
    let consecutiveFailures = 0;
    if (inv) {
      const list = a.attempts.filter((x) => x.invoiceId === inv.id).sort((x, y) => y.initiatedAt.localeCompare(x.initiatedAt));
      for (const x of list) {
        if (x.status === 'PENDING') continue;
        if (x.status === 'SUCCESS') break;
        consecutiveFailures++;
      }
    }
    return {
      attemptStatus: at.status,
      invoiceStatus: inv?.status ?? null,
      failureReason: at.failureReason,
      receipt: pay
        ? { mpesaReceiptNumber: pay.mpesaReceiptNumber ?? '', amountCents: pay.amountCents, paidAt: pay.paidAt, payerPhone: pay.payerPhone ? displayPhone(pay.payerPhone) : null }
        : charge
          ? { mpesaReceiptNumber: charge.mpesaReceiptNumber, amountCents: charge.amountCents, paidAt: charge.paidAt, payerPhone: displayPhone(at.payerPhone) }
          : at.purpose === 'TEST' && at.status === 'SUCCESS'
            ? { mpesaReceiptNumber: '', amountCents: at.amountCents, paidAt: at.resolvedAt ?? this.nowIso(), payerPhone: displayPhone(at.payerPhone) }
            : null,
      consecutiveFailures,
    };
  }

  // -------------------------------------------------------------------------
  // Simulated Daraja: STK push, callback, reconciliation sweeper.

  private newAttempt(a: Account, invoiceId: string | null, purpose: PaymentAttempt['purpose'], phone: string, amountCents: number) {
    const sim = this.db.sim.scenario;
    const attempt: PaymentAttempt & { sim?: SimScenario } = {
      id: this.id(),
      invoiceId,
      purpose,
      checkoutRequestId: `ws_CO_${this.hex(8)}`,
      payerPhone: phone,
      amountCents: toWholeShillings(amountCents) * 100, // Daraja takes whole shillings
      status: 'PENDING',
      resultCode: null,
      failureReason: null,
      initiatedAt: this.nowIso(),
      resolvedAt: null,
      pollCount: 0,
      sim,
    };
    a.attempts.push(attempt);
    const userId = a.user.id;
    const delay = Math.max(500, this.db.sim.callbackDelayMs);
    if (sim !== 'LATE_SUCCESS' && sim !== 'NO_RESPONSE') {
      this.env.setTimer(() => this.deliverSimulatedCallback(userId, attempt.id), delay);
      if (sim === 'DUPLICATE_CALLBACK') this.env.setTimer(() => this.deliverSimulatedCallback(userId, attempt.id, true), delay + 800);
    }
    return attempt;
  }

  private simReceipts = new Map<string, string>();

  /** POST /mpesa/callback — in the real API the row is written first and HTTP 200 returned immediately. */
  deliverSimulatedCallback(userId: string, attemptId: string, replay = false) {
    const a = this.db.accounts[userId];
    const at = a?.attempts.find((x) => x.id === attemptId);
    if (!a || !at) return; // unmatched callback: stored, never throws
    const code = SIM_RESULT[at.sim ?? 'SUCCESS'] ?? 0;
    let receipt = this.simReceipts.get(attemptId);
    if (!receipt) {
      receipt = this.receiptCode();
      this.simReceipts.set(attemptId, receipt);
    }
    if (replay) this.env.logger.info(`Replayed callback for ${at.checkoutRequestId}`);
    this.settle(a, at, { resultCode: code, receipt, amountCents: at.amountCents, phone: at.payerPhone, paidAt: this.nowIso() }, 'STK_PUSH');
    void this.commit();
  }

  /**
   * The ONE settlement function. The callback and the sweeper both call it; the
   * unique receipt check makes the loser of any race a logged no-op.
   */
  settle(
    a: Account,
    at: PaymentAttempt,
    result: { resultCode: number; receipt: string | null; amountCents: number; phone: string; paidAt: string },
    source: PaymentSource,
  ): 'SETTLED' | 'DUPLICATE' | 'FAILED' | 'IGNORED' {
    const mapped = mapResultCode(result.resultCode, this.env.logger);
    if (mapped.status === 'SUCCESS') {
      if (result.receipt && a.payments.some((p) => p.mpesaReceiptNumber === result.receipt)) {
        this.env.logger.info(`Duplicate receipt ${result.receipt} ignored`);
        return 'DUPLICATE';
      }
      if (result.receipt && a.charges.some((c) => c.mpesaReceiptNumber === result.receipt)) return 'DUPLICATE';
      if (at.status !== 'PENDING') return 'IGNORED'; // terminal states never transition
      at.status = 'SUCCESS';
      at.resultCode = result.resultCode;
      at.resolvedAt = this.nowIso();
      if (at.purpose === 'TEST') {
        a.mpesa.status = 'ACTIVE';
        a.mpesa.lastVerifiedAt = this.nowIso();
        return 'SETTLED';
      }
      if (at.purpose === 'SUBSCRIPTION') {
        this.applySubscriptionPayment(a, at, result.receipt ?? this.receiptCode());
        return 'SETTLED';
      }
      const inv = a.invoices.find((i) => i.id === at.invoiceId);
      if (!inv) return 'IGNORED';
      const wasPaid = inv.status === 'PAID';
      const payment: Payment = {
        id: this.id(),
        invoiceId: inv.id,
        attemptId: at.id,
        mpesaReceiptNumber: result.receipt,
        amountCents: result.amountCents,
        payerPhone: result.phone,
        paidAt: result.paidAt,
        source,
        manualMethod: null,
        manualReference: null,
        note: null,
        recordedAt: this.nowIso(),
      };
      a.payments.push(payment);
      this.recomputePaid(a, inv);
      const client = this.clientName(a, inv.clientId);
      // Record what arrived, not what was asked.
      if (inv.status === 'VOID') {
        this.notify(a, 'voided_invoice_paid', 'Payment received on a voided invoice', `${client} paid ${formatKesShort(payment.amountCents)} on ${inv.number}.`, inv.id);
      } else if (wasPaid) {
        this.notify(a, 'double_payment', 'This invoice was paid twice', `${formatKesShort(payment.amountCents)} from ${displayPhone(result.phone)} needs refunding. Receipt ${result.receipt}.`, inv.id);
      } else if (inv.amountPaidCents >= inv.totalCents) {
        inv.status = 'PAID';
        inv.paidAt = result.paidAt;
        if (inv.amountPaidCents > inv.totalCents) {
          this.notify(a, 'overpayment', `${inv.number} was overpaid`, `${formatKesShort(inv.amountPaidCents - inv.totalCents)} more than the total arrived.`, inv.id);
        }
      } else {
        inv.needsReview = `Part-payment: ${formatKes(inv.amountPaidCents)} of ${formatKes(inv.totalCents)} received. Review and follow up.`;
        this.notify(a, 'underpayment', `${inv.number} was part-paid`, inv.needsReview, inv.id);
      }
      this.cancelReminders(a, inv.id, 'invoice paid');
      a.receipts.push({ id: this.id(), paymentId: payment.id, number: `RCP-${String(a.nextReceiptNo++).padStart(6, '0')}`, emailedAt: this.nowIso(), createdAt: this.nowIso() });
      this.audit(
        a,
        inv.id,
        'payment.settled',
        `Paid ${formatKes(payment.amountCents)} via M-Pesa · ${result.receipt} · ${displayPhone(result.phone)}${source === 'RECONCILED' ? ' · recovered by reconciliation' : ''}`,
      );
      if (a.notificationPrefs.paymentReceivedInApp && !wasPaid && inv.status === 'PAID') {
        this.notify(a, 'payment_received', `${client} paid ${formatKesShort(payment.amountCents)}`, `${inv.number} · ${result.receipt}`, inv.id);
      }
      this.emit({ type: 'payment_received', clientName: client, amountCents: payment.amountCents, invoiceId: inv.id });
      return 'SETTLED';
    }
    if (at.status !== 'PENDING') return 'IGNORED';
    at.status = mapped.status;
    at.failureReason = mapped.reason;
    at.resultCode = result.resultCode;
    at.resolvedAt = this.nowIso();
    if (at.purpose === 'INVOICE' && at.invoiceId) {
      const reason = mapped.reason as FailureReason;
      this.audit(a, at.invoiceId, 'payment.failed', FREELANCER_FAILURE_COPY[reason]);
      // A failed attempt pauses the next reminder by 24 hours.
      const cutoff = this.env.now().getTime() + 24 * 3600 * 1000;
      for (const r of a.reminders) {
        if (r.invoiceId === at.invoiceId && r.status === 'SCHEDULED' && new Date(r.scheduledFor).getTime() < cutoff) {
          r.scheduledFor = shiftIntoSendWindow(new Date(new Date(r.scheduledFor).getTime() + 24 * 3600 * 1000).toISOString());
        }
      }
      if (a.notificationPrefs.paymentFailedInApp) {
        const inv = a.invoices.find((i) => i.id === at.invoiceId);
        this.notify(a, 'payment_failed', `A payment attempt on ${inv?.number ?? 'an invoice'} didn’t go through`, FREELANCER_FAILURE_COPY[reason], at.invoiceId);
      }
    }
    return 'FAILED';
  }

  private recomputePaid(a: Account, inv: Invoice) {
    // Mirrors the sync_invoice_paid trigger: always the sum of the invoice's payments.
    inv.amountPaidCents = a.payments.filter((p) => p.invoiceId === inv.id).reduce((s, p) => s + p.amountCents, 0);
  }

  private applySubscriptionPayment(a: Account, at: PaymentAttempt, receipt: string) {
    const now = this.env.now();
    a.charges.unshift({ id: at.id, amountCents: at.amountCents, mpesaReceiptNumber: receipt, paidAt: now.toISOString(), plan: 'PRO' });
    a.user.plan = 'PRO';
    a.subscription = { plan: 'PRO', status: 'ACTIVE', currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 3600 * 1000).toISOString(), cancelAtPeriodEnd: false };
    this.notify(a, 'subscription', 'You’re on Pro', 'Unlimited invoices from now on.', null);
    // Drafts saved from M-9 send themselves the moment the plan allows.
    for (const inv of a.invoices.filter((i) => i.queuedForSend && i.status === 'DRAFT')) {
      try {
        const client = this.validateForSend(a, inv);
        if (a.mpesa.status !== 'ACTIVE') continue;
        inv.status = 'SENT';
        inv.sentAt = now.toISOString();
        inv.queuedForSend = false;
        a.usage[periodKeyEat(now)] = (a.usage[periodKeyEat(now)] ?? 0) + 1;
        this.materialiseReminders(a, inv);
        this.audit(a, inv.id, 'invoice.sent', `Sent to ${client.email} automatically after upgrade`);
      } catch {
        // leave it queued; the freelancer will see it as a draft
      }
    }
  }

  private sweepOne(a: Account, at: PaymentAttempt & { sim?: SimScenario }, force = false) {
    const age = this.env.now().getTime() - new Date(at.initiatedAt).getTime();
    if (!force && age < SWEEP_AFTER_MS) return;
    at.pollCount += 1;
    // STK Push Query: the simulator answers with the scenario's result.
    const sim = at.sim ?? 'SUCCESS';
    if (sim === 'LATE_SUCCESS') {
      this.settle(a, at, { resultCode: 0, receipt: this.simReceipts.get(at.id) ?? this.receiptCode(), amountCents: at.amountCents, phone: at.payerPhone, paidAt: at.initiatedAt }, 'RECONCILED');
      return;
    }
    const code = SIM_RESULT[sim] ?? 1019;
    if (code === 0) {
      this.settle(a, at, { resultCode: 0, receipt: this.simReceipts.get(at.id) ?? this.receiptCode(), amountCents: at.amountCents, phone: at.payerPhone, paidAt: at.initiatedAt }, 'RECONCILED');
      return;
    }
    if (at.pollCount >= MAX_POLLS || sim === 'NO_RESPONSE' || force) {
      this.settle(a, at, { resultCode: code, receipt: null, amountCents: at.amountCents, phone: at.payerPhone, paidAt: this.nowIso() }, 'RECONCILED');
    }
  }

  /**
   * Housekeeping the real system does in workers: the reconciliation sweeper,
   * the nightly overdue flip and the reminder dispatch scan. Idempotent; safe to
   * call on every read.
   */
  tick() {
    const now = this.env.now();
    const today = todayEat(now);
    let changed = false;
    for (const a of Object.values(this.db.accounts)) {
      for (const at of a.attempts) {
        if (at.status === 'PENDING') {
          const before = at.status;
          this.sweepOne(a, at);
          if (at.status !== before) changed = true;
        }
      }
      for (const inv of a.invoices) {
        if ((inv.status === 'SENT' || inv.status === 'VIEWED') && inv.dueDate < today) {
          inv.status = 'OVERDUE';
          this.audit(a, inv.id, 'invoice.overdue', 'Now overdue');
          changed = true;
        }
      }
      for (const r of a.reminders) {
        if (r.status !== 'SCHEDULED' || new Date(r.scheduledFor).getTime() > now.getTime()) continue;
        const inv = a.invoices.find((i) => i.id === r.invoiceId);
        changed = true;
        if (!inv || !['SENT', 'VIEWED', 'OVERDUE'].includes(inv.status)) {
          r.status = 'CANCELLED';
          r.skipReason = 'invoice no longer unpaid';
        } else if (this.remindedToday(inv)) {
          r.status = 'SKIPPED';
          r.skipReason = 'already reminded today';
        } else {
          r.status = 'SENT';
          r.sentAt = now.toISOString();
          inv.lastReminderAt = now.toISOString();
          const when = r.offsetDays === 0 ? 'on the due date' : r.offsetDays! < 0 ? `${-r.offsetDays!} days before due` : `${r.offsetDays} days after due`;
          this.audit(a, inv.id, 'reminder.sent', `Automatic reminder sent (${when})`);
        }
      }
      if (a.subscription.plan === 'PRO' && a.subscription.currentPeriodEnd && new Date(a.subscription.currentPeriodEnd) < now) {
        if (a.subscription.cancelAtPeriodEnd || a.subscription.status === 'PAST_DUE') {
          a.subscription = { plan: 'FREE', status: 'EXPIRED', currentPeriodEnd: null, cancelAtPeriodEnd: false };
          a.user.plan = 'FREE';
        } else {
          a.subscription.status = 'PAST_DUE';
        }
        changed = true;
      }
    }
    if (changed) void this.commit();
  }

  // -------------------------------------------------------------------------
  // Simulator & demo

  getSim() {
    return { ...this.db.sim };
  }

  setSim(s: SimSettings) {
    this.db.sim = { ...s };
    void this.persist();
  }

  async resetAll() {
    this.db = emptyDb();
    this.loaded = true;
    await this.commit();
  }

  async loadDemoAccount() {
    await this.ready();
    const email = 'demo@invoicempesa.co.ke';
    const existing = this.db.emailIndex[email];
    if (existing) {
      this.db.sessionUserId = existing;
      await this.commit();
      return this.meOf(this.db.accounts[existing]);
    }
    const a = this.createAccount('Brian Otieno', email, 'demo-password');
    const now = this.env.now();
    const iso = (daysAgo: number, hour = 11) => eatDateHourToIso(addDays(todayEat(now), -daysAgo), hour);
    a.user.emailVerifiedAt = iso(40);
    a.user.createdAt = iso(40);
    Object.assign(a.profile, {
      businessName: 'Brian Otieno Design',
      phone: '254712345678',
      location: 'Nairobi, Kenya',
      profileCompletedAt: iso(40),
      invoicesSentEver: 6,
    });
    Object.assign(a.mpesa, { shortcodeType: 'TILL', shortcode: '5123456', hasConsumerKey: true, hasConsumerSecret: true, hasPasskey: true, status: 'ACTIVE', lastVerifiedAt: iso(39), wizardStep: 4 });
    a.secrets = { consumerKey: 'demo-key', consumerSecret: 'demo-secret', passkey: 'demo-passkey' };
    const mk = (name: string, email: string, phone: string) => {
      const c: Client = { id: this.id(), name, email, phone, company: null, notes: null, remindersEnabled: true, archivedAt: null, createdAt: iso(38), updatedAt: iso(38) };
      a.clients.push(c);
      return c;
    };
    const kamau = mk('Kamau Designs', 'kamau@example.com', '254722000111');
    const achieng = mk('Achieng Tutors', 'achieng@example.com', '254733000222');
    const brian = mk('Mwangi & Co.', 'accounts@mwangi.co.ke', '254711000333');
    const wanjiru = mk('Wanjiru Events', 'hello@wanjiru.events', '254701000444');
    this.db.sessionUserId = a.user.id;
    const build = async (client: Client, items: [string, number, number][], issuedDaysAgo: number, terms: number) => {
      const issue = addDays(todayEat(now), -issuedDaysAgo);
      const inv = await this.createDraftSync(a, {
        clientId: client.id,
        issueDate: issue,
        dueDate: addDays(issue, terms),
        lineItems: items.map(([description, q, p]) => ({ description, quantityMilli: q * 1000, unitPriceCents: p * 100 })),
        discountMode: 'AMOUNT',
        discountInput: 0,
        vat: false,
        notes: a.profile.defaultNotes,
        terms: a.profile.defaultTerms,
        remindersEnabled: true,
      });
      inv.createdAt = iso(issuedDaysAgo, 10);
      return inv;
    };
    const sent = (inv: Invoice, daysAgo: number) => {
      inv.status = 'SENT';
      inv.sentAt = iso(daysAgo, 12);
      this.audit(a, inv.id, 'invoice.sent', `Sent to ${a.clients.find((c) => c.id === inv.clientId)?.email}`);
      a.audit[a.audit.length - 1].createdAt = inv.sentAt;
    };
    const paid = (inv: Invoice, daysAgo: number, phone: string) => {
      const at: PaymentAttempt = { id: this.id(), invoiceId: inv.id, purpose: 'INVOICE', checkoutRequestId: `ws_CO_${this.hex(8)}`, payerPhone: phone, amountCents: inv.totalCents, status: 'SUCCESS', resultCode: 0, failureReason: null, initiatedAt: iso(daysAgo, 16), resolvedAt: iso(daysAgo, 16), pollCount: 0 };
      a.attempts.push(at);
      const receipt = this.receiptCode();
      const p: Payment = { id: this.id(), invoiceId: inv.id, attemptId: at.id, mpesaReceiptNumber: receipt, amountCents: inv.totalCents, payerPhone: phone, paidAt: iso(daysAgo, 16), source: 'STK_PUSH', manualMethod: null, manualReference: null, note: null, recordedAt: iso(daysAgo, 16) };
      a.payments.push(p);
      a.receipts.push({ id: this.id(), paymentId: p.id, number: `RCP-${String(a.nextReceiptNo++).padStart(6, '0')}`, emailedAt: p.paidAt, createdAt: p.paidAt });
      this.recomputePaid(a, inv);
      inv.status = 'PAID';
      inv.paidAt = p.paidAt;
      this.audit(a, inv.id, 'payment.settled', `Paid ${formatKes(p.amountCents)} via M-Pesa · ${receipt} · ${displayPhone(phone)}`);
      a.audit[a.audit.length - 1].createdAt = p.paidAt;
    };
    const i1 = await build(brian, [['Website redesign', 1, 30000]], 34, 14);
    sent(i1, 34);
    paid(i1, 30, '254711000333');
    const i2 = await build(achieng, [['Lesson plan illustrations', 4, 2000]], 12, 7);
    sent(i2, 12);
    paid(i2, 2, '254733000222');
    const i3 = await build(kamau, [['Brand identity', 1, 10000], ['Social templates', 5, 500]], 18, 14);
    sent(i3, 18);
    const i4 = await build(wanjiru, [['Event poster series', 3, 5000], ['Programme booklet', 1, 8000]], 5, 14);
    sent(i4, 5);
    i4.status = 'VIEWED';
    i4.firstViewedAt = iso(4, 9);
    i4.lastViewedAt = iso(4, 9);
    this.audit(a, i4.id, 'invoice.viewed', 'Viewed by client');
    a.audit[a.audit.length - 1].createdAt = iso(4, 9);
    await build(kamau, [['Packaging mock-ups', 2, 6000]], 1, 14);
    a.usage[periodKeyEat(now)] = 2;
    this.tick();
    await this.commit();
    return this.meOf(a);
  }

  private async createDraftSync(a: Account, input: InvoiceInput) {
    const prev = this.db.sessionUserId;
    this.db.sessionUserId = a.user.id;
    const lat = this.env.latencyMs;
    this.env.latencyMs = 0;
    try {
      const created = await this.createDraft(input);
      return a.invoices.find((i) => i.id === created.id)!;
    } finally {
      this.env.latencyMs = lat;
      this.db.sessionUserId = prev;
    }
  }

  /** Test hook: raw DB access. */
  __db() {
    return this.db;
  }
}
