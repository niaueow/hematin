-- Raw SQL that the Prisma schema can't express (DATA_MODEL.md "Invariants").
-- Not visible to `prisma migrate diff --from-schema/--to-schema`, so later diffs leave these alone.

-- Money is a positive integer number of rupiah.
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "PurchaseIntent" ADD CONSTRAINT "PurchaseIntent_amount_positive" CHECK ("amount" > 0);

-- The 50/30/20-style split must cover exactly 100%.
ALTER TABLE "User" ADD CONSTRAINT "User_pct_sum_100" CHECK ("needsPct" + "wantsPct" + "savingsPct" = 100);

-- @@unique([userId, slug]) doesn't protect system rows (NULLs are distinct), so system slugs get their own index.
CREATE UNIQUE INDEX "category_system_slug" ON "Category"("slug") WHERE "userId" IS NULL;
