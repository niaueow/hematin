import { localDateToDb, type LocalDate } from '../../budget/periods.js';
import type { Db } from '../prisma.js';

// "Hari ini emang ga keluar duit": suppresses the daily reminder for that date.

export function createNoSpendRepo(db: Db) {
  return {
    async mark(userId: string, date: LocalDate) {
      await db.noSpendDay.createMany({ data: [{ userId, localDate: localDateToDb(date) }], skipDuplicates: true });
    },

    async exists(userId: string, date: LocalDate) {
      const found = await db.noSpendDay.findFirst({ where: { userId, localDate: localDateToDb(date) } });
      return found !== null;
    },
  };
}

export type NoSpendRepo = ReturnType<typeof createNoSpendRepo>;
