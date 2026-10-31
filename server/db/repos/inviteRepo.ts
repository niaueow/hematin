import type { Db } from '../prisma.js';

// Single-use invites (D-006). Only sha256(code) is stored. Run consume() in the same transaction
// that creates the new user.

export function createInviteRepo(db: Db) {
  return {
    create(createdById: string, invite: { codeHash: string; expiresAt: Date }) {
      return db.invite.create({ data: { ...invite, createdById } });
    },

    /** Marks the invite used by `usedById`. False if unknown, used, or expired. */
    async consume(codeHash: string, usedById: string, now: Date) {
      const { count } = await db.invite.updateMany({
        where: { codeHash, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now, usedById },
      });
      return count === 1;
    },
  };
}

export type InviteRepo = ReturnType<typeof createInviteRepo>;
