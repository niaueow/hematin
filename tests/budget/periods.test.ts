import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  daysBetween,
  daysInMonth,
  isoWeekday,
  localDateFromDb,
  localDateToDb,
  monthEnd,
  monthOf,
  monthRange,
  monthStart,
  noonWib,
  parseLocalDate,
  remainingDays,
  segmentOf,
  segmentsOfMonth,
  startOfDayWib,
  toLocalDate,
  todayWib,
  weekOf,
  type MonthKey,
} from '@server/budget/periods.js';

describe('toLocalDate (WIB)', () => {
  // BUDGET_RULES §9 item 9, plus the exact edges around WIB midnight (17:00 UTC).
  it.each([
    ['23:30 WIB on the 31st belongs to the 31st', '2026-10-31T16:30:00.000Z', '2026-10-31'],
    ['00:30 WIB on the 1st belongs to the 1st', '2026-10-31T17:30:00.000Z', '2026-11-01'],
    ['last millisecond before WIB midnight', '2026-10-31T16:59:59.999Z', '2026-10-31'],
    ['WIB midnight exactly', '2026-10-31T17:00:00.000Z', '2026-11-01'],
    ['year boundary', '2026-12-31T17:00:00.000Z', '2027-01-01'],
    ['still the old year in WIB', '2026-12-31T16:59:59.999Z', '2026-12-31'],
    ['leap day', '2028-02-28T17:00:00.000Z', '2028-02-29'],
    ['UTC midnight is 07:00 WIB the same day', '2026-11-30T00:00:00.000Z', '2026-11-30'],
  ])('%s', (_name, instant, expected) => {
    expect(toLocalDate(new Date(instant))).toBe(expected);
  });

  it('rejects an invalid Date', () => {
    expect(() => toLocalDate(new Date('nope'))).toThrow(RangeError);
  });
});

describe('parseLocalDate', () => {
  it.each(['2026-11-01', '2028-02-29'])('accepts %s', (value) => {
    expect(parseLocalDate(value)).toBe(value);
  });

  it.each(['2026-02-29', '2026-13-01', '2026-11-31', '2026-1-01', '01-11-2026', ''])('rejects %j', (value) => {
    expect(() => parseLocalDate(value)).toThrow(RangeError);
  });
});

describe('DATE column round trip', () => {
  it.each(['2026-11-01', '2026-12-31', '2028-02-29'])('%s survives localDateToDb → localDateFromDb', (value) => {
    const date = parseLocalDate(value);
    expect(localDateToDb(date).toISOString()).toBe(`${value}T00:00:00.000Z`);
    expect(localDateFromDb(localDateToDb(date))).toBe(value);
  });
});

describe('segmentsOfMonth (BUDGET_RULES §3, §9 item 1)', () => {
  // [start, end, days] per segment, worked out by hand from a calendar.
  it.each([
    [
      'Nov 2026: 1-day first and last segments',
      '2026-11',
      [
        ['2026-11-01', '2026-11-01', 1],
        ['2026-11-02', '2026-11-08', 7],
        ['2026-11-09', '2026-11-15', 7],
        ['2026-11-16', '2026-11-22', 7],
        ['2026-11-23', '2026-11-29', 7],
        ['2026-11-30', '2026-11-30', 1],
      ],
    ],
    [
      'Feb 2026 (28 days, starts on Sunday)',
      '2026-02',
      [
        ['2026-02-01', '2026-02-01', 1],
        ['2026-02-02', '2026-02-08', 7],
        ['2026-02-09', '2026-02-15', 7],
        ['2026-02-16', '2026-02-22', 7],
        ['2026-02-23', '2026-02-28', 6],
      ],
    ],
    [
      'Feb 2028 (leap year, starts on Tuesday)',
      '2028-02',
      [
        ['2028-02-01', '2028-02-06', 6],
        ['2028-02-07', '2028-02-13', 7],
        ['2028-02-14', '2028-02-20', 7],
        ['2028-02-21', '2028-02-27', 7],
        ['2028-02-28', '2028-02-29', 2],
      ],
    ],
    [
      'Jun 2026 (starts on Monday)',
      '2026-06',
      [
        ['2026-06-01', '2026-06-07', 7],
        ['2026-06-08', '2026-06-14', 7],
        ['2026-06-15', '2026-06-21', 7],
        ['2026-06-22', '2026-06-28', 7],
        ['2026-06-29', '2026-06-30', 2],
      ],
    ],
  ] as const)('%s', (_name, month, expected) => {
    const segments = segmentsOfMonth(month as MonthKey);
    expect(segments.map((s) => [s.start, s.end, s.days])).toEqual(expected);
    expect(segments.map((s) => s.index)).toEqual(expected.map((_, i) => i));
  });

  it('covers every day of every month in 2026–2028 exactly once, Mon–Sun aligned', () => {
    for (const month of monthRange('2026-01' as MonthKey, '2028-12' as MonthKey)) {
      const segments = segmentsOfMonth(month);
      expect(segments.reduce((n, s) => n + s.days, 0)).toBe(daysInMonth(month));
      expect(segments[0]?.start).toBe(monthStart(month));
      expect(segments.at(-1)?.end).toBe(monthEnd(month));
      for (const [i, s] of segments.entries()) {
        if (i > 0) expect(isoWeekday(s.start)).toBe(1);
        if (i < segments.length - 1) expect(isoWeekday(s.end)).toBe(7);
      }
    }
  });
});

describe('calendar helpers', () => {
  it.each([
    ['2026-11-11', { start: '2026-11-09', end: '2026-11-15' }],
    ['2026-11-01', { start: '2026-10-26', end: '2026-11-01' }],
    ['2026-11-30', { start: '2026-11-30', end: '2026-12-06' }],
    ['2027-01-01', { start: '2026-12-28', end: '2027-01-03' }],
  ])('weekOf(%s) is the Mon–Sun week around it', (date, expected) => {
    expect(weekOf(parseLocalDate(date))).toEqual(expected);
  });

  it.each([
    ['2026-11-11', '2026-11-09', 5], // the §8 example: Wed → Sun
    ['2026-11-15', '2026-11-09', 1], // Sunday: last day of the segment
    ['2026-11-30', '2026-11-30', 1],
  ])('remainingDays from %s in the segment starting %s = %i', (today, segmentStart, expected) => {
    const segment = segmentOf(parseLocalDate(today));
    expect(segment.start).toBe(segmentStart);
    expect(remainingDays(segment, parseLocalDate(today))).toBe(expected);
  });

  it('month and day arithmetic', () => {
    expect(addMonths('2026-12' as MonthKey, 1)).toBe('2027-01');
    expect(addMonths('2026-01' as MonthKey, -1)).toBe('2025-12');
    expect(monthRange('2026-11' as MonthKey, '2027-02' as MonthKey)).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
    expect(monthRange('2026-12' as MonthKey, '2026-11' as MonthKey)).toEqual([]);
    expect(daysInMonth('2026-02' as MonthKey)).toBe(28);
    expect(daysInMonth('2028-02' as MonthKey)).toBe(29);
    expect(addDays(parseLocalDate('2028-02-28'), 1)).toBe('2028-02-29');
    expect(daysBetween(parseLocalDate('2026-11-30'), parseLocalDate('2026-11-01'))).toBe(-29);
    expect(monthOf(parseLocalDate('2026-11-30'))).toBe('2026-11');
  });

  it('startOfDayWib is 00:00 WIB (17:00 UTC the day before)', () => {
    const start = startOfDayWib(parseLocalDate('2026-12-01'));
    expect(start.toISOString()).toBe('2026-11-30T17:00:00.000Z');
    expect(toLocalDate(start)).toBe('2026-12-01');
    expect(toLocalDate(new Date(start.getTime() - 1))).toBe('2026-11-30');
  });

  it('todayWib and noonWib', () => {
    expect(todayWib(new Date('2026-10-31T17:30:00.000Z'))).toBe('2026-11-01');
    const noon = noonWib(parseLocalDate('2026-11-01'));
    expect(noon.toISOString()).toBe('2026-11-01T05:00:00.000Z');
    expect(toLocalDate(noon)).toBe('2026-11-01');
  });
});
