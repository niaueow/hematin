# Hematin Bot 🐷

Telegram bot for tracking pocket money with a built-in 50/30/20 budget that nudges you to save.

- Log by chatting: `warteg 10k`, `gojek 18k`, `aku jajan cireng 10k`, `reksadana 200k`, `dapet uang jajan 2jt`
- Unknown items: Groq guesses the category, or you pick it once and the bot remembers
- Every log has [✏️ Ganti kategori] [↩️ Undo]
- Ask before buying: `mau donat 35k` → "Gas!" / "Hmm mepet…" / "Waduh…" with [Jadi beli] [Ga jadi]
- `/sisa`, `/riwayat`, `/undo`, `/kategori`, `/pemasukan`
- Reminder at ~21:00 WIB if you haven't logged anything, recap every Sunday ~22:00 WIB, income reminder on the 1st
- Invite-only (`/invite`, owner only)
- Phase 2: dashboard with charts (week/month/year) + full CRUD, inside Telegram or in the browser, no password. Sign-in is built (`/dashboard`, the 📊 menu button); the charts and CRUD aren't yet

**Status:** Phase 1 (the bot) is built and reviewed (M0–M9). Phase 2 has started: dashboard sign-in (Mini App + `/dashboard` magic link, M10) the dashboard API (budget, summary, transactions, categories, M11) and the design-system base (tokens, type, Button/Input/Chip, `/playground`, M12) are built; the dashboard pages are next.

**Stack:** Vue 3 · Express · Prisma · Neon Postgres · grammY · Groq · Vercel

## Docs

| Doc | What's in it |
|---|---|
| [PRD.md](PRD.md) | What we're building and why, scope per phase, acceptance criteria |
| [AGENTS.md](AGENTS.md) | Rules for AI coding agents and contributors |
| [docs/BUDGET_RULES.md](docs/BUDGET_RULES.md) | Exact budget math: segments, rollover, verdicts |
| [docs/BOT_SPEC.md](docs/BOT_SPEC.md) | Commands, NLP pipeline, Groq prompt, message copy |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, folder layout, flows, cron |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Prisma schema draft + invariants + seed |
| [docs/API.md](docs/API.md) | HTTP endpoints for the dashboard |
| [docs/SECURITY.md](docs/SECURITY.md) | Auth without passwords, user isolation, secrets, checklist |
| [docs/SETUP.md](docs/SETUP.md) | Production-only setup (no local env, D-021): Vercel, Neon, webhook, BotFather, cron checks |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Why things are the way they are |

## Quick start

See [docs/SETUP.md](docs/SETUP.md).

## Development

There's no local environment (D-021). Before pushing:

```bash
npm run typecheck && npm run lint && npm test
```

Tests need no database or secrets. The Vercel build runs `prisma generate`, the tests, `prisma migrate deploy`, then `vite build`; a failing test cancels the deploy.

## Build order

1. ✅ Scaffold + `env.ts` + Prisma schema + seed
2. ✅ `budget/periods.ts` + `budget/engine.ts` with full tests (no bot yet)
3. ✅ `nlp/amount.ts`, `nlp/intent.ts` with tests
4. ✅ Bot: invite flow → logging → `/sisa` → "mau X" → undo / ganti kategori
5. ✅ Groq fallback + learned aliases
6. ✅ Cron: daily reminder + weekly recap
7. Deploy Phase 1, use it for 2 weeks, tweak copy ← next
8. Phase 2: auth (initData + magic link) → API → Vue dashboard → charts → CRUD
