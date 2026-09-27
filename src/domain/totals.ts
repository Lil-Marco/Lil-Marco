import { applyBp, cents, lineTotal } from './money';
import type { DiscountMode } from './types';

export const VAT_BP = 1600;

export interface LineInput {
  quantityMilli: number;
  unitPriceCents: number;
}

export interface Totals {
  lineTotals: number[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}

/**
 * Line totals are rounded once, at the line. Subtotal, discount and VAT are then
 * integer arithmetic on already-rounded cents; the total is never rounded again.
 * Invariant: total = subtotal − discount + tax.
 */
export function computeTotals(
  lines: LineInput[],
  discountMode: DiscountMode,
  discountInput: number,
  taxRateBp: number,
): Totals {
  const lineTotals = lines.map((l) => lineTotal(l.quantityMilli, l.unitPriceCents));
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);
  let discount = discountMode === 'PERCENT' ? applyBp(subtotal, Math.max(0, Math.min(10000, discountInput))) : Math.max(0, discountInput);
  discount = Math.min(discount, subtotal);
  const taxable = subtotal - discount;
  const tax = taxRateBp > 0 ? applyBp(taxable, taxRateBp) : 0;
  const total = taxable + tax;
  return {
    lineTotals,
    subtotalCents: cents(subtotal),
    discountCents: cents(discount),
    taxCents: cents(tax),
    totalCents: cents(total),
  };
}

export function totalsReconcile(t: { subtotalCents: number; discountCents: number; taxCents: number; totalCents: number }): boolean {
  return t.totalCents === t.subtotalCents - t.discountCents + t.taxCents;
}
