import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyReminder } from '@server/bot/copy.js';
import { BotBlockedError } from '@server/bot/telegram.js';
import { runDailyReminder } from '@server/jobs/dailyReminder.js';
import { runHousekeeping } from '@server/jobs/housekeeping.js';

// 21:00 WIB on Mon 2 Nov 2026 = 14:00 UTC (vercel.json "0 14 * * *").
const now = new Date('2026-11-02T14:00:00.000Z');
const user = (id: string, telegramId: bigint) => ({ id, telegramId });

function housekeepingDeps() {
  return {
    processedUpdates: { deleteOlderThan: vi.fn().mockResolvedValue(10) },
    rateLimits: { deleteExpired: vi.fn().mockResolvedValue(20) },
    magicTokens: { deleteOlderThan: vi.fn().mockResolvedValue(1) },
    intents: { expireOverdue: vi.fn().mockResolvedValue(3) },
    sessions: { deleteStale: vi.fn().mockResolvedValue(0) },
  };
}

/**
 * u_logged: logged something today. u_nospend: tapped "ga keluar duit". u_noincome: nothing today, no income
 * this month. u_plain: nothing today, has income.
 */
function setup(options: { alreadyRan?: boolean; sendError?: Record<string, Error> } = {}) {
  const users = [user('u_logged', 1n), user('u_nospend', 2n), user('u_noincome', 3n), user('u_plain', 4n)];
  const deps = {
    users: { listActive: vi.fn().mockResolvedValue(users), setBotBlocked: vi.fn().mockResolvedValue(undefined) },
    tx: {
      existsOnDate: vi.fn((id: string) => Promise.resolve(id === 'u_logged')),
      hasIncomeInRange: vi.fn((id: string) => Promise.resolve(id !== 'u_noincome')),
    },
    noSpend: { exists: vi.fn((id: string) => Promise.resolve(id === 'u_nospend')) },
    cronRuns: { start: vi.fn().mockResolvedValue(!options.alreadyRan), finish: vi.fn().mockResolvedValue(undefined) },
    housekeeping: housekeepingDeps(),
    send: vi.fn((chatId: string) => {
      const err = options.sendError?.[chatId];
      return err ? Promise.reject(err) : Promise.resolve();
    }),
    random: () => 0,
  };
  return { deps, run: (at = now) => runDailyReminder(deps, at) };
}

type SendCall = [string, string, { keyboard: { inline_keyboard: { text: string; callback_data: string }[][] } }];

describe('daily reminder (BOT_SPEC §4, PRD US4)', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('reminds only users with nothing logged and no "ga keluar duit" today (WIB)', async () => {
    const { deps, run } = setup();
    const stats = await run();
    expect(deps.cronRuns.start).toHaveBeenCalledWith('daily-reminder:2026-11-02');
    expect(deps.tx.existsOnDate).toHaveBeenCalledWith('u_logged', '2026-11-02');
    expect(deps.noSpend.exists).toHaveBeenCalledWith('u_nospend', '2026-11-02');
    expect(deps.send.mock.calls.map(([chatId]) => chatId)).toEqual(['3', '4']);
    expect(stats).toMatchObject({ users: 4, sent: 2, skipped: 2, blocked: 0, failed: 0 });
  });

  it('adds the income line when this month has no income; every reminder has the no-spend button', async () => {
    const { deps, run } = setup();
    await run();
    const calls = deps.send.mock.calls as unknown as SendCall[];
    expect(calls.map(([chatId, text]) => [chatId, text])).toEqual([
      ['3', dailyReminder(true, () => 0)],
      ['4', dailyReminder(false, () => 0)],
    ]);
    expect(calls[0]?.[1]).toMatch(/uang jajan bulan ini belum dicatat/);
    expect(calls[1]?.[1]).not.toMatch(/uang jajan/);
    for (const [, , options] of calls)
      expect(options.keyboard.inline_keyboard).toEqual([
        [{ text: '✅ Hari ini emang ga keluar duit', callback_data: 'ns:2026-11-02' }],
      ]);
    expect(deps.tx.hasIncomeInRange).toHaveBeenCalledWith('u_noincome', '2026-11-01', '2026-11-30');
  });

  it('runs at most once per WIB day (CronRun): the second call is a no-op', async () => {
    const { deps, run } = setup({ alreadyRan: true });
    const stats = await run();
    expect(stats).toMatchObject({ runKey: 'daily-reminder:2026-11-02', alreadyRan: true, sent: 0 });
    expect(deps.users.listActive).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
    expect(deps.housekeeping.intents.expireOverdue).not.toHaveBeenCalled();
    expect(deps.cronRuns.finish).not.toHaveBeenCalled();
  });

  it('uses the WIB date: 00:30 WIB on 3 Nov is the 3rd', async () => {
    const { deps, run } = setup();
    await run(new Date('2026-11-02T17:30:00.000Z'));
    expect(deps.cronRuns.start).toHaveBeenCalledWith('daily-reminder:2026-11-03');
  });

  it('a user who blocked the bot is marked; a failing user doesn’t stop the rest', async () => {
    const { deps, run } = setup({ sendError: { '3': new BotBlockedError() } });
    expect(await run()).toMatchObject({ sent: 1, blocked: 1, failed: 0 });
    expect(deps.users.setBotBlocked).toHaveBeenCalledWith('u_noincome', true);

    const other = setup({ sendError: { '3': new Error('network') } });
    expect(await other.run()).toMatchObject({ sent: 1, failed: 1 });
    expect(other.deps.send).toHaveBeenCalledTimes(2);
  });

  it('stores the delivery and housekeeping stats in CronRun.stats', async () => {
    const { deps, run } = setup();
    await run();
    expect(deps.cronRuns.finish).toHaveBeenCalledWith('daily-reminder:2026-11-02', now, {
      users: 4,
      sent: 2,
      skipped: 2,
      blocked: 0,
      failed: 0,
      housekeeping: { processedUpdates: 10, rateLimits: 20, magicTokens: 1, intentsExpired: 3, sessions: 0 },
    });
  });
});

describe('housekeeping (DATA_MODEL "Housekeeping")', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('deletes old ProcessedUpdates (7 d), expired RateLimits, old magic tokens (1 d), stale sessions (30 d); expires PENDING intents', async () => {
    const deps = housekeepingDeps();
    await runHousekeeping(deps, now);
    expect(deps.processedUpdates.deleteOlderThan).toHaveBeenCalledWith(new Date('2026-10-26T14:00:00.000Z'));
    expect(deps.rateLimits.deleteExpired).toHaveBeenCalledWith(now);
    expect(deps.magicTokens.deleteOlderThan).toHaveBeenCalledWith(new Date('2026-11-01T14:00:00.000Z'));
    expect(deps.intents.expireOverdue).toHaveBeenCalledWith(now);
    expect(deps.sessions.deleteStale).toHaveBeenCalledWith(new Date('2026-10-03T14:00:00.000Z'));
  });

  it('one failing step is recorded as null and the others still run', async () => {
    const deps = housekeepingDeps();
    deps.rateLimits.deleteExpired.mockRejectedValue(new Error('db'));
    expect(await runHousekeeping(deps, now)).toEqual({
      processedUpdates: 10,
      rateLimits: null,
      magicTokens: 1,
      intentsExpired: 3,
      sessions: 0,
    });
  });
});
