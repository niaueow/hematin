<script setup lang="ts">
import { Archive, LogOut, Pencil, Plus, Tags, Trash2 } from '@lucide/vue';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ApiError } from '@web/api/client';
import {
  createCategory,
  deleteAlias,
  listAliases,
  listCategories,
  updateCategory,
  type Alias,
  type Category,
} from '@web/api/dashboard';
import AppAlert from '@web/components/AppAlert.vue';
import AppButton from '@web/components/AppButton.vue';
import AppChip from '@web/components/AppChip.vue';
import AppInput from '@web/components/AppInput.vue';
import AppSheet from '@web/components/AppSheet.vue';
import AppSkeleton from '@web/components/AppSkeleton.vue';
import ConfirmDialog from '@web/components/ConfirmDialog.vue';
import EmptyState from '@web/components/EmptyState.vue';
import SegmentedControl from '@web/components/SegmentedControl.vue';
import UserAvatar from '@web/components/UserAvatar.vue';
import { useToast } from '@web/composables/useToast';
import { BUCKET_TONE } from '@web/lib/tones';
import { logout, me } from '@web/session';
import { isMiniApp, telegramPhotoUrl } from '@web/telegram';

// Profil (PRD D5, D6): who's signed in; categories (system ones read-only, own ones add / rename / archive);
// learned keywords (delete); signing out of this browser or every browser.

const router = useRouter();
const toast = useToast();
const inMiniApp = isMiniApp();
const name = computed(() => me.value?.firstName?.trim() || me.value?.telegramUsername || 'Kamu');

const categories = ref<Category[] | null>(null);
const aliases = ref<Alias[] | null>(null);
const loadFailed = ref(false);

async function load() {
  loadFailed.value = false;
  try {
    [categories.value, aliases.value] = await Promise.all([listCategories(), listAliases()]);
  } catch {
    loadFailed.value = true;
  }
}
onMounted(load);

const BUCKETS = [
  { value: 'NEEDS', label: 'Pokok' },
  { value: 'WANTS', label: 'Jajan' },
  { value: 'SAVINGS', label: 'Nabung' },
] as const;
const BUCKET_NAME = { NEEDS: 'Pokok', WANTS: 'Jajan', SAVINGS: 'Nabung', INCOME: 'Pemasukan' } as const;
const groups = computed(() =>
  (['NEEDS', 'WANTS', 'SAVINGS', 'INCOME'] as const).map((bucket) => ({
    bucket,
    items: (categories.value ?? []).filter((c) => c.bucket === bucket),
  })),
);

// --- category sheet (add / rename) ---
const sheetOpen = ref(false);
const editingCategory = ref<Category | null>(null);
const form = ref<{ name: string; bucket: 'NEEDS' | 'WANTS' | 'SAVINGS'; error: string | null; saving: boolean }>({
  name: '',
  bucket: 'NEEDS',
  error: null,
  saving: false,
});

function openCategory(category: Category | null) {
  editingCategory.value = category;
  form.value = {
    name: category?.name ?? '',
    bucket: category && category.bucket !== 'INCOME' ? category.bucket : 'NEEDS',
    error: null,
    saving: false,
  };
  sheetOpen.value = true;
}

async function saveCategory() {
  const nameValue = form.value.name.trim();
  if (!nameValue) {
    form.value.error = 'Isi namanya dulu.';
    return;
  }
  form.value.saving = true;
  try {
    if (editingCategory.value) await updateCategory(editingCategory.value.id, { name: nameValue });
    else await createCategory({ name: nameValue, bucket: form.value.bucket });
    sheetOpen.value = false;
    toast.show({ tone: 'positive', message: editingCategory.value ? 'Kategori diubah' : 'Kategori ditambah' });
    await load();
  } catch (err) {
    form.value.error =
      err instanceof ApiError && err.code === 'CATEGORY_EXISTS'
        ? 'Nama itu udah dipakai.'
        : 'Gagal menyimpan. Coba lagi ya.';
  } finally {
    form.value.saving = false;
  }
}

async function archive(category: Category) {
  try {
    await updateCategory(category.id, { archived: true });
    toast.show({
      tone: 'neutral',
      message: `${category.name} diarsipkan`,
      actionLabel: 'Urungkan',
      onAction: () => void updateCategory(category.id, { archived: false }).then(load),
    });
    await load();
  } catch {
    toast.show({ tone: 'negative', message: 'Gagal mengarsipkan. Coba lagi ya.' });
  }
}

async function removeAlias(alias: Alias) {
  aliases.value = (aliases.value ?? []).filter((a) => a.id !== alias.id);
  try {
    await deleteAlias(alias.id);
    toast.show({ tone: 'neutral', message: `"${alias.keyword}" dilupakan` });
  } catch {
    toast.show({ tone: 'negative', message: 'Gagal menghapus. Coba lagi ya.' });
    await load();
  }
}

// --- sign out ---
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
  <div class="shell-page profil">
    <h1 class="text-h3">Profil</h1>
    <div class="profile">
      <UserAvatar :name="name" :src="telegramPhotoUrl()" :size="64" />
      <div>
        <p class="text-body-1-bold">{{ name }}</p>
        <p v-if="me?.telegramUsername" class="text-caption-1 muted">@{{ me.telegramUsername }}</p>
      </div>
    </div>

    <AppAlert v-if="loadFailed" tone="negative" title="Gagal memuat kategori">
      <template #action><AppButton size="small" @click="load">Muat ulang</AppButton></template>
    </AppAlert>

    <!-- Categories -->
    <section class="card" aria-labelledby="cat-title">
      <div class="card__head">
        <h2 id="cat-title" class="text-body-2-bold">Kategori</h2>
        <AppButton size="small" variant="secondary" :leading-icon="Plus" @click="openCategory(null)">Tambah</AppButton>
      </div>
      <template v-if="categories">
        <div v-for="group in groups" v-show="group.items.length" :key="group.bucket" class="group">
          <h3 class="text-caption-1 muted">{{ BUCKET_NAME[group.bucket] }}</h3>
          <ul class="list">
            <li v-for="c in group.items" :key="c.id" class="list__row">
              <AppChip :tone="BUCKET_TONE[c.bucket]">{{ c.emoji ? `${c.emoji} ` : '' }}{{ c.name }}</AppChip>
              <span v-if="!c.own" class="text-caption-2 muted">bawaan</span>
              <span v-else class="list__actions">
                <button type="button" class="icon-button" :aria-label="`Ubah ${c.name}`" @click="openCategory(c)">
                  <Pencil :size="16" aria-hidden="true" />
                </button>
                <button type="button" class="icon-button" :aria-label="`Arsipkan ${c.name}`" @click="archive(c)">
                  <Archive :size="16" aria-hidden="true" />
                </button>
              </span>
            </li>
          </ul>
        </div>
      </template>
      <AppSkeleton v-for="i in 4" v-else-if="!loadFailed" :key="i" shape="rect" height="32px" />
    </section>

    <!-- Learned keywords -->
    <section class="card" aria-labelledby="alias-title">
      <h2 id="alias-title" class="text-body-2-bold">Kata yang diingat bot</h2>
      <p class="text-caption-1 muted">Tiap kamu ganti atau pilih kategori di bot, kata itu diingat buat berikutnya.</p>
      <template v-if="aliases">
        <ul v-if="aliases.length" class="list">
          <li v-for="a in aliases" :key="a.id" class="list__row">
            <span class="text-body-3">{{ a.keyword }}</span>
            <span class="list__actions">
              <AppChip :tone="BUCKET_TONE[a.category.bucket]">{{ a.category.name }}</AppChip>
              <button type="button" class="icon-button" :aria-label="`Lupakan ${a.keyword}`" @click="removeAlias(a)">
                <Trash2 :size="16" aria-hidden="true" />
              </button>
            </span>
          </li>
        </ul>
        <EmptyState
          v-else
          :icon="Tags"
          title="Belum ada kata yang diingat"
          description="Muncul setelah kamu pilih atau ganti kategori di bot."
        />
      </template>
      <AppSkeleton v-for="i in 3" v-else-if="!loadFailed" :key="i" shape="rect" height="32px" />
    </section>

    <!-- Sign out -->
    <AppAlert v-if="inMiniApp" tone="info">Kamu masuk lewat Telegram, jadi ga perlu keluar dari sini.</AppAlert>
    <div v-else class="actions">
      <AppButton variant="secondary" :leading-icon="LogOut" :loading="busy === 'one'" @click="signOut(false)">
        Keluar
      </AppButton>
      <AppButton variant="danger" :disabled="busy !== null" @click="confirmAll = true">
        Keluar dari semua browser
      </AppButton>
    </div>

    <AppSheet v-model:open="sheetOpen" :title="editingCategory ? 'Ubah kategori' : 'Tambah kategori'">
      <form id="category-form" class="form" novalidate @submit.prevent="saveCategory">
        <AppInput v-model="form.name" label="Nama" required maxlength="40" :error="form.error ?? undefined" />
        <div v-if="!editingCategory" class="form__field">
          <span class="text-body-3-bold">Pos</span>
          <SegmentedControl v-model="form.bucket" :options="BUCKETS" label="Pos" />
        </div>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="sheetOpen = false">Batal</AppButton>
        <AppButton type="submit" form="category-form" :loading="form.saving">Simpan</AppButton>
      </template>
    </AppSheet>

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

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-spacing-12);
  padding: var(--space-spacing-16);
  border: 1px solid var(--stroke-primary);
  border-radius: var(--radius-16);
  background: var(--background-light);
}

.card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-spacing-8);
}

.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-spacing-4);
}

.list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.list__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-spacing-8);
  min-height: 40px;
}

.list__actions {
  display: inline-flex;
  align-items: center;
  gap: var(--space-spacing-4);
}

.icon-button {
  display: inline-flex;
  padding: var(--space-spacing-8);
  border: 0;
  border-radius: var(--radius-8);
  background: none;
  color: var(--content-gray);
  cursor: pointer;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-spacing-8);
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-spacing-16);
}

.form__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-spacing-8);
}
</style>
