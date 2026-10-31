import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { loadMe } from '@web/session';

// Every page needs a signed-in user except /auth (redeems a magic link) and /masuk (how to sign in). The signed-in
// pages live inside AppShell (navs + toasts). /playground (the component catalogue) is for the OWNER only.

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean;
    ownerOnly?: boolean;
    /** Not a nav tab: Telegram's back button goes back (AppShell). */
    back?: boolean;
    /** The browser tab title, so screen readers announce the page after navigation. */
    title?: string;
  }
}

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@web/components/AppShell.vue'),
    children: [
      { path: '', name: 'home', component: () => import('@web/pages/HomePage.vue'), meta: { title: 'Home' } },
      {
        path: 'transaksi',
        name: 'transaksi',
        component: () => import('@web/pages/TransaksiPage.vue'),
        meta: { title: 'Transaksi' },
      },
      {
        path: 'statistik',
        name: 'statistik',
        component: () => import('@web/pages/StatistikPage.vue'),
        meta: { title: 'Statistik' },
      },
      {
        path: 'profil',
        name: 'profil',
        component: () => import('@web/pages/ProfilPage.vue'),
        meta: { title: 'Profil' },
      },
      {
        path: 'playground',
        name: 'playground',
        component: () => import('@web/pages/PlaygroundPage.vue'),
        meta: { ownerOnly: true, back: true, title: 'Playground' },
      },
    ],
  },
  {
    path: '/auth',
    name: 'auth',
    component: () => import('@web/pages/AuthPage.vue'),
    meta: { public: true, title: 'Masuk' },
  },
  {
    path: '/masuk',
    name: 'masuk',
    component: () => import('@web/pages/SignInPage.vue'),
    meta: { public: true, title: 'Masuk' },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  const user = await loadMe().catch(() => null);
  if (!user) return { name: 'masuk' };
  if (to.meta.ownerOnly && user.role !== 'OWNER') return { name: 'home' };
  return true;
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Hematin` : 'Hematin';
});
