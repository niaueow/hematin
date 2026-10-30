import type { Prisma } from '../generated/client.js';
import type { Db } from '../prisma.js';

// One short-lived conversation state per user (e.g. waiting for "Berapa duitnya?"). Overwritten on set.

export type ChatStateKind = 'AWAIT_AMOUNT' | 'CONFIRM_AMOUNT' | 'AWAIT_CATEGORY';

export function createChatStateRepo(db: Db) {
  return {
    /** The current state, or null if none or expired. */
    get(userId: string, now: Date) {
      return db.chatState.findFirst({ where: { userId, expiresAt: { gt: now } } });
    },

    set(userId: string, kind: ChatStateKind, payload: Prisma.InputJsonValue, expiresAt: Date) {
      return db.chatState.upsert({
        where: { userId },
        create: { userId, kind, payload, expiresAt },
        update: { kind, payload, expiresAt },
      });
    },

    async clear(userId: string) {
      await db.chatState.deleteMany({ where: { userId } });
    },
  };
}

export type ChatStateRepo = ReturnType<typeof createChatStateRepo>;
