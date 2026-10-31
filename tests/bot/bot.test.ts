import { describe, expect, it } from 'vitest';
import * as copy from '@server/bot/copy.js';
import type { User } from '@server/db/generated/client.js';
import { sha256Hex } from '@server/lib/secrets.js';
import { callback as press, FakeDb, makeUser, OWNER_ID, person, replies, setup, text } from './harness.js';

// Access control (M4): idempotency, private chats, strangers, owner bootstrap, invites, rate limit.
// The logging loop (M5) is in logging.test.ts.

const callback = (from: { id: number; first_name: string }, chat?: { id: number; type: string }) =>
  press(from, 'pi:1:buy', chat);

/** The owner, registered, with this month's income recorded (so the income nudge stays out of the way). */
async function withOwner() {
  const ctx = setup();
  await ctx.send(text(person(OWNER_ID, 'Bos'), '/start'));
  ctx.db.seed('u1', 'INCOME', 2_000_000, '2026-11-01');
  ctx.calls.length = 0;
  ctx.db.writes.length = 0;
  return ctx;
}

async function inviteCode(ctx: Awaited<ReturnType<typeof withOwner>>) {
  await ctx.send(text(person(OWNER_ID, 'Bos'), '/invite'));
  const reply = String(replies(ctx.calls).at(-1));
  ctx.calls.length = 0;
  return /start=([\w-]+)/.exec(reply)?.[1] as string;
}

describe('idempotency', () => {
  it('a duplicate update_id is processed once', async () => {
    const { send, calls, db } = setup();
    const update = text(person(500), 'halo');
    await send(update);
    await send(update);
    expect(replies(calls)).toEqual([copy.PRIVATE_BOT]);
    expect(db.writes).toEqual(['processedUpdate']);
  });
});

describe('private chats only', () => {
  it('in a group: one reply, then the bot leaves; nobody is looked up or created', async () => {
    const { send, calls, db } = setup();
    await send(text(person(OWNER_ID), '/start', { chat: { id: -100, type: 'supergroup' } }));
    expect(calls.map((c) => [c.method, c.payload.chat_id])).toEqual([
      ['sendMessage', -100],
      ['leaveChat', -100],
    ]);
    expect(replies(calls)).toEqual([copy.PRIVATE_CHAT_ONLY]);
    expect(db.users).toEqual([]);
    expect(db.writes).toEqual(['processedUpdate']);
  });

  it('a button press in a group is only acknowledged', async () => {
    const { send, calls } = setup();
    await send(callback(person(500), { id: -100, type: 'group' }));
    expect(calls.map((c) => c.method)).toEqual(['answerCallbackQuery']);
  });
});

describe('unknown users (SECURITY §2)', () => {
  it.each([
    ['plain text', 'halo'],
    ['/start without a code', '/start'],
    ['a command', '/sisa'],
    ['an expense (no NLP for strangers)', 'warteg 10k'],
  ])('%s → exactly one canned reply and no writes', async (_name, body) => {
    const { send, calls, db } = setup();
    await send(text(person(500), body));
    expect(calls.map((c) => c.method)).toEqual(['sendMessage']);
    expect(replies(calls)).toEqual([copy.PRIVATE_BOT]);
    expect(db.writes).toEqual(['processedUpdate']);
  });

  it('a button press is only acknowledged', async () => {
    const { send, calls, db } = setup();
    await send(callback(person(500)));
    expect(calls.map((c) => c.method)).toEqual(['answerCallbackQuery']);
    expect(db.writes).toEqual(['processedUpdate']);
  });

  it('a disabled user is treated as a stranger', async () => {
    const db = new FakeDb();
    db.users.push(makeUser({ id: 'u9', telegramId: 600n, status: 'DISABLED' }));
    const { send, calls } = setup({ db });
    await send(text(person(600), '/start'));
    expect(replies(calls)).toEqual([copy.PRIVATE_BOT]);
  });

  it('messages from bots are ignored', async () => {
    const { send, calls } = setup();
    await send(text({ ...person(700), is_bot: true }, 'halo'));
    expect(calls).toEqual([]);
  });
});

describe('owner bootstrap', () => {
  it('the first /start from OWNER_TELEGRAM_ID creates the OWNER and asks for income', async () => {
    const { send, calls, db } = setup();
    await send(text(person(OWNER_ID, 'Bos'), '/start'));
    expect(db.users).toMatchObject([{ telegramId: 111n, role: 'OWNER', firstName: 'Bos' }]);
    expect(replies(calls)).toEqual([copy.welcomeOwner('Bos', () => 0)]);
    expect(String(replies(calls)[0])).toContain('uang jajan');
  });

  it('happens only once: a second /start is a normal welcome back', async () => {
    const { send, calls, db } = await withOwner();
    await send(text(person(OWNER_ID, 'Bos'), '/start'));
    expect(db.users).toHaveLength(1);
    expect(replies(calls)).toEqual([copy.welcomeBack('Bos', () => 0)]);
  });

  it('never creates a second OWNER, even if OWNER_TELEGRAM_ID changes later', async () => {
    const { db } = await withOwner();
    const other = setup({ db, ownerId: 222 });
    await other.send(text(person(222), '/start'));
    expect(db.users).toHaveLength(1);
    expect(replies(other.calls)).toEqual([copy.PRIVATE_BOT]);
  });

  it('only on /start: other messages from the owner id get the canned reply', async () => {
    const { send, calls, db } = setup();
    await send(text(person(OWNER_ID), 'halo'));
    expect(db.users).toEqual([]);
    expect(replies(calls)).toEqual([copy.PRIVATE_BOT]);
  });
});

describe('/invite and /start <code>', () => {
  it('the owner gets a single-use t.me link; only sha256(code) is stored, expiring in 48 h', async () => {
    const ctx = await withOwner();
    await ctx.send(text(person(OWNER_ID, 'Bos'), '/invite'));
    const code = 'CODE_0000000000000001';
    expect(replies(ctx.calls)).toEqual([copy.inviteCreated(`https://t.me/hematin_bot?start=${code}`, 48)]);
    expect(ctx.calls[0]?.payload.link_preview_options).toEqual({ is_disabled: true });
    expect(ctx.db.invites).toEqual([
      {
        codeHash: sha256Hex(code),
        createdById: 'u1',
        expiresAt: new Date('2026-11-03T03:00:00.000Z'),
        usedAt: null,
        usedById: null,
      },
    ]);
    expect(JSON.stringify(ctx.db.invites)).not.toContain(code);
  });

  it('a member cannot create invites', async () => {
    const ctx = await withOwner();
    const code = await inviteCode(ctx);
    await ctx.send(text(person(333, 'Rani'), `/start ${code}`));
    ctx.db.seed('u2', 'INCOME', 1_000_000, '2026-11-01');
    ctx.calls.length = 0;
    await ctx.send(text(person(333, 'Rani'), '/invite'));
    expect(replies(ctx.calls)).toEqual([copy.INVITE_OWNER_ONLY]);
    expect(ctx.db.invites).toHaveLength(1);
  });

  it('a valid code creates the MEMBER and uses up the invite together', async () => {
    const ctx = await withOwner();
    const code = await inviteCode(ctx);
    await ctx.send(text(person(333, 'Rani'), `/start ${code}`));
    expect(ctx.db.users.at(-1)).toMatchObject({ id: 'u2', telegramId: 333n, role: 'MEMBER', firstName: 'Rani' });
    expect(ctx.db.invites[0]).toMatchObject({ usedById: 'u2', usedAt: new Date('2026-11-01T03:00:00.000Z') });
    expect(replies(ctx.calls)).toEqual([copy.welcomeInvited('Rani', () => 0)]);
  });

  it('reuse is rejected and the second user is not created (rolled back)', async () => {
    const ctx = await withOwner();
    const code = await inviteCode(ctx);
    await ctx.send(text(person(333), `/start ${code}`));
    ctx.calls.length = 0;
    await ctx.send(text(person(444), `/start ${code}`));
    expect(replies(ctx.calls)).toEqual([copy.INVITE_INVALID]);
    expect(ctx.db.users.map((u) => u.telegramId)).toEqual([111n, 333n]);
  });

  it('an expired invite is rejected', async () => {
    const ctx = await withOwner();
    const code = await inviteCode(ctx);
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 48 * 3_600_000); // exactly at expiry: no longer valid
    await ctx.send(text(person(555), `/start ${code}`));
    expect(replies(ctx.calls)).toEqual([copy.INVITE_INVALID]);
    expect(ctx.db.users).toHaveLength(1);
  });

  it.each([
    ['unknown but well-formed', 'ZZZZZZZZZZZZZZZZZZZZZZ'],
    ['malformed (no DB lookup at all)', 'abc'],
  ])('%s code → rejected, nothing written', async (_name, code) => {
    const ctx = await withOwner();
    await ctx.send(text(person(666), `/start ${code}`));
    expect(replies(ctx.calls)).toEqual([copy.INVITE_INVALID]);
    expect(ctx.db.users).toHaveLength(1);
    expect(ctx.db.writes).toEqual(['processedUpdate']);
  });

  it('a registered user opening an invite link just gets a welcome back (the invite stays unused)', async () => {
    const ctx = await withOwner();
    const code = await inviteCode(ctx);
    await ctx.send(text(person(OWNER_ID, 'Bos'), `/start ${code}`));
    expect(replies(ctx.calls)).toEqual([copy.welcomeBack('Bos', () => 0)]);
    expect(ctx.db.invites[0]?.usedAt).toBeNull();
  });
});

describe('known users', () => {
  it.each([
    ['/help', copy.HELP],
    ['/bantuan', copy.HELP],
    ['/dashboard', copy.COMING_SOON],
    ['/foo', copy.HELP],
    ['halo', copy.SHORT_HELP],
  ])('%s → reply', async (body, expected) => {
    const ctx = await withOwner();
    await ctx.send(text(person(OWNER_ID, 'Bos'), body));
    expect(replies(ctx.calls)).toEqual([expected]);
  });

  it('button presses are acknowledged', async () => {
    const ctx = await withOwner();
    await ctx.send(callback(person(OWNER_ID)));
    expect(ctx.calls.map((c) => c.method)).toEqual(['answerCallbackQuery']);
  });

  it('a user who had blocked the bot and writes again is unmarked', async () => {
    const ctx = await withOwner();
    (ctx.db.users[0] as User).botBlocked = true;
    await ctx.send(text(person(OWNER_ID), '/help'));
    expect(ctx.db.users[0]?.botBlocked).toBe(false);
  });
});

describe('rate limit: 20 messages per minute', () => {
  it('the 21st message gets one warning, later ones are ignored', async () => {
    const ctx = await withOwner();
    for (let i = 0; i < 22; i++) await ctx.send(text(person(OWNER_ID), 'halo'));
    const sent = replies(ctx.calls);
    expect(sent).toHaveLength(21);
    expect(sent.slice(0, 20).every((r) => r === copy.SHORT_HELP)).toBe(true);
    expect(sent[20]).toBe(copy.rateLimited(() => 0));
  });

  it('a new minute starts a new window', async () => {
    const ctx = await withOwner();
    for (let i = 0; i < 21; i++) await ctx.send(text(person(OWNER_ID), 'x'));
    ctx.calls.length = 0;
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 60_000);
    await ctx.send(text(person(OWNER_ID), 'x'));
    expect(replies(ctx.calls)).toEqual([copy.SHORT_HELP]);
  });
});

describe('Telegram errors while replying', () => {
  it('403 (blocked) is swallowed: the update is done, Telegram must not retry', async () => {
    const { send } = setup({ apiError: (m) => (m === 'sendMessage' ? 403 : null) });
    await expect(send(text(person(500), 'halo'))).resolves.toBeUndefined();
  });

  it('other errors propagate (→ 500, logged)', async () => {
    const { send } = setup({ apiError: (m) => (m === 'sendMessage' ? 400 : null) });
    await expect(send(text(person(500), 'halo'))).rejects.toThrow();
  });
});
