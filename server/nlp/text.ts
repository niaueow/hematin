// Text helpers shared by the NLP steps. Pure.

/** BOT_SPEC §2: lowercase, trim, collapse spaces. */
export function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex matching `phrase` as whole words (so "grab" doesn't match inside "grabfood"). */
export function phraseRegex(phrase: string, flags = ''): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(phrase)}(?![\\p{L}\\p{N}])`, `u${flags}`);
}

export function containsPhrase(text: string, phrase: string): boolean {
  return phraseRegex(phrase).test(text);
}
