import { Router } from 'express';
import type { Update } from 'grammy/types';
import { z } from 'zod';
import { requireHeaderSecret } from '../lib/cronAuth.js';
import { AppError } from '../lib/errors.js';

// POST /api/telegram/webhook (API.md). The secret header is checked in constant time before anything else;
// a wrong or missing one is a 401 and the update is never looked at (SECURITY §2).

export type TelegramDeps = {
  webhookSecret: string;
  handleUpdate: (update: Update) => Promise<void>;
};

const updateShape = z.looseObject({ update_id: z.number().int().nonnegative() });

export function telegramRouter(deps: TelegramDeps): Router {
  const router = Router();
  router.post(
    '/webhook',
    requireHeaderSecret('x-telegram-bot-api-secret-token', deps.webhookSecret),
    async (req, res) => {
      if (!updateShape.safeParse(req.body).success) throw new AppError('BAD_UPDATE', 400, 'Invalid update');
      // All work happens before the response (no background work on serverless, AGENTS.md rule 11).
      await deps.handleUpdate(req.body as Update);
      res.json({ ok: true });
    },
  );
  return router;
}
