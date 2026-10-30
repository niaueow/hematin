-- Data migration: default system categories (DATA_MODEL.md "Seed"). userId NULL = system.
-- Idempotent via the partial unique index "category_system_slug". Never edit this file once applied;
-- add or change keywords in a new data migration.
-- Minimarkets (indomaret, alfamart) are intentionally unmapped: they're ambiguous (snacks vs groceries).

INSERT INTO "Category" ("id", "userId", "slug", "name", "emoji", "bucket", "keywords") VALUES
  ('sys_makan', NULL, 'makan', 'Makan', NULL, 'NEEDS',
    ARRAY['warteg', 'nasi', 'padang', 'makan siang', 'makan malam', 'sarapan', 'gofood', 'grabfood', 'shopeefood']),
  ('sys_transport', NULL, 'transport', 'Transport', NULL, 'NEEDS',
    ARRAY['gojek', 'goride', 'gocar', 'grab', 'maxim', 'ojol', 'krl', 'transjakarta', 'tj', 'mrt', 'lrt', 'bensin', 'parkir', 'tol', 'angkot']),
  ('sys_belanja_bulanan', NULL, 'belanja-bulanan', 'Belanja Bulanan', NULL, 'NEEDS',
    ARRAY['belanja bulanan', 'sabun', 'sampo', 'deterjen', 'odol', 'superindo']),
  ('sys_kuota', NULL, 'kuota', 'Kuota', NULL, 'NEEDS',
    ARRAY['kuota', 'pulsa', 'paket data', 'internet']),
  ('sys_jajan', NULL, 'jajan', 'Jajan', NULL, 'WANTS',
    ARRAY['jajan', 'cireng', 'donat', 'boba', 'seblak', 'cilok', 'martabak', 'cemilan', 'snack', 'es kopi', 'kopi']),
  ('sys_nongkrong', NULL, 'nongkrong', 'Nongkrong', NULL, 'WANTS',
    ARRAY['nongkrong', 'cafe', 'kafe', 'ngopi bareng', 'nonton', 'bioskop', 'karaoke']),
  ('sys_nabung', NULL, 'nabung', 'Nabung', NULL, 'SAVINGS',
    ARRAY['nabung', 'tabungan', 'reksadana', 'saham', 'emas', 'deposito']),
  ('sys_uang_jajan', NULL, 'uang-jajan', 'Uang Jajan', NULL, 'INCOME',
    ARRAY['uang jajan', 'uang saku', 'dikasih', 'transfer mama', 'transfer papa', 'gaji'])
ON CONFLICT ("slug") WHERE "userId" IS NULL DO NOTHING;
