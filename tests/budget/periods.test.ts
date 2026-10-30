import { describe, expect, it } from 'vitest';
import { localDateFromDb, localDateToDb, parseLocalDate, toLocalDate } from '@server/budget/periods.js';

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
