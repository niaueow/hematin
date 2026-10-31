import { describe, expect, it } from 'vitest';
import { formatRupiah } from '@server/lib/money.js';

describe('formatRupiah', () => {
  it.each([
    [0, 'Rp0'],
    [500, 'Rp500'],
    [6_250, 'Rp6.250'],
    [35_000, 'Rp35.000'],
    [1_500_000, 'Rp1.500.000'],
    [100_000_000, 'Rp100.000.000'],
    [-12_000, '-Rp12.000'],
  ])('%i → %s', (amount, expected) => {
    expect(formatRupiah(amount)).toBe(expected);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s (money is integer rupiah)', (amount) => {
    expect(() => formatRupiah(amount)).toThrow(RangeError);
  });
});
