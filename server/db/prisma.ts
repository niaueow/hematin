import { PrismaNeon } from '@prisma/adapter-neon';
import { getEnv } from '../env.js';
import { PrismaClient, type Prisma } from './generated/client.js';

// One PrismaClient per function instance (ARCHITECTURE §4), created on first use so importing this
// module never needs env. The Neon adapter talks to the POOLED DATABASE_URL over WebSockets, using
// Node's built-in WebSocket (Node ≥ 22), so no `ws` package. Interactive transactions work.

let client: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  client ??= new PrismaClient({ adapter: new PrismaNeon({ connectionString: getEnv().DATABASE_URL }) });
  return client;
}

/** What repositories accept: the client itself or the `tx` inside `prisma.$transaction(async (tx) => …)`. */
export type Db = Prisma.TransactionClient;
