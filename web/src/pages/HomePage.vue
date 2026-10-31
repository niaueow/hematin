<script setup lang="ts">
import { LogOut } from '@lucide/vue';
import { computed, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import AppButton from '@web/components/AppButton.vue';
import { me, logout } from '@web/session';
import { isMiniApp } from '@web/telegram';

// The signed-in landing page. The dashboard itself (charts, CRUD) comes in later Phase 2 milestones.

const router = useRouter();
const name = computed(() => me.value?.firstName?.trim() || 'kamu');
const inBrowser = !isMiniApp();
const busy = ref(false);

async function signOut(all: boolean) {
  busy.value = true;
  try {
    await logout(all);
    await router.replace({ name: 'masuk' });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="page">
    <h1 class="text-h3">Hai {{ name }} 👋</h1>
    <p class="text-body-2">Dashboard lagi dibangun. Sementara, catat pengeluaran lewat bot ya.</p>
    <RouterLink v-if="me?.role === 'OWNER'" to="/playground" class="text-body-3-bold link">Playground</RouterLink>
    <div v-if="inBrowser" class="actions">
      <AppButton variant="secondary" :leading-icon="LogOut" :loading="busy" @click="signOut(false)">Keluar</AppButton>
      <AppButton variant="secondary" :disabled="busy" @click="signOut(true)">Keluar dari semua browser</AppButton>
    </div>
  </main>
</template>

<style scoped>
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-spacing-8);
  margin-top: var(--space-spacing-16);
}

.link {
  color: var(--content-brand-active);
}
</style>
