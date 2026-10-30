import type { ErrorRequestHandler, RequestHandler } from 'express';
import { logger, pathOf } from './logger.js';

export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export type ErrorBody = { error: { code: string; message: string } };

/** Catch-all for routes nobody handled. Always JSON, never Express's HTML page. */
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError('NOT_FOUND', 404, 'Not found'));
};

type BodyParserError = Error & { type?: string; status?: number };

/** The one error handler. Clients get a code and a generic message; details go to the logs only. */
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  let status = 500;
  let body: ErrorBody = { error: { code: 'INTERNAL', message: 'Something went wrong' } };

  if (err instanceof AppError) {
    status = err.httpStatus;
    body = { error: { code: err.code, message: err.message } };
  } else if (err instanceof Error && (err as BodyParserError).type === 'entity.too.large') {
    status = 413;
    body = { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' } };
  } else if (err instanceof Error && (err as BodyParserError).type === 'entity.parse.failed') {
    status = 400;
    body = { error: { code: 'BAD_JSON', message: 'Malformed JSON body' } };
  }

  // Deliberate AppErrors (404, 501, …) are expected; only unexpected failures are logged.
  if (status === 500) {
    logger.error('unhandled_error', {
      method: req.method,
      path: pathOf(req.originalUrl),
      error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
    });
  }

  res.status(status).json(body);
};
