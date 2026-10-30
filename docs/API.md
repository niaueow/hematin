# HTTP API

Base path `/api`. JSON only. Errors use `{ "error": { "code": "STRING", "message": "human readable" } }`.

Every endpoint under **Auth: user** goes through `requireUser`. The user is **always** `req.user`. No endpoint accepts a `userId` from the client. If a resource exists but belongs to someone else, return **404** (not 403), so IDs can't be probed.

## Telegram & cron

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/telegram/webhook` | `X-Telegram-Bot-Api-Secret-Token` | grammY webhook handler |
| GET | `/api/cron/daily-reminder` | `Authorization: Bearer $CRON_SECRET` | Vercel Cron, idempotent per date |
| GET | `/api/cron/weekly-recap` | `Authorization: Bearer $CRON_SECRET` | Vercel Cron, idempotent per week |

## Auth

| Method | Path | Body | Result |
|---|---|---|---|
| POST | `/api/auth/magic` | `{ token }` | Consumes the token (single use, ≤ 5 min). Sets the `__Host-session` cookie. Returns `{ user }`. |
| POST | `/api/auth/logout` | — | Revokes the current session and clears the cookie. |
| POST | `/api/auth/logout-all` | — | Revokes all of this user's sessions. |
| GET | `/api/me` | — | `{ id, firstName, telegramUsername, role, needsPct, wantsPct, savingsPct }` |

The Mini App doesn't call `/auth/magic`. It sends `Authorization: tma <initData>` on every request.

The SPA route `/auth?token=…` renders a page whose JS **POSTs** the token. A GET never consumes it, so link-preview crawlers can't burn the token.

## Budget

| Method | Path | Query | Result |
|---|---|---|---|
| GET | `/api/budget/current` | — | Same numbers as `/sisa`: per bucket `{ allocation, spent, remaining }` for the current segment and month, wants `dailyPace`, `savingsProgressPct`, `savedBySkipping` |

## Summary (charts)

| Method | Path | Query | Result |
|---|---|---|---|
| GET | `/api/summary` | `period=week\|month\|year`, `date=YYYY-MM-DD` (any date inside the period, WIB) | `{ range, totals: { income, expense, saving }, byBucket[], byCategory[], series[] }` |

`series` granularity: week → per day, month → per week segment, year → per month.

## Transactions (CRUD)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/transactions` | `from`, `to` (dates), `type`, `categoryId`, `q`, `cursor`, `limit ≤ 100` |
| POST | `/api/transactions` | `{ type, amount, categoryId?, note?, date }` → `source=WEB`, `parseMethod=MANUAL` |
| PATCH | `/api/transactions/:id` | Partial update; same validation |
| DELETE | `/api/transactions/:id` | Soft delete |

Zod schema (create):
```ts
z.object({
  type: z.enum(["INCOME", "EXPENSE", "SAVING"]),
  amount: z.number().int().positive().max(100_000_000),
  categoryId: z.string().cuid().optional(),
  note: z.string().trim().max(120).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // WIB date; occurredAt = date 12:00 WIB
}).strict()
// + refine: category bucket must match type (DATA_MODEL invariants)
```

## Categories (P1)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/categories` | System categories + the user's own |
| POST | `/api/categories` | `{ name, bucket ∈ NEEDS\|WANTS\|SAVINGS, emoji? }` |
| PATCH | `/api/categories/:id` | Own categories only |
| GET | `/api/aliases` / DELETE `/api/aliases/:id` | Manage learned keywords |

## Mutations & CSRF

For cookie-authenticated requests, all non-GET requests must carry `X-Requested-With: fetch`, and the `Origin` must equal `APP_URL`. Combined with `SameSite=Lax`, this blocks cross-site form posts.
