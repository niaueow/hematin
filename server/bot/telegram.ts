import { GrammyError, type Api } from 'grammy';

// Outbound messages for cron jobs (ARCHITECTURE §6): retry once on 429 with retry_after, and turn a
// 403 ("bot was blocked by the user") into BotBlockedError so the job can mark the user.

export class BotBlockedError extends Error {
  constructor() {
    super('Telegram: bot blocked by the user');
    this.name = 'BotBlockedError';
  }
}

export type SendText = (chatId: string, text: string) => Promise<void>;

/** Longest 429 wait we'll sit through inside one serverless request. */
const MAX_RETRY_AFTER_S = 5;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createTelegramSender(api: Pick<Api, 'sendMessage'>, wait: (ms: number) => Promise<void> = sleep) {
  const send: SendText = async (chatId, text) => {
    for (let attempt = 1; ; attempt++) {
      try {
        await api.sendMessage(chatId, text);
        return;
      } catch (err) {
        if (!(err instanceof GrammyError)) throw err;
        if (err.error_code === 403) throw new BotBlockedError();
        const retryAfter = err.parameters.retry_after;
        if (err.error_code !== 429 || attempt > 1 || retryAfter === undefined || retryAfter > MAX_RETRY_AFTER_S)
          throw err;
        await wait(retryAfter * 1000);
      }
    }
  };
  return send;
}
