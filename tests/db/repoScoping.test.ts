import { describe, expect, it, vi } from 'vitest';
import { parseLocalDate } from '@server/budget/periods.js';
import type { Db } from '@server/db/prisma.js';
import { createAliasRepo } from '@server/db/repos/aliasRepo.js';
import { createCategoryRepo } from '@server/db/repos/categoryRepo.js';
import { createChatStateRepo } from '@server/db/repos/chatStateRepo.js';
import { createIntentRepo } from '@server/db/repos/intentRepo.js';
import { createTxRepo } from '@server/db/repos/txRepo.js';

// SECURITY §3.3: every query a repository sends for user data includes the caller's userId.
// A recording fake stands in for Prisma; we call each repo method as user A and inspect every query.

type Call = { model: string; method: string; args: Record<string, unknown> };

function fakeDb() {
  const calls: Call[] = [];
  const defaults: Record<string, unknown> = {
    findFirst: null,
    findUnique: null,
    findMany: [],
    count: 0,
    updateMany: { count: 1 },
    deleteMany: { count: 1 },
    createMany: { count: 1 },
    aggregate: { _sum: { amount: null }, _count: 0 },
  };
  const db = new Proxy(
    {},
    {
      get: (_t, model: string) =>
        new Proxy(
          {},
          {
            get: (_m, method: string) => (args: Record<string, unknown>) => {
              calls.push({ model, method, args });
              return Promise.resolve(method in defaults ? defaults[method] : { id: 'row', count: 1 });
            },
          },
        ),
    },
  );
  return { db: db as Db, calls };
}

const USER = 'user_A';
const now = new Date('2026-10-31T05:00:00.000Z');
const day = parseLocalDate('2026-10-31');

/** The where clause limits rows to USER (or, for categories, USER + system rows with userId NULL). */
function whereIsScoped(where: unknown): boolean {
  if (typeof where !== 'object' || where === null) return false;
  const w = where as Record<string, unknown>;
  if (w.userId === USER) return true;
  if ((w.userId_keyword as { userId?: unknown } | undefined)?.userId === USER) return true;
  if (Array.isArray(w.OR) && w.OR.length > 0) {
    return w.OR.every((branch: Record<string, unknown>) => branch.userId === USER || branch.userId === null);
  }
  return false;
}

function assertScoped(call: Call) {
  const label = `${call.model}.${call.method}`;
  const { where, data, create } = call.args as { where?: unknown; data?: unknown; create?: unknown };
  if (call.method === 'create') {
    expect((data as { userId?: unknown }).userId, label).toBe(USER);
    return;
  }
  if (call.method === 'createMany') {
    for (const row of data as { userId?: unknown }[]) expect(row.userId, label).toBe(USER);
    return;
  }
  expect(whereIsScoped(where), `${label} where = ${JSON.stringify(where)}`).toBe(true);
  if (call.method === 'upsert') expect((create as { userId?: unknown }).userId, label).toBe(USER);
}

type Case<R> = [string, (repo: R) => Promise<unknown>];

function scopingSuite<R extends object>(name: string, make: (db: Db) => R, cases: Case<R>[], exempt: string[] = []) {
  describe(name, () => {
    it('has a scoping case for every user-data method', () => {
      const covered = new Set([...cases.map(([method]) => method), ...exempt]);
      const methods = Object.keys(make(fakeDb().db));
      expect(methods.filter((m) => !covered.has(m))).toEqual([]);
    });

    it.each(cases)('%s scopes every query to the caller', async (_method, run) => {
      const { db, calls } = fakeDb();
      await run(make(db));
      expect(calls.length).toBeGreaterThan(0);
      calls.forEach(assertScoped);
    });
  });
}

scopingSuite('txRepo', createTxRepo, [
  [
    'create',
    (r) =>
      r.create(USER, {
        type: 'EXPENSE',
        amount: 10_000,
        categoryId: 'sys_makan',
        occurredAt: now,
        source: 'BOT',
        parseMethod: 'RULE',
      }),
  ],
  ['findById', (r) => r.findById(USER, 'tx_1')],
  ['listInRange', (r) => r.listInRange(USER, day, day)],
  ['listUpTo', (r) => r.listUpTo(USER, day)],
  ['hasIncomeInRange', (r) => r.hasIncomeInRange(USER, day, day)],
  [
    'listForUser',
    (r) =>
      r.listForUser(USER, {
        from: day,
        type: 'EXPENSE',
        q: 'cireng',
        limit: 500,
        after: { localDate: new Date(0), createdAt: new Date(0), id: 'tx_0' },
      }),
  ],
  ['latest', (r) => r.latest(USER, 10, now)],
  ['existsOnDate', (r) => r.existsOnDate(USER, day)],
  ['update', (r) => r.update(USER, 'tx_1', { amount: 5_000, occurredAt: now })],
  ['softDelete', (r) => r.softDelete(USER, 'tx_1', now)],
  ['restore', (r) => r.restore(USER, 'tx_1')],
]);

scopingSuite(
  'intentRepo',
  createIntentRepo,
  [
    [
      'create',
      (r) =>
        r.create(USER, {
          item: 'donat',
          amount: 35_000,
          categoryId: 'sys_jajan',
          verdict: 'ALLOW',
          localDate: day,
          expiresAt: now,
        }),
    ],
    ['findById', (r) => r.findById(USER, 'pi_1')],
    ['markBought', (r) => r.markBought(USER, 'pi_1', 'tx_1', now)],
    ['markSkipped', (r) => r.markSkipped(USER, 'pi_1', now)],
    ['sumSkipped', (r) => r.sumSkipped(USER, day, day)],
  ],
  ['expireOverdue'],
); // housekeeping across all users, no user input

scopingSuite('categoryRepo', createCategoryRepo, [
  ['listUsable', (r) => r.listUsable(USER)],
  ['findUsableById', (r) => r.findUsableById(USER, 'cat_1')],
  ['findOwnById', (r) => r.findOwnById(USER, 'cat_1')],
  ['createOwn', (r) => r.createOwn(USER, { slug: 'kucing', name: 'Kucing', bucket: 'NEEDS' })],
  ['updateOwn', (r) => r.updateOwn(USER, 'cat_1', { name: 'Kucingku' })],
]);

scopingSuite('aliasRepo', createAliasRepo, [
  ['listForUser', (r) => r.listForUser(USER)],
  ['findByKeyword', (r) => r.findByKeyword(USER, 'cireng')],
  ['upsert', (r) => r.upsert(USER, 'cireng', 'sys_jajan')],
  ['deleteOwn', (r) => r.deleteOwn(USER, 'al_1')],
]);

scopingSuite('chatStateRepo', createChatStateRepo, [
  ['get', (r) => r.get(USER, now)],
  ['set', (r) => r.set(USER, 'AWAIT_AMOUNT', { nonce: 'n1' }, now)],
  ['take', (r) => r.take(USER, 'AWAIT_CATEGORY', 'n1', now)],
  ['clear', (r) => r.clear(USER)],
]);

describe('specific guarantees', () => {
  it('lookups by id are findFirst({ id, userId, deletedAt: null })', async () => {
    const { db, calls } = fakeDb();
    await createTxRepo(db).findById(USER, 'tx_1');
    expect(calls).toEqual([
      {
        model: 'transaction',
        method: 'findFirst',
        args: { where: { id: 'tx_1', userId: USER, deletedAt: null }, include: { category: true } },
      },
    ]);
  });

  it('own-category updates never touch system rows', async () => {
    const { db, calls } = fakeDb();
    await createCategoryRepo(db).updateOwn(USER, 'sys_makan', { name: 'Hacked' });
    expect(calls[0]?.args.where).toEqual({ id: 'sys_makan', userId: USER });
  });

  it('txRepo derives localDate from occurredAt in WIB', async () => {
    const { db, calls } = fakeDb();
    await createTxRepo(db).create(USER, {
      type: 'EXPENSE',
      amount: 10_000,
      categoryId: null,
      occurredAt: new Date('2026-10-31T17:30:00.000Z'), // 00:30 WIB on 1 Nov
      source: 'BOT',
      parseMethod: 'RULE',
    });
    const data = calls[0]?.args.data as { localDate: Date };
    expect(data.localDate.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('listForUser caps the page size at 100 (+1 row to see if there is more)', async () => {
    const { db, calls } = fakeDb();
    await createTxRepo(db).listForUser(USER, { limit: 500 });
    expect(calls[0]?.args.take).toBe(101);
  });

  it('listForUser keyset pagination stays inside the caller’s rows', async () => {
    const { db, calls } = fakeDb();
    const after = { localDate: new Date('2026-11-02T00:00:00.000Z'), createdAt: new Date(5), id: 'tx_9' };
    await createTxRepo(db).listForUser(USER, { after });
    const where = calls[0]?.args.where as Record<string, unknown>;
    expect(where.userId).toBe(USER);
    expect(where.OR).toEqual([
      { localDate: { lt: after.localDate } },
      { localDate: after.localDate, createdAt: { lt: after.createdAt } },
      { localDate: after.localDate, createdAt: after.createdAt, id: { lt: 'tx_9' } },
    ]);
  });
});

describe('chatStateRepo.take', () => {
  it('claims only the caller’s unexpired state of that kind with that nonce, by a conditional delete', async () => {
    const { db, calls } = fakeDb();
    await createChatStateRepo(db).take(USER, 'CONFIRM_AMOUNT', 'n1', now);
    const where = {
      userId: USER,
      kind: 'CONFIRM_AMOUNT',
      expiresAt: { gt: now },
      payload: { path: ['nonce'], equals: 'n1' },
    };
    expect(calls).toEqual([{ model: 'chatState', method: 'findFirst', args: { where } }]); // nothing found → no delete
  });

  it('returns the state only to the caller whose delete removed it (two taps → one wins)', async () => {
    const state = { userId: USER, kind: 'AWAIT_CATEGORY', payload: { nonce: 'n1' } };
    const findFirst = vi.fn().mockResolvedValue(state);
    const deleteMany = vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const repo = createChatStateRepo({ chatState: { findFirst, deleteMany } } as unknown as Db);
    expect(await repo.take(USER, 'AWAIT_CATEGORY', 'n1', now)).toBe(state);
    expect(deleteMany).toHaveBeenCalledWith(findFirst.mock.calls[0]?.[0]);
    expect(await repo.take(USER, 'AWAIT_CATEGORY', 'n1', now)).toBeNull();
  });
});
