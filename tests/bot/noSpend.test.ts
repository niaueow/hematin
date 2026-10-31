import { describe, expect, it } from 'vitest';
import * as copy from '@server/bot/copy.js';
import { edits, person, toasts, world } from './harness.js';

// The daily reminder's [✅ Hari ini emang ga keluar duit] button (ns:<date>), through the real bot.
// 21:30 WIB on Mon 2 Nov 2026.

const A = person(111, 'Nia');
const B = person(222, 'Rani');
const now = new Date('2026-11-02T14:30:00.000Z');

describe('[✅ Hari ini emang ga keluar duit]', () => {
  it('records a NoSpendDay for today, for whoever pressed it, and says so', async () => {
    const ctx = world({ now, income: true });
    await ctx.press(A, 'ns:2026-11-02');
    expect(ctx.db.noSpendDays).toEqual([{ userId: 'u1', localDate: '2026-11-02' }]);
    expect(edits(ctx.calls)).toEqual([copy.noSpendMarked(null)]);

    await ctx.press(A, 'ns:2026-11-02'); // twice: still one row
    expect(ctx.db.noSpendDays).toHaveLength(1);

    await ctx.press(B, 'ns:2026-11-02'); // only ever the caller's own day
    expect(ctx.db.noSpendDays).toEqual([
      { userId: 'u1', localDate: '2026-11-02' },
      { userId: 'u2', localDate: '2026-11-02' },
    ]);
  });

  it('an older reminder’s button (within a week) marks that day', async () => {
    const ctx = world({ now, income: true });
    await ctx.press(A, 'ns:2026-10-30');
    expect(ctx.db.noSpendDays).toEqual([{ userId: 'u1', localDate: '2026-10-30' }]);
    expect(edits(ctx.calls)).toEqual(['Sip, 30 Okt dicatat ga keluar duit 👍']);
  });

  it.each([
    ['in the future', 'ns:2026-11-03'],
    ['over a week old', 'ns:2026-10-25'],
  ])('a date %s → "udah kadaluarsa", nothing recorded', async (_name, data) => {
    const ctx = world({ now, income: true });
    await ctx.press(A, data);
    expect(toasts(ctx.calls)).toEqual([copy.EXPIRED]);
    expect(ctx.db.noSpendDays).toEqual([]);
  });

  it('a date that doesn’t exist is only acknowledged', async () => {
    const ctx = world({ now, income: true });
    await ctx.press(A, 'ns:2026-02-30');
    expect(ctx.calls.map((c) => c.method)).toEqual(['answerCallbackQuery']);
    expect(ctx.db.noSpendDays).toEqual([]);
  });
});
