// The only place for date math (AGENTS.md rule 2). Pure: never reads the clock.
// Business dates are WIB (Asia/Jakarta, UTC+7, no DST) calendar dates, carried as "YYYY-MM-DD" strings.
// TODO(budget milestone): months and Mon–Sun segments clipped to the month (BUDGET_RULES §2–3).

export const APP_TIME_ZONE = 'Asia/Jakarta';

/** A WIB calendar date, "YYYY-MM-DD". Only this module creates one, so every localDate written goes through it. */
export type LocalDate = string & { readonly __brand: 'LocalDate' };

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
