<script setup lang="ts">
import type { Component } from 'vue';
import type { Tone } from '@web/lib/tones';

// DESIGN.md §4.3. A tone picks one background + one text colour from the tone table; never a free colour.
// Bucket → tone: Pokok = info, Jajan = warning, Nabung = positive, Pemasukan = neutral (BUCKET_TONE).

withDefaults(defineProps<{ tone?: Tone; leadingIcon?: Component; trailingIcon?: Component }>(), {
  tone: 'neutral',
});
</script>

<template>
  <span class="app-chip text-caption-2" :class="`app-chip--${tone}`">
    <component :is="leadingIcon" v-if="leadingIcon" :size="16" aria-hidden="true" />
    <span><slot /></span>
    <component :is="trailingIcon" v-if="trailingIcon" :size="16" aria-hidden="true" />
  </span>
</template>

<style scoped>
.app-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-spacing-4);
  padding: var(--space-spacing-2) var(--space-spacing-8);
  border-radius: var(--radius-24);
  white-space: nowrap;
}

.app-chip--positive {
  background: var(--background-system-subtle-positive);
  color: var(--content-system-default-positive);
}

.app-chip--warning {
  background: var(--background-system-subtle-warning);
  color: var(--content-system-default-warning);
}

.app-chip--negative {
  background: var(--background-system-subtle-negative);
  color: var(--content-system-default-negative);
}

.app-chip--info {
  background: var(--background-system-subtle-info);
  color: var(--content-system-default-info);
}

.app-chip--neutral {
  background: var(--background-hover);
  color: var(--content-gray);
}
</style>
