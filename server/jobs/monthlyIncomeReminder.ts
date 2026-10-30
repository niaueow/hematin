import { incomeReminder } from '../bot/copy.js';
import { BotBlockedError, type SendText } from '../bot/telegram.js';
import { monthEnd, monthOf, monthStart, todayWib } from '../budget/periods.js';
import type { CronRunRepo } from '../db/repos/cronRunRepo.js';
import type { TxRepo } from '../db/repos/txRepo.js';
import type { UserRepo } from '../db/repos/userRepo.js';
import { forEachLimit } from '../lib/concurrency.js';
import { logger } from '../lib/logger.js';

// Monthly income reminder: 1st of the month, ~10:00 WIB (vercel.json "0 3 1 * *" UTC; Hobby fires within the
// hour). Recipients: ACTIVE users the bot can reach (not botBlocked) who haven't recorded any income dated
// this month yet. Idempotent per month via CronRun "income-reminder:YYYY-MM". It only sends a message:
// it never blocks logging, and a month without income stays NO_BUDGET until income is recorded (D-024).

export type IncomeReminderDeps = {
  users: Pick<UserRepo, 'listActive' | 'setBotBlocked'>;
  tx: Pick<TxRepo, 'hasIncomeInRange'>;
  cronRuns: Pick<CronRunRepo, 'start' | 'finish'>;
  send: SendText;
  random?: () => number;
};

export type IncomeReminderStats = {
  runKey: string;
  alreadyRan: boolean;
  users: number;
  alreadyRecorded: number;
  sent: number;
  blocked: number;
  failed: number;
};

const CONCURRENCY = 5;

export async function runMonthlyIncomeReminder(deps: IncomeReminderDeps, now: Date): Promise<IncomeReminderStats> {
  const month = monthOf(todayWib(now));
  const runKey = `income-reminder:${month}`;
  const stats: IncomeReminderStats = {
    runKey,
    alreadyRan: false,
    users: 0,
    alreadyRecorded: 0,
    sent: 0,
    blocked: 0,
    failed: 0,
  };
  if (!(await deps.cronRuns.start(runKey))) return { ...stats, alreadyRan: true };

  const users = await deps.users.listActive();
  stats.users = users.length;
  await forEachLimit(users, CONCURRENCY, async (user) => {
    try {
      if (await deps.tx.hasIncomeInRange(user.id, monthStart(month), monthEnd(month))) {
        stats.alreadyRecorded++;
        return;
      }
      await deps.send(user.telegramId.toString(), incomeReminder(deps.random));
      stats.sent++;
    } catch (err) {
      if (err instanceof BotBlockedError) {
        stats.blocked++;
        await deps.users.setBotBlocked(user.id, true);
        return;
      }
      // One failing user must not stop the loop (ARCHITECTURE §3.3).
      stats.failed++;
      logger.error('income_reminder_failed', {
        userId: user.id,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  });

  const { users: count, alreadyRecorded, sent, blocked, failed } = stats;
  await deps.cronRuns.finish(runKey, now, { users: count, alreadyRecorded, sent, blocked, failed });
  return stats;
}
