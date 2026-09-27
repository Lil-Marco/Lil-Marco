/**
 * Time is stored as ISO-8601 UTC. It is displayed in EAT (UTC+3, no DST).
 * Formats: "6 Oct 2026" and "2 Oct 2026, 4:12 PM". Relative time only in the
 * activity timeline.
 */

export const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_MS = 24 * 60 * 60 * 1000;

/** A Date whose UTC fields read as EAT wall-clock time. */
function eatParts(iso: string | Date) {
  const t = (typeof iso === 'string' ? new Date(iso) : iso).getTime() + EAT_OFFSET_MS;
  const d = new Date(t);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth(),
    day: d.getUTCDate(),
    h: d.getUTCHours(),
    min: d.getUTCMinutes(),
  };
}

/** Today's calendar date in Nairobi as YYYY-MM-DD. */
export function todayEat(now: Date = new Date()): string {
  const p = eatParts(now);
  return `${p.y}-${String(p.m + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + days * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** Whole days from a to b (date strings). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
}

/** "2026-10-06" → "6 Oct 2026". */
export function formatDate(date: string): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** ISO timestamp → "2 Oct 2026, 4:12 PM" in EAT. */
export function formatDateTime(iso: string): string {
  const p = eatParts(iso);
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  const ampm = p.h < 12 ? 'AM' : 'PM';
  return `${p.day} ${MONTHS[p.m]} ${p.y}, ${h12}:${String(p.min).padStart(2, '0')} ${ampm}`;
}

/** ISO timestamp → "4:12 PM" in EAT. */
export function formatTime(iso: string): string {
  const p = eatParts(iso);
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  return `${h12}:${String(p.min).padStart(2, '0')} ${p.h < 12 ? 'AM' : 'PM'}`;
}

/** "3 hours ago" — activity timeline only. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const s = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return formatDateTime(iso);
}

/** "in 6 days" / "today" / "4 days ago" for the D-2 due column. */
export function dueRelative(dueDate: string, now: Date = new Date()): string {
  const diff = daysBetween(todayEat(now), dueDate);
  if (diff === 0) return 'due today';
  if (diff === 1) return 'due tomorrow';
  if (diff > 0) return `in ${diff} days`;
  if (diff === -1) return '1 day ago';
  return `${-diff} days ago`;
}

/**
 * Plan-usage period key: the calendar month in Africa/Nairobi, never UTC.
 * A send at 02:00 EAT on the 1st lands in the new month.
 */
export function periodKeyEat(now: Date = new Date()): string {
  const p = eatParts(now);
  return `${p.y}-${String(p.m + 1).padStart(2, '0')}`;
}

/** "1 November" — the date the monthly cap resets. */
export function nextPeriodStartLabel(now: Date = new Date()): string {
  const p = eatParts(now);
  const next = (p.m + 1) % 12;
  return `1 ${MONTHS_LONG[next]}`;
}

/** EAT wall-clock hour (0-23) of an instant. */
export function eatHour(iso: string | Date): number {
  return eatParts(iso).h;
}

/** Build a UTC ISO instant from an EAT calendar date and hour. */
export function eatDateHourToIso(date: string, hour: number, minute = 0): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour, minute) - EAT_OFFSET_MS).toISOString();
}

/** EAT calendar date (YYYY-MM-DD) of an instant. */
export function eatDate(iso: string | Date): string {
  return todayEat(typeof iso === 'string' ? new Date(iso) : iso);
}

/**
 * Reminders send between 08:00 and 18:00 EAT. Anything outside waits for the
 * next window: before 08:00 → 08:00 the same day; at/after 18:00 → 08:00 next day.
 */
export function shiftIntoSendWindow(iso: string): string {
  const h = eatHour(iso);
  const date = eatDate(iso);
  if (h < 8) return eatDateHourToIso(date, 8);
  if (h >= 18) return eatDateHourToIso(addDays(date, 1), 8);
  return iso;
}
