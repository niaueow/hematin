<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import BottomNav from '@web/components/BottomNav.vue';
import SideNav from '@web/components/SideNav.vue';
import ToastHost from '@web/components/ToastHost.vue';
import { useStoredFlag } from '@web/composables/useStoredFlag';
import { useTelegramBack } from '@web/composables/useTelegramBack';
import { useToast } from '@web/composables/useToast';
import { SIDENAV_COLLAPSED_KEY, type SideNavUser } from '@web/nav';
import { logout, me } from '@web/session';
import { isMiniApp, telegramPhotoUrl } from '@web/telegram';

// The signed-in layout (DESIGN §3 rule 7): the sidebar from 1024px up, the bottom navbar below, and the toast host.
// Pages that aren't a nav tab (meta.back) get Telegram's back button inside the Mini App.

const route = useRoute();
const router = useRouter();
const toast = useToast();
const collapsed = useStoredFlag(SIDENAV_COLLAPSED_KEY);
const inMiniApp = isMiniApp();

const user = computed<SideNavUser | undefined>(() => {
  if (!me.value) return undefined;
  const name = me.value.firstName?.trim() || me.value.telegramUsername || 'Kamu';
  return {
    name,
    ...(me.value.telegramUsername && { subtitle: `@${me.value.telegramUsername}` }),
    avatarUrl: telegramPhotoUrl(),
  };
});

useTelegramBack(
  computed(() => route.meta.back === true),
  () => (window.history.length > 1 ? router.back() : void router.push('/')),
);

async function onLogout() {
  try {
    await logout();
    await router.replace({ name: 'masuk' });
  } catch {
    toast.show({ tone: 'negative', message: 'Gagal keluar. Coba lagi ya.' });
  }
}
</script>

<template>
  <div class="app-shell">
    <a href="#main" class="app-shell__skip text-body-3-bold">Lewati ke konten</a>
    <aside class="app-shell__side">
      <SideNav v-model:collapsed="collapsed" :user="user" :can-logout="!inMiniApp" @logout="onLogout" />
    </aside>
    <main id="main" class="app-shell__main" tabindex="-1">
      <RouterView />
    </main>
    <div class="app-shell__bottom">
      <BottomNav />
    </div>
    <ToastHost />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  padding-top: var(--app-safe-top);
}

.app-shell__side {
  display: none;
}

/* Mobile: the content clears the fixed bottom navbar. */
.app-shell__skip {
  position: absolute;
  z-index: 70;
  top: var(--space-spacing-8);
  left: var(--space-spacing-8);
  padding: var(--space-spacing-8) var(--space-spacing-12);
  border-radius: var(--radius-8);
  background: var(--background-light);
  color: var(--content-brand-active);
  transform: translateY(-200%);
}

/* Keyboard users get a skip link past the navigation (visible only when focused). */
.app-shell__skip:focus {
  transform: none;
}

.app-shell__main {
  min-width: 0;
  padding-bottom: calc(var(--app-bottom-nav-height) + var(--app-safe-bottom));
}

.app-shell__bottom {
  position: fixed;
  z-index: 40;
  right: 0;
  bottom: 0;
  left: 0;
}

.app-shell__main:focus {
  outline: none;
}

@media (min-width: 1024px) {
  .app-shell {
    display: flex;
  }

  .app-shell__side {
    position: sticky;
    top: 0;
    display: block;
    flex: none;
    height: 100vh;
  }

  .app-shell__main {
    flex: 1;
    padding-bottom: 0;
  }

  .app-shell__bottom {
    display: none;
  }
}
</style>
