import { localDateToDb, toLocalDate, type LocalDate } from '../../budget/periods.js';
import type { ParseMethod, TxSource, TxType } from '../generated/client.js';
import type { Db } from '../prisma.js';

// Transactions. Every function takes userId first and puts it in `where` (SECURITY §3.3).
// Soft-deleted rows are invisible to every read. localDate is always derived from occurredAt here.

export type NewTransaction = {
  type: TxType;
  amount: number;
  categoryId: string | null;
  note?: string | null;
  rawText?: string | null;
  occurredAt: Date;
  source: TxSource;
  parseMethod: ParseMethod;
};

export type TransactionPatch = Partial<
  Pick<NewTransaction, 'type' | 'amount' | 'categoryId' | 'note' | 'occurredAt' | 'parseMethod'>
>;

/** Where the previous page ended: the last row's sort key (localDate desc, createdAt desc, id desc). */
export type TransactionCursor = { localDate: Date; createdAt: Date; id: string };

export type TransactionFilter = {
  from?: LocalDate;
  to?: LocalDate;
  type?: TxType;
  categoryId?: string;
  q?: string;
  /** Page size, at most 100 (default 50). */
  limit?: number;
  /** Rows after this one in the sort order (keyset pagination). */
  after?: TransactionCursor;
};

export const MAX_PAGE_SIZE = 100;

/** Rows strictly after `c` in (localDate desc, createdAt desc, id desc). */
const afterCursor = (c: TransactionCursor) => ({
  OR: [
    { localDate: { lt: c.localDate } },
    { localDate: c.localDate, createdAt: { lt: c.createdAt } },
    { localDate: c.localDate, createdAt: c.createdAt, id: { lt: c.id } },
  ],
});

const live = { deletedAt: null } as const;

function dateRange(from?: LocalDate, to?: LocalDate) {
  if (!from && !to) return {};
  return { localDate: { ...(from && { gte: localDateToDb(from) }), ...(to && { lte: localDateToDb(to) }) } };
}

export function createTxRepo(db: Db) {
  return {
    create(userId: string, tx: NewTransaction) {
      return db.transaction.create({
        data: { ...tx, userId, localDate: localDateToDb(toLocalDate(tx.occurredAt)) },
      });
    },

    /** With its category, for bot replies ("Makan Rp10.000"). */
    findById(userId: string, id: string) {
      return db.transaction.findFirst({ where: { id, userId, ...live }, include: { category: true } });
    },

    /** All live transactions with localDate in [from, to], with their category (GET /api/summary). */
    listInRange(userId: string, from: LocalDate, to: LocalDate) {
      return db.transaction.findMany({
        where: { userId, ...live, ...dateRange(from, to) },
        include: { category: true },
        orderBy: [{ localDate: 'asc' }, { createdAt: 'asc' }],
      });
    },

    /** Budget engine input: the whole live history up to `to`, with each category's bucket (D-012). */
    listUpTo(userId: string, to: LocalDate) {
      return db.transaction.findMany({
        where: { userId, ...live, ...dateRange(undefined, to) },
        select: { type: true, amount: true, localDate: true, categoryId: true, category: { select: { bucket: true } } },
        orderBy: [{ localDate: 'asc' }, { createdAt: 'asc' }],
      });
    },

    /** GET /api/transactions: newest first, one page. `hasMore`: another page follows (one extra row is read). */
    async listForUser(userId: string, filter: TransactionFilter = {}) {
      const limit = Math.min(filter.limit ?? 50, MAX_PAGE_SIZE);
      const rows = await db.transaction.findMany({
        where: {
          userId,
          ...live,
          ...dateRange(filter.from, filter.to),
          ...(filter.type && { type: filter.type }),
          ...(filter.categoryId && { categoryId: filter.categoryId }),
          ...(filter.q && { note: { contains: filter.q, mode: 'insensitive' as const } }),
          ...(filter.after && afterCursor(filter.after)),
        },
        include: { category: true },
        orderBy: [{ localDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });
      return { items: rows.slice(0, limit), hasMore: rows.length > limit };
    },

    /** /riwayat and /undo: most recently created first, with each category. */
    latest(userId: string, limit: number, createdSince?: Date) {
      return db.transaction.findMany({
        where: { userId, ...live, ...(createdSince && { createdAt: { gte: createdSince } }) },
        include: { category: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    },

    /** Income reminders: has the user recorded any income dated in [from, to]? */
    async hasIncomeInRange(userId: string, from: LocalDate, to: LocalDate) {
      const found = await db.transaction.findFirst({
        where: { userId, ...live, type: 'INCOME', ...dateRange(from, to) },
        select: { id: true },
      });
      return found !== null;
    },

    /** Daily reminder: has the user logged anything on this date? */
    async existsOnDate(userId: string, date: LocalDate) {
      const found = await db.transaction.findFirst({
        where: { userId, ...live, localDate: localDateToDb(date) },
        select: { id: true },
      });
      return found !== null;
    },

    /** Returns false when the transaction doesn't exist, is deleted, or isn't this user's. */
    async update(userId: string, id: string, patch: TransactionPatch) {
      const data = patch.occurredAt ? { ...patch, localDate: localDateToDb(toLocalDate(patch.occurredAt)) } : patch;
      const { count } = await db.transaction.updateMany({ where: { id, userId, ...live }, data });
      return count === 1;
    },

    async softDelete(userId: string, id: string, now: Date) {
      const { count } = await db.transaction.updateMany({ where: { id, userId, ...live }, data: { deletedAt: now } });
      return count === 1;
    },
  };
}

export type TxRepo = ReturnType<typeof createTxRepo>;
