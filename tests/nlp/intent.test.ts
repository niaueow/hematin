import { describe, expect, it } from 'vitest';
import { bucketsFor, detectIntent, INCOME_TRIGGERS, PURCHASE_TRIGGERS, refineIntent } from '@server/nlp/intent.js';

describe('detectIntent (BOT_SPEC §2.2)', () => {
  it.each(PURCHASE_TRIGGERS.map((t) => [t]))('purchase trigger "%s" → ASK_PURCHASE', (trigger) => {
    expect(detectIntent(`${trigger} boba 25k`)).toBe('ASK_PURCHASE');
  });

  it.each(INCOME_TRIGGERS.map((t) => [t]))('income trigger "%s" → LOG_INCOME', (trigger) => {
    expect(detectIntent(`${trigger} 2jt`)).toBe('LOG_INCOME');
  });

  it.each([
    ['Mau donat 35k', 'ASK_PURCHASE'], // case-insensitive
    ['donat 35k, mau ga?', 'ASK_PURCHASE'], // "contains", not only "starts with"
    ['mau donat', 'ASK_PURCHASE'], // no amount yet: still a purchase check (bot asks the amount)
    ['dapet uang jajan', 'LOG_INCOME'], // no amount yet
    ['mau minta uang jajan 2jt', 'ASK_PURCHASE'], // purchase trigger is checked first
    ['warteg 10k', 'LOG_EXPENSE'],
    ['kopi 20', 'LOG_EXPENSE'], // ambiguous amount still counts as an amount
    ['kopi 20k sama roti 15k', 'LOG_EXPENSE'],
    ['0k cilok', 'LOG_EXPENSE'],
    ['halo', 'UNKNOWN'],
    ['warteg', 'UNKNOWN'], // no amount, no trigger
    ['kemauan 10k', 'LOG_EXPENSE'], // "mau" only as a whole word
    ['didapetin 10k', 'LOG_EXPENSE'], // "dapet" only as a whole word
  ])('%s → %s', (text, intent) => {
    expect(detectIntent(text)).toBe(intent);
  });
});

describe('refineIntent: LOG_SAVING / LOG_INCOME follow the category', () => {
  it.each([
    ['LOG_EXPENSE', 'SAVINGS', 'LOG_SAVING'],
    ['LOG_EXPENSE', 'INCOME', 'LOG_INCOME'],
    ['LOG_EXPENSE', 'WANTS', 'LOG_EXPENSE'],
    ['LOG_EXPENSE', null, 'LOG_EXPENSE'],
    ['ASK_PURCHASE', 'SAVINGS', 'LOG_SAVING'], // "mau nabung 200k" records a saving
    ['ASK_PURCHASE', 'WANTS', 'ASK_PURCHASE'],
    ['LOG_INCOME', 'INCOME', 'LOG_INCOME'],
    ['UNKNOWN', 'NEEDS', 'UNKNOWN'],
  ] as const)('%s + %s → %s', (intent, bucket, expected) => {
    expect(refineIntent(intent, bucket)).toBe(expected);
  });
});

describe('bucketsFor', () => {
  it.each([
    ['LOG_INCOME', ['INCOME']],
    ['ASK_PURCHASE', ['NEEDS', 'WANTS', 'SAVINGS']],
    ['LOG_EXPENSE', ['NEEDS', 'WANTS', 'SAVINGS', 'INCOME']],
    ['UNKNOWN', ['NEEDS', 'WANTS', 'SAVINGS', 'INCOME']],
  ] as const)('%s → %j', (intent, buckets) => {
    expect(bucketsFor(intent)).toEqual(buckets);
  });
});
