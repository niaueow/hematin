# Setup — Production-only

This project has **one environment: production**. No local bot, no dev database, no staging (DECISIONS D-021). Three safeguards replace "testing somewhere else first":

1. **Tests run in the Vercel build.** If a test fails, the deploy is cancelled and the previous version keeps running.
2. **A Neon backup branch is created before every migration.** If a migration breaks data, restore from the branch.
3. **Env vars are scoped to Production only.** Preview deployments can't reach the real DB or bot (they fail at boot, which is intended).

## 1. Tools

| Tool | Notes |
|---|---|
| Git + an editor (VS Code ARM64) | Required |
| Node.js LTS **ARM64** | Optional. Only needed to run `npm test` / `typecheck` before pushing. Use the Windows ARM64 installer from nodejs.org |

PowerShell tip: `curl` is an alias for `Invoke-WebRequest`. Use **`curl.exe`** for the commands below.

## 2. Accounts

1. **Telegram:** create **one bot** with @BotFather and save the token. Get your numeric Telegram ID from @userinfobot (used for `OWNER_TELEGRAM_ID`).
2. **Neon:** create the project in region **AWS Asia Pacific (Singapore)**. Use the default `main` branch. Copy the **pooled** and **direct** connection strings.
3. **Groq:** create an API key at console.groq.com. In **Settings → Data Controls**, enable **Zero Data Retention**.
4. **Vercel:** import the Git repo. Set the function region to `sin1` (also in `vercel.json`).

## 3. Vercel project settings

1. **Environment Variables:** add every key from `.env.example` with real values, scoped to **Production only**. Don't tick Preview or Development.
2. **Build Command:**
   ```
   prisma generate && prisma migrate deploy && npm test && vite build
   ```
   - `migrate deploy` only applies committed migration files. It never generates or resets anything.
   - If you prefer, run tests before migrations (`npm test && prisma migrate deploy && …`) so a failing test never touches the DB. Recommended.
3. **Deployments:** optionally disable Preview Deployments (Git settings), since they can't work without env vars anyway.

Recommended final build command:
```
prisma generate && npm test && prisma migrate deploy && vite build
```

## 4. First deploy

1. Push to `main`. Vercel builds, tests, migrates, and deploys.
2. Default categories are inserted by a **data migration** (`prisma/migrations/<ts>_seed_categories/migration.sql`, with `INSERT … ON CONFLICT DO NOTHING`), so they're applied by `migrate deploy` like any other migration. No manual seed step is needed. See DATA_MODEL "Seed".
3. Set the webhook once:
   ```bash
   curl.exe -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" -d "url=https://<your-app>.vercel.app/api/telegram/webhook" -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" -d "allowed_updates=[\"message\",\"callback_query\"]" -d "drop_pending_updates=true"
   curl.exe "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
   ```
4. Send `/start` to your bot. Because your Telegram ID equals `OWNER_TELEGRAM_ID`, you're created as **OWNER** automatically. Everyone else needs an invite from `/invite`.
5. Set the bot's **menu button** to open the Mini App at `https://<your-app>.vercel.app/` (BotFather → your bot → Bot Settings → Menu Button, or the `setChatMenuButton` API).
6. Set commands with BotFather `/setcommands`:
   ```
   sisa - Sisa duit minggu & bulan ini
   pemasukan - Catat uang jajan
   riwayat - 10 transaksi terakhir
   undo - Batalkan catatan terakhir
   kategori - Daftar kategori
   dashboard - Buka dashboard
   bantuan - Cara pakai
   ```
7. Check that **Vercel → Settings → Cron Jobs** shows both jobs. Trigger one manually to test it:
   ```bash
   curl.exe -H "Authorization: Bearer <CRON_SECRET>" https://<your-app>.vercel.app/api/cron/daily-reminder
   ```

## 5. Every deploy after that

Pre-deploy checklist:
- [ ] (Optional) `npm test && npm run typecheck` locally
- [ ] **If the push contains a new migration:** create a Neon backup branch from `main` first (Neon console → Branches → Create branch, name `backup-YYYYMMDD`). Delete old backup branches after a few days.
- [ ] Push to `main`
- [ ] After deploy: send one test message to the bot and check Vercel → Logs for errors

Rollback:
- **Code:** Vercel → Deployments → previous deployment → "Promote to Production" (instant).
- **Data:** restore from the backup branch (Neon console), or use Neon's point-in-time history if it's still within the free-tier window.
- A code rollback doesn't undo a migration. If the old code can't run on the new schema, restore the DB too.

## 6. Writing migrations without a local DB

Schema changes are still made as committed migration files:
- Preferred: write the migration with `prisma migrate diff` against the current schema and commit the generated SQL in `prisma/migrations/<timestamp>_<name>/migration.sql`. Check the exact command for your Prisma version.
- Keep migrations **additive** (add columns/tables; make new columns nullable or give them defaults). Renames or drops need a backup branch and an explicit OK from the owner.
- **Never** run `prisma migrate dev`, `prisma migrate reset`, or `prisma db push` against the production database.

## 7. Scripts (package.json)

| Script | Does |
|---|---|
| `build` | `prisma generate && npm test && prisma migrate deploy && vite build` (same as the Vercel build command) |
| `test` | `vitest run` (pure unit tests; must not need a database) |
| `typecheck` | `tsc --noEmit` |
| `lint` | `eslint .` |

Debugging happens through **Vercel → Logs** (structured logs from `server/lib/logger.ts`, without secrets).
