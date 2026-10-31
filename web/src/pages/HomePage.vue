<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
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
    <h1>Hai {{ name }} 👋</h1>
    <p>Dashboard lagi dibangun. Sementara, catat pengeluaran lewat bot ya.</p>
    <div v-if="inBrowser" class="actions">
      <button type="button" :disabled="busy" @click="signOut(false)">Keluar</button>
      <button type="button" :disabled="busy" @click="signOut(true)">Keluar dari semua browser</button>
    </div>
  </main>
</template>

<style scoped>
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1.5rem;
}
</style>
