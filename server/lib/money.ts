// Money is integer rupiah (AGENTS.md rule 1). Formatting happens only at the edges.

/** 35000 → "Rp35.000", -12000 → "-Rp12.000". Dot thousands separator, no decimals (BOT_SPEC §5). */
export function formatRupiah(amount: number): string {
  if (!Number.isSafeInteger(amount)) throw new RangeError('formatRupiah: amount must be an integer');
  const digits = String(Math.abs(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${amount < 0 ? '-' : ''}Rp${digits}`;
}
