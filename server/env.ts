import { z } from 'zod';

// Every key in .env.example, validated once at boot. The only module that reads secrets
// from process.env (AGENTS.md rule 9). Error messages name keys, never values.

const secret = (minLength: number) =>
  z.string({ error: 'is required' }).min(minLength, { error: `must be at least ${minLength} characters` });

const postgresUrl = z
  .string({ error: 'is required' })
  .regex(/^postgres(ql)?:\/\/.+/, { error: 'must be a postgres:// or postgresql:// URL' })
  .refine((v) => /[?&]sslmode=require(&|$)/.test(v), { error: 'must include sslmode=require' });

const positiveInt = (fallback: number) =>
  z.coerce
    .number({ error: 'must be a number' })
    .int({ error: 'must be an integer' })
    .positive({ error: 'must be positive' })
    .default(fallback);

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['production', 'development', 'test'], { error: 'must be production, development or test' })
    .default('production'),
  APP_URL: z
    .string({ error: 'is required' })
    .regex(/^https:\/\/[^/\s]+$/, { error: 'must be an https:// origin with no path or trailing slash' }),
  TZ_APP: z.literal('Asia/Jakarta', { error: 'must be Asia/Jakarta' }).default('Asia/Jakarta'),

  TELEGRAM_BOT_TOKEN: z
    .string({ error: 'is required' })
    .regex(/^\d+:[A-Za-z0-9_-]+$/, { error: 'must look like <id>:<secret>' }),
  TELEGRAM_WEBHOOK_SECRET: z
    .string({ error: 'is required' })
    .regex(/^[A-Za-z0-9_-]{32,256}$/, { error: 'must be 32-256 characters of [A-Za-z0-9_-]' }),
  OWNER_TELEGRAM_ID: z.string({ error: 'is required' }).regex(/^\d{1,20}$/, { error: 'must be a numeric Telegram ID' }),

  DATABASE_URL: postgresUrl,
  DIRECT_URL: postgresUrl,

  GROQ_API_KEY: secret(1),
  GROQ_MODEL: z.string().min(1, { error: 'must not be empty' }).default('openai/gpt-oss-20b'),
  GROQ_TIMEOUT_MS: positiveInt(5000),
  LLM_DAILY_LIMIT_PER_USER: positiveInt(50),

  CRON_SECRET: secret(32),

  SESSION_TTL_DAYS: positiveInt(30),
  MAGIC_LINK_TTL_MINUTES: positiveInt(5),

  // Vercel system variable, used only for the version in GET /api/health.
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(
    readonly missing: string[],
    readonly invalid: string[],
  ) {
    const parts: string[] = [];
    if (missing.length > 0) parts.push(`missing: ${missing.join(', ')}`);
    if (invalid.length > 0) parts.push(`invalid: ${invalid.join('; ')}`);
    super(
      `Invalid environment. ${parts.join('. ')}. Set them in Vercel → Settings → Environment Variables (Production).`,
    );
    this.name = 'EnvError';
  }
}

/** Pure: validates the given source. Treats empty strings as missing (.env.example leaves secrets blank). */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const cleaned: Record<string, string> = {};
  for (const key of Object.keys(envSchema.shape)) {
    const value = source[key];
    if (value !== undefined && value.trim() !== '') cleaned[key] = value.trim();
  }

  const result = envSchema.safeParse(cleaned);
  if (result.success) return result.data;

  const missing = new Set<string>();
  const invalid: string[] = [];
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '(root)');
    if (!(key in cleaned)) missing.add(key);
    else invalid.push(`${key} ${issue.message}`);
  }
  throw new EnvError([...missing], invalid);
}

let cached: Env | undefined;

/** Validated env for this function instance. Throws EnvError on the first call if anything is wrong. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
