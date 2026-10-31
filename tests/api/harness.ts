import request from 'supertest';
import { vi } from 'vitest';
import { createApp } from '@server/app.js';
import { createBudgetService, type BudgetServiceDeps } from '@server/budget/service.js';
import type { DashboardDeps } from '@server/routes/dashboard.js';
import { APP_URL, authWorld, initDataFor } from '../auth/fakes.js';
import { FakeDb, makeUser } from '../bot/harness.js';

// The real Express app over in-memory repos: the bot's FakeDb holds the data (so a test can compare the API
// with what the bot says), the auth fakes hold users/sessions. Users: A = u1 (Telegram 111), B = u2 (222).

/** The dashboard deps over a FakeDb (also used by tests that don't call the dashboard API). */
export function dashboardDeps(db: FakeDb = new FakeDb()): Omit<DashboardDeps, 'auth' | 'appUrl'> {
  // The FakeDb implements the API's repo methods too; its declared type is the bot's narrower BotRepos.
  const repos = db.repos() as unknown as DashboardDeps['repos'] & {
    transactions: BudgetServiceDeps['txRepo'];
    intents: BudgetServiceDeps['intentRepo'];
  };
  return {
    budget: createBudgetService({ txRepo: repos.transactions, intentRepo: repos.intents }),
    repos: { transactions: repos.transactions, categories: repos.categories, aliases: repos.aliases },
    now: () => db.now(),
  };
}

export const noJobs = () => ({
  secret: 'c'.repeat(32),
  dailyReminder: vi.fn(),
  weeklyRecap: vi.fn(),
  incomeReminder: vi.fn(),
});

export function apiWorld(now = new Date('2026-11-11T03:00:00.000Z')) {
  const db = new FakeDb();
  db.users.push(
    makeUser({ id: 'u1', telegramId: 111n, role: 'OWNER', firstName: 'Nia' }),
    makeUser({ id: 'u2', telegramId: 222n, firstName: 'Rani' }),
  );
  const auth = authWorld();
  const clock = auth.clock;
  clock.now = now;
  db.now = () => clock.now;
  const app = createApp({
    version: 'test',
    cron: noJobs(),
    telegram: { webhookSecret: 'w'.repeat(32), handleUpdate: vi.fn() },
    auth: { auth: auth.auth, appUrl: APP_URL },
    dashboard: dashboardDeps(db),
  });

  /** Requests as a Telegram user, the way the Mini App sends them (tma initData; no CSRF needed). */
  const as = (telegramId: number) => {
    const header = () => `tma ${initDataFor(telegramId, clock.now)}`;
    return {
      get: (path: string) => request(app).get(path).set('authorization', header()),
      post: (path: string, body: object) => request(app).post(path).set('authorization', header()).send(body),
      patch: (path: string, body: object) => request(app).patch(path).set('authorization', header()).send(body),
      delete: (path: string) => request(app).delete(path).set('authorization', header()),
    };
  };
  return { db, app, clock, auth: auth.auth, A: as(111), B: as(222) };
}
