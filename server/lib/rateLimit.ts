import { addDays, startOfDayWib, todayWib } from '../budget/periods.js';
import type { RateLimitRepo } from '../db/repos/rateLimitRepo.js';

// Fixed-window rate limits stored in Postgres (SECURITY.md §5). No in-memory state (serverless).

export type RateLimitRule = { name: string; limit: number; windowMs: number };

/** 20 messages per user per minute. */
export const MESSAGES_PER_MINUTE: RateLimitRule = { name: 'msg', limit: 20, windowMs: 60_000 };

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  /** True only for the first request over the limit in a window: reply once, then stay quiet. */
  justExceeded: boolean;
};

/** Counts one hit for `subject` in the current window. Key: "<rule>:<subject>:<window index>". */
export async function hitRateLimit(
  repo: Pick<RateLimitRepo, 'hit'>,
  rule: RateLimitRule,
  subject: string,
  now: Date,
): Promise<RateLimitResult> {
  const window = Math.floor(now.getTime() / rule.windowMs);
  const expiresAt = new Date((window + 1) * rule.windowMs);
  const count = await repo.hit(`${rule.name}:${subject}:${window}`, expiresAt);
  return { allowed: count <= rule.limit, count, justExceeded: count === rule.limit + 1 };
}

/**
 * A per-day quota over the WIB calendar day, e.g. Groq calls (SECURITY §5). Key "<name>:<subject>:<YYYY-MM-DD>",
 * expiring at the next WIB midnight. Counts this attempt.
 */
export async function hitDailyQuota(
  repo: Pick<RateLimitRepo, 'hit'>,
  name: string,
  subject: string,
  limit: number,
  now: Date,
): Promise<{ allowed: boolean; count: number }> {
  const today = todayWib(now);
  const count = await repo.hit(`${name}:${subject}:${today}`, startOfDayWib(addDays(today, 1)));
  return { allowed: count <= limit, count };
}
