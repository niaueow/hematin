import { localDateToDb, type LocalDate } from '../../budget/periods.js';
import type { Verdict } from '../generated/client.js';
import type { Db } from '../prisma.js';

// "mau X" purchase checks (ARCHITECTURE §3.2). Callback buttons carry the intent id, so every lookup
// is scoped to the caller: a forwarded or forged callback from another user finds nothing.

export type NewIntent = {
  item: string;
  amount: number;
  categoryId: string;
  verdict: Verdict;
  localDate: LocalDate;
  expiresAt: Date;
};

export function createIntentRepo(db: Db) {
  return {
    create(userId: string, intent: NewIntent) {
      return db.purchaseIntent.create({
        data: { ...intent, userId, localDate: localDateToDb(intent.localDate) },
      });
    },

    findById(userId: string, id: string) {
      return db.purchaseIntent.findFirst({ where: { id, userId } });
    },

    /** PENDING → BOUGHT, linking the expense. False if not pending, expired, or not this user's. */
    async markBought(userId: string, id: string, transactionId: string, now: Date) {
      const { count } = await db.purchaseIntent.updateMany({
        where: { id, userId, status: 'PENDING', expiresAt: { gt: now } },
        data: { status: 'BOUGHT', decidedAt: now, transactionId },
      });
      return count === 1;
    },

    async markSkipped(userId: string, id: string, now: Date) {
      const { count } = await db.purchaseIntent.updateMany({
        where: { id, userId, status: 'PENDING', expiresAt: { gt: now } },
        data: { status: 'SKIPPED', decidedAt: now },
      });
      return count === 1;
    },

    /** "Total yang kamu selamatkan": sum of SKIPPED amounts with localDate in [from, to]. */
    async sumSkipped(userId: string, from: LocalDate, to: LocalDate) {
      const result = await db.purchaseIntent.aggregate({
        where: { userId, status: 'SKIPPED', localDate: { gte: localDateToDb(from), lte: localDateToDb(to) } },
        _sum: { amount: true },
        _count: true,
      });
      return { amount: result._sum.amount ?? 0, count: result._count };
    },

    /** Housekeeping (daily cron), across all users: PENDING past expiresAt → EXPIRED. */
    async expireOverdue(now: Date) {
      const { count } = await db.purchaseIntent.updateMany({
        where: { status: 'PENDING', expiresAt: { lte: now } },
        data: { status: 'EXPIRED' },
      });
      return count;
    },
  };
}

export type IntentRepo = ReturnType<typeof createIntentRepo>;
