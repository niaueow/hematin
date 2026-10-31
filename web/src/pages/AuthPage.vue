<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, ApiError } from '@web/api/client';
import { setMe, type Me } from '@web/session';

// /auth?token=… from the bot's /dashboard link (SECURITY §3.2). Loading this page never uses up the token:
// only the POST below does, so a link-preview crawler that GETs the URL can't burn it.

const route = useRoute();
const router = useRouter();
const state = ref<'working' | 'failed' | 'error'>('working');

onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : '';
  // Drop the token from the address bar and history right away (the page also sends no Referer).
  window.history.replaceState(window.history.state, '', '/auth');
  if (!token) {
    state.value = 'failed';
    return;
  }
  try {
    const { user } = await api<{ user: Me }>('/auth/magic', { method: 'POST', body: { token } });
    setMe(user);
    await router.replace({ name: 'home' });
  } catch (err) {
    state.value = err instanceof ApiError && err.status === 401 ? 'failed' : 'error';
  }
});
</script>

<template>
  <main class="page">
    <p v-if="state === 'working'">Lagi masuk…</p>
    <template v-else-if="state === 'failed'">
      <h1>Link-nya udah ga berlaku 😕</h1>
      <p>Link dashboard cuma bisa dipakai sekali dan berlaku 5 menit. Ketik /dashboard di bot buat link baru.</p>
    </template>
    <template v-else>
      <h1>Lagi ada gangguan 🙏</h1>
      <p>Coba buka link-nya lagi bentar lagi.</p>
    </template>
  </main>
</template>
