/**
 * Phone numbers are collected and displayed as 07XX XXX XXX and normalised to
 * 2547XXXXXXXX (or 2541XXXXXXXX) before they reach Daraja. The 254 form never
 * reaches the screen.
 */

export type PhoneResult = { ok: true; value: string } | { ok: false; error: string };

export const PHONE_ERROR = 'Enter a phone number starting 07 or 01';

export function normalisePhone(input: string): PhoneResult {
  const digits = input.replace(/[\s\-()]/g, '');
  let national: string | null = null;
  if (/^\+254\d{9}$/.test(digits)) national = digits.slice(4);
  else if (/^254\d{9}$/.test(digits)) national = digits.slice(3);
  else if (/^0\d{9}$/.test(digits)) national = digits.slice(1);
  else if (/^[71]\d{8}$/.test(digits)) national = digits;
  // Kenyan mobiles are 7XX… and 1XX…; anything else (landlines 020…, 041…) is rejected.
  if (!national || !/^[71]\d{8}$/.test(national)) return { ok: false, error: PHONE_ERROR };
  return { ok: true, value: `254${national}` };
}

export function isValidPhone(input: string): boolean {
  return normalisePhone(input).ok;
}

/** 254712345678 → "0712 345 678". Accepts any input normalisePhone accepts. */
export function displayPhone(canonicalOrInput: string): string {
  const r = normalisePhone(canonicalOrInput);
  if (!r.ok) return canonicalOrInput;
  const local = `0${r.value.slice(3)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

/** "0712 ••• 678" — what P-3 shows so the payer can confirm which phone. */
export function maskPhone(canonical: string): string {
  const d = displayPhone(canonical);
  const parts = d.split(' ');
  if (parts.length !== 3) return d;
  return `${parts[0]} ••• ${parts[2]}`;
}

/** Formats as the user types: "0712345678" → "0712 345 678". */
export function formatPhoneInput(raw: string): string {
  const d = raw.replace(/[^\d+]/g, '');
  if (d.startsWith('+') || d.startsWith('254')) return d;
  const s = d.slice(0, 10);
  if (s.length <= 4) return s;
  if (s.length <= 7) return `${s.slice(0, 4)} ${s.slice(4)}`;
  return `${s.slice(0, 4)} ${s.slice(4, 7)} ${s.slice(7)}`;
}
