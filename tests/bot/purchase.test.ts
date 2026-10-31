import { describe, expect, it } from 'vitest';
import * as copy from '@server/bot/copy.js';
import { localDateFromDb } from '@server/budget/periods.js';
import { buttons, edits, lastCall, person, replies, toasts, world } from './harness.js';

// M6, the purchase check ("mau X", BOT_SPEC §3.2, BUDGET_RULES §6) through the real bot and engine.
// Most cases use the BUDGET_RULES §8 situation: Wed 11 Nov 2026, income 2.000.000, wants S3 (9–15 Nov)
// base 140.000 − 30.000 debt from S2 − 50.000 spent = 60.000 left for Wed–Sun (5 days, pace 12.000).
// Savings: S1's 5.000 bonus = 1% of the 400.000 target.

const A = person(111, 'Nia');
const B = person(222, 'Rani');
const WED = new Date('2026-11-11T03:00:00.000Z'); // 10:00 WIB
const hours = (n: number) => n * 3_600_000;

function wed(options: { random?: () => number } = {}) {
  const ctx = world({ now: WED, income: true, ...options });
  ctx.db.seed('u1', 'EXPENSE', 15_000, '2026-11-01', 'sys_jajan');
  ctx.db.seed('u1', 'EXPENSE', 170_000, '2026-11-03', 'sys_jajan');
  ctx.db.seed('u1', 'EXPENSE', 50_000, '2026-11-09', 'sys_jajan');
  return ctx;
}
const LAST = () => 0.99; // picks the last eligible variant
const purchaseButtons = (id: string, emoji: string) => [
  { text: `${emoji} Jadi beli`, callback_data: `pi:${id}:buy` },
  { text: '💪 Ga jadi', callback_data: `pi:${id}:skip` },
];

describe('the four verdicts (BUDGET_RULES §6), with exact numbers', () => {
  it.each([
    [
      'ALLOW (10.000 ≤ pace 12.000)',
      'mau donat 10k',
      undefined,
      'Gas! 🍩 Jajanmu minggu ini masih Rp60.000, abis ini sisa Rp50.000 buat 4 hari. Santuy.',
    ],
    ['ALLOW, 2nd variant', 'mau donat 10k', LAST, 'Boleh dong 😄 Masih aman kok, sisa jajan Rp50.000 sampai Minggu.'],
    [
      'CAUTION (the §8 example: 35.000 > pace 12.000, ≤ 60.000)',
      'mau donat 35k',
      undefined,
      'Hmm bisa sih, tapi abis ini jajanmu tinggal Rp25.000 buat 4 hari lagi (≈Rp6.250/hari) 😬 Tabunganmu udah 1% dari target, sayang kalo jebol. Yakin?',
    ],
    [
      'CAUTION, 2nd variant',
      'mau donat 35k',
      LAST,
      'Boleh… tapi mepet ya. Sisa Rp25.000 buat 4 hari. Mau skip dulu biar aman? 👀',
    ],
    [
      'DENY (70.000 > 60.000 → next week cut 10.000)',
      'mau boba 70k',
      undefined,
      'Waduh, jajan minggu ini tinggal Rp60.000 bestie 🥲 Kalau maksa, jatah minggu depan kepotong Rp10.000. Mending skip dulu, duitnya jadi tabungan aja yuk 💪',
    ],
    [
      'DENY, "Senin reset" variant (no debt carried, the segment ends on Sunday)',
      'mau boba 70k',
      LAST,
      'Yah, jatah jajan minggu ini tinggal Rp60.000, ga cukup. Tahan dulu ya, Senin jatahmu reset 😉',
    ],
  ])('%s', async (_name, message, random, expected) => {
    const ctx = wed(random ? { random } : {});
    await ctx.say(A, message);
    expect(replies(ctx.calls)).toEqual([expected]);
  });

  it('NO_BUDGET: no income this month → the NO_BUDGET template, and the buttons still work', async () => {
    const ctx = world({ now: WED });
    await ctx.say(A, 'mau donat 35k');
    expect(replies(ctx.calls)).toEqual([copy.NO_BUDGET]); // no separate income nudge: this already asks
    expect(ctx.db.intents).toMatchObject([{ verdict: 'NO_BUDGET', status: 'PENDING' }]);
    await ctx.press(A, 'pi:pi1:buy');
    expect(edits(ctx.calls)).toEqual([
      'Oke dicatat 🍩\nSisa budget belum bisa dihitung: uang jajan bulan ini belum dicatat.',
    ]);
    expect(ctx.live()).toHaveLength(1);
  });

  it('a verdict records nothing; it creates a PENDING intent that expires in 24 h', async () => {
    const ctx = wed();
    await ctx.say(A, 'mau donat 35k');
    expect(ctx.live()).toEqual([]);
    const [intent] = ctx.db.intents;
    expect(intent).toMatchObject({
      userId: 'u1',
      item: 'donat',
      amount: 35_000,
      categoryId: 'sys_jajan',
      verdict: 'CAUTION',
      status: 'PENDING',
      expiresAt: new Date(WED.getTime() + hours(24)),
      transactionId: null,
    });
    expect(localDateFromDb(intent?.localDate as Date)).toBe('2026-11-11');
    expect(buttons(lastCall(ctx.calls, 'sendMessage'))).toEqual(purchaseButtons('pi1', '🍩'));
  });

  it('the button emoji is generic 🛒 for anything but a donut', async () => {
    const ctx = wed();
    await ctx.say(A, 'mau boba 20k');
    expect(buttons(lastCall(ctx.calls, 'sendMessage'))).toEqual(purchaseButtons('pi1', '🛒'));
  });
});

describe('"Senin jatahmu reset" only when no debt carries into the next segment (BOT_SPEC §5 ⚠)', () => {
  it('debt carried (already 10.000 over): only the first DENY variant, even when the dice say otherwise', async () => {
    const ctx = wed({ random: LAST });
    ctx.db.seed('u1', 'EXPENSE', 70_000, '2026-11-10', 'sys_jajan'); // 110.000 − 120.000 = −10.000
    await ctx.say(A, 'mau boba 20k');
    expect(replies(ctx.calls)).toEqual([
      'Waduh, jajan minggu ini udah abis bestie 🥲 Kalau maksa, jatah minggu depan kepotong Rp20.000. Mending skip dulu, duitnya jadi tabungan aja yuk 💪',
    ]);
  });

  it('exactly used up (no debt): the BOT_SPEC text', async () => {
    const ctx = wed({ random: LAST });
    ctx.db.seed('u1', 'EXPENSE', 60_000, '2026-11-10', 'sys_jajan');
    await ctx.say(A, 'mau boba 20k');
    expect(replies(ctx.calls)).toEqual([
      'Yah, jatah jajan minggu ini udah habis. Tahan dulu ya, Senin jatahmu reset 😉',
    ]);
  });

  it('not when the segment ends with the month mid-week (Mon 30 Nov → next allocation is Tue 1 Dec)', async () => {
    const ctx = world({ now: new Date('2026-11-30T03:00:00.000Z'), income: true, random: LAST });
    ctx.db.seed('u1', 'EXPENSE', 20_000, '2026-11-30', 'sys_jajan'); // S6 base 20.000, used up
    await ctx.say(A, 'mau donat 5k');
    expect(replies(ctx.calls)[0]).toMatch(/^Waduh, jajan minggu ini udah abis bestie/);
  });
});

describe('days and "sampai …" follow the segment', () => {
  it('on the segment’s last day: "buat hari ini" / "sampai hari ini"', async () => {
    const sunday = world({ now: new Date('2026-11-08T03:00:00.000Z'), income: true });
    await sunday.say(A, 'mau donat 10k');
    expect(replies(sunday.calls)).toEqual([
      'Gas! 🍩 Jajanmu minggu ini masih Rp140.000, abis ini sisa Rp130.000 buat hari ini. Santuy.',
    ]);
    const again = world({ now: new Date('2026-11-08T03:00:00.000Z'), income: true, random: LAST });
    await again.say(A, 'mau donat 10k');
    expect(replies(again.calls)).toEqual(['Boleh dong 😄 Masih aman kok, sisa jajan Rp130.000 sampai hari ini.']);
  });

  it('a segment that ends with the month: "sampai 31 Des"', async () => {
    const ctx = world({ now: new Date('2026-12-29T03:00:00.000Z'), random: LAST }); // Tue; S6 = 28–31 Dec
    ctx.db.seed('u1', 'INCOME', 3_100_000, '2026-12-01');
    await ctx.say(A, 'mau donat 5k');
    expect(replies(ctx.calls)[0]).toMatch(/sampai 31 Des\.$/);
  });
});

describe('Jadi beli', () => {
  it('records the EXPENSE, links it, marks the intent BOUGHT, and shows the new remaining', async () => {
    const ctx = wed();
    await ctx.say(A, 'mau donat 35k');
    ctx.clear();
    await ctx.press(A, 'pi:pi1:buy');
    const tx = ctx.lastTx();
    expect(tx).toMatchObject({
      userId: 'u1',
      type: 'EXPENSE',
      amount: 35_000,
      categoryId: 'sys_jajan',
      note: 'donat',
      source: 'BOT',
      occurredAt: WED,
    });
    expect(ctx.db.intents[0]).toMatchObject({ status: 'BOUGHT', transactionId: tx.id, decidedAt: WED });
    expect(edits(ctx.calls)).toEqual(['Oke dicatat 🍩 Sisa jajan minggu ini Rp25.000.']); // BOT_SPEC §3.2
    expect(buttons(lastCall(ctx.calls, 'editMessageText')).map((b) => b.callback_data)).toEqual([
      `tx:${tx.id}:cat`,
      `tx:${tx.id}:undo`,
    ]);
  });

  it('after a DENY it still records, and the reply is neutral (no shaming)', async () => {
    const ctx = wed();
    await ctx.say(A, 'mau boba 70k');
    await ctx.press(A, 'pi:pi1:buy');
    expect(edits(ctx.calls)).toEqual([
      'Oke dicatat 🛒 Jajan minggu ini lewat Rp10.000, nanti dipotong dari jatah minggu depan ya.',
    ]);
    expect(ctx.live()).toMatchObject([{ amount: 70_000 }]);
  });

  it('a second tap is a no-op', async () => {
    const ctx = wed();
    await ctx.say(A, 'mau donat 35k');
    await ctx.press(A, 'pi:pi1:buy');
    ctx.clear();
    ctx.db.writes.length = 0;
    await ctx.press(A, 'pi:pi1:buy');
    await ctx.press(A, 'pi:pi1:skip');
    expect(ctx.calls.map((c) => c.method)).toEqual(['answerCallbackQuery', 'answerCallbackQuery']);
    expect(toasts(ctx.calls)).toEqual([copy.INTENT_DECIDED, copy.INTENT_DECIDED]);
    expect(ctx.live()).toHaveLength(1);
    expect(ctx.db.intents[0]?.status).toBe('BOUGHT');
    expect(ctx.db.writes.filter((w) => !['processedUpdate', 'rateLimit'].includes(w))).toEqual([]);
  });
});

describe('Ga jadi', () => {
  it('marks it SKIPPED, records nothing, and shows the week’s "duit diselamatkan" total', async () => {
    const ctx = wed();
    await ctx.say(A, 'mau boba 50k');
    await ctx.press(A, 'pi:pi1:skip');
    await ctx.say(A, 'mau donat 35k');
    ctx.clear();
    await ctx.press(A, 'pi:pi2:skip');
    expect(edits(ctx.calls)).toEqual(['Mantap! 💪 Rp35.000 selamat. Total yang kamu selamatkan minggu ini: Rp85.000.']);
    expect(ctx.db.intents.map((i) => i.status)).toEqual(['SKIPPED', 'SKIPPED']);
    expect(ctx.live()).toEqual([]);
  });

  it('a second tap (or Jadi beli afterwards) is a no-op', async () => {
    const ctx = wed();
    await ctx.say(A, 'mau donat 35k');
    await ctx.press(A, 'pi:pi1:skip');
    ctx.clear();
    await ctx.press(A, 'pi:pi1:skip');
    await ctx.press(A, 'pi:pi1:buy');
    expect(toasts(ctx.calls)).toEqual([copy.INTENT_DECIDED, copy.INTENT_DECIDED]);
    expect(edits(ctx.calls)).toEqual([]);
    expect(ctx.live()).toEqual([]);
  });
});

describe('expiry (24 h)', () => {
  it('just before: still works', async () => {
    const ctx = wed();
    await ctx.say(A, 'mau donat 35k');
    ctx.clock.now = new Date(WED.getTime() + hours(24) - 1);
    await ctx.press(A, 'pi:pi1:buy');
    expect(ctx.live()).toHaveLength(1);
  });

  it.each(['buy', 'skip'])('after: %s → "udah kadaluarsa", nothing changes', async (op) => {
    const ctx = wed();
    await ctx.say(A, 'mau donat 35k');
    ctx.clock.now = new Date(WED.getTime() + hours(24));
    ctx.clear();
    await ctx.press(A, `pi:pi1:${op}`);
    expect(edits(ctx.calls)).toEqual([copy.EXPIRED]);
    expect(toasts(ctx.calls)).toEqual([copy.EXPIRED]);
    expect(ctx.live()).toEqual([]);
    expect(ctx.db.intents[0]?.status).toBe('PENDING'); // the daily housekeeping marks it EXPIRED
  });
});

describe('cross-user callbacks (SECURITY §3.3)', () => {
  it.each(['buy', 'skip'])('B pressing A’s %s does nothing; A can still decide', async (op) => {
    const ctx = wed();
    await ctx.say(A, 'mau donat 35k');
    ctx.clear();
    await ctx.press(B, `pi:pi1:${op}`);
    expect(ctx.calls.map((c) => c.method)).toEqual(['answerCallbackQuery']);
    expect(toasts(ctx.calls)).toEqual([copy.INTENT_NOT_FOUND]);
    expect(ctx.db.intents[0]?.status).toBe('PENDING');
    expect(ctx.db.txs.filter((t) => t.source === 'BOT')).toEqual([]);

    await ctx.press(A, `pi:pi1:${op}`);
    expect(ctx.db.intents[0]?.status).toBe(op === 'buy' ? 'BOUGHT' : 'SKIPPED');
  });

  it('B pressing A’s [Catat] records nothing, and A’s question stays open', async () => {
    const ctx = wed();
    await ctx.say(A, 'mau makan warteg 15k');
    await ctx.press(B, 'lg:n1');
    expect(ctx.db.txs.filter((t) => t.source === 'BOT')).toEqual([]);
    expect(ctx.db.chatStates.get('u1')?.kind).toBe('CONFIRM_LOG');
  });
});

describe('NEEDS items in a "mau" message: no verdict, [Catat]', () => {
  it('shows the needs remaining; nothing recorded, no intent', async () => {
    const ctx = wed();
    await ctx.say(A, 'mau makan warteg 15k');
    // Needs cumAllowance through S3: 33.333 + 233.333 + 233.333 = 499.999, nothing spent yet.
    expect(replies(ctx.calls)).toEqual([
      'Makan itu kebutuhan pokok, ga perlu izin 😄\nSisa pokok minggu ini Rp499.999, abis ini Rp484.999.\nUdah kebeli? Tap Catat.',
    ]);
    expect(buttons(lastCall(ctx.calls, 'sendMessage'))).toEqual([{ text: '📝 Catat', callback_data: 'lg:n1' }]);
    expect(ctx.db.intents).toEqual([]);
    expect(ctx.live()).toEqual([]);
  });

  it('[Catat] records it like a normal log (once)', async () => {
    const ctx = wed();
    await ctx.say(A, 'mau makan warteg 15k');
    ctx.clear();
    await ctx.press(A, 'lg:n1');
    expect(edits(ctx.calls)).toEqual(['✅ Dicatat: Makan Rp15.000 (pokok)\nSisa pokok minggu ini: Rp484.999']);
    expect(ctx.lastTx()).toMatchObject({
      type: 'EXPENSE',
      amount: 15_000,
      categoryId: 'sys_makan',
      parseMethod: 'RULE',
      note: 'makan warteg',
      rawText: 'mau makan warteg 15k',
      occurredAt: WED,
    });
    await ctx.press(A, 'lg:n1');
    expect(toasts(ctx.calls).at(-1)).toBe(copy.EXPIRED);
    expect(ctx.live()).toHaveLength(1);
  });

  it('without income this month: says so instead of numbers', async () => {
    const ctx = world({ now: WED });
    await ctx.say(A, 'mau bensin 20k');
    expect(replies(ctx.calls)[0]).toBe(
      'Transport itu kebutuhan pokok, ga perlu izin 😄\nSisa budget belum bisa dihitung: uang jajan bulan ini belum dicatat.\nUdah kebeli? Tap Catat.',
    );
  });
});

describe('"mau X" that needs another step first', () => {
  it('unknown item: pick a NEEDS or WANTS category, then the verdict (and the alias is learned)', async () => {
    const ctx = wed();
    await ctx.say(A, 'mau cimol 5k');
    expect(replies(ctx.calls)).toEqual([copy.pickCategory('cimol', 5_000)]);
    const offered = buttons(lastCall(ctx.calls, 'sendMessage')).map((b) => b.callback_data);
    expect(offered).toEqual([
      'pk:n1:sys_makan',
      'pk:n1:sys_transport',
      'pk:n1:sys_belanja_bulanan',
      'pk:n1:sys_kuota',
      'pk:n1:sys_jajan',
      'pk:n1:sys_nongkrong',
      'px:n1',
    ]);
    ctx.clear();
    await ctx.press(A, 'pk:n1:sys_jajan');
    expect(edits(ctx.calls)).toEqual([
      'Gas! 🛒 Jajanmu minggu ini masih Rp60.000, abis ini sisa Rp55.000 buat 4 hari. Santuy.',
    ]);
    expect(buttons(lastCall(ctx.calls, 'editMessageText'))).toEqual(purchaseButtons('pi1', '🛒'));
    expect(ctx.db.aliases).toMatchObject([{ keyword: 'cimol', categoryId: 'sys_jajan' }]);
    expect(ctx.live()).toEqual([]);
  });

  it('unknown item picked as NEEDS → the needs reply', async () => {
    const ctx = wed();
    await ctx.say(A, 'mau fotokopi 5k');
    await ctx.press(A, 'pk:n1:sys_belanja_bulanan');
    expect(edits(ctx.calls)[0]).toMatch(/^Belanja Bulanan itu kebutuhan pokok/);
    expect(ctx.db.intents).toEqual([]);
  });

  it('a savings category is not accepted for a "mau X" pick (forged button)', async () => {
    const ctx = wed();
    await ctx.say(A, 'mau cimol 5k');
    await ctx.press(A, 'pk:n1:sys_nabung');
    expect(edits(ctx.calls)).toEqual([copy.EXPIRED]);
    expect(ctx.db.intents).toEqual([]);
    expect(ctx.live()).toEqual([]);
  });

  it('missing amount: "mau donat" → "35k" → the verdict', async () => {
    const ctx = wed();
    await ctx.say(A, 'mau donat');
    await ctx.say(A, '35k');
    expect(replies(ctx.calls)).toEqual([copy.askAmount(() => 0), expect.stringMatching(/^Hmm bisa sih/)]);
    expect(ctx.db.intents).toMatchObject([{ amount: 35_000, verdict: 'CAUTION' }]);
  });
});
