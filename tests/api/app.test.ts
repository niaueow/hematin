import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '@server/app.js';
import type { ErrorBody } from '@server/lib/errors.js';

const errorCode = (res: request.Response) => (res.body as ErrorBody).error.code;

describe('Express app', () => {
  const app = createApp({ version: 'test123' });

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
    const res = await request(app).get(path);
    expect(res.status).toBe(501);
    expect(errorCode(res)).toBe('NOT_IMPLEMENTED');
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
