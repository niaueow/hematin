import { Router } from 'express';
import { z } from 'zod';
import { authOf } from '../auth/http.js';
import type { Category } from '../db/generated/client.js';
import { AppError } from '../lib/errors.js';
import { guard, notFound, parse, pathId, type DashboardDeps } from './dashboard.js';

// /api/categories and /api/aliases (API.md, P1). System categories are read-only for everyone; a user can
// add, rename, re-emoji and archive their own. A category's slug is fixed at creation (it's what the LLM
// enum and aliases key on), so renaming changes only the name.

export function categoryView(c: Category) {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    emoji: c.emoji,
    bucket: c.bucket,
    own: c.userId !== null,
    archived: c.archived,
  };
}

const Name = z.string().trim().min(1).max(40);
/** One emoji (a few code points at most: skin tones, ZWJ sequences). */
const Emoji = z
  .string()
  .trim()
  .max(16)
  .regex(/^\p{Extended_Pictographic}/u, 'must be an emoji');

const CreateBody = z
  .object({ name: Name, bucket: z.enum(['NEEDS', 'WANTS', 'SAVINGS']), emoji: Emoji.optional() })
  .strict();
const PatchBody = z
  .object({ name: Name.optional(), emoji: Emoji.nullable().optional(), archived: z.boolean().optional() })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'nothing to change' });

/** "Kopi Kenangan" → "kopi-kenangan". */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

const isUniqueViolation = (err: unknown) => (err as { code?: unknown } | null)?.code === 'P2002';
const exists = () => new AppError('CATEGORY_EXISTS', 409, 'A category with that name already exists');

export function categoriesRouter(deps: DashboardDeps): Router {
  const router = Router();
  const { categories } = deps.repos;
  router.use(guard(deps));

  /** Names (and slugs) must not clash with any category the user can already see, system ones included. */
  async function assertNameFree(userId: string, name: string, exceptId?: string) {
    const slug = slugify(name);
    const clash = (await categories.listUsable(userId)).some(
      (c) => c.id !== exceptId && (c.slug === slug || c.name.toLowerCase() === name.toLowerCase()),
    );
    if (clash) throw exists();
  }

  router.get('/', async (req, res) => {
    res.json((await categories.listUsable(authOf(req).user.id)).map(categoryView));
  });

  router.post('/', async (req, res) => {
    const userId = authOf(req).user.id;
    const body = parse(CreateBody, req.body);
    const slug = slugify(body.name);
    if (!slug) throw new AppError('VALIDATION', 400, 'name: needs a letter or a digit');
    await assertNameFree(userId, body.name);
    try {
      const created = await categories.createOwn(userId, {
        slug,
        name: body.name,
        bucket: body.bucket,
        emoji: body.emoji ?? null,
      });
      res.status(201).json(categoryView(created));
    } catch (err) {
      if (isUniqueViolation(err)) throw exists(); // an archived one with that slug
      throw err;
    }
  });

  router.patch('/:id', async (req, res) => {
    const userId = authOf(req).user.id;
    const id = pathId(req.params.id);
    if (!(await categories.findOwnById(userId, id))) {
      // System categories are visible to everyone, so saying "read-only" reveals nothing.
      const usable = await categories.findUsableById(userId, id);
      if (usable?.userId === null) throw new AppError('READ_ONLY', 403, 'System categories can’t be changed');
      throw notFound();
    }
    const body = parse(PatchBody, req.body);
    if (body.name !== undefined) await assertNameFree(userId, body.name, id);
    if (!(await categories.updateOwn(userId, id, body))) throw notFound();
    const updated = await categories.findOwnById(userId, id);
    if (!updated) throw notFound();
    res.json(categoryView(updated));
  });

  return router;
}

export function aliasesRouter(deps: DashboardDeps): Router {
  const router = Router();
  const { aliases } = deps.repos;
  router.use(guard(deps));

  router.get('/', async (req, res) => {
    const rows = await aliases.listForUser(authOf(req).user.id);
    res.json(
      rows.map((a) => ({
        id: a.id,
        keyword: a.keyword,
        category: { id: a.category.id, name: a.category.name, bucket: a.category.bucket },
      })),
    );
  });

  router.delete('/:id', async (req, res) => {
    if (!(await aliases.deleteOwn(authOf(req).user.id, pathId(req.params.id)))) throw notFound();
    res.json({ ok: true });
  });

  return router;
}
