import { dataCheckString, initDataHash } from '@server/auth/initData.js';
import { createAuthService, type AuthRepos } from '@server/auth/service.js';
import type { User } from '@server/db/generated/client.js';
import { makeUser } from '../bot/harness.js';

// In-memory auth repos that honour the same rules as the real ones (scoped by userId, sessions only valid
// for ACTIVE users, conditional consume), and a transaction that rolls back on error like Postgres.

export const BOT_TOKEN = '123456:TEST-bot-token';
export const APP_URL = 'https://hematin.example';

type MagicRow = { userId: string; tokenHash: string; expiresAt: Date; usedAt: Date | null; createdAt: Date };
type SessionRow = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  userAgent: string | null;
  createdAt: Date;
};

export class FakeAuthDb {
  users: User[] = [
    makeUser({ id: 'u1', telegramId: 111n, firstName: 'Nia', telegramUsername: 'nia', role: 'OWNER' }),
    makeUser({ id: 'u2', telegramId: 222n, firstName: 'Rani' }),
    makeUser({ id: 'u3', telegramId: 333n, firstName: 'Dodi', status: 'DISABLED' }),
  ];
  magic: MagicRow[] = [];
  sessions: SessionRow[] = [];
  rate = new Map<string, number>();
  now: () => Date = () => new Date('2026-11-02T03:00:00.000Z');

  repos(): AuthRepos {
    const ok = <T>(value: T) => Promise.resolve(value);
    return {
      users: {
        findByTelegramId: (telegramId: bigint) => ok(this.users.find((u) => u.telegramId === telegramId) ?? null),
        findActiveById: (id: string) => ok(this.users.find((u) => u.id === id && u.status === 'ACTIVE') ?? null),
      },
      magicTokens: {
        create: (userId: string, token: { tokenHash: string; expiresAt: Date }) => {
          this.magic.push({ ...token, userId, usedAt: null, createdAt: this.now() });
          return ok({});
        },
        countCreatedSince: (userId: string, since: Date) =>
          ok(this.magic.filter((m) => m.userId === userId && m.createdAt >= since).length),
        consume: (tokenHash: string, now: Date) => {
          const row = this.magic.find((m) => m.tokenHash === tokenHash && m.usedAt === null && m.expiresAt > now);
          if (!row) return ok(null);
          row.usedAt = now;
          return ok(row.userId);
        },
      },
      sessions: {
        create: (userId: string, s: { tokenHash: string; expiresAt: Date; userAgent?: string | null }) => {
          const row = {
            ...s,
            userAgent: s.userAgent ?? null,
            id: `s${this.sessions.length + 1}`,
            userId,
            lastSeenAt: this.now(),
            revokedAt: null,
            createdAt: this.now(),
          };
          this.sessions.push(row);
          return ok(row);
        },
        findValidByTokenHash: (tokenHash: string, now: Date) => {
          const row = this.sessions.find((s) => s.tokenHash === tokenHash && s.revokedAt === null && s.expiresAt > now);
          const user = row && this.users.find((u) => u.id === row.userId && u.status === 'ACTIVE');
          return ok(row && user ? { ...row, user } : null);
        },
        touch: (userId: string, id: string, now: Date) => {
          const row = this.sessions.find((s) => s.id === id && s.userId === userId);
          if (row) row.lastSeenAt = now;
          return ok(undefined);
        },
        revoke: (userId: string, id: string, now: Date) => {
          const row = this.sessions.find((s) => s.id === id && s.userId === userId && s.revokedAt === null);
          if (row) row.revokedAt = now;
          return ok(undefined);
        },
        revokeAll: (userId: string, now: Date) => {
          const rows = this.sessions.filter((s) => s.userId === userId && s.revokedAt === null);
          rows.forEach((s) => (s.revokedAt = now));
          return ok(rows.length);
        },
      },
      rateLimits: {
        hit: (key: string) => {
          const count = (this.rate.get(key) ?? 0) + 1;
          this.rate.set(key, count);
          return ok(count);
        },
      },
    } as unknown as AuthRepos;
  }

  async transaction<T>(fn: (repos: AuthRepos) => Promise<T>): Promise<T> {
    const snapshot = structuredClone({ magic: this.magic, sessions: this.sessions });
    try {
      return await fn(this.repos());
    } catch (err) {
      Object.assign(this, snapshot);
      throw err;
    }
  }
}

/** The real auth service over a FakeAuthDb, with a controllable clock and predictable tokens. */
export function authWorld(db = new FakeAuthDb()) {
  const clock = { now: db.now() };
  db.now = () => clock.now;
  let tokens = 0;
  const auth = createAuthService({
    repos: db.repos(),
    transaction: (fn) => db.transaction(fn),
    config: { appUrl: APP_URL, botToken: BOT_TOKEN, sessionTtlDays: 30, magicLinkTtlMinutes: 5 },
    now: () => clock.now,
    newToken: () => `tok${String(++tokens).padStart(40, '0')}`, // 43 chars, like 32 random bytes in base64url
  });
  return { db, auth, clock };
}

/** initData as Telegram builds it, signed with `botToken` (Telegram Mini Apps docs). */
export function signInitData(fields: Record<string, string>, botToken = BOT_TOKEN): string {
  const params = new URLSearchParams(fields);
  params.set('hash', initDataHash(dataCheckString(params) as string, botToken));
  return params.toString();
}

export const userJson = (id: number, firstName = 'Nia') =>
  JSON.stringify({ id, first_name: firstName, username: 'nia', language_code: 'id', allows_write_to_pm: true });

/** A realistic initData for Telegram user `id`, opened `ageSeconds` before `now`. */
export function initDataFor(id: number, now: Date, ageSeconds = 60, botToken = BOT_TOKEN): string {
  return signInitData(
    {
      query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
      user: userJson(id),
      auth_date: String(Math.floor(now.getTime() / 1000) - ageSeconds),
      signature: 'MTIzNDU2Nzg5MGFiY2RlZg', // newer clients send it; it stays in the data_check_string
    },
    botToken,
  );
}
