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

export type TransactionPatch = Partial<Pick<NewTransaction, 'type' | 'amount' | 'categoryId' | 'note' | 'occurredAt'>>;

export type TransactionFilter = {
  from?: LocalDate;
  to?: LocalDate;
  type?: TxType;
  categoryId?: string;
  q?: string;
  limit?: number;
};

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

    findById(userId: string, id: string) {
      return db.transaction.findFirst({ where: { id, userId, ...live } });
    },

    /** Budget input: all live transactions with localDate in [from, to]. */
    listInRange(userId: string, from: LocalDate, to: LocalDate) {
      return db.transaction.findMany({
        where: { userId, ...live, ...dateRange(from, to) },
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

    listForUser(userId: string, filter: TransactionFilter = {}) {
      return db.transaction.findMany({
        where: {
          userId,
          ...live,
          ...dateRange(filter.from, filter.to),
          ...(filter.type && { type: filter.type }),
          ...(filter.categoryId && { categoryId: filter.categoryId }),
          ...(filter.q && { note: { contains: filter.q, mode: 'insensitive' as const } }),
        },
        orderBy: [{ localDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        take: Math.min(filter.limit ?? 50, 100),
      });
    },

    /** /riwayat and /undo: most recently created first. */
    latest(userId: string, limit: number, createdSince?: Date) {
      return db.transaction.findMany({
        where: { userId, ...live, ...(createdSince && { createdAt: { gte: createdSince } }) },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
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
