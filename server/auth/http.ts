import type { Request, RequestHandler, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { SESSION_COOKIE, type Authenticated, type AuthService } from './service.js';

// The HTTP side of dashboard auth: requireUser, the session cookie, and CSRF (SECURITY §3, API.md).

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireUser. Routes only ever use req.auth.user.id (SECURITY §3.3). */
      auth?: Authenticated;
    }
  }
}

/** The one cookie we care about, from the Cookie header. No cookie library needed for that. */
export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.get('cookie') ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim() || null;
  }
  return null;
}

/** SECURITY §3.2 step 5: __Host-session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=… */
export function setSessionCookie(res: Response, token: string, maxAgeSeconds: number) {
  res.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`,
  );
}

export function clearSessionCookie(res: Response) {
  res.append('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * API.md "Mutations & CSRF": a state-changing request that relies on the cookie must carry
 * `X-Requested-With: fetch` (a cross-site form can't set it) and come from our own origin.
 */
export function passesCsrf(req: Request, appUrl: string): boolean {
  return req.get('x-requested-with') === 'fetch' && req.get('origin') === appUrl;
}

export function requireCsrf(appUrl: string): RequestHandler {
  return (req, _res, next) => {
    if (!SAFE_METHODS.has(req.method) && !passesCsrf(req, appUrl)) throw new AppError('CSRF', 403, 'Forbidden');
    next();
  };
}

/** The caller's IP for rate limiting. On Vercel, x-real-ip / x-forwarded-for are set by Vercel's edge. */
export function clientIp(req: Request): string {
  return req.get('x-real-ip') ?? req.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? '?';
}

/**
 * Accepts `Authorization: tma <initData>` (Mini App) or the session cookie (browser), sets req.auth, and
 * rejects anything else, including DISABLED users, with 401. Cookie requests that change state also need the
 * CSRF headers; the tma header can't be sent cross-site, so it doesn't.
 */
export function requireUser(auth: AuthService, appUrl: string): RequestHandler {
  return async (req, _res, next) => {
    const header = req.get('authorization');
    let result: Authenticated | null;
    if (header !== undefined) {
      result = header.startsWith('tma ') ? await auth.fromInitData(header.slice(4)) : null;
    } else {
      const token = readCookie(req, SESSION_COOKIE);
      result = token ? await auth.fromSession(token) : null;
      if (result && !SAFE_METHODS.has(req.method) && !passesCsrf(req, appUrl))
        throw new AppError('CSRF', 403, 'Forbidden');
    }
    if (!result) throw new AppError('UNAUTHORIZED', 401, 'Unauthorized');
    req.auth = result;
    next();
  };
}

/** For handlers behind requireUser. */
export function authOf(req: Request): Authenticated {
  if (!req.auth) throw new Error('route reached without requireUser');
  return req.auth;
}
