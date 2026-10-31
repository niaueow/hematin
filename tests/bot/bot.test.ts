import { describe, expect, it } from 'vitest';
import { createBot, type BotRepos } from '@server/bot/bot.js';
import * as copy from '@server/bot/copy.js';
import type { User } from '@server/db/generated/client.js';
import { sha256Hex } from '@server/lib/secrets.js';

// The real grammY bot, driven with handleUpdate. Telegram is a fake API (a transformer that records calls),
// and the repos are an in-memory store whose transaction() rolls back on error, like Postgres would.

const OWNER_ID = 111;
const BOT_INFO = {
  id: 999,
  is_bot: true,
  first_name: 'Hematin',
  username: 'hematin_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
};

type Invite = { codeHash: string; createdById: string; expiresAt: Date; usedAt: Date | null; usedById: string | null };

class FakeDb {
  users: User[] = [];
  invites: Invite[] = [];
  processed = new Set<string>();
  rate = new Map<string, number>();
  writes: string[] = [];

  repos(): BotRepos {
    return {
      users: {
        findByTelegramId: (telegramId: bigint) =>
          Promise.resolve(this.users.find((u) => u.telegramId === telegramId) ?? null),
        ownerExists: () => Promise.resolve(this.users.some((u) => u.role === 'OWNER')),
        create: (data: {
          telegramId: bigint;
          telegramUsername?: string | null;
          firstName?: string | null;
          role: 'OWNER' | 'MEMBER';
        }) => {
          if (this.users.some((u) => u.telegramId === data.telegramId)) return Promise.reject(new Error('unique'));
          const user = makeUser({ ...data, id: `u${this.users.length + 1}` });
          this.users.push(user);
          this.writes.push('user.create');
          return Promise.resolve(user);
        },
        setBotBlocked: (id: string, botBlocked: boolean) => {
          const user = this.users.find((u) => u.id === id);
          if (user) user.botBlocked = botBlocked;
          this.writes.push('user.setBotBlocked');
          return Promise.resolve();
        },
      },
      invites: {
        create: (createdById: string, invite: { codeHash: string; expiresAt: Date }) => {
          this.invites.push({ ...invite, createdById, usedAt: null, usedById: null });
          this.writes.push('invite.create');
          return Promise.resolve({});
        },
        consume: (codeHash: string, usedById: string, now: Date) => {
          const invite = this.invites.find((i) => i.codeHash === codeHash && i.usedAt === null && i.expiresAt > now);
          if (!invite) return Promise.resolve(false);
          Object.assign(invite, { usedAt: now, usedById });
          this.writes.push('invite.consume');
          return Promise.resolve(true);
        },
      },
      processedUpdates: {
        markProcessed: (updateId: bigint) => {
          if (this.processed.has(String(updateId))) return Promise.resolve(false);
          this.processed.add(String(updateId));
          this.writes.push('processedUpdate');
          return Promise.resolve(true);
        },
      },
      rateLimits: {
        hit: (key: string) => {
          const count = (this.rate.get(key) ?? 0) + 1;
          this.rate.set(key, count);
          this.writes.push('rateLimit');
          return Promise.resolve(count);
        },
      },
    } as unknown as BotRepos;
  }

  async transaction<T>(fn: (repos: BotRepos) => Promise<T>): Promise<T> {
    const snapshot = structuredClone({ users: this.users, invites: this.invites, writes: this.writes });
    try {
      return await fn(this.repos());
    } catch (err) {
      Object.assign(this, snapshot);
      throw err;
    }
  }
}

function makeUser(data: Partial<User> & { id: string; telegramId: bigint }): User {
  return {
    telegramUsername: null,
    firstName: null,
    role: 'MEMBER',
    status: 'ACTIVE',
    botBlocked: false,
    needsPct: 50,
    wantsPct: 30,
    savingsPct: 20,
    timezone: 'Asia/Jakarta',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...data,
  };
}

type Call = { method: string; payload: Record<string, unknown> };

function setup(
  options: { db?: FakeDb; ownerId?: number; now?: () => Date; apiError?: (method: string) => number | null } = {},
) {
  const db = options.db ?? new FakeDb();
  const calls: Call[] = [];
  let codes = 0;
  const bot = createBot(
    '123:TEST',
    {
      repos: db.repos(),
      transaction: (fn) => db.transaction(fn),
      ownerTelegramId: String(options.ownerId ?? OWNER_ID),
      now: options.now ?? (() => new Date('2026-11-01T03:00:00.000Z')),
      random: () => 0,
      newInviteCode: () => `CODE_${String(++codes).padStart(16, '0')}`,
    },
    BOT_INFO as never,
  );
  bot.api.config.use((_prev, method, payload) => {
    calls.push({ method, payload: payload });
    const code = options.apiError?.(method) ?? null;
    if (code !== null) return Promise.resolve({ ok: false, error_code: code, description: 'test error' } as never);
    return Promise.resolve({
      ok: true,
      result: method === 'sendMessage' ? { message_id: 1, date: 0, chat: {} } : true,
    } as never);
  });
  return { bot, db, calls, send: (update: object) => bot.handleUpdate(update as never) };
}

let nextId = 1;
const person = (id: number, first_name = 'Nia') => ({ id, is_bot: false, first_name });
function text(
  from: { id: number; is_bot?: boolean; first_name: string },
  body: string,
  chat?: { id: number; type: string },
) {
  const command = /^\/\w+/.exec(body)?.[0];
  return {
    update_id: nextId++,
    message: {
      message_id: nextId,
      date: 0,
      chat: chat ?? { id: from.id, type: 'private' },
      from,
      text: body,
      ...(command && { entities: [{ type: 'bot_command', offset: 0, length: command.length }] }),
    },
  };
}
function callback(from: { id: number; first_name: string }, chat?: { id: number; type: string }) {
  return {
    update_id: nextId++,
    callback_query: {
      id: `cb${nextId}`,
      from,
      chat_instance: 'x',
      data: 'pi:1:buy',
      message: { message_id: 1, date: 0, chat: chat ?? { id: from.id, type: 'private' } },
    },
  };
}
const replies = (calls: Call[]) => calls.filter((c) => c.method === 'sendMessage').map((c) => c.payload.text);

async function withOwner() {
  const ctx = setup();
  await ctx.send(text(person(OWNER_ID, 'Bos'), '/start'));
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
    await send(text(person(OWNER_ID), '/start', { id: -100, type: 'supergroup' }));
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
    let now = new Date('2026-11-01T03:00:00.000Z');
    const db = new FakeDb();
    const ctx = setup({ db, now: () => now });
    await ctx.send(text(person(OWNER_ID), '/start'));
    await ctx.send(text(person(OWNER_ID), '/invite'));
    const code = /start=([\w-]+)/.exec(String(replies(ctx.calls).at(-1)))?.[1] as string;
    ctx.calls.length = 0;
    now = new Date(now.getTime() + 48 * 3_600_000); // exactly at expiry: no longer valid
    await ctx.send(text(person(555), `/start ${code}`));
    expect(replies(ctx.calls)).toEqual([copy.INVITE_INVALID]);
    expect(db.users).toHaveLength(1);
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
    ['/sisa', copy.COMING_SOON],
    ['/dashboard', copy.COMING_SOON],
    ['/foo', copy.HELP],
    ['warteg 10k', copy.LOGGING_COMING_SOON],
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
    for (let i = 0; i < 22; i++) await ctx.send(text(person(OWNER_ID), `halo ${i}`));
    const sent = replies(ctx.calls);
    expect(sent).toHaveLength(21);
    expect(sent.slice(0, 20).every((r) => r === copy.LOGGING_COMING_SOON)).toBe(true);
    expect(sent[20]).toBe(copy.rateLimited(() => 0));
  });

  it('a new minute starts a new window', async () => {
    let now = new Date('2026-11-01T03:00:00.000Z');
    const db = new FakeDb();
    const ctx = setup({ db, now: () => now });
    await ctx.send(text(person(OWNER_ID), '/start'));
    for (let i = 0; i < 21; i++) await ctx.send(text(person(OWNER_ID), 'x'));
    ctx.calls.length = 0;
    now = new Date(now.getTime() + 60_000);
    await ctx.send(text(person(OWNER_ID), 'x'));
    expect(replies(ctx.calls)).toEqual([copy.LOGGING_COMING_SOON]);
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
