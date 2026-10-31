import { Router } from 'express';
import { z } from 'zod';
import { authOf } from '../auth/http.js';
import { localDateFromDb, parseLocalDate, todayWib } from '../budget/periods.js';
import type { BudgetService } from '../budget/service.js';
import { periodRange, summarize, type SummaryTransaction } from '../budget/summary.js';
import { DateString, guard, parse, type DashboardDeps } from './dashboard.js';

// GET /api/budget/current and GET /api/summary (API.md).

type Current = Awaited<ReturnType<BudgetService['current']>>;

/**
 * /api/budget/current: the same snapshot /sisa formats (budget/service.current), regrouped per bucket. No
 * math of its own except naming: allocation − spent = remaining for the week and for needs' month. Wants'
 * month `remaining` is BUDGET_RULES §4's remainingMonthWants (this week's remaining + later bases), which is
 * not allocation − spent (rolled debt and surpluses), so wants' month has no `spent`.
 */
export function budgetView(c: Current) {
  return {
    state: c.state,
    today: c.today,
    month: c.month,
    segment: c.segment,
    needs: {
      week: { allocation: c.needs.cumAllowance, spent: c.needs.spentMTD, remaining: c.needs.remainingWeek },
      month: {
        allocation: c.month.needsMonth - c.needs.carryIn,
        spent: c.needs.spentMTD,
        remaining: c.needs.remainingMonth,
      },
      carryIn: c.needs.carryIn,
    },
    wants: {
      week: {
        allocation: c.wants.effective,
        spent: c.wants.spent,
        remaining: c.wants.remainingWeek,
        base: c.wants.base,
        debtIn: c.wants.debtIn,
      },
      month: { allocation: c.month.wantsMonth, remaining: c.wants.remainingMonth },
      dailyPace: c.wants.dailyPace,
    },
    savings: c.savings,
    savedBySkipping: c.savedBySkipping,
  };
}

const SummaryQuery = z.object({ period: z.enum(['week', 'month', 'year']), date: DateString.optional() }).strict();

export function budgetRouter(deps: DashboardDeps): Router {
  const router = Router();
  router.get('/current', guard(deps), async (req, res) => {
    res.json(budgetView(await deps.budget.current(authOf(req).user, deps.now())));
  });
  return router;
}

export function summaryRouter(deps: DashboardDeps): Router {
  const router = Router();
  router.get('/', guard(deps), async (req, res) => {
    const query = parse(SummaryQuery, req.query);
    const date = query.date ? parseLocalDate(query.date) : todayWib(deps.now());
    const range = periodRange(query.period, date);
    const rows = await deps.repos.transactions.listInRange(authOf(req).user.id, range.start, range.end);
    const transactions: SummaryTransaction[] = rows.map((t) => ({
      type: t.type,
      amount: t.amount,
      localDate: localDateFromDb(t.localDate),
      category: t.category && { id: t.category.id, name: t.category.name, bucket: t.category.bucket },
    }));
    res.json(summarize(query.period, date, transactions));
  });
  return router;
}
