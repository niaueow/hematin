import { describe, expect, it, vi } from 'vitest';
import { localDateToDb, parseLocalDate } from '@server/budget/periods.js';
import { createBudgetService, type BudgetServiceDeps } from '@server/budget/service.js';

// The service is glue: repos in, engine out. Repos are mocked; no database.

const user = { id: 'user_A', needsPct: 50, wantsPct: 30, savingsPct: 20 };
const row = (type: 'INCOME' | 'EXPENSE' | 'SAVING', amount: number, date: string, bucket: string | null) => ({
  type,
  amount,
  localDate: localDateToDb(parseLocalDate(date)),
  categoryId: bucket ? `cat_${bucket}` : null,
  category: bucket ? { bucket } : null,
});

function deps(rows: ReturnType<typeof row>[], skipped = { amount: 35_000, count: 1 }) {
  const listUpTo = vi.fn().mockResolvedValue(rows);
  const sumSkipped = vi.fn().mockResolvedValue(skipped);
  return {
    deps: { txRepo: { listUpTo }, intentRepo: { sumSkipped } } as unknown as BudgetServiceDeps,
    listUpTo,
    sumSkipped,
  };
}

const history = [
  row('INCOME', 2_000_000, '2026-11-01', null),
  row('EXPENSE', 15_000, '2026-11-01', 'WANTS'),
  row('EXPENSE', 170_000, '2026-11-03', 'WANTS'),
  row('EXPENSE', 50_000, '2026-11-09', 'WANTS'),
];
// 10:00 WIB on Wed 11 Nov 2026
const now = new Date('2026-11-11T03:00:00.000Z');

describe('budget service', () => {
  it('loads the history up to today (WIB) for the caller and returns the snapshot', async () => {
    const { deps: d, listUpTo, sumSkipped } = deps(history);
    const result = await createBudgetService(d).current(user, now);
    expect(listUpTo).toHaveBeenCalledWith('user_A', '2026-11-11');
    expect(sumSkipped).toHaveBeenCalledWith('user_A', '2026-11-09', '2026-11-15');
    expect(sumSkipped).toHaveBeenCalledWith('user_A', '2026-11-01', '2026-11-30');
    expect(result.wants).toMatchObject({ effective: 110_000, remainingWeek: 60_000, dailyPace: 12_000 });
    expect(result.savedBySkipping.week).toEqual({ amount: 35_000, count: 1 });
  });

  it('uses WIB, not UTC, for "today"', async () => {
    const { deps: d, listUpTo } = deps(history);
    await createBudgetService(d).current(user, new Date('2026-10-31T17:30:00.000Z')); // 00:30 WIB 1 Nov
    expect(listUpTo).toHaveBeenCalledWith('user_A', '2026-11-01');
  });

  it('checks a purchase (the §8 CAUTION example)', async () => {
    const result = await createBudgetService(deps(history).deps).checkPurchase(user, 35_000, now);
    expect(result).toMatchObject({ verdict: 'CAUTION', perDayAfter: 6_250 });
  });

  it('builds the weekly recap with the week’s skipped purchases', async () => {
    const { deps: d, sumSkipped } = deps(history, { amount: 55_000, count: 2 });
    const recap = await createBudgetService(d).weeklyRecap(user, new Date('2026-11-15T15:00:00.000Z'));
    expect(sumSkipped).toHaveBeenCalledWith('user_A', '2026-11-09', '2026-11-15');
    expect(recap.skipped).toEqual({ amount: 55_000, count: 2 });
    expect(recap.wants).toMatchObject({ allocationAfterDebt: 110_000, spent: 50_000 });
  });

  it('income rows without a category map to bucket null', async () => {
    const result = await createBudgetService(deps(history).deps).current(user, now);
    expect(result.state).toBe('OK');
  });
});
