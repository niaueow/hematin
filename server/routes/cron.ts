import { Router } from 'express';
import { AppError } from '../lib/errors.js';

// Vercel Cron calls these with GET (ARCHITECTURE §3.3).
// TODO(cron milestone): check `Authorization: Bearer ${CRON_SECRET}` with crypto.timingSafeEqual,
// then run server/jobs/* idempotently via CronRun. Until then they do nothing.
export function cronRouter(): Router {
  const router = Router();
  const notImplemented = () => {
    throw new AppError('NOT_IMPLEMENTED', 501, 'Not implemented yet');
  };
  router.get('/daily-reminder', notImplemented);
  router.get('/weekly-recap', notImplemented);
  return router;
}
