// The one Vercel Function. vercel.json rewrites every /api/* request here; req.url keeps the
// original path, so Express routes on /api/... as usual. Relative imports only (DECISIONS D-022).
import { Api } from 'grammy';
import { createApp } from '../server/app.js';
import { createTelegramSender } from '../server/bot/telegram.js';
import { getPrisma } from '../server/db/prisma.js';
import { createCronRunRepo } from '../server/db/repos/cronRunRepo.js';
import { createTxRepo } from '../server/db/repos/txRepo.js';
import { createUserRepo } from '../server/db/repos/userRepo.js';
import { getEnv } from '../server/env.js';
import { runMonthlyIncomeReminder } from '../server/jobs/monthlyIncomeReminder.js';

// Fail fast on boot: a missing or invalid env var stops the function with a message listing the keys.
const env = getEnv();
const send = createTelegramSender(new Api(env.TELEGRAM_BOT_TOKEN));

export default createApp({
  version: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown',
  cron: {
    secret: env.CRON_SECRET,
    incomeReminder: (now) => {
      const db = getPrisma(); // created on first use, so /api/health never touches the database
      return runMonthlyIncomeReminder(
        { users: createUserRepo(db), tx: createTxRepo(db), cronRuns: createCronRunRepo(db), send },
        now,
      );
    },
  },
});
