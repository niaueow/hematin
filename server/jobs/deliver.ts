import type { InlineKeyboard } from 'grammy';
import { BotBlockedError, type SendText } from '../bot/telegram.js';
import type { UserRepo } from '../db/repos/userRepo.js';
import { forEachLimit } from '../lib/concurrency.js';
import { logger } from '../lib/logger.js';

// Sending one message per user from a cron job (ARCHITECTURE §3.3): a small concurrency limit, and a per-user
// try/catch so one failure never stops the loop. A 403 (the user blocked the bot) marks them botBlocked.
// 429s are retried by the retryOn429 transformer on the bot's API (api/index.ts).

export const SEND_CONCURRENCY = 5;

export type Outgoing = { text: string; keyboard?: InlineKeyboard };

export type DeliveryStats = { users: number; sent: number; skipped: number; blocked: number; failed: number };

export type DeliveryDeps = {
  send: SendText;
  users: Pick<UserRepo, 'setBotBlocked'>;
};

/** `compose` returns the message for a user, or null to skip them. */
export async function deliverToEach<U extends { id: string; telegramId: bigint }>(
  job: string,
  users: readonly U[],
  deps: DeliveryDeps,
  compose: (user: U) => Promise<Outgoing | null>,
): Promise<DeliveryStats> {
  const stats: DeliveryStats = { users: users.length, sent: 0, skipped: 0, blocked: 0, failed: 0 };
  await forEachLimit(users, SEND_CONCURRENCY, async (user) => {
    try {
      const message = await compose(user);
      if (!message) {
        stats.skipped++;
        return;
      }
      const options = message.keyboard ? { keyboard: message.keyboard } : undefined;
      await deps.send(user.telegramId.toString(), message.text, options);
      stats.sent++;
    } catch (err) {
      if (err instanceof BotBlockedError) {
        stats.blocked++;
        await deps.users.setBotBlocked(user.id, true);
        return;
      }
      stats.failed++;
      // The user id and the error message only: never message text or tokens.
      logger.error(`${job}_failed`, { userId: user.id, error: err instanceof Error ? err.message : 'unknown' });
    }
  });
  return stats;
}
