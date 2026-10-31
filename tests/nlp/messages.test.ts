import { describe, expect, it } from 'vitest';
import type { AmountResult } from '@server/nlp/amount.js';
import { DEFAULT_CATEGORIES } from '@server/nlp/keywords.js';
import { isAmountOnly, parseMessage } from '@server/nlp/message.js';

// Real-looking Indonesian chat messages through the whole deterministic pipeline (BOT_SPEC §2).
// amount: a number, or the error code. category: slug or null (→ Groq in M4, then ask the user).

const ctx = { categories: DEFAULT_CATEGORIES, aliases: [] };

type Row = [text: string, amount: number | string, intent: string, category: string | null, item: string];

const amountOf = (r: AmountResult) => ('amount' in r && !('error' in r) ? r.amount : (r as { error: string }).error);

const rows: Row[] = [
  // the examples named in the milestone
  ['aku jajan cireng 10k', 10_000, 'LOG_EXPENSE', 'jajan', 'cireng'],
  ['gojek 18k', 18_000, 'LOG_EXPENSE', 'transport', 'gojek'],
  ['gofood 25rb', 25_000, 'LOG_EXPENSE', 'makan', 'gofood'], // food delivery = makan, not transport
  ['warteg 10k', 10_000, 'LOG_EXPENSE', 'makan', 'warteg'],
  ['reksadana 200k', 200_000, 'LOG_SAVING', 'nabung', 'reksadana'],
  ['mau donat 35k', 35_000, 'ASK_PURCHASE', 'jajan', 'donat'],
  ['dapet uang jajan 2jt', 2_000_000, 'LOG_INCOME', 'uang-jajan', 'uang jajan'],
  ['kopi 20', 'AMBIGUOUS_SMALL', 'LOG_EXPENSE', 'jajan', 'kopi'],
  ['kopi 20k sama roti 15k', 'MULTIPLE', 'LOG_EXPENSE', 'jajan', 'kopi sama roti'],
  ['indomaret 30k', 30_000, 'LOG_EXPENSE', null, 'indomaret'], // ambiguous minimarket: no rule
  // transport
  ['grabfood 30rb', 30_000, 'LOG_EXPENSE', 'makan', 'grabfood'],
  ['grab ke kampus 22k', 22_000, 'LOG_EXPENSE', 'transport', 'grab kampus'],
  ['gocar 45.000', 45_000, 'LOG_EXPENSE', 'transport', 'gocar'],
  ['krl 5k', 5_000, 'LOG_EXPENSE', 'transport', 'krl'],
  ['isi bensin 20rb', 20_000, 'LOG_EXPENSE', 'transport', 'isi bensin'],
  ['parkir 2rb', 2_000, 'LOG_EXPENSE', 'transport', 'parkir'],
  ['tadi naik tj 3,5k', 3_500, 'LOG_EXPENSE', 'transport', 'naik tj'],
  ['goceng parkir', 5_000, 'LOG_EXPENSE', 'transport', 'parkir'],
  ['GOJEK 18K', 18_000, 'LOG_EXPENSE', 'transport', 'gojek'],
  // makan
  ['sarapan nasi uduk 12k', 12_000, 'LOG_EXPENSE', 'makan', 'sarapan nasi uduk'],
  ['makan siang padang 25 ribu', 25_000, 'LOG_EXPENSE', 'makan', 'makan siang padang'],
  ['shopeefood ayam geprek 30k', 30_000, 'LOG_EXPENSE', 'makan', 'shopeefood ayam geprek'],
  ['Rp 10.000 nasi padang', 10_000, 'LOG_EXPENSE', 'makan', 'nasi padang'],
  ['nasi padang 2 bungkus 30k', 30_000, 'LOG_EXPENSE', 'makan', 'nasi padang 2 bungkus'],
  ['  warteg    15k  ', 15_000, 'LOG_EXPENSE', 'makan', 'warteg'],
  // kuota, belanja bulanan
  ['beli pulsa 50rb', 50_000, 'LOG_EXPENSE', 'kuota', 'pulsa'],
  ['paket data 100k', 100_000, 'LOG_EXPENSE', 'kuota', 'paket data'],
  ['sabun sama sampo 35k', 35_000, 'LOG_EXPENSE', 'belanja-bulanan', 'sabun sama sampo'],
  ['belanja bulanan di superindo 350k', 350_000, 'LOG_EXPENSE', 'belanja-bulanan', 'belanja bulanan superindo'],
  // jajan, nongkrong
  ['boba 28k', 28_000, 'LOG_EXPENSE', 'jajan', 'boba'],
  ['es kopi susu 22k', 22_000, 'LOG_EXPENSE', 'jajan', 'es kopi susu'],
  ['seblak level 5 15k', 15_000, 'LOG_EXPENSE', 'jajan', 'seblak level 5'],
  ['martabak manis 1 loyang 60rb', 60_000, 'LOG_EXPENSE', 'jajan', 'martabak manis 1 loyang'],
  ['cireng seceng', 1_000, 'LOG_EXPENSE', 'jajan', 'cireng'],
  ['rp15.000 cemilan', 15_000, 'LOG_EXPENSE', 'jajan', 'cemilan'],
  ['nonton bioskop 50k', 50_000, 'LOG_EXPENSE', 'nongkrong', 'nonton bioskop'],
  ['ngopi bareng temen 40k', 40_000, 'LOG_EXPENSE', 'nongkrong', 'ngopi bareng temen'],
  ['karaoke 100rb', 100_000, 'LOG_EXPENSE', 'nongkrong', 'karaoke'],
  // savings
  ['nabung 500k', 500_000, 'LOG_SAVING', 'nabung', 'nabung'],
  ['beli emas 1jt', 1_000_000, 'LOG_SAVING', 'nabung', 'emas'],
  ['mau nabung 200k', 200_000, 'LOG_SAVING', 'nabung', 'nabung'], // not a purchase check (owner decision)
  // income
  ['uang saku 1,5jt', 1_500_000, 'LOG_INCOME', 'uang-jajan', 'uang saku'],
  ['dikasih mama 500rb', 500_000, 'LOG_INCOME', 'uang-jajan', 'dikasih mama'], // matched keyword kept in the note
  ['gaji 5jt', 5_000_000, 'LOG_INCOME', 'uang-jajan', 'gaji'], // income via the category (refineIntent)
  ['gajian 3jt', 3_000_000, 'LOG_INCOME', null, 'gajian'], // "gajian" is a trigger, not a seeded keyword
  ['transfer dari papa 1jt', 1_000_000, 'LOG_INCOME', null, 'transfer papa'],
  // purchase checks
  ['pengen boba 25k', 25_000, 'ASK_PURCHASE', 'jajan', 'boba'],
  ['pingin martabak 45rb', 45_000, 'ASK_PURCHASE', 'jajan', 'martabak'],
  ['boleh ga beli seblak 15k?', 15_000, 'ASK_PURCHASE', 'jajan', 'seblak'],
  ['bolehkah nonton 50k', 50_000, 'ASK_PURCHASE', 'nongkrong', 'nonton'],
  ['kalo beli cilok 10k gimana', 10_000, 'ASK_PURCHASE', 'jajan', 'cilok'],
  ['mau ojol 15k', 15_000, 'ASK_PURCHASE', 'transport', 'ojol'], // NEEDS: the bot offers [Catat], no verdict
  ['mau donat', 'NONE', 'ASK_PURCHASE', 'jajan', 'donat'], // bot asks "Berapa duitnya?"
  // no amount / problems
  ['warteg', 'NONE', 'UNKNOWN', 'makan', 'warteg'], // bot asks "Berapa duitnya?" since a category matched
  ['halo', 'NONE', 'UNKNOWN', null, 'halo'],
  ['alfamart 25rb', 25_000, 'LOG_EXPENSE', null, 'alfamart'],
  ['jam 10:30 makan siang 25k', 25_000, 'LOG_EXPENSE', 'makan', 'jam 10 30 makan siang'],
  ['pulsa 150.000.000', 'OUT_OF_RANGE', 'LOG_EXPENSE', 'kuota', 'pulsa'],
  ['0k cilok', 'OUT_OF_RANGE', 'LOG_EXPENSE', 'jajan', 'cilok'],
];

describe('parseMessage: real-looking messages', () => {
  it('has at least 40 messages', () => {
    expect(rows.length).toBeGreaterThanOrEqual(40);
  });

  it.each(rows)('%j', (text, amount, intent, category, item) => {
    const r = parseMessage(text, ctx);
    expect({ amount: amountOf(r.amount), intent: r.intent, category: r.category?.slug ?? null, item: r.item }).toEqual({
      amount,
      intent,
      category,
      item,
    });
    expect(r.parseMethod).toBe(category === null ? null : 'RULE');
  });

  it('a learned alias changes the category of a later message (ALIAS)', () => {
    const r = parseMessage('indomaret 30k', {
      ...ctx,
      aliases: [{ keyword: 'indomaret', categoryId: 'sys_belanja_bulanan' }],
    });
    expect(r).toMatchObject({ parseMethod: 'ALIAS', intent: 'LOG_EXPENSE', item: 'indomaret' });
    expect(r.category?.slug).toBe('belanja-bulanan');
  });
});

describe('isAmountOnly: an answer to "Berapa duitnya?"', () => {
  it.each([
    ['10k', true],
    ['10rb aja', true],
    ['Rp 15.000', true],
    ['20', true], // still needs the "Maksudnya Rp20.000?" confirmation afterwards
    ['goceng dong', true],
    ['gojek 18k', false],
    ['10k sama 5k', false],
    ['halo', false],
    ['', false],
  ])('%j → %s', (text, expected) => {
    expect(isAmountOnly(text)).toBe(expected);
  });

  it('"pemasukan" is an income trigger (what /pemasukan 2jt is parsed as) and not the item', () => {
    expect(parseMessage('pemasukan dari papa 2jt', ctx)).toMatchObject({
      intent: 'LOG_INCOME',
      amount: { amount: 2_000_000 },
      category: null,
      item: 'papa',
    });
  });
});
