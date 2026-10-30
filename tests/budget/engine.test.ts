import { describe, expect, it } from 'vitest';
import {
  baseAllocations,
  buildLedger,
  checkPurchase,
  snapshot,
  splitIncome,
  weeklyRecap,
  type EngineTransaction,
  type MonthLedger,
} from '@server/budget/engine.js';
import {
  daysInMonth,
  monthRange,
  parseLocalDate,
  segmentsOfMonth,
  toLocalDate,
  type MonthKey,
} from '@server/budget/periods.js';

// docs/BUDGET_RULES.md §9. Every expected number below is worked out by hand from the rules, not
// read back from the engine. "Today" is always frozen explicitly.

const pcts = { needs: 50, wants: 30, savings: 20 };
const d = parseLocalDate;
const income = (date: string, amount: number): EngineTransaction => ({
  type: 'INCOME',
  amount,
  localDate: d(date),
  bucket: 'INCOME',
  categoryId: 'sys_uang_jajan',
});
const wants = (date: string, amount: number, categoryId = 'sys_jajan'): EngineTransaction => ({
  type: 'EXPENSE',
  amount,
  localDate: d(date),
  bucket: 'WANTS',
  categoryId,
});
const needs = (date: string, amount: number, categoryId = 'sys_makan'): EngineTransaction => ({
  type: 'EXPENSE',
  amount,
  localDate: d(date),
  bucket: 'NEEDS',
  categoryId,
});
const saving = (date: string, amount: number): EngineTransaction => ({
  type: 'SAVING',
  amount,
  localDate: d(date),
  bucket: 'SAVINGS',
  categoryId: 'sys_nabung',
});

const snap = (transactions: EngineTransaction[], today: string) => snapshot({ pcts, transactions, today: d(today) });
const ledgerOf = (transactions: EngineTransaction[], today: string, from: string, through = from) =>
  buildLedger({ pcts, transactions, today: d(today) }, from as MonthKey, through as MonthKey);
const month = (ledger: MonthLedger[], key: string) => ledger.find((m) => m.month === key) as MonthLedger;

// §8 worked example: Rp2.000.000 on 1 Nov 2026 → needs 1.000.000, wants 600.000, savings 400.000.
const NOV_INCOME = income('2026-11-01', 2_000_000);
const S1_JAJAN = wants('2026-11-01', 15_000);
const S2_A = wants('2026-11-03', 100_000);
const S2_B = wants('2026-11-05', 70_000); // S2 total 170.000 → debt 30.000
const S3_SO_FAR = wants('2026-11-09', 50_000);
const workedExample = [NOV_INCOME, S1_JAJAN, S2_A, S2_B, S3_SO_FAR];

describe('§2 monthly split', () => {
  it.each([
    [2_000_000, { needsMonth: 1_000_000, wantsMonth: 600_000, savingsTarget: 400_000 }],
    [1_000_001, { needsMonth: 500_000, wantsMonth: 300_000, savingsTarget: 200_001 }], // remainder → savings
    [99, { needsMonth: 49, wantsMonth: 29, savingsTarget: 21 }],
    [0, { needsMonth: 0, wantsMonth: 0, savingsTarget: 0 }],
  ])('income %i', (amount, expected) => {
    expect(splitIncome(amount, pcts)).toEqual(expected);
  });

  it('rejects a split that does not sum to 100', () => {
    expect(() => splitIncome(1000, { needs: 50, wants: 30, savings: 21 })).toThrow(RangeError);
  });
});

describe('§3 segment base allocation (§9 item 2)', () => {
  it('Nov 2026 wants: 20.000 / 4 × 140.000 / 20.000 (last segment absorbs the remainder)', () => {
    expect(baseAllocations(600_000, segmentsOfMonth('2026-11' as MonthKey), 30)).toEqual([
      20_000, 140_000, 140_000, 140_000, 140_000, 20_000,
    ]);
  });

  it('Nov 2026 needs: the remainder goes to the last segment', () => {
    // floor(1.000.000 × 1/30) = 33.333, floor(1.000.000 × 7/30) = 233.333, last = 1.000.000 − 966.665
    expect(baseAllocations(1_000_000, segmentsOfMonth('2026-11' as MonthKey), 30)).toEqual([
      33_333, 233_333, 233_333, 233_333, 233_333, 33_335,
    ]);
  });

  it('sums exactly to the monthly amount for every month in 2026–2028', () => {
    const amounts = [0, 1, 7, 99, 600_000, 1_000_000, 999_999, 1_234_567, 30_000_001];
    for (const m of monthRange('2026-01' as MonthKey, '2028-12' as MonthKey)) {
      const segments = segmentsOfMonth(m);
      for (const amount of amounts) {
        const bases = baseAllocations(amount, segments, daysInMonth(m));
        expect(
          bases.reduce((a, b) => a + b, 0),
          `${m} ${amount}`,
        ).toBe(amount);
        segments.slice(0, -1).forEach((s, i) => {
          expect(bases[i]).toBe(Math.floor((amount * s.days) / daysInMonth(m)));
        });
        expect(bases.every((b) => Number.isInteger(b) && b >= 0)).toBe(true);
      }
    }
  });
});

describe('§8 worked example, reproduced exactly', () => {
  it('Wed 11 Nov 2026: S3 has 110.000 effective, 50.000 spent', () => {
    const s = snap(workedExample, '2026-11-11');
    expect(s.state).toBe('OK');
    expect(s.month).toMatchObject({
      income: 2_000_000,
      needsMonth: 1_000_000,
      wantsMonth: 600_000,
      savingsTarget: 400_000,
    });
    expect(s.segment).toEqual({ index: 2, start: '2026-11-09', end: '2026-11-15', days: 7, remainingDays: 5 });
    expect(s.wants).toEqual({
      base: 140_000,
      debtIn: 30_000,
      effective: 110_000,
      spent: 50_000,
      remainingWeek: 60_000,
      dailyPace: 12_000,
      // Σ effective (20 + 140 + 110 + 140 + 140 + 20 thousand) − 235.000 spent this month
      remainingMonth: 335_000,
    });
    // S1 ended with 5.000 surplus → bonus; S2 ended in debt (no surplus).
    expect(s.savings).toMatchObject({ recorded: 0, bonus: 5_000, total: 5_000, progressPct: 1, target: 400_000 });
  });

  it('"mau donat 35k" → CAUTION, 25.000 left for 4 days → Rp6.250/day', () => {
    expect(checkPurchase(snap(workedExample, '2026-11-11'), 35_000)).toEqual({
      verdict: 'CAUTION',
      amount: 35_000,
      remainingWeek: 60_000,
      remainingDays: 5,
      dailyPace: 12_000,
      remainingAfter: 25_000,
      daysAfterToday: 4,
      perDayAfter: 6_250,
      nextWeekCut: 0,
      debtBefore: 0,
      savingsProgressPct: 1,
    });
  });

  it('the table: S1 surplus 5.000, S2 debt 30.000, S3 (spent 90.000) surplus 20.000, S6 base 20.000', () => {
    const history = [...workedExample, wants('2026-11-14', 40_000)];
    const nov = month(ledgerOf(history, '2026-11-16', '2026-11'), '2026-11');
    const rows = nov.segments.map((s) => [
      s.days,
      s.wants.base,
      s.wants.debtIn,
      s.wants.effective,
      s.wants.spent,
      s.wants.debt,
      s.wants.surplus,
    ]);
    expect(rows).toEqual([
      [1, 20_000, 0, 20_000, 15_000, 0, 5_000],
      [7, 140_000, 0, 140_000, 170_000, 30_000, 0],
      [7, 140_000, 30_000, 110_000, 90_000, 0, 20_000],
      [7, 140_000, 0, 140_000, 0, 0, 140_000], // in progress: not a bonus yet
      [7, 140_000, 0, 140_000, 0, 0, 140_000],
      [1, 20_000, 0, 20_000, 0, 0, 20_000],
    ]);
    expect(nov.savings.bonus).toBe(25_000); // S1 + S3 only: ended segments
  });
});

describe('§9 item 3: wants debt carries across a month boundary', () => {
  // Oct 2026: S5 = Mon 26 – Sat 31 Oct (6 days). Wants 600.000 over 31 days:
  // S1 (4 days) 77.419, S2–S4 135.483, S5 = 600.000 − 483.868 = 116.132.
  const oct = income('2026-10-01', 2_000_000);

  it('overspending in the last October segment reduces 1 Nov', () => {
    const s = snap([oct, wants('2026-10-30', 116_132 + 12_000), NOV_INCOME], '2026-11-01');
    expect(s.wants).toMatchObject({ base: 20_000, debtIn: 12_000, effective: 8_000, remainingWeek: 8_000 });
  });

  it('debt larger than the next base makes effective negative and keeps rolling', () => {
    const history = [oct, wants('2026-10-30', 116_132 + 50_000), NOV_INCOME];
    const nov = month(ledgerOf(history, '2026-11-03', '2026-11'), '2026-11');
    expect(nov.segments[0]?.wants).toMatchObject({
      debtIn: 50_000,
      effective: -30_000,
      spent: 0,
      debt: 30_000,
      surplus: 0,
    });
    expect(nov.segments[1]?.wants).toMatchObject({ debtIn: 30_000, effective: 110_000 });
    expect(snap(history, '2026-11-01').wants).toMatchObject({ remainingWeek: -30_000, dailyPace: 0 });
  });

  it('the chain starts at the first month with income: earlier wants spending creates no debt', () => {
    const history = [wants('2026-10-30', 500_000), NOV_INCOME];
    expect(snap(history, '2026-11-01').wants).toMatchObject({ debtIn: 0, effective: 20_000 });
  });
});

describe('§9 item 4: surplus only for ended segments, never carried', () => {
  const history = [NOV_INCOME, S1_JAJAN, wants('2026-11-04', 100_000)]; // S2 surplus would be 40.000

  it.each([
    ['2026-11-08', 5_000], // Sunday: S2 is still in progress
    ['2026-11-09', 45_000], // Monday: S2 has ended → 40.000 joins the bonus
  ])('today %s → bonus %i', (today, bonus) => {
    expect(snap(history, today).savings.bonus).toBe(bonus);
  });

  it('a surplus is not added to the next segment', () => {
    expect(snap(history, '2026-11-09').wants).toMatchObject({ debtIn: 0, effective: 140_000 });
  });
});

describe('§9 item 5: verdict table (§6)', () => {
  const s3 = (spent: number) => [NOV_INCOME, wants('2026-11-09', spent)];
  // S3 effective = 140.000 (no debt). Today Wed 11 Nov: 5 days left.
  it.each([
    // [name, history, today, amount, verdict, nextWeekCut, debtBefore]
    ['no income this month', [S1_JAJAN], '2026-11-11', 1_000, 'NO_BUDGET', 1_000, 0],
    ['remainingWeek < 0', s3(150_000), '2026-11-11', 5_000, 'DENY', 5_000, 10_000],
    ['remainingWeek = 0', s3(140_000), '2026-11-11', 1_000, 'DENY', 1_000, 0],
    ['amount > remainingWeek > 0', s3(80_000), '2026-11-11', 70_000, 'DENY', 10_000, 0],
    ['amount = remainingWeek', s3(80_000), '2026-11-11', 60_000, 'CAUTION', 0, 0],
    ['amount > dailyPace', s3(80_000), '2026-11-11', 12_001, 'CAUTION', 0, 0],
    ['amount = dailyPace', s3(80_000), '2026-11-11', 12_000, 'ALLOW', 0, 0],
    ['amount < dailyPace', s3(80_000), '2026-11-11', 5_000, 'ALLOW', 0, 0],
  ] as const)('%s → %s', (_name, history, today, amount, verdict, cut, debt) => {
    const result = checkPurchase(snap([...history], today), amount);
    expect(result.verdict).toBe(verdict);
    expect(result.nextWeekCut).toBe(cut);
    expect(result.debtBefore).toBe(debt);
  });

  it('NO_BUDGET wins even when the amount would otherwise be allowed', () => {
    expect(checkPurchase(snap([], '2026-11-11'), 1).verdict).toBe('NO_BUDGET');
  });

  it('after-purchase numbers; negative remainders show 0/day', () => {
    expect(checkPurchase(snap(s3(150_000), '2026-11-11'), 5_000)).toMatchObject({
      remainingAfter: -15_000,
      daysAfterToday: 4,
      perDayAfter: 0,
    });
  });

  it('on the last day of the segment there are no days to spread over', () => {
    expect(checkPurchase(snap(s3(80_000), '2026-11-15'), 10_000)).toMatchObject({
      remainingDays: 1,
      daysAfterToday: 0,
      perDayAfter: null,
      dailyPace: 60_000,
      verdict: 'ALLOW',
    });
  });

  it.each([0, -5_000, 1.5, Number.NaN])('rejects amount %s', (amount) => {
    expect(() => checkPurchase(snap(workedExample, '2026-11-11'), amount)).toThrow(RangeError);
  });
});

describe('§9 item 6: needs carry-in and needs bonus', () => {
  const oct = income('2026-10-01', 2_000_000);

  it('an October deficit reduces November needs', () => {
    const history = [oct, needs('2026-10-15', 1_100_000), NOV_INCOME, needs('2026-11-10', 200_000)];
    expect(snap(history, '2026-11-11').needs).toEqual({
      base: 233_333,
      cumAllowance: 499_999, // 33.333 + 233.333 + 233.333
      spentMTD: 200_000,
      remainingWeek: 299_999, // cumAllowance − spentMTD (§5 formula; carry-in not subtracted)
      carryIn: 100_000,
      remainingMonth: 700_000, // 1.000.000 − 100.000 − 200.000
    });
  });

  it('a month-end surplus becomes a bonus only once the month has ended', () => {
    const history = [oct, needs('2026-10-15', 900_000)];
    expect(month(ledgerOf(history, '2026-10-31', '2026-10'), '2026-10').savings.bonus).toBe(
      // ended wants segments S1–S4 are untouched surpluses: 77.419 + 3 × 135.483 = 483.868; needs not yet
      483_868,
    );
    const ended = month(ledgerOf(history, '2026-11-01', '2026-10'), '2026-10');
    expect(ended.savings.bonus).toBe(600_000 + 100_000); // all wants segments + needs surplus
  });

  it('a deficit is not a bonus', () => {
    const ended = month(ledgerOf([oct, needs('2026-10-15', 1_100_000)], '2026-11-01', '2026-10'), '2026-10');
    expect(ended.needs.remainingMonth).toBe(-100_000);
    expect(ended.savings.bonus).toBe(600_000);
  });
});

describe('§9 item 7: income recorded mid-month recomputes past segments', () => {
  const spending = [S1_JAJAN, S2_A, S2_B];

  it('before the income, the month has no budget', () => {
    const s = snap(spending, '2026-11-16');
    expect(s.state).toBe('NO_BUDGET');
    expect(s.wants).toMatchObject({ base: 0, debtIn: 0, effective: 0 });
    expect(s.savings).toMatchObject({ target: 0, progressPct: 0 });
  });

  it('income dated the 15th sets the bases of S1 and S2 too', () => {
    const history = [...spending, income('2026-11-15', 2_000_000)];
    const nov = month(ledgerOf(history, '2026-11-16', '2026-11'), '2026-11');
    expect(nov.segments.slice(0, 3).map((s) => [s.wants.base, s.wants.debt, s.wants.surplus])).toEqual([
      [20_000, 0, 5_000],
      [140_000, 30_000, 0],
      [140_000, 0, 110_000],
    ]);
    expect(snap(history, '2026-11-16').wants).toMatchObject({ debtIn: 0, effective: 140_000 });
  });

  it('income dated after today is ignored', () => {
    expect(snap([...spending, income('2026-11-20', 2_000_000)], '2026-11-16').state).toBe('NO_BUDGET');
  });
});

describe('§9 item 8: editing or deleting a past transaction changes downstream debt and bonus', () => {
  const s3Final = wants('2026-11-14', 40_000); // S3 total 90.000
  const today = '2026-11-16';

  it.each([
    ['as recorded', [NOV_INCOME, S1_JAJAN, S2_A, S2_B, S3_SO_FAR, s3Final], 30_000, 0, 25_000],
    ['S2 expense deleted', [NOV_INCOME, S1_JAJAN, S2_A, S3_SO_FAR, s3Final], 0, 0, 95_000],
    [
      'S2 expense edited 70.000 → 100.000',
      [NOV_INCOME, S1_JAJAN, S2_A, { ...S2_B, amount: 100_000 }, S3_SO_FAR, s3Final],
      60_000,
      10_000,
      5_000,
    ],
  ])('%s', (_name, history, s3DebtIn, s4DebtIn, bonus) => {
    const nov = month(ledgerOf(history, today, '2026-11'), '2026-11');
    expect(nov.segments[2]?.wants.debtIn).toBe(s3DebtIn);
    expect(nov.segments[3]?.wants.debtIn).toBe(s4DebtIn);
    expect(nov.savings.bonus).toBe(bonus);
  });
});

describe('§9 item 9: WIB date boundaries', () => {
  it('23:30 WIB on 31 Oct counts in October; 00:30 WIB on 1 Nov counts in November', () => {
    const late = { ...wants('2026-10-31', 10_000), localDate: toLocalDate(new Date('2026-10-31T16:30:00.000Z')) };
    const early = { ...wants('2026-11-01', 7_000), localDate: toLocalDate(new Date('2026-10-31T17:30:00.000Z')) };
    const ledger = ledgerOf(
      [income('2026-10-01', 2_000_000), late, early, NOV_INCOME],
      '2026-11-01',
      '2026-10',
      '2026-11',
    );
    expect(month(ledger, '2026-10').wants.spent).toBe(10_000);
    expect(month(ledger, '2026-11').wants.spent).toBe(7_000);
  });
});

describe('§7 savings progress', () => {
  it('recorded savings + bonus over the target ("Tabungan bulan ini 50% dari target")', () => {
    expect(snap([NOV_INCOME, saving('2026-11-02', 200_000)], '2026-11-01').savings).toMatchObject({
      recorded: 0, // dated tomorrow → ignored today
    });
    expect(snap([NOV_INCOME, saving('2026-11-01', 200_000)], '2026-11-01').savings).toMatchObject({
      recorded: 200_000,
      bonus: 0,
      total: 200_000,
      progressPct: 50,
    });
    expect(snap([NOV_INCOME, saving('2026-11-01', 200_000), S1_JAJAN], '2026-11-02').savings).toMatchObject({
      bonus: 5_000,
      total: 205_000,
      progressPct: 51, // floor(205.000 × 100 / 400.000)
    });
  });
});

describe('interpretations (BUDGET_RULES §10, pending owner confirmation)', () => {
  it('a month without income after the chain started still carries wants debt and needs deficits', () => {
    const history = [income('2026-10-01', 2_000_000), wants('2026-11-03', 25_000), needs('2026-11-03', 40_000)];
    const ledger = ledgerOf(history, '2026-12-01', '2026-11', '2026-12');
    const nov = month(ledger, '2026-11');
    expect(nov.chained).toBe(true);
    // Literal §4 formula: Σ effective (0 + 0 + 4 × −25.000) − 25.000 spent. The debt is counted again in
    // every later segment's effective, so this "informational" number double-counts (see BUDGET_RULES §10).
    expect(nov.wants.remainingMonth).toBe(-125_000);
    expect(month(ledger, '2026-12').needs.carryIn).toBe(40_000);
    expect(snap(history, '2026-12-01').wants.debtIn).toBe(25_000);
  });
});

describe('weekly recap (BOT_SPEC §4)', () => {
  const oct = income('2026-10-01', 2_000_000);

  it('a week spanning two months sums both segments (Mon 26 Oct – Sun 1 Nov 2026)', () => {
    const history = [
      oct,
      wants('2026-10-28', 50_000),
      needs('2026-10-30', 80_000),
      NOV_INCOME,
      wants('2026-11-01', 15_000, 'sys_nongkrong'),
      wants('2026-11-01', 5_000),
      saving('2026-11-01', 100_000),
      needs('2026-10-20', 999_000), // previous week: not in this recap
    ];
    const recap = weeklyRecap({ pcts, transactions: history, today: d('2026-11-01') });
    expect(recap.week).toEqual({ start: '2026-10-26', end: '2026-11-01' });
    expect(recap.segments).toEqual([
      { month: '2026-10', start: '2026-10-26', end: '2026-10-31' },
      { month: '2026-11', start: '2026-11-01', end: '2026-11-01' },
    ]);
    // Oct needs: S1 129.032, S2–S4 225.806, S5 = 1.000.000 − 806.450 = 193.550; Nov S1 33.333.
    expect(recap.needs).toEqual({ allocation: 193_550 + 33_333, spent: 80_000 });
    expect(recap.wants).toEqual({
      allocation: 116_132 + 20_000,
      base: 116_132 + 20_000,
      spent: 70_000,
      leftover: 66_132 + 0,
      debtOut: 0,
    });
    expect(recap.byCategory).toEqual([
      { categoryId: 'sys_makan', amount: 80_000 },
      { categoryId: 'sys_jajan', amount: 55_000 },
      { categoryId: 'sys_nongkrong', amount: 15_000 },
    ]);
    expect([recap.income, recap.saving, recap.expense]).toEqual([2_000_000, 100_000, 150_000]);
    expect(recap.savings).toMatchObject({ recorded: 100_000, target: 400_000, progressPct: 25 });
  });

  it('debt carried out of the week', () => {
    const recap = weeklyRecap({ pcts, transactions: workedExample.slice(0, 4), today: d('2026-11-08') });
    expect(recap.wants).toMatchObject({ allocation: 140_000, spent: 170_000, leftover: 0, debtOut: 30_000 });
  });

  it('mid-week (Thu 29 Oct): the November segment exists but has no income yet', () => {
    const recap = weeklyRecap({ pcts, transactions: [oct, NOV_INCOME], today: d('2026-10-29') });
    expect(recap.segments).toHaveLength(2);
    expect(recap.wants).toMatchObject({ allocation: 116_132, base: 116_132 });
    expect(recap.income).toBe(0); // the 1 Nov income is after today
  });

  it('a week starting before the first income month: that spending makes no debt', () => {
    const recap = weeklyRecap({
      pcts,
      transactions: [wants('2026-10-28', 50_000), NOV_INCOME, wants('2026-11-01', 15_000)],
      today: d('2026-11-01'),
    });
    expect(recap.wants).toMatchObject({ allocation: 20_000, spent: 65_000, leftover: 5_000, debtOut: 0 });
  });
});
