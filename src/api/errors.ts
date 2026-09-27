/** TDD §6.4 — one error shape everywhere. `code` is what the UI switches on; `message` is safe to show. */
export type ApiErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'NOT_FOUND'
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'LOCKED'
  | 'TOKEN_EXPIRED'
  | 'CLIENT_EMAIL_TAKEN'
  | 'CLIENT_HAS_INVOICES'
  | 'INVOICE_NOT_EDITABLE'
  | 'INVOICE_NOT_PAYABLE'
  | 'INVOICE_ALREADY_PAID'
  | 'ATTEMPT_IN_PROGRESS'
  | 'MPESA_NOT_CONNECTED'
  | 'MPESA_CREDENTIALS_INVALID'
  | 'MPESA_KEYS_REJECTED'
  | 'MPESA_UNAVAILABLE'
  | 'PLAN_LIMIT_REACHED'
  | 'INVALID_PHONE_NUMBER'
  | 'RATE_LIMITED'
  | 'REMINDED_TODAY'
  | 'NETWORK';

export class ApiError extends Error {
  code: ApiErrorCode;
  details: Record<string, string> | null;
  meta: Record<string, unknown>;
  requestId: string;

  constructor(code: ApiErrorCode, message: string, details: Record<string, string> | null = null, meta: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
    this.meta = meta;
    this.requestId = Math.random().toString(36).slice(2, 10).toUpperCase();
  }
}

export function isApiError(e: unknown, code?: ApiErrorCode): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code);
}
