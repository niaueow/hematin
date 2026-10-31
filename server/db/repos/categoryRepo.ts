import type { Bucket } from '../generated/client.js';
import type { Db } from '../prisma.js';

// Categories: system rows (userId NULL, seeded) + the user's own. A user may read and use system
// categories and their own; they may only change their own.

/** `where` fragment: system categories or this user's own. */
const usableBy = (userId: string) => ({ OR: [{ userId }, { userId: null }] });

export type NewCategory = { slug: string; name: string; bucket: Bucket; emoji?: string | null };
export type CategoryPatch = Partial<Pick<NewCategory, 'name' | 'emoji'>> & { archived?: boolean };

export function createCategoryRepo(db: Db) {
  return {
    /** Everything the user can pick from: system + own, active only. */
    listUsable(userId: string) {
      return db.category.findMany({
        where: { ...usableBy(userId), archived: false },
        orderBy: [{ bucket: 'asc' }, { name: 'asc' }],
      });
    },

    /** For create/update validation: a user can only reference system or own categories. */
    findUsableById(userId: string, id: string) {
      return db.category.findFirst({ where: { id, ...usableBy(userId) } });
    },

    findOwnById(userId: string, id: string) {
      return db.category.findFirst({ where: { id, userId } });
    },

    createOwn(userId: string, category: NewCategory) {
      return db.category.create({ data: { ...category, userId, keywords: [] } });
    },

    async updateOwn(userId: string, id: string, patch: CategoryPatch) {
      const { count } = await db.category.updateMany({ where: { id, userId }, data: patch });
      return count === 1;
    },
  };
}

export type CategoryRepo = ReturnType<typeof createCategoryRepo>;
