import type { Bucket } from '../budget/engine.js';
import { phraseRegex } from './text.js';

// The default keyword dictionary and the keyword matcher (BOT_SPEC §2.3 step 2). Pure.
// At runtime the dictionary comes from the seeded system categories in the DB (they can change through data
// migrations). DEFAULT_CATEGORIES mirrors the seed migration for tests; a test keeps the two in sync.

export type NlpCategory = { id: string; slug: string; name: string; bucket: Bucket; keywords: readonly string[] };

export const DEFAULT_CATEGORIES: readonly NlpCategory[] = [
  {
    id: 'sys_makan',
    slug: 'makan',
    name: 'Makan',
    bucket: 'NEEDS',
    keywords: ['warteg', 'nasi', 'padang', 'makan siang', 'makan malam', 'sarapan', 'gofood', 'grabfood', 'shopeefood'],
  },
  {
    id: 'sys_transport',
    slug: 'transport',
    name: 'Transport',
    bucket: 'NEEDS',
    keywords: [
      'gojek',
      'goride',
      'gocar',
      'grab',
      'maxim',
      'ojol',
      'krl',
      'transjakarta',
      'tj',
      'mrt',
      'lrt',
      'bensin',
      'parkir',
      'tol',
      'angkot',
    ],
  },
  {
    id: 'sys_belanja_bulanan',
    slug: 'belanja-bulanan',
    name: 'Belanja Bulanan',
    bucket: 'NEEDS',
    keywords: ['belanja bulanan', 'sabun', 'sampo', 'deterjen', 'odol', 'superindo'],
  },
  {
    id: 'sys_kuota',
    slug: 'kuota',
    name: 'Kuota',
    bucket: 'NEEDS',
    keywords: ['kuota', 'pulsa', 'paket data', 'internet'],
  },
  {
    id: 'sys_jajan',
    slug: 'jajan',
    name: 'Jajan',
    bucket: 'WANTS',
    keywords: [
      'jajan',
      'cireng',
      'donat',
      'boba',
      'seblak',
      'cilok',
      'martabak',
      'cemilan',
      'snack',
      'es kopi',
      'kopi',
    ],
  },
  {
    id: 'sys_nongkrong',
    slug: 'nongkrong',
    name: 'Nongkrong',
    bucket: 'WANTS',
    keywords: ['nongkrong', 'cafe', 'kafe', 'ngopi bareng', 'nonton', 'bioskop', 'karaoke'],
  },
  {
    id: 'sys_nabung',
    slug: 'nabung',
    name: 'Nabung',
    bucket: 'SAVINGS',
    keywords: ['nabung', 'tabungan', 'reksadana', 'saham', 'emas', 'deposito'],
  },
  {
    id: 'sys_uang_jajan',
    slug: 'uang-jajan',
    name: 'Uang Jajan',
    bucket: 'INCOME',
    keywords: ['uang jajan', 'uang saku', 'dikasih', 'transfer mama', 'transfer papa', 'gaji'],
  },
];

export type KeywordHit<T> = { keyword: string; value: T };

/**
 * Finds the longest keyword that appears in `text` as whole words ("es kopi" beats "kopi", "grabfood" isn't
 * "grab"). Ties keep the order of `entries`. Keywords are expected normalized (lowercase).
 */
export function longestKeywordMatch<T>(text: string, entries: readonly KeywordHit<T>[]): KeywordHit<T> | null {
  const byLength = entries
    .map((entry, order) => ({ entry, order }))
    .sort((a, b) => b.entry.keyword.length - a.entry.keyword.length || a.order - b.order);
  return byLength.find(({ entry }) => entry.keyword !== '' && phraseRegex(entry.keyword).test(text))?.entry ?? null;
}
