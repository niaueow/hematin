import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotRepos } from '@server/bot/bot.js';
import * as copy from '@server/bot/copy.js';
import { callback, FakeDb, makeUser, MON, person, replies, setup, text } from './harness.js';

// How the bot degrades (ARCHITECTURE §6). Groq failures are in llm.test.ts, Telegram 429/403 in telegram.test.ts
// and bot.test.ts; here: the database failing before or during an update.

const A = person(111, 'Nia');
/** Any repo method, failing like Neon does when it's unreachable. */
const neonDown = (() => Promise.reject(new Error('Neon: connection terminated'))) as never;

/** A's world, with some repo methods replaced (e.g. to fail) while `broken` is true. */
function world(patch: (repos: BotRepos) => void, apiError?: (method: string) => number | null) {
  const db = new FakeDb();
  db.users.push(makeUser({ id: 'u1', telegramId: 111n, role: 'OWNER' }));
  db.seed('u1', 'INCOME', 2_000_000, '2026-11-01');
  const state = { broken: true };
  const repos = db.repos.bind(db);
  db.repos = () => {
    const r = repos();
    if (state.broken) patch(r);
    return r;
  };
  return { ...setup({ db, now: MON, ...(apiError && { apiError }) }), state };
}

describe('Neon down', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('before the update is marked processed: it fails (→ 500), nothing is sent, and Telegram’s retry works once the DB is back', async () => {
    const ctx = world((r) => {
      r.processedUpdates.markProcessed = neonDown;
    });
    const update = text(A, 'warteg 10k', { date: MON });
    await expect(ctx.send(update)).rejects.toThrow('Neon');
    expect(ctx.calls).toEqual([]);

    // Telegram retries the same update later; this time the DB answers. (The fake repos are bound at bot
    // creation, so "the DB is back" means a fresh instance with the same store, like a new function instance.)
    ctx.state.broken = false;
    const recovered = setup({ db: ctx.db, now: MON });
    await recovered.send(update);
    expect(ctx.db.txs.filter((t) => t.source === 'BOT')).toHaveLength(1);
    expect(replies(recovered.calls)[0]).toMatch(/^✅ Dicatat: Makan Rp10\.000/);
  });

  it('during the update: the user is told (no silence), the update fails (→ 500), and the retry is dropped', async () => {
    const ctx = world((r) => {
      r.transactions.create = neonDown;
    });
    const update = text(A, 'warteg 10k', { date: MON });
    await expect(ctx.send(update)).rejects.toThrow('Neon');
    expect(replies(ctx.calls)).toEqual([copy.TEMPORARY_ERROR]);

    ctx.calls.length = 0;
    await ctx.send(update); // Telegram's retry
    expect(ctx.calls).toEqual([]); // already processed: dropped, no second apology
  });

  it('a button press that fails also gets the apology', async () => {
    const ctx = world((r) => {
      r.transactions.findById = neonDown;
    });
    await expect(ctx.send(callback(A, 'tx:tx1:undo'))).rejects.toThrow('Neon');
    expect(replies(ctx.calls)).toEqual([copy.TEMPORARY_ERROR]);
  });

  it('if even the apology can’t be sent, the original error still surfaces', async () => {
    const ctx = world(
      (r) => {
        r.transactions.create = neonDown;
      },
      (method) => (method === 'sendMessage' ? 500 : null),
    );
    await expect(ctx.send(text(A, 'warteg 10k', { date: MON }))).rejects.toThrow('Neon');
  });
});

describe('a user who blocked the bot (403)', () => {
  it('gets no apology attempt and the update succeeds', async () => {
    const db = new FakeDb();
    db.users.push(makeUser({ id: 'u1', telegramId: 111n }));
    db.seed('u1', 'INCOME', 2_000_000, '2026-11-01');
    const ctx = setup({ db, now: MON, apiError: (method) => (method === 'sendMessage' ? 403 : null) });
    await expect(ctx.send(text(A, 'warteg 10k', { date: MON }))).resolves.toBeUndefined();
    expect(ctx.calls.filter((c) => c.method === 'sendMessage')).toHaveLength(1); // the reply itself, no apology
    expect(db.txs.filter((t) => t.source === 'BOT')).toHaveLength(1); // still recorded
  });
});
