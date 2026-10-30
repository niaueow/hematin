# AGENTS.md

Instructions for AI coding agents (and humans) working in this repo. Read this file fully before making changes.

## Project in one paragraph

A Telegram bot for personal finance tracking. Users log expenses in casual Indonesian ("warteg 10k"), the bot categorizes them (rules → learned aliases → Groq LLM → ask), and enforces a 50/30/20 budget split into weekly segments. It nudges users to save: before buying a "want" ("mau donat 35k") the bot answers ALLOW / CAUTION / DENY. Phase 2 adds a Vue dashboard (Chart.js) that opens as a Telegram Mini App or via a magic link. Invite-only, a few users, all in WIB.

## Read before working on…

| Area | Read |
|---|---|
| Anything | `PRD.md`, `docs/DECISIONS.md` |
| Budget numbers, rollover, verdicts | `docs/BUDGET_RULES.md` (**source of truth**, don't invent rules) |
| Bot messages, NLP, commands | `docs/BOT_SPEC.md` |
| Endpoints | `docs/API.md` |
| Schema | `docs/DATA_MODEL.md` |
| Auth, secrets, validation | `docs/SECURITY.md` |
| Folder layout, flows, cron | `docs/ARCHITECTURE.md` |
| Running locally, deploying | `docs/SETUP.md` |

## Stack

TypeScript (strict) · Node LTS · Express (single Vercel Function) · grammY · Prisma + Neon (Singapore) · Zod · Vue 3 + Vite + Pinia + vue-chartjs · Vitest · Groq (`openai/gpt-oss-20b`, structured output). Deployed **only** on Vercel (Hobby).

## Commands

There is **no local environment and no staging**. Production is the only environment (DECISIONS D-021, SETUP.md).

```bash
npm test            # vitest, pure unit tests, no DB needed
npm run typecheck && npm run lint
```

The Vercel build runs `prisma generate && npm test && prisma migrate deploy && vite build`. A failing test cancels the deploy.

Before saying a task is done: `npm run typecheck && npm run lint && npm test` must pass. Tests must not require a database or env secrets. Mock the repository layer for route/auth tests.

Schema changes: write a migration file (see SETUP.md §6), commit it, and tell the owner to create a Neon backup branch before pushing.

## Hard rules (don't break these)

1. **Money is integer rupiah.** No floats, no `Decimal` math, no `toFixed`. Format only at the edges with `formatRupiah()` → `Rp35.000`.
2. **Dates are WIB.** All date math goes through `server/budget/periods.ts`. Never use `new Date().getDate()`, `getDay()`, or `toISOString().slice(0,10)` for business dates (Vercel runs in UTC). Write `localDate` with `toLocalDate()` only.
3. **The budget engine is pure.** `server/budget/engine.ts` doesn't import Prisma, doesn't read the clock, and takes `today` as a parameter. Any change to budget behavior needs a matching change in `docs/BUDGET_RULES.md` **and** tests.
4. **Budgets are computed on read.** Never store running balances, "sisa", or bonuses in the DB.
5. **User scoping.** Every query on user data includes `userId` from `req.user` (API) or the resolved bot user. Never take a `userId` from a request body/query/params. Fetch by ID with `findFirst({ where: { id, userId } })` and return 404 if not found.
6. **Never refuse to record.** Logging is always accepted, even over budget. Only `ASK_PURCHASE` ("mau X") gets verdicts, and only for WANTS categories.
7. **All bot strings live in `server/bot/copy.ts`.** Casual Indonesian, ≤ 5 lines, ≤ 2 emoji, concrete numbers, never shaming. See BOT_SPEC §5.
8. **LLM output is untrusted.** Validate with Zod and check the slug is in the allowed enum. The amount always comes from `parseAmount`, never from the LLM. Any Groq failure falls back to asking the user.
9. **Secrets** come only from `server/env.ts` (Zod-validated). Never log tokens, initData, cookies, or magic-link tokens. Never commit `.env`.
10. **Banned:** `$queryRawUnsafe`, `$executeRawUnsafe`, `v-html` with user content, `eval`, `cors({ origin: '*' })`, `express.static` (it doesn't work on Vercel).
11. **Serverless:** no in-memory state across requests, no background work after the response is sent, no `setInterval`. Cron work goes in `server/jobs/` and must be idempotent (`CronRun`).
12. Webhook and cron endpoints compare secrets with `crypto.timingSafeEqual`.
13. **Never run `prisma migrate dev`, `prisma migrate reset`, or `prisma db push`.** The only DB is production. The schema changes only through committed migration files applied by `prisma migrate deploy`. Keep migrations additive. Seed data is added via SQL data migrations, never by editing an applied migration.

## Conventions

- ESM, `"type": "module"`. Path alias `@server/*`, `@web/*`.
- Routes: thin. Validate (Zod) → call a service → map to a response. Business logic goes in services; DB access goes in `*Repo` modules.
- Errors: throw `AppError(code, httpStatus, message)`; one Express error handler maps them. Never leak stack traces.
- Naming: files `camelCase.ts`, Vue components `PascalCase.vue`, DB enums `UPPER_SNAKE`.
- Tests sit next to their topic in `tests/` (`tests/budget/*.test.ts`, `tests/nlp/*.test.ts`, `tests/api/*.test.ts`). Prefer table-driven tests. Freeze "today" explicitly.
- Commits: Conventional Commits (`feat(bot): …`, `fix(budget): …`).

## Testing priorities

1. `budget/` — all cases in BUDGET_RULES §9.
2. `nlp/amount.ts` and `nlp/intent.ts` — every example in BOT_SPEC §2.
3. Auth — initData verify (valid / tampered / expired), magic link (single use, expiry, GET doesn't consume).
4. Cross-user access — user B can't read or modify user A's data via the API or bot callbacks.

## When to stop and ask the human

- Any change to budget rules, rollover, or verdict thresholds.
- Adding a paid service, a new third-party data processor, or anything that sends user data off-platform.
- Schema changes that drop or rename columns holding user data.
- Any migration that changes or deletes existing data (remind the owner to create a Neon backup branch first).
- Anything that loosens auth or the hard rules above.
- If the docs contradict each other. Ask; don't pick one silently.

## Known open questions

See `PRD.md §9`. Use the documented defaults until the owner decides.
