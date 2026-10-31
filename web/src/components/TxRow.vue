<script setup lang="ts">
import { Trash2 } from '@lucide/vue';
import { computed } from 'vue';
import type { Transaction } from '@web/api/dashboard';
import AppChip from '@web/components/AppChip.vue';
import { formatRupiah } from '@web/lib/format';
import { BUCKET_TONE } from '@web/lib/tones';
import { isIncoming, TYPE_LABEL } from '@web/lib/transactions';

// 🆕 One transaction in a list: the note (or category), the category as a chip in its bucket's tone, the amount.
// With `editable`, the row opens the edit sheet and has a delete button.

const props = withDefaults(defineProps<{ tx: Transaction; editable?: boolean }>(), { editable: false });
const emit = defineEmits<{ edit: [tx: Transaction]; delete: [tx: Transaction] }>();

const title = computed(() => props.tx.note || props.tx.category?.name || TYPE_LABEL[props.tx.type]);
const tone = computed(() => (props.tx.category ? BUCKET_TONE[props.tx.category.bucket] : 'neutral'));
const chipLabel = computed(() => props.tx.category?.name ?? TYPE_LABEL[props.tx.type]);
const amount = computed(() => `${isIncoming(props.tx) ? '+' : ''}${formatRupiah(props.tx.amount)}`);
</script>

<template>
  <div class="tx-row">
    <component
      :is="editable ? 'button' : 'div'"
      :type="editable ? 'button' : undefined"
      class="tx-row__main"
      :aria-label="editable ? `Ubah ${title} ${amount}` : undefined"
      @click="editable && emit('edit', tx)"
    >
      <span class="tx-row__text">
        <span class="text-body-3 tx-row__title">{{ title }}</span>
        <AppChip :tone="tone">{{ chipLabel }}</AppChip>
      </span>
      <span class="text-body-3-bold tabular-nums tx-row__amount" :class="{ 'is-incoming': isIncoming(tx) }">
        {{ amount }}
      </span>
    </component>
    <button
      v-if="editable"
      type="button"
      class="tx-row__delete"
      :aria-label="`Hapus ${title} ${amount}`"
      @click="emit('delete', tx)"
    >
      <Trash2 :size="20" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.tx-row {
  display: flex;
  align-items: center;
  gap: var(--space-spacing-8);
}

.tx-row__main {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-spacing-12);
  min-width: 0;
  padding: var(--space-spacing-12) var(--space-spacing-8);
  border: 0;
  border-radius: var(--radius-12);
  background: none;
  color: inherit;
  text-align: left;
}

button.tx-row__main {
  cursor: pointer;
}

@media (hover: hover) {
  button.tx-row__main:hover {
    background: var(--background-hover);
  }
}

.tx-row__text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-spacing-4);
  min-width: 0;
}

.tx-row__title {
  max-width: 100%;
  overflow: hidden;
  color: var(--content-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-row__amount {
  flex: none;
  color: var(--content-primary);
}

.tx-row__amount.is-incoming {
  color: var(--content-system-default-positive);
}

.tx-row__delete {
  display: inline-flex;
  flex: none;
  padding: var(--space-spacing-8);
  border: 0;
  border-radius: var(--radius-8);
  background: none;
  color: var(--content-gray);
  cursor: pointer;
}

@media (hover: hover) {
  .tx-row__delete:hover {
    color: var(--content-system-default-negative);
  }
}
</style>
