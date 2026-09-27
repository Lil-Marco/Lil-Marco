import { describe, expect, it } from 'vitest';
import { applyBp, formatKes, fromKes, lineTotal, parseQuantity, toKes, toWholeShillings } from '../src/domain/money';
import { displayPhone, maskPhone, normalisePhone } from '../src/domain/phone';
import { computeTotals, totalsReconcile } from '../src/domain/totals';

describe('money (Engineering Plan T02)', () => {
  it('formats KES exactly', () => {
    expect(formatKes(1250000)).toBe('KES 12,500.00');
    expect(formatKes(48000)).toBe('KES 480.00');
    expect(formatKes(5)).toBe('KES 0.05');
  });

  it('applyBp returns an integer, half-up', () => {
    expect(applyBp(333, 1600)).toBe(53);
    expect(Number.isInteger(applyBp(12345, 1600))).toBe(true);
  });

  it('round-trips 10,000 random cent values', () => {
    for (let i = 0; i < 10000; i++) {
      const c = Math.floor(Math.random() * 2_000_000_000);
      expect(fromKes(toKes(c))).toBe(c);
    }
  });

  it('parses typed amounts', () => {
    expect(fromKes('12,500')).toBe(1250000);
    expect(fromKes('KES 1,200.5')).toBe(120050);
    expect(() => fromKes('12.345')).toThrow();
    expect(() => fromKes('abc')).toThrow();
  });

  it('rounds once at the line (T21)', () => {
    expect(lineTotal(parseQuantity('1.5')!, fromKes('333.33'))).toBe(50000);
  });

  it('sends whole shillings to Daraja (T11)', () => {
    expect(toWholeShillings(1250050)).toBe(12500);
  });
});

describe('phone', () => {
  it.each(['0712345678', '+254712345678', '254712345678', '0712 345 678', '0110 123 456'])('accepts %s', (p) => {
    expect(normalisePhone(p).ok).toBe(true);
  });

  it('normalises to 2547…', () => {
    expect(normalisePhone('0712 345 678')).toEqual({ ok: true, value: '254712345678' });
  });

  it.each(['0202345678', '071234567', '12345'])('rejects %s', (p) => {
    expect(normalisePhone(p).ok).toBe(false);
  });

  it('displays and masks without ever showing 254', () => {
    expect(displayPhone('254712345678')).toBe('0712 345 678');
    expect(maskPhone('254712345678')).toBe('0712 ••• 678');
  });
});

describe('totals', () => {
  it('reconcile with discount and VAT', () => {
    const t = computeTotals(
      [
        { quantityMilli: 1500, unitPriceCents: 33333 },
        { quantityMilli: 5000, unitPriceCents: 50000 },
      ],
      'PERCENT',
      1000,
      1600,
    );
    expect(totalsReconcile(t)).toBe(true);
    expect(t.subtotalCents).toBe(50000 + 250000);
    expect(t.discountCents).toBe(30000);
    expect(t.taxCents).toBe(43200);
    expect(t.totalCents).toBe(313200);
  });
});
