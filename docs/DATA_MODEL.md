# Data Model

Draft Prisma schema. **Adapt the `generator`/`datasource` blocks to the installed Prisma major version.** Newer Prisma versions changed the generator name, require an `output` path, and move the connection config into `prisma.config.ts`. Check the current Prisma docs for "Neon" + "driver adapters" before scaffolding.

Conventions:
- IDs are `cuid()` strings. Telegram IDs are `BigInt` (they can exceed 2³¹).
- Money is `Int` rupiah (max ≈ Rp2,1 miliar per row, which is plenty). Sums are aggregated in code or DB as bigint/number.
- `localDate` is the WIB calendar date (`@db.Date`). `occurredAt` is the exact instant (`@db.Timestamptz`).
- Every user-owned table has `userId` with an index.

```prisma
generator client {
  provider = "prisma-client-js"     // ⚠ adjust to your Prisma version
  previewFeatures = ["driverAdapters"] // ⚠ may be unnecessary/removed in newer versions
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // pooled
  directUrl = env("DIRECT_URL")     // migrations
}

enum Role          { OWNER MEMBER }
enum UserStatus    { ACTIVE DISABLED }
enum Bucket        { NEEDS WANTS SAVINGS INCOME }
enum TxType        { INCOME EXPENSE SAVING }
enum TxSource      { BOT WEB }
enum ParseMethod   { RULE ALIAS LLM USER_PICK MANUAL }
enum Verdict       { ALLOW CAUTION DENY NO_BUDGET }
enum IntentStatus  { PENDING BOUGHT SKIPPED EXPIRED }

model User {
  id               String     @id @default(cuid())
  telegramId       BigInt     @unique
  telegramUsername String?
  firstName        String?
  role             Role       @default(MEMBER)
  status           UserStatus @default(ACTIVE)
  botBlocked       Boolean    @default(false)
  needsPct         Int        @default(50)
  wantsPct         Int        @default(30)
  savingsPct       Int        @default(20)
  timezone         String     @default("Asia/Jakarta")
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt

  transactions   Transaction[]
  categories     Category[]
  aliases        KeywordAlias[]
  intents        PurchaseIntent[]
  noSpendDays    NoSpendDay[]
  sessions       Session[]
  magicTokens    MagicLinkToken[]
  invitesCreated Invite[] @relation("InviteCreator")
  invitesUsed    Invite[] @relation("InviteUser")
}

model Invite {
  id          String    @id @default(cuid())
  codeHash    String    @unique          // sha256(code); the plain code is never stored
  createdById String
  createdBy   User      @relation("InviteCreator", fields: [createdById], references: [id])
  expiresAt   DateTime
  usedAt      DateTime?
  usedById    String?
  usedBy      User?     @relation("InviteUser", fields: [usedById], references: [id])
  createdAt   DateTime  @default(now())
}

/// System categories have userId = null and are seeded. Users may add their own.
model Category {
  id        String   @id @default(cuid())
  userId    String?
  user      User?    @relation(fields: [userId], references: [id])
  slug      String                       // "makan", "jajan", ...
  name      String                       // "Makan"
  emoji     String?
  bucket    Bucket
  keywords  String[]                     // default keywords (system categories)
  archived  Boolean  @default(false)
  createdAt DateTime @default(now())

  transactions Transaction[]
  aliases      KeywordAlias[]

  @@unique([userId, slug])
  @@index([userId])
}

/// Learned per-user mapping, e.g. "cireng" → jajan, created when the user corrects a category.
model KeywordAlias {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  keyword    String                       // normalized lowercase
  categoryId String
  category   Category @relation(fields: [categoryId], references: [id])
  createdAt  DateTime @default(now())

  @@unique([userId, keyword])
}

model Transaction {
  id          String      @id @default(cuid())
  userId      String
  user        User        @relation(fields: [userId], references: [id])
  type        TxType
  amount      Int                          // rupiah, > 0
  categoryId  String?                      // required for EXPENSE and SAVING
  category    Category?   @relation(fields: [categoryId], references: [id])
  note        String?                      // e.g. "cireng"
  rawText     String?                      // original chat message (bot only)
  occurredAt  DateTime    @db.Timestamptz
  localDate   DateTime    @db.Date         // WIB date; drives all budget math
  source      TxSource
  parseMethod ParseMethod
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  deletedAt   DateTime?

  intent      PurchaseIntent?

  @@index([userId, localDate])
  @@index([userId, type, localDate])
}

model PurchaseIntent {
  id            String       @id @default(cuid())
  userId        String
  user          User         @relation(fields: [userId], references: [id])
  item          String
  amount        Int
  categoryId    String
  verdict       Verdict
  status        IntentStatus @default(PENDING)
  localDate     DateTime     @db.Date
  expiresAt     DateTime
  decidedAt     DateTime?
  transactionId String?      @unique
  transaction   Transaction? @relation(fields: [transactionId], references: [id])
  createdAt     DateTime     @default(now())

  @@index([userId, status, localDate])
}

/// "Hari ini emang ga keluar duit" — suppresses the daily reminder.
model NoSpendDay {
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  localDate DateTime @db.Date
  createdAt DateTime @default(now())

  @@id([userId, localDate])
}

model Session {
  id         String   @id @default(cuid())
  tokenHash  String   @unique               // sha256(random 32 bytes)
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  expiresAt  DateTime
  lastSeenAt DateTime @default(now())
  userAgent  String?
  revokedAt  DateTime?
  createdAt  DateTime @default(now())

  @@index([userId])
}

model MagicLinkToken {
  id        String    @id @default(cuid())
  tokenHash String    @unique
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  expiresAt DateTime                        // now + 5 min
  usedAt    DateTime?
  createdAt DateTime  @default(now())
}

/// Short-lived conversation state, e.g. waiting for an amount ("Berapa duitnya?")
/// or confirming an ambiguous one ("Maksudnya Rp20.000?"). One row per user; overwritten.
model ChatState {
  userId    String   @id
  kind      String                        // "AWAIT_AMOUNT" | "CONFIRM_AMOUNT" | "AWAIT_CATEGORY"
  payload   Json                          // e.g. { item, type, candidateAmount }
  expiresAt DateTime                      // now + 10 min
  updatedAt DateTime @updatedAt
}

/// Telegram retry protection.
model ProcessedUpdate {
  updateId  BigInt   @id
  createdAt DateTime @default(now())
}

model CronRun {
  runKey    String   @id                    // "daily-reminder:2026-10-30"
  createdAt DateTime @default(now())
  finishedAt DateTime?
  stats     Json?
}

model RateLimit {
  key         String   @id                  // "msg:<userId>:<yyyymmddhhmm>" or "llm:<userId>:<yyyymmdd>"
  count       Int      @default(0)
  expiresAt   DateTime

  @@index([expiresAt])
}
```

## Invariants (enforce in code + tests)

| Rule | Where |
|---|---|
| `amount > 0` | Zod schema + DB `CHECK (amount > 0)` via a raw SQL migration |
| `EXPENSE` → category bucket ∈ {NEEDS, WANTS}; `SAVING` → bucket = SAVINGS; `INCOME` → category null or bucket INCOME | service layer |
| `localDate` = WIB date of `occurredAt` | set in exactly one function: `toLocalDate()` |
| A user can only reference their own or system categories | service layer check on create/update |
| `needsPct + wantsPct + savingsPct = 100` | Zod + DB CHECK |
| System category slugs are unique | Postgres treats NULLs as distinct, so `@@unique([userId, slug])` does **not** protect system rows (`userId = null`). Add a raw SQL partial index: `CREATE UNIQUE INDEX category_system_slug ON "Category"(slug) WHERE "userId" IS NULL;` |

## Housekeeping (inside the daily cron)

- Delete `ProcessedUpdate` older than 7 days, expired `RateLimit` rows, and `MagicLinkToken` older than 1 day.
- Mark `PurchaseIntent` with status `PENDING` and `expiresAt < now()` as `EXPIRED`.
- Delete sessions that have been expired or revoked for > 30 days.

## Seed: default categories

There's no local environment, so the seed is a **SQL data migration** (`<ts>_seed_categories/migration.sql`) applied by `prisma migrate deploy`. Use `INSERT … ON CONFLICT (slug) WHERE "userId" IS NULL DO NOTHING` (relies on the partial unique index above). To add or change keywords later, write a new data migration. Don't edit an applied one.

| slug | name | bucket | sample keywords |
|---|---|---|---|
| makan | Makan | NEEDS | warteg, nasi, padang, makan siang, makan malam, sarapan, gofood, grabfood, shopeefood |
| transport | Transport | NEEDS | gojek, goride, gocar, grab, maxim, ojol, krl, transjakarta, tj, mrt, lrt, bensin, parkir, tol, angkot |
| belanja-bulanan | Belanja Bulanan | NEEDS | belanja bulanan, sabun, sampo, deterjen, odol, superindo |
| kuota | Kuota | NEEDS | kuota, pulsa, paket data, internet |
| jajan | Jajan | WANTS | jajan, cireng, donat, boba, seblak, cilok, martabak, cemilan, snack, es kopi, kopi |
| nongkrong | Nongkrong | WANTS | nongkrong, cafe, kafe, ngopi bareng, nonton, bioskop, karaoke |
| nabung | Nabung | SAVINGS | nabung, tabungan, reksadana, saham, emas, deposito |
| uang-jajan | Uang Jajan | INCOME | uang jajan, uang saku, dikasih, transfer mama, transfer papa, gaji |

Minimarkets (indomaret, alfamart) are ambiguous (snacks vs. groceries). Don't map them by default; let the LLM decide or ask the user. "gofood/grabfood" → **makan**, not transport.
