import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { categorize, extractItem } from '@server/nlp/categorize.js';
import { DEFAULT_CATEGORIES, longestKeywordMatch, type NlpCategory } from '@server/nlp/keywords.js';

const own: NlpCategory = { id: 'cat_kucing', slug: 'kucing', name: 'Kucing', bucket: 'NEEDS', keywords: [] };
const categories = [...DEFAULT_CATEGORIES, own];
const ctx = (aliases: { keyword: string; categoryId: string }[] = []) => ({ categories, aliases });

describe('step 1: user aliases come first', () => {
  it('an alias beats the default dictionary', () => {
    const r = categorize('cireng 10k', ctx([{ keyword: 'cireng', categoryId: 'sys_makan' }]), ['10k']);
    expect(r).toMatchObject({ parseMethod: 'ALIAS', matchedKeyword: 'cireng', item: 'cireng' });
    expect(r.category?.slug).toBe('makan');
  });

  it('aliases can point at the user’s own categories', () => {
    const r = categorize('whiskas 45k', ctx([{ keyword: 'whiskas', categoryId: 'cat_kucing' }]));
    expect(r.category?.slug).toBe('kucing');
  });

  it('longest alias wins; aliases are matched normalized and as whole words', () => {
    const aliases = [
      { keyword: 'Es Teh', categoryId: 'sys_jajan' },
      { keyword: 'es teh manis jumbo', categoryId: 'sys_nongkrong' },
      { keyword: 'teh', categoryId: 'sys_makan' },
    ];
    expect(categorize('es teh manis jumbo 8k', ctx(aliases)).category?.slug).toBe('nongkrong');
    expect(categorize('es teh 5k', ctx(aliases)).category?.slug).toBe('jajan');
    expect(categorize('tehnya 5k', ctx(aliases)).parseMethod).toBeNull();
  });

  it('ignores aliases to categories that are unknown or outside the allowed buckets', () => {
    const aliases = [
      { keyword: 'bonus', categoryId: 'deleted_cat' },
      { keyword: 'arisan', categoryId: 'sys_jajan' },
    ];
    expect(categorize('bonus 100k', ctx(aliases)).category).toBeNull();
    expect(categorize('arisan 100k', { ...ctx(aliases), buckets: ['INCOME'] }).category).toBeNull();
  });
});

describe('step 2: default keywords, longest first, whole words', () => {
  it.each([
    ['es kopi susu', 'es kopi', 'jajan'],
    ['dapet uang jajan', 'uang jajan', 'uang-jajan'], // not "jajan" (WANTS)
    ['makan siang padang', 'makan siang', 'makan'],
    ['grabfood ayam', 'grabfood', 'makan'], // not "grab" (transport)
    ['ngopi bareng', 'ngopi bareng', 'nongkrong'], // "kopi" isn't inside "ngopi" as a word
    ['nonton bioskop', 'bioskop', 'nongkrong'],
    ['sarapan nasi uduk', 'sarapan', 'makan'],
  ])('%s → "%s" (%s)', (text, keyword, slug) => {
    const r = categorize(text, ctx());
    expect(r).toMatchObject({ parseMethod: 'RULE', matchedKeyword: keyword });
    expect(r.category?.slug).toBe(slug);
  });

  it.each(['tolong 10k', 'kemasan 5k', 'tjiwi 3k', 'grabbing 10k', 'kopiah 50k'])(
    'no false hit inside a word: %s',
    (text) => {
      expect(categorize(text, ctx()).category).toBeNull();
    },
  );

  it('respects the allowed buckets', () => {
    expect(categorize('gaji 5jt', { ...ctx(), buckets: ['NEEDS', 'WANTS', 'SAVINGS'] }).category).toBeNull();
    expect(categorize('gaji 5jt', { ...ctx(), buckets: ['INCOME'] }).category?.slug).toBe('uang-jajan');
  });

  it('ties keep category order', () => {
    const a = { keyword: 'abc', value: 'first' };
    const b = { keyword: 'abc', value: 'second' };
    expect(longestKeywordMatch('abc', [a, b])?.value).toBe('first');
    expect(longestKeywordMatch('abc', [{ keyword: '', value: 'empty' }])).toBeNull();
  });
});

describe('steps 3–4', () => {
  it('no rule or alias hit: no category yet (the bot tries Groq, then asks)', () => {
    expect(categorize('indomaret 30k', ctx(), ['30k'])).toEqual({
      category: null,
      parseMethod: null,
      matchedKeyword: null,
      item: 'indomaret',
    });
  });
});

describe('extractItem', () => {
  it.each([
    ['aku jajan cireng 10k', ['10k'], null, 'cireng'],
    ['tadi beli boba 25k dong', ['25k'], null, 'boba'],
    ['boleh ga beli seblak 15k?', ['15k'], null, 'seblak'],
    ['jajan 10k', ['10k'], null, 'jajan'], // only fillers left → keep them
    ['dapet uang jajan 2jt', ['2jt'], 'uang jajan', 'uang jajan'], // matched keyword is kept whole
    ['Grab ke kampus!!! 22k', ['22k'], null, 'grab kampus'],
    ['kopi 20k sama roti 15k', ['20k', '15k'], null, 'kopi sama roti'],
    ['50rb-an buat makan', ['50rb-an'], null, 'makan'],
  ])('%j → %j', (text, amounts, keep, item) => {
    expect(extractItem(text, amounts, keep)).toBe(item);
  });

  it('is capped at 120 characters', () => {
    expect(extractItem(`${'panjang '.repeat(40)}10k`, ['10k'])).toHaveLength(120);
  });
});

describe('DEFAULT_CATEGORIES matches the seed migration', () => {
  it('same slugs, names, buckets and keywords as prisma/migrations/*_seed_categories', () => {
    const dir = new URL('../../prisma/migrations/', import.meta.url);
    const seedDir = readdirSync(dir).find((d) => d.endsWith('_seed_categories')) as string;
    const sql = readFileSync(new URL(`${seedDir}/migration.sql`, dir), 'utf8');
    const rows = [
      ...sql.matchAll(/\('(sys_\w+)', NULL, '([\w-]+)', '([^']+)', NULL, '(\w+)',\s*ARRAY\[([^\]]*)\]\)/g),
    ].map(([, id, slug, name, bucket, keywords]) => ({
      id,
      slug,
      name,
      bucket,
      keywords: [...(keywords as string).matchAll(/'([^']*)'/g)].map((k) => k[1]),
    }));
    expect(rows).toEqual(DEFAULT_CATEGORIES);
  });
});
