/**
 * Formatting for the console: money is integer paise shown as INR with Indian digit grouping,
 * and every instant is shown in IST (UTC+05:30, no daylight saving) whatever the browser's zone (NFR-10).
 */

const IST_OFFSET_MS = 330 * 60 * 1000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Groups the rupee part the Indian way: 1,20,450. */
export function groupIndian(intDigits: string): string {
  const last3 = intDigits.slice(-3);
  const rest = intDigits.slice(0, -3);
  return rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
}

export interface InrOptions {
  /** Always show two decimals (₹1,640.00). By default paise show only when there are some. */
  decimals?: boolean;
  /** Leave out the ₹ sign, for inputs that carry their own prefix. */
  bare?: boolean;
}

/** ₹1,20,450 from 12045000 paise; negative amounts use a true minus sign. */
export function inr(paise: number | null | undefined, o: InrOptions = {}): string {
  const v = Math.round(Number(paise ?? 0));
  const neg = v < 0;
  const abs = Math.abs(v);
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const dec = o.decimals || p ? '.' + String(p).padStart(2, '0') : '';
  return (neg ? '−' : '') + (o.bare ? '' : '₹') + groupIndian(String(rupees)) + dec;
}

/** Parses what a person typed as rupees ("50,000", "1640.5", "₹ 1,20,450") into paise; null when it isn't a number. */
export function parseRupees(input: string): number | null {
  const s = input.replace(/[₹,\s]/g, '').trim();
  if (!s) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [r, d = ''] = s.split('.');
  return Number(r) * 100 + Number((d + '00').slice(0, 2));
}

/** Rupees for an input box, grouped, no sign: 50000 paise -> "500", 5000000 -> "50,000". */
export function rupeesInput(paise: number | null | undefined): string {
  if (paise == null) return '';
  return inr(paise, { bare: true });
}

/** Rounded percentage, 0 when there is nothing to divide by. */
export function pct(a: number, b: number): number {
  return b > 0 ? Math.round((a / b) * 100) : 0;
}

/** Budget use as the server states it: floored, so 99.6% never reads as 100%. */
export function budgetPct(spent: number, allocated: number): number {
  return allocated > 0 ? Math.floor((spent * 100) / allocated) : 0;
}

/**
 * Budget state on exact amounts (FR-BUD-07), matching the server: amber from 80% used, and over only once
 * spending passes the allocation. Exactly 100% is "fully used", still amber.
 */
export function budgetState(spent: number, allocated: number): 'ok' | 'warn' | 'over' {
  if (allocated <= 0) return spent > 0 ? 'over' : 'ok';
  if (spent > allocated) return 'over';
  return spent * 100 >= allocated * 80 ? 'warn' : 'ok';
}

/* ---------------- IST dates and times ---------------- */

type DateIn = string | number | Date;
const toMs = (d: DateIn) => (d instanceof Date ? d.getTime() : typeof d === 'number' ? d : new Date(d).getTime());

export interface IstParts { y: number; mo: number; d: number; wd: number; h: number; mi: number; s: number }

/** Calendar parts of an instant in IST. */
export function istParts(d: DateIn): IstParts {
  const x = new Date(toMs(d) + IST_OFFSET_MS);
  return { y: x.getUTCFullYear(), mo: x.getUTCMonth(), d: x.getUTCDate(), wd: x.getUTCDay(), h: x.getUTCHours(), mi: x.getUTCMinutes(), s: x.getUTCSeconds() };
}

const two = (n: number) => String(n).padStart(2, '0');

/** "09:05" */
export function fmtTime(d: DateIn): string {
  const p = istParts(d);
  return `${two(p.h)}:${two(p.mi)}`;
}
/** "09:05:12" */
export function fmtTimeSec(d: DateIn): string {
  const p = istParts(d);
  return `${two(p.h)}:${two(p.mi)}:${two(p.s)}`;
}
/** "Fri 2 Oct" */
export function fmtDay(d: DateIn): string {
  const p = istParts(d);
  return `${WEEKDAYS[p.wd]} ${p.d} ${MONTHS[p.mo]}`;
}
/** "Fri 2 Oct 13:30" */
export function fmtDayTime(d: DateIn): string {
  return `${fmtDay(d)} ${fmtTime(d)}`;
}
/** "Fri 2 Oct, 13:30" */
export function fmtDayTimeComma(d: DateIn): string {
  return `${fmtDay(d)}, ${fmtTime(d)}`;
}
/** "2 Oct 13:30" (no weekday), used where space is tight. */
export function fmtShortDayTime(d: DateIn): string {
  const p = istParts(d);
  return `${p.d} ${MONTHS[p.mo]} ${fmtTime(d)}`;
}
/** "2 Oct 2026" */
export function fmtDate(d: DateIn): string {
  const p = istParts(d);
  return `${p.d} ${MONTHS[p.mo]} ${p.y}`;
}
/** "Fri 2 Oct 2026" */
export function fmtDayYear(d: DateIn): string {
  const p = istParts(d);
  return `${WEEKDAYS[p.wd]} ${p.d} ${MONTHS[p.mo]} ${p.y}`;
}
/** "Friday 2 October" */
export function fmtLongDay(d: DateIn): string {
  const p = istParts(d);
  return `${WEEKDAYS_LONG[p.wd]} ${p.d} ${MONTHS_LONG[p.mo]}`;
}
/** Month name of an instant in IST: "October" */
export function fmtMonth(d: DateIn): string {
  return MONTHS_LONG[istParts(d).mo];
}

/** IST calendar date "2026-10-02" of an instant. */
export function istDate(d: DateIn): string {
  return new Date(toMs(d) + IST_OFFSET_MS).toISOString().slice(0, 10);
}
/** Today's IST calendar date. */
export function istToday(now: DateIn = Date.now()): string {
  return istDate(now);
}
/** A calendar date from the API ("2026-09-22", already IST) as "Tue 22 Sep". */
export function fmtCalDate(day: string, withYear = false): string {
  const [y, m, d] = day.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[x.getUTCDay()]} ${d} ${MONTHS[m - 1]}` + (withYear ? ` ${y}` : '');
}
/** "22 Sep" from "2026-09-22". */
export function fmtCalShort(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}
/** Adds days to an IST calendar date. */
export function addDays(day: string, n: number): string {
  const t = new Date(`${day}T00:00:00Z`).getTime() + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
/** Start of an IST calendar day as a UTC instant (ms). */
export function istDayStart(day: string): number {
  return new Date(`${day}T00:00:00Z`).getTime() - IST_OFFSET_MS;
}
/** Value for an <input type="datetime-local"> showing the instant in IST. */
export function toIstInput(d: DateIn): string {
  const p = istParts(d);
  return `${p.y}-${two(p.mo + 1)}-${two(p.d)}T${two(p.h)}:${two(p.mi)}`;
}
/** Reads an <input type="datetime-local"> value as IST and returns the ISO instant; null if incomplete. */
export function fromIstInput(v: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - IST_OFFSET_MS;
  return new Date(utc).toISOString();
}

/** Inclusive IST calendar days between two instants: 1 Oct to 4 Oct is 4 days (FR-END-08). */
export function calendarDays(a: DateIn, b: DateIn): number {
  const d1 = new Date(`${istDate(a)}T00:00:00Z`).getTime();
  const d2 = new Date(`${istDate(b)}T00:00:00Z`).getTime();
  return Math.round((d2 - d1) / 86400000) + 1;
}

/** "13 h", "3 d 20 h", "1 h 5 min", "50 min", the same shapes the server writes. */
export function humanDuration(ms: number): string {
  const m = Math.round(Math.abs(ms) / 60000);
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d) return `${d} d ${h} h`;
  if (h) return mm ? `${h} h ${mm} min` : `${h} h`;
  return `${mm} min`;
}

/** How long a claim has waited, as a badge: "8 days", "1 day", "18 h", "35 min". */
export function waitingLabel(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m >= 1440 * 2) return `${Math.floor(m / 1440)} days`;
  if (m >= 1440) return '1 day';
  if (m >= 60) return `${Math.floor(m / 60)} h`;
  return `${m} min`;
}

/** "Today 13:31", "Yesterday 21:11", or "Wed 30 Sep" for anything older. */
export function relativeDay(d: DateIn, now: DateIn = Date.now(), withTime = true): string {
  const day = istDate(d), today = istDate(now);
  if (day === today) return withTime ? `Today ${fmtTime(d)}` : 'Today';
  if (day === addDays(today, -1)) return withTime ? `Yesterday ${fmtTime(d)}` : 'Yesterday';
  return fmtDay(d);
}

/** Heading for a group of events on one IST day. */
export function dayHeading(day: string, now: DateIn = Date.now()): string {
  const today = istDate(now);
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  return fmtCalDate(day);
}

/** "Thu 1 Oct 09:00 → Sun 4 Oct 18:00", or "Sat 3 Oct 10:00 → 17:00 · same day". */
export function fmtRange(start: DateIn, end: DateIn): string {
  if (istDate(start) === istDate(end)) return `${fmtDayTime(start)} → ${fmtTime(end)} · same day`;
  return `${fmtDayTime(start)} → ${fmtDayTime(end)}`;
}

/** "Good morning" before noon IST, "Good afternoon" until 17:00, then "Good evening". */
export function greeting(now: DateIn = Date.now()): string {
  const h = istParts(now).h;
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** File sizes: 18 KB, 1.2 MB. */
export function fmtBytes(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${Math.round(v / 1024)} KB`;
  if (v < 1024 * 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} MB`;
  return `${(v / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** "1 expense" / "3 expenses". */
export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** First name for friendly copy: "Arjun". */
export const firstName = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] ?? '';

/** Initials for avatars: "AM". */
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();

/** Joins names the way the copy reads: "Arjun", "Arjun and Divya", "Arjun, Divya and Karthik". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

/** File-name safe slug, like the server's: "MedTech Expo · Bengaluru" -> "MedTech-Expo-Bengaluru". */
export function slug(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
/** URL slug for a person: "Suresh Babu" -> "suresh-babu". */
export const personSlug = (name: string) => slug(name).toLowerCase();
