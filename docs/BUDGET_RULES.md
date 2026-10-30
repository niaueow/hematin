# Budget Rules (source of truth)

This is the spec for `server/budget/`. The engine is **pure functions**: input = user settings + transactions + "today", output = numbers. No DB access and no clock reads inside the engine. Every rule here must have unit tests (see §9).

All dates are **calendar dates in Asia/Jakarta (WIB)**. All money is **integer rupiah**. Never use floats for money.

---

## 1. Buckets and categories

| Bucket | Default share | Default categories |
|---|---|---|
| `NEEDS` (kebutuhan pokok) | 50% | Makan, Transport, Belanja Bulanan, Kuota |
| `WANTS` (keinginan) | 30% | Jajan, Nongkrong |
| `SAVINGS` (nabung) | 20% | Nabung (reksadana, saham, emas, tabungan…) |

Transaction types:
- `INCOME`: adds to the month's pool. Has no bucket.
- `EXPENSE`: belongs to a NEEDS or WANTS category.
- `SAVING`: money moved to savings. Counts toward the savings target. **It is not an expense.**

The shares are stored per user (`needsPct`, `wantsPct`, `savingsPct`, must sum to 100). In v1 they're fixed at 50/30/20 (no UI to change them).

## 2. Month and monthly allocation

- Budget month = calendar month (1st → last day). Payday is the 1st.
- `income(M)` = sum of `INCOME` transactions with `localDate` in month M.
- Split, integer-safe:
  ```
  needsMonth   = floor(income * needsPct / 100)
  wantsMonth   = floor(income * wantsPct / 100)
  savingsTarget = income - needsMonth - wantsMonth   // remainder goes to savings
  ```
- If income is recorded later in the month, the month's allocation is recomputed for **all** segments of that month, including past ones. This is fine because everything is computed on read.
- If `income(M) == 0`, the month has **no budget** (state `NO_BUDGET`). The bot asks the user to record income (PRD F12), and a monthly reminder goes out on the 1st (BOT_SPEC §4). In this state, "mau X" checks return `NO_BUDGET`, not DENY.
- **A month without recorded income means income is unknown, not zero** (D-024). A `NO_BUDGET` month is transparent to the rollover chains:
  - Its spending is still recorded and shown (`spent`, history, charts), but it creates **no wants debt and no needs deficit**, and it earns **no savings bonus**.
  - Wants debt and needs carry-in coming from an earlier month **wait** and apply to the **next month that has income**. They aren't forgiven and aren't shown in the `NO_BUDGET` month.
  - Remaining/pace figures are 0 while `NO_BUDGET` (the bot shows the "record income" prompt instead).
  - Logging is never blocked. If that month's income is recorded later, the month is recomputed and joins the chains like any other.

## 3. Week segments

- A week is **Monday → Sunday**.
- A **segment** = the intersection of one Mon–Sun week with one calendar month. A week that crosses a month boundary becomes two segments.
- `days(s)` = number of days in segment s (1–7).

Example, **November 2026** (30 days; Nov 1 is a Sunday, Nov 30 is a Monday):

| Segment | Dates | Days |
|---|---|---|
| S1 | Sun 1 Nov | 1 |
| S2 | Mon 2 – Sun 8 | 7 |
| S3 | Mon 9 – Sun 15 | 7 |
| S4 | Mon 16 – Sun 22 | 7 |
| S5 | Mon 23 – Sun 29 | 7 |
| S6 | Mon 30 Nov | 1 |

### Segment base allocation
For a bucket B in {NEEDS, WANTS} with monthly amount `X`:
```
base(s) = floor(X * days(s) / daysInMonth)   for every segment except the last
base(last) = X - sum(base of the other segments)   // remainder goes to the last segment so the total is exact
```

## 4. WANTS: weekly envelope with asymmetric rollover

Segments are processed **in chronological order across months**, starting from the user's first segment that has a budget. Only months with income take part; a `NO_BUDGET` month passes the debt through unchanged (§2).

```
effective(s) = base(s) - debt(prev)
spent(s)     = sum of WANTS expenses in segment s
debt(s)      = max(0, spent(s) - effective(s))      // overspend carries forward
surplus(s)   = max(0, effective(s) - spent(s))      // goes to the savings bonus
```

- `debt` carries **across month boundaries** (overspending in the last week of October reduces the first segment of November). Debt can be larger than the next base. In that case `effective` is negative, and the debt keeps rolling.
- `surplus(s)` becomes a **savings bonus** only when the segment has **ended** (segment end date < today). A segment in progress has no surplus yet.
- A surplus **never** carries to the next wants segment.
- `debt(prev)` for the very first segment = 0.
- `debt(prev)` for the first segment of a month with income is the debt left by the last month **with income** (a `NO_BUDGET` month in between holds it).

Current segment values:
```
remainingWeek = effective(current) - spent(current)     // can be negative
remainingDays = days from today to end of current segment, inclusive (≥ 1)
dailyPace     = remainingWeek > 0 ? floor(remainingWeek / remainingDays) : 0
remainingMonthWants = remainingWeek + sum(base of this month's segments after the current one)  // informational
// Not "Σ effective − Σ spent": that subtracts rolled debt twice (once in spent, again in the next
// segment's effective). See D-024. NO_BUDGET → 0.
```

## 5. NEEDS: monthly pool with weekly guidance

Needs are not hard-capped weekly, because belanja bulanan is lumpy. Unused needs roll forward within the month.

```
cumAllowance(s)  = sum of base(NEEDS) for this month's segments up to and including s
needsSpentMTD    = NEEDS expenses from the 1st up to today
remainingWeek    = cumAllowance(current) - needsSpentMTD   // "sisa pokok sampai akhir minggu ini"
remainingMonth   = needsMonth - carryIn - needsSpentMTD
```

- **Month-end surplus** (`remainingMonth > 0` when the month has ended) → savings bonus for that month.
- **Month-end deficit** → `carryIn` for next month: `carryIn(M+1) = max(0, -remainingMonth(M))`. This reduces next month's needs. *(Default for PRD open question Q1.)* "Next month" is the next month **with income**; a `NO_BUDGET` month holds the carry-in and adds none of its own (§2).
- `carryIn` reduces `remainingMonth` only. `remainingWeek` stays `cumAllowance − needsSpentMTD` (confirmed by the owner, §10 I3).
- Overspending needs never blocks logging. The bot only shows a warning line.

## 6. Purchase check ("mau X") verdicts

Only for categories in the **WANTS** bucket. Input: `amount`, today's wants state.

| Condition (checked in order) | Verdict | Meaning |
|---|---|---|
| `income(month) == 0` | `NO_BUDGET` | Ask the user to record income first |
| `amount > remainingWeek` (includes `remainingWeek ≤ 0`) | `DENY` | "ga boleh dulu ya", show that next week would be cut by `amount - max(remainingWeek, 0)` |
| `amount > dailyPace` | `CAUTION` | Allowed but nudge; show the per-day amount after buying |
| otherwise | `ALLOW` | Go ahead |

After-purchase numbers shown in the copy:
```
remainingAfter = remainingWeek - amount
daysAfterToday = remainingDays - 1
perDayAfter    = daysAfterToday > 0 ? floor(max(remainingAfter,0) / daysAfterToday) : null
```

For a **NEEDS** item in a "mau" message, there is no verdict. The bot shows needs `remainingWeek` and offers **[Catat]**.

The user can still tap **[Jadi beli]** after a DENY. The expense is recorded, the debt rolls forward, and the bot replies in the BOT_SPEC §5 tone (D-023): it may call out the overspend, but it never refuses (D-011).

## 7. Savings progress

```
recordedSavings(M) = sum of SAVING transactions in month M
bonus(M) = sum of surplus(s) for WANTS segments in M that have ended
         + needs month-end surplus of M (only once M has ended)
savingsTotal(M)    = recordedSavings(M) + bonus(M)
savingsProgressPct = savingsTarget(M) > 0 ? floor(savingsTotal * 100 / savingsTarget) : 0
```

- `bonus` is **virtual** (budget money that wasn't spent). The weekly recap reminds the user to actually transfer it (PRD Q2).
- **Saved by skipping** = sum of `PurchaseIntent.amount` where decision = `SKIPPED`, per week and per month. This is a motivational stat and is **not** added to savings.

## 8. Worked example

Income on 1 Nov 2026 = **Rp2.000.000** → needs 1.000.000, wants 600.000, savings target 400.000. November has 30 days, so wants are Rp20.000 per day.

| Seg | Days | Wants base | Debt in | Effective | Spent | Result |
|---|---|---|---|---|---|---|
| S1 (1 Nov) | 1 | 20.000 | 0* | 20.000 | 15.000 | surplus 5.000 → bonus |
| S2 (2–8) | 7 | 140.000 | 0 | 140.000 | 170.000 | debt 30.000 |
| S3 (9–15) | 7 | 140.000 | 30.000 | 110.000 | 90.000 | surplus 20.000 → bonus |
| … | | | | | | |
| S6 (30 Nov) | 1 | 20.000** | | | | |

\* assuming October ended without wants debt.
\** last segment absorbs the rounding remainder: 600.000 − (20.000 + 4×140.000) = 20.000.

"mau donat 35k" on **Wed 11 Nov** with S3 spent so far = 50.000:
- remainingWeek = 110.000 − 50.000 = 60.000; remainingDays = Wed→Sun = 5; dailyPace = 12.000
- 35.000 ≤ 60.000 but > 12.000 → **CAUTION**
- after buying: 25.000 left for 4 more days → Rp6.250/day → shown as Rp6.250
- remainingMonthWants = 60.000 + (S4 140.000 + S5 140.000 + S6 20.000) = **360.000**. S2's 30.000 overspend is subtracted once, through S3's effective. The old formula gave 335.000.

## 9. Required tests (Vitest, table-driven)

1. Segment splitting for: Nov 2026 (1-day first and last segments), Feb 2026 (28 days), Feb 2028 (leap year), a month starting on Monday.
2. Base allocations sum exactly to the monthly amount for every month in 2026–2028.
3. Wants debt carries across a month boundary.
4. Surplus only counted for ended segments; never added to the next segment.
5. Verdict table §6 including the `remainingWeek ≤ 0` and `NO_BUDGET` cases.
6. Needs carry-in after a month-end deficit; needs surplus → bonus.
7. Income added mid-month recomputes past segments.
8. Editing or deleting a past transaction changes downstream debt and bonus.
9. WIB date boundaries: a transaction at 23:30 WIB on the 31st (16:30 UTC) belongs to the 31st, and one at 00:30 WIB on the 1st (17:30 UTC on the previous day) belongs to the 1st.

## 10. Owner decisions on open cases (2026-10-31, D-024)

These were open after M2 and are now decided. Each is covered in `tests/budget/engine.test.ts`.

| # | Case | Decision |
|---|---|---|
| I1 | A month **without income** | `NO_BUDGET` = income unknown, not zero. The month is transparent to the chains: no new wants debt, needs deficit, or bonus from it, and earlier debt/carry-in waits for the next month with income (§2). A reminder goes out on the 1st of every month, ~10:00 WIB, to users with no income recorded for that month yet (BOT_SPEC §4) |
| I2 | Transactions dated **after today** | Ignored until their date arrives |
| I3 | Needs `carryIn` | Reduces the month's needs (`remainingMonth`) as in §5. `remainingWeek` = `cumAllowance − needsSpentMTD` |
| I4 | `remainingMonthWants` | Fixed in §4: `remainingWeek + Σ base of later segments` (360.000 in §8, not 335.000) |
| I5 | Weekly recap "Jajan: spent / allocation" | Show `allocationAfterDebt` = Σ base − debt carried into the week's first segment. `baseAllocation` and `debtDeducted` are returned separately. Debt between two segments of the same week isn't deducted again (it's already in `spent`). Invariant: `allocationAfterDebt − spent = leftover − debtOut` |
| I6 | Recap on Sunday night | The recap covers Mon–Sun. `leftover` (Σ surplus) includes the segment ending today, as a projection: it becomes a real bonus at midnight |
