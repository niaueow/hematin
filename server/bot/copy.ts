// ALL user-facing Indonesian strings live here (AGENTS.md rule 7). Tone: BOT_SPEC §5 (D-023).
// ≤ 5 lines, ≤ 2 emoji, 2–3 variants per message, picked at random so it doesn't feel robotic.
// TODO(bot milestone): the rest of the copy (logging, /sisa, verdicts, reminders, recap).

/** Picks one variant. `random` is injectable so tests are deterministic. */
export function pick<T>(variants: readonly T[], random: () => number = Math.random): T {
  return variants[Math.floor(random() * variants.length)] as T;
}

/**
 * Monthly income reminder, 1st of the month ~10:00 WIB (BOT_SPEC §4). Phrased conditionally ("kalau ada"):
 * a month without recorded income isn't assumed to have income, and logging stays open either way.
 */
export const INCOME_REMINDER = [
  'Pagi! 🌞 Udah tanggal 1, bulan baru nih.\nKalau bulan ini ada uang jajan atau pemasukan lain, catat ya biar aku bisa ngitung budget-mu.\nKetik aja, misal "uang jajan 2jt".',
  'Selamat pagi! Bulan baru, budget baru 📒\nKalau udah dapet uang jajan bulan ini, kabarin aku ya, misal "uang jajan 1,5jt".\nBelum dapet? Santai, catat aja pas udah masuk. Pengeluaran tetap bisa dicatat kayak biasa.',
  'Halo, tanggal 1 nih! 🙌\nBudget bulan ini baru bisa aku hitung kalau pemasukannya udah dicatat.\nKalau ada, ketik misal "uang saku 2jt". Kalau belum ada, gapapa, nanti aja.',
] as const;

export const incomeReminder = (random?: () => number) => pick(INCOME_REMINDER, random);
