import { Router } from 'express';
import { requireCronSecret } from '../lib/cronAuth.js';
import { AppError } from '../lib/errors.js';

// Vercel Cron calls these with GET (ARCHITECTURE §3.3), always with the bearer secret.

export type CronDeps = {
  secret: string;
  incomeReminder: (now: Date) => Promise<unknown>;
};

export function cronRouter(deps: CronDeps): Router {
  const router = Router();
  router.use(requireCronSecret(deps.secret));

  router.get('/income-reminder', async (_req, res) => {
    res.json({ ok: true, stats: await deps.incomeReminder(new Date()) });
  });

  // TODO(cron milestone): server/jobs/dailyReminder.ts and weeklyRecap.ts.
  const notImplemented = () => {
    throw new AppError('NOT_IMPLEMENTED', 501, 'Not implemented yet');
  };
  router.get('/daily-reminder', notImplemented);
  router.get('/weekly-recap', notImplemented);
  return router;
}
