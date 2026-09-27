import type { AttemptStatus, FailureReason } from './types';

/**
 * Daraja result code → our failure_reason enum. Engineering Plan T15.
 * Result codes are never rendered to anyone; only the mapped sentences are.
 */
export interface MappedResult {
  status: AttemptStatus;
  reason: FailureReason | null;
}

const TABLE: Record<number, MappedResult> = {
  0: { status: 'SUCCESS', reason: null },
  1: { status: 'FAILED', reason: 'INSUFFICIENT_FUNDS' },
  1032: { status: 'CANCELLED', reason: 'CANCELLED_BY_USER' },
  1037: { status: 'TIMEOUT', reason: 'UNREACHABLE' },
  1019: { status: 'TIMEOUT', reason: 'TIMEOUT' },
  2001: { status: 'FAILED', reason: 'WRONG_PIN' },
  1001: { status: 'FAILED', reason: 'SYSTEM' },
};

export type Logger = { warn: (msg: string) => void };

export function mapResultCode(code: number, logger: Logger = console): MappedResult {
  const hit = TABLE[code];
  if (hit) return hit;
  logger.warn(`Unmapped Daraja result code ${code}; mapped to SYSTEM`);
  return { status: 'FAILED', reason: 'SYSTEM' };
}

/** UX Flow §6, P-5: what the client reads. Every one is followed by "No money left your account." */
export const CLIENT_FAILURE_COPY: Record<FailureReason, { title: string; primary: 'retry' | 'different' }> = {
  CANCELLED_BY_USER: { title: 'You cancelled the request.', primary: 'retry' },
  WRONG_PIN: { title: 'That PIN wasn’t accepted.', primary: 'retry' },
  INSUFFICIENT_FUNDS: { title: 'There isn’t enough in that M-Pesa account.', primary: 'retry' },
  TIMEOUT: { title: 'The prompt expired. It happens — let’s try once more.', primary: 'retry' },
  UNREACHABLE: { title: 'We couldn’t reach that number.', primary: 'different' },
  SYSTEM: { title: 'Something went wrong on M-Pesa’s side. Your money wasn’t taken.', primary: 'retry' },
};

export const NO_MONEY_MOVED = 'No money left your account.';

/** UX Flow §9: what the freelancer sees in the D-5 timeline. */
export const FREELANCER_FAILURE_COPY: Record<FailureReason, string> = {
  CANCELLED_BY_USER: 'Payment cancelled by client',
  WRONG_PIN: 'Payment failed — wrong M-Pesa PIN',
  INSUFFICIENT_FUNDS: 'Payment failed — not enough M-Pesa balance',
  TIMEOUT: 'No response from M-Pesa',
  UNREACHABLE: 'Payment failed — the phone couldn’t be reached',
  SYSTEM: 'Payment failed on M-Pesa’s side',
};
