import { createBot, type BotRepos } from '@server/bot/bot.js';
import { localDateFromDb, localDateToDb, toLocalDate, type LocalDate } from '@server/budget/periods.js';
import type { Category, KeywordAlias, Transaction, User } from '@server/db/generated/client.js';
import type { ChatStateKind } from '@server/db/repos/chatStateRepo.js';
import type { NewTransaction, TransactionPatch } from '@server/db/repos/txRepo.js';
import { DEFAULT_CATEGORIES } from '@server/nlp/keywords.js';

// Drives the real grammY bot with handleUpdate. Telegram is a fake API (a transformer that records calls),
// and the repos are an in-memory store whose transaction() rolls back on error, like Postgres would.
// The fake repos honour userId the same way the real ones do (findFirst({ id, userId }) etc.).

export const OWNER_ID = 111;
export const BOT_INFO = {
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
type ChatState = { userId: string; kind: string; payload: Record<string, unknown>; expiresAt: Date; updatedAt: Date };

const systemCategories = (): Category[] =>
  DEFAULT_CATEGORIES.map((c) => ({
    id: c.id,
    userId: null,
    slug: c.slug,
    name: c.name,
    emoji: null,
    bucket: c.bucket,
    keywords: [...c.keywords],
    archived: false,
    createdAt: new Date(0),
  }));

export class FakeDb {
  users: User[] = [];
  invites: Invite[] = [];
  processed = new Set<string>();
  rate = new Map<string, number>();
  txs: Transaction[] = [];
  categories: Category[] = systemCategories();
  aliases: KeywordAlias[] = [];
  chatStates = new Map<string, ChatState>();
  writes: string[] = [];
  now: () => Date = () => new Date('2026-11-01T03:00:00.000Z');

  private withCategory(tx: Transaction) {
    return { ...tx, category: this.categories.find((c) => c.id === tx.categoryId) ?? null };
  }
  private live(userId: string) {
    return this.txs.filter((t) => t.userId === userId && t.deletedAt === null);
  }

  repos(): BotRepos {
    const ok = <T>(value: T) => Promise.resolve(value);
    return {
      users: {
        findByTelegramId: (telegramId: bigint) => ok(this.users.find((u) => u.telegramId === telegramId) ?? null),
        ownerExists: () => ok(this.users.some((u) => u.role === 'OWNER')),
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
          return ok(user);
        },
        setBotBlocked: (id: string, botBlocked: boolean) => {
          const user = this.users.find((u) => u.id === id);
          if (user) user.botBlocked = botBlocked;
          this.writes.push('user.setBotBlocked');
          return ok(undefined);
        },
      },
      invites: {
        create: (createdById: string, invite: { codeHash: string; expiresAt: Date }) => {
          this.invites.push({ ...invite, createdById, usedAt: null, usedById: null });
          this.writes.push('invite.create');
          return ok({});
        },
        consume: (codeHash: string, usedById: string, now: Date) => {
          const invite = this.invites.find((i) => i.codeHash === codeHash && i.usedAt === null && i.expiresAt > now);
          if (!invite) return ok(false);
          Object.assign(invite, { usedAt: now, usedById });
          this.writes.push('invite.consume');
          return ok(true);
        },
      },
      processedUpdates: {
        markProcessed: (updateId: bigint) => {
          if (this.processed.has(String(updateId))) return ok(false);
          this.processed.add(String(updateId));
          this.writes.push('processedUpdate');
          return ok(true);
        },
      },
      rateLimits: {
        hit: (key: string) => {
          const count = (this.rate.get(key) ?? 0) + 1;
          this.rate.set(key, count);
          this.writes.push('rateLimit');
          return ok(count);
        },
      },
      transactions: {
        create: (userId: string, tx: NewTransaction) => {
          const row: Transaction = {
            id: `tx${this.txs.length + 1}`,
            userId,
            type: tx.type,
            amount: tx.amount,
            categoryId: tx.categoryId,
            note: tx.note ?? null,
            rawText: tx.rawText ?? null,
            occurredAt: tx.occurredAt,
            localDate: localDateToDb(toLocalDate(tx.occurredAt)),
            source: tx.source,
            parseMethod: tx.parseMethod,
            createdAt: this.now(),
            updatedAt: this.now(),
            deletedAt: null,
          };
          this.txs.push(row);
          this.writes.push('tx.create');
          return ok(row);
        },
        findById: (userId: string, id: string) => {
          const tx = this.live(userId).find((t) => t.id === id);
          return ok(tx ? this.withCategory(tx) : null);
        },
        update: (userId: string, id: string, patch: TransactionPatch) => {
          const tx = this.live(userId).find((t) => t.id === id);
          if (!tx) return ok(false);
          Object.assign(tx, patch, { updatedAt: this.now() });
          this.writes.push('tx.update');
          return ok(true);
        },
        softDelete: (userId: string, id: string, now: Date) => {
          const tx = this.live(userId).find((t) => t.id === id);
          if (!tx) return ok(false);
          tx.deletedAt = now;
          this.writes.push('tx.softDelete');
          return ok(true);
        },
        latest: (userId: string, limit: number, createdSince?: Date) =>
          ok(
            this.live(userId)
              .map((tx, index) => ({ tx, index }))
              .filter(({ tx }) => !createdSince || tx.createdAt >= createdSince)
              .sort((a, b) => b.tx.createdAt.getTime() - a.tx.createdAt.getTime() || b.index - a.index)
              .slice(0, limit)
              .map(({ tx }) => this.withCategory(tx)),
          ),
        listUpTo: (userId: string, to: LocalDate) =>
          ok(
            this.live(userId)
              .filter((t) => localDateFromDb(t.localDate) <= to)
              .map((t) => ({
                type: t.type,
                amount: t.amount,
                localDate: t.localDate,
                categoryId: t.categoryId,
                category: this.withCategory(t).category,
              })),
          ),
        hasIncomeInRange: (userId: string, from: LocalDate, to: LocalDate) =>
          ok(
            this.live(userId).some((t) => {
              const date = localDateFromDb(t.localDate);
              return t.type === 'INCOME' && from <= date && date <= to;
            }),
          ),
      },
      categories: {
        listUsable: (userId: string) =>
          ok(this.categories.filter((c) => (c.userId === null || c.userId === userId) && !c.archived)),
        findUsableById: (userId: string, id: string) =>
          ok(this.categories.find((c) => c.id === id && (c.userId === null || c.userId === userId)) ?? null),
      },
      aliases: {
        listForUser: (userId: string) =>
          ok(
            this.aliases
              .filter((a) => a.userId === userId)
              .map((a) => ({ ...a, category: this.categories.find((c) => c.id === a.categoryId) })),
          ),
        upsert: (userId: string, keyword: string, categoryId: string) => {
          const existing = this.aliases.find((a) => a.userId === userId && a.keyword === keyword);
          if (existing) existing.categoryId = categoryId;
          else
            this.aliases.push({
              id: `al${this.aliases.length + 1}`,
              userId,
              keyword,
              categoryId,
              createdAt: this.now(),
            });
          this.writes.push('alias.upsert');
          return ok({});
        },
      },
      chatStates: {
        get: (userId: string, now: Date) => {
          const state = this.chatStates.get(userId);
          return ok(state && state.expiresAt > now ? state : null);
        },
        set: (userId: string, kind: ChatStateKind, payload: Record<string, unknown>, expiresAt: Date) => {
          const state = { userId, kind, payload, expiresAt, updatedAt: this.now() };
          this.chatStates.set(userId, state);
          this.writes.push('chatState.set');
          return ok(state);
        },
        take: (userId: string, kind: ChatStateKind, nonce: string, now: Date) => {
          const state = this.chatStates.get(userId);
          if (!state || state.kind !== kind || state.expiresAt <= now || state.payload.nonce !== nonce) return ok(null);
          this.chatStates.delete(userId);
          this.writes.push('chatState.take');
          return ok(state);
        },
        clear: (userId: string) => {
          this.chatStates.delete(userId);
          this.writes.push('chatState.clear');
          return ok(undefined);
        },
      },
      intents: {
        sumSkipped: () => ok({ amount: 0, count: 0 }),
      },
    } as unknown as BotRepos;
  }

  async transaction<T>(fn: (repos: BotRepos) => Promise<T>): Promise<T> {
    const keys = ['users', 'invites', 'txs', 'aliases', 'chatStates', 'writes'] as const;
    const snapshot = structuredClone(Object.fromEntries(keys.map((k) => [k, this[k]])));
    try {
      return await fn(this.repos());
    } catch (err) {
      Object.assign(this, snapshot);
      throw err;
    }
  }

  /** A transaction recorded some other way (e.g. earlier), dated `date` at 12:00 WIB. */
  seed(userId: string, type: Transaction['type'], amount: number, date: string, categoryId: string | null = null) {
    const occurredAt = new Date(`${date}T12:00:00.000+07:00`);
    this.txs.push({
      id: `seed${this.txs.length + 1}`,
      userId,
      type,
      amount,
      categoryId,
      note: null,
      rawText: null,
      occurredAt,
      localDate: localDateToDb(toLocalDate(occurredAt)),
      source: 'WEB',
      parseMethod: 'MANUAL',
      createdAt: occurredAt,
      updatedAt: occurredAt,
      deletedAt: null,
    });
  }
}

export function makeUser(data: Partial<User> & { id: string; telegramId: bigint }): User {
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

export type Call = { method: string; payload: Record<string, unknown> };
export type Button = { text: string; callback_data: string };

let nextId = 1;
export const person = (id: number, first_name = 'Nia') => ({ id, is_bot: false, first_name });
type From = { id: number; is_bot?: boolean; first_name: string };

export function text(from: From, body: string, options: { chat?: { id: number; type: string }; date?: Date } = {}) {
  const command = /^\/\w+/.exec(body)?.[0];
  return {
    update_id: nextId++,
    message: {
      message_id: nextId,
      date: Math.floor((options.date ?? new Date('2026-11-01T03:00:00.000Z')).getTime() / 1000),
      chat: options.chat ?? { id: from.id, type: 'private' },
      from,
      text: body,
      ...(command && { entities: [{ type: 'bot_command', offset: 0, length: command.length }] }),
    },
  };
}

export function callback(from: From, data = 'pi:1:buy', chat?: { id: number; type: string }) {
  return {
    update_id: nextId++,
    callback_query: {
      id: `cb${nextId}`,
      from,
      chat_instance: 'x',
      data,
      message: { message_id: 1, date: 0, chat: chat ?? { id: from.id, type: 'private' } },
    },
  };
}

export function setup(
  options: { db?: FakeDb; ownerId?: number; now?: Date; apiError?: (method: string) => number | null } = {},
) {
  const db = options.db ?? new FakeDb();
  const clock = { now: options.now ?? new Date('2026-11-01T03:00:00.000Z') };
  db.now = () => clock.now;
  const calls: Call[] = [];
  let codes = 0;
  let nonces = 0;
  const bot = createBot(
    '123:TEST',
    {
      repos: db.repos(),
      transaction: (fn) => db.transaction(fn),
      ownerTelegramId: String(options.ownerId ?? OWNER_ID),
      now: () => clock.now,
      random: () => 0,
      newInviteCode: () => `CODE_${String(++codes).padStart(16, '0')}`,
      newNonce: () => `n${++nonces}`,
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
  const send = (update: object) => bot.handleUpdate(update as never);
  return {
    bot,
    db,
    calls,
    clock,
    send,
    /** A private text message sent "now". */
    say: (from: From, body: string) => send(text(from, body, { date: clock.now })),
    press: (from: From, data: string) => send(callback(from, data)),
  };
}

export const replies = (calls: Call[]) => calls.filter((c) => c.method === 'sendMessage').map((c) => c.payload.text);
export const edits = (calls: Call[]) => calls.filter((c) => c.method === 'editMessageText').map((c) => c.payload.text);
export const toasts = (calls: Call[]) =>
  calls.filter((c) => c.method === 'answerCallbackQuery').map((c) => c.payload.text);

/** The inline buttons of a call's reply_markup, flattened. */
export function buttons(call: Call | undefined): Button[] {
  const markup = call?.payload.reply_markup as { inline_keyboard?: Button[][] } | undefined;
  return markup?.inline_keyboard?.flat() ?? [];
}

export const lastCall = (calls: Call[], method: string) => calls.filter((c) => c.method === method).at(-1);
