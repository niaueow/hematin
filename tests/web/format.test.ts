import { describe, expect, it } from 'vitest';
import { parseLocalDate } from '@server/budget/periods';
import {
  formatDate,
  formatDayLabel,
  formatDayRange,
  formatPercent,
  formatPeriod,
  formatRupiah,
  formatRupiahShort,
  parseRupiah,
  today,
  weekdayShort,
} from '@web/lib/format';

// web/src/lib/format.ts: the one place the SPA formats money and WIB dates.

const d = parseLocalDate;

describe('money', () => {
  it('formatRupiah is the bot’s', () => {
    expect(formatRupiah(35_000)).toBe('Rp35.000');
    expect(formatRupiah(-12_000)).toBe('-Rp12.000');
  });

  it.each([
    [0, '0'],
    [500, '500'],
    [999, '999'],
    [1_000, '1rb'],
    [1_500, '1,5rb'],
    [35_000, '35rb'],
    [35_400, '35,4rb'],
    [999_949, '999,9rb'],
    [1_000_000, '1jt'],
    [1_200_000, '1,2jt'],
    [1_250_000, '1,3jt'], // rounded to one decimal
    [2_000_000, '2jt'],
    [15_000_000, '15jt'],
    [1_500_000_000, '1,5M'],
    [-35_000, '-35rb'],
  ])('formatRupiahShort(%i) → %s', (amount, expected) => {
    expect(formatRupiahShort(amount)).toBe(expected);
  });

  it('formatRupiahShort only takes integer rupiah', () => {
    expect(() => formatRupiahShort(1.5)).toThrow(RangeError);
  });

  it.each([
    ['Rp35.000', 35_000],
    ['1500000', 1_500_000],
    ['00012', 12],
    ['abc', null],
  ])('parseRupiah(%j) → %j', (text, expected) => {
    expect(parseRupiah(text)).toBe(expected);
  });

  it('formatPercent', () => expect(formatPercent(65)).toBe('65%'));
});

describe('dates (WIB)', () => {
  it('today is the WIB date, not UTC', () => {
    expect(today(new Date('2026-10-31T17:30:00.000Z'))).toBe('2026-11-01'); // 00:30 WIB
    expect(today(new Date('2026-10-31T16:30:00.000Z'))).toBe('2026-10-31'); // 23:30 WIB
  });

  it.each([
    ['2026-11-02', {}, '2 Nov'],
    ['2026-01-31', { year: true }, '31 Jan 2026'],
    ['2026-08-09', {}, '9 Agu'],
  ] as const)('formatDate(%s, %j) → %s', (date, options, expected) => {
    expect(formatDate(date, options)).toBe(expected);
  });

  it.each([
    ['2026-11-11', 'Hari ini'],
    ['2026-11-10', 'Kemarin'],
    ['2026-11-02', 'Sen, 2 Nov'],
    ['2026-11-08', 'Min, 8 Nov'],
    ['2025-12-31', 'Rab, 31 Des 2025'], // another year
    ['2026-11-12', 'Kam, 12 Nov'], // a future date isn't "Besok", just the date
  ])('formatDayLabel(%s) on Wed 11 Nov 2026 → %s', (date, expected) => {
    expect(formatDayLabel(date, d('2026-11-11'))).toBe(expected);
  });

  it('"Kemarin" across a month boundary', () => {
    expect(formatDayLabel('2026-10-31', d('2026-11-01'))).toBe('Kemarin');
  });

  it.each([
    ['week', '2026-11-02', '2026-11-08', '2–8 Nov 2026'],
    ['week', '2026-10-26', '2026-11-01', '26 Okt – 1 Nov 2026'],
    ['week', '2025-12-29', '2026-01-04', '29 Des 2025 – 4 Jan 2026'],
    ['month', '2026-11-01', '2026-11-30', 'November 2026'],
    ['year', '2026-01-01', '2026-12-31', '2026'],
  ] as const)('formatPeriod(%s, %s…%s) → %s', (period, start, end, expected) => {
    expect(formatPeriod(period, { start, end })).toBe(expected);
  });

  it('formatDayRange and weekdayShort', () => {
    expect(formatDayRange('2026-11-02', '2026-11-08')).toBe('2–8');
    expect(formatDayRange('2026-11-01', '2026-11-01')).toBe('1');
    expect(['2026-11-02', '2026-11-08'].map(weekdayShort)).toEqual(['Sen', 'Min']);
  });

  it('rejects dates that don’t exist', () => {
    expect(() => formatDate('2026-02-30')).toThrow(RangeError);
  });
});
