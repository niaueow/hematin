import type { Db } from '../prisma.js';

// Telegram retry protection (ARCHITECTURE §3.1 step 3).

export function createProcessedUpdateRepo(db: Db) {
  return {
    /** True the first time an update id is seen; false for a Telegram retry. */
    async markProcessed(updateId: bigint) {
      const { count } = await db.processedUpdate.createMany({ data: [{ updateId }], skipDuplicates: true });
      return count === 1;
    },

    async deleteOlderThan(before: Date) {
      const { count } = await db.processedUpdate.deleteMany({ where: { createdAt: { lt: before } } });
      return count;
    },
  };
}

export type ProcessedUpdateRepo = ReturnType<typeof createProcessedUpdateRepo>;
