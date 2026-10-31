# PRD — Telegram Financial Tracker ("Celengan Bot", working name)

| | |
|---|---|
| Status | Draft v1 — requirements agreed, ready for build |
| Owner | (you) |
| Last updated | 2026-10-31 |
| Related | `docs/BUDGET_RULES.md`, `docs/BOT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/DECISIONS.md` |

---

## 1. Problem

I get pocket money (uang jajan) from my parents on the **1st of every month**. Without tracking, the money for snacks and hanging out (wants) runs out before the month ends, and nothing is left for savings. Existing finance apps are too heavy: logging takes too many taps, so I stop logging.

## 2. Goal

A Telegram bot where logging an expense is as fast as sending a chat message ("warteg 10k"), and which **actively nudges me to save**: it tracks a 50/30/20 budget split per week, tells me whether I can afford a "want" before I buy it, reminds me to log, and recaps my week.

### Success metrics (personal use)
- I log ≥ 1 transaction on ≥ 80% of days (measured by reminder data).
- Wants spending stays ≤ wants allocation in ≥ 3 of 4 weeks per month.
- Savings (recorded + bonus) ≥ 20% of monthly income.
- Logging one expense takes ≤ 1 message (+ at most 1 tap to fix a wrong category).

### Non-goals
- Not a bank-sync / open-banking app. All data is entered manually.
- Not a public product. Invite-only for me and a few friends.
- No multi-currency (IDR only), no multi-timezone (WIB only) in v1.
- No investment tracking beyond "money moved to savings".

## 3. Users

| Persona | Description |
|---|---|
| Owner (me) | Student, monthly pocket money on the 1st, wants to stop over-snacking and build savings. Creates invites. |
| Member (friend) | Same use case, joins via invite link. Sees only their own data. |

All users are in **WIB (Asia/Jakarta)**.

## 4. Scope by phase

### Phase 1 — Bot MVP
| ID | Feature | Priority |
|---|---|---|
| F1 | Invite-only onboarding via `t.me/<bot>?start=<code>` (single-use, expiring) | P0 |
| F2 | Log expense with simple NLP ("aku jajan cireng 10k" → Jajan / Wants) | P0 |
| F3 | Log income ("dapet uang jajan 2jt") and savings ("reksadana 200k") | P0 |
| F4 | Hybrid categorization: rules → learned per-user keywords → Groq LLM fallback → ask user via buttons | P0 |
| F5 | Every log reply has **[✏️ Ganti kategori] [↩️ Undo]** buttons | P0 |
| F6 | Budget engine: 50/30/20 monthly split, prorated into Mon–Sun weekly segments (see BUDGET_RULES) | P0 |
| F7 | `/sisa` — remaining money this week and this month, per bucket | P0 |
| F8 | "Mau X" purchase check: ALLOW / CAUTION / DENY for **wants only**, with persuasive casual copy and **[🍩 Jadi beli] [💪 Ga jadi]** buttons; nothing is recorded unless "Jadi beli" | P0 |
| F9 | Asymmetric rollover: wants surplus → savings bonus; wants overspend → deducted from next week | P0 |
| F10 | Daily reminder ~21:00 WIB if nothing logged today (with "Hari ini emang ga keluar duit" button) | P0 |
| F11 | Weekly recap Sunday ~22:00 WIB | P0 |
| F12 | Income nudge: if no income logged for the current month, the bot asks for it (on first interaction and in the daily reminder) | P1 |
| F13 | `/riwayat` (last N transactions), `/kategori` | P1 |
| F14 | Slang amounts (goceng, ceban, goban…). *As built: the BOT_SPEC §2.1 list (seceng, goceng, ceban, gocap, cepek); "goban" isn't recognized.* | P2 |

### Phase 2 — Dashboard
| ID | Feature | Priority |
|---|---|---|
| D1 | Vue web dashboard, opens **inside Telegram (Mini App)** and **in a normal browser (magic link)**, no username/password | P0 |
| D2 | Summary charts (Chart.js) for **week / month / year**: income vs expense, spend per bucket, spend per category, savings progress | P0 |
| D3 | Full CRUD of transactions (create, edit, delete) with filters (date range, type, category) | P0 |
| D4 | Budget view: current week/month remaining per bucket, matches `/sisa` exactly | P0 |
| D5 | Manage categories and learned keywords | P1 |
| D6 | Logout / revoke sessions | P1 |

### Parked (not now)
Custom ratios per user (DB columns exist, UI later) · CSV export · receipt OCR · multi-timezone · automated DB backups (optional home-server job) · savings withdrawals · shared/group budgets.

## 5. Key user stories & acceptance criteria

**US1 — Fast logging**
> As a user, I send "warteg 10k" and it's recorded as Makan (Needs) Rp10.000.
- Amount parsing supports `10k`, `10rb`, `10 ribu`, `10.000`, `10000`, `1,5jt`, `1.5jt`, `2jt`.
- Reply within ~3 s, showing category, bucket, and remaining for that bucket this week.
- Wrong category is fixable with one tap; the chosen keyword is learned for this user. *(As built: two taps, ✏️ Ganti kategori then the category; an LLM pick can be confirmed with one tap, 👍. See the M9 review.)*

**US2 — Purchase check**
> As a user, I send "mau donat 35k" and the bot tells me if I can afford it.
- Only wants categories are gated. For a needs item ("mau makan warteg 15k"), the bot just shows remaining needs and offers to log it.
- Verdict follows `BUDGET_RULES.md §6`. Nothing is recorded until "Jadi beli" is tapped.
- "Ga jadi" increments my "duit yang berhasil diselamatkan" stat.
- The pending check expires after 24 h.

**US3 — Know my remaining money**
> `/sisa` shows remaining per bucket for this week and this month, plus today's daily pace for wants.

**US4 — Reminder**
> If I haven't logged anything (any type) today and haven't marked a no-spend day, I get one reminder between 21:00 and 22:00 WIB.

**US5 — Weekly recap**
> Every Sunday between 22:00 and 23:00 WIB I get a recap of Mon–Sun: spend per bucket vs allocation, top 3 categories, savings bonus, money saved by skipping, and a short motivating line.

**US6 — Dashboard access**
> Tapping "📊 Dashboard" in Telegram opens it with no login. Typing `/dashboard` gives a one-time link for the laptop browser. No user can ever see another user's data.

**US7 — Dashboard CRUD**
> Editing or deleting a past transaction in the dashboard immediately changes `/sisa`, rollover, and recaps (everything is computed from transactions).

## 6. Bot personality

Casual Indonesian, friendly, like a supportive friend who's a bit strict about saving. Uses "kamu". Short (≤ 5 lines), ≤ 2 emoji, always shows concrete numbers. Calls out overspending bluntly (BOT_SPEC §5, D-023), but recording is always accepted; persuasion happens only on "mau X" checks and in recaps. Full copy guide: `docs/BOT_SPEC.md §5`.

## 7. Constraints

- Deploy **only on Vercel** (Hobby plan, personal, non-commercial). Vercel Hobby cron runs at most once/day per job and fires somewhere within the scheduled hour.
- DB: Neon Postgres (free), region Singapore. Vercel function region `sin1`.
- Stack: Vue 3 + Vite, Express, Prisma, TypeScript, grammY, Zod, Chart.js (vue-chartjs).
- NLP must be free: rules first, Groq free tier as fallback. Groq rate limits are per organization.
- Dev machine: Windows on ARM (Snapdragon X), used only for editing code and pushing.
- **Production-only**: no local or staging environment. Tests run in the Vercel build, and a Neon backup branch is created before migrations (DECISIONS D-021).
- The home server is **not** used in v1.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Strict bot makes me stop logging honestly | Logging is never refused; nudges only on "mau X" |
| NLP picks wrong category | One-tap fix + per-user learned keywords |
| Groq limit/outage | Fall back to category buttons; bot never fails to record |
| Cron fires late or fails (no retries on Vercel) | Accepted ±1 h; jobs are idempotent per day; failures visible in Vercel logs |
| Neon cold start (scale to zero) adds latency | Acceptable for personal use; reply budget ~3 s |
| Data leak between users | All queries scoped by server-derived userId; tests for cross-user access (SECURITY.md) |

## 9. Open questions (defaults chosen; confirm or change)

| # | Question | Default in docs |
|---|---|---|
| Q1 | Needs overspend at month end: what happens? | Deficit carries into next month's needs (reduces it) |
| Q2 | Savings bonus is "virtual". Should the bot remind me to actually transfer it to my savings account? | Yes, one line in the weekly recap |
| Q3 | A week segment of only 1 day (e.g. Sun 1 Nov 2026) is tiny. Merge it with the next segment? | No merge; prorated by day so it's still fair |
| Q4 | Bot name | "Celengan Bot" (placeholder) |

| # | Answer | 
|---|---|
| Q1 | Ok |
| Q2 | Ok |
| Q3 | Ok |
| Q4 | hematin |