import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

// Telegram Mini App initData (SECURITY §3.1). Checked against the Telegram Mini Apps docs ("Validating data
// received via the Mini App") on 2026-10-31:
//   data_check_string = every received field except `hash`, as key=value, sorted by key, joined by "\n"
//                       (the newer `signature` field stays in: it's only excluded for third-party Ed25519 checks)
//   secret_key        = HMAC_SHA256(key = "WebAppData", msg = bot token)
//   hash              = hex(HMAC_SHA256(key = secret_key, msg = data_check_string))
// The hash is compared in constant time; auth_date must be at most 24 h old. Never log the raw initData.

export const INIT_DATA_MAX_AGE_MS = 24 * 3_600_000;
/** Clock skew we tolerate for an auth_date slightly in the future. */
const MAX_FUTURE_SKEW_MS = 60_000;

const TelegramUser = z.looseObject({
  id: z.number().int().positive(),
  first_name: z.string().optional(),
  username: z.string().optional(),
});

export type InitDataUser = { telegramId: bigint; firstName: string | null; username: string | null };

export type InitDataResult =
  | { ok: true; user: InitDataUser; authDate: Date }
  | { ok: false; reason: 'MALFORMED' | 'BAD_HASH' | 'EXPIRED' | 'NO_USER' };

/** The data_check_string, or null if a field appears twice (Telegram never sends that). */
export function dataCheckString(params: URLSearchParams): string | null {
  const entries = [...params.entries()].filter(([key]) => key !== 'hash');
  if (new Set(entries.map(([key]) => key)).size !== entries.length) return null;
  return entries
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

export function initDataHash(checkString: string, botToken: string): string {
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  return createHmac('sha256', secret).update(checkString).digest('hex');
}

export function verifyInitData(
  raw: string,
  botToken: string,
  now: Date,
  maxAgeMs: number = INIT_DATA_MAX_AGE_MS,
): InitDataResult {
  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  const checkString = dataCheckString(params);
  if (!hash || !/^[0-9a-f]{64}$/.test(hash) || checkString === null) return { ok: false, reason: 'MALFORMED' };

  const expected = Buffer.from(initDataHash(checkString, botToken), 'hex');
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return { ok: false, reason: 'BAD_HASH' };

  // Only now, with the data authentic, look at what it says.
  const authDate = Number(params.get('auth_date'));
  if (!Number.isSafeInteger(authDate) || authDate <= 0) return { ok: false, reason: 'MALFORMED' };
  const age = now.getTime() - authDate * 1000;
  if (age > maxAgeMs || age < -MAX_FUTURE_SKEW_MS) return { ok: false, reason: 'EXPIRED' };

  let user: z.infer<typeof TelegramUser>;
  try {
    user = TelegramUser.parse(JSON.parse(params.get('user') ?? 'null'));
  } catch {
    return { ok: false, reason: 'NO_USER' };
  }
  return {
    ok: true,
    user: { telegramId: BigInt(user.id), firstName: user.first_name ?? null, username: user.username ?? null },
    authDate: new Date(authDate * 1000),
  };
}
