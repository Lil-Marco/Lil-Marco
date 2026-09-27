import type {
  Banner,
  BusinessProfile,
  Client,
  DashboardSummary,
  DiscountMode,
  Invoice,
  InvoiceDetail,
  InvoiceStatus,
  MpesaCredential,
  Notification,
  NotificationPrefs,
  Payment,
  PaymentStatus,
  Plan,
  PublicInvoiceResult,
  ReminderRule,
  ShortcodeType,
  Subscription,
  SubscriptionCharge,
  Usage,
  User,
} from '../domain/types';

export interface Me {
  user: User;
  profile: BusinessProfile;
  mpesa: MpesaCredential;
  usage: Usage;
  subscription: Subscription;
}

export interface InvoiceInput {
  clientId: string | null;
  issueDate: string;
  dueDate: string;
  lineItems: { description: string; quantityMilli: number; unitPriceCents: number }[];
  discountMode: DiscountMode;
  discountInput: number;
  vat: boolean;
  notes: string;
  terms: string;
  remindersEnabled: boolean;
}

export type InvoiceFilter = 'ALL' | 'DRAFT' | 'SENT' | 'OVERDUE' | 'PAID';

export interface InvoiceListQuery {
  filter?: InvoiceFilter;
  q?: string;
  from?: string | null;
  to?: string | null;
  clientId?: string;
}

export interface InvoiceListRow {
  invoice: Invoice;
  clientName: string;
}

export interface ClientRow {
  client: Client;
  outstandingCents: number;
  invoiceCount: number;
  lastInvoiceDate: string | null;
}

export interface PaymentRow {
  payment: Payment;
  invoiceNumber: string;
  clientName: string;
}

export interface ClientInput {
  name: string;
  email: string | null;
  phone: string | null;
  company?: string | null;
  notes: string | null;
  remindersEnabled?: boolean;
}

export interface MpesaStepInput {
  shortcodeType?: ShortcodeType;
  shortcode?: string;
  accountNumber?: string | null;
  consumerKey?: string;
  consumerSecret?: string;
  passkey?: string;
  wizardStep?: number;
}

export type SimScenario =
  | 'SUCCESS'
  | 'WRONG_PIN'
  | 'CANCELLED'
  | 'INSUFFICIENT'
  | 'UNREACHABLE'
  | 'SYSTEM'
  | 'NO_RESPONSE'
  | 'LATE_SUCCESS'
  | 'DUPLICATE_CALLBACK';

export interface SimSettings {
  scenario: SimScenario;
  callbackDelayMs: number;
}

export type ApiEvent =
  | { type: 'changed' }
  | { type: 'payment_received'; clientName: string; amountCents: number; invoiceId: string };

export interface Api {
  readonly mode: 'mock' | 'http';

  // Session & auth (A-1 … A-6)
  restoreSession(): Promise<Me | null>;
  signup(input: { name: string; email: string; password: string }): Promise<void>;
  login(input: { email: string; password: string; keepSignedIn: boolean }): Promise<Me>;
  logout(): Promise<void>;
  me(): Promise<Me>;
  resendVerification(): Promise<void>;
  verifyEmail(token: string): Promise<'VERIFIED' | 'ALREADY'>;
  forgotPassword(email: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<Me>;

  // Profile & settings
  updateProfile(patch: Partial<BusinessProfile>): Promise<BusinessProfile>;
  getReminderRules(): Promise<ReminderRule[]>;
  setReminderRules(rules: ReminderRule[]): Promise<void>;
  getNotificationPrefs(): Promise<NotificationPrefs>;
  setNotificationPrefs(p: NotificationPrefs): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;
  updateAccount(input: { name: string }): Promise<void>;
  deleteAccount(confirmBusinessName: string): Promise<void>;

  // M-Pesa (A-9, D-9)
  saveMpesaStep(input: MpesaStepInput): Promise<MpesaCredential>;
  verifyMpesaKeys(): Promise<MpesaCredential>;
  sendTestPayment(phone: string): Promise<{ attemptId: string }>;
  attemptStatus(attemptId: string): Promise<PaymentStatus>;
  disconnectMpesa(): Promise<void>;
  liveUnpaidInvoiceCount(): Promise<number>;

  // Clients (D-6, D-7, M-1)
  listClients(opts?: { q?: string; includeArchived?: boolean }): Promise<ClientRow[]>;
  getClient(id: string): Promise<{ client: Client; outstandingCents: number; invoices: InvoiceListRow[] }>;
  createClient(input: ClientInput): Promise<Client>;
  updateClient(id: string, input: ClientInput): Promise<Client>;
  deleteClient(id: string): Promise<void>;
  archiveClient(id: string): Promise<void>;

  // Invoices (D-2, D-3, D-5, M-2 … M-6, M-9)
  previewNextNumber(): Promise<string>;
  listInvoices(q: InvoiceListQuery): Promise<InvoiceListRow[]>;
  getInvoice(id: string): Promise<InvoiceDetail>;
  createDraft(input: InvoiceInput): Promise<Invoice>;
  updateInvoice(id: string, input: InvoiceInput): Promise<Invoice>;
  deleteDraft(id: string): Promise<void>;
  sendInvoice(id: string, opts: { message: string; sendCopy: boolean }): Promise<Invoice>;
  queueForSend(id: string): Promise<void>;
  remind(id: string): Promise<void>;
  bulkRemind(ids: string[]): Promise<{ sent: number; skipped: number }>;
  markPaidManually(id: string, input: { method: string; date: string; reference: string; note: string }): Promise<void>;
  voidInvoice(id: string, notifyClient: boolean): Promise<void>;
  duplicateInvoice(id: string): Promise<Invoice>;
  dismissInvoiceBanner(id: string, note: string): Promise<void>;
  publicLink(invoice: Invoice): string;

  // Dashboard (D-1)
  summary(): Promise<DashboardSummary>;
  needsAttention(): Promise<InvoiceListRow[]>;
  recentPayments(): Promise<PaymentRow[]>;
  banners(): Promise<Banner[]>;

  // Payments (D-8)
  listPayments(range?: { from?: string | null; to?: string | null }): Promise<PaymentRow[]>;

  // Notifications (bell)
  listNotifications(): Promise<Notification[]>;
  unreadCount(): Promise<number>;
  markNotificationsRead(): Promise<void>;

  // Plan & billing (D-10, D-11)
  billing(): Promise<{ subscription: Subscription; usage: Usage; charges: SubscriptionCharge[] }>;
  startUpgrade(plan: Plan, phone: string): Promise<{ attemptId: string }>;
  cancelSubscription(): Promise<void>;

  // Public, no session (P-1 … P-8)
  getPublicInvoice(token: string): Promise<PublicInvoiceResult>;
  pay(token: string, phone: string, idempotencyKey: string): Promise<{ attemptId: string }>;
  paymentStatus(token: string): Promise<PaymentStatus | null>;

  // Live updates — the same channel P-3 and D-1 use.
  subscribe(listener: (e: ApiEvent) => void): () => void;

  // Simulator controls (mock only)
  tick?(): void;
  getSim?(): SimSettings;
  setSim?(s: SimSettings): void;
  simulateVerificationLink?(): Promise<void>;
  /** Mock only: the token the last reset email would have carried. */
  lastResetToken?(): string | null;
  loadDemoAccount?(): Promise<Me>;
  resetAll?(): Promise<void>;
}

export type StatusFilterMap = Record<InvoiceFilter, InvoiceStatus[] | null>;
