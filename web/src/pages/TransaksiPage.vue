<script setup lang="ts">
import { Plus, ReceiptText, RefreshCw } from '@lucide/vue';
import { computed, onMounted, ref, watch } from 'vue';
import { listCategories, type Category, type Transaction } from '@web/api/dashboard';
import AppAlert from '@web/components/AppAlert.vue';
import AppButton from '@web/components/AppButton.vue';
import AppSkeleton from '@web/components/AppSkeleton.vue';
import ChipButton from '@web/components/ChipButton.vue';
import ConfirmDialog from '@web/components/ConfirmDialog.vue';
import EmptyState from '@web/components/EmptyState.vue';
import SegmentedControl from '@web/components/SegmentedControl.vue';
import TxFormSheet from '@web/components/TxFormSheet.vue';
import TxRow from '@web/components/TxRow.vue';
import { useToast } from '@web/composables/useToast';
import { useTransactionList } from '@web/composables/useTransactionList';
import { formatRupiah, today } from '@web/lib/format';
import { categoriesForType, groupByDate, PERIOD_OPTIONS, TYPE_LABEL, TYPE_OPTIONS } from '@web/lib/transactions';

// Transaksi (PRD D3, US7): filter, list by day, create / edit in a sheet, delete with confirmation and undo.
// Every change goes straight to the API, so Home and /sisa reflect it on their next read.

const toast = useToast();
const list = useTransactionList({ today: () => today(), toast });
const categories = ref<Category[]>([]);

const groups = computed(() => groupByDate(list.items.value, today()));
const chips = computed(() => categoriesForType(categories.value, list.filters.type));

// A category filter that doesn't fit the chosen type is dropped.
watch(
  () => list.filters.type,
  () => {
    if (list.filters.categoryId && !chips.value.some((c) => c.id === list.filters.categoryId))
      list.filters.categoryId = null;
  },
);

const sheetOpen = ref(false);
const editing = ref<Transaction | null>(null);
const confirming = ref<Transaction | null>(null);

function openCreate() {
  editing.value = null;
  sheetOpen.value = true;
}

function openEdit(tx: Transaction) {
  editing.value = tx;
  sheetOpen.value = true;
}

function onSaved(tx: Transaction) {
  toast.show({
    tone: 'positive',
    message: editing.value ? 'Transaksi diubah' : `${TYPE_LABEL[tx.type]} ${formatRupiah(tx.amount)} dicatat`,
  });
  void list.reload();
}

async function confirmDelete() {
  const tx = confirming.value;
  confirming.value = null;
  if (tx) await list.removeWithUndo(tx);
}

onMounted(async () => {
  void list.reload();
  try {
    categories.value = await listCategories();
  } catch {
    // filters by category just aren't offered
  }
});
</script>

<template>
  <div class="shell-page transaksi">
    <div class="transaksi__head">
      <h1 class="text-h3">Transaksi</h1>
      <AppButton :leading-icon="Plus" @click="openCreate">Tambah</AppButton>
    </div>

    <div class="filters">
      <SegmentedControl v-model="list.filters.period" :options="PERIOD_OPTIONS" label="Periode" />
      <SegmentedControl v-model="list.filters.type" :options="TYPE_OPTIONS" label="Jenis" />
      <div v-if="chips.length" class="filters__chips" role="group" aria-label="Kategori">
        <ChipButton :pressed="list.filters.categoryId === null" @click="list.filters.categoryId = null">
          Semua kategori
        </ChipButton>
        <ChipButton
          v-for="c in chips"
          :key="c.id"
          :pressed="list.filters.categoryId === c.id"
          @click="list.filters.categoryId = list.filters.categoryId === c.id ? null : c.id"
        >
          {{ c.emoji ? `${c.emoji} ` : '' }}{{ c.name }}
        </ChipButton>
      </div>
    </div>

    <AppAlert v-if="list.failed.value" tone="negative" title="Gagal memuat transaksi">
      Coba lagi bentar ya.
      <template #action>
        <AppButton size="small" :leading-icon="RefreshCw" @click="list.reload()">Muat ulang</AppButton>
      </template>
    </AppAlert>

    <div v-if="list.loading.value && list.items.value.length === 0" class="day">
      <AppSkeleton text-class="text-caption-1" width="30%" />
      <AppSkeleton v-for="i in 6" :key="i" shape="rect" height="56px" />
    </div>

    <template v-else>
      <section v-for="group in groups" :key="group.date" class="day" :aria-label="group.label">
        <h2 class="text-caption-1 day__label">{{ group.label }}</h2>
        <TxRow
          v-for="tx in group.items"
          :key="tx.id"
          :tx="tx"
          editable
          @edit="openEdit"
          @delete="confirming = $event"
        />
      </section>
      <EmptyState
        v-if="!list.failed.value && list.items.value.length === 0"
        :icon="ReceiptText"
        title="Belum ada transaksi"
        description="Ga ada catatan buat filter ini. Catat lewat bot, atau tambah di sini."
        action-label="Tambah transaksi"
        @action="openCreate"
      />
      <AppButton
        v-if="list.nextCursor.value"
        variant="secondary"
        block
        :loading="list.loadingMore.value"
        @click="list.loadMore()"
      >
        Muat lebih banyak
      </AppButton>
    </template>

    <TxFormSheet v-model:open="sheetOpen" :tx="editing" :categories="categories" @saved="onSaved" />
    <ConfirmDialog
      :open="confirming !== null"
      title="Hapus transaksi?"
      :message="
        confirming
          ? `${confirming.note || confirming.category?.name || TYPE_LABEL[confirming.type]} ${formatRupiah(confirming.amount)} bakal dihapus.`
          : undefined
      "
      @update:open="(open) => !open && (confirming = null)"
      @confirm="confirmDelete"
    />
  </div>
</template>

<style scoped>
.transaksi__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-spacing-12);
}

.filters {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-spacing-8);
}

.filters__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-spacing-8);
}

.day {
  display: flex;
  flex-direction: column;
  gap: var(--space-spacing-4);
}

.day__label {
  color: var(--content-gray);
}
</style>
