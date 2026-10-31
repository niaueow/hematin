import { addDays, addMonths, monthOf, monthStart, parseLocalDate, type LocalDate } from '@server/budget/periods';
import { periodRange } from '@server/budget/summary';
import type { Period, Summary } from '@web/api/dashboard';
import { formatDayRange, monthShort, weekdayShort } from '@web/lib/format';

// The Statistik page's logic, free of Vue. The period and its date live in the URL query (?period=month&date=…),
// so a view can be bookmarked and the back button works.

export const PERIODS = [
  { value: 'week', label: 'Minggu' },
  { value: 'month', label: 'Bulan' },
  { value: 'year', label: 'Tahun' },
] as const;

const isPeriod = (value: unknown): value is Period => value === 'week' || value === 'month' || value === 'year';

/** The URL query → a valid period and date (anything odd falls back to this month). */
export function readQuery(query: Record<string, unknown>, today: LocalDate): { period: Period; date: LocalDate } {
  const period = isPeriod(query.period) ? query.period : 'month';
  let date = today;
  if (typeof query.date === 'string') {
    try {
      date = parseLocalDate(query.date);
    } catch {
      // keep today
    }
  }
  return { period, date };
}

/** The same kind of period, `step` periods before or after (−1 = previous). Lands on the period's first day. */
export function shiftPeriod(period: Period, date: LocalDate, step: number): LocalDate {
  if (period === 'week') return addDays(periodRange('week', date).start, 7 * step);
  if (period === 'month') return monthStart(addMonths(monthOf(date), step));
  return `${Number(date.slice(0, 4)) + step}-01-01` as LocalDate;
}

/** Is there anything after this period to go to? (No looking into the future.) */
export const hasNext = (period: Period, date: LocalDate, today: LocalDate) => shiftPeriod(period, date, 1) <= today;

/** Labels for the spend-over-time bars: Sen…Min, the month's segments ("2–8"), or Jan…Des. */
export function seriesLabels(summary: Pick<Summary, 'period' | 'series'>): string[] {
  return summary.series.map((point) => {
    if (summary.period === 'week') return weekdayShort(point.start);
    if (summary.period === 'month') return formatDayRange(point.start, point.end);
    return monthShort(point.start);
  });
}

export const BUCKET_LABEL = { NEEDS: 'Pokok', WANTS: 'Jajan', SAVINGS: 'Nabung' } as const;

/** Nothing recorded in the period at all. */
export const isEmpty = (summary: Pick<Summary, 'totals'>) =>
  summary.totals.income + summary.totals.expense + summary.totals.saving === 0;
