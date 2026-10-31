import { addDays, isoWeekday, monthOf, parseLocalDate, todayWib, type LocalDate } from '@server/budget/periods';

// The one place the SPA formats money and dates (pages never format inline). Money is integer rupiah
// (AGENTS.md rule 1) and uses the bot's formatRupiah; dates are WIB calendar dates ("YYYY-MM-DD"), and all date
// math goes through server/budget/periods.ts (AGENTS.md rule 2), shared with the server.

export { formatRupiah } from '@server/lib/money';
export type { LocalDate } from '@server/budget/periods';

// --- money -----------------------------------------------------------------------------------------------

/** At most 12 digits (Rp999 miliar), so a typed amount stays a safe integer. */
export const MAX_AMOUNT_DIGITS = 12;

/** What someone typed into a money field → whole rupiah, or null if there are no digits. "Rp 1.500.000" → 1500000. */
export function parseRupiah(text: string): number | null {
  const digits = text
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, MAX_AMOUNT_DIGITS);
  return digits === '' ? null : Number(digits);
}

const SHORT_UNITS = [
  { size: 1_000_000_000, suffix: 'M' },
  { size: 1_000_000, suffix: 'jt' },
  { size: 1_000, suffix: 'rb' },
] as const;

/**
 * Chart axes: 35000 → "35rb", 1200000 → "1,2jt", 2000000 → "2jt", 500 → "500", -35000 → "-35rb". One decimal at
 * most (rounded), Indonesian comma. Display only: the full amount goes in tooltips (formatRupiah).
 */
export function formatRupiahShort(amount: number): string {
  if (!Number.isSafeInteger(amount)) throw new RangeError('formatRupiahShort: amount must be an integer');
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const unit = SHORT_UNITS.find((u) => abs >= u.size);
  if (!unit) return `${sign}${abs}`;
  const tenths = Math.round((abs * 10) / unit.size); // integer tenths of the unit
  const whole = Math.floor(tenths / 10);
  const decimal = tenths % 10;
  return `${sign}${whole}${decimal ? `,${decimal}` : ''}${unit.suffix}`;
}

/** 0–100+ → "65%". */
export const formatPercent = (pct: number) => `${pct}%`;

// --- dates (WIB) -----------------------------------------------------------------------------------------

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTHS_LONG = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];
/** ISO weekday 1 (Monday) … 7 (Sunday). */
const WEEKDAYS_SHORT = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

/** Today's WIB date (the browser's clock, any time zone). */
export const today = (now: Date = new Date()): LocalDate => todayWib(now);

const parts = (date: string) => {
  const d = parseLocalDate(date);
  const [year, month, day] = d.split('-').map(Number) as [number, number, number];
  return { d, year, month, day };
};

/** "2026-11-02" → "2 Nov", or "2 Nov 2026" with `year`. */
export function formatDate(date: string, options: { year?: boolean } = {}): string {
  const { year, month, day } = parts(date);
  return `${day} ${MONTHS_SHORT[month - 1]}${options.year ? ` ${year}` : ''}`;
}

/** "Sen" for a date. */
export const weekdayShort = (date: string) => WEEKDAYS_SHORT[isoWeekday(parseLocalDate(date)) - 1] as string;

/** "Nov" / "November" for a date's month. */
export const monthShort = (date: string) => MONTHS_SHORT[parts(date).month - 1] as string;
export const monthLong = (date: string) => MONTHS_LONG[parts(date).month - 1] as string;

/** List headers: "Hari ini", "Kemarin", "Sen, 2 Nov" (with the year when it isn't this year). */
export function formatDayLabel(date: string, todayDate: LocalDate): string {
  const { d, year } = parts(date);
  if (d === todayDate) return 'Hari ini';
  if (d === addDays(todayDate, -1)) return 'Kemarin';
  const sameYear = year === parts(todayDate).year;
  return `${weekdayShort(d)}, ${formatDate(d, { year: !sameYear })}`;
}

/** A week, month or year range as a title: "2–8 Nov 2026", "26 Okt – 1 Nov 2026", "November 2026", "2026". */
export function formatPeriod(period: 'week' | 'month' | 'year', range: { start: string; end: string }): string {
  const start = parts(range.start);
  const end = parts(range.end);
  if (period === 'year') return String(start.year);
  if (period === 'month') return `${monthLong(range.start)} ${start.year}`;
  if (start.year !== end.year)
    return `${formatDate(range.start, { year: true })} – ${formatDate(range.end, { year: true })}`;
  if (monthOf(start.d) !== monthOf(end.d)) return `${formatDate(range.start)} – ${formatDate(range.end)} ${end.year}`;
  return `${start.day}–${end.day} ${MONTHS_SHORT[end.month - 1]} ${end.year}`;
}

/** A segment of a month for a chart axis: "2–8", or "1" for a one-day segment. */
export function formatDayRange(start: string, end: string): string {
  const a = parts(start).day;
  const b = parts(end).day;
  return a === b ? String(a) : `${a}–${b}`;
}
