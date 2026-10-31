import { amountTexts, parseAmount, type AmountResult } from './amount.js';
import { categorize, onlyFillers, type CategorizeContext, type Categorized } from './categorize.js';
import { bucketsFor, detectIntent, refineIntent, type Intent } from './intent.js';
import { normalize } from './text.js';

// The deterministic message pipeline (BOT_SPEC §2): normalize → parseAmount → detectIntent → categorize.
// Pure; the bot decides what to do with the result (record, ask "Berapa duitnya?", confirm, show buttons).

export type ParsedMessage = Categorized & {
  normalized: string;
  amount: AmountResult;
  intent: Intent;
};

export function parseMessage(text: string, context: Omit<CategorizeContext, 'buckets'>): ParsedMessage {
  const normalized = normalize(text);
  const amount = parseAmount(normalized);
  const detected = detectIntent(normalized, amount);
  const categorized = categorize(normalized, { ...context, buckets: bucketsFor(detected) }, amountTexts(amount));
  return {
    normalized,
    amount,
    intent: refineIntent(detected, categorized.category?.bucket ?? null),
    ...categorized,
  };
}

/**
 * An answer to "Berapa duitnya?": exactly one amount and nothing else but filler words ("15rb", "15rb aja").
 * Anything more ("gojek 18k") is a new message.
 */
export function isAmountOnly(text: string): boolean {
  const texts = amountTexts(parseAmount(normalize(text)));
  return texts.length === 1 && onlyFillers(text, texts);
}
