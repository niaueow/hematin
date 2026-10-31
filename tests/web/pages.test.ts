// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { parseLocalDate } from '@server/budget/periods';
import type { BudgetCurrent, Category, Transaction } from '@web/api/dashboard';
import { barOptions, readChartTheme } from '@web/lib/charts';
import { categoriesForType, filtersToQuery, groupByDate } from '@web/lib/transactions';
import { hasNext, isEmpty, readQuery, seriesLabels, shiftPeriod } from '@web/lib/statistik';

// M14: the dashboard pages' logic. The API module is mocked; everything else is real.

const api = vi.hoisted(() => ({
  listTransactions: vi.fn(),
  deleteTransaction: vi.fn(),
  restoreTransaction: vi.fn(),
  getBudget: vi.fn(),
}));
vi.mock('@web/api/dashboard', () => api);

const { useTransactionList } = await import('@web/composables/useTransactionList');
const HomePage = (await import('@web/pages/HomePage.vue')).default;

const d = parseLocalDate;
const TODAY = d('2026-11-11'); // Wed

const tx = (id: string, date: string, amount = 10_000, extra: Partial<Transaction> = {}): Transaction => ({
  id,
  type: 'EXPENSE',
  amount,
  categoryId: 'sys_makan',
  category: { id: 'sys_makan', name: 'Makan', bucket: 'NEEDS', emoji: null },
  note: `note ${id}`,
  date,
  occurredAt: `${date}T05:00:00.000Z`,
  source: 'WEB',
  parseMethod: 'MANUAL',
  createdAt: `${date}T05:00:00.000Z`,
  ...extra,
});

describe('Transaksi: filters → query', () => {
  it.each([
    [
      { period: 'week', type: 'all', categoryId: null },
      { from: '2026-11-09', to: '2026-11-15' },
    ],
    [
      { period: 'month', type: 'all', categoryId: null },
      { from: '2026-11-01', to: '2026-11-30' },
    ],
    [{ period: 'all', type: 'all', categoryId: null }, {}],
    [
      { period: 'all', type: 'SAVING', categoryId: 'sys_nabung' },
      { type: 'SAVING', categoryId: 'sys_nabung' },
    ],
    [
      { period: 'month', type: 'EXPENSE', categoryId: null },
      { from: '2026-11-01', to: '2026-11-30', type: 'EXPENSE' },
    ],
  ] as const)('%j → %j', (filters, query) => {
    expect(filtersToQuery(filters, TODAY)).toEqual(query);
  });

  it('category chips follow the type (DATA_MODEL invariants)', () => {
    const cats = (['NEEDS', 'WANTS', 'SAVINGS', 'INCOME'] as const).map((bucket): Category => ({
      id: bucket,
      slug: bucket,
      name: bucket,
      emoji: null,
      bucket,
      own: false,
      archived: false,
    }));
    expect(categoriesForType(cats, 'EXPENSE').map((c) => c.id)).toEqual(['NEEDS', 'WANTS']);
    expect(categoriesForType(cats, 'SAVING').map((c) => c.id)).toEqual(['SAVINGS']);
    expect(categoriesForType(cats, 'INCOME').map((c) => c.id)).toEqual(['INCOME']);
    expect(categoriesForType(cats, 'all')).toHaveLength(4);
  });

  it('groups by day in list order, with Hari ini / Kemarin / Sen, 2 Nov', () => {
    const groups = groupByDate(
      [tx('a', '2026-11-11'), tx('b', '2026-11-11'), tx('c', '2026-11-10'), tx('d', '2026-11-02')],
      TODAY,
    );
    expect(groups.map((g) => [g.label, g.items.map((t) => t.id)])).toEqual([
      ['Hari ini', ['a', 'b']],
      ['Kemarin', ['c']],
      ['Sen, 2 Nov', ['d']],
    ]);
  });
});

describe('Transaksi: the list, optimistic delete and undo', () => {
  /** Runs the composable inside a component, like the page does. */
  function harness() {
    const toast = { show: vi.fn(() => 1) };
    let list!: ReturnType<typeof useTransactionList>;
    mount(
      defineComponent({ setup: () => ((list = useTransactionList({ today: () => TODAY, toast })), () => h('div')) }),
    );
    return { list, toast };
  }

  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.listTransactions.mockResolvedValue({
      items: [tx('a', '2026-11-11'), tx('b', '2026-11-10'), tx('c', '2026-11-09')],
      nextCursor: null,
    });
  });

  it('loads with the filters, and reloads when they change', async () => {
    const { list } = harness();
    await list.reload();
    expect(api.listTransactions).toHaveBeenLastCalledWith({ from: '2026-11-01', to: '2026-11-30', limit: 30 });
    list.filters.type = 'INCOME';
    await flushPromises();
    expect(api.listTransactions).toHaveBeenLastCalledWith({
      from: '2026-11-01',
      to: '2026-11-30',
      type: 'INCOME',
      limit: 30,
    });
  });

  it('an older response can’t overwrite a newer filter’s', async () => {
    const { list } = harness();
    let slow!: (value: unknown) => void;
    api.listTransactions.mockReturnValueOnce(new Promise((resolve) => (slow = resolve)));
    api.listTransactions.mockResolvedValueOnce({ items: [tx('new', '2026-11-11')], nextCursor: null });
    const first = list.reload();
    const second = list.reload();
    await second;
    slow({ items: [tx('old', '2026-11-01')], nextCursor: null });
    await first;
    expect(list.items.value.map((t) => t.id)).toEqual(['new']);
  });

  it('load more appends the next page with the cursor', async () => {
    const { list } = harness();
    api.listTransactions.mockResolvedValueOnce({ items: [tx('a', '2026-11-11')], nextCursor: 'CUR' });
    await list.reload();
    api.listTransactions.mockResolvedValueOnce({ items: [tx('b', '2026-11-10')], nextCursor: null });
    await list.loadMore();
    expect(api.listTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'CUR' }));
    expect(list.items.value.map((t) => t.id)).toEqual(['a', 'b']);
    expect(list.nextCursor.value).toBeNull();
  });

  it('delete is optimistic: the row goes before the server answers', async () => {
    const { list, toast } = harness();
    await list.reload();
    let finish!: (value: unknown) => void;
    api.deleteTransaction.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const pending = list.removeWithUndo(list.items.value[1] as Transaction);
    expect(list.items.value.map((t) => t.id)).toEqual(['a', 'c']);
    expect(toast.show).not.toHaveBeenCalled();
    finish({ ok: true });
    await pending;
    expect(api.deleteTransaction).toHaveBeenCalledWith('b');
    expect(toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Transaksi dihapus', actionLabel: 'Urungkan' }),
    );
  });

  it('Urungkan restores it on the server and puts it back where it was', async () => {
    const { list, toast } = harness();
    await list.reload();
    api.deleteTransaction.mockResolvedValue({ ok: true });
    api.restoreTransaction.mockResolvedValue(tx('b', '2026-11-10'));
    await list.removeWithUndo(list.items.value[1] as Transaction);
    const options = (toast.show.mock.calls[0] as unknown as [{ onAction: () => void }])[0];
    options.onAction();
    await flushPromises();
    expect(api.restoreTransaction).toHaveBeenCalledWith('b');
    expect(list.items.value.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('a failed delete puts the row back and says so', async () => {
    const { list, toast } = harness();
    await list.reload();
    api.deleteTransaction.mockRejectedValue(new Error('500'));
    await list.removeWithUndo(list.items.value[0] as Transaction);
    expect(list.items.value.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(toast.show).toHaveBeenCalledWith(expect.objectContaining({ tone: 'negative' }));
  });
});

describe('Statistik: the URL query and the period steps', () => {
  it.each([
    [{}, { period: 'month', date: '2026-11-11' }],
    [
      { period: 'week', date: '2026-10-30' },
      { period: 'week', date: '2026-10-30' },
    ],
    [
      { period: 'day', date: '2026-02-30' },
      { period: 'month', date: '2026-11-11' },
    ], // nonsense → defaults
  ])('readQuery(%j) → %j', (query, expected) => {
    expect(readQuery(query, TODAY)).toEqual(expected);
  });

  it.each([
    ['week', '2026-11-11', -1, '2026-11-02'],
    ['week', '2026-11-11', 1, '2026-11-16'],
    ['month', '2026-11-11', -1, '2026-10-01'],
    ['month', '2026-01-31', -1, '2025-12-01'],
    ['year', '2026-06-15', 1, '2027-01-01'],
  ] as const)('shiftPeriod(%s, %s, %i) → %s', (period, date, step, expected) => {
    expect(shiftPeriod(period, d(date), step)).toBe(expected);
  });

  it('no stepping into the future', () => {
    expect(hasNext('month', d('2026-11-11'), TODAY)).toBe(false);
    expect(hasNext('month', d('2026-10-05'), TODAY)).toBe(true);
    expect(hasNext('week', d('2026-11-09'), TODAY)).toBe(false);
  });

  it('series labels per period', () => {
    const series = (points: [string, string][]) =>
      points.map(([start, end]) => ({ start, end, income: 0, expense: 0, saving: 0 }));
    expect(
      seriesLabels({
        period: 'week',
        series: series([
          ['2026-11-09', '2026-11-09'],
          ['2026-11-10', '2026-11-10'],
        ]),
      }),
    ).toEqual(['Sen', 'Sel']);
    expect(
      seriesLabels({
        period: 'month',
        series: series([
          ['2026-11-01', '2026-11-01'],
          ['2026-11-02', '2026-11-08'],
        ]),
      }),
    ).toEqual(['1', '2–8']);
    expect(seriesLabels({ period: 'year', series: series([['2026-01-01', '2026-01-31']]) })).toEqual(['Jan']);
    expect(isEmpty({ totals: { income: 0, expense: 0, saving: 0 } })).toBe(true);
  });
});

describe('charts: colours from the tokens, short rupiah on axes', () => {
  afterEach(() => document.documentElement.removeAttribute('style'));

  it('reads the token values at runtime (so a theme change is picked up)', () => {
    document.documentElement.style.setProperty('--content-system-default-info', '#1155cc');
    document.documentElement.style.setProperty('--font-family-base', "'Plus Jakarta Sans', sans-serif");
    const theme = readChartTheme();
    expect(theme.tone.info).toBe('#1155cc');
    expect(theme.font).toBe("'Plus Jakarta Sans', sans-serif");
    document.documentElement.style.setProperty('--content-system-default-info', '#608ddd');
    expect(readChartTheme().tone.info).toBe('#608ddd');
  });

  it('axis ticks are short (35rb, 1,2jt); tooltips are full (Rp35.000)', () => {
    const theme = readChartTheme();
    const options = barOptions(theme);
    const ticks = (options.scales?.y as { ticks: { callback: (v: number) => string } }).ticks;
    expect([35_000, 1_200_000].map((v) => ticks.callback(v))).toEqual(['35rb', '1,2jt']);
    const label = options.plugins?.tooltip?.callbacks?.label as unknown as (item: { raw: number }) => string;
    expect(label({ raw: 35_000 })).toBe('Rp35.000');
    expect(barOptions(theme, { horizontal: true }).indexAxis).toBe('y');
  });
});

describe('Home shows exactly the /sisa numbers', () => {
  // BUDGET_RULES §8 + a 30.000 needs expense (Wed 11 Nov 2026), as /api/budget/current returns it
  // (tests/api/dashboard.test.ts checks those values against the bot's /sisa).
  const budget: BudgetCurrent = {
    state: 'OK',
    today: '2026-11-11',
    month: {
      month: '2026-11',
      start: '2026-11-01',
      end: '2026-11-30',
      days: 30,
      income: 2_000_000,
      needsMonth: 1_000_000,
      wantsMonth: 600_000,
      savingsTarget: 400_000,
    },
    segment: { index: 2, start: '2026-11-09', end: '2026-11-15', days: 7, remainingDays: 5 },
    needs: {
      week: { allocation: 499_999, spent: 30_000, remaining: 469_999 },
      month: { allocation: 1_000_000, spent: 30_000, remaining: 970_000 },
      carryIn: 0,
    },
    wants: {
      week: { allocation: 110_000, spent: 50_000, remaining: 60_000, base: 140_000, debtIn: 30_000 },
      month: { allocation: 600_000, remaining: 360_000 },
      dailyPace: 12_000,
    },
    savings: { recorded: 0, bonus: 5_000, total: 5_000, progressPct: 1, target: 400_000 },
    savedBySkipping: { week: { amount: 0, count: 0 }, month: { amount: 0, count: 0 } },
  };

  async function home(b: BudgetCurrent) {
    api.getBudget.mockResolvedValue(b);
    api.listTransactions.mockResolvedValue({ items: [tx('a', '2026-11-11', 30_000)], nextCursor: null });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: HomePage },
        { path: '/:p(.*)', component: HomePage },
      ],
    });
    await router.push('/');
    const wrapper = mount(HomePage, { global: { plugins: [router] } });
    await flushPromises();
    await nextTick();
    return wrapper.text();
  }

  it('the /sisa lines: Jajan week · month, pace, Pokok week · month, Tabungan total / target (pct)', async () => {
    const text = await home(budget);
    // /sisa: "Jajan: Rp60.000 · bulan ini Rp360.000" / "Rp12.000/hari buat 5 hari lagi"
    expect(text).toContain('Rp60.000');
    expect(text).toContain('Bulan ini: Rp360.000');
    expect(text).toContain('Rp12.000/hari buat 5 hari lagi');
    // /sisa: "Pokok: Rp469.999 · bulan ini Rp970.000"
    expect(text).toContain('Rp469.999');
    expect(text).toContain('Bulan ini: Rp970.000');
    // /sisa: "🐷 Tabungan: Rp5.000/Rp400.000 (1%)"
    expect(text).toContain('Rp5.000');
    expect(text).toContain('1% dari Rp400.000');
    expect(text).toContain('note a');
  });

  it('NO_BUDGET: the alert, and no budget numbers', async () => {
    const text = await home({ ...budget, state: 'NO_BUDGET' });
    expect(text).toContain('Uang jajan bulan ini belum dicatat');
    expect(text).not.toContain('Rp60.000');
    expect(text).not.toContain('Rp469.999');
  });
});
