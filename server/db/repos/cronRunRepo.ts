import type { Prisma } from '../generated/client.js';
import type { Db } from '../prisma.js';

// Cron idempotency (ARCHITECTURE §3.3): one row per run key, e.g. "daily-reminder:2026-10-30".

export function createCronRunRepo(db: Db) {
  return {
    /** True if this call claimed the run; false if it already ran (or is running). */
    async start(runKey: string) {
      const { count } = await db.cronRun.createMany({ data: [{ runKey }], skipDuplicates: true });
      return count === 1;
    },

    async finish(runKey: string, now: Date, stats: Prisma.InputJsonValue) {
      await db.cronRun.updateMany({ where: { runKey }, data: { finishedAt: now, stats } });
    },
  };
}

export type CronRunRepo = ReturnType<typeof createCronRunRepo>;
