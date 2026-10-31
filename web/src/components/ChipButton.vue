<script setup lang="ts">
import type { Component } from 'vue';

// 🆕 A chip you can press (filters, category picks). The AppChip look (radius 24, padding 2/8, caption-2), as a
// toggle button: unpressed = neutral tone, pressed = info (brand) tone + a border so the state isn't colour-only.

withDefaults(defineProps<{ pressed?: boolean; leadingIcon?: Component }>(), { pressed: false });
defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <button
    type="button"
    class="chip-button text-caption-2"
    :class="{ 'is-pressed': pressed }"
    :aria-pressed="pressed"
    @click="$emit('click', $event)"
  >
    <component :is="leadingIcon" v-if="leadingIcon" :size="16" aria-hidden="true" />
    <span><slot /></span>
  </button>
</template>

<style scoped>
.chip-button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-spacing-4);
  padding: calc(var(--space-spacing-2) - 1px) calc(var(--space-spacing-8) - 1px);
  border: 1px solid transparent;
  border-radius: var(--radius-24);
  background: var(--background-hover);
  color: var(--content-gray);
  cursor: pointer;
  white-space: nowrap;
  transition:
    background-color var(--motion-color),
    color var(--motion-color),
    border-color var(--motion-color);
}

.chip-button.is-pressed {
  border-color: var(--stroke-system-info);
  background: var(--background-system-subtle-info);
  color: var(--content-system-default-info);
}
</style>
