import {
  addDays,
  monthEnd,
  monthOf,
  monthRange,
  monthStart,
  segmentsOfMonth,
  weekOf,
  type LocalDate,
  type MonthKey,
} from './periods.js';

// GET /api/summary (API.md): totals for a week, month or year in WIB, for the dashboard charts. Pure, like the
// engine: no Prisma, no clock. It only adds up recorded transactions; budget numbers (allocations, remaining,
// rollover) come from the engine via /api/budget/current, never from here.

export type Period = 'week' | 'month' | 'year';
export type SummaryBucket = 'NEEDS' | 'WANTS' | 'SAVINGS';

export type SummaryTransaction = {
  type: 'INCOME' | 'EXPENSE' | 'SAVING';
  amount: number;
  localDate: LocalDate;
  category: { id: string; name: string; bucket: 'NEEDS' | 'WANTS' | 'SAVINGS' | 'INCOME' } | null;
};

export type Totals = { income: number; expense: number; saving: number };

export type Summary = {
  period: Period;
  range: { start: LocalDate; end: LocalDate };
  totals: Totals;
  /** Expenses by NEEDS / WANTS, and savings as SAVINGS: the 50/30/20 picture. Always all three, in that order. */
  byBucket: { bucket: SummaryBucket; amount: number }[];
  /** Expenses and savings by category, largest first (ties by name). Income isn't spending, so it's left out. */
  byCategory: { categoryId: string | null; name: string | null; bucket: SummaryBucket | null; amount: number }[];
  /** week → one point per day; month → per week segment (BUDGET_RULES §3); year → per month. */
  series: ({ start: LocalDate; end: LocalDate } & Totals)[];
};

/** The calendar range of the period containing `date`. */
export function periodRange(period: Period, date: LocalDate): { start: LocalDate; end: LocalDate } {
  if (period === 'week') return weekOf(date);
  if (period === 'month') return { start: monthStart(monthOf(date)), end: monthEnd(monthOf(date)) };
  const year = date.slice(0, 4);
  return { start: `${year}-01-01` as LocalDate, end: `${year}-12-31` as LocalDate };
}

/** The points of the series, in order. */
export function seriesBuckets(period: Period, date: LocalDate): { start: LocalDate; end: LocalDate }[] {
  const range = periodRange(period, date);
  if (period === 'week')
    return Array.from({ length: 7 }, (_, i) => ({ start: addDays(range.start, i), end: addDays(range.start, i) }));
  if (period === 'month') return segmentsOfMonth(monthOf(date)).map((s) => ({ start: s.start, end: s.end }));
  return monthRange(monthOf(range.start), monthOf(range.end)).map((m: MonthKey) => ({
    start: monthStart(m),
    end: monthEnd(m),
  }));
}

function totalsOf(transactions: readonly SummaryTransaction[]): Totals {
  const totals: Totals = { income: 0, expense: 0, saving: 0 };
  for (const t of transactions) {
    if (t.type === 'INCOME') totals.income += t.amount;
    else if (t.type === 'EXPENSE') totals.expense += t.amount;
    else totals.saving += t.amount;
  }
  return totals;
}

/** `transactions` may include rows outside the period; only those dated inside it count. */
export function summarize(period: Period, date: LocalDate, transactions: readonly SummaryTransaction[]): Summary {
  const range = periodRange(period, date);
  const inRange = transactions.filter((t) => range.start <= t.localDate && t.localDate <= range.end);
  const spending = inRange.filter((t) => t.type !== 'INCOME');

  const byBucket = (['NEEDS', 'WANTS', 'SAVINGS'] as const).map((bucket) => ({
    bucket,
    amount: spending
      .filter((t) => (t.type === 'SAVING' ? 'SAVINGS' : t.category?.bucket) === bucket)
      .reduce((sum, t) => sum + t.amount, 0),
  }));

  const categories = new Map<string | null, Summary['byCategory'][number]>();
  for (const t of spending) {
    const key = t.category?.id ?? null;
    const row = categories.get(key) ?? {
      categoryId: key,
      name: t.category?.name ?? null,
      bucket: t.category && t.category.bucket !== 'INCOME' ? t.category.bucket : null,
      amount: 0,
    };
    row.amount += t.amount;
    categories.set(key, row);
  }
  const byCategory = [...categories.values()].sort(
    (a, b) => b.amount - a.amount || (a.name ?? '').localeCompare(b.name ?? ''),
  );

  const series = seriesBuckets(period, date).map((point) => ({
    ...point,
    ...totalsOf(inRange.filter((t) => point.start <= t.localDate && t.localDate <= point.end)),
  }));

  return { period, range, totals: totalsOf(inRange), byBucket, byCategory, series };
}
