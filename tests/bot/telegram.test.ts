import { GrammyError, InlineKeyboard, type Transformer } from 'grammy';
import { describe, expect, it, vi } from 'vitest';
import {
  BotBlockedError,
  createTelegramSender,
  ignoreNotModified,
  reportBlocked,
  retryOn429,
} from '@server/bot/telegram.js';

type Res =
  | { ok: true; result: unknown }
  | { ok: false; error_code: number; description: string; parameters?: { retry_after?: number } };
const ok: Res = { ok: true, result: {} };
const fail = (code: number, retryAfter?: number): Res => ({
  ok: false,
  error_code: code,
  description: 'test',
  ...(retryAfter !== undefined && { parameters: { retry_after: retryAfter } }),
});

/** Runs a transformer over a fake API that answers with `responses` in order. */
async function run(transformer: Transformer, responses: Res[], payload: Record<string, unknown> = { chat_id: 111 }) {
  const prev = vi.fn(() => Promise.resolve(responses.shift() as never));
  const result = await transformer(prev as never, 'sendMessage', payload as never);
  return { result, calls: prev.mock.calls.length };
}

describe('retryOn429', () => {
  it('waits retry_after once, then retries', async () => {
    const wait = vi.fn(() => Promise.resolve());
    const { result, calls } = await run(retryOn429(wait), [fail(429, 2), ok]);
    expect(result).toEqual(ok);
    expect(calls).toBe(2);
    expect(wait).toHaveBeenCalledWith(2000);
  });

  it.each([
    ['a second 429 is returned as is', [fail(429, 1), fail(429, 1)], 2],
    ['a long retry_after is not waited for', [fail(429, 30)], 1],
    ['429 without retry_after', [fail(429)], 1],
    ['other errors', [fail(400)], 1],
    ['success', [ok], 1],
  ])('%s', async (_name, responses, expectedCalls) => {
    const { calls } = await run(
      retryOn429(() => Promise.resolve()),
      [...responses],
    );
    expect(calls).toBe(expectedCalls);
  });
});

describe('reportBlocked', () => {
  it('reports the chat id on 403', async () => {
    const onBlocked = vi.fn(() => Promise.resolve());
    const { result } = await run(reportBlocked(onBlocked), [fail(403)]);
    expect(onBlocked).toHaveBeenCalledWith('111');
    expect(result).toMatchObject({ ok: false, error_code: 403 });
  });

  it.each([
    ['other errors', [fail(400)], { chat_id: 111 }],
    ['success', [ok], { chat_id: 111 }],
    ['calls without a chat', [fail(403)], {}],
  ])('ignores %s', async (_name, responses, payload) => {
    const onBlocked = vi.fn(() => Promise.resolve());
    await run(reportBlocked(onBlocked), [...responses], payload);
    expect(onBlocked).not.toHaveBeenCalled();
  });
});

describe('createTelegramSender (cron)', () => {
  const apiError = (code: number) =>
    new GrammyError('Call to sendMessage failed', { ok: false, error_code: code, description: 'x' }, 'sendMessage', {});

  it('sends the text', async () => {
    const sendMessage = vi.fn(() => Promise.resolve({}));
    await createTelegramSender({ sendMessage } as never)('111', 'halo');
    expect(sendMessage).toHaveBeenCalledWith('111', 'halo');
  });

  it('sends a keyboard when given one', async () => {
    const sendMessage = vi.fn(() => Promise.resolve({}));
    const keyboard = new InlineKeyboard().text('ok', 'ns:2026-11-02');
    await createTelegramSender({ sendMessage } as never)('111', 'halo', { keyboard });
    expect(sendMessage).toHaveBeenCalledWith('111', 'halo', { reply_markup: keyboard });
  });

  it('403 → BotBlockedError; anything else is rethrown', async () => {
    const blocked = vi.fn(() => Promise.reject(apiError(403)));
    await expect(createTelegramSender({ sendMessage: blocked })('1', 'x')).rejects.toBeInstanceOf(BotBlockedError);
    const other = vi.fn(() => Promise.reject(apiError(400)));
    await expect(createTelegramSender({ sendMessage: other })('1', 'x')).rejects.toBeInstanceOf(GrammyError);
    const network = vi.fn(() => Promise.reject(new Error('net')));
    await expect(createTelegramSender({ sendMessage: network })('1', 'x')).rejects.toThrow('net');
  });
});

describe('ignoreNotModified', () => {
  const apiError = (code: number, description: string) =>
    new GrammyError(
      'Call to editMessageText failed',
      { ok: false, error_code: code, description },
      'editMessageText',
      {},
    );

  it('swallows "message is not modified" (the same button pressed twice)', async () => {
    const notModified = apiError(
      400,
      'Bad Request: message is not modified: specified new message content is the same',
    );
    await expect(ignoreNotModified(Promise.reject(notModified))).resolves.toBeUndefined();
    await expect(ignoreNotModified(Promise.resolve(true))).resolves.toBeUndefined();
  });

  it('rethrows everything else', async () => {
    const notFound = apiError(400, 'Bad Request: message to edit not found');
    await expect(ignoreNotModified(Promise.reject(notFound))).rejects.toBe(notFound);
    await expect(ignoreNotModified(Promise.reject(apiError(403, 'Forbidden')))).rejects.toThrow();
    await expect(ignoreNotModified(Promise.reject(new Error('net')))).rejects.toThrow('net');
  });
});
