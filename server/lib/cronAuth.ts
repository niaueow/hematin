import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { AppError } from './errors.js';

// Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` (ARCHITECTURE §3.3). Compared in constant
// time (AGENTS.md rule 12); hashing first gives timingSafeEqual equal-length inputs.

const digest = (value: string) => createHash('sha256').update(value).digest();

export function requireCronSecret(secret: string): RequestHandler {
  const expected = digest(`Bearer ${secret}`);
  return (req, _res, next) => {
    const given = digest(req.get('authorization') ?? '');
    if (!timingSafeEqual(given, expected)) {
      next(new AppError('UNAUTHORIZED', 401, 'Unauthorized'));
      return;
    }
    next();
  };
}
