import { createHash, timingSafeEqual } from 'node:crypto';

// Secret comparisons in constant time (AGENTS.md rule 12). Hashing first gives timingSafeEqual
// equal-length inputs, so the length of the secret doesn't leak either.

const digest = (value: string) => createHash('sha256').update(value).digest();

export function constantTimeEquals(given: string, expected: string): boolean {
  return timingSafeEqual(digest(given), digest(expected));
}

/** sha256 hex, for storing invite codes and tokens (only the hash is stored). */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
