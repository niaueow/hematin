import { randomBytes } from 'node:crypto';
import type { User } from '../db/generated/client.js';
import type { MagicTokenRepo } from '../db/repos/magicTokenRepo.js';
import type { RateLimitRepo } from '../db/repos/rateLimitRepo.js';
import type { SessionRepo } from '../db/repos/sessionRepo.js';
import type { UserRepo } from '../db/repos/userRepo.js';
import { hitRateLimit, type RateLimitRule } from '../lib/rateLimit.js';
import { sha256Hex } from '../lib/secrets.js';
import { verifyInitData } from './initData.js';

// Passwordless dashboard auth (SECURITY §3, D-017). Two ways in:
// - Mini App: `Authorization: tma <initData>` on every request, verified each time (initData.ts).
// - Browser: /dashboard in the bot → one-time magic link (5 min) → POST /api/auth/magic → a session cookie.
// Only sha256 hashes of magic-link and session tokens are stored. Tokens are never logged.

export const SESSION_COOKIE = '__Host-session';
/** At most this many magic links per user per hour (SECURITY §5). */
export const MAGIC_LINKS_PER_HOUR = 5;
/** POST /api/auth/magic attempts per IP (SECURITY §5). */
export const MAGIC_ATTEMPTS_PER_IP: RateLimitRule = { name: 'magic-ip', limit: 20, windowMs: 10 * 60_000 };
/** lastSeenAt is refreshed at most this often. */
export const SESSION_TOUCH_MS = 3_600_000;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export type AuthRepos = {
  users: Pick<UserRepo, 'findByTelegramId' | 'findActiveById'>;
  magicTokens: Pick<MagicTokenRepo, 'create' | 'countCreatedSince' | 'consume'>;
  sessions: Pick<SessionRepo, 'create' | 'findValidByTokenHash' | 'touch' | 'revoke' | 'revokeAll'>;
  rateLimits: Pick<RateLimitRepo, 'hit'>;
};

export type AuthConfig = {
  appUrl: string;
  botToken: string;
  sessionTtlDays: number;
  magicLinkTtlMinutes: number;
};

export type AuthDeps = {
  repos: AuthRepos;
  /** Runs `fn` in one DB transaction (magic link consume + session create). */
  transaction: <T>(fn: (repos: AuthRepos) => Promise<T>) => Promise<T>;
  config: AuthConfig;
  now: () => Date;
  /** 32 random bytes, base64url. Injectable for tests. */
  newToken?: () => string;
};

export type Authenticated = { user: User; method: 'tma' } | { user: User; method: 'cookie'; sessionId: string };

export function createAuthService(deps: AuthDeps) {
  const { repos, config } = deps;
  const newToken = deps.newToken ?? (() => randomBytes(32).toString('base64url'));

  return {
    sessionMaxAgeSeconds: config.sessionTtlDays * 86_400,

    /** /dashboard: a one-time link to `${APP_URL}/auth?token=…`, or null over the hourly limit. */
    async createMagicLink(userId: string): Promise<{ url: string; ttlMinutes: number } | null> {
      const now = deps.now();
      if (
        (await repos.magicTokens.countCreatedSince(userId, new Date(now.getTime() - HOUR_MS))) >= MAGIC_LINKS_PER_HOUR
      )
        return null;
      const token = newToken();
      const expiresAt = new Date(now.getTime() + config.magicLinkTtlMinutes * 60_000);
      await repos.magicTokens.create(userId, { tokenHash: sha256Hex(token), expiresAt });
      return { url: `${config.appUrl}/auth?token=${token}`, ttlMinutes: config.magicLinkTtlMinutes };
    },

    /** POST /api/auth/magic, per client IP. False once over the limit. */
    async allowMagicAttempt(ip: string): Promise<boolean> {
      return (await hitRateLimit(repos.rateLimits, MAGIC_ATTEMPTS_PER_IP, ip, deps.now())).allowed;
    },

    /**
     * Uses up the token and creates the session in one transaction (SECURITY §3.2 step 3). Null if the token is
     * unknown, used, expired, or its user isn't ACTIVE. Returns the session token for the cookie.
     */
    async consumeMagicLink(
      token: string,
      userAgent: string | null,
    ): Promise<{ sessionToken: string; user: User } | null> {
      const now = deps.now();
      return deps.transaction(async (r) => {
        const userId = await r.magicTokens.consume(sha256Hex(token), now);
        if (!userId) return null;
        const user = await r.users.findActiveById(userId);
        if (!user) return null;
        const sessionToken = newToken();
        await r.sessions.create(user.id, {
          tokenHash: sha256Hex(sessionToken),
          expiresAt: new Date(now.getTime() + config.sessionTtlDays * DAY_MS),
          userAgent: userAgent?.slice(0, 200) ?? null,
        });
        return { sessionToken, user };
      });
    },

    /** `Authorization: tma <initData>` → the ACTIVE user, or null. */
    async fromInitData(raw: string): Promise<Authenticated | null> {
      const result = verifyInitData(raw, config.botToken, deps.now());
      if (!result.ok) return null;
      const user = await repos.users.findByTelegramId(result.user.telegramId);
      return user?.status === 'ACTIVE' ? { user, method: 'tma' } : null;
    },

    /** The session cookie → the user (valid session, ACTIVE user), or null. Refreshes lastSeenAt hourly. */
    async fromSession(token: string): Promise<Authenticated | null> {
      const now = deps.now();
      const session = await repos.sessions.findValidByTokenHash(sha256Hex(token), now);
      if (!session) return null;
      if (now.getTime() - session.lastSeenAt.getTime() >= SESSION_TOUCH_MS)
        await repos.sessions.touch(session.userId, session.id, now);
      return { user: session.user, method: 'cookie', sessionId: session.id };
    },

    async logout(userId: string, sessionId: string): Promise<void> {
      await repos.sessions.revoke(userId, sessionId, deps.now());
    },

    async logoutAll(userId: string): Promise<number> {
      return repos.sessions.revokeAll(userId, deps.now());
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
