import type { RequestHandler } from 'express';
import { AppError } from './errors.js';
import { constantTimeEquals } from './secrets.js';

// Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` (ARCHITECTURE §3.3); the Telegram webhook sends
// `X-Telegram-Bot-Api-Secret-Token` (SECURITY §2). Both are compared in constant time (AGENTS.md rule 12).

export function requireHeaderSecret(header: string, expected: string): RequestHandler {
  return (req, _res, next) => {
    if (!constantTimeEquals(req.get(header) ?? '', expected)) {
      next(new AppError('UNAUTHORIZED', 401, 'Unauthorized'));
      return;
    }
    next();
  };
}

export const requireCronSecret = (secret: string) => requireHeaderSecret('authorization', `Bearer ${secret}`);
