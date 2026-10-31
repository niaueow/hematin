<script setup lang="ts">
import { Calendar } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { ApiError } from '@web/api/client';
import { createTransaction, updateTransaction, type Category, type Transaction, type TxType } from '@web/api/dashboard';
import AmountInput from '@web/components/AmountInput.vue';
import AppAlert from '@web/components/AppAlert.vue';
import AppButton from '@web/components/AppButton.vue';
import AppInput from '@web/components/AppInput.vue';
import AppSheet from '@web/components/AppSheet.vue';
import ChipButton from '@web/components/ChipButton.vue';
import SegmentedControl from '@web/components/SegmentedControl.vue';
import { today } from '@web/lib/format';
import { categoriesForType, TYPE_LABEL } from '@web/lib/transactions';

// Create or edit a transaction (PRD D3) in an AppSheet. The category choices follow the type (DATA_MODEL
// invariants: expense → pokok/jajan, saving → nabung, income → none or an income category). The obvious mistakes
// are caught here; the API checks everything again.

const props = withDefaults(
  defineProps<{ open?: boolean; tx?: Transaction | null; categories: readonly Category[] }>(),
  { open: false, tx: null },
);
const emit = defineEmits<{ 'update:open': [open: boolean]; saved: [tx: Transaction] }>();

const MAX_AMOUNT = 100_000_000;
const TYPES = (['EXPENSE', 'INCOME', 'SAVING'] as const).map((value) => ({ value, label: TYPE_LABEL[value] }));

const type = ref<TxType>('EXPENSE');
const amount = ref<number | null>(null);
const categoryId = ref<string | null>(null);
const date = ref<string>(today());
const note = ref('');
const errors = ref<{ amount?: string; category?: string; form?: string }>({});
const saving = ref(false);

const choices = computed(() => categoriesForType(props.categories, type.value));
const editing = computed(() => props.tx !== null);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    const tx = props.tx;
    type.value = tx?.type ?? 'EXPENSE';
    amount.value = tx?.amount ?? null;
    categoryId.value = tx?.categoryId ?? null;
    date.value = tx?.date ?? today();
    note.value = tx?.note ?? '';
    errors.value = {};
  },
  { immediate: true },
);

// A category that doesn't fit the new type is dropped.
watch(type, () => {
  if (categoryId.value && !choices.value.some((c) => c.id === categoryId.value)) categoryId.value = null;
});

function check(): boolean {
  const next: typeof errors.value = {};
  if (amount.value === null || amount.value <= 0) next.amount = 'Isi nominalnya dulu.';
  else if (amount.value > MAX_AMOUNT) next.amount = 'Maksimal Rp100.000.000.';
  if (type.value !== 'INCOME' && !categoryId.value) next.category = 'Pilih kategorinya.';
  errors.value = next;
  return Object.keys(next).length === 0;
}

async function submit() {
  if (!check() || amount.value === null) return;
  saving.value = true;
  const body = {
    type: type.value,
    amount: amount.value,
    categoryId: categoryId.value,
    note: note.value.trim() || null,
    date: date.value,
  };
  try {
    const saved = props.tx
      ? await updateTransaction(props.tx.id, body)
      : await createTransaction({ ...body, ...(body.categoryId === null && { categoryId: undefined }) });
    emit('saved', saved);
    emit('update:open', false);
  } catch (err) {
    const code = err instanceof ApiError ? err.code : '';
    if (code === 'CATEGORY_REQUIRED' || code === 'INVALID_CATEGORY')
      errors.value = { category: 'Kategori ini ga bisa dipakai. Pilih yang lain.' };
    else errors.value = { form: 'Gagal menyimpan. Cek isiannya, lalu coba lagi.' };
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppSheet
    :open="open"
    :title="editing ? 'Ubah transaksi' : 'Tambah transaksi'"
    @update:open="emit('update:open', $event)"
  >
    <form id="tx-form" class="tx-form" novalidate @submit.prevent="submit">
      <SegmentedControl v-model="type" :options="TYPES" label="Jenis transaksi" />
      <AmountInput v-model="amount" label="Nominal" required :error="errors.amount" />
      <fieldset class="tx-form__categories">
        <legend class="text-body-3-bold tx-form__legend">
          Kategori<span v-if="type !== 'INCOME'" class="tx-form__required" aria-hidden="true">*</span>
        </legend>
        <div class="tx-form__chips">
          <ChipButton v-if="type === 'INCOME'" :pressed="categoryId === null" @click="categoryId = null">
            Tanpa kategori
          </ChipButton>
          <ChipButton v-for="c in choices" :key="c.id" :pressed="categoryId === c.id" @click="categoryId = c.id">
            {{ c.emoji ? `${c.emoji} ` : '' }}{{ c.name }}
          </ChipButton>
        </div>
        <p v-if="errors.category" class="text-caption-3 tx-form__error" role="alert">{{ errors.category }}</p>
      </fieldset>
      <AppInput v-model="date" label="Tanggal" type="date" required :leading-icon="Calendar" />
      <AppInput v-model="note" label="Catatan" placeholder="cireng, gojek…" maxlength="120" />
      <AppAlert v-if="errors.form" tone="negative">{{ errors.form }}</AppAlert>
    </form>
    <template #footer>
      <AppButton variant="secondary" @click="emit('update:open', false)">Batal</AppButton>
      <AppButton type="submit" form="tx-form" :loading="saving">Simpan</AppButton>
    </template>
  </AppSheet>
</template>

<style scoped>
.tx-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-spacing-16);
}

.tx-form__categories {
  display: flex;
  flex-direction: column;
  gap: var(--space-spacing-8);
  margin: 0;
  padding: 0;
  border: 0;
}

.tx-form__legend {
  padding: 0;
  color: var(--content-primary);
}

.tx-form__required {
  margin-left: var(--space-spacing-4);
  color: var(--content-system-default-negative);
}

.tx-form__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-spacing-8);
}

.tx-form__error {
  color: var(--content-system-default-negative);
}
</style>
