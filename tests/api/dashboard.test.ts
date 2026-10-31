import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ErrorBody } from '@server/lib/errors.js';
import { formatRupiah as rp } from '@server/lib/money.js';
import { DEFAULT_CATEGORIES } from '@server/nlp/keywords.js';
import { APP_URL } from '../auth/fakes.js';
import { person, replies, setup, text } from '../bot/harness.js';
import { apiWorld } from './harness.js';

// M11, the dashboard API (API.md) over the real app and in-memory repos. Today: Wed 11 Nov 2026, 10:00 WIB.

const errorCode = (res: request.Response) => (res.body as ErrorBody).error.code;
const NOW = new Date('2026-11-11T03:00:00.000Z');

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

/** BUDGET_RULES §8 plus a needs expense: income 2.000.000 on 1 Nov; jajan 15k (1 Nov), 170k (3 Nov), 50k (9 Nov). */
function section8() {
  const world = apiWorld(NOW);
  world.db.seed('u1', 'INCOME', 2_000_000, '2026-11-01', 'sys_uang_jajan');
  world.db.seed('u1', 'EXPENSE', 15_000, '2026-11-01', 'sys_jajan');
  world.db.seed('u1', 'EXPENSE', 170_000, '2026-11-03', 'sys_jajan');
  world.db.seed('u1', 'EXPENSE', 50_000, '2026-11-09', 'sys_jajan');
  world.db.seed('u1', 'EXPENSE', 30_000, '2026-11-10', 'sys_makan');
  return world;
}

type Budget = {
  state: string;
  segment: { start: string; end: string; remainingDays: number };
  needs: { week: Record<string, number>; month: Record<string, number>; carryIn: number };
  wants: { week: Record<string, number>; month: Record<string, number>; dailyPace: number };
  savings: { total: number; target: number; progressPct: number; recorded: number; bonus: number };
  savedBySkipping: unknown;
};

describe('GET /api/budget/current', () => {
  it('the BUDGET_RULES §8 numbers, per bucket', async () => {
    const res = await section8().A.get('/api/budget/current');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      state: 'OK',
      today: '2026-11-11',
      segment: { start: '2026-11-09', end: '2026-11-15', days: 7, remainingDays: 5 },
      wants: {
        week: { allocation: 110_000, spent: 50_000, remaining: 60_000, base: 140_000, debtIn: 30_000 },
        month: { allocation: 600_000, remaining: 360_000 },
        dailyPace: 12_000,
      },
      needs: {
        week: { allocation: 499_999, spent: 30_000, remaining: 469_999 },
        month: { allocation: 1_000_000, spent: 30_000, remaining: 970_000 },
        carryIn: 0,
      },
      savings: { recorded: 0, bonus: 5_000, total: 5_000, target: 400_000, progressPct: 1 },
      savedBySkipping: { week: { amount: 0, count: 0 }, month: { amount: 0, count: 0 } },
    });
  });

  it('equals /sisa in Telegram for the same account (one source: budget/service)', async () => {
    const world = section8();
    const bot = setup({ db: world.db, now: NOW });
    await bot.send(text(person(111), '/sisa', { date: NOW }));
    const sisa = String(replies(bot.calls)[0]).split('\n');

    const b = (await world.A.get('/api/budget/current')).body as Budget;
    expect(sisa.slice(1)).toEqual([
      `Jajan: ${rp(b.wants.week.remaining as number)} · bulan ini ${rp(b.wants.month.remaining as number)}`,
      `${rp(b.wants.dailyPace)}/hari buat ${b.segment.remainingDays} hari lagi`,
      `Pokok: ${rp(b.needs.week.remaining as number)} · bulan ini ${rp(b.needs.month.remaining as number)}`,
      `🐷 Tabungan: ${rp(b.savings.total)}/${rp(b.savings.target)} (${b.savings.progressPct}%)`,
    ]);
  });

  it('a month without income is NO_BUDGET (remaining figures 0), like /sisa', async () => {
    const world = apiWorld(NOW);
    const body = (await world.B.get('/api/budget/current')).body as Budget;
    expect(body.state).toBe('NO_BUDGET');
    expect(body.wants.week.remaining).toBe(0);
    expect(body.needs.week.remaining).toBe(0);
  });
});

describe('GET /api/summary', () => {
  /** A fixture month: November 2026, plus a row on each side of it. */
  function fixture() {
    const world = apiWorld(NOW);
    const seed = (type: 'INCOME' | 'EXPENSE' | 'SAVING', amount: number, date: string, cat: string | null) =>
      world.db.seed('u1', type, amount, date, cat);
    seed('EXPENSE', 99_000, '2026-10-31', 'sys_makan');
    seed('INCOME', 2_000_000, '2026-11-01', 'sys_uang_jajan');
    seed('EXPENSE', 30_000, '2026-11-02', 'sys_makan');
    seed('EXPENSE', 20_000, '2026-11-02', 'sys_transport');
    seed('EXPENSE', 15_000, '2026-11-08', 'sys_jajan');
    seed('EXPENSE', 50_000, '2026-11-09', 'sys_jajan');
    seed('SAVING', 300_000, '2026-11-15', 'sys_nabung');
    seed('EXPENSE', 100_000, '2026-11-20', 'sys_nongkrong');
    seed('EXPENSE', 200_000, '2026-11-30', 'sys_belanja_bulanan');
    seed('EXPENSE', 7_000, '2026-12-01', 'sys_makan');
    world.db.seed('u2', 'EXPENSE', 555_000, '2026-11-10', 'sys_jajan'); // someone else's
    return world;
  }
  const point = (start: string, end: string, income = 0, expense = 0, saving = 0) => ({
    start,
    end,
    income,
    expense,
    saving,
  });

  it('month: totals, byBucket, byCategory, and one point per week segment', async () => {
    const res = await fixture().A.get('/api/summary?period=month&date=2026-11-15');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      period: 'month',
      range: { start: '2026-11-01', end: '2026-11-30' },
      totals: { income: 2_000_000, expense: 415_000, saving: 300_000 },
      byBucket: [
        { bucket: 'NEEDS', amount: 250_000 },
        { bucket: 'WANTS', amount: 165_000 },
        { bucket: 'SAVINGS', amount: 300_000 },
      ],
      byCategory: [
        { categoryId: 'sys_nabung', name: 'Nabung', bucket: 'SAVINGS', amount: 300_000 },
        { categoryId: 'sys_belanja_bulanan', name: 'Belanja Bulanan', bucket: 'NEEDS', amount: 200_000 },
        { categoryId: 'sys_nongkrong', name: 'Nongkrong', bucket: 'WANTS', amount: 100_000 },
        { categoryId: 'sys_jajan', name: 'Jajan', bucket: 'WANTS', amount: 65_000 },
        { categoryId: 'sys_makan', name: 'Makan', bucket: 'NEEDS', amount: 30_000 },
        { categoryId: 'sys_transport', name: 'Transport', bucket: 'NEEDS', amount: 20_000 },
      ],
      series: [
        point('2026-11-01', '2026-11-01', 2_000_000),
        point('2026-11-02', '2026-11-08', 0, 65_000),
        point('2026-11-09', '2026-11-15', 0, 50_000, 300_000),
        point('2026-11-16', '2026-11-22', 0, 100_000),
        point('2026-11-23', '2026-11-29'),
        point('2026-11-30', '2026-11-30', 0, 200_000),
      ],
    });
  });

  it('week: Mon–Sun, one point per day', async () => {
    const body = (await fixture().A.get('/api/summary?period=week&date=2026-11-04')).body as {
      range: unknown;
      totals: unknown;
      series: unknown[];
    };
    expect(body.range).toEqual({ start: '2026-11-02', end: '2026-11-08' });
    expect(body.totals).toEqual({ income: 0, expense: 65_000, saving: 0 });
    expect(body.series).toHaveLength(7);
    expect(body.series[0]).toEqual(point('2026-11-02', '2026-11-02', 0, 50_000));
    expect(body.series[6]).toEqual(point('2026-11-08', '2026-11-08', 0, 15_000));
  });

  it('a week that spans two months (26 Okt – 1 Nov)', async () => {
    const body = (await fixture().A.get('/api/summary?period=week&date=2026-11-01')).body as {
      range: unknown;
      totals: unknown;
    };
    expect(body.range).toEqual({ start: '2026-10-26', end: '2026-11-01' });
    expect(body.totals).toEqual({ income: 2_000_000, expense: 99_000, saving: 0 });
  });

  it('year: one point per month', async () => {
    const body = (await fixture().A.get('/api/summary?period=year&date=2026-06-01')).body as {
      totals: unknown;
      series: { start: string; expense: number }[];
    };
    expect(body.totals).toEqual({ income: 2_000_000, expense: 521_000, saving: 300_000 });
    expect(body.series.map((p) => p.start)).toEqual(
      Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}-01`),
    );
    expect(body.series.slice(9).map((p) => p.expense)).toEqual([99_000, 415_000, 7_000]);
  });

  it('no date → the period containing today (WIB)', async () => {
    const body = (await fixture().A.get('/api/summary?period=month')).body as { range: unknown };
    expect(body.range).toEqual({ start: '2026-11-01', end: '2026-11-30' });
  });

  it.each([
    ['no period', '/api/summary'],
    ['an unknown period', '/api/summary?period=day'],
    ['a date that doesn’t exist', '/api/summary?period=month&date=2026-02-30'],
    ['an unknown parameter', '/api/summary?period=month&userId=u2'],
  ])('%s → 400', async (_name, path) => {
    const res = await fixture().A.get(path);
    expect(res.status).toBe(400);
    expect(errorCode(res)).toBe('VALIDATION');
  });
});

describe('POST /api/transactions', () => {
  it('creates a web entry: occurredAt = the date at 12:00 WIB, source WEB, parseMethod MANUAL', async () => {
    const world = apiWorld(NOW);
    const res = await world.A.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 25_000,
      categoryId: 'sys_makan',
      note: '  nasi padang  ',
      date: '2026-11-10',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      type: 'EXPENSE',
      amount: 25_000,
      categoryId: 'sys_makan',
      category: { id: 'sys_makan', name: 'Makan', bucket: 'NEEDS', emoji: null },
      note: 'nasi padang',
      date: '2026-11-10',
      occurredAt: '2026-11-10T05:00:00.000Z',
      source: 'WEB',
      parseMethod: 'MANUAL',
    });
    expect(world.db.txs.at(-1)).toMatchObject({ userId: 'u1', amount: 25_000 });
  });

  it('income may have no category', async () => {
    const res = await apiWorld(NOW).A.post('/api/transactions', {
      type: 'INCOME',
      amount: 2_000_000,
      date: '2026-11-01',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ categoryId: null, category: null });
  });

  it.each([
    ['no type', { amount: 1, date: '2026-11-10' }],
    ['an unknown type', { type: 'GIFT', amount: 1, date: '2026-11-10' }],
    ['amount 0', { type: 'INCOME', amount: 0, date: '2026-11-10' }],
    ['a negative amount', { type: 'INCOME', amount: -5, date: '2026-11-10' }],
    ['a fractional amount (money is integer rupiah)', { type: 'INCOME', amount: 1.5, date: '2026-11-10' }],
    ['an amount over Rp100.000.000', { type: 'INCOME', amount: 100_000_001, date: '2026-11-10' }],
    ['an amount as a string', { type: 'INCOME', amount: '10000', date: '2026-11-10' }],
    ['a date that doesn’t exist', { type: 'INCOME', amount: 1, date: '2026-13-01' }],
    ['a date with a time', { type: 'INCOME', amount: 1, date: '2026-11-10T00:00:00Z' }],
    ['a note over 120 characters', { type: 'INCOME', amount: 1, date: '2026-11-10', note: 'x'.repeat(121) }],
    ['a malformed category id', { type: 'EXPENSE', amount: 1, date: '2026-11-10', categoryId: 'a b' }],
    ['a userId (strict: unknown keys are rejected)', { type: 'INCOME', amount: 1, date: '2026-11-10', userId: 'u2' }],
    ['a source', { type: 'INCOME', amount: 1, date: '2026-11-10', source: 'BOT' }],
  ])('%s → 400 VALIDATION', async (_name, body) => {
    const world = apiWorld(NOW);
    const res = await world.A.post('/api/transactions', body);
    expect(res.status).toBe(400);
    expect(errorCode(res)).toBe('VALIDATION');
    expect(world.db.txs).toEqual([]);
  });

  it.each([
    ['EXPENSE without a category', { type: 'EXPENSE' }, 'CATEGORY_REQUIRED'],
    ['SAVING without a category', { type: 'SAVING' }, 'CATEGORY_REQUIRED'],
    ['EXPENSE in a SAVINGS category', { type: 'EXPENSE', categoryId: 'sys_nabung' }, 'INVALID_CATEGORY'],
    ['EXPENSE in the INCOME category', { type: 'EXPENSE', categoryId: 'sys_uang_jajan' }, 'INVALID_CATEGORY'],
    ['SAVING in a WANTS category', { type: 'SAVING', categoryId: 'sys_jajan' }, 'INVALID_CATEGORY'],
    ['INCOME in a NEEDS category', { type: 'INCOME', categoryId: 'sys_makan' }, 'INVALID_CATEGORY'],
    ['an unknown category', { type: 'EXPENSE', categoryId: 'cat_nope' }, 'INVALID_CATEGORY'],
  ])('invariant: %s → 400 %s', async (_name, fields, code) => {
    const world = apiWorld(NOW);
    const res = await world.A.post('/api/transactions', { amount: 10_000, date: '2026-11-10', ...fields });
    expect(res.status).toBe(400);
    expect(errorCode(res)).toBe(code);
    expect(world.db.txs).toEqual([]);
  });

  it('another user’s category is refused exactly like an unknown one', async () => {
    const world = apiWorld(NOW);
    const own = (await world.B.post('/api/categories', { name: 'Kucing', bucket: 'NEEDS' })).body as { id: string };
    const res = await world.A.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1,
      date: '2026-11-10',
      categoryId: own.id,
    });
    expect(res.status).toBe(400);
    expect(errorCode(res)).toBe('INVALID_CATEGORY');
  });

  it('an archived own category can’t be used for new entries', async () => {
    const world = apiWorld(NOW);
    const own = (await world.A.post('/api/categories', { name: 'Kucing', bucket: 'NEEDS' })).body as { id: string };
    await world.A.patch(`/api/categories/${own.id}`, { archived: true });
    const res = await world.A.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1,
      date: '2026-11-10',
      categoryId: own.id,
    });
    expect(errorCode(res)).toBe('INVALID_CATEGORY');
  });
});

describe('GET / PATCH / DELETE /api/transactions/:id', () => {
  async function withExpense() {
    const world = apiWorld(NOW);
    const res = await world.A.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 25_000,
      categoryId: 'sys_makan',
      note: 'nasi',
      date: '2026-11-10',
    });
    return { ...world, id: (res.body as { id: string }).id };
  }

  it('GET returns it', async () => {
    const world = await withExpense();
    expect((await world.A.get(`/api/transactions/${world.id}`)).body).toMatchObject({ id: world.id, amount: 25_000 });
  });

  it('PATCH: amount, note (null clears it), and date (moves localDate, occurredAt = 12:00 WIB)', async () => {
    const world = await withExpense();
    const res = await world.A.patch(`/api/transactions/${world.id}`, {
      amount: 30_000,
      note: null,
      date: '2026-11-01',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      amount: 30_000,
      note: null,
      date: '2026-11-01',
      occurredAt: '2026-11-01T05:00:00.000Z',
    });
  });

  it('PATCH type + category together; the pair must still be valid', async () => {
    const world = await withExpense();
    const typeOnly = await world.A.patch(`/api/transactions/${world.id}`, { type: 'SAVING' });
    expect(errorCode(typeOnly)).toBe('INVALID_CATEGORY'); // Makan isn't SAVINGS
    const both = await world.A.patch(`/api/transactions/${world.id}`, { type: 'SAVING', categoryId: 'sys_nabung' });
    expect(both.body).toMatchObject({ type: 'SAVING', categoryId: 'sys_nabung' });
    const cleared = await world.A.patch(`/api/transactions/${world.id}`, { categoryId: null });
    expect(errorCode(cleared)).toBe('CATEGORY_REQUIRED');
  });

  it.each([
    ['an empty body', {}],
    ['an unknown key', { userId: 'u2' }],
    ['a bad amount', { amount: 0 }],
  ])('PATCH with %s → 400, nothing changes', async (_name, body) => {
    const world = await withExpense();
    const res = await world.A.patch(`/api/transactions/${world.id}`, body);
    expect(res.status).toBe(400);
    expect(world.db.txs.at(-1)).toMatchObject({ amount: 25_000, userId: 'u1' });
  });

  it('DELETE soft-deletes: gone from GET and lists; a second DELETE is 404', async () => {
    const world = await withExpense();
    expect((await world.A.delete(`/api/transactions/${world.id}`)).body).toEqual({ ok: true });
    expect(world.db.txs.at(-1)?.deletedAt).toEqual(NOW);
    expect((await world.A.get(`/api/transactions/${world.id}`)).status).toBe(404);
    expect(((await world.A.get('/api/transactions')).body as { items: unknown[] }).items).toEqual([]);
    expect((await world.A.delete(`/api/transactions/${world.id}`)).status).toBe(404);
  });

  it.each(['/api/transactions/nope', '/api/transactions/a%20b'])(
    'an unknown or malformed id (%s) → 404',
    async (path) => {
      const world = await withExpense();
      expect((await world.A.get(path)).status).toBe(404);
      expect((await world.A.patch(path, { amount: 1 })).status).toBe(404);
      expect((await world.A.delete(path)).status).toBe(404);
    },
  );
});

describe('GET /api/transactions: filters and cursor pagination', () => {
  async function seven() {
    const world = apiWorld(NOW);
    const add = (type: string, amount: number, date: string, categoryId?: string, note?: string) =>
      world.A.post('/api/transactions', {
        type,
        amount,
        date,
        ...(categoryId && { categoryId }),
        ...(note && { note }),
      });
    await add('INCOME', 2_000_000, '2026-11-01');
    await add('EXPENSE', 10_000, '2026-11-02', 'sys_makan', 'Warteg Bahari');
    await add('EXPENSE', 20_000, '2026-11-02', 'sys_transport', 'gojek');
    await add('EXPENSE', 30_000, '2026-11-05', 'sys_jajan', 'donat');
    await add('SAVING', 40_000, '2026-11-06', 'sys_nabung');
    await add('EXPENSE', 50_000, '2026-11-09', 'sys_makan', 'warteg lagi');
    await add('EXPENSE', 60_000, '2026-11-10', 'sys_jajan');
    await world.B.post('/api/transactions', { type: 'INCOME', amount: 9, date: '2026-11-10' }); // not A's
    return world;
  }
  type Page = { items: { amount: number; date: string }[]; nextCursor: string | null };

  it('newest first; pages of `limit` linked by nextCursor, no gaps, no repeats, null at the end', async () => {
    const world = await seven();
    const seen: number[] = [];
    let cursor: string | null = null;
    const sizes: number[] = [];
    do {
      const query: string = `/api/transactions?limit=3${cursor ? `&cursor=${cursor}` : ''}`;
      const page = (await world.A.get(query)).body as Page;
      sizes.push(page.items.length);
      seen.push(...page.items.map((t) => t.amount));
      cursor = page.nextCursor;
    } while (cursor);
    expect(sizes).toEqual([3, 3, 1]);
    expect(seen).toEqual([60_000, 50_000, 40_000, 30_000, 20_000, 10_000, 2_000_000]);
  });

  it.each([
    ['type', 'type=EXPENSE', [60_000, 50_000, 30_000, 20_000, 10_000]],
    ['category', 'categoryId=sys_makan', [50_000, 10_000]],
    ['date range', 'from=2026-11-02&to=2026-11-05', [30_000, 20_000, 10_000]],
    ['note search, case-insensitive', 'q=WARTEG', [50_000, 10_000]],
    ['combined', 'type=EXPENSE&from=2026-11-06', [60_000, 50_000]],
  ])('filter by %s', async (_name, query, amounts) => {
    const page = (await (await seven()).A.get(`/api/transactions?${query}`)).body as Page;
    expect(page.items.map((t) => t.amount)).toEqual(amounts);
  });

  it.each([
    ['limit 0', 'limit=0'],
    ['limit over 100', 'limit=101'],
    ['a tampered cursor', 'cursor=bm90LWEtY3Vyc29y'],
    ['garbage in the cursor', 'cursor=%%%'],
    ['a bad date', 'from=2026-11-31'],
    ['an unknown parameter', 'userId=u2'],
  ])('%s → 400', async (_name, query) => {
    expect((await (await seven()).A.get(`/api/transactions?${query}`)).status).toBe(400);
  });
});

describe('/api/categories and /api/aliases', () => {
  type Cat = { id: string; slug: string; name: string; own: boolean; archived: boolean; bucket: string };

  it('GET: the system categories plus the user’s own', async () => {
    const world = apiWorld(NOW);
    await world.A.post('/api/categories', { name: 'Kucing', bucket: 'NEEDS', emoji: '🐱' });
    const a = (await world.A.get('/api/categories')).body as Cat[];
    expect(a.filter((c) => !c.own).map((c) => c.id)).toEqual(DEFAULT_CATEGORIES.map((c) => c.id));
    expect(a.filter((c) => c.own)).toMatchObject([{ slug: 'kucing', name: 'Kucing', bucket: 'NEEDS', emoji: '🐱' }]);
    expect(((await world.B.get('/api/categories')).body as Cat[]).some((c) => c.own)).toBe(false);
  });

  it.each([
    ['an INCOME bucket', { name: 'Bonus', bucket: 'INCOME' }, 400],
    ['no letters or digits', { name: '!!!', bucket: 'NEEDS' }, 400],
    ['an emoji that isn’t one', { name: 'Kucing', bucket: 'NEEDS', emoji: 'cat' }, 400],
    ['an unknown key', { name: 'Kucing', bucket: 'NEEDS', userId: 'u2' }, 400],
    ['the name of a system category', { name: 'makan', bucket: 'NEEDS' }, 409],
  ])('POST with %s → %i', async (_name, body, status) => {
    expect((await apiWorld(NOW).A.post('/api/categories', body)).status).toBe(status);
  });

  it('POST twice with the same name → 409; an own category is usable for transactions', async () => {
    const world = apiWorld(NOW);
    const created = (await world.A.post('/api/categories', { name: 'Kucing', bucket: 'NEEDS' })).body as Cat;
    expect((await world.A.post('/api/categories', { name: 'KUCING', bucket: 'WANTS' })).status).toBe(409);
    const tx = await world.A.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 50_000,
      date: '2026-11-10',
      categoryId: created.id,
    });
    expect(tx.status).toBe(201);
  });

  it('PATCH own: rename (slug stays), archive (gone from GET)', async () => {
    const world = apiWorld(NOW);
    const created = (await world.A.post('/api/categories', { name: 'Kucing', bucket: 'NEEDS' })).body as Cat;
    const renamed = await world.A.patch(`/api/categories/${created.id}`, { name: 'Kucing Oren' });
    expect(renamed.body).toMatchObject({ name: 'Kucing Oren', slug: 'kucing' });
    await world.A.patch(`/api/categories/${created.id}`, { archived: true });
    expect(((await world.A.get('/api/categories')).body as Cat[]).some((c) => c.id === created.id)).toBe(false);
  });

  it('PATCH a system category → 403 READ_ONLY; a name clash → 409', async () => {
    const world = apiWorld(NOW);
    const res = await world.A.patch('/api/categories/sys_makan', { name: 'Makanan' });
    expect(res.status).toBe(403);
    expect(errorCode(res)).toBe('READ_ONLY');
    const created = (await world.A.post('/api/categories', { name: 'Kucing', bucket: 'NEEDS' })).body as Cat;
    expect((await world.A.patch(`/api/categories/${created.id}`, { name: 'Jajan' })).status).toBe(409);
  });

  it('aliases: GET lists the learned keywords; DELETE removes one', async () => {
    const world = apiWorld(NOW);
    world.db.aliases.push({ id: 'al1', userId: 'u1', keyword: 'cimol', categoryId: 'sys_jajan', createdAt: NOW });
    expect((await world.A.get('/api/aliases')).body).toEqual([
      { id: 'al1', keyword: 'cimol', category: { id: 'sys_jajan', name: 'Jajan', bucket: 'WANTS' } },
    ]);
    expect((await world.A.delete('/api/aliases/al1')).body).toEqual({ ok: true });
    expect(world.db.aliases).toEqual([]);
    expect((await world.A.delete('/api/aliases/al1')).status).toBe(404);
  });
});

describe('cross-user: another user’s ids are always 404 (SECURITY §3.3)', () => {
  async function aHasEverything() {
    const world = apiWorld(NOW);
    const tx = (
      await world.A.post('/api/transactions', {
        type: 'EXPENSE',
        amount: 25_000,
        categoryId: 'sys_makan',
        date: '2026-11-10',
      })
    ).body as { id: string };
    const cat = (await world.A.post('/api/categories', { name: 'Kucing', bucket: 'NEEDS' })).body as { id: string };
    world.db.aliases.push({ id: 'al_a', userId: 'u1', keyword: 'cimol', categoryId: 'sys_jajan', createdAt: NOW });
    return { ...world, txId: tx.id, catId: cat.id };
  }

  it.each([
    ['GET a transaction', (w: Awaited<ReturnType<typeof aHasEverything>>) => w.B.get(`/api/transactions/${w.txId}`)],
    [
      'PATCH a transaction',
      (w: Awaited<ReturnType<typeof aHasEverything>>) => w.B.patch(`/api/transactions/${w.txId}`, { amount: 1 }),
    ],
    [
      'DELETE a transaction',
      (w: Awaited<ReturnType<typeof aHasEverything>>) => w.B.delete(`/api/transactions/${w.txId}`),
    ],
    [
      'PATCH a category',
      (w: Awaited<ReturnType<typeof aHasEverything>>) => w.B.patch(`/api/categories/${w.catId}`, { name: 'Mine' }),
    ],
    ['DELETE an alias', (w: Awaited<ReturnType<typeof aHasEverything>>) => w.B.delete('/api/aliases/al_a')],
  ])('%s → 404, and A’s data is unchanged', async (_name, attempt) => {
    const world = await aHasEverything();
    const before = structuredClone({ txs: world.db.txs, categories: world.db.categories, aliases: world.db.aliases });
    const res = await attempt(world);
    expect(res.status).toBe(404);
    expect(errorCode(res)).toBe('NOT_FOUND');
    expect({ txs: world.db.txs, categories: world.db.categories, aliases: world.db.aliases }).toEqual(before);
  });

  it('B’s lists never include A’s rows', async () => {
    const world = await aHasEverything();
    expect(((await world.B.get('/api/transactions')).body as { items: unknown[] }).items).toEqual([]);
    expect((await world.B.get('/api/aliases')).body).toEqual([]);
    expect(((await world.B.get('/api/summary?period=month')).body as { totals: unknown }).totals).toEqual({
      income: 0,
      expense: 0,
      saving: 0,
    });
  });
});

describe('auth on every endpoint', () => {
  it.each([
    ['get', '/api/budget/current'],
    ['get', '/api/summary?period=month'],
    ['get', '/api/transactions'],
    ['get', '/api/transactions/x'],
    ['post', '/api/transactions'],
    ['patch', '/api/transactions/x'],
    ['delete', '/api/transactions/x'],
    ['get', '/api/categories'],
    ['post', '/api/categories'],
    ['patch', '/api/categories/x'],
    ['get', '/api/aliases'],
    ['delete', '/api/aliases/x'],
  ] as const)('%s %s without credentials → 401', async (method, path) => {
    const res = await request(apiWorld(NOW).app)[method](path);
    expect(res.status).toBe(401);
  });

  it('a cookie session needs the CSRF headers to change anything', async () => {
    const world = apiWorld(NOW);
    // Sign in through a magic link like a browser would.
    const link = await world.auth.createMagicLink('u1');
    const token = new URL(link?.url ?? '').searchParams.get('token');
    const redeemed = await request(world.app)
      .post('/api/auth/magic')
      .set('origin', APP_URL)
      .set('x-requested-with', 'fetch')
      .send({ token });
    const cookie = String(([] as string[]).concat(redeemed.headers['set-cookie'] ?? [])[0]).split(';')[0] ?? '';
    const body = { type: 'INCOME', amount: 1, date: '2026-11-10' };

    const forged = await request(world.app).post('/api/transactions').set('cookie', cookie).send(body);
    expect(forged.status).toBe(403);
    expect(world.db.txs).toEqual([]);

    const ok = await request(world.app)
      .post('/api/transactions')
      .set('cookie', cookie)
      .set('origin', APP_URL)
      .set('x-requested-with', 'fetch')
      .send(body);
    expect(ok.status).toBe(201);
  });
});
