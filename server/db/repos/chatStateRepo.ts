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

    /**
     * Claims the current state if it's still `kind` with this `nonce` (the one on the buttons) and not expired,
     * deleting it. Of two concurrent presses only one gets the state; an old keyboard gets null.
     */
    async take(userId: string, kind: ChatStateKind, nonce: string, now: Date) {
      const where = { userId, kind, expiresAt: { gt: now }, payload: { path: ['nonce'], equals: nonce } };
      const state = await db.chatState.findFirst({ where });
      if (!state) return null;
      const { count } = await db.chatState.deleteMany({ where });
      return count === 1 ? state : null;
    },

    async clear(userId: string) {
      await db.chatState.deleteMany({ where: { userId } });
    },
  };
}

export type ChatStateRepo = ReturnType<typeof createChatStateRepo>;
