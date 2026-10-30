import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from '@server/env.js';

const valid = {
  APP_URL: 'https://hematin.vercel.app',
  TELEGRAM_BOT_TOKEN: '123456:AAbbCC_dd-ee',
  TELEGRAM_WEBHOOK_SECRET: 'w'.repeat(32),
  OWNER_TELEGRAM_ID: '987654321',
  DATABASE_URL: 'postgresql://u:p@host-pooler.example/db?sslmode=require',
  DIRECT_URL: 'postgresql://u:p@host.example/db?sslmode=require&channel_binding=require',
  GROQ_API_KEY: 'gsk_test',
  CRON_SECRET: 'c'.repeat(32),
};

function errorOf(source: Record<string, string | undefined>): EnvError {
  try {
    parseEnv(source);
  } catch (err) {
    if (err instanceof EnvError) return err;
    throw err;
  }
  throw new Error('expected parseEnv to throw');
}

describe('parseEnv', () => {
  it('accepts a complete env and fills documented defaults', () => {
    const env = parseEnv(valid);
    expect(env.TZ_APP).toBe('Asia/Jakarta');
    expect(env.GROQ_MODEL).toBe('openai/gpt-oss-20b');
    expect(env.GROQ_TIMEOUT_MS).toBe(5000);
    expect(env.SESSION_TTL_DAYS).toBe(30);
    expect(env.MAGIC_LINK_TTL_MINUTES).toBe(5);
  });

  it('lists every missing key, treating blank values as missing', () => {
    const err = errorOf({ ...valid, GROQ_API_KEY: '  ', CRON_SECRET: undefined, DATABASE_URL: '' });
    expect(err.missing.sort()).toEqual(['CRON_SECRET', 'DATABASE_URL', 'GROQ_API_KEY']);
    expect(err.message).toContain('missing: ');
  });

  it('names invalid keys without printing their values', () => {
    const leaky = 'short-but-secret-value';
    const err = errorOf({
      ...valid,
      CRON_SECRET: leaky,
      DATABASE_URL: `postgresql://u:${leaky}@host/db`,
      APP_URL: 'https://hematin.vercel.app/',
    });
    expect(err.invalid.map((s) => s.split(' ')[0]).sort()).toEqual(['APP_URL', 'CRON_SECRET', 'DATABASE_URL']);
    expect(err.message).not.toContain(leaky);
  });
});
