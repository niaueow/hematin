import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INCOME_REMINDER, incomeReminder } from '@server/bot/copy.js';
import { BotBlockedError } from '@server/bot/telegram.js';
import { runMonthlyIncomeReminder } from '@server/jobs/monthlyIncomeReminder.js';

// 10:00 WIB on Sun 1 Nov 2026 = 03:00 UTC.
const now = new Date('2026-11-01T03:00:00.000Z');
const user = (id: string, telegramId: bigint) => ({ id, telegramId });

function setup(options: { alreadyRan?: boolean; withIncome?: string[]; sendError?: Record<string, Error> } = {}) {
  const users = [user('u_a', 111n), user('u_b', 222n), user('u_c', 333n)];
  const deps = {
    users: { listActive: vi.fn().mockResolvedValue(users), setBotBlocked: vi.fn().mockResolvedValue(undefined) },
    tx: { hasIncomeInRange: vi.fn((id: string) => Promise.resolve((options.withIncome ?? []).includes(id))) },
    cronRuns: { start: vi.fn().mockResolvedValue(!options.alreadyRan), finish: vi.fn().mockResolvedValue(undefined) },
    send: vi.fn((chatId: string) => {
      const err = options.sendError?.[chatId];
      return err ? Promise.reject(err) : Promise.resolve();
    }),
    random: () => 0,
  };
  return { deps, run: () => runMonthlyIncomeReminder(deps, now) };
}

describe('monthly income reminder', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('sends to every active user without income dated this month (WIB)', async () => {
    const { deps, run } = setup();
    const stats = await run();
    expect(deps.cronRuns.start).toHaveBeenCalledWith('income-reminder:2026-11');
    expect(deps.tx.hasIncomeInRange).toHaveBeenCalledWith('u_a', '2026-11-01', '2026-11-30');
    expect(deps.send.mock.calls.map(([chatId]) => chatId)).toEqual(['111', '222', '333']);
    expect(deps.send).toHaveBeenCalledWith('111', INCOME_REMINDER[0]);
    expect(stats).toMatchObject({ users: 3, sent: 3, alreadyRecorded: 0, blocked: 0, failed: 0 });
    expect(deps.cronRuns.finish).toHaveBeenCalledWith('income-reminder:2026-11', now, {
      users: 3,
      alreadyRecorded: 0,
      sent: 3,
      blocked: 0,
      failed: 0,
    });
  });

  it('skips users who already recorded income this month', async () => {
    const { deps, run } = setup({ withIncome: ['u_b'] });
    const stats = await run();
    expect(deps.send.mock.calls.map(([chatId]) => chatId)).toEqual(['111', '333']);
    expect(stats).toMatchObject({ sent: 2, alreadyRecorded: 1 });
  });

  it('runs at most once per month (CronRun)', async () => {
    const { deps, run } = setup({ alreadyRan: true });
    const stats = await run();
    expect(stats.alreadyRan).toBe(true);
    expect(deps.users.listActive).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
    expect(deps.cronRuns.finish).not.toHaveBeenCalled();
  });

  it('marks users who blocked the bot and keeps going', async () => {
    const { deps, run } = setup({ sendError: { '222': new BotBlockedError() } });
    const stats = await run();
    expect(deps.users.setBotBlocked).toHaveBeenCalledWith('u_b', true);
    expect(stats).toMatchObject({ sent: 2, blocked: 1, failed: 0 });
  });

  it('one failing user does not stop the others', async () => {
    const { deps, run } = setup({ sendError: { '111': new Error('network') } });
    const stats = await run();
    expect(deps.send).toHaveBeenCalledTimes(3);
    expect(stats).toMatchObject({ sent: 2, failed: 1 });
  });

  it('uses the WIB month: 00:30 WIB on 1 Dec is already December', async () => {
    const { deps } = setup();
    await runMonthlyIncomeReminder(deps, new Date('2026-11-30T17:30:00.000Z'));
    expect(deps.cronRuns.start).toHaveBeenCalledWith('income-reminder:2026-12');
  });
});

describe('income reminder copy (BOT_SPEC §4–5)', () => {
  const emoji = /\p{Extended_Pictographic}/gu;

  it.each(INCOME_REMINDER.map((text, i) => [i, text]))('variant %i: ≤ 5 lines, ≤ 2 emoji, conditional', (_i, text) => {
    expect(text.split('\n').length).toBeLessThanOrEqual(5);
    expect((text.match(emoji) ?? []).length).toBeLessThanOrEqual(2);
    expect(text).toMatch(/kalau/i); // doesn't assume there is income to record
    expect(text).toMatch(/"(uang jajan|uang saku) [\d,.]+jt"/); // shows how to log it
  });

  it('picks a variant at random', () => {
    expect(incomeReminder(() => 0)).toBe(INCOME_REMINDER[0]);
    expect(incomeReminder(() => 0.99)).toBe(INCOME_REMINDER[2]);
    expect(INCOME_REMINDER).toContain(incomeReminder());
  });
});
