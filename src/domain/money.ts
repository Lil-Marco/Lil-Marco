/**
 * Money primitives. Engineering Plan T02 / Global constraints:
 * integer cents everywhere, no float ever leaves this module,
 * rounding is half-up and applied once, at the line-item level only.
 */

declare const centsBrand: unique symbol;
/** An integer number of KES cents. */
export type Cents = number & { readonly [centsBrand]: true };

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

export function cents(n: number): Cents {
  if (!Number.isSafeInteger(n)) throw new MoneyError(`Not an integer cent value: ${n}`);
  return n as Cents;
}

/**
 * Parse a user-typed KES string ("12,500", "12500.5", "KES 1,200.00") into cents.
 * Uses string arithmetic so no float is ever involved.
 */
export function fromKes(input: string): Cents {
  const cleaned = input.trim().replace(/^KES\s*/i, '').replace(/[,\s]/g, '');
  const m = /^(-)?(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!m) throw new MoneyError(`Not a KES amount: "${input}"`);
  const whole = parseInt(m[2], 10);
  const frac = parseInt((m[3] ?? '').padEnd(2, '0') || '0', 10);
  const value = whole * 100 + frac;
  return cents(m[1] ? -value : value);
}

/** Try to parse; returns null instead of throwing. */
export function tryFromKes(input: string): Cents | null {
  try {
    return fromKes(input);
  } catch {
    return null;
  }
}

/** Plain decimal string without grouping: 1250050 → "12500.50". */
export function toKes(c: number): string {
  const v = cents(c);
  const neg = v < 0;
  const abs = Math.abs(v);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${neg ? '-' : ''}${whole}.${frac}`;
}

function group(whole: number): string {
  return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Digits only, grouped, two decimals: 1250000 → "12,500.00". */
export function formatKesDigits(c: number): string {
  const v = cents(c);
  const abs = Math.abs(v);
  return `${v < 0 ? '-' : ''}${group(Math.floor(abs / 100))}.${String(abs % 100).padStart(2, '0')}`;
}

/** The one product-wide money format: 1250000 → "KES 12,500.00". */
export function formatKes(c: number): string {
  return `KES ${formatKesDigits(c)}`;
}

/** Short form used in stat cards and toasts: "KES 12,500" (drops .00 only). */
export function formatKesShort(c: number): string {
  const s = formatKesDigits(c);
  return `KES ${s.endsWith('.00') ? s.slice(0, -3) : s}`;
}

/** Integer division rounded half-up (away from zero for positives). */
export function divRoundHalfUp(numerator: number, denominator: number): number {
  if (denominator <= 0) throw new MoneyError('Denominator must be positive');
  const sign = numerator < 0 ? -1 : 1;
  const abs = Math.abs(numerator);
  return sign * Math.floor((abs * 2 + denominator) / (denominator * 2));
}

/** Apply basis points (1600 = 16%) to a cent amount, half-up. applyBp(333, 1600) === 53. */
export function applyBp(c: number, bp: number): Cents {
  return cents(divRoundHalfUp(cents(c) * bp, 10000));
}

/**
 * Line total: quantity in thousandths × unit price in cents, rounded once here.
 * 1.5 units (1500) × KES 333.33 (33333) = 49999.5 → 50000.
 */
export function lineTotal(quantityMilli: number, unitPriceCents: number): Cents {
  return cents(divRoundHalfUp(quantityMilli * unitPriceCents, 1000));
}

/** Whole shillings for Daraja (amount is an integer KES). Rounds down — never charge more. */
export function toWholeShillings(c: number): number {
  return Math.floor(cents(c) / 100);
}

/** Parse a user-typed quantity ("1.5") into thousandths. */
export function parseQuantity(input: string): number | null {
  const m = /^(\d+)(?:\.(\d{0,3}))?$/.exec(input.trim());
  if (!m) return null;
  const v = parseInt(m[1], 10) * 1000 + parseInt((m[2] ?? '').padEnd(3, '0') || '0', 10);
  return v > 0 ? v : null;
}

export function formatQuantity(milli: number): string {
  const whole = Math.floor(milli / 1000);
  const frac = milli % 1000;
  if (frac === 0) return String(whole);
  return `${whole}.${String(frac).padStart(3, '0').replace(/0+$/, '')}`;
}
