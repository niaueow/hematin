import {
  daysInMonth,
  monthEnd,
  monthOf,
  monthRange,
  monthStart,
  remainingDays,
  segmentOf,
  segmentsOfMonth,
  weekOf,
  type LocalDate,
  type MonthKey,
  type Segment,
} from './periods.js';

// The budget engine (docs/BUDGET_RULES.md is the source of truth). Pure: no Prisma, no clock, no I/O.
// Input = the user's split + transactions + "today"; output = numbers. All money is integer rupiah.
// Everything is computed on read from the full transaction history (D-012).

export type Bucket = 'NEEDS' | 'WANTS' | 'SAVINGS' | 'INCOME';
export type TxType = 'INCOME' | 'EXPENSE' | 'SAVING';

export type EngineTransaction = {
  type: TxType;
  amount: number;
  localDate: LocalDate;
  /** The category's bucket; null for income without a category. */
  bucket: Bucket | null;
  categoryId: string | null;
};

export type Pcts = { needs: number; wants: number; savings: number };

export type EngineInput = {
  pcts: Pcts;
  /** Live (not deleted) transactions. Ones dated after `today` are ignored. */
  transactions: readonly EngineTransaction[];
  today: LocalDate;
};

export type Verdict = 'NO_BUDGET' | 'DENY' | 'CAUTION' | 'ALLOW';

// --- §2 monthly split, §3 segment base allocation -------------------------------------------------

export function splitIncome(income: number, pcts: Pcts) {
  if (pcts.needs + pcts.wants + pcts.savings !== 100) throw new RangeError('splitIncome: pcts must sum to 100');
  const needsMonth = Math.floor((income * pcts.needs) / 100);
  const wantsMonth = Math.floor((income * pcts.wants) / 100);
  return { needsMonth, wantsMonth, savingsTarget: income - needsMonth - wantsMonth };
}

/** Prorates `amount` over the month's segments by day; the last segment takes the rounding remainder. */
export function baseAllocations(amount: number, segments: readonly Segment[], monthDays: number): number[] {
  const bases = segments.map((s) => Math.floor((amount * s.days) / monthDays));
  bases[bases.length - 1] = amount - bases.slice(0, -1).reduce((a, b) => a + b, 0);
  return bases;
}

// --- ledger: months chained through wants debt and needs carry-in (§2, §4, §5, §7) --------------

export type SegmentLedger = Segment & {
  ended: boolean;
  wants: { base: number; debtIn: number; effective: number; spent: number; debt: number; surplus: number };
  needs: { base: number; cumAllowance: number; spent: number };
};

export type MonthLedger = {
  month: MonthKey;
  start: LocalDate;
  end: LocalDate;
  days: number;
  ended: boolean;
  /**
   * Income recorded in this month. Without it the month is NO_BUDGET (§2): income is unknown, not zero, so
   * the month neither creates nor consumes wants debt / needs carry-in; those wait for the next month with income.
   */
  hasIncome: boolean;
  income: number;
  needsMonth: number;
  wantsMonth: number;
  savingsTarget: number;
  segments: SegmentLedger[];
  wants: { spent: number };
  needs: { carryIn: number; spent: number; remainingMonth: number };
  savings: { recorded: number; bonus: number; total: number; progressPct: number };
};

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

function totals(transactions: readonly EngineTransaction[], from: LocalDate, to: LocalDate) {
  const inRange = transactions.filter((t) => from <= t.localDate && t.localDate <= to);
  const total = (match: (t: EngineTransaction) => boolean) => sum(inRange.filter(match).map((t) => t.amount));
  return {
    income: total((t) => t.type === 'INCOME'),
    saving: total((t) => t.type === 'SAVING'),
    wants: total((t) => t.type === 'EXPENSE' && t.bucket === 'WANTS'),
    needs: total((t) => t.type === 'EXPENSE' && t.bucket === 'NEEDS'),
    expense: total((t) => t.type === 'EXPENSE'),
    expenses: inRange.filter((t) => t.type === 'EXPENSE'),
  };
}

/**
 * Computes every month from `from` to `through`, starting earlier if needed so debt and carry-in from
 * the first month with income onward are included. Only months with income take part in the chains (§2).
 */
export function buildLedger(input: EngineInput, from: MonthKey, through: MonthKey): MonthLedger[] {
  const { pcts, today } = input;
  const transactions = input.transactions.filter((t) => t.localDate <= today);
  const firstBudgetMonth = transactions
    .filter((t) => t.type === 'INCOME')
    .map((t) => monthOf(t.localDate))
    .sort()[0];
  const start = firstBudgetMonth !== undefined && firstBudgetMonth < from ? firstBudgetMonth : from;

  let wantsDebt = 0;
  let needsCarry = 0;
  const ledger: MonthLedger[] = [];

  for (const month of monthRange(start, through)) {
    const days = daysInMonth(month);
    const monthTotals = totals(transactions, monthStart(month), monthEnd(month));
    const hasIncome = monthTotals.income > 0;
    const { needsMonth, wantsMonth, savingsTarget } = splitIncome(monthTotals.income, pcts);
    const segments = segmentsOfMonth(month);
    const wantsBases = baseAllocations(wantsMonth, segments, days);
    const needsBases = baseAllocations(needsMonth, segments, days);

    let cumAllowance = 0;
    const segmentLedgers = segments.map((segment, i): SegmentLedger => {
      const segTotals = totals(transactions, segment.start, segment.end);
      const base = wantsBases[i] as number;
      const debtIn = hasIncome ? wantsDebt : 0;
      const effective = base - debtIn;
      const debt = hasIncome ? Math.max(0, segTotals.wants - effective) : 0;
      if (hasIncome) wantsDebt = debt; // a NO_BUDGET month holds the debt for the next month with income
      cumAllowance += needsBases[i] as number;
      return {
        ...segment,
        ended: segment.end < today,
        wants: {
          base,
          debtIn,
          effective,
          spent: segTotals.wants,
          debt,
          surplus: Math.max(0, effective - segTotals.wants),
        },
        needs: { base: needsBases[i] as number, cumAllowance, spent: segTotals.needs },
      };
    });

    const ended = monthEnd(month) < today;
    const carryIn = hasIncome ? needsCarry : 0;
    const needsRemaining = hasIncome ? needsMonth - carryIn - monthTotals.needs : 0;
    if (hasIncome) needsCarry = Math.max(0, -needsRemaining);

    const wantsBonus = sum(segmentLedgers.filter((s) => s.ended).map((s) => s.wants.surplus));
    const needsBonus = ended ? Math.max(0, needsRemaining) : 0;
    const bonus = wantsBonus + needsBonus;
    const savingsTotal = monthTotals.saving + bonus;

    ledger.push({
      month,
      start: monthStart(month),
      end: monthEnd(month),
      days,
      ended,
      hasIncome,
      income: monthTotals.income,
      needsMonth,
      wantsMonth,
      savingsTarget,
      segments: segmentLedgers,
      wants: { spent: monthTotals.wants },
      needs: { carryIn, spent: monthTotals.needs, remainingMonth: needsRemaining },
      savings: {
        recorded: monthTotals.saving,
        bonus,
        total: savingsTotal,
        progressPct: savingsTarget > 0 ? Math.floor((savingsTotal * 100) / savingsTarget) : 0,
      },
    });
  }
  return ledger.filter((m) => m.month >= from);
}

// --- snapshot: "/sisa" and GET /api/budget/current ----------------------------------------------

export type BudgetSnapshot = {
  today: LocalDate;
  state: 'OK' | 'NO_BUDGET';
  month: Pick<
    MonthLedger,
    'month' | 'start' | 'end' | 'days' | 'income' | 'needsMonth' | 'wantsMonth' | 'savingsTarget'
  >;
  segment: { index: number; start: LocalDate; end: LocalDate; days: number; remainingDays: number };
  wants: {
    base: number;
    debtIn: number;
    effective: number;
    spent: number;
    /** effective − spent; negative means this segment is already in debt. 0 when NO_BUDGET. */
    remainingWeek: number;
    dailyPace: number;
    /** remainingWeek + base of the month's later segments (§4). 0 when NO_BUDGET. */
    remainingMonth: number;
  };
  needs: {
    base: number;
    cumAllowance: number;
    spentMTD: number;
    remainingWeek: number;
    carryIn: number;
    remainingMonth: number;
  };
  savings: MonthLedger['savings'] & { target: number };
};

export function snapshot(input: EngineInput): BudgetSnapshot {
  const { today } = input;
  const month = monthOf(today);
  const ledger = buildLedger(input, month, month)[0] as MonthLedger;
  const current = ledger.segments.find((s) => s.index === segmentOf(today).index) as SegmentLedger;

  const { hasIncome } = ledger;
  const remainingWeek = hasIncome ? current.wants.effective - current.wants.spent : 0;
  const laterBases = sum(ledger.segments.filter((s) => s.index > current.index).map((s) => s.wants.base));
  const days = remainingDays(current, today);
  return {
    today,
    state: hasIncome ? 'OK' : 'NO_BUDGET',
    month: {
      month,
      start: ledger.start,
      end: ledger.end,
      days: ledger.days,
      income: ledger.income,
      needsMonth: ledger.needsMonth,
      wantsMonth: ledger.wantsMonth,
      savingsTarget: ledger.savingsTarget,
    },
    segment: { index: current.index, start: current.start, end: current.end, days: current.days, remainingDays: days },
    wants: {
      base: current.wants.base,
      debtIn: current.wants.debtIn,
      effective: current.wants.effective,
      spent: current.wants.spent,
      remainingWeek,
      dailyPace: remainingWeek > 0 ? Math.floor(remainingWeek / days) : 0,
      remainingMonth: remainingWeek + laterBases, // later bases are 0 when NO_BUDGET
    },
    needs: {
      base: current.needs.base,
      cumAllowance: current.needs.cumAllowance,
      spentMTD: ledger.needs.spent,
      remainingWeek: hasIncome ? current.needs.cumAllowance - ledger.needs.spent : 0,
      carryIn: ledger.needs.carryIn,
      remainingMonth: ledger.needs.remainingMonth,
    },
    savings: { ...ledger.savings, target: ledger.savingsTarget },
  };
}

// --- §6 purchase verdicts ("mau X", WANTS only) --------------------------------------------------

export type PurchaseCheck = {
  verdict: Verdict;
  amount: number;
  remainingWeek: number;
  remainingDays: number;
  dailyPace: number;
  remainingAfter: number;
  daysAfterToday: number;
  /** null on the segment's last day (no days left to spread over). */
  perDayAfter: number | null;
  /** How much next segment's wants would shrink if bought: amount − max(remainingWeek, 0), at least 0. */
  nextWeekCut: number;
  /** Debt already carried into the next segment before this purchase (BOT_SPEC: "Senin jatahmu reset" only if 0). */
  debtBefore: number;
  savingsProgressPct: number;
};

export function checkPurchase(snap: BudgetSnapshot, amount: number): PurchaseCheck {
  if (!Number.isInteger(amount) || amount <= 0)
    throw new RangeError('checkPurchase: amount must be a positive integer');
  const { remainingWeek, dailyPace } = snap.wants;
  const days = snap.segment.remainingDays;

  let verdict: Verdict;
  if (snap.state === 'NO_BUDGET') verdict = 'NO_BUDGET';
  else if (amount > remainingWeek) verdict = 'DENY';
  else if (amount > dailyPace) verdict = 'CAUTION';
  else verdict = 'ALLOW';

  const remainingAfter = remainingWeek - amount;
  const daysAfterToday = days - 1;
  return {
    verdict,
    amount,
    remainingWeek,
    remainingDays: days,
    dailyPace,
    remainingAfter,
    daysAfterToday,
    perDayAfter: daysAfterToday > 0 ? Math.floor(Math.max(remainingAfter, 0) / daysAfterToday) : null,
    nextWeekCut: Math.max(0, amount - Math.max(remainingWeek, 0)),
    debtBefore: Math.max(0, -remainingWeek),
    savingsProgressPct: snap.savings.progressPct,
  };
}

// --- weekly recap (BOT_SPEC §4): the Mon–Sun week containing `today`, possibly spanning two months ---

export type WeeklyRecap = {
  week: { start: LocalDate; end: LocalDate };
  segments: { month: MonthKey; start: LocalDate; end: LocalDate }[];
  needs: { allocation: number; spent: number };
  wants: {
    /**
     * What the recap shows as the week's jajan budget: baseAllocation − debtDeducted. Only debt carried in from
     * before the week is deducted; debt between two segments of the same week is already in `spent`.
     */
    allocationAfterDebt: number;
    /** The prorated allocation before any debt (not shown to the user unless explaining the deduction). */
    baseAllocation: number;
    /** Wants debt carried into the week's first segment. */
    debtDeducted: number;
    spent: number;
    /** Sum of the segments' unspent effective allowance: becomes savings bonus once they end. */
    leftover: number;
    /** Debt the week's last segment carries into the next one. */
    debtOut: number;
  };
  income: number;
  saving: number;
  expense: number;
  /** Expenses by category, largest first. */
  byCategory: { categoryId: string | null; amount: number }[];
  /** Savings progress of the month `today` is in. */
  savings: BudgetSnapshot['savings'];
};

export function weeklyRecap(input: EngineInput): WeeklyRecap {
  const { today } = input;
  const week = weekOf(today);
  const throughMonth = monthOf(week.end > today ? week.end : today);
  const ledger = buildLedger(input, monthOf(week.start), throughMonth);
  const segments = ledger.flatMap((m) => m.segments).filter((s) => s.start <= week.end && s.end >= week.start);
  const first = segments[0] as SegmentLedger;
  const last = segments[segments.length - 1] as SegmentLedger;
  const baseAllocation = sum(segments.map((s) => s.wants.base));
  const todayMonth = ledger.find((m) => m.month === monthOf(today)) as MonthLedger;

  const weekTotals = totals(
    input.transactions.filter((t) => t.localDate <= today),
    week.start,
    week.end,
  );
  const byCategory = new Map<string | null, number>();
  for (const t of weekTotals.expenses) byCategory.set(t.categoryId, (byCategory.get(t.categoryId) ?? 0) + t.amount);

  return {
    week,
    segments: segments.map((s) => ({ month: s.month, start: s.start, end: s.end })),
    needs: { allocation: sum(segments.map((s) => s.needs.base)), spent: weekTotals.needs },
    wants: {
      allocationAfterDebt: baseAllocation - first.wants.debtIn,
      baseAllocation,
      debtDeducted: first.wants.debtIn,
      spent: weekTotals.wants,
      leftover: sum(segments.map((s) => s.wants.surplus)),
      debtOut: last.wants.debt,
    },
    income: weekTotals.income,
    saving: weekTotals.saving,
    expense: weekTotals.expense,
    byCategory: [...byCategory.entries()]
      .map(([categoryId, amount]) => ({ categoryId, amount }))
      .sort((a, b) => b.amount - a.amount),
    savings: { ...todayMonth.savings, target: todayMonth.savingsTarget },
  };
}
