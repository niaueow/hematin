<script setup lang="ts">
import { X } from '@lucide/vue';
import { computed, type Component } from 'vue';
import { TONE_ICON, type Tone } from '@web/lib/tones';

// DESIGN.md §4.5b: an inline message inside a page. leadingIcon defaults to the tone's icon; null hides it.

const props = withDefaults(
  defineProps<{ tone?: Tone; title?: string; leadingIcon?: Component | null; dismissible?: boolean }>(),
  { tone: 'info', leadingIcon: undefined, dismissible: false },
);
defineEmits<{ close: [] }>();

const icon = computed(() => (props.leadingIcon === undefined ? TONE_ICON[props.tone] : props.leadingIcon));
</script>

<template>
  <div class="app-alert" :class="`app-alert--${tone}`">
    <component :is="icon" v-if="icon" :size="20" class="app-alert__icon" aria-hidden="true" />
    <div class="app-alert__body">
      <p v-if="title" class="app-alert__title text-body-3-bold">{{ title }}</p>
      <div class="app-alert__message text-caption-1"><slot /></div>
      <div v-if="$slots.action" class="app-alert__action"><slot name="action" /></div>
    </div>
    <button v-if="dismissible" type="button" class="app-alert__close" aria-label="Tutup" @click="$emit('close')">
      <X :size="16" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.app-alert {
  display: flex;
  align-items: flex-start;
  gap: var(--space-spacing-8);
  width: 100%;
  padding: var(--space-spacing-12) var(--space-spacing-16);
  border: 1px solid;
  border-radius: var(--radius-16);
}

.app-alert--positive {
  background: var(--background-system-subtle-positive);
  border-color: var(--stroke-system-positive);
}

.app-alert--warning {
  background: var(--background-system-subtle-warning);
  border-color: var(--stroke-system-warning);
}

.app-alert--negative {
  background: var(--background-system-subtle-negative);
  border-color: var(--stroke-system-negative);
}

.app-alert--info {
  background: var(--background-system-subtle-info);
  border-color: var(--stroke-system-info);
}

.app-alert--neutral {
  background: var(--background-hover);
  border-color: var(--stroke-secondary);
}

.app-alert__icon {
  flex: none;
}

.app-alert--positive .app-alert__icon {
  color: var(--content-system-default-positive);
}

.app-alert--warning .app-alert__icon {
  color: var(--content-system-default-warning);
}

.app-alert--negative .app-alert__icon {
  color: var(--content-system-default-negative);
}

.app-alert--info .app-alert__icon {
  color: var(--content-system-default-info);
}

.app-alert--neutral .app-alert__icon {
  color: var(--content-gray);
}

.app-alert__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-spacing-4);
  min-width: 0;
}

.app-alert__title,
.app-alert__message {
  color: var(--content-primary);
}

.app-alert__action {
  margin-top: var(--space-spacing-4);
}

.app-alert__close {
  display: inline-flex;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: var(--radius-8);
  background: none;
  color: var(--content-gray);
  cursor: pointer;
}
</style>
