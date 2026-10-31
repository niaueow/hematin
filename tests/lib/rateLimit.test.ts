import { describe, expect, it, vi } from 'vitest';
import { hitDailyQuota, hitRateLimit, MESSAGES_PER_MINUTE } from '@server/lib/rateLimit.js';

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

describe('hitDailyQuota (WIB days)', () => {
  it('keys by name, subject and WIB date; expires at the next WIB midnight', async () => {
    const hit = vi.fn(() => Promise.resolve(1));
    // 23:30 WIB on 31 Oct = 16:30 UTC: still the 31st in WIB
    await hitDailyQuota({ hit }, 'llm', 'u1', 50, new Date('2026-10-31T16:30:00.000Z'));
    expect(hit).toHaveBeenCalledWith('llm:u1:2026-10-31', new Date('2026-10-31T17:00:00.000Z'));
  });

  it.each([
    [1, true],
    [50, true],
    [51, false],
  ])('count %i of 50 → allowed %s', async (count, allowed) => {
    const result = await hitDailyQuota({ hit: () => Promise.resolve(count) }, 'llm', 'u1', 50, new Date());
    expect(result).toEqual({ allowed, count });
  });
});
