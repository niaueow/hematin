import { describe, expect, it, vi } from 'vitest';
import { hitRateLimit, MESSAGES_PER_MINUTE } from '@server/lib/rateLimit.js';

describe('hitRateLimit', () => {
  const now = new Date('2026-11-01T03:00:30.000Z');
  const window = Math.floor(now.getTime() / 60_000);

  it('keys the counter by rule, subject and minute window; expires at the window end', async () => {
    const hit = vi.fn(() => Promise.resolve(1));
    await hitRateLimit({ hit }, MESSAGES_PER_MINUTE, 'u1', now);
    expect(hit).toHaveBeenCalledWith(`msg:u1:${window}`, new Date('2026-11-01T03:01:00.000Z'));
  });

  it.each([
    [1, { allowed: true, justExceeded: false }],
    [20, { allowed: true, justExceeded: false }],
    [21, { allowed: false, justExceeded: true }],
    [22, { allowed: false, justExceeded: false }],
  ])('count %i → %j', async (count, expected) => {
    const result = await hitRateLimit({ hit: () => Promise.resolve(count) }, MESSAGES_PER_MINUTE, 'u1', now);
    expect(result).toEqual({ ...expected, count });
  });
});
