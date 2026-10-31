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

### 3.2 Magic link (normal browser)
1. `/dashboard` in the bot → generate 32 random bytes (base64url), store `sha256(token)` with `expiresAt = now + 5 min`, and send `${APP_URL}/auth?token=…` **with link preview disabled**.
2. The SPA page `/auth` POSTs the token to `/api/auth/magic`. A GET never consumes it.
3. The server finds the hash, checks it isn't used and isn't expired, then marks it used **in the same transaction** that creates the session.
4. Session: 32 random bytes; store only the sha256 hash; expires in 30 days; refresh `lastSeenAt` at most once per hour.
5. Cookie: `__Host-session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`.
6. `/api/auth/logout` and `/logout-all` revoke sessions. Disabling a user revokes all their sessions.

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
| Magic links per user | 5 / hour | `RateLimit` |
| `/api/auth/magic` attempts per IP | 20 / 10 min | `RateLimit` |
| Invites | OWNER only; single use; 48 h | `Invite` |

## 6. HTTP hardening

- `helmet` with a CSP. Allow `script-src 'self' https://telegram.org` (the Mini App script) and `frame-ancestors` for Telegram Web (`https://web.telegram.org`) so the Mini App can be embedded. **Verify the exact Mini App embedding requirements at build time.**
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

- [ ] Webhook rejects requests with a missing or wrong secret header (test with curl)
- [ ] Cron endpoints reject requests without the bearer token
- [ ] Cross-user tests pass (§3.3)
- [ ] Magic link: second use fails; expired fails; a GET to `/auth?token=` doesn't consume it
- [ ] initData: tampered `user` field fails; old `auth_date` fails
- [ ] No secrets in the repo (`git log -p | grep -i token` is clean, or use gitleaks)
- [ ] Groq ZDR enabled
- [ ] Vercel env vars are scoped to Production only
- [ ] A Neon backup branch exists before any migration deploy
- [ ] The first `/start` from `OWNER_TELEGRAM_ID` creates the OWNER; any other unknown ID without an invite is rejected
