import type { Db } from '../prisma.js';

// Magic-link tokens (SECURITY §3.2). Only sha256(token) is stored. Consuming is a single conditional
// UPDATE, so two concurrent POSTs can't both succeed. Run it in the same transaction that creates the session.

export function createMagicTokenRepo(db: Db) {
  return {
    create(userId: string, token: { tokenHash: string; expiresAt: Date }) {
      return db.magicLinkToken.create({ data: { ...token, userId } });
    },

    async countCreatedSince(userId: string, since: Date) {
      return db.magicLinkToken.count({ where: { userId, createdAt: { gte: since } } });
    },

    /** Marks the token used. Returns its userId, or null if unknown, used, or expired. */
    async consume(tokenHash: string, now: Date): Promise<string | null> {
      const { count } = await db.magicLinkToken.updateMany({
        where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (count !== 1) return null;
      const token = await db.magicLinkToken.findUnique({ where: { tokenHash }, select: { userId: true } });
      return token?.userId ?? null;
    },

    /** Housekeeping: tokens created before `before`. */
    async deleteOlderThan(before: Date) {
      const { count } = await db.magicLinkToken.deleteMany({ where: { createdAt: { lt: before } } });
      return count;
    },
  };
}

export type MagicTokenRepo = ReturnType<typeof createMagicTokenRepo>;
