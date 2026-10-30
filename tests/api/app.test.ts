import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '@server/app.js';
import type { ErrorBody } from '@server/lib/errors.js';

const errorCode = (res: request.Response) => (res.body as ErrorBody).error.code;

const CRON_SECRET = 'c'.repeat(32);
const incomeReminder = vi.fn(() => Promise.resolve({ sent: 1 }));

describe('Express app', () => {
  const app = createApp({ version: 'test123', cron: { secret: CRON_SECRET, incomeReminder } });

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

  it.each(['/api/cron/daily-reminder', '/api/cron/weekly-recap'])('GET %s returns 501 for now', async (path) => {
    const res = await request(app).get(path).set('authorization', `Bearer ${CRON_SECRET}`);
    expect(res.status).toBe(501);
    expect(errorCode(res)).toBe('NOT_IMPLEMENTED');
  });

  describe('cron auth (Authorization: Bearer CRON_SECRET)', () => {
    it.each([
      ['missing', undefined],
      ['wrong secret', `Bearer ${'x'.repeat(32)}`],
      ['no Bearer prefix', CRON_SECRET],
      ['secret with extra text', `Bearer ${CRON_SECRET}x`],
    ])('%s → 401, job not run', async (_name, header) => {
      incomeReminder.mockClear();
      const req = request(app).get('/api/cron/income-reminder');
      const res = await (header === undefined ? req : req.set('authorization', header));
      expect(res.status).toBe(401);
      expect(errorCode(res)).toBe('UNAUTHORIZED');
      expect(incomeReminder).not.toHaveBeenCalled();
    });

    it('also guards the not-yet-implemented cron routes', async () => {
      expect((await request(app).get('/api/cron/daily-reminder')).status).toBe(401);
    });

    it('correct secret runs the income reminder and returns its stats', async () => {
      incomeReminder.mockClear();
      const res = await request(app).get('/api/cron/income-reminder').set('authorization', `Bearer ${CRON_SECRET}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, stats: { sent: 1 } });
      expect(incomeReminder).toHaveBeenCalledTimes(1);
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
});
