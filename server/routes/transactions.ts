import { Router } from 'express';
import { z } from 'zod';
import { authOf } from '../auth/http.js';
import type { Bucket } from '../budget/engine.js';
import { localDateFromDb, noonWib, parseLocalDate } from '../budget/periods.js';
import type { Category, Transaction, TxType } from '../db/generated/client.js';
import { MAX_PAGE_SIZE, type TransactionCursor, type TransactionPatch } from '../db/repos/txRepo.js';
import { AppError } from '../lib/errors.js';
import { DateString, guard, Id, notFound, parse, pathId, type DashboardDeps } from './dashboard.js';

// /api/transactions (API.md): list with filters and cursor pagination, get, create, patch, soft delete.
// Web entries are source WEB, parseMethod MANUAL, occurredAt = the date at 12:00 WIB. The DATA_MODEL
// invariants are checked here: EXPENSE → a NEEDS/WANTS category, SAVING → SAVINGS, INCOME → none or INCOME,
// and only system or own, non-archived categories. Another user's category is treated like an unknown one.

const TYPES = ['INCOME', 'EXPENSE', 'SAVING'] as const;
const Amount = z.number().int().positive().max(100_000_000);
/** Notes are trimmed; an empty one is no note. */
const Note = z
  .string()
  .trim()
  .max(120)
  .transform((s) => s || null);

const CreateBody = z
  .object({ type: z.enum(TYPES), amount: Amount, categoryId: Id.optional(), note: Note.optional(), date: DateString })
  .strict();

const PatchBody = z
  .object({
    type: z.enum(TYPES).optional(),
    amount: Amount.optional(),
    categoryId: Id.nullable().optional(),
    note: Note.nullable().optional(),
    date: DateString.optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'nothing to change' });

const ListQuery = z
  .object({
    from: DateString.optional(),
    to: DateString.optional(),
    type: z.enum(TYPES).optional(),
    categoryId: Id.optional(),
    q: z.string().trim().min(1).max(100).optional(),
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  })
  .strict();

const BUCKETS_FOR: Record<TxType, readonly Bucket[]> = {
  EXPENSE: ['NEEDS', 'WANTS'],
  SAVING: ['SAVINGS'],
  INCOME: ['INCOME'],
};

export function txView(tx: Transaction & { category: Category | null }) {
  return {
    id: tx.id,
    type: tx.type,
    amount: tx.amount,
    categoryId: tx.categoryId,
    category: tx.category && {
      id: tx.category.id,
      name: tx.category.name,
      bucket: tx.category.bucket,
      emoji: tx.category.emoji,
    },
    note: tx.note,
    date: localDateFromDb(tx.localDate),
    occurredAt: tx.occurredAt.toISOString(),
    source: tx.source,
    parseMethod: tx.parseMethod,
    createdAt: tx.createdAt.toISOString(),
  };
}

// The cursor is the last row's sort key, opaque to the client: base64url of [localDate, createdAt, id].
const CursorShape = z.tuple([DateString, z.iso.datetime(), Id]);

export function encodeCursor(tx: Pick<Transaction, 'localDate' | 'createdAt' | 'id'>): string {
  const key = [localDateFromDb(tx.localDate), tx.createdAt.toISOString(), tx.id];
  return Buffer.from(JSON.stringify(key)).toString('base64url');
}

function decodeCursor(cursor: string): TransactionCursor {
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new AppError('VALIDATION', 400, 'cursor: invalid');
  }
  const [date, createdAt, id] = parse(CursorShape, json);
  return { localDate: new Date(`${date}T00:00:00.000Z`), createdAt: new Date(createdAt), id };
}

export function transactionsRouter(deps: DashboardDeps): Router {
  const router = Router();
  const { transactions, categories } = deps.repos;
  router.use(guard(deps));

  /** The DATA_MODEL invariants for a type + category pair. 400 when they don't hold. */
  async function checkCategory(userId: string, type: TxType, categoryId: string | null) {
    if (categoryId === null) {
      if (type === 'INCOME') return;
      throw new AppError('CATEGORY_REQUIRED', 400, `${type} needs a category`);
    }
    const category = await categories.findUsableById(userId, categoryId);
    if (!category || category.archived || !BUCKETS_FOR[type].includes(category.bucket))
      throw new AppError('INVALID_CATEGORY', 400, `category can't be used for ${type}`);
  }

  router.get('/', async (req, res) => {
    const query = parse(ListQuery, req.query);
    const userId = authOf(req).user.id;
    const page = await transactions.listForUser(userId, {
      ...(query.from && { from: parseLocalDate(query.from) }),
      ...(query.to && { to: parseLocalDate(query.to) }),
      ...(query.type && { type: query.type }),
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.q && { q: query.q }),
      ...(query.limit && { limit: query.limit }),
      ...(query.cursor && { after: decodeCursor(query.cursor) }),
    });
    const last = page.items.at(-1);
    res.json({ items: page.items.map(txView), nextCursor: page.hasMore && last ? encodeCursor(last) : null });
  });

  router.get('/:id', async (req, res) => {
    const tx = await transactions.findById(authOf(req).user.id, pathId(req.params.id));
    if (!tx) throw notFound();
    res.json(txView(tx));
  });

  router.post('/', async (req, res) => {
    const body = parse(CreateBody, req.body);
    const userId = authOf(req).user.id;
    await checkCategory(userId, body.type, body.categoryId ?? null);
    const created = await transactions.create(userId, {
      type: body.type,
      amount: body.amount,
      categoryId: body.categoryId ?? null,
      note: body.note ?? null,
      occurredAt: noonWib(parseLocalDate(body.date)),
      source: 'WEB',
      parseMethod: 'MANUAL',
    });
    const tx = await transactions.findById(userId, created.id);
    if (!tx) throw notFound();
    res.status(201).json(txView(tx));
  });

  router.patch('/:id', async (req, res) => {
    const userId = authOf(req).user.id;
    const id = pathId(req.params.id);
    const existing = await transactions.findById(userId, id);
    if (!existing) throw notFound();
    const body = parse(PatchBody, req.body);
    const type = body.type ?? existing.type;
    const categoryId = body.categoryId !== undefined ? body.categoryId : existing.categoryId;
    // Re-check whenever the pair changes (an unchanged pair stays valid, even if the category was archived since).
    if (body.type !== undefined || body.categoryId !== undefined) await checkCategory(userId, type, categoryId);

    const patch: TransactionPatch = {
      ...(body.type !== undefined && { type }),
      ...(body.categoryId !== undefined && { categoryId }),
      ...(body.amount !== undefined && { amount: body.amount }),
      ...(body.note !== undefined && { note: body.note }),
      ...(body.date !== undefined && { occurredAt: noonWib(parseLocalDate(body.date)) }),
    };
    if (!(await transactions.update(userId, id, patch))) throw notFound();
    const tx = await transactions.findById(userId, id);
    if (!tx) throw notFound();
    res.json(txView(tx));
  });

  router.delete('/:id', async (req, res) => {
    if (!(await transactions.softDelete(authOf(req).user.id, pathId(req.params.id), deps.now()))) throw notFound();
    res.json({ ok: true });
  });

  // Undo a delete ("Urungkan" in the dashboard's toast). 404 unless it's yours and deleted.
  router.post('/:id/restore', async (req, res) => {
    const userId = authOf(req).user.id;
    const id = pathId(req.params.id);
    if (!(await transactions.restore(userId, id))) throw notFound();
    const tx = await transactions.findById(userId, id);
    if (!tx) throw notFound();
    res.json(txView(tx));
  });

  return router;
}
