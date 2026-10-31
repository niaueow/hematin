import { Router } from 'express';
import { z } from 'zod';
import { authOf, clearSessionCookie, clientIp, requireCsrf, requireUser, setSessionCookie } from '../auth/http.js';
import type { AuthService } from '../auth/service.js';
import type { User } from '../db/generated/client.js';
import { AppError } from '../lib/errors.js';

// /api/auth/* and /api/me (API.md). Thin: validate → auth service → response.

export type AuthRouteDeps = { auth: AuthService; appUrl: string };

/** GET /api/me and the body of POST /api/auth/magic. Never the Telegram id or anything secret. */
export const meOf = (user: User) => ({
  id: user.id,
  firstName: user.firstName,
  telegramUsername: user.telegramUsername,
  role: user.role,
  needsPct: user.needsPct,
  wantsPct: user.wantsPct,
  savingsPct: user.savingsPct,
});

// 32 random bytes in base64url = 43 characters.
const MagicBody = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();

export function authRouter({ auth, appUrl }: AuthRouteDeps): Router {
  const router = Router();

  // The SPA's /auth page POSTs here; a GET never consumes a token (link-preview crawlers). It sets a cookie,
  // so it gets the same CSRF check as cookie requests (no logging people into someone else's account).
  router.post('/magic', requireCsrf(appUrl), async (req, res) => {
    if (!(await auth.allowMagicAttempt(clientIp(req)))) throw new AppError('RATE_LIMITED', 429, 'Too many attempts');
    const body = MagicBody.safeParse(req.body);
    if (!body.success) throw new AppError('INVALID_TOKEN', 401, 'Link expired or already used');
    const result = await auth.consumeMagicLink(body.data.token, req.get('user-agent') ?? null);
    if (!result) throw new AppError('INVALID_TOKEN', 401, 'Link expired or already used');
    setSessionCookie(res, result.sessionToken, auth.sessionMaxAgeSeconds);
    res.json({ user: meOf(result.user) });
  });

  router.post('/logout', requireUser(auth, appUrl), async (req, res) => {
    const session = authOf(req);
    if (session.method === 'cookie') await auth.logout(session.user.id, session.sessionId);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.post('/logout-all', requireUser(auth, appUrl), async (req, res) => {
    const revoked = await auth.logoutAll(authOf(req).user.id);
    clearSessionCookie(res);
    res.json({ ok: true, revoked });
  });

  return router;
}

export function meRouter({ auth, appUrl }: AuthRouteDeps): Router {
  const router = Router();
  router.get('/', requireUser(auth, appUrl), (req, res) => {
    res.json(meOf(authOf(req).user));
  });
  return router;
}
