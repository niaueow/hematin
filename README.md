# Hematin Bot 🐷

Telegram bot for tracking pocket money with a built-in 50/30/20 budget that nudges you to save.

- Log by chatting: `warteg 10k`, `gojek 18k`, `aku jajan cireng 10k`, `reksadana 200k`, `dapet uang jajan 2jt`
- Unknown items: Groq guesses the category, or you pick it once and the bot remembers
- Every log has [✏️ Ganti kategori] [↩️ Undo]
- Ask before buying: `mau donat 35k` → "Gas!" / "Hmm mepet…" / "Waduh…" with [Jadi beli] [Ga jadi]
- `/sisa`, `/riwayat`, `/undo`, `/kategori`, `/pemasukan`, `/dashboard`
- Reminder at ~21:00 WIB if you haven't logged anything, recap every Sunday ~22:00 WIB, income reminder on the 1st
- Invite-only (`/invite`, owner only)
- **Dashboard** (Vue + Chart.js), inside Telegram (📊 menu button) or in a browser (`/dashboard` sends a one-time link), no password: Home (the `/sisa` numbers), Transaksi (filter, add, edit, delete with undo), Statistik (week / month / year charts), Profil (categories, learned keywords, sign out)

**Status:** Phase 1 (the bot, M0–M9) and Phase 2 (the dashboard, M10–M14) are built; M15 was the final review (DECISIONS D-033). Next: use it daily, then polish against Figma and decide the open design items in DESIGN.md §1 "M15 review" (contrast, dark mode).

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

Tests need no database or secrets. `npm run lint` is ESLint + stylelint (no raw colours in `.vue`); `npm run tokens` regenerates `web/src/styles/tokens.css` from a Figma JSON export in `figma-token/`. The Vercel build runs `prisma generate`, the tests, `prisma migrate deploy`, then `vite build`; a failing test cancels the deploy.

## Build order

1. ✅ Scaffold + `env.ts` + Prisma schema + seed
2. ✅ `budget/periods.ts` + `budget/engine.ts` with full tests (no bot yet)
3. ✅ `nlp/amount.ts`, `nlp/intent.ts` with tests
4. ✅ Bot: invite flow → logging → `/sisa` → "mau X" → undo / ganti kategori
5. ✅ Groq fallback + learned aliases
6. ✅ Cron: daily reminder + weekly recap
7. ✅ Phase 1 reviewed (M9)
8. ✅ Phase 2: auth (initData + magic link) → API → design system → shell → dashboard pages (M10–M14)
9. ✅ Final review (M15)
10. Use it daily, tweak copy, polish against Figma ← next
