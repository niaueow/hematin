// M0 only: Prisma isn't set up yet, so the build skips the Prisma steps while
// prisma/schema.prisma doesn't exist. When the schema exists, this runs the real command.
//
// M1 switches it on by: adding prisma + @prisma/client, committing prisma/schema.prisma and the
// first migration, then replacing the two package.json scripts with the plain commands
//   "prisma:generate": "prisma generate",
//   "prisma:migrate": "prisma migrate deploy"
// and deleting this file. Never use it for migrate dev / reset / db push (AGENTS.md rule 13).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const allowed = ['generate', 'migrate deploy'];
if (!allowed.includes(args.join(' '))) {
  console.error(`prisma-guard: refusing "prisma ${args.join(' ')}". Allowed: ${allowed.join(', ')}.`);
  process.exit(1);
}

if (!existsSync('prisma/schema.prisma')) {
  console.log(`prisma-guard: no prisma/schema.prisma yet (M0), skipping "prisma ${args.join(' ')}".`);
  process.exit(0);
}

const result = spawnSync('npx', ['--no-install', 'prisma', ...args], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
