import { describe, expect, it } from 'vitest';
import { dataCheckString, initDataHash, verifyInitData } from '@server/auth/initData.js';
import { BOT_TOKEN, initDataFor, signInitData, userJson } from './fakes.js';

// SECURITY §3.1, against the algorithm in the Telegram Mini Apps docs.

const now = new Date('2026-11-02T03:00:00.000Z');
const nowS = Math.floor(now.getTime() / 1000);

describe('verifyInitData', () => {
  it('valid initData → the Telegram user', () => {
    expect(verifyInitData(initDataFor(111, now), BOT_TOKEN, now)).toEqual({
      ok: true,
      user: { telegramId: 111n, firstName: 'Nia', username: 'nia' },
      authDate: new Date((nowS - 60) * 1000),
    });
  });

  it('a tampered user field → BAD_HASH (someone else’s id)', () => {
    const params = new URLSearchParams(initDataFor(111, now));
    params.set('user', userJson(222, 'Rani'));
    expect(verifyInitData(params.toString(), BOT_TOKEN, now)).toEqual({ ok: false, reason: 'BAD_HASH' });
  });

  it.each(['auth_date', 'query_id', 'signature'])('any other tampered field (%s) → BAD_HASH', (field) => {
    const params = new URLSearchParams(initDataFor(111, now));
    params.set(field, `${params.get(field)}1`);
    expect(verifyInitData(params.toString(), BOT_TOKEN, now)).toEqual({ ok: false, reason: 'BAD_HASH' });
  });

  it('an added field → BAD_HASH', () => {
    expect(verifyInitData(`${initDataFor(111, now)}&start_param=x`, BOT_TOKEN, now)).toEqual({
      ok: false,
      reason: 'BAD_HASH',
    });
  });

  it('signed with another bot’s token → BAD_HASH', () => {
    expect(verifyInitData(initDataFor(111, now, 60, '999:OTHER'), BOT_TOKEN, now)).toEqual({
      ok: false,
      reason: 'BAD_HASH',
    });
  });

  it.each([
    ['just under 24 h old', 24 * 3600 - 1, true],
    ['exactly 24 h old', 24 * 3600, true],
    ['over 24 h old', 24 * 3600 + 1, false],
    ['a day and a half old', 36 * 3600, false],
    ['a little in the future (clock skew)', -30, true],
    ['far in the future', -3600, false],
  ])('auth_date %s → ok %s', (_name, ageSeconds, ok) => {
    const result = verifyInitData(initDataFor(111, now, ageSeconds), BOT_TOKEN, now);
    expect(result.ok).toBe(ok);
    if (!result.ok) expect(result.reason).toBe('EXPIRED');
  });

  it.each([
    ['empty', ''],
    ['no hash', 'auth_date=1&user=%7B%7D'],
    ['a hash that isn’t hex', `${initDataFor(111, now).replace(/hash=[0-9a-f]+/, 'hash=zz')}`],
    [
      'an uppercase hash',
      initDataFor(111, now).replace(/hash=([0-9a-f]+)/, (_m, h: string) => `hash=${h.toUpperCase()}`),
    ],
    ['a duplicated field', `${initDataFor(111, now)}&user=${encodeURIComponent(userJson(222))}`],
  ])('malformed (%s) → MALFORMED', (_name, raw) => {
    expect(verifyInitData(raw, BOT_TOKEN, now)).toEqual({ ok: false, reason: 'MALFORMED' });
  });

  it('a correctly signed payload without auth_date → MALFORMED; without a usable user → NO_USER', () => {
    expect(verifyInitData(signInitData({ user: userJson(111) }), BOT_TOKEN, now)).toEqual({
      ok: false,
      reason: 'MALFORMED',
    });
    expect(verifyInitData(signInitData({ auth_date: String(nowS) }), BOT_TOKEN, now)).toEqual({
      ok: false,
      reason: 'NO_USER',
    });
    expect(verifyInitData(signInitData({ auth_date: String(nowS), user: '{"id":"111"}' }), BOT_TOKEN, now)).toEqual({
      ok: false,
      reason: 'NO_USER',
    });
  });

  it('the data_check_string: every field but hash, sorted, key=value, joined by \\n (signature included)', () => {
    const params = new URLSearchParams('user=U&hash=H&auth_date=1&signature=S&query_id=Q');
    expect(dataCheckString(params)).toBe('auth_date=1\nquery_id=Q\nsignature=S\nuser=U');
  });

  it('matches an independently computed HMAC (secret = HMAC("WebAppData", token))', async () => {
    const { createHmac } = await import('node:crypto');
    const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    expect(initDataHash('a=1\nb=2', BOT_TOKEN)).toBe(createHmac('sha256', secret).update('a=1\nb=2').digest('hex'));
  });
});
