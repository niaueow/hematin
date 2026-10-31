import { describe, expect, it } from 'vitest';
import * as copy from '@server/bot/copy.js';
import { APP_URL, authWorld } from '../auth/fakes.js';
import { lastCall, makeUser, FakeDb, MON, person, replies, setup, text } from './harness.js';

// /dashboard (BOT_SPEC §1, SECURITY §3.2): a one-time link with link preview off + a Mini App button.

const A = person(111, 'Nia');

function withDashboard() {
  const db = new FakeDb();
  db.users.push(makeUser({ id: 'u1', telegramId: 111n }));
  db.seed('u1', 'INCOME', 2_000_000, '2026-11-01');
  const world = authWorld();
  world.clock.now = MON;
  const ctx = setup({
    db,
    now: MON,
    dashboard: { appUrl: APP_URL, createMagicLink: (userId) => world.auth.createMagicLink(userId) },
  });
  return { ...ctx, magic: world.db.magic };
}

describe('/dashboard', () => {
  it('sends the 5-minute link with link preview disabled, and a button that opens the Mini App', async () => {
    const ctx = withDashboard();
    await ctx.send(text(A, '/dashboard', { date: MON }));
    const url = `${APP_URL}/auth?token=tok${'0'.repeat(39)}1`;
    expect(replies(ctx.calls)).toEqual([copy.dashboardLink(url, 5)]);
    const sent = lastCall(ctx.calls, 'sendMessage');
    expect(sent?.payload.link_preview_options).toEqual({ is_disabled: true });
    expect((sent?.payload.reply_markup as { inline_keyboard: unknown }).inline_keyboard).toEqual([
      [{ text: '📊 Buka dashboard', web_app: { url: APP_URL } }],
    ]);
    expect(ctx.magic).toMatchObject([{ userId: 'u1', usedAt: null }]);
  });

  it('over 5 links in an hour: no link, just the Mini App button', async () => {
    const ctx = withDashboard();
    for (let i = 0; i < 6; i++) await ctx.send(text(A, '/dashboard', { date: MON }));
    expect(replies(ctx.calls).at(-1)).toBe(copy.MAGIC_LINK_LIMIT);
    const sent = lastCall(ctx.calls, 'sendMessage');
    expect(sent?.payload.link_preview_options).toBeUndefined();
    expect(ctx.magic).toHaveLength(5);
  });
});
