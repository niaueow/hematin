import { monthEnd, monthOf, monthStart, weekOf, type LocalDate } from '@server/budget/periods';
import type { Bucket, Category, Transaction, TransactionQuery, TxType } from '@web/api/dashboard';
import { formatDayLabel } from '@web/lib/format';

// The Transaksi page's logic, free of Vue so it can be tested on its own.

export type PeriodFilter = 'week' | 'month' | 'all';
export type TypeFilter = 'all' | TxType;
export type TxFilters = { period: PeriodFilter; type: TypeFilter; categoryId: string | null };

export const PERIOD_OPTIONS = [
  { value: 'week', label: 'Minggu ini' },
  { value: 'month', label: 'Bulan ini' },
  { value: 'all', label: 'Semua' },
] as const;

export const TYPE_OPTIONS = [
  { value: 'all', label: 'Semua' },
  { value: 'EXPENSE', label: 'Pengeluaran' },
  { value: 'INCOME', label: 'Pemasukan' },
  { value: 'SAVING', label: 'Nabung' },
] as const;

export const TYPE_LABEL: Readonly<Record<TxType, string>> = {
  EXPENSE: 'Pengeluaran',
  INCOME: 'Pemasukan',
  SAVING: 'Nabung',
};

/** Which buckets a type's category can be in (DATA_MODEL invariants). */
export const BUCKETS_FOR_TYPE: Readonly<Record<TxType, readonly Bucket[]>> = {
  EXPENSE: ['NEEDS', 'WANTS'],
  SAVING: ['SAVINGS'],
  INCOME: ['INCOME'],
};

/** Filters → the GET /api/transactions query. "Minggu ini" / "Bulan ini" are the whole Mon–Sun week / month (WIB). */
export function filtersToQuery(filters: TxFilters, today: LocalDate): TransactionQuery {
  const range =
    filters.period === 'week'
      ? weekOf(today)
      : filters.period === 'month'
        ? { start: monthStart(monthOf(today)), end: monthEnd(monthOf(today)) }
        : null;
  return {
    ...(range && { from: range.start, to: range.end }),
    ...(filters.type !== 'all' && { type: filters.type }),
    ...(filters.categoryId && { categoryId: filters.categoryId }),
  };
}

/** The category chips to offer for a type filter ("Semua" → every category). */
export function categoriesForType(categories: readonly Category[], type: TypeFilter): Category[] {
  if (type === 'all') return [...categories];
  return categories.filter((c) => BUCKETS_FOR_TYPE[type].includes(c.bucket));
}

export type DayGroup = { date: string; label: string; items: Transaction[] };

/** Consecutive transactions by date, in list order (the API sends newest first), with "Hari ini" / "Kemarin" labels. */
export function groupByDate(items: readonly Transaction[], today: LocalDate): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const tx of items) {
    const last = groups.at(-1);
    if (last?.date === tx.date) last.items.push(tx);
    else groups.push({ date: tx.date, label: formatDayLabel(tx.date, today), items: [tx] });
  }
  return groups;
}

/** A transaction's sign for display: income adds, everything else (spending, saving) goes out. */
export const isIncoming = (tx: Pick<Transaction, 'type'>) => tx.type === 'INCOME';
