import type { Invoice } from './types';

export type InvoiceAction = 'view' | 'edit' | 'copyLink' | 'remind' | 'duplicate' | 'markPaid' | 'void' | 'delete';

const UNPAID_SENT = new Set(['SENT', 'VIEWED', 'OVERDUE']);

/**
 * UX Flow §7, D-2 row menu. Entries are HIDDEN, not disabled, when they don't apply:
 * Edit disappears once a payment has succeeded, Delete exists only for drafts,
 * Void and Send reminder only for sent-and-unpaid, Mark as paid only for unpaid.
 */
export function availableActions(inv: Pick<Invoice, 'status' | 'amountPaidCents'>): InvoiceAction[] {
  const out: InvoiceAction[] = ['view'];
  const unpaidSent = UNPAID_SENT.has(inv.status);
  if ((inv.status === 'DRAFT' || unpaidSent) && inv.amountPaidCents === 0) out.push('edit');
  if (inv.status !== 'DRAFT' && inv.status !== 'VOID') out.push('copyLink');
  if (unpaidSent) out.push('remind');
  out.push('duplicate');
  if (unpaidSent) out.push('markPaid');
  if (unpaidSent) out.push('void');
  if (inv.status === 'DRAFT') out.push('delete');
  return out;
}

export function canRemindNow(inv: Pick<Invoice, 'lastReminderAt'>, now = new Date()): boolean {
  return !inv.lastReminderAt || now.getTime() - new Date(inv.lastReminderAt).getTime() >= 24 * 3600 * 1000;
}
