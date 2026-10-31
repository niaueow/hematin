import { weeklyRecap } from '../bot/copy.js';
import type { SendText } from '../bot/telegram.js';
import type { BudgetService } from '../budget/service.js';
import { todayWib } from '../budget/periods.js';
import type { CategoryRepo } from '../db/repos/categoryRepo.js';
import type { CronRunRepo } from '../db/repos/cronRunRepo.js';
import type { UserRepo } from '../db/repos/userRepo.js';
import { deliverToEach, type DeliveryStats } from './deliver.js';

// Weekly recap, Sunday ~22:00 WIB (vercel.json "0 15 * * 0" UTC). BOT_SPEC §4, PRD US5. The numbers come from
// the engine's week aggregation (a Mon–Sun week may span two months; allocations are summed over its
// segments, BUDGET_RULES §10 I5/I6) and the service's "saved by skipping" stat (§7).
// Users with no activity that week (nothing logged, nothing skipped) get nothing.
// Idempotent per WIB date via CronRun "weekly-recap:YYYY-MM-DD".

export type WeeklyRecapDeps = {
  users: Pick<UserRepo, 'listActive' | 'setBotBlocked'>;
  budget: Pick<BudgetService, 'weeklyRecap'>;
  categories: Pick<CategoryRepo, 'listUsable'>;
  cronRuns: Pick<CronRunRepo, 'start' | 'finish'>;
  send: SendText;
};

export type WeeklyRecapStats = DeliveryStats & { runKey: string; alreadyRan: boolean };

export async function runWeeklyRecap(deps: WeeklyRecapDeps, now: Date): Promise<WeeklyRecapStats> {
  const runKey = `weekly-recap:${todayWib(now)}`;
  if (!(await deps.cronRuns.start(runKey))) {
    return { runKey, alreadyRan: true, users: 0, sent: 0, skipped: 0, blocked: 0, failed: 0 };
  }

  const users = await deps.users.listActive();
  const delivery = await deliverToEach('weekly_recap', users, deps, async (user) => {
    const recap = await deps.budget.weeklyRecap(user, now);
    if (recap.expense + recap.income + recap.saving === 0 && recap.skipped.count === 0) return null;
    const names = new Map((await deps.categories.listUsable(user.id)).map((c) => [c.id, c.name]));
    const top = recap.byCategory
      .filter((c) => c.categoryId !== null && names.has(c.categoryId))
      .slice(0, 3)
      .map((c) => ({ name: names.get(c.categoryId as string) as string, amount: c.amount }));
    return {
      text: weeklyRecap({
        week: recap.week,
        needs: recap.needs,
        wants: recap.wants,
        expense: recap.expense,
        top,
        skipped: recap.skipped,
        savings: recap.savings,
      }),
    };
  });

  await deps.cronRuns.finish(runKey, now, delivery);
  return { runKey, alreadyRan: false, ...delivery };
}
