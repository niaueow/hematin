import { dailyReminder } from '../bot/copy.js';
import { noSpendKeyboard } from '../bot/keyboards.js';
import type { SendText } from '../bot/telegram.js';
import { monthEnd, monthOf, monthStart, todayWib } from '../budget/periods.js';
import type { CronRunRepo } from '../db/repos/cronRunRepo.js';
import type { NoSpendRepo } from '../db/repos/noSpendRepo.js';
import type { TxRepo } from '../db/repos/txRepo.js';
import type { UserRepo } from '../db/repos/userRepo.js';
import { deliverToEach, type DeliveryStats } from './deliver.js';
import { runHousekeeping, type HousekeepingDeps, type HousekeepingStats } from './housekeeping.js';

// Daily reminder, ~21:00 WIB (vercel.json "0 14 * * *" UTC; Hobby fires within the hour). BOT_SPEC §4, PRD US4.
// Recipients: ACTIVE users the bot can reach (not botBlocked) with no transaction (any type, not deleted)
// dated today (WIB) and no NoSpendDay for today. Months without income get the income line.
// Idempotent per WIB date via CronRun "daily-reminder:YYYY-MM-DD". Housekeeping runs in the same job.

export type DailyReminderDeps = {
  users: Pick<UserRepo, 'listActive' | 'setBotBlocked'>;
  tx: Pick<TxRepo, 'existsOnDate' | 'hasIncomeInRange'>;
  noSpend: Pick<NoSpendRepo, 'exists'>;
  cronRuns: Pick<CronRunRepo, 'start' | 'finish'>;
  housekeeping: HousekeepingDeps;
  send: SendText;
  random?: () => number;
};

export type DailyReminderStats = DeliveryStats & {
  runKey: string;
  alreadyRan: boolean;
  housekeeping: HousekeepingStats | null;
};

export async function runDailyReminder(deps: DailyReminderDeps, now: Date): Promise<DailyReminderStats> {
  const today = todayWib(now);
  const month = monthOf(today);
  const runKey = `daily-reminder:${today}`;
  if (!(await deps.cronRuns.start(runKey))) {
    return { runKey, alreadyRan: true, users: 0, sent: 0, skipped: 0, blocked: 0, failed: 0, housekeeping: null };
  }

  const users = await deps.users.listActive();
  const delivery = await deliverToEach('daily_reminder', users, deps, async (user) => {
    if (await deps.tx.existsOnDate(user.id, today)) return null;
    if (await deps.noSpend.exists(user.id, today)) return null;
    const askIncome = !(await deps.tx.hasIncomeInRange(user.id, monthStart(month), monthEnd(month)));
    return { text: dailyReminder(askIncome, deps.random), keyboard: noSpendKeyboard(today) };
  });
  const housekeeping = await runHousekeeping(deps.housekeeping, now);

  await deps.cronRuns.finish(runKey, now, { ...delivery, housekeeping });
  return { runKey, alreadyRan: false, ...delivery, housekeeping };
}
