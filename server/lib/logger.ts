import type { RequestHandler } from 'express';

// Structured one-line JSON logs for Vercel → Logs.
// Never log tokens, initData, cookies, magic-link tokens, headers, or request bodies (SECURITY.md §1).

type Level = 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

function write(level: Level, msg: string, fields: Fields = {}): void {
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (msg: string, fields?: Fields) => write('info', msg, fields),
  warn: (msg: string, fields?: Fields) => write('warn', msg, fields),
  error: (msg: string, fields?: Fields) => write('error', msg, fields),
};

/** Full request path without the query string. */
export function pathOf(originalUrl: string): string {
  return originalUrl.split('?', 1)[0] ?? '';
}

/**
 * Logs method, path (no query string: it can carry tokens), status and duration.
 * The webhook path is fine to log; its secret travels in a header, which we never log.
 */
export const requestLogger: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();
  // Captured now: routers rewrite req.url/req.path while handling, so they're mount-relative later.
  const path = pathOf(req.originalUrl);
  res.on('finish', () => {
    const durationMs = Number((process.hrtime.bigint() - start) / 1_000_000n);
    logger.info('request', {
      method: req.method,
      path,
      status: res.statusCode,
      durationMs,
      requestId: req.get('x-vercel-id'),
    });
  });
  next();
};
