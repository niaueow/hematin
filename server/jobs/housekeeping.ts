import type { IntentRepo } from '../db/repos/intentRepo.js';
import type { MagicTokenRepo } from '../db/repos/magicTokenRepo.js';
import type { ProcessedUpdateRepo } from '../db/repos/processedUpdateRepo.js';
import type { RateLimitRepo } from '../db/repos/rateLimitRepo.js';
import type { SessionRepo } from '../db/repos/sessionRepo.js';
import { logger } from '../lib/logger.js';

// Housekeeping, run inside the daily job (DATA_MODEL "Housekeeping"). Every step is independent: one failing
// is logged and the others still run. Ages are plain instant arithmetic, not business dates.

const DAY_MS = 86_400_000;

export type HousekeepingDeps = {
  processedUpdates: Pick<ProcessedUpdateRepo, 'deleteOlderThan'>;
  rateLimits: Pick<RateLimitRepo, 'deleteExpired'>;
  magicTokens: Pick<MagicTokenRepo, 'deleteOlderThan'>;
  intents: Pick<IntentRepo, 'expireOverdue'>;
  sessions: Pick<SessionRepo, 'deleteStale'>;
};

/** Rows affected per step; null if that step failed. */
export type HousekeepingStats = Record<
  'processedUpdates' | 'rateLimits' | 'magicTokens' | 'intentsExpired' | 'sessions',
  number | null
>;

export async function runHousekeeping(deps: HousekeepingDeps, now: Date): Promise<HousekeepingStats> {
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const steps: [keyof HousekeepingStats, () => Promise<number>][] = [
    ['processedUpdates', () => deps.processedUpdates.deleteOlderThan(ago(7))],
    ['rateLimits', () => deps.rateLimits.deleteExpired(now)],
    ['magicTokens', () => deps.magicTokens.deleteOlderThan(ago(1))],
    ['intentsExpired', () => deps.intents.expireOverdue(now)], // PENDING past expiresAt → EXPIRED
    ['sessions', () => deps.sessions.deleteStale(ago(30))], // expired or revoked for > 30 days
  ];
  const stats = {} as HousekeepingStats;
  for (const [name, step] of steps) {
    try {
      stats[name] = await step();
    } catch (err) {
      stats[name] = null;
      logger.error('housekeeping_failed', { step: name, error: err instanceof Error ? err.message : 'unknown' });
    }
  }
  return stats;
}
