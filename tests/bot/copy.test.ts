import { describe, expect, it } from 'vitest';
import * as copy from '@server/bot/copy.js';

// BOT_SPEC §5: ≤ 5 lines, ≤ 2 emoji. Every variant of every M4 message.
const emoji = /\p{Extended_Pictographic}/gu;
const variants = (fn: (name: string | null, random: () => number) => string) => [
  fn('Nia', () => 0),
  fn('Nia', () => 0.99),
];

const messages: [string, string][] = [
  ['PRIVATE_BOT', copy.PRIVATE_BOT],
  ['PRIVATE_CHAT_ONLY', copy.PRIVATE_CHAT_ONLY],
  ['INVITE_INVALID', copy.INVITE_INVALID],
  ['INVITE_OWNER_ONLY', copy.INVITE_OWNER_ONLY],
  ['HELP', copy.HELP],
  ['COMING_SOON', copy.COMING_SOON],
  ['LOGGING_COMING_SOON', copy.LOGGING_COMING_SOON],
  ['inviteCreated', copy.inviteCreated('https://t.me/hematin_bot?start=CODE', 48)],
  ...variants(copy.welcomeOwner).map((t): [string, string] => ['welcomeOwner', t]),
  ...variants(copy.welcomeInvited).map((t): [string, string] => ['welcomeInvited', t]),
  ...variants(copy.welcomeBack).map((t): [string, string] => ['welcomeBack', t]),
  ['rateLimited 0', copy.rateLimited(() => 0)],
  ['rateLimited 1', copy.rateLimited(() => 0.99)],
  ...copy.INCOME_REMINDER.map((t, i): [string, string] => [`INCOME_REMINDER ${i}`, t]),
];

describe('copy rules', () => {
  it.each(messages)('%s: ≤ 5 lines, ≤ 2 emoji', (_name, text) => {
    expect(text.split('\n').length).toBeLessThanOrEqual(5);
    expect((text.match(emoji) ?? []).length).toBeLessThanOrEqual(2);
  });

  it('the canned stranger reply is the BOT_SPEC §1 text', () => {
    expect(copy.PRIVATE_BOT).toBe('Bot ini private, minta link undangan dulu ya 🙏');
  });

  it('variants differ', () => {
    expect(new Set(variants(copy.welcomeInvited)).size).toBe(2);
    expect(copy.rateLimited(() => 0)).not.toBe(copy.rateLimited(() => 0.99));
  });

  it('welcome for invitees and the owner asks for this month’s income', () => {
    for (const text of [...variants(copy.welcomeInvited), ...variants(copy.welcomeOwner)])
      expect(text).toMatch(/uang jajan/);
  });
});

describe('displayName', () => {
  it.each([
    ['Nia', 'Nia'],
    ['  Nia   Putri ', 'Nia Putri'],
    [null, 'kamu'],
    ['   ', 'kamu'],
    ['x'.repeat(50), 'x'.repeat(32)],
  ])('%j → %j', (input, expected) => {
    expect(copy.displayName(input)).toBe(expected);
  });
});
