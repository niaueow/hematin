import { randomBytes } from 'node:crypto';
import { Bot, Composer, type Context } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import { createBudgetService } from '../budget/service.js';
import type { User } from '../db/generated/client.js';
import type { AliasRepo } from '../db/repos/aliasRepo.js';
import type { CategoryRepo } from '../db/repos/categoryRepo.js';
import type { ChatStateRepo } from '../db/repos/chatStateRepo.js';
import type { IntentRepo } from '../db/repos/intentRepo.js';
import type { InviteRepo } from '../db/repos/inviteRepo.js';
import type { NoSpendRepo } from '../db/repos/noSpendRepo.js';
import type { ProcessedUpdateRepo } from '../db/repos/processedUpdateRepo.js';
import type { RateLimitRepo } from '../db/repos/rateLimitRepo.js';
import type { TxRepo } from '../db/repos/txRepo.js';
import type { UserRepo } from '../db/repos/userRepo.js';
import { hitRateLimit, MESSAGES_PER_MINUTE } from '../lib/rateLimit.js';
import { sha256Hex } from '../lib/secrets.js';
import * as copy from './copy.js';
import { createFlows, type CallbackResult, type FlowDeps, type MessageInput, type Reply } from './flows.js';
import { ignoreNotModified, isBlockedError } from './telegram.js';

// The grammY bot (ARCHITECTURE §3.1). Middleware order:
//   1. idempotency (ProcessedUpdate)  2. private chats only  3. resolve user (strangers stop here)
//   4. rate limit (known users)       5. income nudge (after the handler)  6. handlers (logic in flows.ts)
// Strangers (unknown or disabled users) get exactly one canned reply and cause no DB writes besides the
// ProcessedUpdate row, except the two ways in: the one-time owner bootstrap and a valid invite (SECURITY §2).

export type BotContext = Context & {
  user?: User;
  /** Set when a reply already asked for this month's income, so the nudge stays quiet. */
  incomePrompted?: boolean;
};

export type BotRepos = {
  users: Pick<UserRepo, 'findByTelegramId' | 'ownerExists' | 'create' | 'setBotBlocked'>;
  invites: Pick<InviteRepo, 'create' | 'consume'>;
  processedUpdates: Pick<ProcessedUpdateRepo, 'markProcessed'>;
  rateLimits: Pick<RateLimitRepo, 'hit'>;
  transactions: Pick<
    TxRepo,
    'create' | 'findById' | 'update' | 'softDelete' | 'latest' | 'listUpTo' | 'hasIncomeInRange'
  >;
  categories: Pick<CategoryRepo, 'listUsable' | 'findUsableById'>;
  aliases: Pick<AliasRepo, 'listForUser' | 'upsert'>;
  chatStates: Pick<ChatStateRepo, 'get' | 'set' | 'take' | 'clear'>;
  intents: Pick<IntentRepo, 'create' | 'findById' | 'markBought' | 'markSkipped' | 'sumSkipped'>;
  noSpendDays: Pick<NoSpendRepo, 'mark'>;
};

export type BotDeps = {
  repos: BotRepos;
  /** Runs `fn` in one DB transaction, with repos bound to it. */
  transaction: <T>(fn: (repos: BotRepos) => Promise<T>) => Promise<T>;
  ownerTelegramId: string;
  now: () => Date;
  random?: () => number;
  newInviteCode?: () => string;
  /** Ties buttons to one pending question (keyboards.ts). */
  newNonce?: () => string;
  /** Categorize step 3 (Groq). Optional: without it unknown items go straight to the category buttons. */
  llm?: FlowDeps['llm'];
};

export const INVITE_TTL_HOURS = 48;
/** Telegram deep-link payloads allow [A-Za-z0-9_-], up to 64 characters. Our codes are 22 (16 random bytes). */
const INVITE_CODE = /^[A-Za-z0-9_-]{16,64}$/;
const START = /^\/start(?:@\w+)?(?:\s+(\S+))?\s*$/;

class InviteRejected extends Error {}

export function createBot(token: string, deps: BotDeps, botInfo?: UserFromGetMe): Bot<BotContext> {
  const bot = new Bot<BotContext>(token, botInfo ? { botInfo } : {});
  const { repos } = deps;
  const newInviteCode = deps.newInviteCode ?? (() => randomBytes(16).toString('base64url'));
  const flows = createFlows({
    repos,
    transaction: deps.transaction,
    budget: createBudgetService({ txRepo: repos.transactions, intentRepo: repos.intents }),
    now: deps.now,
    newNonce: deps.newNonce ?? (() => randomBytes(6).toString('base64url')),
    random: deps.random,
    llm: deps.llm,
  });
  const app = new Composer<BotContext>();

  // 1. Idempotency: Telegram retries an update until it gets a 2xx. Seen before → ack and stop.
  app.use(async (ctx, next) => {
    if (!(await repos.processedUpdates.markProcessed(BigInt(ctx.update.update_id)))) return;
    await next();
  });

  // 2. Private chats only. In a group: one reply, then leave (BOT_SPEC §1).
  app.use(async (ctx, next) => {
    if (!ctx.chat) return;
    if (ctx.chat.type !== 'private') {
      if (ctx.callbackQuery) await ctx.answerCallbackQuery();
      else if (ctx.message) {
        await ctx.reply(copy.PRIVATE_CHAT_ONLY);
        await ctx.leaveChat();
      }
      return;
    }
    await next();
  });

  // 3. Resolve the user. Strangers are handled here and never reach the rest.
  app.use(async (ctx, next) => {
    const from = ctx.from;
    if (!from || from.is_bot) return;
    const user = await repos.users.findByTelegramId(BigInt(from.id));
    if (user?.status !== 'ACTIVE') {
      await handleStranger(ctx, user !== null && user !== undefined);
      return;
    }
    if (user.botBlocked) await repos.users.setBotBlocked(user.id, false); // they're talking to us again
    ctx.user = user;
    await next();
  });

  async function handleStranger(ctx: BotContext, exists: boolean) {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery();
      return;
    }
    const from = ctx.from as NonNullable<BotContext['from']>;
    const start = START.exec(ctx.message?.text ?? '');
    if (start && !exists) {
      const profile = {
        telegramId: BigInt(from.id),
        telegramUsername: from.username ?? null,
        firstName: from.first_name,
      };
      if (String(from.id) === deps.ownerTelegramId) {
        const owner = await deps.transaction(async (r) =>
          (await r.users.ownerExists()) ? null : r.users.create({ ...profile, role: 'OWNER' }),
        );
        if (owner) {
          await ctx.reply(copy.welcomeOwner(owner.firstName, deps.random));
          return;
        }
      }
      const code = start[1];
      if (code !== undefined) {
        const joined = INVITE_CODE.test(code) && (await redeemInvite(code, profile));
        await ctx.reply(joined ? copy.welcomeInvited(from.first_name, deps.random) : copy.INVITE_INVALID);
        return;
      }
    }
    await ctx.reply(copy.PRIVATE_BOT);
  }

  /** Creates the user and uses up the invite in one transaction; any failure rolls both back. */
  async function redeemInvite(code: string, profile: Omit<Parameters<BotRepos['users']['create']>[0], 'role'>) {
    try {
      await deps.transaction(async (r) => {
        const user = await r.users.create({ ...profile, role: 'MEMBER' });
        if (!(await r.invites.consume(sha256Hex(code), user.id, deps.now()))) throw new InviteRejected();
      });
      return true;
    } catch (err) {
      if (err instanceof InviteRejected) return false;
      throw err;
    }
  }

  // 4. Rate limit: 20 messages per user per minute (SECURITY §5). Reply once when it trips, then stay quiet.
  app.use(async (ctx, next) => {
    const result = await hitRateLimit(repos.rateLimits, MESSAGES_PER_MINUTE, userOf(ctx).id, deps.now());
    if (result.allowed) {
      await next();
      return;
    }
    if (ctx.callbackQuery) await ctx.answerCallbackQuery();
    else if (result.justExceeded) await ctx.reply(copy.rateLimited(deps.random));
  });

  // 5. Income nudge (PRD F12): once, on the first message of a month without income. It runs after the
  // handler, so a message that records the income doesn't get it.
  app.use(async (ctx, next) => {
    await next();
    if (!ctx.message) return;
    const nudge = await flows.incomeNudge(userOf(ctx));
    if (nudge && !ctx.incomePrompted) await send(ctx, nudge);
  });

  // 6. Handlers.
  app.command('start', (ctx) => ctx.reply(copy.welcomeBack(userOf(ctx).firstName, deps.random)));
  app.command(['help', 'bantuan'], (ctx) => ctx.reply(copy.HELP));

  app.command('invite', async (ctx) => {
    const user = userOf(ctx);
    if (user.role !== 'OWNER') {
      await ctx.reply(copy.INVITE_OWNER_ONLY);
      return;
    }
    const code = newInviteCode();
    const expiresAt = new Date(deps.now().getTime() + INVITE_TTL_HOURS * 3_600_000);
    await repos.invites.create(user.id, { codeHash: sha256Hex(code), expiresAt });
    await ctx.reply(copy.inviteCreated(`https://t.me/${ctx.me.username}?start=${code}`, INVITE_TTL_HOURS), {
      link_preview_options: { is_disabled: true },
    });
  });

  app.command('sisa', async (ctx) => send(ctx, await flows.sisa(userOf(ctx))));
  app.command('pemasukan', async (ctx) => send(ctx, await flows.pemasukan(userOf(ctx), ctx.match, input(ctx))));
  app.command('riwayat', async (ctx) => send(ctx, await flows.riwayat(userOf(ctx))));
  app.command('undo', async (ctx) => send(ctx, await flows.undo(userOf(ctx))));
  app.command('kategori', async (ctx) => send(ctx, await flows.kategori(userOf(ctx))));
  app.command('dashboard', (ctx) => ctx.reply(copy.COMING_SOON)); // TODO(Phase 2): magic link
  app.on('message:entities:bot_command', (ctx) => ctx.reply(copy.HELP));
  app.on('message:text', async (ctx) => send(ctx, await flows.onText(userOf(ctx), input(ctx))));
  app.on('callback_query:data', async (ctx) =>
    applyCallback(ctx, await flows.onCallback(userOf(ctx), ctx.callbackQuery.data)),
  );
  app.on('callback_query', (ctx) => ctx.answerCallbackQuery());

  // A user who blocked the bot can't be replied to. reportBlocked (telegram.ts) has marked them; don't fail
  // the update (Telegram would retry it). Anything else propagates → 500 → logged.
  bot.errorBoundary((err) => {
    if (!isBlockedError(err.error)) throw err.error;
  }, app);

  return bot;
}

function userOf(ctx: BotContext): User {
  if (!ctx.user) throw new Error('bot: handler reached without a resolved user');
  return ctx.user;
}

/** The message as the pipeline sees it. occurredAt is when it was sent, not when we got it. */
function input(ctx: BotContext): MessageInput {
  const message = ctx.message as NonNullable<BotContext['message']>;
  const text = message.text ?? '';
  return { text, rawText: text, occurredAt: new Date(message.date * 1000) };
}

async function send(ctx: BotContext, reply: Reply) {
  if (reply.asksIncome) ctx.incomePrompted = true;
  await ctx.reply(reply.text, reply.keyboard ? { reply_markup: reply.keyboard } : {});
}

async function applyCallback(ctx: BotContext, result: CallbackResult) {
  await ctx.answerCallbackQuery(result.toast ? { text: result.toast } : {});
  if (result.edit) {
    const { text, keyboard } = result.edit;
    await ignoreNotModified(ctx.editMessageText(text, keyboard ? { reply_markup: keyboard } : {}));
  }
  if (result.markup) await ignoreNotModified(ctx.editMessageReplyMarkup({ reply_markup: result.markup }));
  if (result.reply) await send(ctx, result.reply);
}
