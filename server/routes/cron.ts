import { Router } from 'express';
import { requireCronSecret } from '../lib/cronAuth.js';

// Vercel Cron calls these with GET (ARCHITECTURE §3.3), always with the bearer secret (constant-time check).
// Each job is idempotent through CronRun, so a retry or a manual call on the same day is a no-op.

export type CronDeps = {
  secret: string;
  dailyReminder: (now: Date) => Promise<unknown>;
  weeklyRecap: (now: Date) => Promise<unknown>;
  incomeReminder: (now: Date) => Promise<unknown>;
};

export function cronRouter(deps: CronDeps): Router {
  const router = Router();
  router.use(requireCronSecret(deps.secret));

  router.get('/daily-reminder', async (_req, res) => {
    res.json({ ok: true, stats: await deps.dailyReminder(new Date()) });
  });
  router.get('/weekly-recap', async (_req, res) => {
    res.json({ ok: true, stats: await deps.weeklyRecap(new Date()) });
  });
  router.get('/income-reminder', async (_req, res) => {
    res.json({ ok: true, stats: await deps.incomeReminder(new Date()) });
  });
  return router;
}
