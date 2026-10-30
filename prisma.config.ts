import { defineConfig } from 'prisma/config';

// Prisma CLI config (Prisma 7). Used by `prisma generate` and `prisma migrate deploy` in the Vercel build.
// - Migrations need the DIRECT (non-pooled) connection; the app uses the pooled DATABASE_URL (server/db/prisma.ts).
// - .env is deliberately NOT loaded: the only database is production, and the CLI should only reach it
//   from the Vercel build (AGENTS.md rule 13). This is the one place outside server/env.ts that reads a
//   connection string, because the CLI runs before the app and needs only this key.
// - `generate` doesn't connect, so DIRECT_URL may be absent locally (postinstall, tests).
const directUrl = process.env.DIRECT_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(directUrl ? { datasource: { url: directUrl } } : {}),
});
