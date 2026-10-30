# Architecture

## 1. Overview

```
                      ┌──────────────────────── Vercel project (region sin1) ────────────────────────┐
Telegram ──webhook──► │  /api/telegram/webhook ─┐                                                    │
                      │  /api/cron/*  ◄── Vercel Cron                                                │
Browser / Mini App ──►│  /api/*  ───────────────┴─► Express app (one function) ─► Prisma ─► Neon (SG) │
                      │  /*      ─► Vue SPA (static, CDN)                                            │
                      └───────────────────────────────────────────────┬──────────────────────────────┘
                                                                      └─► Groq API (NLP fallback only)
```

- **One Vercel project, one domain.** The SPA and API share an origin, so cookies are first-party and CORS is not needed.
- **Express runs as a single Vercel Function.** Every `/api/*` request is rewritten to it.
- **Stateless.** No in-memory state survives between requests. Anything durable goes in Postgres.
- **Budget numbers are computed on read** from transactions (`docs/BUDGET_RULES.md`). Nothing is stored as a running balance.

## 2. Repository layout

```
/
├─ api/
│  └─ index.ts              # Vercel entry: `export default app` (imports server/app)
├─ server/
│  ├─ app.ts                # Express app: middleware, routers, error handler
│  ├─ env.ts                # Zod-validated process.env (fail fast on boot)
│  ├─ db/prisma.ts          # PrismaClient singleton with Neon adapter
│  ├─ bot/
│  │  ├─ bot.ts             # grammY Bot instance + middleware (auth, idempotency)
│  │  ├─ handlers/          # text, commands, callback queries
│  │  ├─ keyboards.ts       # inline keyboards
│  │  └─ copy.ts            # ALL user-facing Indonesian strings live here
│  ├─ nlp/
│  │  ├─ amount.ts          # amount parser (pure)
│  │  ├─ intent.ts          # ASK_PURCHASE / LOG_* detection (pure)
│  │  ├─ categorize.ts      # rules → learned aliases → Groq → ask
│  │  ├─ groq.ts            # Groq client, strict JSON schema, timeout
│  │  └─ keywords.ts        # default keyword dictionary
│  ├─ budget/
│  │  ├─ periods.ts         # months, segments, WIB date utils (pure)
│  │  ├─ engine.ts          # wants/needs/savings computations (pure)
│  │  └─ service.ts         # loads transactions from DB → calls engine
│  ├─ auth/                 # initData verify, magic link, sessions, requireUser middleware
│  ├─ routes/               # /api/auth, /api/transactions, /api/summary, /api/budget, /api/categories, /api/cron
│  ├─ jobs/                 # dailyReminder.ts, weeklyRecap.ts
│  └─ lib/                  # money formatting, errors, rate limit, logger
├─ web/                     # Vue 3 + Vite SPA (Phase 2)
│  ├─ src/{pages,components,stores,api}/
│  └─ index.html
├─ prisma/
│  ├─ schema.prisma
│  └─ migrations/           # schema migrations + SQL data migration seeding default categories
├─ tests/                   # vitest: unit (budget, nlp) + integration (routes, auth)
├─ docs/
├─ vercel.json
├─ AGENTS.md  CLAUDE.md  PRD.md  README.md  .env.example
```

> **Verify at scaffold time:** how Vercel combines a Vite frontend with an Express function in one project. The intended setup is: Vite builds to the output directory, `api/index.ts` exports the Express app, and `vercel.json` rewrites `/api/(.*)` → `/api` and everything else → `/index.html`. Vercel also has zero-config Express detection (it looks for `app|index|server.ts` at the root or in `src/`). Make sure that detection doesn't hijack the SPA, and pick one approach. Record the result in `docs/DECISIONS.md`.
>
> **Verified (2026-10-31), see DECISIONS D-022:** the intended setup works as described, with the Vite preset pinned in `vercel.json`. Because Vercel functions don't resolve tsconfig `paths`, code under `api/` and `server/` uses relative `.js` imports. Path aliases are for tests and `web/` only.

## 3. Request flows

### 3.1 Bot message
1. Telegram sends `POST /api/telegram/webhook` with header `X-Telegram-Bot-Api-Secret-Token`.
2. Check the header with a constant-time compare. On mismatch, return `401`.
3. Idempotency: `INSERT ProcessedUpdate(update_id)`. On unique conflict, return `200` and stop (it's a Telegram retry).
4. Auth: look up `User` by `from.id`. Unknown user → handle `/start <invite>` or send a single "private bot" reply. **No NLP for unknown users.**
5. Rate limit: per user, per minute (see SECURITY.md).
6. Pipeline: `parseAmount` → `detectIntent` → `categorize` → action (log / purchase check / income / saving) → `budget.service` → reply from `copy.ts`.
7. Return `200` quickly. All work runs inside the request (no background work after the response on serverless).

### 3.2 Purchase check ("mau X")
`ASK_PURCHASE` → compute verdict (BUDGET_RULES §6) → create `PurchaseIntent(PENDING)` → reply with buttons whose callback data is `pi:<id>:buy` / `pi:<id>:skip` (Telegram limits callback data to 64 bytes).
On callback: load the intent **where userId = caller**, check that it's PENDING and not expired, then BOUGHT → create Transaction, or SKIPPED → stat only.

### 3.3 Cron
`vercel.json`:
```json
{
  "regions": ["sin1"],
  "crons": [
    { "path": "/api/cron/daily-reminder", "schedule": "0 14 * * *" },
    { "path": "/api/cron/weekly-recap",   "schedule": "0 15 * * 0" }
  ]
}
```
- Times are UTC: 14:00 UTC = 21:00 WIB; Sunday 15:00 UTC = Sunday 22:00 WIB. On Hobby they fire **somewhere within that hour**, and failures are **not retried**.
- Each handler checks `Authorization: Bearer ${CRON_SECRET}`.
- Idempotent per run: `INSERT CronRun(runKey="daily-reminder:2026-10-30")`. On conflict, skip.
- Daily reminder: for each ACTIVE user with no transaction (any type, not deleted) where `localDate = today` and no `NoSpendDay` for today → send the reminder. If there's no income this month, add the income nudge.
- Weekly recap: for each ACTIVE user, summarize the Mon–Sun week ending today.
- Send with a small concurrency limit and catch per-user errors (one blocked user must not stop the loop). If a user has blocked the bot (403), mark them `botBlocked=true`.

### 3.4 Dashboard auth
See `docs/SECURITY.md §3`. Summary:
- **Mini App:** every API call sends `Authorization: tma <initData>`, which is verified per request (HMAC with the bot token, `auth_date` ≤ 24 h).
- **Browser:** `/dashboard` creates a magic link. The SPA posts the token to `/api/auth/magic`, gets a `__Host-session` cookie, and later requests send the cookie.
- The `requireUser` middleware accepts either method and sets `req.user`. Routes **only** use `req.user.id`.

## 4. Data access rules

- One `PrismaClient` per function instance, using `@prisma/adapter-neon` (or the Neon **pooled** connection string). Migrations use `DIRECT_URL` (non-pooled).
- Every query on user data includes `userId: req.user.id` (or the bot's resolved user). There are repository helpers for this (`txRepo.listForUser(userId, …)`). Don't write raw `prisma.transaction.findUnique({ where: { id } })` in route handlers.
- Soft delete for transactions (`deletedAt`). All reads filter `deletedAt: null`.

## 5. Time handling

- Store `occurredAt` as `timestamptz` (UTC) **and** `localDate` as a `date` in WIB. Compute `localDate` once on write.
- One module (`budget/periods.ts`) owns all date math. Use `@date-fns/tz` (or `Temporal` if it's available in the Node version) with zone `Asia/Jakarta`. **Never** call `new Date().getDate()` or similar. Vercel runs in UTC.
- "Today" is injected into the engine as a parameter so tests are deterministic.

## 6. External services

| Service | Use | Failure mode |
|---|---|---|
| Telegram Bot API | messages, webhooks, Mini App | Retry once on 429 with `retry_after`; log others |
| Neon | all data | Function returns 500; Telegram will retry the update (idempotency protects us) |
| Groq | categorization fallback | 5 s timeout; on any error → ask the user with category buttons |
| Vercel Cron | reminder + recap | No retries; check the logs |

## 7. Environments

**Production only** (DECISIONS D-021).

| Env | Bot | DB | Notes |
|---|---|---|---|
| production | the one bot, via webhook | Neon `main` branch | Env vars scoped to Production only; webhook set once (SETUP.md) |

Safeguards that replace a staging environment:
- `npm test` runs in the Vercel build (before `prisma migrate deploy`). A failing test cancels the deploy.
- A Neon backup branch is created before any deploy that contains a migration.
- Instant code rollback via "Promote to Production" on an earlier deployment.
- Preview deployments have no env vars, so they can't touch real data. `server/env.ts` fails fast there.
- Unit tests never need a database. Route/auth tests mock the repository layer.
