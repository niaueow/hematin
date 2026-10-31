<script setup lang="ts">
import { LogOut } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppAlert from '@web/components/AppAlert.vue';
import AppButton from '@web/components/AppButton.vue';
import ConfirmDialog from '@web/components/ConfirmDialog.vue';
import UserAvatar from '@web/components/UserAvatar.vue';
import { useToast } from '@web/composables/useToast';
import { logout, me } from '@web/session';
import { isMiniApp, telegramPhotoUrl } from '@web/telegram';

// Profile: who's signed in, and signing out of this browser or every browser. Inside Telegram the Mini App signs
// in with initData on every request, so there's nothing to sign out of.

const router = useRouter();
const toast = useToast();
const inMiniApp = isMiniApp();
const name = computed(() => me.value?.firstName?.trim() || me.value?.telegramUsername || 'Kamu');
const confirmAll = ref(false);
const busy = ref<'one' | 'all' | null>(null);

async function signOut(all: boolean) {
  busy.value = all ? 'all' : 'one';
  try {
    await logout(all);
    confirmAll.value = false;
    await router.replace({ name: 'masuk' });
  } catch {
    toast.show({ tone: 'negative', message: 'Gagal keluar. Coba lagi ya.' });
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div class="shell-page">
    <h1 class="text-h3">Profil</h1>
    <div class="profile">
      <UserAvatar :name="name" :src="telegramPhotoUrl()" :size="64" />
      <div>
        <p class="text-body-1-bold">{{ name }}</p>
        <p v-if="me?.telegramUsername" class="text-caption-1 muted">@{{ me.telegramUsername }}</p>
      </div>
    </div>

    <AppAlert v-if="inMiniApp" tone="info">Kamu masuk lewat Telegram, jadi ga perlu keluar dari sini.</AppAlert>
    <div v-else class="actions">
      <AppButton variant="secondary" :leading-icon="LogOut" :loading="busy === 'one'" @click="signOut(false)">
        Keluar
      </AppButton>
      <AppButton variant="danger" :disabled="busy !== null" @click="confirmAll = true">
        Keluar dari semua browser
      </AppButton>
    </div>

    <ConfirmDialog
      v-model:open="confirmAll"
      title="Keluar dari semua browser?"
      message="Semua browser yang pernah buka dashboard harus minta link baru lewat /dashboard."
      confirm-label="Ya, keluar semua"
      :loading="busy === 'all'"
      @confirm="signOut(true)"
    />
  </div>
</template>

<style scoped>
.profile {
  display: flex;
  align-items: center;
  gap: var(--space-spacing-16);
}

.muted {
  color: var(--content-gray);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-spacing-8);
}
</style>
