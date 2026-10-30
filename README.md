# Hematin Bot 🐷

Telegram bot for tracking pocket money with a built-in 50/30/20 budget that nudges you to save.

- Log by chatting: `warteg 10k`, `gojek 18k`, `aku jajan cireng 10k`, `reksadana 200k`
- Ask before buying: `mau donat 35k` → "Gas!" / "Hmm mepet…" / "Waduh, udah abis 🥲"
- `/sisa` for what's left this week and month
- Reminder at ~21:00 WIB if you haven't logged anything, recap every Sunday ~22:00 WIB
- Phase 2: dashboard with charts (week/month/year) + full CRUD, inside Telegram or in the browser, no password

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
| [docs/SETUP.md](docs/SETUP.md) | Local dev on Windows ARM, deploy, webhook setup |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Why things are the way they are |

## Quick start

See [docs/SETUP.md](docs/SETUP.md).

## Build order

1. Scaffold + `env.ts` + Prisma schema + seed
2. `budget/periods.ts` + `budget/engine.ts` with full tests (no bot yet)
3. `nlp/amount.ts`, `nlp/intent.ts` with tests
4. Bot: invite flow → logging → `/sisa` → "mau X" → undo / ganti kategori
5. Groq fallback + learned aliases
6. Cron: daily reminder + weekly recap
7. Deploy Phase 1, use it for 2 weeks, tweak copy
8. Phase 2: auth (initData + magic link) → API → Vue dashboard → charts → CRUD
