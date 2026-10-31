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
| POST | `/api/auth/magic` | `{ token }` | Consumes the token (single use, ≤ 5 min). Sets the `__Host-session` cookie. Returns `{ user }` (the `/api/me` shape). 401 `INVALID_TOKEN`, 403 `CSRF` (needs the CSRF headers below), 429 `RATE_LIMITED` (20 / 10 min / IP). |
| POST | `/api/auth/logout` | — | Revokes the current session and clears the cookie. |
| POST | `/api/auth/logout-all` | — | Revokes all of this user's sessions. Returns `{ ok, revoked }`. |
| GET | `/api/me` | — | `{ id, firstName, telegramUsername, role, needsPct, wantsPct, savingsPct }` |

The Mini App doesn't call `/auth/magic`. It sends `Authorization: tma <initData>` on every request.

Implemented in M10: everything in this section. Without valid credentials every `Auth: user` endpoint returns 401 `UNAUTHORIZED`. The SPA's client is `web/src/api/client.ts`.

The SPA route `/auth?token=…` renders a page whose JS **POSTs** the token. A GET never consumes it, so link-preview crawlers can't burn the token.

## Budget

| Method | Path | Query | Result |
|---|---|---|---|
| GET | `/api/budget/current` | — | Same numbers as `/sisa`: per bucket `{ allocation, spent, remaining }` for the current segment and month, wants `dailyPace`, `savingsProgressPct`, `savedBySkipping` |

As built (M11), from the same `budget/service.current()` that `/sisa` uses (a test checks the two agree):
```ts
{ state: 'OK' | 'NO_BUDGET', today, month: { month, start, end, days, income, needsMonth, wantsMonth, savingsTarget },
  segment: { index, start, end, days, remainingDays },
  needs: { week: { allocation /* cumAllowance */, spent /* month to date */, remaining },
           month: { allocation /* needsMonth − carryIn */, spent, remaining }, carryIn },
  wants: { week: { allocation /* effective = base − debtIn */, spent, remaining, base, debtIn },
           month: { allocation /* wantsMonth */, remaining /* §4 remainingMonthWants */ }, dailyPace },
  savings: { recorded, bonus, total, progressPct, target }, savedBySkipping: { week, month } }
```
`allocation − spent = remaining` everywhere except wants' month: its `remaining` is BUDGET_RULES §4's "this week's remaining + later bases", which isn't allocation − spent (rolled debt, surpluses), so it has no `spent`.

## Summary (charts)

| Method | Path | Query | Result |
|---|---|---|---|
| GET | `/api/summary` | `period=week\|month\|year`, `date=YYYY-MM-DD` (any date inside the period, WIB) | `{ range, totals: { income, expense, saving }, byBucket[], byCategory[], series[] }` |

`series` granularity: week → per day, month → per week segment, year → per month.

As built (M11, `server/budget/summary.ts`, pure): `date` defaults to today (WIB). `totals` count every live transaction dated in the range. `byBucket` is always `[NEEDS, WANTS, SAVINGS]`: expenses by their category's bucket, and SAVING transactions as SAVINGS. `byCategory` is expenses and savings (income isn't spending), largest first: `{ categoryId, name, bucket, amount }`. Each `series` point is `{ start, end, income, expense, saving }`. Budget numbers (allocations, remaining) are only in `/api/budget/current`.

## Transactions (CRUD)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/transactions` | `from`, `to` (dates), `type`, `categoryId`, `q`, `cursor`, `limit ≤ 100` (default 50). Returns `{ items, nextCursor }`; `nextCursor` is null on the last page. Newest first (`date`, then created). `q` searches the note, case-insensitive |
| GET | `/api/transactions/:id` | One transaction (M11) |
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

As built (M11):
- **`categoryId` isn't `.cuid()`**: system categories have fixed ids like `sys_belanja_bulanan`. It's any `[A-Za-z0-9_-]{1,40}`.
- **`date`** must be a real calendar date; `note` is trimmed and an empty note is `null`.
- **Invariants:** EXPENSE needs a NEEDS/WANTS category and SAVING a SAVINGS one (else 400 `CATEGORY_REQUIRED`); INCOME has none or an INCOME one. The category must be system or own and not archived, else 400 `INVALID_CATEGORY`. Another user's category gets exactly that too, so it can't be probed.
- **PATCH** takes the same fields, all optional (at least one); `categoryId: null` and `note: null` clear them. The type/category pair is re-checked whenever either changes.
- **Responses:** POST returns 201. A transaction looks like `{ id, type, amount, categoryId, category: { id, name, bucket, emoji } | null, note, date, occurredAt, source, parseMethod, createdAt }`. DELETE returns `{ ok: true }`.
- **Errors:** validation failures are 400 `VALIDATION` with the first problem in `message`. An unknown, malformed or someone else's `:id` is 404 `NOT_FOUND`.

## Categories (P1)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/categories` | System categories + the user's own |
| POST | `/api/categories` | `{ name, bucket ∈ NEEDS\|WANTS\|SAVINGS, emoji? }`. The slug comes from the name and never changes (aliases and the LLM key on it). A name or slug the user can already see (system ones included) → 409 `CATEGORY_EXISTS` |
| PATCH | `/api/categories/:id` | Own categories only: `{ name?, emoji?, archived? }`. A system category → 403 `READ_ONLY`; someone else's → 404 |
| GET | `/api/aliases` / DELETE `/api/aliases/:id` | Manage learned keywords |

## Mutations & CSRF

For cookie-authenticated requests, all non-GET requests must carry `X-Requested-With: fetch`, and the `Origin` must equal `APP_URL`. Combined with `SameSite=Lax`, this blocks cross-site form posts.
