/**
 * Typed client for the NestJS API (TDD §6). REST + JSON under /v1, amounts in
 * integer cents, one error shape. The 401 flow lives here and only here: one
 * refresh attempt, shared by concurrent requests, then replay; on failure the
 * session is cleared and the app routes to login.
 *
 * Endpoints the TDD lists are used verbatim. A handful of screens need data the
 * TDD's table does not name (reminder rules, notification prefs, the bell,
 * billing); those follow the same conventions under /v1/me/… and are marked.
 */
import * as SecureStore from 'expo-secure-store';
import { ApiError, type ApiErrorCode } from './errors';
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
} from './types';
import type {
  Banner,
  BusinessProfile,
  Client,
  DashboardSummary,
  Invoice,
  InvoiceDetail,
  MpesaCredential,
  Notification,
  NotificationPrefs,
  PaymentStatus,
  Plan,
  PublicInvoice,
  PublicInvoiceResult,
  ReminderRule,
  Subscription,
  SubscriptionCharge,
  Usage,
} from '../domain/types';

const REFRESH_KEY = 'invoice-mpesa.refresh';
const POLL_MS = 15000;

export class HttpApi implements Api {
  readonly mode = 'http' as const;
  private accessToken: string | null = null;
  private refreshing: Promise<boolean> | null = null;
  private listeners = new Set<(e: ApiEvent) => void>();
  private poller: ReturnType<typeof setInterval> | null = null;

  constructor(private baseUrl: string, private payBaseUrl: string) {}

  // -------------------------------------------------------------------------

  private async raw(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, auth = true) {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/v1${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(auth && this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError('NETWORK', 'Couldn’t connect. Check your connection and try again.');
    }
    return res;
  }

  private async request<T>(method: string, path: string, body?: unknown, opts: { auth?: boolean; headers?: Record<string, string> } = {}): Promise<T> {
    const auth = opts.auth ?? true;
    let res = await this.raw(method, path, body, opts.headers, auth);
    if (res.status === 401 && auth) {
      if (await this.refresh()) res = await this.raw(method, path, body, opts.headers, auth);
      else {
        await this.clearSession();
        throw new ApiError('UNAUTHENTICATED', 'Please log in again.');
      }
    }
    if (res.status === 204) return undefined as T;
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const e = json?.error ?? {};
      const err = new ApiError((e.code as ApiErrorCode) ?? 'NETWORK', e.message ?? 'Something went wrong. Try again.', e.details ?? null, e.meta ?? {});
      if (e.requestId) err.requestId = e.requestId;
      if (res.status === 429) err.meta.retryAfterSec = Number(res.headers.get('Retry-After') ?? 60);
      throw err;
    }
    return json as T;
  }

  /** Concurrent 401s share one refresh promise. */
  private refresh(): Promise<boolean> {
    if (!this.refreshing) {
      this.refreshing = (async () => {
        const token = await SecureStore.getItemAsync(REFRESH_KEY);
        if (!token) return false;
        const res = await this.raw('POST', '/auth/refresh', { refreshToken: token }, {}, false);
        if (!res.ok) return false;
        const j = await res.json();
        this.accessToken = j.accessToken;
        await SecureStore.setItemAsync(REFRESH_KEY, j.refreshToken);
        return true;
      })().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  private async clearSession() {
    this.accessToken = null;
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  }

  private startPolling() {
    if (this.poller) return;
    this.poller = setInterval(() => this.listeners.forEach((l) => l({ type: 'changed' })), POLL_MS);
  }

  subscribe(listener: (e: ApiEvent) => void) {
    this.listeners.add(listener);
    this.startPolling();
    return () => {
      this.listeners.delete(listener);
    };
  }

  // -------------------------------------------------------------------------
  // Auth

  async restoreSession() {
    if (!(await this.refresh())) return null;
    return this.me();
  }

  async signup(input: { name: string; email: string; password: string }) {
    const j = await this.request<{ accessToken: string; refreshToken: string }>('POST', '/auth/register', input, { auth: false });
    this.accessToken = j.accessToken;
    await SecureStore.setItemAsync(REFRESH_KEY, j.refreshToken);
  }

  async login(input: { email: string; password: string; keepSignedIn: boolean }) {
    const j = await this.request<{ accessToken: string; refreshToken: string }>('POST', '/auth/login', input, { auth: false });
    this.accessToken = j.accessToken;
    await SecureStore.setItemAsync(REFRESH_KEY, j.refreshToken);
    return this.me();
  }

  async logout() {
    const token = await SecureStore.getItemAsync(REFRESH_KEY);
    await this.request('POST', '/auth/logout', { refreshToken: token }).catch(() => undefined);
    await this.clearSession();
  }

  me() {
    return this.request<Me>('GET', '/me');
  }
  resendVerification() {
    return this.request<void>('POST', '/auth/resend-verification');
  }
  async verifyEmail(token: string) {
    const r = await this.request<{ status: 'VERIFIED' | 'ALREADY' }>('POST', '/auth/verify-email', { token }, { auth: false });
    return r.status;
  }
  forgotPassword(email: string) {
    return this.request<void>('POST', '/auth/forgot-password', { email }, { auth: false });
  }
  async resetPassword(token: string, password: string) {
    const j = await this.request<{ accessToken: string; refreshToken: string }>('POST', '/auth/reset-password', { token, password }, { auth: false });
    this.accessToken = j.accessToken;
    await SecureStore.setItemAsync(REFRESH_KEY, j.refreshToken);
    return this.me();
  }
  changePassword(current: string, next: string) {
    return this.request<void>('POST', '/me/password', { current, next });
  }
  updateAccount(input: { name: string }) {
    return this.request<void>('PATCH', '/me', input);
  }
  deleteAccount(confirmBusinessName: string) {
    return this.request<void>('DELETE', '/me', { confirmBusinessName });
  }

  // Profile & settings
  updateProfile(patch: Partial<BusinessProfile>) {
    return this.request<BusinessProfile>('PATCH', '/me/profile', patch);
  }
  getReminderRules() {
    return this.request<ReminderRule[]>('GET', '/me/reminder-rules');
  }
  setReminderRules(rules: ReminderRule[]) {
    return this.request<void>('PUT', '/me/reminder-rules', rules);
  }
  getNotificationPrefs() {
    return this.request<NotificationPrefs>('GET', '/me/notification-prefs');
  }
  setNotificationPrefs(p: NotificationPrefs) {
    return this.request<void>('PUT', '/me/notification-prefs', p);
  }

  // M-Pesa
  saveMpesaStep(input: MpesaStepInput) {
    return this.request<MpesaCredential>('PUT', '/me/mpesa', input);
  }
  verifyMpesaKeys() {
    return this.request<MpesaCredential>('POST', '/me/mpesa/verify');
  }
  sendTestPayment(phone: string) {
    return this.request<{ attemptId: string }>('POST', '/me/mpesa/test', { phone });
  }
  attemptStatus(attemptId: string) {
    return this.request<PaymentStatus>('GET', `/me/attempts/${attemptId}`);
  }
  disconnectMpesa() {
    return this.request<void>('DELETE', '/me/mpesa');
  }
  async liveUnpaidInvoiceCount() {
    const s = await this.summary();
    return s.outstandingCount;
  }

  // Clients
  listClients(opts: { q?: string; includeArchived?: boolean } = {}) {
    const qs = new URLSearchParams();
    if (opts.q) qs.set('q', opts.q);
    if (opts.includeArchived) qs.set('includeArchived', 'true');
    return this.request<{ data: ClientRow[] }>('GET', `/clients?${qs}`).then((r) => r.data);
  }
  getClient(id: string) {
    return this.request<{ client: Client; outstandingCents: number; invoices: InvoiceListRow[] }>('GET', `/clients/${id}`);
  }
  createClient(input: ClientInput) {
    return this.request<Client>('POST', '/clients', input);
  }
  updateClient(id: string, input: ClientInput) {
    return this.request<Client>('PATCH', `/clients/${id}`, input);
  }
  deleteClient(id: string) {
    return this.request<void>('DELETE', `/clients/${id}`);
  }
  archiveClient(id: string) {
    return this.request<void>('POST', `/clients/${id}/archive`);
  }

  // Invoices
  async previewNextNumber() {
    return (await this.request<{ number: string }>('GET', '/invoices/next-number')).number;
  }
  listInvoices(q: InvoiceListQuery) {
    const qs = new URLSearchParams();
    if (q.filter && q.filter !== 'ALL') qs.set('status', q.filter);
    if (q.q) qs.set('q', q.q);
    if (q.from) qs.set('from', q.from);
    if (q.to) qs.set('to', q.to);
    if (q.clientId) qs.set('clientId', q.clientId);
    return this.request<{ data: InvoiceListRow[] }>('GET', `/invoices?${qs}`).then((r) => r.data);
  }
  getInvoice(id: string) {
    return this.request<InvoiceDetail>('GET', `/invoices/${id}`);
  }
  createDraft(input: InvoiceInput) {
    return this.request<Invoice>('POST', '/invoices', input);
  }
  updateInvoice(id: string, input: InvoiceInput) {
    return this.request<Invoice>('PATCH', `/invoices/${id}`, input);
  }
  deleteDraft(id: string) {
    return this.request<void>('DELETE', `/invoices/${id}`);
  }
  sendInvoice(id: string, opts: { message: string; sendCopy: boolean }) {
    return this.request<Invoice>('POST', `/invoices/${id}/send`, opts);
  }
  queueForSend(id: string) {
    return this.request<void>('POST', `/invoices/${id}/queue-send`);
  }
  remind(id: string) {
    return this.request<void>('POST', `/invoices/${id}/remind`);
  }
  bulkRemind(ids: string[]) {
    return this.request<{ sent: number; skipped: number }>('POST', '/invoices/remind', { ids });
  }
  markPaidManually(id: string, input: { method: string; date: string; reference: string; note: string }) {
    return this.request<void>('POST', `/invoices/${id}/payments/manual`, input);
  }
  voidInvoice(id: string, notifyClient: boolean) {
    return this.request<void>('POST', `/invoices/${id}/cancel`, { notifyClient });
  }
  duplicateInvoice(id: string) {
    return this.request<Invoice>('POST', `/invoices/${id}/duplicate`);
  }
  dismissInvoiceBanner(id: string, note: string) {
    return this.request<void>('POST', `/invoices/${id}/banner/dismiss`, { note });
  }
  publicLink(invoice: Invoice) {
    return `${this.payBaseUrl}/i/${invoice.publicToken}`;
  }

  // Dashboard
  summary() {
    return this.request<DashboardSummary>('GET', '/dashboard/summary');
  }
  needsAttention() {
    return this.request<InvoiceListRow[]>('GET', '/dashboard/needs-attention');
  }
  recentPayments() {
    return this.request<PaymentRow[]>('GET', '/dashboard/recent-payments');
  }
  banners() {
    return this.request<Banner[]>('GET', '/dashboard/banners');
  }
  listPayments(range: { from?: string | null; to?: string | null } = {}) {
    const qs = new URLSearchParams();
    if (range.from) qs.set('from', range.from);
    if (range.to) qs.set('to', range.to);
    return this.request<{ data: PaymentRow[] }>('GET', `/payments?${qs}`).then((r) => r.data);
  }

  // Notifications
  listNotifications() {
    return this.request<Notification[]>('GET', '/me/notifications');
  }
  async unreadCount() {
    return (await this.request<{ count: number }>('GET', '/me/notifications/unread-count')).count;
  }
  markNotificationsRead() {
    return this.request<void>('POST', '/me/notifications/read');
  }

  // Billing
  billing() {
    return this.request<{ subscription: Subscription; usage: Usage; charges: SubscriptionCharge[] }>('GET', '/me/billing');
  }
  startUpgrade(plan: Plan, phone: string) {
    return this.request<{ attemptId: string }>('POST', '/me/billing/upgrade', { plan, phone });
  }
  cancelSubscription() {
    return this.request<void>('POST', '/me/billing/cancel');
  }

  // Public — no auth, keyed by token
  async getPublicInvoice(token: string): Promise<PublicInvoiceResult> {
    try {
      const invoice = await this.request<PublicInvoice>('GET', `/public/invoices/${token}`, undefined, { auth: false });
      return { kind: 'ok', invoice };
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NOT_FOUND') {
        const m = e.meta as { businessName?: string; contactEmail?: string; contactPhone?: string };
        return { kind: 'invalid', businessName: m.businessName ?? null, contactEmail: m.contactEmail ?? null, contactPhone: m.contactPhone ?? null };
      }
      throw e;
    }
  }
  pay(token: string, phone: string, idempotencyKey: string) {
    return this.request<{ attemptId: string }>('POST', `/public/invoices/${token}/pay`, { phone }, { auth: false, headers: { 'Idempotency-Key': idempotencyKey } });
  }
  paymentStatus(token: string) {
    return this.request<PaymentStatus | null>('GET', `/public/invoices/${token}/status`, undefined, { auth: false });
  }
}
