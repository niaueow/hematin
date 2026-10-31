import type { InlineKeyboard } from 'grammy';
import { z } from 'zod';
import { checkPurchase, type Bucket, type TxType } from '../budget/engine.js';
import {
  addDays,
  isoWeekday,
  localDateFromDb,
  monthEnd,
  monthOf,
  monthStart,
  startOfDayWib,
  toLocalDate,
  todayWib,
  weekOf,
} from '../budget/periods.js';
import type { BudgetService } from '../budget/service.js';
import type { Category, ParseMethod, Transaction, User } from '../db/generated/client.js';
import type { ChatStateKind } from '../db/repos/chatStateRepo.js';
import { isAmountOnly, parseMessage } from '../nlp/message.js';
import { normalize } from '../nlp/text.js';
import type { BotRepos } from './bot.js';
import * as copy from './copy.js';
import * as kb from './keyboards.js';

// The logging loop (BOT_SPEC §2–§3): text → parse → record / ask, the buttons under each reply, the
// "mau X" purchase check (§3.2), and the /sisa, /pemasukan, /riwayat, /undo, /kategori commands. Free of grammY: every function takes the resolved
// user and returns what to send; bot.ts does the sending. Every record a button points at is loaded again,
// scoped to the user who pressed it (SECURITY §3.3). Recording is never refused (AGENTS.md rule 6).

export type Reply = {
  text: string;
  keyboard?: InlineKeyboard;
  /** The reply itself asks for this month's income, so the separate income nudge isn't needed. */
  asksIncome?: boolean;
};

/** What to do with a button press: a toast, edit the pressed message (text or just buttons), or send a new one. */
export type CallbackResult = { toast?: string; edit?: Reply; markup?: InlineKeyboard; reply?: Reply };

export type MessageInput = { text: string; rawText: string; occurredAt: Date };

export type FlowDeps = {
  repos: BotRepos;
  transaction: <T>(fn: (repos: BotRepos) => Promise<T>) => Promise<T>;
  budget: Pick<BudgetService, 'snapshot'>;
  now: () => Date;
  newNonce: () => string;
  random?: () => number;
};

/** Pending questions ("Berapa duitnya?", "Maksudnya Rp20.000?", category buttons) last 10 minutes. */
export const PENDING_TTL_MS = 10 * 60_000;
/** A purchase check's buttons work for 24 hours (PRD US2). */
export const INTENT_TTL_MS = 24 * 3_600_000;
/** /undo looks back this far. */
export const UNDO_WINDOW_MS = 24 * 3_600_000;
export const HISTORY_SIZE = 10;

// ChatState payloads are our own JSON, but they come back from the DB: validate before use.
const AmountPending = z.object({
  nonce: z.string(),
  /** The message without its amount, to append the answer to. */
  base: z.string(),
  rawText: z.string(),
  occurredAt: z.iso.datetime(),
  /** CONFIRM_AMOUNT: the ×1.000 reading of a bare small number. */
  candidate: z.number().int().positive().optional(),
});
const PickPending = z.object({
  nonce: z.string(),
  amount: z.number().int().positive(),
  item: z.string(),
  rawText: z.string(),
  occurredAt: z.iso.datetime(),
  /** From a "mau X": the pick leads to the purchase check instead of recording. */
  ask: z.boolean().optional(),
});
/** CONFIRM_LOG: a "mau" for a NEEDS item, waiting for [Catat]. */
const NeedsPending = z.object({
  nonce: z.string(),
  amount: z.number().int().positive(),
  item: z.string(),
  categoryId: z.string(),
  parseMethod: z.enum(['RULE', 'ALIAS', 'LLM', 'USER_PICK']),
  rawText: z.string(),
  occurredAt: z.iso.datetime(),
});

class IntentTaken extends Error {}

/** Categories a transaction of this type can have. EXPENSE and SAVING can swap (the bucket decides); income stays income. */
const bucketsForType = (type: TxType): readonly Bucket[] =>
  type === 'INCOME' ? ['INCOME'] : ['NEEDS', 'WANTS', 'SAVINGS'];

const typeForBucket = (bucket: Bucket): TxType =>
  bucket === 'INCOME' ? 'INCOME' : bucket === 'SAVINGS' ? 'SAVING' : 'EXPENSE';

const usable = (category: Category | null, type: TxType): category is Category =>
  category !== null && !category.archived && bucketsForType(type).includes(category.bucket);

function summary(tx: Transaction & { category: Category | null }): copy.TxSummary {
  return {
    type: tx.type,
    amount: tx.amount,
    categoryName: tx.category?.name ?? null,
    note: tx.note,
    localDate: localDateFromDb(tx.localDate),
  };
}

type NewLog = {
  type: TxType;
  amount: number;
  category: Pick<Category, 'id' | 'name' | 'bucket'> | null;
  item: string;
  rawText: string;
  occurredAt: Date;
  parseMethod: ParseMethod;
};

export function createFlows(deps: FlowDeps) {
  const { repos } = deps;
  const encode = kb.encodeCallback;

  async function nlpContext(userId: string) {
    const [categories, aliases] = await Promise.all([
      repos.categories.listUsable(userId),
      repos.aliases.listForUser(userId),
    ]);
    return { categories, aliases: aliases.map((a) => ({ keyword: a.keyword, categoryId: a.categoryId })) };
  }

  /** Stores the one pending question (overwriting any older one) and returns the nonce for its buttons. */
  async function setPending(userId: string, kind: ChatStateKind, payload: Record<string, string | number | boolean>) {
    const nonce = deps.newNonce();
    await repos.chatStates.set(userId, kind, { ...payload, nonce }, new Date(deps.now().getTime() + PENDING_TTL_MS));
    return nonce;
  }

  /** BOT_SPEC §3.1 / §3.3 / §3.4, with today's numbers. */
  async function logReply(
    user: User,
    tx: { id: string; type: TxType; amount: number },
    category: Pick<Category, 'name' | 'bucket'> | null,
  ): Promise<Reply> {
    const snap = await deps.budget.snapshot(user, deps.now());
    const keyboard = kb.txKeyboard(tx.id);
    if (tx.type === 'INCOME') return { text: copy.incomeLogged(category?.name ?? null, tx.amount, snap), keyboard };
    if (tx.type === 'SAVING') return { text: copy.savingLogged(tx.amount, snap), keyboard };
    if (!category) throw new Error('bot: an expense without a category'); // DATA_MODEL invariant
    return { text: copy.expenseLogged(category, tx.amount, snap), keyboard };
  }

  async function record(user: User, log: NewLog): Promise<Reply> {
    const tx = await repos.transactions.create(user.id, {
      type: log.type,
      amount: log.amount,
      categoryId: log.category?.id ?? null,
      note: log.item || null,
      rawText: log.rawText,
      occurredAt: log.occurredAt,
      source: 'BOT',
      parseMethod: log.parseMethod,
    });
    return logReply(user, tx, log.category);
  }

  /** The pipeline (BOT_SPEC §2) and what to do with its result. */
  async function processText(user: User, input: MessageInput): Promise<Reply> {
    const context = await nlpContext(user.id);
    const parsed = parseMessage(input.text, context);
    const { amount, category, intent, item } = parsed;
    const origin = { rawText: input.rawText, occurredAt: input.occurredAt.toISOString() };

    if ('error' in amount) {
      switch (amount.error) {
        case 'MULTIPLE':
          return { text: copy.ONE_AT_A_TIME };
        case 'OUT_OF_RANGE':
          return { text: copy.amountOutOfRange(amount.amount) };
        case 'AMBIGUOUS_SMALL': {
          const base = parsed.normalized.replace(amount.matchedText, ' ').replace(/\s+/g, ' ').trim();
          const nonce = await setPending(user.id, 'CONFIRM_AMOUNT', { ...origin, base, candidate: amount.candidate });
          return { text: copy.confirmAmount(amount.candidate), keyboard: kb.amountKeyboard(nonce, amount.candidate) };
        }
        case 'NONE':
          // "warteg" or "dapet uang jajan": clearly a log, just no amount. Anything else gets the short help.
          if (!category && intent !== 'LOG_INCOME') return { text: copy.SHORT_HELP };
          await setPending(user.id, 'AWAIT_AMOUNT', { ...origin, base: parsed.normalized });
          return { text: copy.askAmount(deps.random), asksIncome: intent === 'LOG_INCOME' };
      }
    }

    const log = { amount: amount.amount, item, rawText: input.rawText, occurredAt: input.occurredAt };
    switch (intent) {
      case 'ASK_PURCHASE':
        // ("mau nabung" was already turned into LOG_SAVING by refineIntent.)
        if (category && parsed.parseMethod)
          return purchaseCheck(user, { ...log, category, parseMethod: parsed.parseMethod });
        return askCategory(user, context.categories, { ...origin, amount: amount.amount, item, ask: true });
      case 'LOG_INCOME':
        // Income without a matching category is fine (BOT_SPEC §2.3a).
        return record(user, { ...log, type: 'INCOME', category, parseMethod: parsed.parseMethod ?? 'RULE' });
      case 'LOG_SAVING':
      case 'LOG_EXPENSE':
        if (category && parsed.parseMethod) {
          return record(user, {
            ...log,
            type: typeForBucket(category.bucket),
            category,
            parseMethod: parsed.parseMethod,
          });
        }
        return askCategory(user, context.categories, { ...origin, amount: amount.amount, item });
      default:
        return { text: copy.SHORT_HELP };
    }
  }

  /** BOT_SPEC §2.3 step 4: category buttons; the pick is recorded as USER_PICK and learned as an alias. */
  async function askCategory(
    user: User,
    categories: readonly Category[],
    pending: { amount: number; item: string; rawText: string; occurredAt: string; ask?: boolean },
  ): Promise<Reply> {
    const nonce = await setPending(user.id, 'AWAIT_CATEGORY', pending);
    // Income is recognized by its trigger words. A "mau X" is about spending: NEEDS or WANTS.
    const buckets: readonly Bucket[] = pending.ask ? ['NEEDS', 'WANTS'] : ['NEEDS', 'WANTS', 'SAVINGS'];
    const choices = categories.filter((c) => buckets.includes(c.bucket));
    return {
      text: copy.pickCategory(pending.item, pending.amount),
      keyboard: kb.categoryKeyboard(
        choices,
        (categoryId) => encode({ kind: 'pick', nonce, categoryId }),
        encode({ kind: 'pickCancel', nonce }),
      ),
    };
  }

  async function onPick(user: User, nonce: string, categoryId: string | null): Promise<CallbackResult> {
    // In one transaction: the pending state is claimed once, so a double tap records once.
    const picked = await deps.transaction(async (r) => {
      const state = await r.chatStates.take(user.id, 'AWAIT_CATEGORY', nonce, deps.now());
      const pending = PickPending.safeParse(state?.payload);
      if (!pending.success) return 'expired' as const;
      if (categoryId === null) return 'cancelled' as const;
      const category = await r.categories.findUsableById(user.id, categoryId);
      if (!usable(category, 'EXPENSE')) return 'expired' as const;
      const p = pending.data;
      if (p.ask) {
        if (category.bucket === 'SAVINGS') return 'expired' as const; // not offered for a "mau X"
        if (p.item) await r.aliases.upsert(user.id, p.item, category.id);
        return { kind: 'ask' as const, purchase: p, category };
      }
      const tx = await r.transactions.create(user.id, {
        type: typeForBucket(category.bucket),
        amount: p.amount,
        categoryId: category.id,
        note: p.item || null,
        rawText: p.rawText,
        occurredAt: new Date(p.occurredAt),
        source: 'BOT',
        parseMethod: 'USER_PICK',
      });
      if (p.item) await r.aliases.upsert(user.id, p.item, category.id);
      return { kind: 'logged' as const, tx, category };
    });
    if (picked === 'expired') return { toast: copy.EXPIRED, edit: { text: copy.EXPIRED } };
    if (picked === 'cancelled') return { edit: { text: copy.PICK_CANCELLED } };
    if (picked.kind === 'ask') {
      const { purchase: p, category } = picked;
      const log = { amount: p.amount, item: p.item, rawText: p.rawText, occurredAt: new Date(p.occurredAt) };
      return { edit: await purchaseCheck(user, { ...log, category, parseMethod: 'USER_PICK' }) };
    }
    return { edit: await logReply(user, picked.tx, picked.category) };
  }

  type Purchase = {
    amount: number;
    item: string;
    rawText: string;
    occurredAt: Date;
    category: Pick<Category, 'id' | 'name' | 'bucket'>;
    parseMethod: ParseMethod;
  };

  /**
   * "mau X" (BUDGET_RULES §6, BOT_SPEC §3.2). WANTS: a verdict and a PENDING PurchaseIntent; nothing is
   * recorded until "Jadi beli". NEEDS: no verdict, the needs remaining and [Catat].
   */
  async function purchaseCheck(user: User, purchase: Purchase): Promise<Reply> {
    const { amount, item, category } = purchase;
    const snap = await deps.budget.snapshot(user, deps.now());
    if (category.bucket !== 'WANTS') {
      const nonce = await setPending(user.id, 'CONFIRM_LOG', {
        amount,
        item,
        categoryId: category.id,
        parseMethod: purchase.parseMethod,
        rawText: purchase.rawText,
        occurredAt: purchase.occurredAt.toISOString(),
      });
      return { text: copy.needsCheck(category, amount, snap), keyboard: kb.needsKeyboard(nonce) };
    }
    const check = checkPurchase(snap, amount);
    const intent = await repos.intents.create(user.id, {
      item,
      amount,
      categoryId: category.id,
      verdict: check.verdict,
      localDate: toLocalDate(purchase.occurredAt),
      expiresAt: new Date(deps.now().getTime() + INTENT_TTL_MS),
    });
    const endsOnSunday = isoWeekday(snap.segment.end) === 7;
    const until =
      snap.segment.end === snap.today ? 'hari ini' : endsOnSunday ? 'Minggu' : copy.formatDate(snap.segment.end);
    return {
      text: copy.verdict({ check, item, until, endsOnSunday }, deps.random),
      keyboard: kb.purchaseKeyboard(intent.id, copy.itemEmoji(item)),
      asksIncome: check.verdict === 'NO_BUDGET',
    };
  }

  /** Jadi beli / Ga jadi, scoped to the caller. A second tap, or another user's, changes nothing. */
  async function onIntent(user: User, intentId: string, op: 'buy' | 'skip'): Promise<CallbackResult> {
    const now = deps.now();
    const intent = await repos.intents.findById(user.id, intentId);
    if (!intent) return { toast: copy.INTENT_NOT_FOUND };
    if (intent.status === 'BOUGHT' || intent.status === 'SKIPPED') return { toast: copy.INTENT_DECIDED };
    if (intent.status === 'EXPIRED' || intent.expiresAt <= now)
      return { toast: copy.EXPIRED, edit: { text: copy.EXPIRED } };

    if (op === 'skip') {
      if (!(await repos.intents.markSkipped(user.id, intent.id, now))) return { toast: copy.INTENT_DECIDED };
      const week = weekOf(todayWib(now));
      const saved = await repos.intents.sumSkipped(user.id, week.start, week.end);
      return { edit: { text: copy.skipped(intent.amount, saved.amount, deps.random) } };
    }

    // Record the expense and mark the intent BOUGHT together: if the intent was decided meanwhile, nothing is recorded.
    let tx;
    try {
      tx = await deps.transaction(async (r) => {
        const created = await r.transactions.create(user.id, {
          type: 'EXPENSE',
          amount: intent.amount,
          categoryId: intent.categoryId,
          note: intent.item || null,
          rawText: null,
          occurredAt: now,
          source: 'BOT',
          parseMethod: 'RULE', // PurchaseIntent doesn't keep how the category was found
        });
        if (!(await r.intents.markBought(user.id, intent.id, created.id, now))) throw new IntentTaken();
        return created;
      });
    } catch (err) {
      if (err instanceof IntentTaken) return { toast: copy.INTENT_DECIDED };
      throw err;
    }
    const snap = await deps.budget.snapshot(user, now);
    return { edit: { text: copy.bought(intent.item, snap), keyboard: kb.txKeyboard(tx.id) } };
  }

  /** [Catat] under a "mau" for a NEEDS item. */
  async function onLogNeeds(user: User, nonce: string): Promise<CallbackResult> {
    const state = await repos.chatStates.take(user.id, 'CONFIRM_LOG', nonce, deps.now());
    const pending = NeedsPending.safeParse(state?.payload);
    const category = pending.success ? await repos.categories.findUsableById(user.id, pending.data.categoryId) : null;
    if (!pending.success || !usable(category, 'EXPENSE')) return { toast: copy.EXPIRED, edit: { text: copy.EXPIRED } };
    const p = pending.data;
    return {
      edit: await record(user, {
        type: typeForBucket(category.bucket),
        amount: p.amount,
        category,
        item: p.item,
        rawText: p.rawText,
        occurredAt: new Date(p.occurredAt),
        parseMethod: p.parseMethod,
      }),
    };
  }

  async function onAmount(user: User, nonce: string, confirmed: boolean): Promise<CallbackResult> {
    const state = await repos.chatStates.take(user.id, 'CONFIRM_AMOUNT', nonce, deps.now());
    const pending = AmountPending.safeParse(state?.payload);
    if (!pending.success || pending.data.candidate === undefined)
      return { toast: copy.EXPIRED, edit: { text: copy.EXPIRED } };
    if (!confirmed) return { edit: { text: copy.AMOUNT_RETYPE } };
    const p = pending.data;
    // The candidate written out in full ("kopi 20000") reads as a plain amount.
    const text = `${p.base} ${p.candidate}`;
    return { edit: await processText(user, { text, rawText: p.rawText, occurredAt: new Date(p.occurredAt) }) };
  }

  async function onTx(user: User, txId: string, op: kb.TxOp): Promise<CallbackResult> {
    const tx = await repos.transactions.findById(user.id, txId);
    if (!tx) return { toast: copy.TX_NOT_FOUND };
    switch (op) {
      case 'cat': {
        const categories = (await repos.categories.listUsable(user.id)).filter((c) => usable(c, tx.type));
        const markup = kb.categoryKeyboard(
          categories,
          (categoryId) => encode({ kind: 'setCategory', txId: tx.id, categoryId }),
          encode({ kind: 'tx', txId: tx.id, op: 'back' }),
        );
        return { toast: copy.PICK_NEW_CATEGORY, markup };
      }
      case 'back':
        return { markup: kb.txKeyboard(tx.id) };
      case 'undo':
        return { reply: { text: copy.confirmDelete(summary(tx)), keyboard: kb.confirmDeleteKeyboard(tx.id) } };
      case 'del':
        if (!(await repos.transactions.softDelete(user.id, tx.id, deps.now()))) return { toast: copy.TX_NOT_FOUND };
        return { edit: { text: copy.txDeleted(summary(tx)) } };
      case 'no':
        return { edit: { text: copy.DELETE_CANCELLED } };
    }
  }

  /** ✏️ Ganti kategori → a category: update the transaction and learn the item as an alias (BOT_SPEC §2.3). */
  async function onSetCategory(user: User, txId: string, categoryId: string): Promise<CallbackResult> {
    const tx = await repos.transactions.findById(user.id, txId);
    if (!tx) return { toast: copy.TX_NOT_FOUND };
    const category = await repos.categories.findUsableById(user.id, categoryId);
    if (!usable(category, tx.type)) return { toast: copy.CATEGORY_UNAVAILABLE };
    const type = typeForBucket(category.bucket);
    const updated = await deps.transaction(async (r) => {
      if (!(await r.transactions.update(user.id, tx.id, { categoryId: category.id, type, parseMethod: 'USER_PICK' })))
        return false;
      const keyword = normalize(tx.note ?? '');
      if (keyword) await r.aliases.upsert(user.id, keyword, category.id);
      return true;
    });
    if (!updated) return { toast: copy.TX_NOT_FOUND };
    return {
      toast: copy.CATEGORY_CHANGED,
      edit: await logReply(user, { id: tx.id, type, amount: tx.amount }, category),
    };
  }

  return {
    /** Any text that isn't a command. An amount-only answer completes a pending "Berapa duitnya?". */
    async onText(user: User, input: MessageInput): Promise<Reply> {
      const pending = await repos.chatStates.get(user.id, deps.now());
      if (pending) {
        await repos.chatStates.clear(user.id); // one question at a time: a new message replaces it
        const answer = AmountPending.safeParse(pending.payload);
        if (pending.kind !== 'AWAIT_CATEGORY' && answer.success && isAmountOnly(input.text)) {
          const p = answer.data;
          return processText(user, {
            text: `${p.base} ${input.text}`,
            rawText: `${p.rawText}\n${input.rawText}`,
            occurredAt: new Date(p.occurredAt),
          });
        }
      }
      return processText(user, input);
    },

    async onCallback(user: User, data: string): Promise<CallbackResult> {
      const action = kb.parseCallback(data);
      switch (action?.kind) {
        case 'tx':
          return onTx(user, action.txId, action.op);
        case 'setCategory':
          return onSetCategory(user, action.txId, action.categoryId);
        case 'pick':
          return onPick(user, action.nonce, action.categoryId);
        case 'pickCancel':
          return onPick(user, action.nonce, null);
        case 'amount':
          return onAmount(user, action.nonce, action.confirmed);
        case 'intent':
          return onIntent(user, action.intentId, action.op);
        case 'logNeeds':
          return onLogNeeds(user, action.nonce);
        default:
          return {}; // not ours (or forged): just acknowledge
      }
    },

    /** /pemasukan <nominal>: "pemasukan" is an income trigger, so this is the same as typing it. */
    pemasukan(user: User, args: string, input: MessageInput): Promise<Reply> {
      return processText(user, { ...input, text: `pemasukan ${args}` });
    },

    async sisa(user: User): Promise<Reply> {
      const snap = await deps.budget.snapshot(user, deps.now());
      return snap.state === 'NO_BUDGET' ? { text: copy.NO_BUDGET, asksIncome: true } : { text: copy.sisa(snap) };
    },

    async riwayat(user: User): Promise<Reply> {
      const txs = (await repos.transactions.latest(user.id, HISTORY_SIZE)).map((tx) => ({ id: tx.id, ...summary(tx) }));
      if (txs.length === 0) return { text: copy.HISTORY_EMPTY };
      return { text: copy.history(txs), keyboard: kb.historyKeyboard(txs) };
    },

    async undo(user: User): Promise<Reply> {
      const since = new Date(deps.now().getTime() - UNDO_WINDOW_MS);
      const [tx] = await repos.transactions.latest(user.id, 1, since);
      if (!tx) return { text: copy.NOTHING_TO_UNDO };
      return { text: copy.confirmDelete(summary(tx)), keyboard: kb.confirmDeleteKeyboard(tx.id) };
    },

    async kategori(user: User): Promise<Reply> {
      return { text: copy.categoryList(await repos.categories.listUsable(user.id)) };
    },

    /**
     * PRD F12: on the first message of a month without income, ask for it once. "First" is claimed with a
     * counter row (`income-nudge:<userId>:<YYYY-MM>`, expiring when the month ends); only the first claim sends.
     */
    async incomeNudge(user: User): Promise<Reply | null> {
      const month = monthOf(todayWib(deps.now()));
      if (await repos.transactions.hasIncomeInRange(user.id, monthStart(month), monthEnd(month))) return null;
      const expiresAt = startOfDayWib(addDays(monthEnd(month), 1));
      const count = await repos.rateLimits.hit(`income-nudge:${user.id}:${month}`, expiresAt);
      return count === 1 ? { text: copy.incomeNudge(deps.random) } : null;
    },
  };
}

export type Flows = ReturnType<typeof createFlows>;
