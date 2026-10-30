import express, { type Express } from 'express';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { requestLogger } from './lib/logger.js';
import { cronRouter, type CronDeps } from './routes/cron.js';
import { healthRouter } from './routes/health.js';

export type AppOptions = {
  /** Shown by GET /api/health. */
  version: string;
  /** Cron secret and job runners (wired in api/index.ts). */
  cron: CronDeps;
};

// Takes its config as arguments instead of reading env, so tests can build it without secrets.
export function createApp({ version, cron }: AppOptions): Express {
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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
