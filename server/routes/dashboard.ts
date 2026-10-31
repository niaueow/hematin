import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import { requireUser } from '../auth/http.js';
import type { AuthService } from '../auth/service.js';
import type { BudgetService } from '../budget/service.js';
import { parseLocalDate } from '../budget/periods.js';
import type { AliasRepo } from '../db/repos/aliasRepo.js';
import type { CategoryRepo } from '../db/repos/categoryRepo.js';
import type { TxRepo } from '../db/repos/txRepo.js';
import { AppError } from '../lib/errors.js';

// Shared pieces of the dashboard API (API.md: budget, summary, transactions, categories, aliases).
// Every route is behind requireUser and uses only req.auth.user.id (SECURITY §3.3). Another user's id is
// always a 404, never a 403, so ids can't be probed.

export type DashboardDeps = {
  auth: AuthService;
  appUrl: string;
  budget: Pick<BudgetService, 'current'>;
  repos: {
    transactions: Pick<
      TxRepo,
      'create' | 'findById' | 'update' | 'softDelete' | 'restore' | 'listForUser' | 'listInRange'
    >;
    categories: Pick<CategoryRepo, 'listUsable' | 'findUsableById' | 'findOwnById' | 'createOwn' | 'updateOwn'>;
    aliases: Pick<AliasRepo, 'listForUser' | 'deleteOwn'>;
  };
  now: () => Date;
};

export const guard = (deps: DashboardDeps): RequestHandler => requireUser(deps.auth, deps.appUrl);

/** Zod-parse or a 400 VALIDATION naming the first problem (never echoing the input). */
export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
  throw new AppError('VALIDATION', 400, `${where}${issue?.message ?? 'invalid'}`);
}

/** Query keys Vercel's routing can add (a rewrite's named params, a catch-all function's); never ours (D-034). */
const PLATFORM_QUERY_KEYS = new Set(['path', '...path']);

/** `parse` for req.query, on a copy without the platform's keys (req.query is a getter in Express 5). */
export function parseQuery<T>(schema: z.ZodType<T>, req: Request): T {
  return parse(schema, Object.fromEntries(Object.entries(req.query).filter(([key]) => !PLATFORM_QUERY_KEYS.has(key))));
}

export const notFound = () => new AppError('NOT_FOUND', 404, 'Not found');

/**
 * Ids in paths and bodies. Not `.cuid()` (API.md's draft): system categories have fixed ids like
 * `sys_belanja_bulanan` (DATA_MODEL). Anything else is simply not found.
 */
export const Id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'invalid id');

/** A WIB calendar date "YYYY-MM-DD" that exists. */
export const DateString = z.string().refine(
  (value) => {
    try {
      parseLocalDate(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'must be a date YYYY-MM-DD' },
);

/** A path id: a malformed one can't exist, so it's a 404 like any other unknown id. */
export function pathId(value: unknown): string {
  const id = Id.safeParse(value);
  if (!id.success) throw notFound();
  return id.data;
}
