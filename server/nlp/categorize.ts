import type { Bucket } from '../budget/engine.js';
import { longestKeywordMatch, type NlpCategory } from './keywords.js';
import { normalize } from './text.js';

// categorize (BOT_SPEC §2.3). Pure. Order, stopping at the first hit:
//   1. the user's learned aliases (KeywordAlias)       → parseMethod ALIAS
//   2. the default keyword dictionary, longest first    → parseMethod RULE
//   3. Groq                                             → stub, M4
//   4. ask the user with category buttons               → the bot does this when category is null (USER_PICK)

export type NlpAlias = { keyword: string; categoryId: string };

export type CategorizeContext = {
  /** Categories the user may use (system + own, active). */
  categories: readonly NlpCategory[];
  aliases: readonly NlpAlias[];
  /** Only categories in these buckets are considered (see intent.bucketsFor). Default: all. */
  buckets?: readonly Bucket[];
};

export type Categorized = {
  category: NlpCategory | null;
  parseMethod: 'ALIAS' | 'RULE' | null;
  /** The keyword or alias that matched. */
  matchedKeyword: string | null;
  /** What was bought, for the note and as the alias key ("aku jajan cireng 10k" → "cireng"). */
  item: string;
};

/** Words that aren't the item. Removed from the item only; categorizing still sees them. Extend here. */
export const FILLER_WORDS: ReadonlySet<string> = new Set([
  'aku', 'gue', 'gw', 'gua', 'saya', 'ku',
  'mau', 'pengen', 'pingin', 'boleh', 'bolehkah', 'ga', 'gak', 'nggak', 'kah', 'kalo', 'kalau',
  'beli', 'bayar', 'jajan', 'nabung', 'dapet', 'dapat', 'dikasih', 'gajian',
  'tadi', 'td', 'barusan', 'abis', 'habis', 'udah', 'sudah', 'baru',
  'buat', 'untuk', 'utk', 'di', 'ke', 'dari', 'yg', 'yang', 'pake', 'pakai',
  'dong', 'nih', 'sih', 'ya', 'deh', 'kok', 'aja', 'nya', 'gimana', 'gmn',
]); // prettier-ignore

/**
 * The item: the message minus the amount text(s), punctuation and filler words. Falls back to the message
 * minus the amount if only fillers were left ("jajan 10k" → "jajan"). Words of `keep` (the matched
 * keyword) are never dropped, so "dapet uang jajan 2jt" → "uang jajan". Max 120 characters (API note limit).
 */
export function extractItem(text: string, amountTexts: readonly string[] = [], keep: string | null = null): string {
  let rest = normalize(text);
  for (const amountText of amountTexts) rest = rest.replace(amountText, ' ');
  const words = rest
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, ''))
    .filter(Boolean);
  const kept = new Set<number>();
  const keepWords = keep ? keep.split(' ') : [];
  for (let i = 0; keepWords.length > 0 && i + keepWords.length <= words.length; i++) {
    if (keepWords.every((w, j) => words[i + j] === w)) keepWords.forEach((_, j) => kept.add(i + j));
  }
  const item = words.filter((w, i) => kept.has(i) || !FILLER_WORDS.has(w));
  return (item.length > 0 ? item : words).join(' ').slice(0, 120);
}

export function categorize(text: string, context: CategorizeContext, amountTexts: readonly string[] = []): Categorized {
  let normalized = normalize(text);
  for (const amountText of amountTexts) normalized = normalized.replace(amountText, ' ');
  const allowed = context.buckets ?? ['NEEDS', 'WANTS', 'SAVINGS', 'INCOME'];
  const usable = context.categories.filter((c) => allowed.includes(c.bucket));
  const byId = new Map(usable.map((c) => [c.id, c]));

  // 1. Learned aliases (only ones pointing at a usable category).
  const aliasHit = longestKeywordMatch(
    normalized,
    context.aliases
      .filter((a) => byId.has(a.categoryId))
      .map((a) => ({ keyword: normalize(a.keyword), value: a.categoryId })),
  );
  if (aliasHit) {
    return {
      category: byId.get(aliasHit.value) as NlpCategory,
      parseMethod: 'ALIAS',
      matchedKeyword: aliasHit.keyword,
      item: extractItem(text, amountTexts, aliasHit.keyword),
    };
  }

  // 2. Default keywords, longest first.
  const ruleHit = longestKeywordMatch(
    normalized,
    usable.flatMap((c) => c.keywords.map((keyword) => ({ keyword: normalize(keyword), value: c }))),
  );
  if (ruleHit) {
    return {
      category: ruleHit.value,
      parseMethod: 'RULE',
      matchedKeyword: ruleHit.keyword,
      item: extractItem(text, amountTexts, ruleHit.keyword),
    };
  }

  // 3. Groq, then 4. ask the user.
  return { ...categorizeWithLlm(), matchedKeyword: null, item: extractItem(text, amountTexts) };
}

/** Step 3 stub: no Groq yet (M4). Returning nothing means the bot asks the user (step 4). */
export function categorizeWithLlm(): Pick<Categorized, 'category' | 'parseMethod'> {
  return { category: null, parseMethod: null };
}
