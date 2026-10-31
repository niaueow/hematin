import { describe, expect, it } from 'vitest';
import * as copy from '@server/bot/copy.js';
import { snapshot, type EngineTransaction } from '@server/budget/engine.js';
import { parseLocalDate } from '@server/budget/periods.js';

// BOT_SPEC §5: ≤ 5 lines, ≤ 2 emoji. Every variant of every message (except the /riwayat list).
const emoji = /\p{Extended_Pictographic}/gu;
const variants = (fn: (name: string | null, random: () => number) => string) => [
  fn('Nia', () => 0),
  fn('Nia', () => 0.99),
];
const both = (fn: (random: () => number) => string) => [fn(() => 0), fn(() => 0.99)];

const tx = (type: EngineTransaction['type'], amount: number, date: string, bucket: EngineTransaction['bucket']) => ({
  type,
  amount,
  localDate: parseLocalDate(date),
  bucket,
  categoryId: bucket,
});
const snap = (today: string, transactions: EngineTransaction[]) =>
  snapshot({ pcts: { needs: 50, wants: 30, savings: 20 }, today: parseLocalDate(today), transactions });

const income = tx('INCOME', 2_000_000, '2026-11-01', 'INCOME');
const ok = snap('2026-11-11', [income]);
const overspent = snap('2026-11-11', [
  income,
  tx('EXPENSE', 150_000, '2026-11-10', 'WANTS'),
  tx('EXPENSE', 1_200_000, '2026-11-10', 'NEEDS'),
]);
const exact = snap('2026-11-11', [income, tx('EXPENSE', 140_000, '2026-11-10', 'WANTS')]);
const noBudget = snap('2026-11-11', []);
const makan = { name: 'Makan', bucket: 'NEEDS' as const };
const jajan = { name: 'Jajan', bucket: 'WANTS' as const };
const summary: copy.TxSummary = {
  type: 'EXPENSE',
  amount: 10_000,
  categoryName: 'Makan',
  note: 'warteg',
  localDate: '2026-10-31',
};

const messages: [string, string][] = [
  ['PRIVATE_BOT', copy.PRIVATE_BOT],
  ['PRIVATE_CHAT_ONLY', copy.PRIVATE_CHAT_ONLY],
  ['INVITE_INVALID', copy.INVITE_INVALID],
  ['INVITE_OWNER_ONLY', copy.INVITE_OWNER_ONLY],
  ['HELP', copy.HELP],
  ['COMING_SOON', copy.COMING_SOON],
  ['inviteCreated', copy.inviteCreated('https://t.me/hematin_bot?start=CODE', 48)],
  ...variants(copy.welcomeOwner).map((t): [string, string] => ['welcomeOwner', t]),
  ...variants(copy.welcomeInvited).map((t): [string, string] => ['welcomeInvited', t]),
  ...variants(copy.welcomeBack).map((t): [string, string] => ['welcomeBack', t]),
  ...both(copy.rateLimited).map((t): [string, string] => ['rateLimited', t]),
  ...copy.INCOME_REMINDER.map((t, i): [string, string] => [`INCOME_REMINDER ${i}`, t]),
  ...both(copy.incomeNudge).map((t): [string, string] => ['incomeNudge', t]),
  // M5: logging
  ...both(copy.askAmount).map((t): [string, string] => ['askAmount', t]),
  ['SHORT_HELP', copy.SHORT_HELP],
  ['ONE_AT_A_TIME', copy.ONE_AT_A_TIME],
  ['amountOutOfRange', copy.amountOutOfRange(150_000_000)],
  ['confirmAmount', copy.confirmAmount(20_000)],
  ['AMOUNT_RETYPE', copy.AMOUNT_RETYPE],
  ['pickCategory', copy.pickCategory('x'.repeat(200), 5_000)],
  ['PICK_CANCELLED', copy.PICK_CANCELLED],
  ['EXPIRED', copy.EXPIRED],
  ['PURCHASE_COMING_SOON', copy.PURCHASE_COMING_SOON],
  ['expenseLogged wants', copy.expenseLogged(jajan, 15_000, ok)],
  ['expenseLogged wants over', copy.expenseLogged(jajan, 150_000, overspent)],
  ['expenseLogged needs over', copy.expenseLogged(makan, 1_200_000, overspent)],
  ['expenseLogged NO_BUDGET', copy.expenseLogged(makan, 10_000, noBudget)],
  ['incomeLogged', copy.incomeLogged('Uang Jajan', 2_000_000, ok)],
  ['incomeLogged no category', copy.incomeLogged(null, 2_000_000, exact)],
  ['savingLogged', copy.savingLogged(200_000, ok)],
  ['savingLogged NO_BUDGET', copy.savingLogged(200_000, noBudget)],
  ['confirmDelete', copy.confirmDelete(summary)],
  ['txDeleted', copy.txDeleted(summary)],
  ['DELETE_CANCELLED', copy.DELETE_CANCELLED],
  ['NOTHING_TO_UNDO', copy.NOTHING_TO_UNDO],
  ['NO_BUDGET', copy.NO_BUDGET],
  ['sisa', copy.sisa(ok)],
  ['sisa over', copy.sisa(overspent)],
  ['sisa exact', copy.sisa(exact)],
  ['HISTORY_EMPTY', copy.HISTORY_EMPTY],
  ['categoryList', copy.categoryList([makan, jajan, { name: 'Nabung', bucket: 'SAVINGS' }])],
  ['PICK_NEW_CATEGORY', copy.PICK_NEW_CATEGORY],
  ['CATEGORY_CHANGED', copy.CATEGORY_CHANGED],
  ['CATEGORY_UNAVAILABLE', copy.CATEGORY_UNAVAILABLE],
  ['TX_NOT_FOUND', copy.TX_NOT_FOUND],
];

describe('copy rules', () => {
  it.each(messages)('%s: ≤ 5 lines, ≤ 2 emoji', (_name, text) => {
    expect(text.split('\n').length).toBeLessThanOrEqual(5);
    expect((text.match(emoji) ?? []).length).toBeLessThanOrEqual(2);
  });

  it('the canned stranger reply is the BOT_SPEC §1 text', () => {
    expect(copy.PRIVATE_BOT).toBe('Bot ini private, minta link undangan dulu ya 🙏');
  });

  it('variants differ', () => {
    expect(new Set(variants(copy.welcomeInvited)).size).toBe(2);
    expect(copy.rateLimited(() => 0)).not.toBe(copy.rateLimited(() => 0.99));
  });

  it('welcome for invitees and the owner asks for this month’s income', () => {
    for (const text of [...variants(copy.welcomeInvited), ...variants(copy.welcomeOwner)])
      expect(text).toMatch(/uang jajan/);
  });
});

describe('BOT_SPEC §3 reply formats', () => {
  it('expense: what was recorded and what is left this week', () => {
    expect(copy.expenseLogged(makan, 10_000, ok)).toBe(
      '✅ Dicatat: Makan Rp10.000 (pokok)\nSisa pokok minggu ini: Rp499.999',
    );
  });

  it('over budget: one neutral line per bucket, the expense is still recorded', () => {
    expect(copy.expenseLogged(jajan, 150_000, overspent)).toBe(
      '✅ Dicatat: Jajan Rp150.000 (jajan)\nSisa jajan minggu ini: -Rp10.000\nJajan minggu ini lewat Rp10.000, nanti dipotong dari jatah minggu depan ya.',
    );
    expect(copy.expenseLogged(makan, 1_200_000, overspent)).toBe(
      '✅ Dicatat: Makan Rp1.200.000 (pokok)\nSisa pokok minggu ini: -Rp700.001\nPokok bulan ini udah lewat Rp200.000, pelan-pelan ya.',
    );
  });

  it('without income this month there are no numbers to show', () => {
    expect(copy.expenseLogged(makan, 10_000, noBudget)).toBe(
      '✅ Dicatat: Makan Rp10.000 (pokok)\nSisa budget belum bisa dihitung: uang jajan bulan ini belum dicatat.',
    );
    expect(copy.incomeLogged(null, 5_000, noBudget)).toBe('💰 Pemasukan Rp5.000 masuk!');
  });

  it('income: the new split and this week’s wants', () => {
    expect(copy.incomeLogged('Uang Jajan', 2_000_000, ok)).toBe(
      '💰 Uang Jajan Rp2.000.000 masuk!\nBulan ini: pokok Rp1.000.000 · jajan Rp600.000 · nabung Rp400.000\nJatah jajan minggu ini: Rp140.000 (Rp28.000/hari)',
    );
    expect(copy.incomeLogged(null, 2_000_000, exact)).toMatch(/Jatah jajan minggu ini: Rp0$/);
  });

  it('/sisa: the wants line depends on what is left', () => {
    expect(copy.sisa(ok).split('\n')[2]).toBe('Rp28.000/hari buat 5 hari lagi');
    expect(copy.sisa(exact).split('\n')[2]).toBe('Jatah jajan minggu ini udah abis.');
    expect(copy.sisa(overspent).split('\n')[2]).toBe('Jajan udah lewat Rp10.000, jatah minggu depan kepotong segitu.');
  });
});

describe('formatting helpers', () => {
  it.each([
    ['2026-10-31', '31 Okt'],
    ['2026-01-01', '1 Jan'],
    ['2026-08-09', '9 Agu'],
  ])('formatDate %s → %s', (date, expected) => {
    expect(copy.formatDate(date)).toBe(expected);
  });

  it('formatDayRange', () => {
    expect(copy.formatDayRange('2026-11-02', '2026-11-08')).toBe('2–8 Nov');
    expect(copy.formatDayRange('2026-11-01', '2026-11-01')).toBe('1 Nov');
  });

  it('describeTx: label, amount (+ for income), clipped note, date', () => {
    expect(copy.describeTx(summary)).toBe('Makan Rp10.000 · warteg · 31 Okt');
    expect(copy.describeTx({ ...summary, type: 'INCOME', categoryName: null, note: null })).toBe(
      'Pemasukan +Rp10.000 · 31 Okt',
    );
    expect(copy.describeTx({ ...summary, type: 'SAVING', categoryName: null, note: 'n'.repeat(50) })).toBe(
      `Nabung Rp10.000 · ${'n'.repeat(29)}… · 31 Okt`,
    );
    expect(copy.describeTx({ ...summary, categoryName: null })).toMatch(/^Pengeluaran /);
  });

  it('history: one numbered line per transaction', () => {
    expect(copy.history([summary, { ...summary, amount: 5_000 }])).toBe(
      '📜 2 catatan terakhir (🗑 buat hapus):\n1. Makan Rp10.000 · warteg · 31 Okt\n2. Makan Rp5.000 · warteg · 31 Okt',
    );
  });

  it('categoryList groups by bucket and skips empty ones', () => {
    expect(copy.categoryList([jajan, makan])).toBe('📂 Kategori\nPokok: Makan\nJajan: Jajan');
  });
});

describe('displayName', () => {
  it.each([
    ['Nia', 'Nia'],
    ['  Nia   Putri ', 'Nia Putri'],
    [null, 'kamu'],
    ['   ', 'kamu'],
    ['x'.repeat(50), 'x'.repeat(32)],
  ])('%j → %j', (input, expected) => {
    expect(copy.displayName(input)).toBe(expected);
  });
});
