import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '@server/app.js';
import { APP_URL, authWorld } from '../auth/fakes.js';
import type { ErrorBody } from '@server/lib/errors.js';

const errorCode = (res: request.Response) => (res.body as ErrorBody).error.code;

const CRON_SECRET = 'c'.repeat(32);
const incomeReminder = vi.fn(() => Promise.resolve({ sent: 1 }));
const dailyReminder = vi.fn(() => Promise.resolve({ sent: 2 }));
const weeklyRecap = vi.fn(() => Promise.resolve({ sent: 3 }));
const jobs = { dailyReminder, weeklyRecap, incomeReminder };
const WEBHOOK_SECRET = 'w'.repeat(32);
const handleUpdate = vi.fn(() => Promise.resolve());

describe('Express app', () => {
  const app = createApp({
    version: 'test123',
    cron: { secret: CRON_SECRET, ...jobs },
    telegram: { webhookSecret: WEBHOOK_SECRET, handleUpdate },
    auth: { auth: authWorld().auth, appUrl: APP_URL },
  });

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/health returns ok and the version', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, version: 'test123' });
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it.each([
    ['GET', '/api/nope'],
    ['POST', '/api/health/extra'],
    ['GET', '/api'],
  ] as const)('%s %s returns a JSON 404', async (method, path) => {
    const res = await request(app)[method === 'GET' ? 'get' : 'post'](path);
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });

  describe('cron auth (Authorization: Bearer CRON_SECRET)', () => {
    it.each([
      ['missing', undefined],
      ['wrong secret', `Bearer ${'x'.repeat(32)}`],
      ['no Bearer prefix', CRON_SECRET],
      ['secret with extra text', `Bearer ${CRON_SECRET}x`],
    ])('%s → 401, no job runs', async (_name, header) => {
      Object.values(jobs).forEach((job) => job.mockClear());
      for (const path of ['daily-reminder', 'weekly-recap', 'income-reminder']) {
        const req = request(app).get(`/api/cron/${path}`);
        const res = await (header === undefined ? req : req.set('authorization', header));
        expect(res.status).toBe(401);
        expect(errorCode(res)).toBe('UNAUTHORIZED');
      }
      Object.values(jobs).forEach((job) => expect(job).not.toHaveBeenCalled());
    });

    it.each([
      ['daily-reminder', dailyReminder, { sent: 2 }],
      ['weekly-recap', weeklyRecap, { sent: 3 }],
      ['income-reminder', incomeReminder, { sent: 1 }],
    ] as const)('correct secret runs %s and returns its stats', async (path, job, stats) => {
      job.mockClear();
      const res = await request(app).get(`/api/cron/${path}`).set('authorization', `Bearer ${CRON_SECRET}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, stats });
      expect(job).toHaveBeenCalledTimes(1);
      expect((job.mock.calls[0] as unknown as [Date])[0]).toBeInstanceOf(Date);
    });
  });

  it('rejects malformed JSON with a JSON 400', async () => {
    const res = await request(app).post('/api/health').set('content-type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(errorCode(res)).toBe('BAD_JSON');
  });

  it('rejects bodies over 100kb with a JSON 413', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ pad: 'x'.repeat(101 * 1024) }));
    expect(res.status).toBe(413);
    expect(errorCode(res)).toBe('PAYLOAD_TOO_LARGE');
  });

  it('never logs the query string', async () => {
    const log = vi.mocked(console.log);
    await request(app).get('/api/health?token=supersecret');
    const output = log.mock.calls.flat().join('\n');
    expect(output).toContain('"path":"/api/health"');
    expect(output).not.toContain('supersecret');
  });

  describe('POST /api/telegram/webhook (SECURITY §2)', () => {
    const update = {
      update_id: 1001,
      message: { message_id: 1, date: 0, chat: { id: 1, type: 'private' }, text: 'halo' },
    };
    const post = () => request(app).post('/api/telegram/webhook').set('content-type', 'application/json');

    it.each([
      ['missing', undefined],
      ['wrong', 'x'.repeat(32)],
      ['almost right', `${WEBHOOK_SECRET}x`],
    ])('%s secret header → 401 and the update is never handled', async (_name, header) => {
      handleUpdate.mockClear();
      const req = post();
      const res = await (header === undefined ? req : req.set('x-telegram-bot-api-secret-token', header)).send(update);
      expect(res.status).toBe(401);
      expect(errorCode(res)).toBe('UNAUTHORIZED');
      expect(handleUpdate).not.toHaveBeenCalled();
    });

    it('correct secret → the update is handled before the 200', async () => {
      handleUpdate.mockClear();
      const res = await post().set('x-telegram-bot-api-secret-token', WEBHOOK_SECRET).send(update);
      expect(res.status).toBe(200);
      expect(handleUpdate).toHaveBeenCalledWith(update);
    });

    it('a body that is not an update → 400', async () => {
      handleUpdate.mockClear();
      const res = await post().set('x-telegram-bot-api-secret-token', WEBHOOK_SECRET).send({ hello: 1 });
      expect(res.status).toBe(400);
      expect(handleUpdate).not.toHaveBeenCalled();
    });

    it('a failing handler → 500 (Telegram retries; idempotency drops the duplicate)', async () => {
      handleUpdate.mockRejectedValueOnce(new Error('db down'));
      const res = await post().set('x-telegram-bot-api-secret-token', WEBHOOK_SECRET).send(update);
      expect(res.status).toBe(500);
      expect(errorCode(res)).toBe('INTERNAL');
    });
  });
});
