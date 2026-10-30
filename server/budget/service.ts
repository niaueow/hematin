import type { IntentRepo } from '../db/repos/intentRepo.js';
import type { TxRepo } from '../db/repos/txRepo.js';
import {
  checkPurchase,
  snapshot,
  weeklyRecap,
  type BudgetSnapshot,
  type EngineInput,
  type PurchaseCheck,
  type WeeklyRecap,
} from './engine.js';
import { localDateFromDb, monthEnd, monthOf, monthStart, todayWib, weekOf } from './periods.js';

// Thin glue: load the user's transactions through repos, hand them to the pure engine, and add the
// "saved by skipping" stats (§7), which come from PurchaseIntents and never count toward savings.

export type BudgetUser = { id: string; needsPct: number; wantsPct: number; savingsPct: number };

export type BudgetServiceDeps = {
  txRepo: Pick<TxRepo, 'listUpTo'>;
  intentRepo: Pick<IntentRepo, 'sumSkipped'>;
};

export type Skipped = { amount: number; count: number };

export function createBudgetService({ txRepo, intentRepo }: BudgetServiceDeps) {
  async function engineInput(user: BudgetUser, now: Date): Promise<EngineInput> {
    const today = todayWib(now);
    const rows = await txRepo.listUpTo(user.id, today);
    return {
      pcts: { needs: user.needsPct, wants: user.wantsPct, savings: user.savingsPct },
      today,
      transactions: rows.map((row) => ({
        type: row.type,
        amount: row.amount,
        localDate: localDateFromDb(row.localDate),
        bucket: row.category?.bucket ?? null,
        categoryId: row.categoryId,
      })),
    };
  }

  return {
    /** "/sisa" and GET /api/budget/current. */
    async current(
      user: BudgetUser,
      now: Date,
    ): Promise<BudgetSnapshot & { savedBySkipping: { week: Skipped; month: Skipped } }> {
      const snap = snapshot(await engineInput(user, now));
      const week = weekOf(snap.today);
      const month = monthOf(snap.today);
      const [weekSkipped, monthSkipped] = await Promise.all([
        intentRepo.sumSkipped(user.id, week.start, week.end),
        intentRepo.sumSkipped(user.id, monthStart(month), monthEnd(month)),
      ]);
      return { ...snap, savedBySkipping: { week: weekSkipped, month: monthSkipped } };
    },

    /** "mau X" for a WANTS category. The caller checks the bucket (NEEDS items get no verdict, §6). */
    async checkPurchase(user: BudgetUser, amount: number, now: Date): Promise<PurchaseCheck> {
      return checkPurchase(snapshot(await engineInput(user, now)), amount);
    },

    /** Sunday recap for the Mon–Sun week containing `now` (WIB). */
    async weeklyRecap(user: BudgetUser, now: Date): Promise<WeeklyRecap & { skipped: Skipped }> {
      const recap = weeklyRecap(await engineInput(user, now));
      const skipped = await intentRepo.sumSkipped(user.id, recap.week.start, recap.week.end);
      return { ...recap, skipped };
    },
  };
}

export type BudgetService = ReturnType<typeof createBudgetService>;
