import type { Db } from '../prisma.js';

// Fixed-window counters in Postgres (SECURITY §5). The key encodes the subject and window,
// e.g. "msg:<userId>:<yyyymmddhhmm>". Window math belongs to the caller (server/lib/rateLimit.ts).

export function createRateLimitRepo(db: Db) {
  return {
    /** Atomically increments the counter for `key` and returns the new count. */
    async hit(key: string, expiresAt: Date) {
      const row = await db.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, expiresAt },
        update: { count: { increment: 1 } },
        select: { count: true },
      });
      return row.count;
    },

    async deleteExpired(now: Date) {
      const { count } = await db.rateLimit.deleteMany({ where: { expiresAt: { lte: now } } });
      return count;
    },
  };
}

export type RateLimitRepo = ReturnType<typeof createRateLimitRepo>;
