import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '@server/app.js';
import { MAGIC_LINKS_PER_HOUR } from '@server/auth/service.js';
import type { ErrorBody } from '@server/lib/errors.js';
import { sha256Hex } from '@server/lib/secrets.js';
import { APP_URL, authWorld, initDataFor } from '../auth/fakes.js';
import { dashboardDeps } from './harness.js';

// Dashboard auth end to end (SECURITY §3, API.md): Express app + real auth service + in-memory repos.

const errorCode = (res: request.Response) => (res.body as ErrorBody).error.code;
const minutes = (n: number) => n * 60_000;

function setup() {
  const world = authWorld();
  const app = createApp({
    version: 'test',
    cron: {
      secret: 'c'.repeat(32),
      dailyReminder: vi.fn(),
      weeklyRecap: vi.fn(),
      incomeReminder: vi.fn(),
    },
    telegram: { webhookSecret: 'w'.repeat(32), handleUpdate: vi.fn() },
    auth: { auth: world.auth, appUrl: APP_URL },
    dashboard: dashboardDeps(),
  });
  /** POST /api/auth/magic the way the SPA does it (same origin, X-Requested-With). */
  const redeem = (token: string, ip = '203.0.113.1') =>
    request(app)
      .post('/api/auth/magic')
      .set('origin', APP_URL)
      .set('x-requested-with', 'fetch')
      .set('x-real-ip', ip)
      .send({ token });
  /** /dashboard for user u1, through the service, returning the token from the link. */
  const magicToken = async (userId = 'u1') => {
    const link = await world.auth.createMagicLink(userId);
    return new URL(link?.url ?? '').searchParams.get('token') as string;
  };
  const sessionCookie = (res: request.Response) => {
    const header = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0] ?? '';
    return /^(__Host-session=[^;]+)/.exec(header)?.[1] ?? '';
  };
  return { ...world, app, redeem, magicToken, sessionCookie };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('magic link (/dashboard → /auth?token=… → POST /api/auth/magic)', () => {
  it('/dashboard: a 5-minute single-use link; only its sha256 is stored', async () => {
    const ctx = setup();
    const link = await ctx.auth.createMagicLink('u1');
    expect(link).toEqual({ url: `${APP_URL}/auth?token=tok${'0'.repeat(39)}1`, ttlMinutes: 5 });
    const token = new URL(link?.url ?? '').searchParams.get('token') as string;
    expect(ctx.db.magic).toEqual([
      {
        userId: 'u1',
        tokenHash: sha256Hex(token),
        expiresAt: new Date(ctx.clock.now.getTime() + minutes(5)),
        usedAt: null,
        createdAt: ctx.clock.now,
      },
    ]);
    expect(JSON.stringify(ctx.db.magic)).not.toContain(token);
  });

  it('POST consumes it, sets the __Host-session cookie, and returns the user', async () => {
    const ctx = setup();
    const res = await ctx.redeem(await ctx.magicToken());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: {
        id: 'u1',
        firstName: 'Nia',
        telegramUsername: 'nia',
        role: 'OWNER',
        needsPct: 50,
        wantsPct: 30,
        savingsPct: 20,
      },
    });
    expect(res.headers['set-cookie']).toEqual([
      `__Host-session=tok${'0'.repeat(39)}2; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`,
    ]);
    // Only the hash is stored; the session lasts 30 days.
    expect(ctx.db.sessions).toMatchObject([
      { userId: 'u1', tokenHash: sha256Hex(`tok${'0'.repeat(39)}2`), expiresAt: new Date('2026-12-02T03:00:00.000Z') },
    ]);
  });

  it('is single use: the second POST fails and creates no session', async () => {
    const ctx = setup();
    const token = await ctx.magicToken();
    expect((await ctx.redeem(token)).status).toBe(200);
    const again = await ctx.redeem(token);
    expect(again.status).toBe(401);
    expect(errorCode(again)).toBe('INVALID_TOKEN');
    expect(again.headers['set-cookie']).toBeUndefined();
    expect(ctx.db.sessions).toHaveLength(1);
  });

  it('expires after 5 minutes', async () => {
    const ctx = setup();
    const token = await ctx.magicToken();
    ctx.clock.now = new Date(ctx.clock.now.getTime() + minutes(5));
    expect((await ctx.redeem(token)).status).toBe(401);
    expect(ctx.db.sessions).toEqual([]);
  });

  it('a GET never consumes it (link-preview crawlers): /auth is the SPA, the API has no GET route', async () => {
    const ctx = setup();
    const token = await ctx.magicToken();
    expect((await request(ctx.app).get(`/api/auth/magic?token=${token}`)).status).toBe(404);
    expect(ctx.db.magic[0]?.usedAt).toBeNull();
    expect((await ctx.redeem(token)).status).toBe(200);
  });

  it.each([
    ['an unknown token', 'x'.repeat(43)],
    ['a malformed token', 'short'],
  ])('%s → 401', async (_name, token) => {
    const ctx = setup();
    expect((await ctx.redeem(token)).status).toBe(401);
  });

  it('a disabled user’s link doesn’t log anyone in', async () => {
    const ctx = setup();
    const res = await ctx.redeem(await ctx.magicToken('u3'));
    expect(res.status).toBe(401);
    expect(ctx.db.sessions).toEqual([]);
  });

  it(`at most ${MAGIC_LINKS_PER_HOUR} links per user per hour`, async () => {
    const ctx = setup();
    for (let i = 0; i < MAGIC_LINKS_PER_HOUR; i++) expect(await ctx.auth.createMagicLink('u1')).not.toBeNull();
    expect(await ctx.auth.createMagicLink('u1')).toBeNull();
    expect(await ctx.auth.createMagicLink('u2')).not.toBeNull(); // per user
    ctx.clock.now = new Date(ctx.clock.now.getTime() + minutes(61)); // the window is the last hour
    expect(await ctx.auth.createMagicLink('u1')).not.toBeNull();
  });

  it('at most 20 attempts per IP per 10 minutes (then 429, even for a good token)', async () => {
    const ctx = setup();
    for (let i = 0; i < 20; i++) expect((await ctx.redeem('x'.repeat(43))).status).toBe(401);
    const blocked = await ctx.redeem(await ctx.magicToken());
    expect(blocked.status).toBe(429);
    expect(errorCode(blocked)).toBe('RATE_LIMITED');
    expect((await ctx.redeem(await ctx.magicToken(), '198.51.100.7')).status).toBe(200); // another IP
  });

  it('needs the CSRF headers too (no logging someone into another account from a foreign page)', async () => {
    const ctx = setup();
    const token = await ctx.magicToken();
    const res = await request(ctx.app).post('/api/auth/magic').set('origin', 'https://evil.example').send({ token });
    expect(res.status).toBe(403);
    expect(ctx.db.magic[0]?.usedAt).toBeNull();
  });
});

describe('requireUser: GET /api/me', () => {
  it('Mini App: Authorization: tma <initData> → the user ("Hai <nama>")', async () => {
    const ctx = setup();
    const res = await request(ctx.app)
      .get('/api/me')
      .set('authorization', `tma ${initDataFor(111, ctx.clock.now)}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'u1', firstName: 'Nia' });
  });

  it.each([
    ['tampered user field', (now: Date) => initDataFor(111, now).replace('%22id%22%3A111', '%22id%22%3A222')],
    ['old auth_date', (now: Date) => initDataFor(111, now, 25 * 3600)],
    ['another bot’s token', (now: Date) => initDataFor(111, now, 60, '999:OTHER')],
    ['an unknown Telegram user', (now: Date) => initDataFor(999, now)],
    ['a DISABLED user', (now: Date) => initDataFor(333, now)],
  ])('tma with %s → 401', async (_name, build) => {
    const ctx = setup();
    const res = await request(ctx.app)
      .get('/api/me')
      .set('authorization', `tma ${build(ctx.clock.now)}`);
    expect(res.status).toBe(401);
    expect(errorCode(res)).toBe('UNAUTHORIZED');
  });

  it('browser: the session cookie → the user; lastSeenAt refreshed at most hourly', async () => {
    const ctx = setup();
    const cookie = ctx.sessionCookie(await ctx.redeem(await ctx.magicToken()));
    const created = ctx.db.sessions[0]?.lastSeenAt;

    ctx.clock.now = new Date(ctx.clock.now.getTime() + minutes(59));
    expect((await request(ctx.app).get('/api/me').set('cookie', cookie)).body).toMatchObject({ id: 'u1' });
    expect(ctx.db.sessions[0]?.lastSeenAt).toEqual(created);

    ctx.clock.now = new Date(ctx.clock.now.getTime() + minutes(1));
    await request(ctx.app).get('/api/me').set('cookie', `other=1; ${cookie}`);
    expect(ctx.db.sessions[0]?.lastSeenAt).toEqual(ctx.clock.now);
  });

  it.each([
    ['no credentials', {}],
    ['an unknown cookie', { cookie: '__Host-session=nope' }],
    ['another scheme', { authorization: 'Bearer abc' }],
    ['an empty tma header', { authorization: 'tma ' }],
  ])('%s → 401', async (_name, headers) => {
    const ctx = setup();
    expect((await request(ctx.app).get('/api/me').set(headers)).status).toBe(401);
  });

  it('a session stops working when the user is disabled, or after 30 days', async () => {
    const ctx = setup();
    const cookie = ctx.sessionCookie(await ctx.redeem(await ctx.magicToken()));
    (ctx.db.users[0] as { status: string }).status = 'DISABLED';
    expect((await request(ctx.app).get('/api/me').set('cookie', cookie)).status).toBe(401);

    (ctx.db.users[0] as { status: string }).status = 'ACTIVE';
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 30 * 24 * 3_600_000);
    expect((await request(ctx.app).get('/api/me').set('cookie', cookie)).status).toBe(401);
  });
});

describe('CSRF (API.md "Mutations & CSRF")', () => {
  async function loggedIn() {
    const ctx = setup();
    const cookie = ctx.sessionCookie(await ctx.redeem(await ctx.magicToken()));
    return { ...ctx, cookie };
  }

  it.each([
    ['no X-Requested-With', { origin: APP_URL }],
    ['no Origin', { 'x-requested-with': 'fetch' }],
    ['a foreign Origin', { origin: 'https://evil.example', 'x-requested-with': 'fetch' }],
    ['a look-alike Origin', { origin: `${APP_URL}.evil.example`, 'x-requested-with': 'fetch' }],
  ])('a cookie POST with %s → 403, nothing happens', async (_name, headers) => {
    const ctx = await loggedIn();
    const res = await request(ctx.app).post('/api/auth/logout-all').set('cookie', ctx.cookie).set(headers);
    expect(res.status).toBe(403);
    expect(errorCode(res)).toBe('CSRF');
    expect(ctx.db.sessions[0]?.revokedAt).toBeNull();
  });

  it('GET with a cookie needs no CSRF headers', async () => {
    const ctx = await loggedIn();
    expect((await request(ctx.app).get('/api/me').set('cookie', ctx.cookie)).status).toBe(200);
  });

  it('the tma header can’t be sent cross-site, so a tma POST needs no CSRF headers', async () => {
    const ctx = setup();
    const res = await request(ctx.app)
      .post('/api/auth/logout-all')
      .set('authorization', `tma ${initDataFor(111, ctx.clock.now)}`);
    expect(res.status).toBe(200);
  });
});

describe('logout', () => {
  const csrf = { origin: APP_URL, 'x-requested-with': 'fetch' };

  it('/logout revokes this session and clears the cookie', async () => {
    const ctx = setup();
    const first = ctx.sessionCookie(await ctx.redeem(await ctx.magicToken()));
    const second = ctx.sessionCookie(await ctx.redeem(await ctx.magicToken()));
    const res = await request(ctx.app).post('/api/auth/logout').set('cookie', first).set(csrf);
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toEqual(['__Host-session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0']);
    expect((await request(ctx.app).get('/api/me').set('cookie', first)).status).toBe(401);
    expect((await request(ctx.app).get('/api/me').set('cookie', second)).status).toBe(200);
  });

  it('/logout-all revokes every session of this user only', async () => {
    const ctx = setup();
    const a1 = ctx.sessionCookie(await ctx.redeem(await ctx.magicToken('u1')));
    const a2 = ctx.sessionCookie(await ctx.redeem(await ctx.magicToken('u1')));
    const b = ctx.sessionCookie(await ctx.redeem(await ctx.magicToken('u2')));
    const res = await request(ctx.app).post('/api/auth/logout-all').set('cookie', a1).set(csrf);
    expect(res.body).toEqual({ ok: true, revoked: 2 });
    expect((await request(ctx.app).get('/api/me').set('cookie', a2)).status).toBe(401);
    expect((await request(ctx.app).get('/api/me').set('cookie', b)).status).toBe(200);
  });
});
