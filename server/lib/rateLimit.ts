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
