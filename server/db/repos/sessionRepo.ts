import type { Db } from '../prisma.js';

// Dashboard sessions (SECURITY §3.2). Only sha256(token) is stored. The token lookup is the one
// read without a userId: it's how the userId is found in the first place.

export function createSessionRepo(db: Db) {
  return {
    create(userId: string, session: { tokenHash: string; expiresAt: Date; userAgent?: string | null }) {
      return db.session.create({ data: { ...session, userId } });
    },

    /** Valid = not revoked, not expired, and the user is still ACTIVE. */
    findValidByTokenHash(tokenHash: string, now: Date) {
      return db.session.findFirst({
        where: { tokenHash, revokedAt: null, expiresAt: { gt: now }, user: { status: 'ACTIVE' } },
        include: { user: true },
      });
    },

    async touch(userId: string, id: string, now: Date) {
      await db.session.updateMany({ where: { id, userId }, data: { lastSeenAt: now } });
    },

    async revoke(userId: string, id: string, now: Date) {
      await db.session.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: now } });
    },

    async revokeAll(userId: string, now: Date) {
      const { count } = await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
      return count;
    },

    /** Housekeeping: sessions expired or revoked before `before`. */
    async deleteStale(before: Date) {
      const { count } = await db.session.deleteMany({
        where: { OR: [{ expiresAt: { lt: before } }, { revokedAt: { lt: before } }] },
      });
      return count;
    },
  };
}

export type SessionRepo = ReturnType<typeof createSessionRepo>;
