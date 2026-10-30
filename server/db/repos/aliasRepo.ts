import type { Db } from '../prisma.js';

// Learned keyword → category mappings, per user (BOT_SPEC §2.3). Keywords are stored normalized
// (lowercase); normalizing is the caller's job. The service checks the category is usable first.

export function createAliasRepo(db: Db) {
  return {
    listForUser(userId: string) {
      return db.keywordAlias.findMany({ where: { userId }, include: { category: true }, orderBy: { keyword: 'asc' } });
    },

    findByKeyword(userId: string, keyword: string) {
      return db.keywordAlias.findFirst({ where: { userId, keyword }, include: { category: true } });
    },

    upsert(userId: string, keyword: string, categoryId: string) {
      return db.keywordAlias.upsert({
        where: { userId_keyword: { userId, keyword } },
        create: { userId, keyword, categoryId },
        update: { categoryId },
      });
    },

    async deleteOwn(userId: string, id: string) {
      const { count } = await db.keywordAlias.deleteMany({ where: { id, userId } });
      return count === 1;
    },
  };
}

export type AliasRepo = ReturnType<typeof createAliasRepo>;
