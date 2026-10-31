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
2. **Build Command:** nothing to set. `vercel.json` sets `"buildCommand": "npm run build"` (DECISIONS D-022), which overrides the dashboard. It runs:
   ```
   prisma generate && npm test && prisma migrate deploy && vite build
   ```
   - Tests run before migrations, so a failing test never touches the DB.
   - `migrate deploy` only applies committed migration files. It never generates or resets anything.
3. **Node.js version:** pinned to `24.x` by `engines` in `package.json`, which overrides the dashboard setting.
4. **Deployments:** optionally disable Preview Deployments (Git settings), since they can't work without env vars anyway.

## 4. First deploy

1. Push to `main`. Vercel builds, tests, migrates, and deploys.
2. Default categories are inserted by a **data migration** (`prisma/migrations/<ts>_seed_categories/migration.sql`, with `INSERT … ON CONFLICT DO NOTHING`), so they're applied by `migrate deploy` like any other migration. No manual seed step is needed. See DATA_MODEL "Seed".
3. Set the webhook once. In PowerShell, build the body as JSON so the `allowed_updates` array survives quoting:
   ```powershell
   $token  = "<TELEGRAM_BOT_TOKEN>"
   $body = @{
     url                  = "<APP_URL>/api/telegram/webhook"
     secret_token         = "<TELEGRAM_WEBHOOK_SECRET>"
     allowed_updates      = @("message", "callback_query")
     drop_pending_updates = $true
   } | ConvertTo-Json
   Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$token/setWebhook" -ContentType "application/json" -Body $body
   Invoke-RestMethod "https://api.telegram.org/bot$token/getWebhookInfo"
   ```
   - Expect `ok = True` / `Webhook was set`. `getWebhookInfo` should show the URL, `allowed_updates` = message, callback_query, and no `last_error_message`.
   - Use the same values as in Vercel: `<APP_URL>` has no trailing slash, and the secret is 32+ characters of `[A-Za-z0-9_-]`. A wrong secret makes every update fail with 401.
   - Paste the token only in your own terminal. It's never needed in the repo or in chat.
4. Send `/start` to your bot. Because your Telegram ID equals `OWNER_TELEGRAM_ID`, you're created as **OWNER** automatically. Everyone else needs an invite from `/invite`.
5. Set the bot's **menu button** to open the Mini App at `<APP_URL>/`. Either:
   - **BotFather:** `/mybots` → your bot → **Bot Settings** → **Menu Button** → **Configure menu button** → send the URL (`<APP_URL>`, https) → send the title, e.g. `📊 Dashboard`.
   - **Or the Bot API** (PowerShell; the body is sent as UTF-8 so the emoji survives):
     ```powershell
     $token = "<TELEGRAM_BOT_TOKEN>"
     $body = @{ menu_button = @{ type = "web_app"; text = "📊 Dashboard"; web_app = @{ url = "<APP_URL>" } } } | ConvertTo-Json -Depth 4
     Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$token/setChatMenuButton" -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
     Invoke-RestMethod "https://api.telegram.org/bot$token/getChatMenuButton"
     ```
   Close and reopen the chat to see it. Tapping it opens the dashboard signed in (Mini App initData); `/dashboard` sends a one-time link for a laptop browser.
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
7. Check that **Vercel → Settings → Cron Jobs** shows all three jobs (daily reminder, weekly recap, monthly income reminder). To test one by hand (without the header → 401):
   ```powershell
   curl.exe -H "Authorization: Bearer <CRON_SECRET>" <APP_URL>/api/cron/daily-reminder
   curl.exe -H "Authorization: Bearer <CRON_SECRET>" <APP_URL>/api/cron/weekly-recap
   ```
   The response is `{"ok":true,"stats":{...}}` with how many were sent, skipped, blocked or failed. These really send, and each job runs **once per WIB date** (`CronRun`): a manual call uses up that day's run, so the scheduled one that evening does nothing (`"alreadyRan":true`). Test after 21:00 WIB, or accept missing that day's reminder. The daily reminder only goes to users with nothing logged today, and the recap only to users with activity this week. The same applies to `/api/cron/income-reminder`, once per month.

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
- Write the migration with `prisma migrate diff` (Prisma 7) between the **previous** schema (from git) and the new one, then commit the SQL as `prisma/migrations/<timestamp>_<name>/migration.sql` (UTC timestamp, later than the last folder):
  ```bash
  # Git Bash (PowerShell 5.1's ">" writes UTF-16, which breaks the schema file)
  git show HEAD:prisma/schema.prisma > /tmp/prev.prisma
  mkdir prisma/migrations/20261115120000_add_x
  export DIRECT_URL="postgresql://offline:offline@localhost:1/offline?sslmode=require"
  npx prisma migrate diff --from-schema /tmp/prev.prisma --to-schema prisma/schema.prisma --script -o prisma/migrations/20261115120000_add_x/migration.sql
  ```
  - The dummy `DIRECT_URL` is never contacted. Without **some** datasource URL, Prisma 7 silently prints an **empty** diff. Use `--exit-code` (2 = changes found) if you want to be sure.
  - Don't use `--from-migrations`: it needs a shadow database.
  - Raw SQL objects (CHECKs, the partial index in `*_constraints`) aren't in the schema, so schema-to-schema diffs never touch them. Add new ones by hand-writing SQL in the migration.
  - Data changes (e.g. new default keywords) are hand-written SQL migrations too. Never edit an applied migration.
- Keep migrations **additive** (add columns/tables; make new columns nullable or give them defaults). Renames or drops need a backup branch and an explicit OK from the owner.
- **Never** run `prisma migrate dev`, `prisma migrate reset`, or `prisma db push` against the production database.

## 7. Scripts (package.json)

| Script | Does |
|---|---|
| `build` | `prisma generate && npm test && prisma migrate deploy && vite build` (run by Vercel via `vercel.json`) |
| `postinstall` | `prisma generate` (the client in `server/db/generated/` is gitignored; no DB connection needed) |
| `test` | `vitest run` with coverage (pure unit tests; must not need a database). Fails if `server/budget/engine.ts` drops below 100% coverage |
| `typecheck` | `tsc --noEmit` (server, tests) + `vue-tsc --noEmit` (web) |
| `lint` | `eslint .` (also flags several hard rules: `toFixed`, local-time `Date` getters, `setInterval`, `express.static`, raw-unsafe SQL, `v-html`, aliases in `api/`/`server/`) |
| `format` / `format:check` | Prettier |

Debugging happens through **Vercel → Logs** (structured logs from `server/lib/logger.ts`, without secrets).
