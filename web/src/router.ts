import { createRouter, createWebHistory } from 'vue-router';
import { loadMe } from '@web/session';

// Every page needs a signed-in user except /auth (redeems a magic link) and /masuk (how to sign in).

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean;
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('@web/pages/HomePage.vue') },
    { path: '/auth', name: 'auth', component: () => import('@web/pages/AuthPage.vue'), meta: { public: true } },
    { path: '/masuk', name: 'masuk', component: () => import('@web/pages/SignInPage.vue'), meta: { public: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  const user = await loadMe().catch(() => null);
  return user ? true : { name: 'masuk' };
});
