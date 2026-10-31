import type { Role, UserStatus } from '../generated/client.js';
import type { Db } from '../prisma.js';

// Identity resolution. Callers pass the id they resolved from Telegram (`from.id`), a session, or
// initData — never one from a request body/query/params (AGENTS.md rule 5).

export type NewUser = {
  telegramId: bigint;
  telegramUsername?: string | null;
  firstName?: string | null;
  role: Role;
};

export function createUserRepo(db: Db) {
  return {
    findByTelegramId(telegramId: bigint) {
      return db.user.findUnique({ where: { telegramId } });
    },

    findActiveById(userId: string) {
      return db.user.findFirst({ where: { id: userId, status: 'ACTIVE' } });
    },

    async ownerExists() {
      return (await db.user.count({ where: { role: 'OWNER' } })) > 0;
    },

    create(user: NewUser) {
      return db.user.create({ data: user });
    },

    /** Cron recipients. */
    listActive() {
      return db.user.findMany({ where: { status: 'ACTIVE', botBlocked: false } });
    },

    async setBotBlocked(userId: string, botBlocked: boolean) {
      await db.user.updateMany({ where: { id: userId }, data: { botBlocked } });
    },

    /** From a Telegram 403 on outbound messages, where only the chat id (= Telegram user id) is known. */
    async setBotBlockedByTelegramId(telegramId: bigint, botBlocked: boolean) {
      await db.user.updateMany({ where: { telegramId }, data: { botBlocked } });
    },

    async setStatus(userId: string, status: UserStatus) {
      await db.user.updateMany({ where: { id: userId }, data: { status } });
    },
  };
}

export type UserRepo = ReturnType<typeof createUserRepo>;
