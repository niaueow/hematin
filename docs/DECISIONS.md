# Decision Log

Lightweight ADRs. Append new decisions; don't rewrite old ones. If a decision is reversed, add a new entry that supersedes it.

| # | Date | Decision | Why | Alternatives rejected |
|---|---|---|---|---|
| D-001 | 2026-10-30 | Deploy everything on **Vercel** (Hobby), one project: Vue static build + Express as a single serverless function | Owner requirement; one domain avoids cross-site cookie problems for the dashboard | Separate frontend/backend projects; self-hosting on home server |
| D-002 | 2026-10-30 | Telegram bot uses **webhooks**, not long polling | Serverless has no long-running process | Long polling on home server |
| D-003 | 2026-10-30 | **Neon Postgres**, region Singapore; Vercel function region `sin1` | Closest to Jakarta; free tier; serverless-friendly | — |
| D-004 | 2026-10-30 | **Prisma** with the Neon driver adapter / pooled connection string | Owner preference; adapter avoids TCP connection exhaustion in serverless | Drizzle (lighter, but not preferred) |
| D-005 | 2026-10-30 | **TypeScript** everywhere, **grammY** for the bot, **Zod** for validation | Money domain needs type safety; grammY has an Express webhook adapter | Telegraf, plain JS |
| D-006 | 2026-10-30 | **Invite-only** access: owner generates single-use, expiring invite deep links | Users are owner + a few friends | Open signup; static allowlist of IDs |
| D-007 | 2026-10-30 | Budget base = **income the user records** in the calendar month. Period = calendar month (payday is the 1st) | Owner gets pocket money on the 1st | Fixed budget setting; payday-to-payday period |
| D-008 | 2026-10-30 | 50/30/20 split, prorated **per day** into **Mon–Sun week segments clipped to the month** | Months aren't 4 equal weeks; per-day proration is fair | 4 equal parts; calendar weeks crossing months |
| D-009 | 2026-10-30 | **Asymmetric rollover**: wants surplus → savings bonus; wants overspend → deducted from next segment; needs roll within the month, month-end needs surplus → savings bonus | Stops "save 2 weeks then binge"; restraint always becomes savings | Symmetric rollover; no rollover |
| D-010 | 2026-10-30 | Wants checks also use a **daily pace** (remaining ÷ remaining days) | Stops spending the whole week's wants on Monday | Weekly remaining only |
| D-011 | 2026-10-30 | **Only wants are gated.** "mau X" never records; recording happens on "Jadi beli". Plain logging is always accepted, even when over budget | Never punish honest logging | Blocking or refusing logs |
| D-012 | 2026-10-30 | Budget figures are **computed on read** from transactions, never stored | Edits/deletes in the dashboard stay consistent automatically; no reset cron needed | Stored running balances |
| D-013 | 2026-10-30 | NLP = **hybrid**: rule parser → learned per-user keywords → **Groq** (free tier, `openai/gpt-oss-20b`, strict JSON schema) → ask user | Must be free; LLM only when needed | LLM-only; rules-only |
| D-014 | 2026-10-30 | Enable Groq **Zero Data Retention**; send only message text, no user identifiers | Financial data privacy | — |
| D-015 | 2026-10-30 | Reminder (~21:00 WIB) and weekly recap (Sun ~22:00 WIB) via **Vercel Cron**; ±1 h accepted | Owner accepted Hobby precision; zero infra | cron-job.org; home server crontab |
| D-016 | 2026-10-30 | **Home server not used** in v1 | Not needed; less attack surface | Backups/scheduler on home server (parked) |
| D-017 | 2026-10-30 | Dashboard auth without passwords: **Telegram Mini App initData** (inside Telegram) + **magic link from `/dashboard`** (browser) | Owner wants both in-app and browser access, no manual credentials | Telegram Login Widget; passwords |
| D-018 | 2026-10-30 | Dashboard supports **full CRUD** on transactions | Owner requirement | Read-only dashboard |
| D-019 | 2026-10-30 | Money stored as **integer rupiah**; all dates handled in **Asia/Jakarta** with a stored `localDate` | IDR has no decimals; avoid UTC/WIB off-by-one bugs | Float/Decimal; UTC dates only |
| D-020 | 2026-10-30 | Docs and code in **English**; bot copy in **casual Indonesian** | Standard for code repos and AI coding agents | — |
| D-021 | 2026-10-31 | **Production-only**: one bot, one Neon branch (`main`), no local or staging environment. Safeguards: `npm test` in the Vercel build before `migrate deploy`, Neon backup branch before every migration, env vars scoped to Production only, owner bootstrapped via `OWNER_TELEGRAM_ID` on first `/start`, seed data as SQL migrations | Personal bot; a dev setup isn't worth the effort | Separate dev bot + Neon `dev` branch + local polling (the original setup in SETUP.md v1) |
