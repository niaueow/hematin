import express, { type Express } from 'express';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { requestLogger } from './lib/logger.js';
import { authRouter, meRouter, type AuthRouteDeps } from './routes/auth.js';
import { budgetRouter, summaryRouter } from './routes/budget.js';
import { aliasesRouter, categoriesRouter } from './routes/categories.js';
import type { DashboardDeps } from './routes/dashboard.js';
import { transactionsRouter } from './routes/transactions.js';
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
  /** The dashboard API's services and repos (auth comes from `auth`). */
  dashboard: Omit<DashboardDeps, 'auth' | 'appUrl'>;
};

// Takes its config as arguments instead of reading env, so tests can build it without secrets.
export function createApp({ version, cron, telegram, auth, dashboard }: AppOptions): Express {
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

  const api: DashboardDeps = { ...dashboard, ...auth };
  app.use('/api/budget', budgetRouter(api));
  app.use('/api/summary', summaryRouter(api));
  app.use('/api/transactions', transactionsRouter(api));
  app.use('/api/categories', categoriesRouter(api));
  app.use('/api/aliases', aliasesRouter(api));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
