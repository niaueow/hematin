import { Router } from 'express';

export function healthRouter(version: string): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json({ ok: true, version });
  });
  return router;
}
