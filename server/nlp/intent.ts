import type { Bucket } from '../budget/engine.js';
import { parseAmount, type AmountResult } from './amount.js';
import { containsPhrase, normalize } from './text.js';

// detectIntent (BOT_SPEC §2.2). Pure. Triggers are whole phrases; extend the tables here.

export type Intent = 'ASK_PURCHASE' | 'LOG_INCOME' | 'LOG_SAVING' | 'LOG_EXPENSE' | 'UNKNOWN';

export const PURCHASE_TRIGGERS = ['mau', 'pengen', 'pingin', 'boleh ga', 'boleh gak', 'bolehkah', 'kalo beli'] as const;
export const INCOME_TRIGGERS = [
  'uang jajan',
  'uang saku',
  'dapet',
  'dikasih',
  'gajian',
  'transfer dari',
  'pemasukan', // also what /pemasukan <nominal> is parsed as
] as const;

const hasAny = (text: string, phrases: readonly string[]) => phrases.some((p) => containsPhrase(text, p));

/**
 * From the text alone: ASK_PURCHASE, then LOG_INCOME, then LOG_EXPENSE if there's any amount (even one that
 * needs confirmation), else UNKNOWN. LOG_SAVING depends on the category: see refineIntent.
 */
export function detectIntent(text: string, amount: AmountResult = parseAmount(text)): Intent {
  const normalized = normalize(text);
  if (hasAny(normalized, PURCHASE_TRIGGERS)) return 'ASK_PURCHASE';
  if (hasAny(normalized, INCOME_TRIGGERS)) return 'LOG_INCOME';
  return 'error' in amount && amount.error === 'NONE' ? 'UNKNOWN' : 'LOG_EXPENSE';
}

/**
 * After categorizing: a plain log whose category is in the SAVINGS bucket is LOG_SAVING ("reksadana 200k"),
 * and one in the INCOME bucket is LOG_INCOME ("gaji 5jt"). "mau nabung 200k" is a saving to record, not a
 * purchase check (owner decision, BOT_SPEC §2.3a). Other purchase checks and income stay as they are.
 */
export function refineIntent(intent: Intent, bucket: Bucket | null): Intent {
  if (intent === 'ASK_PURCHASE' && bucket === 'SAVINGS') return 'LOG_SAVING';
  if (intent !== 'LOG_EXPENSE') return intent;
  if (bucket === 'SAVINGS') return 'LOG_SAVING';
  if (bucket === 'INCOME') return 'LOG_INCOME';
  return intent;
}

/** Which category buckets make sense for an intent (categorize only looks at these). */
export function bucketsFor(intent: Intent): readonly Bucket[] {
  if (intent === 'LOG_INCOME') return ['INCOME'];
  if (intent === 'ASK_PURCHASE') return ['NEEDS', 'WANTS', 'SAVINGS'];
  return ['NEEDS', 'WANTS', 'SAVINGS', 'INCOME'];
}
