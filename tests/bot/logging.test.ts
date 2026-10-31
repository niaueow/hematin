import { describe, expect, it } from 'vitest';
import * as copy from '@server/bot/copy.js';
import { localDateFromDb } from '@server/budget/periods.js';
import { DEFAULT_CATEGORIES } from '@server/nlp/keywords.js';
import { buttons, edits, lastCall, MON, person, replies, text, toasts, world } from './harness.js';

// M5, the logging loop (BOT_SPEC §2–§3), through the real bot with in-memory repos. Budget numbers come from
// the real engine, so the expected replies below are worked out by hand from BUDGET_RULES.

const A = person(111, 'Nia');
const B = person(222, 'Rani');
const minutes = (n: number) => n * 60_000;

const txButtons = (id: string) => [
  { text: copy.BUTTON.changeCategory, callback_data: `tx:${id}:cat` },
  { text: copy.BUTTON.undo, callback_data: `tx:${id}:undo` },
];

describe('definition of done (Mon 2 Nov 2026)', () => {
  it('"dapet uang jajan 2jt", "warteg 10k", "gojek 18k", "reksadana 200k" are recorded and /sisa adds up', async () => {
    const ctx = world();
    for (const message of ['dapet uang jajan 2jt', 'warteg 10k', 'gojek 18k', 'reksadana 200k', '/sisa'])
      await ctx.say(A, message);

    // By hand (BUDGET_RULES §2–§5, §7), income 2.000.000 → needs 1.000.000 · wants 600.000 · target 400.000:
    // - wants: S1 base 20.000 ended unspent → bonus 20.000. S2 base 140.000, 7 days → 20.000/day.
    //   Month: 140.000 + S3–S5 3 × 140.000 + S6 20.000 = 580.000.
    // - needs: cumAllowance through S2 = 33.333 + 233.333 = 266.666; − 10.000 → 256.666; − 18.000 → 238.666.
    //   Month: 1.000.000 − 28.000 = 972.000.
    // - savings: 200.000 recorded + 20.000 bonus = 220.000 of 400.000 → 55%.
    expect(replies(ctx.calls)).toEqual([
      '💰 Uang Jajan Rp2.000.000 masuk!\nBulan ini: pokok Rp1.000.000 · jajan Rp600.000 · nabung Rp400.000\nJatah jajan minggu ini: Rp140.000 (Rp20.000/hari)',
      '✅ Dicatat: Makan Rp10.000 (pokok)\nSisa pokok minggu ini: Rp256.666',
      '✅ Dicatat: Transport Rp18.000 (pokok)\nSisa pokok minggu ini: Rp238.666',
      '🐷 Nabung Rp200.000! Tabungan bulan ini 55% dari target (Rp220.000/Rp400.000).',
      '📊 Sisa budget minggu ini (2–8 Nov)\nJajan: Rp140.000 · bulan ini Rp580.000\nRp20.000/hari buat 7 hari lagi\nPokok: Rp238.666 · bulan ini Rp972.000\n🐷 Tabungan: Rp220.000/Rp400.000 (55%)',
    ]);

    expect(
      ctx.db.txs.map((t) => ({
        type: t.type,
        amount: t.amount,
        categoryId: t.categoryId,
        note: t.note,
        rawText: t.rawText,
        source: t.source,
        parseMethod: t.parseMethod,
        occurredAt: t.occurredAt,
        localDate: localDateFromDb(t.localDate),
      })),
    ).toEqual(
      [
        ['INCOME', 2_000_000, 'sys_uang_jajan', 'uang jajan', 'dapet uang jajan 2jt'],
        ['EXPENSE', 10_000, 'sys_makan', 'warteg', 'warteg 10k'],
        ['EXPENSE', 18_000, 'sys_transport', 'gojek', 'gojek 18k'],
        ['SAVING', 200_000, 'sys_nabung', 'reksadana', 'reksadana 200k'],
      ].map(([type, amount, categoryId, note, rawText]) => ({
        type,
        amount,
        categoryId,
        note,
        rawText,
        source: 'BOT',
        parseMethod: 'RULE',
        occurredAt: MON,
        localDate: '2026-11-02',
      })),
    );

    // Every log reply carries [✏️ Ganti kategori] [↩️ Undo] for its own transaction.
    const sent = ctx.calls.filter((c) => c.method === 'sendMessage');
    ctx.db.txs.forEach((tx, i) => expect(buttons(sent[i])).toEqual(txButtons(tx.id)));
  });

  it('/sisa on Wed 11 Nov matches the BUDGET_RULES §8 worked example', async () => {
    const ctx = world({ now: new Date('2026-11-11T03:00:00.000Z'), income: true });
    ctx.db.seed('u1', 'EXPENSE', 15_000, '2026-11-01', 'sys_jajan');
    ctx.db.seed('u1', 'EXPENSE', 170_000, '2026-11-03', 'sys_jajan');
    ctx.db.seed('u1', 'EXPENSE', 50_000, '2026-11-09', 'sys_jajan');
    await ctx.say(A, '/sisa');
    // Wants S3: 140.000 − 30.000 debt − 50.000 = 60.000 for Wed–Sun (12.000/day); month 60.000 + 300.000.
    // Needs: 33.333 + 233.333 + 233.333 = 499.999. Bonus: S1's 5.000 → 1% of 400.000.
    expect(replies(ctx.calls)).toEqual([
      '📊 Sisa budget minggu ini (9–15 Nov)\nJajan: Rp60.000 · bulan ini Rp360.000\nRp12.000/hari buat 5 hari lagi\nPokok: Rp499.999 · bulan ini Rp1.000.000\n🐷 Tabungan: Rp5.000/Rp400.000 (1%)',
    ]);
  });
});

describe('recording (never refused)', () => {
  it('over the wants budget: recorded, plus the neutral line from BOT_SPEC §3.1', async () => {
    const ctx = world({ income: true });
    await ctx.say(A, 'seblak 150k');
    expect(replies(ctx.calls)).toEqual([
      '✅ Dicatat: Jajan Rp150.000 (jajan)\nSisa jajan minggu ini: -Rp10.000\nJajan minggu ini lewat Rp10.000, nanti dipotong dari jatah minggu depan ya.',
    ]);
    expect(ctx.lastTx()).toMatchObject({ type: 'EXPENSE', amount: 150_000, categoryId: 'sys_jajan' });
  });

  it('over the month’s needs: recorded, plus the needs line', async () => {
    const ctx = world({ income: true });
    await ctx.say(A, 'belanja bulanan 1,2jt');
    expect(replies(ctx.calls)[0]).toMatch(/\nPokok bulan ini udah lewat Rp200\.000, pelan-pelan ya\.$/);
    expect(ctx.lastTx()).toMatchObject({ amount: 1_200_000, categoryId: 'sys_belanja_bulanan' });
  });

  it('localDate is the WIB date of when the message was sent', async () => {
    const ctx = world({ now: new Date('2026-10-31T17:00:30.000Z'), income: true }); // 00:00:30 WIB, 1 Nov
    await ctx.send(text(A, 'warteg 10k', { date: new Date('2026-10-31T16:59:00.000Z') })); // 23:59 WIB, 31 Oct
    expect(localDateFromDb(ctx.lastTx().localDate)).toBe('2026-10-31');
  });

  it('income without a matching category is income with no category', async () => {
    const ctx = world({ income: true });
    await ctx.say(A, 'gajian 3jt');
    expect(ctx.lastTx()).toMatchObject({ type: 'INCOME', amount: 3_000_000, categoryId: null, parseMethod: 'RULE' });
    expect(replies(ctx.calls)[0]).toMatch(/^💰 Pemasukan Rp3\.000\.000 masuk!\nBulan ini: pokok Rp2\.500\.000/);
  });

  it('"mau nabung 200k" records a saving (owner decision), not a purchase check', async () => {
    const ctx = world({ income: true });
    await ctx.say(A, 'mau nabung 200k');
    expect(ctx.db.intents).toEqual([]);
    expect(ctx.lastTx()).toMatchObject({ type: 'SAVING', amount: 200_000, categoryId: 'sys_nabung' });
  });

  it.each([
    ['kopi 20k sama roti 15k', copy.ONE_AT_A_TIME],
    ['beli laptop 150jt', copy.amountOutOfRange(150_000_000)],
    ['halo', copy.SHORT_HELP],
  ])('%j → a reply, nothing recorded', async (message, expected) => {
    const ctx = world({ income: true });
    await ctx.say(A, message);
    expect(replies(ctx.calls)).toEqual([expected]);
    expect(ctx.live()).toHaveLength(0);
    expect(ctx.db.chatStates.size).toBe(0);
  });
});

describe('income nudge (PRD F12)', () => {
  it('a month without income: the first message gets the nudge once; logging still works', async () => {
    const ctx = world();
    await ctx.say(A, 'warteg 10k');
    await ctx.say(A, 'gojek 18k');
    expect(replies(ctx.calls)).toEqual([
      '✅ Dicatat: Makan Rp10.000 (pokok)\nSisa budget belum bisa dihitung: uang jajan bulan ini belum dicatat.',
      copy.incomeNudge(() => 0),
      '✅ Dicatat: Transport Rp18.000 (pokok)\nSisa budget belum bisa dihitung: uang jajan bulan ini belum dicatat.',
    ]);
    expect(ctx.live()).toHaveLength(2);
  });

  it('comes back in the next month without income', async () => {
    const ctx = world({ income: true });
    await ctx.say(A, 'halo');
    ctx.clock.now = new Date('2026-12-01T03:00:00.000Z');
    await ctx.say(A, 'halo');
    expect(replies(ctx.calls)).toEqual([copy.SHORT_HELP, copy.SHORT_HELP, copy.incomeNudge(() => 0)]);
  });

  it('not when the reply already asks for income (/sisa, "dapet uang jajan" without an amount)', async () => {
    const ctx = world();
    await ctx.say(A, '/sisa');
    await ctx.say(A, 'halo');
    expect(replies(ctx.calls)).toEqual([copy.NO_BUDGET, copy.SHORT_HELP]);

    const other = world();
    await other.say(A, 'dapet uang jajan');
    expect(replies(other.calls)).toEqual([copy.askAmount(() => 0)]);
  });
});

describe('missing amount: "Berapa duitnya?" (ChatState, 10 minutes)', () => {
  it('the next amount-only message completes it', async () => {
    const ctx = world({ income: true });
    await ctx.say(A, 'warteg');
    expect(replies(ctx.calls)).toEqual([copy.askAmount(() => 0)]);
    expect(ctx.db.chatStates.get('u1')).toMatchObject({
      kind: 'AWAIT_AMOUNT',
      expiresAt: new Date(MON.getTime() + minutes(10)),
    });
    ctx.clock.now = new Date(MON.getTime() + minutes(2));
    await ctx.say(A, '10rb aja');
    expect(ctx.lastTx()).toMatchObject({
      type: 'EXPENSE',
      amount: 10_000,
      categoryId: 'sys_makan',
      note: 'warteg',
      rawText: 'warteg\n10rb aja',
      occurredAt: MON, // when the expense was first mentioned
    });
    expect(ctx.db.chatStates.size).toBe(0);
  });

  it('a different message replaces the question', async () => {
    const ctx = world({ income: true });
    await ctx.say(A, 'warteg');
    await ctx.say(A, 'gojek 18k');
    expect(ctx.live().map((t) => t.categoryId)).toEqual(['sys_transport']);
    expect(ctx.db.chatStates.size).toBe(0);
  });

  it('after 10 minutes the amount is a new message (no category → buttons)', async () => {
    const ctx = world({ income: true });
    await ctx.say(A, 'warteg');
    ctx.clock.now = new Date(MON.getTime() + minutes(10));
    await ctx.say(A, '10k');
    expect(replies(ctx.calls).at(-1)).toBe(copy.pickCategory('', 10_000));
    expect(ctx.live()).toHaveLength(0);
  });

  it('income: "dapet uang jajan" → "2jt"', async () => {
    const ctx = world();
    await ctx.say(A, 'dapet uang jajan');
    await ctx.say(A, '2jt');
    expect(ctx.lastTx()).toMatchObject({ type: 'INCOME', amount: 2_000_000, categoryId: 'sys_uang_jajan' });
  });

  it('/pemasukan <nominal> and /pemasukan → nominal', async () => {
    const ctx = world();
    await ctx.say(A, '/pemasukan 2jt');
    expect(ctx.lastTx()).toMatchObject({
      type: 'INCOME',
      amount: 2_000_000,
      categoryId: null,
      rawText: '/pemasukan 2jt',
    });
    await ctx.say(A, '/pemasukan');
    expect(replies(ctx.calls).at(-1)).toBe(copy.askAmount(() => 0));
    await ctx.say(A, '1,5jt');
    expect(ctx.lastTx()).toMatchObject({ type: 'INCOME', amount: 1_500_000 });
    expect(replies(ctx.calls).at(-1)).toMatch(/^💰 Pemasukan Rp1\.500\.000 masuk!\nBulan ini: pokok Rp1\.750\.000/);
  });
});

describe('ambiguous small amount: "Maksudnya Rp20.000?"', () => {
  async function asked() {
    const ctx = world({ income: true });
    await ctx.say(A, 'kopi 20');
    return ctx;
  }

  it('asks with buttons and records nothing yet', async () => {
    const ctx = await asked();
    expect(replies(ctx.calls)).toEqual([copy.confirmAmount(20_000)]);
    expect(buttons(lastCall(ctx.calls, 'sendMessage'))).toEqual([
      { text: '✅ Iya, Rp20.000', callback_data: 'am:n1:y' },
      { text: '❌ Bukan', callback_data: 'am:n1:n' },
    ]);
    expect(ctx.live()).toHaveLength(0);
  });

  it('"Iya" records Rp20.000 (once, even when tapped twice)', async () => {
    const ctx = await asked();
    ctx.clear();
    await ctx.press(A, 'am:n1:y');
    expect(edits(ctx.calls)).toEqual(['✅ Dicatat: Jajan Rp20.000 (jajan)\nSisa jajan minggu ini: Rp120.000']);
    expect(ctx.lastTx()).toMatchObject({ amount: 20_000, categoryId: 'sys_jajan', note: 'kopi', rawText: 'kopi 20' });
    expect(buttons(lastCall(ctx.calls, 'editMessageText'))).toEqual(txButtons(ctx.lastTx().id));
    await ctx.press(A, 'am:n1:y');
    expect(toasts(ctx.calls).at(-1)).toBe(copy.EXPIRED);
    expect(ctx.live()).toHaveLength(1);
  });

  it('"Bukan" records nothing', async () => {
    const ctx = await asked();
    await ctx.press(A, 'am:n1:n');
    expect(edits(ctx.calls)).toEqual([copy.AMOUNT_RETYPE]);
    expect(ctx.live()).toHaveLength(0);
  });

  it('typing the amount works too, and the old buttons expire', async () => {
    const ctx = await asked();
    await ctx.say(A, '20k');
    expect(ctx.lastTx()).toMatchObject({ amount: 20_000, categoryId: 'sys_jajan' });
    await ctx.press(A, 'am:n1:y');
    expect(ctx.live()).toHaveLength(1);
  });
});

describe('no category found: pick one (USER_PICK)', () => {
  async function asked(message = 'cimol 5k') {
    const ctx = world({ income: true });
    await ctx.say(A, message);
    return ctx;
  }

  it('shows the expense and savings categories (not income) and a cancel button', async () => {
    const ctx = await asked();
    expect(replies(ctx.calls)).toEqual([copy.pickCategory('cimol', 5_000)]);
    const shown = buttons(lastCall(ctx.calls, 'sendMessage'));
    expect(shown.map((b) => b.callback_data)).toEqual([
      ...DEFAULT_CATEGORIES.filter((c) => c.bucket !== 'INCOME').map((c) => `pk:n1:${c.id}`),
      'px:n1',
    ]);
    expect(shown[0]?.text).toBe('Makan · pokok');
    expect(ctx.db.chatStates.get('u1')?.kind).toBe('AWAIT_CATEGORY');
  });

  it('a pick records the expense as USER_PICK and learns the alias for next time', async () => {
    const ctx = await asked();
    await ctx.press(A, 'pk:n1:sys_jajan');
    expect(edits(ctx.calls)).toEqual(['✅ Dicatat: Jajan Rp5.000 (jajan)\nSisa jajan minggu ini: Rp135.000']);
    expect(ctx.lastTx()).toMatchObject({
      type: 'EXPENSE',
      categoryId: 'sys_jajan',
      parseMethod: 'USER_PICK',
      note: 'cimol',
    });
    expect(ctx.db.aliases).toMatchObject([{ userId: 'u1', keyword: 'cimol', categoryId: 'sys_jajan' }]);

    await ctx.say(A, 'cimol 7k');
    expect(ctx.lastTx()).toMatchObject({ amount: 7_000, categoryId: 'sys_jajan', parseMethod: 'ALIAS' });
  });

  it('a savings category makes it a SAVING', async () => {
    const ctx = await asked('crypto 100k');
    await ctx.press(A, 'pk:n1:sys_nabung');
    expect(ctx.lastTx()).toMatchObject({ type: 'SAVING', amount: 100_000, categoryId: 'sys_nabung' });
  });

  it('a double tap records once', async () => {
    const ctx = await asked();
    await ctx.press(A, 'pk:n1:sys_jajan');
    await ctx.press(A, 'pk:n1:sys_makan');
    expect(ctx.live()).toHaveLength(1);
    expect(toasts(ctx.calls).at(-1)).toBe(copy.EXPIRED);
  });

  it.each([
    ['cancel', 'px:n1', copy.PICK_CANCELLED],
    ['an income category (forged)', 'pk:n1:sys_uang_jajan', copy.EXPIRED],
    ['an unknown category (forged)', 'pk:n1:cat_of_someone_else', copy.EXPIRED],
    ['a stale nonce', 'pk:n0:sys_jajan', copy.EXPIRED],
  ])('%s → nothing recorded', async (_name, data, expected) => {
    const ctx = await asked();
    await ctx.press(A, data);
    expect(edits(ctx.calls)).toEqual([expected]);
    expect(ctx.live()).toHaveLength(0);
    expect(ctx.db.aliases).toEqual([]);
  });

  it('expires after 10 minutes', async () => {
    const ctx = await asked();
    ctx.clock.now = new Date(MON.getTime() + minutes(10));
    await ctx.press(A, 'pk:n1:sys_jajan');
    expect(ctx.live()).toHaveLength(0);
  });
});

describe('✏️ Ganti kategori', () => {
  async function logged(message = 'warteg 10k') {
    const ctx = world({ income: true });
    await ctx.say(A, message);
    const id = ctx.lastTx().id;
    ctx.clear();
    return { ...ctx, id };
  }

  it('shows the categories a transaction can move to, with a way back', async () => {
    const ctx = await logged();
    await ctx.press(A, `tx:${ctx.id}:cat`);
    const markup = lastCall(ctx.calls, 'editMessageReplyMarkup');
    expect(buttons(markup).map((b) => b.callback_data)).toEqual([
      ...DEFAULT_CATEGORIES.filter((c) => c.bucket !== 'INCOME').map((c) => `tc:${ctx.id}:${c.id}`),
      `tx:${ctx.id}:back`,
    ]);
    expect(toasts(ctx.calls)).toEqual([copy.PICK_NEW_CATEGORY]);

    await ctx.press(A, `tx:${ctx.id}:back`);
    expect(buttons(lastCall(ctx.calls, 'editMessageReplyMarkup'))).toEqual(txButtons(ctx.id));
  });

  it('a new category updates the transaction (scoped), learns the alias, and refreshes the reply', async () => {
    const ctx = await logged();
    await ctx.press(A, `tc:${ctx.id}:sys_jajan`);
    expect(ctx.lastTx()).toMatchObject({ type: 'EXPENSE', categoryId: 'sys_jajan', parseMethod: 'USER_PICK' });
    expect(ctx.db.aliases).toMatchObject([{ userId: 'u1', keyword: 'warteg', categoryId: 'sys_jajan' }]);
    expect(edits(ctx.calls)).toEqual(['✅ Dicatat: Jajan Rp10.000 (jajan)\nSisa jajan minggu ini: Rp130.000']);
    expect(toasts(ctx.calls)).toEqual([copy.CATEGORY_CHANGED]);

    await ctx.say(A, 'warteg 12k');
    expect(ctx.lastTx()).toMatchObject({ categoryId: 'sys_jajan', parseMethod: 'ALIAS' });
  });

  it('moving an expense to Nabung makes it a SAVING', async () => {
    const ctx = await logged();
    await ctx.press(A, `tc:${ctx.id}:sys_nabung`);
    expect(ctx.lastTx()).toMatchObject({ type: 'SAVING', categoryId: 'sys_nabung' });
    expect(edits(ctx.calls)[0]).toMatch(/^🐷 Nabung Rp10\.000!/);
  });

  it('income stays income: only income categories are offered or accepted', async () => {
    const ctx = await logged('gajian 3jt');
    await ctx.press(A, `tx:${ctx.id}:cat`);
    expect(buttons(lastCall(ctx.calls, 'editMessageReplyMarkup')).map((b) => b.callback_data)).toEqual([
      `tc:${ctx.id}:sys_uang_jajan`,
      `tx:${ctx.id}:back`,
    ]);
    await ctx.press(A, `tc:${ctx.id}:sys_makan`);
    expect(toasts(ctx.calls).at(-1)).toBe(copy.CATEGORY_UNAVAILABLE);
    expect(ctx.lastTx()).toMatchObject({ type: 'INCOME', categoryId: null });
  });
});

describe('↩️ Undo, /undo, /riwayat 🗑', () => {
  it('the button asks first; "Ya, hapus" soft-deletes; a second tap finds nothing', async () => {
    const ctx = world({ income: true });
    await ctx.say(A, 'warteg 10k');
    const { id } = ctx.lastTx();
    ctx.clear();
    await ctx.press(A, `tx:${id}:undo`);
    expect(replies(ctx.calls)).toEqual(['Hapus catatan ini?\nMakan Rp10.000 · warteg · 2 Nov']);
    expect(buttons(lastCall(ctx.calls, 'sendMessage'))).toEqual([
      { text: copy.BUTTON.confirmDelete, callback_data: `tx:${id}:del` },
      { text: copy.BUTTON.cancel, callback_data: `tx:${id}:no` },
    ]);
    expect(ctx.lastTx().deletedAt).toBeNull();

    await ctx.press(A, `tx:${id}:del`);
    expect(edits(ctx.calls)).toEqual(['🗑 Dihapus: Makan Rp10.000 · warteg · 2 Nov']);
    expect(ctx.lastTx().deletedAt).toEqual(MON);

    await ctx.press(A, `tx:${id}:del`);
    expect(toasts(ctx.calls).at(-1)).toBe(copy.TX_NOT_FOUND);
  });

  it('"Batal" keeps it', async () => {
    const ctx = world({ income: true });
    await ctx.say(A, 'warteg 10k');
    await ctx.press(A, `tx:${ctx.lastTx().id}:no`);
    expect(edits(ctx.calls)).toEqual([copy.DELETE_CANCELLED]);
    expect(ctx.lastTx().deletedAt).toBeNull();
  });

  it('/undo offers the latest transaction from the last 24 hours', async () => {
    const ctx = world({ income: true });
    await ctx.say(A, 'warteg 10k');
    ctx.clock.now = new Date(MON.getTime() + minutes(5));
    await ctx.say(A, 'gojek 18k');
    ctx.clear();
    await ctx.say(A, '/undo');
    expect(replies(ctx.calls)).toEqual(['Hapus catatan ini?\nTransport Rp18.000 · gojek · 2 Nov']);
    expect(buttons(lastCall(ctx.calls, 'sendMessage'))[0]?.callback_data).toBe(`tx:${ctx.lastTx().id}:del`);

    ctx.clock.now = new Date(MON.getTime() + minutes(5) + 24 * 3_600_000 + 1);
    await ctx.say(A, '/undo');
    expect(replies(ctx.calls).at(-1)).toBe(copy.NOTHING_TO_UNDO);
  });

  it('/riwayat lists the last 10, newest first, each with a 🗑 button', async () => {
    const ctx = world({ income: true });
    for (let i = 1; i <= 11; i++) {
      ctx.clock.now = new Date(MON.getTime() + minutes(i));
      await ctx.say(A, `warteg ${i}k`);
    }
    ctx.clear();
    await ctx.say(A, '/riwayat');
    const [list] = replies(ctx.calls) as string[];
    expect(list?.split('\n')).toHaveLength(11);
    expect(list?.split('\n').slice(0, 3)).toEqual([
      '📜 10 catatan terakhir (🗑 buat hapus):',
      '1. Makan Rp11.000 · warteg · 2 Nov',
      '2. Makan Rp10.000 · warteg · 2 Nov',
    ]);
    const shown = buttons(lastCall(ctx.calls, 'sendMessage'));
    expect(shown).toHaveLength(10);
    expect(shown[0]).toEqual({ text: '🗑 1. Makan Rp11.000', callback_data: `tx:${ctx.lastTx().id}:undo` });
  });

  it('/riwayat with nothing recorded', async () => {
    const ctx = world({ income: true });
    await ctx.say(B, '/riwayat');
    expect(replies(ctx.calls)[0]).toBe(copy.HISTORY_EMPTY);
  });

  it('/kategori lists the usable categories by bucket', async () => {
    const ctx = world({ income: true });
    await ctx.say(A, '/kategori');
    expect(replies(ctx.calls)).toEqual([copy.categoryList(DEFAULT_CATEGORIES)]);
  });
});

describe('cross-user callbacks (SECURITY §3.3)', () => {
  it.each(['cat', 'back', 'undo', 'del', 'no'])('B pressing tx:<A’s id>:%s does nothing', async (op) => {
    const ctx = world({ income: true });
    await ctx.say(A, 'warteg 10k');
    const before = structuredClone(ctx.lastTx());
    ctx.clear();
    ctx.db.writes.length = 0;
    await ctx.press(B, `tx:${before.id}:${op}`);
    expect(ctx.calls.map((c) => c.method)).toEqual(['answerCallbackQuery']);
    expect(toasts(ctx.calls)).toEqual([copy.TX_NOT_FOUND]);
    expect(ctx.lastTx()).toEqual(before);
    expect(ctx.db.writes).toEqual(['processedUpdate', 'rateLimit']);
  });

  it('B pressing "Ganti kategori → Jajan" on A’s transaction changes nothing and learns nothing', async () => {
    const ctx = world({ income: true });
    await ctx.say(A, 'warteg 10k');
    const before = structuredClone(ctx.lastTx());
    ctx.clear();
    await ctx.press(B, `tc:${before.id}:sys_jajan`);
    expect(ctx.calls.map((c) => c.method)).toEqual(['answerCallbackQuery']);
    expect(ctx.lastTx()).toEqual(before);
    expect(ctx.db.aliases).toEqual([]);
  });

  it.each([
    ['a category pick', 'cimol 5k', 'pk:n1:sys_jajan'],
    ['an amount confirmation', 'kopi 20', 'am:n1:y'],
  ])('B pressing A’s %s records nothing, and A’s question stays open', async (_name, message, data) => {
    const ctx = world({ income: true });
    await ctx.say(A, message);
    const state = structuredClone(ctx.db.chatStates.get('u1'));
    await ctx.press(B, data);
    expect(ctx.db.txs.filter((t) => t.source === 'BOT')).toEqual([]);
    expect(ctx.db.chatStates.get('u1')).toEqual(state);
    expect(ctx.calls.filter((c) => c.method === 'sendMessage')).toHaveLength(1); // only A's question

    await ctx.press(A, data);
    expect(ctx.lastTx()).toMatchObject({ userId: 'u1', amount: data.startsWith('am') ? 20_000 : 5_000 });
  });

  it('callback data we did not produce is only acknowledged', async () => {
    const ctx = world({ income: true });
    await ctx.press(A, 'tx:../../etc:del');
    await ctx.press(A, 'pi:1:buy');
    expect(ctx.calls.map((c) => c.method)).toEqual(['answerCallbackQuery', 'answerCallbackQuery']);
  });
});

describe('cross-user categories (SECURITY §3.3)', () => {
  /** A has a category of their own; B learns its id somehow and puts it in button data. */
  function withPrivateCategory() {
    const ctx = world({ income: true });
    ctx.db.categories.push({
      id: 'cat_a_private',
      userId: 'u1',
      slug: 'kucing',
      name: 'Kucing',
      emoji: null,
      bucket: 'NEEDS',
      keywords: [],
      archived: false,
      createdAt: new Date(0),
    });
    return ctx;
  }

  it('B can’t pick A’s category for a new log', async () => {
    const ctx = withPrivateCategory();
    await ctx.say(B, 'cimol 5k');
    await ctx.press(B, 'pk:n1:cat_a_private');
    expect(edits(ctx.calls)).toEqual([copy.EXPIRED]);
    expect(ctx.live()).toEqual([]);
    expect(ctx.db.aliases).toEqual([]);
  });

  it('B can’t move their own transaction into A’s category, and isn’t offered it', async () => {
    const ctx = withPrivateCategory();
    await ctx.say(B, 'warteg 10k');
    const id = ctx.lastTx().id;
    await ctx.press(B, `tx:${id}:cat`);
    const offered = buttons(lastCall(ctx.calls, 'editMessageReplyMarkup')).map((b) => b.callback_data);
    expect(offered).not.toContain(`tc:${id}:cat_a_private`);
    await ctx.press(B, `tc:${id}:cat_a_private`);
    expect(toasts(ctx.calls).at(-1)).toBe(copy.CATEGORY_UNAVAILABLE);
    expect(ctx.lastTx()).toMatchObject({ userId: 'u2', categoryId: 'sys_makan' });
  });

  it('A’s own category is usable by A', async () => {
    const ctx = withPrivateCategory();
    await ctx.say(A, 'whiskas 50k');
    await ctx.press(A, 'pk:n1:cat_a_private');
    expect(ctx.lastTx()).toMatchObject({ userId: 'u1', categoryId: 'cat_a_private' });
  });
});
