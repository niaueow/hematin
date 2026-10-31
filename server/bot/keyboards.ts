import { InlineKeyboard } from 'grammy';
import type { Bucket } from '../budget/engine.js';
import * as copy from './copy.js';

// Inline keyboards and their callback data. Telegram limits callback data to 64 bytes, so it's a short
// prefix + ids (ARCHITECTURE §3.2). Whatever a button carries is untrusted input: the handler loads the
// record again, scoped to whoever pressed it (SECURITY §3.3).
//
//   tx:<txId>:cat|back|undo|del|no|ok  a transaction's buttons (ok = 👍 confirm an LLM category)
//   tc:<txId>:<categoryId>           "Ganti kategori" → this category
//   pk:<nonce>:<categoryId>          pick a category for a pending log (USER_PICK)
//   px:<nonce>                       cancel that pick
//   am:<nonce>:y|n                   "Maksudnya Rp20.000?"
//   pi:<intentId>:buy|skip           "mau X": Jadi beli / Ga jadi (ARCHITECTURE §3.2)
//   lg:<nonce>                       "mau" + a NEEDS item: Catat
//   ns:<YYYY-MM-DD>                  daily reminder: "Hari ini emang ga keluar duit"
// A nonce ties a button to one pending ChatState, so buttons from an older question do nothing.

export const MAX_CALLBACK_BYTES = 64;

export type TxOp = 'cat' | 'back' | 'undo' | 'del' | 'no' | 'ok';

export type CallbackAction =
  | { kind: 'tx'; txId: string; op: TxOp }
  | { kind: 'setCategory'; txId: string; categoryId: string }
  | { kind: 'pick'; nonce: string; categoryId: string }
  | { kind: 'pickCancel'; nonce: string }
  | { kind: 'amount'; nonce: string; confirmed: boolean }
  | { kind: 'intent'; intentId: string; op: 'buy' | 'skip' }
  | { kind: 'logNeeds'; nonce: string }
  | { kind: 'noSpend'; date: string };

function format(action: CallbackAction): string {
  switch (action.kind) {
    case 'tx':
      return `tx:${action.txId}:${action.op}`;
    case 'setCategory':
      return `tc:${action.txId}:${action.categoryId}`;
    case 'pick':
      return `pk:${action.nonce}:${action.categoryId}`;
    case 'pickCancel':
      return `px:${action.nonce}`;
    case 'amount':
      return `am:${action.nonce}:${action.confirmed ? 'y' : 'n'}`;
    case 'intent':
      return `pi:${action.intentId}:${action.op}`;
    case 'logNeeds':
      return `lg:${action.nonce}`;
    case 'noSpend':
      return `ns:${action.date}`;
  }
}

export function encodeCallback(action: CallbackAction): string {
  const data = format(action);
  if (Buffer.byteLength(data) > MAX_CALLBACK_BYTES) throw new RangeError(`callback data over 64 bytes: ${data}`);
  return data;
}

const ID = '[A-Za-z0-9_-]{1,40}';
const PATTERNS: [RegExp, (m: string[]) => CallbackAction][] = [
  [new RegExp(`^tx:(${ID}):(cat|back|undo|del|no|ok)$`), (m) => ({ kind: 'tx', txId: m[1]!, op: m[2] as TxOp })],
  [new RegExp(`^tc:(${ID}):(${ID})$`), (m) => ({ kind: 'setCategory', txId: m[1]!, categoryId: m[2]! })],
  [new RegExp(`^pk:(${ID}):(${ID})$`), (m) => ({ kind: 'pick', nonce: m[1]!, categoryId: m[2]! })],
  [new RegExp(`^px:(${ID})$`), (m) => ({ kind: 'pickCancel', nonce: m[1]! })],
  [new RegExp(`^am:(${ID}):(y|n)$`), (m) => ({ kind: 'amount', nonce: m[1]!, confirmed: m[2] === 'y' })],
  [new RegExp(`^pi:(${ID}):(buy|skip)$`), (m) => ({ kind: 'intent', intentId: m[1]!, op: m[2] as 'buy' | 'skip' })],
  [new RegExp(`^lg:(${ID})$`), (m) => ({ kind: 'logNeeds', nonce: m[1]! })],
  [/^ns:(\d{4}-\d{2}-\d{2})$/, (m) => ({ kind: 'noSpend', date: m[1]! })],
];

/** Null for anything we didn't produce. */
export function parseCallback(data: string): CallbackAction | null {
  for (const [pattern, build] of PATTERNS) {
    const match = pattern.exec(data);
    if (match) return build(match);
  }
  return null;
}

// --- keyboards -----------------------------------------------------------------------------------

/** Under every log reply (PRD F5). `confirm`: a 👍 for a category the LLM chose. */
export function txKeyboard(txId: string, options: { confirm?: boolean } = {}) {
  const keyboard = new InlineKeyboard();
  if (options.confirm) keyboard.text(copy.BUTTON.confirmCategory, encodeCallback({ kind: 'tx', txId, op: 'ok' }));
  return keyboard
    .text(copy.BUTTON.changeCategory, encodeCallback({ kind: 'tx', txId, op: 'cat' }))
    .text(copy.BUTTON.undo, encodeCallback({ kind: 'tx', txId, op: 'undo' }));
}

export const confirmDeleteKeyboard = (txId: string) =>
  new InlineKeyboard()
    .text(copy.BUTTON.confirmDelete, encodeCallback({ kind: 'tx', txId, op: 'del' }))
    .text(copy.BUTTON.cancel, encodeCallback({ kind: 'tx', txId, op: 'no' }));

/** Under a purchase check (BOT_SPEC §3.2). */
export const purchaseKeyboard = (intentId: string, emoji: string) =>
  new InlineKeyboard()
    .text(copy.BUTTON.buy(emoji), encodeCallback({ kind: 'intent', intentId, op: 'buy' }))
    .text(copy.BUTTON.skip, encodeCallback({ kind: 'intent', intentId, op: 'skip' }));

/** Under a "mau" for a NEEDS item: no verdict, just a way to record it (BUDGET_RULES §6). */
export const needsKeyboard = (nonce: string) =>
  new InlineKeyboard().text(copy.BUTTON.log, encodeCallback({ kind: 'logNeeds', nonce }));

export const amountKeyboard = (nonce: string, candidate: number) =>
  new InlineKeyboard()
    .text(copy.BUTTON.amountYes(candidate), encodeCallback({ kind: 'amount', nonce, confirmed: true }))
    .text(copy.BUTTON.amountNo, encodeCallback({ kind: 'amount', nonce, confirmed: false }));

/** Categories two per row, then a cancel button. */
export function categoryKeyboard(
  categories: readonly { id: string; name: string; bucket: Bucket }[],
  data: (categoryId: string) => string,
  cancelData: string,
) {
  const keyboard = new InlineKeyboard();
  categories.forEach((c, i) => {
    keyboard.text(copy.BUTTON.category(c.name, c.bucket), data(c.id));
    if (i % 2 === 1) keyboard.row();
  });
  if (categories.length % 2 === 1) keyboard.row();
  return keyboard.text(copy.BUTTON.cancel, cancelData);
}

/** /riwayat: one 🗑 button per transaction. */
export function historyKeyboard(txs: readonly (copy.TxSummary & { id: string })[]) {
  const keyboard = new InlineKeyboard();
  txs.forEach((tx, i) =>
    keyboard.text(copy.BUTTON.historyDelete(i + 1, tx), encodeCallback({ kind: 'tx', txId: tx.id, op: 'undo' })).row(),
  );
  return keyboard;
}

/** Under the daily reminder (BOT_SPEC §4). */
export const noSpendKeyboard = (date: string) =>
  new InlineKeyboard().text(copy.BUTTON.noSpend, encodeCallback({ kind: 'noSpend', date }));
