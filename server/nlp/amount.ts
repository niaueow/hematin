import { normalize, phraseRegex } from './text.js';

// parseAmount (BOT_SPEC §2.1). Pure. Money is integer rupiah: decimals are handled with integer math.
//
// How a message is read:
// - "Strong" amounts carry a unit (k, rb, ribu, jt, juta), a slang word, thousands separators, or are ≥ 1.000.
// - "Weak" amounts are bare numbers < 1.000 with no unit ("kopi 20", "2 bungkus").
// - One strong amount wins; weak numbers next to it are quantities ("nasi padang 2 bungkus 30k").
// - Two or more strong amounts → MULTIPLE ("kopi 20k sama roti 15k"). With no strong amount, one weak
//   number → AMBIGUOUS_SMALL with a ×1.000 candidate ("Maksudnya Rp20.000?"), two or more → MULTIPLE.
// - An "rp" prefix marks money but not magnitude: "rp 20" is still AMBIGUOUS_SMALL.

export const MIN_AMOUNT = 1;
export const MAX_AMOUNT = 100_000_000;

/** Unit suffixes → multiplier. Longest first (so "ribu" wins over "rb"). Extend here. */
export const UNITS: Readonly<Record<string, number>> = {
  ribu: 1_000,
  juta: 1_000_000,
  rb: 1_000,
  jt: 1_000_000,
  k: 1_000,
};

/** P2 slang (BOT_SPEC §2.1), as specified. Extend here. */
export const SLANG: Readonly<Record<string, number>> = {
  seceng: 1_000,
  goceng: 5_000,
  ceban: 10_000,
  gocap: 50_000,
  cepek: 100_000,
};

export type AmountMatch = {
  /** Rupiah. For a `small` match this is the ×1.000 candidate. */
  value: number;
  /** The text that was read as the amount, in the normalized message. */
  matchedText: string;
  strong: boolean;
  /** No magnitude unit and < 1.000: needs confirmation as thousands. */
  small: boolean;
};

export type AmountResult =
  | { amount: number; matchedText: string }
  | { error: 'NONE' }
  | { error: 'MULTIPLE'; matches: string[] }
  | { error: 'AMBIGUOUS_SMALL'; candidate: number; matchedText: string }
  | { error: 'OUT_OF_RANGE'; amount: number; matchedText: string };

const unitAlternation = Object.keys(UNITS).join('|');
// [rp prefix] number [unit], as whole tokens. Not part of a time/date ("10:30", "31/10") or a word ("2x").
const AMOUNT_TOKEN = new RegExp(
  String.raw`(?<![\p{L}\p{N}:/.,])(?<rp>(?:rp|idr)\.?\s?)?(?<num>\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)(?:\s?(?<unit>${unitAlternation})(?:-an)?)?(?![\p{L}\p{N}:/])`,
  'gu',
);

/** "1.500.000" / "1,500,000" (groups of 3) are thousands separators; anything else with . or , is a decimal. */
function readNumber(num: string): { digits: string; scale: number } {
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(num)) return { digits: num.replace(/[.,]/g, ''), scale: 0 };
  const [int, frac = ''] = num.split(/[.,]/) as [string, string?];
  return { digits: int + frac, scale: frac.length };
}

/** digits / 10^scale × multiplier, or null if that isn't a whole number of rupiah. */
function toRupiah(digits: string, scale: number, multiplier: number): number | null {
  const divisor = 10 ** scale;
  const scaled = Number(digits) * multiplier;
  return scaled % divisor === 0 ? scaled / divisor : null;
}

/** Every number-like amount in an already-normalized message, in order. */
export function findAmounts(normalized: string): AmountMatch[] {
  const found: (AmountMatch & { index: number })[] = [];

  for (const m of normalized.matchAll(AMOUNT_TOKEN)) {
    const { rp, num, unit } = m.groups as { rp?: string; num: string; unit?: string };
    const { digits, scale } = readNumber(num);
    const grouped = scale === 0 && /[.,]/.test(num);
    if (unit) {
      const value = toRupiah(digits, scale, UNITS[unit] as number);
      if (value !== null) found.push({ value, matchedText: m[0], strong: true, small: false, index: m.index });
      continue;
    }
    const plain = toRupiah(digits, scale, 1);
    if (plain !== null && (plain >= 1_000 || grouped)) {
      found.push({ value: plain, matchedText: m[0], strong: true, small: false, index: m.index });
      continue;
    }
    // No unit and < 1.000 (or a bare decimal like "1.5"): the value is the ×1.000 candidate, to be confirmed.
    if (scale > 3) continue;
    const candidate = toRupiah(digits, scale, 1_000) as number; // whole for ≤ 3 decimals
    if (candidate >= 1_000_000) continue; // e.g. "1500.5": not a small number
    found.push({ value: candidate, matchedText: m[0], strong: Boolean(rp), small: true, index: m.index });
  }

  for (const [word, value] of Object.entries(SLANG)) {
    for (const m of normalized.matchAll(phraseRegex(word, 'g'))) {
      found.push({ value, matchedText: m[0], strong: true, small: false, index: m.index });
    }
  }

  return found
    .sort((a, b) => a.index - b.index)
    .map(({ value, matchedText, strong, small }) => ({ value, matchedText, strong, small }));
}

export function parseAmount(text: string): AmountResult {
  const matches = findAmounts(normalize(text));
  const strong = matches.filter((m) => m.strong);
  const candidates = strong.length > 0 ? strong : matches;

  if (candidates.length === 0) return { error: 'NONE' };
  if (candidates.length > 1) return { error: 'MULTIPLE', matches: candidates.map((m) => m.matchedText) };

  const only = candidates[0] as AmountMatch;
  const amount = only.value;
  if (amount < MIN_AMOUNT || amount > MAX_AMOUNT)
    return { error: 'OUT_OF_RANGE', amount, matchedText: only.matchedText };
  if (only.small) return { error: 'AMBIGUOUS_SMALL', candidate: amount, matchedText: only.matchedText };
  return { amount, matchedText: only.matchedText };
}

/** The text of every amount-like token, to strip from the item ("kopi 20k" → "kopi"). */
export function amountTexts(result: AmountResult): string[] {
  if ('matchedText' in result) return [result.matchedText];
  if ('matches' in result) return result.matches;
  return [];
}
