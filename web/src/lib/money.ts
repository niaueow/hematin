// Money in the SPA: integer rupiah (AGENTS.md rule 1), formatted the same way as the bot (one formatRupiah).
export { formatRupiah } from '@server/lib/money';

/** At most 12 digits (Rp999 miliar), so the value stays a safe integer. */
export const MAX_AMOUNT_DIGITS = 12;

/** What someone typed into a money field → whole rupiah, or null if there are no digits. "Rp 1.500.000" → 1500000. */
export function parseRupiah(text: string): number | null {
  const digits = text
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, MAX_AMOUNT_DIGITS);
  return digits === '' ? null : Number(digits);
}
