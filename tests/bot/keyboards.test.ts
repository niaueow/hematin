import { describe, expect, it } from 'vitest';
import {
  categoryKeyboard,
  encodeCallback,
  MAX_CALLBACK_BYTES,
  parseCallback,
  type CallbackAction,
} from '@server/bot/keyboards.js';

// Telegram allows 64 bytes of callback data (ARCHITECTURE §3.2), and button data is untrusted input.

const cuid = 'cmh1x2y3z4a5b6c7d8e9f0g1h'; // 25 characters, like a Prisma cuid()

describe('callback data', () => {
  it.each<[CallbackAction, string]>([
    [{ kind: 'tx', txId: cuid, op: 'cat' }, `tx:${cuid}:cat`],
    [{ kind: 'tx', txId: cuid, op: 'del' }, `tx:${cuid}:del`],
    [{ kind: 'setCategory', txId: cuid, categoryId: 'sys_belanja_bulanan' }, `tc:${cuid}:sys_belanja_bulanan`],
    [{ kind: 'setCategory', txId: cuid, categoryId: cuid }, `tc:${cuid}:${cuid}`],
    [{ kind: 'pick', nonce: 'AbC_-123', categoryId: cuid }, `pk:AbC_-123:${cuid}`],
    [{ kind: 'pickCancel', nonce: 'AbC_-123' }, 'px:AbC_-123'],
    [{ kind: 'amount', nonce: 'AbC_-123', confirmed: true }, 'am:AbC_-123:y'],
    [{ kind: 'amount', nonce: 'AbC_-123', confirmed: false }, 'am:AbC_-123:n'],
    [{ kind: 'intent', intentId: cuid, op: 'buy' }, `pi:${cuid}:buy`],
    [{ kind: 'intent', intentId: cuid, op: 'skip' }, `pi:${cuid}:skip`],
    [{ kind: 'logNeeds', nonce: 'AbC_-123' }, 'lg:AbC_-123'],
  ])('%j ⇄ %s (≤ 64 bytes)', (action, data) => {
    expect(encodeCallback(action)).toBe(data);
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(MAX_CALLBACK_BYTES);
    expect(parseCallback(data)).toEqual(action);
  });

  it('refuses to build data over 64 bytes', () => {
    expect(() => encodeCallback({ kind: 'setCategory', txId: 'x'.repeat(40), categoryId: 'y'.repeat(40) })).toThrow(
      RangeError,
    );
  });

  it.each([
    'pi:1:maybe',
    'lg:',
    'tx:abc:drop',
    'tx:abc',
    'tx:a b:del',
    'tx:../x:del',
    `tx:${'x'.repeat(41)}:del`,
    'am:n1:yes',
    'pk:n1:',
    '',
  ])('rejects %j', (data) => {
    expect(parseCallback(data)).toBeNull();
  });
});

describe('categoryKeyboard', () => {
  it('two per row, then cancel on its own row', () => {
    const categories = (['a', 'b', 'c'] as const).map((id) => ({
      id,
      name: id.toUpperCase(),
      bucket: 'NEEDS' as const,
    }));
    const keyboard = categoryKeyboard(categories, (id) => `pk:n:${id}`, 'px:n');
    expect(
      keyboard.inline_keyboard.map((row) => row.map((b) => (b as { callback_data: string }).callback_data)),
    ).toEqual([['pk:n:a', 'pk:n:b'], ['pk:n:c'], ['px:n']]);
    expect(keyboard.inline_keyboard[0]?.[0]?.text).toBe('A · pokok');
  });
});
