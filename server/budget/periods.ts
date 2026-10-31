// The only place for date math (AGENTS.md rule 2). Pure: never reads the clock; "now"/"today" are parameters.
// Business dates are WIB (Asia/Jakarta, UTC+7, no DST) calendar dates, carried as "YYYY-MM-DD" strings,
// which also compare correctly as strings. Calendar arithmetic is done on UTC-midnight Dates internally.

export const APP_TIME_ZONE = 'Asia/Jakarta';

/** A WIB calendar date, "YYYY-MM-DD". Only this module creates one, so every localDate written goes through it. */
export type LocalDate = string & { readonly __brand: 'LocalDate' };

/** A calendar month, "YYYY-MM". */
export type MonthKey = string & { readonly __brand: 'MonthKey' };

/** A Mon–Sun week clipped to one calendar month (BUDGET_RULES §3). */
export type Segment = {
  month: MonthKey;
  /** 0-based position within the month. */
  index: number;
  start: LocalDate;
  end: LocalDate;
  days: number;
};

const DAY_MS = 86_400_000;

const wibDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The WIB calendar date of an instant. The one function that computes `localDate` (DATA_MODEL invariants). */
export function toLocalDate(instant: Date): LocalDate {
  if (Number.isNaN(instant.getTime())) throw new RangeError('toLocalDate: invalid Date');
  const parts = wibDateFormat.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}` as LocalDate;
}

/** "Today" in WIB for the given instant. Callers pass the current time in; nothing here reads the clock. */
export const todayWib = (now: Date): LocalDate => toLocalDate(now);

/** Validates "YYYY-MM-DD" (a real calendar date) coming from user input or the API. */
export function parseLocalDate(value: string): LocalDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError('parseLocalDate: expected YYYY-MM-DD');
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    throw new RangeError('parseLocalDate: not a calendar date');
  }
  return value as LocalDate;
}

/** For a Postgres DATE column: Prisma represents it as a Date at UTC midnight of that calendar date. */
export function localDateToDb(date: LocalDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Inverse of localDateToDb, for values read from a DATE column. */
export function localDateFromDb(value: Date): LocalDate {
  return value.toISOString().slice(0, 10) as LocalDate;
}

/** The instant 12:00 WIB on a date: what the dashboard stores as `occurredAt` for a date-only entry (API.md). */
export function noonWib(date: LocalDate): Date {
  return new Date(`${date}T12:00:00.000+07:00`);
}

/** The instant 00:00 WIB on a date (the start of that business day). */
export function startOfDayWib(date: LocalDate): Date {
  return new Date(`${date}T00:00:00.000+07:00`);
}

// --- calendar arithmetic -------------------------------------------------------------------------

const utc = (date: LocalDate) => Date.parse(`${date}T00:00:00.000Z`);
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10) as LocalDate;

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtc(utc(date) + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((utc(to) - utc(from)) / DAY_MS);
}

/** ISO weekday: Monday = 1 … Sunday = 7. */
export function isoWeekday(date: LocalDate): number {
  const d = new Date(utc(date)).getUTCDay();
  return d === 0 ? 7 : d;
}

export const monthOf = (date: LocalDate): MonthKey => date.slice(0, 7) as MonthKey;

export const monthStart = (month: MonthKey): LocalDate => `${month}-01` as LocalDate;

export function daysInMonth(month: MonthKey): number {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export const monthEnd = (month: MonthKey): LocalDate =>
  `${month}-${String(daysInMonth(month)).padStart(2, '0')}` as LocalDate;

export function addMonths(month: MonthKey, count: number): MonthKey {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + count, 1));
  return d.toISOString().slice(0, 7) as MonthKey;
}

/** Months from `from` to `to` inclusive, in order. Empty if `from` is after `to`. */
export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const months: MonthKey[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) months.push(m);
  return months;
}

/** The Mon–Sun week containing `date`. */
export function weekOf(date: LocalDate): { start: LocalDate; end: LocalDate } {
  const start = addDays(date, 1 - isoWeekday(date));
  return { start, end: addDays(start, 6) };
}

/** A month's segments: each Mon–Sun week intersected with the month (BUDGET_RULES §3). */
export function segmentsOfMonth(month: MonthKey): Segment[] {
  const last = monthEnd(month);
  const segments: Segment[] = [];
  let start = monthStart(month);
  while (start <= last) {
    const weekEnd = weekOf(start).end;
    const end = weekEnd < last ? weekEnd : last;
    segments.push({ month, index: segments.length, start, end, days: daysBetween(start, end) + 1 });
    start = addDays(end, 1);
  }
  return segments;
}

/** The segment containing `date`. */
export function segmentOf(date: LocalDate): Segment {
  // Every date falls in exactly one segment of its own month.
  return segmentsOfMonth(monthOf(date)).find((s) => s.start <= date && date <= s.end) as Segment;
}

/** Days from `today` to the end of `segment`, inclusive (≥ 1 while today is inside the segment). */
export function remainingDays(segment: Segment, today: LocalDate): number {
  return daysBetween(today, segment.end) + 1;
}
