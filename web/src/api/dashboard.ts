import { api } from '@web/api/client';

// Typed calls for the dashboard API (docs/API.md, M11). Shapes mirror the server's responses.

export type Bucket = 'NEEDS' | 'WANTS' | 'SAVINGS' | 'INCOME';
export type TxType = 'INCOME' | 'EXPENSE' | 'SAVING';

type Amounts = { allocation: number; spent: number; remaining: number };

/** GET /api/budget/current: the /sisa numbers, per bucket. */
export type BudgetCurrent = {
  state: 'OK' | 'NO_BUDGET';
  today: string;
  month: {
    month: string;
    start: string;
    end: string;
    days: number;
    income: number;
    needsMonth: number;
    wantsMonth: number;
    savingsTarget: number;
  };
  segment: { index: number; start: string; end: string; days: number; remainingDays: number };
  needs: { week: Amounts; month: Amounts; carryIn: number };
  wants: {
    week: Amounts & { base: number; debtIn: number };
    month: { allocation: number; remaining: number };
    dailyPace: number;
  };
  savings: { recorded: number; bonus: number; total: number; progressPct: number; target: number };
  savedBySkipping: { week: { amount: number; count: number }; month: { amount: number; count: number } };
};

export type Period = 'week' | 'month' | 'year';
type Totals = { income: number; expense: number; saving: number };

/** GET /api/summary */
export type Summary = {
  period: Period;
  range: { start: string; end: string };
  totals: Totals;
  byBucket: { bucket: 'NEEDS' | 'WANTS' | 'SAVINGS'; amount: number }[];
  byCategory: {
    categoryId: string | null;
    name: string | null;
    bucket: 'NEEDS' | 'WANTS' | 'SAVINGS' | null;
    amount: number;
  }[];
  series: ({ start: string; end: string } & Totals)[];
};

export type Category = {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
  bucket: Bucket;
  own: boolean;
  archived: boolean;
};

export type Transaction = {
  id: string;
  type: TxType;
  amount: number;
  categoryId: string | null;
  category: { id: string; name: string; bucket: Bucket; emoji: string | null } | null;
  note: string | null;
  date: string;
  occurredAt: string;
  source: 'BOT' | 'WEB';
  parseMethod: string;
  createdAt: string;
};

export type TransactionPage = { items: Transaction[]; nextCursor: string | null };

export type TransactionInput = {
  type: TxType;
  amount: number;
  categoryId?: string | null;
  note?: string | null;
  date: string;
};

export type Alias = { id: string; keyword: string; category: { id: string; name: string; bucket: Bucket } };

const query = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== '') search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const getBudget = () => api<BudgetCurrent>('/budget/current');
export const getSummary = (period: Period, date?: string) => api<Summary>(`/summary${query({ period, date })}`);

export type TransactionQuery = {
  from?: string;
  to?: string;
  type?: TxType;
  categoryId?: string;
  q?: string;
  cursor?: string;
  limit?: number;
};
export const listTransactions = (q: TransactionQuery = {}) => api<TransactionPage>(`/transactions${query(q)}`);
export const createTransaction = (body: TransactionInput) =>
  api<Transaction>('/transactions', { method: 'POST', body });
export const updateTransaction = (id: string, body: Partial<TransactionInput>) =>
  api<Transaction>(`/transactions/${encodeURIComponent(id)}`, { method: 'PATCH', body });
export const deleteTransaction = (id: string) =>
  api<{ ok: true }>(`/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const restoreTransaction = (id: string) =>
  api<Transaction>(`/transactions/${encodeURIComponent(id)}/restore`, { method: 'POST', body: {} });

export const listCategories = () => api<Category[]>('/categories');
export const createCategory = (body: { name: string; bucket: 'NEEDS' | 'WANTS' | 'SAVINGS'; emoji?: string }) =>
  api<Category>('/categories', { method: 'POST', body });
export const updateCategory = (id: string, body: { name?: string; emoji?: string | null; archived?: boolean }) =>
  api<Category>(`/categories/${encodeURIComponent(id)}`, { method: 'PATCH', body });

export const listAliases = () => api<Alias[]>('/aliases');
export const deleteAlias = (id: string) =>
  api<{ ok: true }>(`/aliases/${encodeURIComponent(id)}`, { method: 'DELETE' });
