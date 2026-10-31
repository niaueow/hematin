<script setup lang="ts">
import { computed } from 'vue';
import { formatRupiah } from '@web/lib/format';
import type { Tone } from '@web/lib/tones';

// 🆕 Spent vs allocation (or saved vs target) as a bar. The bar takes the bucket's tone (DESIGN §4.3); over 100%
// it turns negative. Exposed as a meter to assistive tech, with the real amounts as text.

const props = withDefaults(
  defineProps<{ label: string; value: number; max: number; tone: Tone; valueLabel?: string }>(),
  { valueLabel: undefined },
);

const pct = computed(() => (props.max > 0 ? Math.floor((Math.max(props.value, 0) * 100) / props.max) : 0));
const over = computed(() => props.max > 0 && props.value > props.max);
const text = computed(() => props.valueLabel ?? `${formatRupiah(props.value)} / ${formatRupiah(props.max)}`);
</script>

<template>
  <div class="budget-meter">
    <div class="budget-meter__row">
      <span class="text-caption-1 budget-meter__label">{{ label }}</span>
      <span class="text-caption-1 tabular-nums budget-meter__value">{{ text }}</span>
    </div>
    <div
      class="budget-meter__track"
      role="meter"
      :aria-label="label"
      aria-valuemin="0"
      :aria-valuemax="max"
      :aria-valuenow="Math.max(Math.min(value, max), 0)"
      :aria-valuetext="text"
    >
      <div
        class="budget-meter__fill"
        :class="over ? 'budget-meter__fill--negative' : `budget-meter__fill--${tone}`"
        :style="{ width: `${Math.min(pct, 100)}%` }"
      />
    </div>
  </div>
</template>

<style scoped>
.budget-meter {
  display: flex;
  flex-direction: column;
  gap: var(--space-spacing-4);
}

.budget-meter__row {
  display: flex;
  justify-content: space-between;
  gap: var(--space-spacing-8);
}

.budget-meter__label {
  color: var(--content-gray);
}

.budget-meter__value {
  color: var(--content-primary);
}

.budget-meter__track {
  height: 8px;
  overflow: hidden;
  border-radius: var(--radius-full);
  background: var(--background-hover);
}

.budget-meter__fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width var(--motion-enter);
}

.budget-meter__fill--positive {
  background: var(--background-system-default-positive);
}

.budget-meter__fill--warning {
  background: var(--background-system-default-warning);
}

.budget-meter__fill--negative {
  background: var(--background-system-default-negative);
}

.budget-meter__fill--info {
  background: var(--background-system-default-info);
}

.budget-meter__fill--neutral {
  background: var(--content-gray);
}
</style>
