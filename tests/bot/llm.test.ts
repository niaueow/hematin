import { describe, expect, it, vi } from 'vitest';
import type { Classify, LlmLog } from '@server/bot/flows.js';
import * as copy from '@server/bot/copy.js';
import type { LlmResult } from '@server/nlp/groq.js';
import { buttons, edits, lastCall, MON, person, replies, toasts, world } from './harness.js';

// M7: categorize step 3 inside the bot. The classifier is a fake (the Groq client itself is tested in
// tests/nlp/groq.test.ts); here: when it's asked, what happens with its answer, the quota, and the logs.

const A = person(111, 'Nia');

function withLlm(answers: LlmResult | ((text: string) => LlmResult), options: { dailyLimit?: number } = {}) {
  const classify = vi.fn<Classify>((text) => Promise.resolve(typeof answers === 'function' ? answers(text) : answers));
  const logs: LlmLog[] = [];
  const ctx = world({
    income: true,
    llm: { classify, dailyLimit: options.dailyLimit ?? 50, log: (entry) => logs.push(entry) },
  });
  return { ...ctx, classify, logs };
}

const groceries: LlmResult = { ok: true, slug: 'belanja-bulanan' };

describe('step 3: an item no rule or alias knows', () => {
  it('"indomaret 30k" → the LLM’s category, recorded as LLM, with 👍 / ✏️ / ↩️', async () => {
    const ctx = withLlm(groceries);
    await ctx.say(A, 'indomaret 30k');
    // Only the normalized text, and only categories that fit the intent (no income).
    expect(ctx.classify).toHaveBeenCalledTimes(1);
    const [text, categories] = ctx.classify.mock.calls[0] as Parameters<Classify>;
    expect(text).toBe('indomaret 30k');
    expect(categories.map((c) => c.slug)).toEqual([
      'makan',
      'transport',
      'belanja-bulanan',
      'kuota',
      'jajan',
      'nongkrong',
      'nabung',
    ]);
    expect(ctx.lastTx()).toMatchObject({
      type: 'EXPENSE',
      amount: 30_000,
      categoryId: 'sys_belanja_bulanan',
      parseMethod: 'LLM',
      note: 'indomaret',
    });
    expect(replies(ctx.calls)).toEqual([
      '✅ Dicatat: Belanja Bulanan Rp30.000 (pokok)\nSisa pokok minggu ini: Rp236.666',
    ]);
    const id = ctx.lastTx().id;
    expect(buttons(lastCall(ctx.calls, 'sendMessage'))).toEqual([
      { text: '👍 Bener', callback_data: `tx:${id}:ok` },
      { text: copy.BUTTON.changeCategory, callback_data: `tx:${id}:cat` },
      { text: copy.BUTTON.undo, callback_data: `tx:${id}:undo` },
    ]);
  });

  it('👍 confirms it: the alias is saved, so the same item skips the LLM next time', async () => {
    const ctx = withLlm(groceries);
    await ctx.say(A, 'indomaret 30k');
    const id = ctx.lastTx().id;
    await ctx.press(A, `tx:${id}:ok`);
    expect(toasts(ctx.calls).at(-1)).toBe(copy.CATEGORY_CONFIRMED);
    expect(buttons(lastCall(ctx.calls, 'editMessageReplyMarkup')).map((b) => b.callback_data)).toEqual([
      `tx:${id}:cat`,
      `tx:${id}:undo`,
    ]);
    expect(ctx.db.aliases).toMatchObject([{ userId: 'u1', keyword: 'indomaret', categoryId: 'sys_belanja_bulanan' }]);

    await ctx.say(A, 'indomaret 25k');
    expect(ctx.classify).toHaveBeenCalledTimes(1);
    expect(ctx.lastTx()).toMatchObject({ categoryId: 'sys_belanja_bulanan', parseMethod: 'ALIAS' });
  });

  it('✏️ correcting it saves the alias too', async () => {
    const ctx = withLlm(groceries);
    await ctx.say(A, 'indomaret 30k');
    await ctx.press(A, `tc:${ctx.lastTx().id}:sys_jajan`);
    await ctx.say(A, 'indomaret 12k');
    expect(ctx.classify).toHaveBeenCalledTimes(1);
    expect(ctx.lastTx()).toMatchObject({ categoryId: 'sys_jajan', parseMethod: 'ALIAS' });
  });

  it('a savings category makes it a SAVING; "mau X" gets the verdict for the LLM’s category', async () => {
    const ctx = withLlm((text) =>
      text.startsWith('mau') ? { ok: true, slug: 'jajan' } : { ok: true, slug: 'nabung' },
    );
    await ctx.say(A, 'crypto 100k');
    expect(ctx.lastTx()).toMatchObject({ type: 'SAVING', categoryId: 'sys_nabung', parseMethod: 'LLM' });
    await ctx.say(A, 'mau cimol 5k');
    expect(ctx.db.intents).toMatchObject([{ item: 'cimol', categoryId: 'sys_jajan', verdict: 'ALLOW' }]);
  });

  it('a slug the user can’t use (defence in depth) → category buttons', async () => {
    const ctx = withLlm({ ok: true, slug: 'uang-jajan' });
    await ctx.say(A, 'indomaret 30k');
    expect(replies(ctx.calls)).toEqual([copy.pickCategory('indomaret', 30_000)]);
    expect(ctx.logs).toEqual([{ parseMethod: 'USER_PICK', outcome: 'ok', latencyMs: expect.any(Number) as number }]);
  });
});

describe('any failure → category buttons (USER_PICK); recording never fails because of Groq', () => {
  it.each<LlmResult>([
    { ok: false, reason: 'INVALID_SLUG' },
    { ok: false, reason: 'MALFORMED' },
    { ok: false, reason: 'TIMEOUT' },
    { ok: false, reason: 'RATE_LIMITED', status: 429 },
    { ok: false, reason: 'HTTP_ERROR', status: 500 },
    { ok: false, reason: 'NETWORK' },
    { ok: false, reason: 'UNKNOWN' },
    { ok: false, reason: 'LOW_CONFIDENCE' },
  ])('%j', async (result) => {
    const ctx = withLlm(result);
    await ctx.say(A, 'indomaret 30k');
    expect(replies(ctx.calls)).toEqual([copy.pickCategory('indomaret', 30_000)]);
    expect(ctx.logs).toEqual([
      { parseMethod: 'USER_PICK', outcome: result.ok ? 'ok' : result.reason, latencyMs: expect.any(Number) as number },
    ]);

    // The pick records it and learns the alias, so the LLM isn't asked about it again.
    await ctx.press(A, 'pk:n1:sys_belanja_bulanan');
    expect(ctx.lastTx()).toMatchObject({ categoryId: 'sys_belanja_bulanan', parseMethod: 'USER_PICK' });
    await ctx.say(A, 'indomaret 20k');
    expect(ctx.classify).toHaveBeenCalledTimes(1);
  });

  it('a classifier that throws anyway still ends in category buttons', async () => {
    const ctx = world({
      income: true,
      llm: { classify: () => Promise.reject(new Error('boom')), dailyLimit: 50, log: () => undefined },
    });
    await ctx.say(A, 'indomaret 30k');
    expect(replies(ctx.calls)).toEqual([copy.pickCategory('indomaret', 30_000)]);
  });
});

describe('when the LLM is not asked', () => {
  it.each([
    ['a rule hit', 'warteg 10k'],
    ['income (trigger words; no category is fine)', 'gajian 3jt'],
    ['no amount', 'indomaret'],
    ['an ambiguous amount (asked after the confirmation)', 'indomaret 30'],
    ['two amounts', 'indomaret 30k sama 20k'],
  ])('%s', async (_name, message) => {
    const ctx = withLlm(groceries);
    await ctx.say(A, message);
    expect(ctx.classify).not.toHaveBeenCalled();
    expect(ctx.db.rate.has('llm:u1:2026-11-02')).toBe(false); // no quota used either
  });

  it('after "Maksudnya Rp30.000?" → Iya, it is', async () => {
    const ctx = withLlm(groceries);
    await ctx.say(A, 'indomaret 30');
    await ctx.press(A, 'am:n1:y');
    expect(ctx.classify).toHaveBeenCalledWith('indomaret 30000', expect.any(Array));
    expect(edits(ctx.calls)[0]).toMatch(/^✅ Dicatat: Belanja Bulanan Rp30\.000/);
  });
});

describe('daily quota: LLM_DAILY_LIMIT_PER_USER (RateLimit llm:<userId>:<WIB date>)', () => {
  it('over the limit → no call, straight to the buttons; a new WIB day resets it', async () => {
    const ctx = withLlm(groceries, { dailyLimit: 2 });
    for (const item of ['indomaret', 'alfamart', 'lawson']) await ctx.say(A, `${item} 10k`);
    expect(ctx.classify).toHaveBeenCalledTimes(2);
    expect(replies(ctx.calls).at(-1)).toBe(copy.pickCategory('lawson', 10_000));
    expect(ctx.logs.at(-1)).toEqual({ parseMethod: 'USER_PICK', outcome: 'QUOTA', latencyMs: 0 });

    ctx.clock.now = new Date('2026-11-02T17:00:00.000Z'); // 00:00 WIB, 3 Nov
    await ctx.say(A, 'circle k 10k');
    expect(ctx.classify).toHaveBeenCalledTimes(3);
    expect(ctx.db.rate.get('llm:u1:2026-11-03')).toBe(1);
  });
});

describe('logs: parse method, outcome and latency only', () => {
  it('never the message text', async () => {
    const ctx = withLlm(groceries);
    await ctx.say(A, 'indomaret rahasia 30k');
    expect(ctx.logs).toEqual([{ parseMethod: 'LLM', outcome: 'ok', latencyMs: expect.any(Number) as number }]);
    expect(JSON.stringify(ctx.logs)).not.toMatch(/indomaret|rahasia|30/);
  });

  it('no LLM configured → nothing is logged and unknown items go to the buttons (M5 behaviour)', async () => {
    const ctx = world({ now: MON, income: true });
    await ctx.say(A, 'indomaret 30k');
    expect(replies(ctx.calls)).toEqual([copy.pickCategory('indomaret', 30_000)]);
  });
});
