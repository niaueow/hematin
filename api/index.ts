// The one Vercel Function. vercel.json rewrites every /api/* request here; req.url keeps the
// original path, so Express routes on /api/... as usual. Relative imports only (DECISIONS D-022).
import { createApp } from '../server/app.js';
import { createAuthService, type AuthRepos } from '../server/auth/service.js';
import { createBot, type BotRepos } from '../server/bot/bot.js';
import { createTelegramSender, reportBlocked, retryOn429 } from '../server/bot/telegram.js';
import { getPrisma, type Db } from '../server/db/prisma.js';
import { createAliasRepo } from '../server/db/repos/aliasRepo.js';
import { createCategoryRepo } from '../server/db/repos/categoryRepo.js';
import { createChatStateRepo } from '../server/db/repos/chatStateRepo.js';
import { createCronRunRepo } from '../server/db/repos/cronRunRepo.js';
import { createIntentRepo } from '../server/db/repos/intentRepo.js';
import { createInviteRepo } from '../server/db/repos/inviteRepo.js';
import { createMagicTokenRepo } from '../server/db/repos/magicTokenRepo.js';
import { createNoSpendRepo } from '../server/db/repos/noSpendRepo.js';
import { createProcessedUpdateRepo } from '../server/db/repos/processedUpdateRepo.js';
import { createRateLimitRepo } from '../server/db/repos/rateLimitRepo.js';
import { createSessionRepo } from '../server/db/repos/sessionRepo.js';
import { createTxRepo } from '../server/db/repos/txRepo.js';
import { createUserRepo } from '../server/db/repos/userRepo.js';
import { getEnv } from '../server/env.js';
import { createBudgetService } from '../server/budget/service.js';
import { runDailyReminder } from '../server/jobs/dailyReminder.js';
import { runMonthlyIncomeReminder } from '../server/jobs/monthlyIncomeReminder.js';
import { runWeeklyRecap } from '../server/jobs/weeklyRecap.js';
import { logger } from '../server/lib/logger.js';
import { classifyWithGroq } from '../server/nlp/groq.js';

// Fail fast on boot: a missing or invalid env var stops the function with a message listing the keys.
const env = getEnv();
// The client connects on its first query, so /api/health still never touches the database.
const prisma = getPrisma();

const botRepos = (db: Db): BotRepos => ({
  users: createUserRepo(db),
  invites: createInviteRepo(db),
  processedUpdates: createProcessedUpdateRepo(db),
  rateLimits: createRateLimitRepo(db),
  transactions: createTxRepo(db),
  categories: createCategoryRepo(db),
  aliases: createAliasRepo(db),
  chatStates: createChatStateRepo(db),
  intents: createIntentRepo(db),
  noSpendDays: createNoSpendRepo(db),
});

// Dashboard auth (SECURITY §3): magic links and sessions in Postgres, initData verified with the bot token.
const authRepos = (db: Db): AuthRepos => ({
  users: createUserRepo(db),
  magicTokens: createMagicTokenRepo(db),
  sessions: createSessionRepo(db),
  rateLimits: createRateLimitRepo(db),
});
const auth = createAuthService({
  repos: authRepos(prisma),
  transaction: (fn) => prisma.$transaction((tx) => fn(authRepos(tx))),
  config: {
    appUrl: env.APP_URL,
    botToken: env.TELEGRAM_BOT_TOKEN,
    sessionTtlDays: env.SESSION_TTL_DAYS,
    magicLinkTtlMinutes: env.MAGIC_LINK_TTL_MINUTES,
  },
  now: () => new Date(),
});

const bot = createBot(env.TELEGRAM_BOT_TOKEN, {
  repos: botRepos(prisma),
  transaction: (fn) => prisma.$transaction((tx) => fn(botRepos(tx))),
  ownerTelegramId: env.OWNER_TELEGRAM_ID,
  now: () => new Date(),
  dashboard: { appUrl: env.APP_URL, createMagicLink: (userId) => auth.createMagicLink(userId) },
  llm: {
    classify: (text, categories) =>
      classifyWithGroq(text, categories, {
        apiKey: env.GROQ_API_KEY,
        model: env.GROQ_MODEL,
        timeoutMs: env.GROQ_TIMEOUT_MS,
      }),
    dailyLimit: env.LLM_DAILY_LIMIT_PER_USER,
    log: (entry) => logger.info('categorize.llm', entry), // parse method, outcome, latency: never the text
  },
});
// Every outbound call (bot replies and cron messages): retry once on 429; mark the user on 403.
bot.api.config.use(retryOn429());
bot.api.config.use(reportBlocked((chatId) => createUserRepo(prisma).setBotBlockedByTelegramId(BigInt(chatId), true)));

// getMe once per function instance (needed for ctx.me, e.g. the invite deep link). Retried after a failure.
let botReady: Promise<void> | undefined;
const initBot = () =>
  (botReady ??= bot.init().catch((err: unknown) => {
    botReady = undefined;
    throw err;
  }));

export default createApp({
  version: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown',
  auth: { auth, appUrl: env.APP_URL },
  dashboard: {
    budget: createBudgetService({ txRepo: createTxRepo(prisma), intentRepo: createIntentRepo(prisma) }),
    repos: {
      transactions: createTxRepo(prisma),
      categories: createCategoryRepo(prisma),
      aliases: createAliasRepo(prisma),
    },
    now: () => new Date(),
  },
  telegram: {
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
    handleUpdate: async (update) => {
      await initBot();
      await bot.handleUpdate(update);
    },
  },
  cron: {
    secret: env.CRON_SECRET,
    dailyReminder: (now) =>
      runDailyReminder(
        {
          users: createUserRepo(prisma),
          tx: createTxRepo(prisma),
          noSpend: createNoSpendRepo(prisma),
          cronRuns: createCronRunRepo(prisma),
          housekeeping: {
            processedUpdates: createProcessedUpdateRepo(prisma),
            rateLimits: createRateLimitRepo(prisma),
            magicTokens: createMagicTokenRepo(prisma),
            intents: createIntentRepo(prisma),
            sessions: createSessionRepo(prisma),
          },
          send: createTelegramSender(bot.api),
        },
        now,
      ),
    weeklyRecap: (now) =>
      runWeeklyRecap(
        {
          users: createUserRepo(prisma),
          budget: createBudgetService({ txRepo: createTxRepo(prisma), intentRepo: createIntentRepo(prisma) }),
          categories: createCategoryRepo(prisma),
          cronRuns: createCronRunRepo(prisma),
          send: createTelegramSender(bot.api),
        },
        now,
      ),
    incomeReminder: (now) =>
      runMonthlyIncomeReminder(
        {
          users: createUserRepo(prisma),
          tx: createTxRepo(prisma),
          cronRuns: createCronRunRepo(prisma),
          send: createTelegramSender(bot.api),
        },
        now,
      ),
  },
});
