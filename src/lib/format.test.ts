import { describe, expect, it } from 'vitest';
import {
  addDays, budgetPct, budgetState, calendarDays, dayHeading, fmtBytes, fmtCalDate, fmtDay, fmtDayTime, fmtRange, fmtTime, fmtTimeSec, fromIstInput, greeting,
  groupIndian, humanDuration, inr, istDate, istDayStart, joinNames, parseRupees, personSlug, plural, relativeDay, rupeesInput, slug, toIstInput, waitingLabel,
} from './format';

describe('INR with Indian digit grouping', () => {
  it('groups lakhs and crores the Indian way', () => {
    expect(groupIndian('1')).toBe('1');
    expect(groupIndian('999')).toBe('999');
    expect(groupIndian('1000')).toBe('1,000');
    expect(groupIndian('120450')).toBe('1,20,450');
    expect(groupIndian('12345678')).toBe('1,23,45,678');
    expect(groupIndian('100000000')).toBe('10,00,00,000');
  });

  it('formats paise as rupees, showing paise only when there are some', () => {
    expect(inr(0)).toBe('₹0');
    expect(inr(164000)).toBe('₹1,640');
    expect(inr(12045000)).toBe('₹1,20,450');
    expect(inr(1234567890)).toBe('₹1,23,45,678.90');
    expect(inr(164050)).toBe('₹1,640.50');
    expect(inr(164000, { decimals: true })).toBe('₹1,640.00');
    expect(inr(null)).toBe('₹0');
  });

  it('uses a true minus sign for negative amounts and can drop the symbol', () => {
    expect(inr(-240000)).toBe('−₹2,400');
    expect(inr(-5)).toBe('−₹0.05');
    expect(inr(5000000, { bare: true })).toBe('50,000');
    expect(rupeesInput(5000000)).toBe('50,000');
    expect(rupeesInput(null)).toBe('');
  });

  it('parses typed rupees into paise', () => {
    expect(parseRupees('50,000')).toBe(5000000);
    expect(parseRupees('₹ 1,20,450')).toBe(12045000);
    expect(parseRupees('1640.5')).toBe(164050);
    expect(parseRupees('1640.05')).toBe(164005);
    expect(parseRupees('')).toBeNull();
    expect(parseRupees('12abc')).toBeNull();
    expect(parseRupees('1.234')).toBeNull();
    expect(parseRupees('-5')).toBeNull();
  });
});

describe('IST (UTC+05:30) whatever the browser zone', () => {
  // 2026-10-01T18:45:30Z is 00:15:30 on Fri 2 Oct in India.
  const lateUtc = '2026-10-01T18:45:30Z';

  it('shifts instants to IST, crossing midnight correctly', () => {
    expect(fmtTime(lateUtc)).toBe('00:15');
    expect(fmtTimeSec(lateUtc)).toBe('00:15:30');
    expect(fmtDay(lateUtc)).toBe('Fri 2 Oct');
    expect(fmtDayTime('2026-10-02T08:00:00Z')).toBe('Fri 2 Oct 13:30');
    expect(istDate(lateUtc)).toBe('2026-10-02');
    expect(istDate('2026-10-01T18:29:59Z')).toBe('2026-10-01');
  });

  it('reads API calendar dates as they are (already IST)', () => {
    expect(fmtCalDate('2026-09-22')).toBe('Tue 22 Sep');
    expect(fmtCalDate('2026-09-22', true)).toBe('Tue 22 Sep 2026');
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('converts datetime-local inputs as IST both ways', () => {
    expect(toIstInput('2026-10-02T03:30:00Z')).toBe('2026-10-02T09:00');
    expect(fromIstInput('2026-10-02T09:00')).toBe('2026-10-02T03:30:00.000Z');
    expect(fromIstInput('2026-10-02')).toBeNull();
    expect(new Date(istDayStart('2026-10-02')).toISOString()).toBe('2026-10-01T18:30:00.000Z');
  });

  it('counts inclusive IST calendar days and relative days', () => {
    expect(calendarDays('2026-10-01T03:30:00Z', '2026-10-04T12:30:00Z')).toBe(4);
    expect(calendarDays('2026-10-01T03:30:00Z', '2026-10-01T15:00:00Z')).toBe(1);
    const now = '2026-10-02T09:00:00Z';
    expect(relativeDay('2026-10-02T02:00:00Z', now)).toBe('Today 07:30');
    expect(relativeDay('2026-10-01T15:41:00Z', now)).toBe('Yesterday 21:11');
    expect(relativeDay('2026-09-30T05:00:00Z', now)).toBe('Wed 30 Sep');
    expect(dayHeading('2026-10-02', now)).toBe('Today');
    expect(dayHeading('2026-10-01', now)).toBe('Yesterday');
    expect(dayHeading('2026-09-28', now)).toBe('Mon 28 Sep');
  });

  it('writes ranges, greetings and durations like the prototype', () => {
    expect(fmtRange('2026-10-01T03:30:00Z', '2026-10-04T12:30:00Z')).toBe('Thu 1 Oct 09:00 → Sun 4 Oct 18:00');
    expect(fmtRange('2026-10-03T04:30:00Z', '2026-10-03T11:30:00Z')).toBe('Sat 3 Oct 10:00 → 17:00 · same day');
    expect(greeting('2026-10-02T05:00:00Z')).toBe('Good morning');
    expect(greeting('2026-10-02T08:00:00Z')).toBe('Good afternoon');
    expect(greeting('2026-10-02T13:00:00Z')).toBe('Good evening');
    expect(humanDuration(13 * 3600_000)).toBe('13 h');
    expect(humanDuration((3 * 24 + 20) * 3600_000)).toBe('3 d 20 h');
    expect(humanDuration(65 * 60_000)).toBe('1 h 5 min');
    expect(waitingLabel(8 * 86400_000)).toBe('8 days');
    expect(waitingLabel(18 * 3600_000)).toBe('18 h');
  });
});

describe('small text helpers', () => {
  it('pluralises, joins names and slugs like the server', () => {
    expect(plural(1, 'expense')).toBe('1 expense');
    expect(plural(3, 'expense')).toBe('3 expenses');
    expect(plural(2, 'person', 'people')).toBe('2 people');
    expect(joinNames(['Arjun'])).toBe('Arjun');
    expect(joinNames(['Arjun', 'Divya', 'Karthik'])).toBe('Arjun, Divya and Karthik');
    expect(slug('MedTech Expo · Bengaluru & Mysuru')).toBe('MedTech-Expo-Bengaluru-and-Mysuru');
    expect(personSlug('Suresh Babu')).toBe('suresh-babu');
    expect(fmtBytes(18 * 1024)).toBe('18 KB');
    expect(fmtBytes(1.2 * 1024 * 1024)).toBe('1.2 MB');
  });
});

describe('budget thresholds, as the server states them (FR-BUD-07)', () => {
  it('floors the percentage', () => {
    expect(budgetPct(1907000, 5000000)).toBe(38);
    expect(budgetPct(4999500, 5000000)).toBe(99);
    expect(budgetPct(5000000, 5000000)).toBe(100);
    expect(budgetPct(100, 0)).toBe(0);
  });
  it('is amber from 80% used and over only past the allocation', () => {
    expect(budgetState(3999999, 5000000)).toBe('ok');
    expect(budgetState(4000000, 5000000)).toBe('warn');
    expect(budgetState(5000000, 5000000)).toBe('warn');
    expect(budgetState(5000001, 5000000)).toBe('over');
    expect(budgetState(0, 0)).toBe('ok');
    expect(budgetState(1, 0)).toBe('over');
  });
});
