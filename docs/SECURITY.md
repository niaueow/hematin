# Security

Threat model in one line: **a handful of known users storing personal financial data**. The main risks are (1) someone reading another user's data, (2) forged requests to the webhook/cron/API, (3) leaked secrets, (4) abuse that burns free quotas.

## 1. Secrets

| Secret | Where | Rotation |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Vercel env (Production) only | BotFather `/revoke` if leaked. Also invalidates Mini App initData signatures |
| `TELEGRAM_WEBHOOK_SECRET` | Vercel env | Random 32+ chars `[A-Za-z0-9_-]`; re-run `setWebhook` after rotating |
| `DATABASE_URL`, `DIRECT_URL` | Vercel env | Reset the role password in Neon |
| `GROQ_API_KEY` | Vercel env | Regenerate in the Groq console |
| `CRON_SECRET` | Vercel env | Random 32+ chars |

- `.env` is in `.gitignore`. Only `.env.example` (no values) is committed.
- Production-only setup: all env vars in Vercel are scoped to **Production only**, so preview deployments get no secrets.
- `server/env.ts` validates env with Zod at boot. A missing secret means the app fails to start.
- Never log tokens, `initData`, magic-link tokens, cookies, or full request bodies.

## 2. Inbound request authentication

| Endpoint | Check |
|---|---|
| Telegram webhook | `X-Telegram-Bot-Api-Secret-Token` equals `TELEGRAM_WEBHOOK_SECRET` (constant-time compare via `crypto.timingSafeEqual`) |
| Cron | `Authorization: Bearer ${CRON_SECRET}` (constant-time) |
| Dashboard API | `requireUser` (§3) |

Webhook extras:
- Idempotency via `ProcessedUpdate.updateId` (Telegram retries on failure).
- Ignore updates from non-private chats.
- Unknown Telegram users get at most one canned reply **per message** (counting replies would need a DB write). They aren't rate-limited, for the same reason. **No DB writes except the invite flow and the one-time owner bootstrap (`from.id == OWNER_TELEGRAM_ID` and no OWNER exists yet), and no Groq calls.**

## 3. Dashboard authentication (no passwords)

### 3.1 Mini App (inside Telegram)
Every request sends `Authorization: tma <raw initData>`. Server-side:
1. Parse it as URLSearchParams. Take out `hash`. Build the `data_check_string` from the remaining `key=value` pairs, sorted by key and joined by `\n`.
2. `secret = HMAC_SHA256(key="WebAppData", msg=BOT_TOKEN)`
3. `expected = hex(HMAC_SHA256(key=secret, msg=data_check_string))`. Compare with `hash` in constant time.
4. Reject if `auth_date` is older than 24 h.
5. Get `user.id` from the `user` JSON. Look up an ACTIVE `User` by `telegramId`. If none is found, return 401.

Don't trust `initDataUnsafe` on the client for anything. It's for display only.

As built (M10, `server/auth/initData.ts`, checked against the Telegram Mini Apps docs on 2026-10-31): the data_check_string includes every field except `hash`, so the newer `signature` field stays in (it's only left out for the third-party Ed25519 check). A duplicated field, a hash that isn't 64 lowercase hex characters, or a missing `auth_date` is rejected before anything else. `auth_date` up to 60 s in the future is tolerated (clock skew).

### 3.2 Magic link (normal browser)
1. `/dashboard` in the bot → generate 32 random bytes (base64url), store `sha256(token)` with `expiresAt = now + 5 min`, and send `${APP_URL}/auth?token=…` **with link preview disabled**.
2. The SPA page `/auth` POSTs the token to `/api/auth/magic`. A GET never consumes it.
3. The server finds the hash, checks it isn't used and isn't expired, then marks it used **in the same transaction** that creates the session.
4. Session: 32 random bytes; store only the sha256 hash; expires in 30 days; refresh `lastSeenAt` at most once per hour.
5. Cookie: `__Host-session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`.
6. `/api/auth/logout` and `/logout-all` revoke sessions. Disabling a user revokes all their sessions.

As built (M10, `server/auth/service.ts`, `http.ts`, `routes/auth.ts`):
- `POST /api/auth/magic` also requires the CSRF headers below (it sets a cookie, so a foreign page mustn't be able to log you into another account), and is limited to 20 attempts per IP per 10 minutes (`x-real-ip`, set by Vercel). A wrong, used or expired token, or a DISABLED user, is the same 401 `INVALID_TOKEN`.
- `requireUser`: a request with an `Authorization` header must be `tma <initData>` (anything else is 401); without one, the `__Host-session` cookie. A session only counts while it's unexpired, unrevoked, and its user is ACTIVE, so disabling a user locks them out of both paths at once.
- CSRF: a cookie-authenticated request that isn't GET/HEAD/OPTIONS needs `X-Requested-With: fetch` and `Origin` equal to `APP_URL`, else 403 `CSRF`. A tma request needs neither (a browser never adds that header cross-site).
- `/api/auth/logout` with a tma header just clears the cookie (there's no session); `/logout-all` works from both.

### 3.3 Authorization (the part that keeps users out of each other's data)
- `requireUser` sets `req.user`. **No route reads a user ID from params, query, or body.**
- Repository functions take `userId` as their first, required argument and always include it in `where`.
- Lookups by ID use `findFirst({ where: { id, userId, deletedAt: null } })`. If nothing is found, return **404**.
- Callback queries in the bot (`pi:<id>:buy`, `tx:<id>:undo`, …) load records **scoped to the caller's userId**. A forwarded or forged callback from another user finds nothing.
- **Required tests** (route level with a mocked repository layer, plus repository tests asserting `userId` is always in the `where`): user B tries GET/PATCH/DELETE on user A's transaction, PurchaseIntent callback, and category → always 404 / no-op.

## 4. Input validation & injection

- Zod on every API body/query (`.strict()` to reject unknown keys). Amounts are integers in 1…100.000.000.
- Prisma parameterizes queries. **`$queryRawUnsafe` / `$executeRawUnsafe` are banned.** If raw SQL is needed, use tagged `$queryRaw` only.
- Vue escapes by default. **`v-html` is banned** for any user-provided text (notes, category names).
- LLM output is untrusted: validate it against the schema, check the slug is in the allowed enum, and never execute or eval it. The LLM has no tools.
- Telegram messages are sent as plain text, or HTML with user content escaped. Never put raw user notes into `parse_mode` markup.

## 5. Abuse & quotas

| Limit | Value | Storage |
|---|---|---|
| Messages per user | 20 / minute | `RateLimit` (Postgres) |
| Groq calls per user | 50 / day | `RateLimit` |
| Magic links per user | 5 / hour | `MagicLinkToken` rows created in the last hour (`countCreatedSince`) |
| `/api/auth/magic` attempts per IP | 20 / 10 min | `RateLimit` |
| Invites | OWNER only; single use; 48 h | `Invite` |

## 6. HTTP hardening

- `helmet` with a CSP. Allow `script-src 'self' https://telegram.org` (the Mini App script) and `frame-ancestors` for Telegram Web (`https://web.telegram.org`) so the Mini App can be embedded. **Verify the exact Mini App embedding requirements at build time.**
- As built (M10): the API sends helmet's `default-src 'none'; frame-ancestors 'none'`. The SPA gets its headers from `vercel.json` (every path but `/api/`): `default-src 'self'; script-src 'self' https://telegram.org; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors https://web.telegram.org`, plus `Referrer-Policy: no-referrer` (so `/auth?token=…` never leaks in a Referer) and `X-Content-Type-Options: nosniff`. Checked against `telegram-web-app.js` on 2026-10-31: it needs no inline script. On Telegram Web (iframe) it injects a `<style>` with the client's custom CSS, which `style-src 'self'` blocks: cosmetic only. Since M12 the CSP also allows Google Fonts for Plus Jakarta Sans: `style-src … https://fonts.googleapis.com` and `font-src … https://fonts.gstatic.com`.
- `app.disable('x-powered-by')`. JSON body limit `100kb`.
- No CORS middleware (same origin). If it's ever needed, use an explicit allowlist and never `*` with credentials.
- Error handler: generic message to clients; details only in server logs.

## 7. Data protection

- Data is stored in Neon (encrypted at rest by the provider) and always reached over TLS (`sslmode=require`).
- Groq: Zero Data Retention enabled; only the message text is sent.
- Minimal PII: Telegram ID, username, first name. No phone numbers.
- Account deletion (owner command, P1): hard-delete all of the user's rows.
- Backups: Neon's built-in history only in v1. Optional later: a weekly `pg_dump` (parked, see DECISIONS D-016).

## 8. Dependency hygiene

- Lockfile committed; `npm audit` (or `pnpm audit`) in CI; Renovate/Dependabot weekly.
- Pin the Node major version in `package.json` `engines` and in the Vercel project settings.

## 9. Security checklist before go-live

Status after the Phase 1 review (M9, 2026-10-31). Automated items run in every Vercel build (`npm test`); manual ones are for the owner.

- [x] Webhook rejects requests with a missing or wrong secret header: `tests/api/app.test.ts` (401, constant-time). Manual: `curl.exe -X POST <APP_URL>/api/telegram/webhook` → 401
- [x] Cron endpoints reject requests without the bearer token: `tests/api/app.test.ts` (all three routes)
- [x] Cross-user tests pass (§3.3), bot side: `tests/bot/logging.test.ts`, `purchase.test.ts`, `noSpend.test.ts`, `tests/db/repoScoping.test.ts`. API side (M11): `tests/api/dashboard.test.ts`, GET/PATCH/DELETE on another user's transaction, PATCH on their category, DELETE on their alias → 404 with nothing changed
- [ ] Magic link: second use fails; expired fails; a GET to `/auth?token=` doesn't consume it (Phase 2)
- [ ] initData: tampered `user` field fails; old `auth_date` fails (Phase 2)
- [x] No secrets in the repo: history and tree scanned on 2026-10-31 for bot tokens, `gsk_` keys, `npg_` passwords and credentialed Postgres URLs; only placeholders in `tests/env.test.ts` and `docs/SETUP.md`. Re-check before going public with gitleaks
- [ ] Groq ZDR enabled (manual: Groq console → Data Controls)
- [ ] Vercel env vars are scoped to Production only (manual: Vercel → Settings → Environment Variables)
- [ ] A Neon backup branch exists before any migration deploy (manual, every time)
- [x] The first `/start` from `OWNER_TELEGRAM_ID` creates the OWNER; any other unknown ID without an invite is rejected: `tests/bot/bot.test.ts`
