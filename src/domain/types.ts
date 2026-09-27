/**
 * Domain model — mirrors Backend Schema v1 (camelCase over snake_case).
 * All money is integer cents; all timestamps are ISO-8601 UTC strings;
 * calendar dates (issue, due) are YYYY-MM-DD.
 */

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'OVERDUE' | 'PAID' | 'VOID';
export type AttemptStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'TIMEOUT';
export type FailureReason =
  | 'CANCELLED_BY_USER'
  | 'WRONG_PIN'
  | 'INSUFFICIENT_FUNDS'
  | 'TIMEOUT'
  | 'UNREACHABLE'
  | 'SYSTEM';
export type PaymentSource = 'STK_PUSH' | 'MANUAL' | 'RECONCILED';
export type ShortcodeType = 'PAYBILL' | 'TILL';
export type CredentialStatus = 'UNVERIFIED' | 'ACTIVE' | 'INVALID' | 'DISCONNECTED';
export type Plan = 'FREE' | 'PRO' | 'BUSINESS';
export type SubStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';
export type ReminderStatus = 'SCHEDULED' | 'SENT' | 'SKIPPED' | 'CANCELLED';

export interface User {
  id: string;
  name: string;
  email: string;
  emailVerifiedAt: string | null;
  plan: Plan;
  createdAt: string;
}

export interface BusinessProfile {
  businessName: string;
  logoUri: string | null;
  phone: string | null; // canonical 2547…
  email: string | null;
  location: string | null;
  kraPin: string | null;
  invoicePrefix: string;
  nextInvoiceNo: number;
  paymentTermsDays: number;
  defaultNotes: string;
  defaultTerms: string;
  footerText: string;
  vatEnabled: boolean;
  profileCompletedAt: string | null;
  invoicesSentEver: number;
}

export interface MpesaCredential {
  shortcodeType: ShortcodeType | null;
  shortcode: string | null;
  accountNumber: string | null;
  /** Secrets are write-only: the API only reports whether each is set. */
  hasConsumerKey: boolean;
  hasConsumerSecret: boolean;
  hasPasskey: boolean;
  status: CredentialStatus;
  lastVerifiedAt: string | null;
  /** Wizard resume point, 1-4. */
  wizardStep: number;
}

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null; // canonical
  company: string | null;
  notes: string | null;
  remindersEnabled: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LineItem {
  id: string;
  position: number;
  description: string;
  quantityMilli: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export type DiscountMode = 'AMOUNT' | 'PERCENT';

export interface Invoice {
  id: string;
  clientId: string;
  number: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  currency: 'KES';
  lineItems: LineItem[];
  subtotalCents: number;
  discountMode: DiscountMode;
  /** For PERCENT, basis points of subtotal; for AMOUNT, the cents value. */
  discountInput: number;
  discountCents: number;
  taxRateBp: number;
  taxCents: number;
  totalCents: number;
  amountPaidCents: number;
  notes: string;
  terms: string;
  publicToken: string;
  tokenRevokedAt: string | null;
  remindersEnabled: boolean;
  sentAt: string | null;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  lastReminderAt: string | null;
  /** Saved from M-9: sends itself the moment the plan allows. */
  queuedForSend: boolean;
  needsReview: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentAttempt {
  id: string;
  invoiceId: string | null; // null for subscription charges
  purpose: 'INVOICE' | 'SUBSCRIPTION' | 'TEST';
  checkoutRequestId: string | null;
  payerPhone: string;
  amountCents: number;
  status: AttemptStatus;
  resultCode: number | null;
  failureReason: FailureReason | null;
  initiatedAt: string;
  resolvedAt: string | null;
  pollCount: number;
}

export interface Payment {
  id: string;
  invoiceId: string;
  attemptId: string | null;
  mpesaReceiptNumber: string | null;
  amountCents: number;
  payerPhone: string | null;
  paidAt: string;
  source: PaymentSource;
  manualMethod: string | null;
  manualReference: string | null;
  note: string | null;
  recordedAt: string;
}

export interface Receipt {
  id: string;
  paymentId: string;
  number: string;
  emailedAt: string | null;
  createdAt: string;
}

export interface Reminder {
  id: string;
  invoiceId: string;
  offsetDays: number | null; // null = manual nudge
  scheduledFor: string;
  status: ReminderStatus;
  skipReason: string | null;
  sentAt: string | null;
}

export interface ReminderRule {
  offsetDays: number;
  enabled: boolean;
}

export type NotificationKind =
  | 'payment_received'
  | 'payment_failed'
  | 'invoice_viewed'
  | 'double_payment'
  | 'overpayment'
  | 'underpayment'
  | 'voided_invoice_paid'
  | 'credential_invalid'
  | 'email_bounced'
  | 'plan_limit'
  | 'subscription';

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  invoiceId: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationPrefs {
  invoiceViewedEmail: boolean;
  invoiceViewedInApp: boolean;
  paymentReceivedEmail: boolean;
  paymentReceivedInApp: boolean;
  paymentFailedEmail: boolean;
  paymentFailedInApp: boolean;
  weeklySummaryEmail: boolean;
}

export interface AuditEntry {
  id: string;
  invoiceId: string | null;
  action: string;
  /** Freelancer-facing sentence. Never contains a Daraja code. */
  message: string;
  createdAt: string;
}

export interface Subscription {
  plan: Plan;
  status: SubStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface SubscriptionCharge {
  id: string;
  amountCents: number;
  mpesaReceiptNumber: string;
  paidAt: string;
  plan: Plan;
}

export interface Usage {
  period: string;
  invoicesSent: number;
  limit: number | null; // null = unlimited
}

export interface DashboardSummary {
  paidThisMonthCents: number;
  paidThisMonthCount: number;
  outstandingCents: number;
  outstandingCount: number;
  overdueCents: number;
  overdueCount: number;
  oldestOverdueDays: number;
  draftCount: number;
  hasAnyInvoice: boolean;
}

export type BannerKind = 'MPESA_NOT_CONNECTED' | 'MPESA_INVALID' | 'EMAIL_UNVERIFIED' | 'PAYMENT_ATTENTION' | 'PAST_DUE' | 'PLAN_NEAR_LIMIT' | 'PROFILE_INCOMPLETE';

export interface Banner {
  kind: BannerKind;
  title: string;
  body: string;
  action: string;
  dismissible: boolean;
  invoiceId?: string;
}

/** What the public invoice endpoint returns — redacted, no internal ids. */
export interface PublicInvoice {
  number: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  currency: 'KES';
  subtotalCents: number;
  discountCents: number;
  taxRateBp: number;
  taxCents: number;
  totalCents: number;
  amountDueCents: number;
  notes: string;
  terms: string;
  lineItems: { description: string; quantityMilli: number; unitPriceCents: number; lineTotalCents: number }[];
  business: { name: string; logoUri: string | null; phone: string | null; email: string | null; location: string | null; kraPin: string | null };
  billedTo: { name: string; email: string | null };
  payment: { mpesaEnabled: boolean; suggestedPhone: string | null };
  paid: null | { mpesaReceiptNumber: string | null; amountCents: number; paidAt: string; payerPhone: string | null; source: PaymentSource };
  inFlight: null | { maskedPhone: string; initiatedAt: string };
}

export type PublicInvoiceResult =
  | { kind: 'ok'; invoice: PublicInvoice }
  | { kind: 'invalid'; businessName: string | null; contactEmail: string | null; contactPhone: string | null };

export interface PaymentStatus {
  attemptStatus: AttemptStatus;
  invoiceStatus: InvoiceStatus | null;
  failureReason: FailureReason | null;
  receipt: null | { mpesaReceiptNumber: string; amountCents: number; paidAt: string; payerPhone: string | null };
  consecutiveFailures: number;
}

export type TimelineEntry = AuditEntry;

export interface InvoiceDetail {
  invoice: Invoice;
  client: Client | null;
  payments: Payment[];
  receipts: Receipt[];
  attempts: PaymentAttempt[];
  timeline: TimelineEntry[];
  reminders: Reminder[];
  pendingAttempt: PaymentAttempt | null;
  banner: null | { kind: 'double_payment' | 'voided_invoice_paid' | 'underpayment' | 'bounced'; text: string };
}
