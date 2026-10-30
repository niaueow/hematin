import { GrammyError } from 'grammy';
import { describe, expect, it, vi } from 'vitest';
import { BotBlockedError, createTelegramSender } from '@server/bot/telegram.js';

const apiError = (code: number, retryAfter?: number) =>
  new GrammyError(
    'Call to sendMessage failed',
    {
      ok: false,
      error_code: code,
      description: 'test',
      ...(retryAfter !== undefined && { parameters: { retry_after: retryAfter } }),
    },
    'sendMessage',
    {},
  );

function sender(...outcomes: (Error | undefined)[]) {
  const sendMessage = vi.fn(() => {
    const next = outcomes.shift();
    return next ? Promise.reject(next) : Promise.resolve({});
  });
  const wait = vi.fn(() => Promise.resolve());
  return { send: createTelegramSender({ sendMessage } as never, wait), sendMessage, wait };
}

describe('telegram sender', () => {
  it('sends the text to the chat', async () => {
    const { send, sendMessage } = sender(undefined);
    await send('111', 'halo');
    expect(sendMessage).toHaveBeenCalledWith('111', 'halo');
  });

  it('403 → BotBlockedError', async () => {
    await expect(sender(apiError(403)).send('111', 'x')).rejects.toBeInstanceOf(BotBlockedError);
  });

  it('429 → waits retry_after once, then succeeds', async () => {
    const { send, sendMessage, wait } = sender(apiError(429, 2), undefined);
    await send('111', 'x');
    expect(wait).toHaveBeenCalledWith(2000);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['a second 429', [apiError(429, 1), apiError(429, 1)], 2],
    ['429 with a long retry_after', [apiError(429, 30)], 1],
    ['429 without retry_after', [apiError(429)], 1],
    ['other API errors', [apiError(400)], 1],
    ['non-Telegram errors', [new Error('network')], 1],
  ])('%s are rethrown', async (_name, errors, calls) => {
    const { send, sendMessage } = sender(...errors);
    await expect(send('111', 'x')).rejects.toBeInstanceOf(Error);
    expect(sendMessage).toHaveBeenCalledTimes(calls);
  });
});
