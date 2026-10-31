import express, { type Express } from 'express';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { requestLogger } from './lib/logger.js';
import { authRouter, meRouter, type AuthRouteDeps } from './routes/auth.js';
import { cronRouter, type CronDeps } from './routes/cron.js';
import { healthRouter } from './routes/health.js';
import { telegramRouter, type TelegramDeps } from './routes/telegram.js';

export type AppOptions = {
  /** Shown by GET /api/health. */
  version: string;
  /** Cron secret and job runners (wired in api/index.ts). */
  cron: CronDeps;
  /** Webhook secret and the bot's update handler (wired in api/index.ts). */
  telegram: TelegramDeps;
  /** Dashboard auth: the auth service and APP_URL (CSRF origin). */
  auth: AuthRouteDeps;
};

// Takes its config as arguments instead of reading env, so tests can build it without secrets.
export function createApp({ version, cron, telegram, auth }: AppOptions): Express {
  const app = express();

  app.disable('x-powered-by');
  // Express only serves JSON. The SPA's CSP (Mini App framing) goes in vercel.json headers in Phase 2.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
    }),
  );
  app.use(requestLogger);
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/health', healthRouter(version));
  app.use('/api/cron', cronRouter(cron));
  app.use('/api/telegram', telegramRouter(telegram));
  app.use('/api/auth', authRouter(auth));
  app.use('/api/me', meRouter(auth));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
