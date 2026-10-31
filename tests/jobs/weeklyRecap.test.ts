import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localDateToDb, parseLocalDate } from '@server/budget/periods.js';
import { createBudgetService } from '@server/budget/service.js';
import { runWeeklyRecap } from '@server/jobs/weeklyRecap.js';
import { BotBlockedError } from '@server/bot/telegram.js';
import { DEFAULT_CATEGORIES } from '@server/nlp/keywords.js';

// The weekly recap through the real budget service and engine, with mocked repos.
// Sunday 1 Nov 2026, 22:00 WIB = 15:00 UTC (vercel.json "0 15 * * 0"). The week Mon 26 Oct – Sun 1 Nov spans
// two months: October's last segment (26–31, 6 days) and November's first (Sun 1, 1 day).

const now = new Date('2026-11-01T15:00:00.000Z');
const bucketOf = Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.id, c.bucket]));
const row = (
  type: 'INCOME' | 'EXPENSE' | 'SAVING',
  amount: number,
  date: string,
  categoryId: string | null = null,
) => ({
  type,
  amount,
  localDate: localDateToDb(parseLocalDate(date)),
  categoryId,
  category: categoryId ? { bucket: bucketOf[categoryId] } : null,
});

/**
 * October: income 3.100.000 (31 days) → wants 930.000 = 30.000/day, needs 1.550.000 = 50.000/day.
 * November: income 2.000.000 → wants 20.000/day, needs 1.000.000 (33.333 for a 1-day segment).
 */
const history = {
  u_active: [
    row('INCOME', 3_100_000, '2026-10-01'),
    row('EXPENSE', 240_000, '2026-10-20', 'sys_jajan'), // 19–25 Oct: base 210.000 → 30.000 debt into the week
    row('EXPENSE', 100_000, '2026-10-27', 'sys_jajan'),
    row('EXPENSE', 120_000, '2026-10-27', 'sys_makan'),
    row('EXPENSE', 60_000, '2026-10-29', 'sys_transport'),
    row('EXPENSE', 50_000, '2026-10-30', 'sys_nongkrong'),
    row('INCOME', 2_000_000, '2026-11-01'),
    row('EXPENSE', 5_000, '2026-11-01', 'sys_jajan'),
    row('SAVING', 200_000, '2026-11-01', 'sys_nabung'),
  ],
  u_quiet: [row('INCOME', 3_100_000, '2026-10-01'), row('EXPENSE', 10_000, '2026-10-12', 'sys_makan')],
  u_over: [
    row('INCOME', 3_100_000, '2026-10-01'),
    row('INCOME', 2_000_000, '2026-11-01'),
    row('EXPENSE', 200_000, '2026-10-28', 'sys_jajan'),
    row('EXPENSE', 30_000, '2026-11-01', 'sys_jajan'),
  ],
  u_nobudget: [row('EXPENSE', 25_000, '2026-10-28', 'sys_makan')],
} as const;
type Id = keyof typeof history;

const user = (id: Id, telegramId: bigint) => ({ id, telegramId, needsPct: 50, wantsPct: 30, savingsPct: 20 });

function setup(options: { users?: Id[]; alreadyRan?: boolean; sendError?: Record<string, Error> } = {}) {
  const ids = options.users ?? ['u_active', 'u_quiet', 'u_over', 'u_nobudget'];
  const users = ids.map((id, i) => user(id, BigInt(i + 1)));
  const listUpTo = vi.fn((id: Id) => Promise.resolve(history[id]));
  const sumSkipped = vi.fn((id: Id) =>
    Promise.resolve(id === 'u_active' ? { amount: 55_000, count: 2 } : { amount: 0, count: 0 }),
  );
  const deps = {
    users: { listActive: vi.fn().mockResolvedValue(users), setBotBlocked: vi.fn().mockResolvedValue(undefined) },
    budget: createBudgetService({ txRepo: { listUpTo }, intentRepo: { sumSkipped } } as never),
    categories: { listUsable: vi.fn().mockResolvedValue(DEFAULT_CATEGORIES) },
    cronRuns: { start: vi.fn().mockResolvedValue(!options.alreadyRan), finish: vi.fn().mockResolvedValue(undefined) },
    send: vi.fn<(chatId: string, text: string) => Promise<void>>((chatId) => {
      const err = options.sendError?.[chatId];
      return err ? Promise.reject(err) : Promise.resolve();
    }),
  };
  const sentTo = (chatId: string) => deps.send.mock.calls.find(([id]) => id === chatId)?.[1];
  return { deps, sumSkipped, sentTo, run: () => runWeeklyRecap(deps, now) };
}

describe('weekly recap (BOT_SPEC §4)', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('a week spanning Oct/Nov 2026: allocations summed over both segments, debt, bonus, skips, savings', async () => {
    const { sentTo, sumSkipped, run } = setup({ users: ['u_active'] });
    await run();
    // By hand (BUDGET_RULES §3–§7, §10 I5/I6):
    // - needs: 26–31 Oct 6 × 50.000 = 300.000 + 1 Nov 33.333 = 333.333; spent 120.000 + 60.000.
    // - wants base: 6 × 30.000 + 20.000 = 200.000, minus the 30.000 debt from 19–25 Oct = 170.000.
    //   Spent 100.000 + 50.000 + 5.000 = 155.000. 26–31 Oct: 150.000 effective, all spent → no surplus;
    //   1 Nov: 20.000 − 5.000 = 15.000 leftover (ends tonight: shown as the bonus, I6). 170.000 − 155.000 = 15.000 − 0 ✓.
    // - top: Makan 120.000, Jajan 105.000, Transport 60.000 (Nongkrong 50.000 is 4th).
    // - savings (November): 200.000 of 400.000 = 50%; 1 Nov hasn't ended, so no bonus yet.
    expect(sentTo('1')).toBe(
      [
        '📊 Rekap minggu ini (26 Okt – 1 Nov)',
        'Pokok: Rp180.000 / Rp333.333',
        'Jajan: Rp155.000 / Rp170.000 ✅ (udah dipotong utang Rp30.000)',
        'Top: Makan Rp120.000 · Jajan Rp105.000 · Transport Rp60.000',
        '🎉 Sisa jajan Rp15.000 jadi bonus nabung. Jangan lupa transfer ke tabunganmu ya!',
        '💪 Kamu skip jajan 2x, hemat Rp55.000',
        'Tabungan bulan ini: 50% dari target. Dikit lagi!',
      ].join('\n'),
    );
    expect(sumSkipped).toHaveBeenCalledWith('u_active', '2026-10-26', '2026-11-01');
  });

  it('over budget: the debt carried into next week is called out', async () => {
    const { sentTo, run } = setup({ users: ['u_over'] });
    await run();
    // 26–31 Oct: 180.000 − 200.000 → 20.000 debt into 1 Nov: 20.000 − 20.000 − 30.000 → 30.000 debt out.
    expect(sentTo('1')).toBe(
      [
        '📊 Rekap minggu ini (26 Okt – 1 Nov)',
        'Pokok: Rp0 / Rp333.333',
        'Jajan: Rp230.000 / Rp200.000',
        'Top: Jajan Rp230.000',
        '😬 Jajan minggu ini boros, lewat Rp30.000. Jatah minggu depan kepotong segitu.',
        'Tabungan bulan ini: 0% dari target. Ayo dikejar!',
      ].join('\n'),
    );
  });

  it('no income in either month: spend only, no allocations', async () => {
    const { sentTo, run } = setup({ users: ['u_nobudget'] });
    await run();
    expect(sentTo('1')).toBe(
      [
        '📊 Rekap minggu ini (26 Okt – 1 Nov)',
        'Pengeluaran: Rp25.000. Budget-nya belum bisa dihitung, uang jajan belum dicatat.',
        'Top: Makan Rp25.000',
      ].join('\n'),
    );
  });

  it('users with no activity this week get nothing', async () => {
    const { deps, run } = setup();
    const stats = await run();
    expect(deps.send.mock.calls.map(([chatId]) => chatId)).toEqual(['1', '3', '4']);
    expect(stats).toMatchObject({ users: 4, sent: 3, skipped: 1 });
  });

  it('runs at most once per WIB day (CronRun): the second call is a no-op', async () => {
    const { deps, run } = setup({ alreadyRan: true });
    const stats = await run();
    expect(stats).toMatchObject({ runKey: 'weekly-recap:2026-11-01', alreadyRan: true, sent: 0 });
    expect(deps.users.listActive).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
  });

  it('blocked users are marked, failures counted, stats stored', async () => {
    const { deps, run } = setup({ sendError: { '1': new BotBlockedError(), '3': new Error('network') } });
    await run();
    expect(deps.users.setBotBlocked).toHaveBeenCalledWith('u_active', true);
    expect(deps.cronRuns.finish).toHaveBeenCalledWith('weekly-recap:2026-11-01', now, {
      users: 4,
      sent: 1,
      skipped: 1,
      blocked: 1,
      failed: 1,
    });
  });
});
