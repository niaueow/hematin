import { GrammyError, type Api, type Transformer } from 'grammy';

// Outbound Telegram calls (ARCHITECTURE §6). Installed as grammY API transformers, so the bot's replies and
// the cron jobs' messages behave the same:
// - 429 Too Many Requests → wait `retry_after` (if short) and retry once.
// - 403 Forbidden ("bot was blocked by the user") → report the chat id, so the user is marked botBlocked.

/** Longest 429 wait we'll sit through inside one serverless request. */
export const MAX_RETRY_AFTER_S = 5;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function retryOn429(wait: (ms: number) => Promise<void> = sleep): Transformer {
  return async (prev, method, payload, signal) => {
    const res = await prev(method, payload, signal);
    const retryAfter = res.ok ? undefined : res.parameters?.retry_after;
    if (res.ok || res.error_code !== 429 || retryAfter === undefined || retryAfter > MAX_RETRY_AFTER_S) return res;
    await wait(retryAfter * 1000);
    return prev(method, payload, signal);
  };
}

/** Calls `onBlocked(chatId)` when Telegram answers 403 for a call addressed to a chat. The error still surfaces. */
export function reportBlocked(onBlocked: (chatId: string) => Promise<void>): Transformer {
  return async (prev, method, payload, signal) => {
    const res = await prev(method, payload, signal);
    const chatId = (payload as { chat_id?: unknown } | undefined)?.chat_id;
    if (!res.ok && res.error_code === 403 && (typeof chatId === 'number' || typeof chatId === 'string')) {
      await onBlocked(String(chatId));
    }
    return res;
  };
}

export class BotBlockedError extends Error {
  constructor() {
    super('Telegram: bot blocked by the user');
    this.name = 'BotBlockedError';
  }
}

export const isBlockedError = (err: unknown) => err instanceof GrammyError && err.error_code === 403;

/**
 * Edits that change nothing (pressing the same button twice) get "400: message is not modified". That's not a
 * failure: ignore it, so the update doesn't end in a 500.
 */
export async function ignoreNotModified(edit: Promise<unknown>): Promise<void> {
  try {
    await edit;
  } catch (err) {
    if (err instanceof GrammyError && err.error_code === 400 && err.description.includes('message is not modified'))
      return;
    throw err;
  }
}

export type SendText = (chatId: string, text: string) => Promise<void>;

/** For cron jobs: send a plain message; a 403 becomes BotBlockedError. Install retryOn429 on `api` first. */
export function createTelegramSender(api: Pick<Api, 'sendMessage'>): SendText {
  return async (chatId, text) => {
    try {
      await api.sendMessage(chatId, text);
    } catch (err) {
      if (isBlockedError(err)) throw new BotBlockedError();
      throw err;
    }
  };
}
