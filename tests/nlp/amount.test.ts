import { describe, expect, it } from 'vitest';
import { amountTexts, MAX_AMOUNT, parseAmount, SLANG } from '@server/nlp/amount.js';

describe('parseAmount: every format in BOT_SPEC §2.1', () => {
  it.each([
    ['10k', 10_000],
    ['10rb', 10_000],
    ['10 rb', 10_000],
    ['10ribu', 10_000],
    ['10 ribu', 10_000],
    ['10.000', 10_000],
    ['10,000', 10_000],
    ['10000', 10_000],
    ['1,5jt', 1_500_000],
    ['1.5jt', 1_500_000],
    ['1.5 juta', 1_500_000],
    ['2jt', 2_000_000],
    ['2 juta', 2_000_000],
    ['rp10.000', 10_000],
    ['Rp 10.000', 10_000],
    ['seceng', 1_000],
    ['goceng', 5_000],
    ['ceban', 10_000],
    ['gocap', 50_000],
    ['cepek', 100_000],
  ])('%s → %i', (text, amount) => {
    expect(parseAmount(`beli ${text}`)).toMatchObject({ amount });
  });
});

describe('parseAmount: more real-world shapes', () => {
  it.each([
    ['10K', 10_000, '10k'], // normalized to lowercase
    ['Rp. 25.000', 25_000, 'rp. 25.000'],
    ['IDR 50000', 50_000, 'idr 50000'],
    ['1.250.000', 1_250_000, '1.250.000'],
    ['1,500,000', 1_500_000, '1,500,000'],
    ['1,25jt', 1_250_000, '1,25jt'],
    ['0,5jt', 500_000, '0,5jt'],
    ['2,5k', 2_500, '2,5k'],
    ['3.5rb', 3_500, '3.5rb'],
    ['100jt', MAX_AMOUNT, '100jt'],
    ['15k,', 15_000, '15k'], // trailing punctuation
    ['(20rb)', 20_000, '20rb'],
    ['50rb-an', 50_000, '50rb-an'], // "around 50k"
  ])('%s → %i', (text, amount, matchedText) => {
    expect(parseAmount(text)).toEqual({ amount, matchedText });
  });

  it.each([
    ['nasi padang 2 bungkus 30k', 30_000, 'quantity next to an amount'],
    ['seblak level 5 15k', 15_000, 'level number'],
    ['2x 15k', 15_000, '"2x" is a quantity, not a number token'],
    ['jam 10:30 makan 25k', 25_000, 'time'],
    ['31/10 makan 20k', 20_000, 'date'],
    ['2 ceban', 10_000, 'slang beats a bare count'],
  ])('%s → %i (%s)', (text, amount) => {
    expect(parseAmount(text)).toMatchObject({ amount });
  });
});

describe('parseAmount: errors', () => {
  it.each([
    ['warteg', { error: 'NONE' }],
    ['', { error: 'NONE' }],
    ['kopi20k', { error: 'NONE' }], // glued to a word: not a token
    ['1,2345rb', { error: 'NONE' }], // not a whole rupiah amount
    ['kopi 1.2345', { error: 'NONE' }], // bare decimal with 4+ places: not an amount
    ['kopi 1500.5', { error: 'NONE' }], // bare decimal ≥ 1.000: not a small number
    ['kopi 20k sama roti 15k', { error: 'MULTIPLE', matches: ['20k', '15k'] }],
    ['goceng sama ceban', { error: 'MULTIPLE', matches: ['goceng', 'ceban'] }],
    ['kopi 20 roti 15', { error: 'MULTIPLE', matches: ['20', '15'] }],
    ['kopi 20', { error: 'AMBIGUOUS_SMALL', candidate: 20_000, matchedText: '20' }],
    ['parkir 2', { error: 'AMBIGUOUS_SMALL', candidate: 2_000, matchedText: '2' }],
    ['kopi 1.5', { error: 'AMBIGUOUS_SMALL', candidate: 1_500, matchedText: '1.5' }],
    ['rp 20 sama 2 bungkus', { error: 'AMBIGUOUS_SMALL', candidate: 20_000, matchedText: 'rp 20' }], // rp marks money, not size
    ['0k', { error: 'OUT_OF_RANGE', amount: 0, matchedText: '0k' }],
    ['kopi 0', { error: 'OUT_OF_RANGE', amount: 0, matchedText: '0' }],
    ['150.000.000', { error: 'OUT_OF_RANGE', amount: 150_000_000, matchedText: '150.000.000' }],
    ['101jt', { error: 'OUT_OF_RANGE', amount: 101_000_000, matchedText: '101jt' }],
  ])('%j → %j', (text, expected) => {
    expect(parseAmount(text)).toEqual(expected);
  });
});

describe('slang table', () => {
  it('every slang word parses to its value (the table is the single place to extend)', () => {
    for (const [word, value] of Object.entries(SLANG))
      expect(parseAmount(`parkir ${word}`)).toEqual({ amount: value, matchedText: word });
  });
});

describe('amountTexts', () => {
  it.each([
    ['kopi 20k', ['20k']],
    ['kopi 20', ['20']],
    ['0k', ['0k']],
    ['kopi 20k sama roti 15k', ['20k', '15k']],
    ['warteg', []],
  ])('%s → %j', (text, expected) => {
    expect(amountTexts(parseAmount(text))).toEqual(expected);
  });
});
