import { createRouter, createWebHistory } from 'vue-router';
import { loadMe } from '@web/session';

// Every page needs a signed-in user except /auth (redeems a magic link) and /masuk (how to sign in).
// /playground (the component catalogue) is for the OWNER only.

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean;
    ownerOnly?: boolean;
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('@web/pages/HomePage.vue') },
    { path: '/auth', name: 'auth', component: () => import('@web/pages/AuthPage.vue'), meta: { public: true } },
    { path: '/masuk', name: 'masuk', component: () => import('@web/pages/SignInPage.vue'), meta: { public: true } },
    {
      path: '/playground',
      name: 'playground',
      component: () => import('@web/pages/PlaygroundPage.vue'),
      meta: { ownerOnly: true },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  const user = await loadMe().catch(() => null);
  if (!user) return { name: 'masuk' };
  if (to.meta.ownerOnly && user.role !== 'OWNER') return { name: 'home' };
  return true;
});
