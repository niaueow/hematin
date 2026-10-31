import { describe, expect, it } from 'vitest';
import { parseLocalDate } from '@server/budget/periods.js';
import { periodRange, seriesBuckets, summarize, type SummaryTransaction } from '@server/budget/summary.js';

// The pure aggregation behind GET /api/summary (end-to-end numbers are in tests/api/dashboard.test.ts).

const d = parseLocalDate;
const cat = (id: string, bucket: 'NEEDS' | 'WANTS' | 'SAVINGS' | 'INCOME') => ({ id, name: id.toUpperCase(), bucket });
const tx = (
  type: SummaryTransaction['type'],
  amount: number,
  date: string,
  category: SummaryTransaction['category'] = null,
) => ({
  type,
  amount,
  localDate: d(date),
  category,
});

describe('periodRange / seriesBuckets (WIB calendar)', () => {
  it.each([
    ['week', '2026-11-04', '2026-11-02', '2026-11-08', 7],
    ['week', '2026-12-31', '2026-12-28', '2027-01-03', 7], // across the new year
    ['month', '2026-11-15', '2026-11-01', '2026-11-30', 6], // Nov 2026: 1-day first and last segments
    ['month', '2026-02-10', '2026-02-01', '2026-02-28', 5], // Feb 2026 starts on a Sunday: 1, 2–8, …, 23–28
    ['month', '2028-02-29', '2028-02-01', '2028-02-29', 5], // leap year
    ['year', '2026-06-15', '2026-01-01', '2026-12-31', 12],
  ] as const)('%s of %s → %s…%s, %i points', (period, date, start, end, points) => {
    expect(periodRange(period, d(date))).toEqual({ start, end });
    const series = seriesBuckets(period, d(date));
    expect(series).toHaveLength(points);
    expect(series[0]?.start).toBe(start);
    expect(series.at(-1)?.end).toBe(end);
    // contiguous, no gaps or overlaps
    series.slice(1).forEach((p, i) => expect(p.start > (series[i]?.end ?? '')).toBe(true));
  });
});

describe('summarize', () => {
  it('ignores rows outside the period; income is in totals but not in byBucket/byCategory', () => {
    const s = summarize('month', d('2026-11-01'), [
      tx('INCOME', 2_000_000, '2026-11-01', cat('uang', 'INCOME')),
      tx('EXPENSE', 10_000, '2026-10-31', cat('makan', 'NEEDS')),
      tx('EXPENSE', 20_000, '2026-11-02', cat('makan', 'NEEDS')),
      tx('SAVING', 5_000, '2026-11-03', cat('nabung', 'SAVINGS')),
    ]);
    expect(s.totals).toEqual({ income: 2_000_000, expense: 20_000, saving: 5_000 });
    expect(s.byBucket).toEqual([
      { bucket: 'NEEDS', amount: 20_000 },
      { bucket: 'WANTS', amount: 0 },
      { bucket: 'SAVINGS', amount: 5_000 },
    ]);
    expect(s.byCategory.map((c) => c.categoryId)).toEqual(['makan', 'nabung']);
  });

  it('byCategory: largest first, ties by name; a saving without a category still counts as SAVINGS', () => {
    const s = summarize('week', d('2026-11-04'), [
      tx('EXPENSE', 10_000, '2026-11-02', cat('b', 'WANTS')),
      tx('EXPENSE', 10_000, '2026-11-03', cat('a', 'NEEDS')),
      tx('SAVING', 30_000, '2026-11-04', null),
    ]);
    expect(s.byCategory).toEqual([
      { categoryId: null, name: null, bucket: null, amount: 30_000 },
      { categoryId: 'a', name: 'A', bucket: 'NEEDS', amount: 10_000 },
      { categoryId: 'b', name: 'B', bucket: 'WANTS', amount: 10_000 },
    ]);
    expect(s.byBucket.find((b) => b.bucket === 'SAVINGS')?.amount).toBe(30_000);
  });

  it('an empty period is all zeros, with every series point present', () => {
    const s = summarize('year', d('2026-01-01'), []);
    expect(s.totals).toEqual({ income: 0, expense: 0, saving: 0 });
    expect(s.series.every((p) => p.income + p.expense + p.saving === 0)).toBe(true);
    expect(s.byCategory).toEqual([]);
  });
});
