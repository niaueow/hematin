<script setup lang="ts">
import { LoaderCircle } from '@lucide/vue';
import { computed, type Component } from 'vue';

// DESIGN.md §4.1. Figma's `Style` property is `variant` here (`style` is reserved in Vue). Hover and pressed come
// from CSS; only disabled and loading are props (§3 rule 4). While loading, the spinner replaces the leading icon,
// the button keeps its width and colours, and clicks are ignored.

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'danger';
    size?: 'large' | 'medium' | 'small';
    leadingIcon?: Component;
    trailingIcon?: Component;
    disabled?: boolean;
    loading?: boolean;
    block?: boolean;
    type?: 'button' | 'submit';
  }>(),
  { variant: 'primary', size: 'medium', disabled: false, loading: false, block: false, type: 'button' },
);

const emit = defineEmits<{ click: [event: MouseEvent] }>();

const TEXT = { large: 'text-body-1', medium: 'text-body-2', small: 'text-caption-1' } as const;
const ICON = { large: 20, medium: 20, small: 16 } as const;
const iconSize = computed(() => ICON[props.size]);

function onClick(event: MouseEvent) {
  if (props.disabled || props.loading) return;
  emit('click', event);
}
</script>

<template>
  <button
    :type="type"
    class="app-button"
    :class="[`app-button--${variant}`, `app-button--${size}`, { 'app-button--block': block, 'is-loading': loading }]"
    :disabled="disabled"
    :aria-busy="loading || undefined"
    :aria-disabled="loading || undefined"
    @click="onClick"
  >
    <LoaderCircle v-if="loading" class="app-button__spinner" :size="iconSize" aria-hidden="true" />
    <component :is="leadingIcon" v-else-if="leadingIcon" :size="iconSize" aria-hidden="true" />
    <span :class="TEXT[size]"><slot /></span>
    <component :is="trailingIcon" v-if="trailingIcon" :size="iconSize" aria-hidden="true" />
  </button>
</template>

<style scoped>
.app-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-spacing-8);
  border: 1px solid transparent;
  border-radius: var(--radius-16);
  cursor: pointer;
  white-space: nowrap;
  transition:
    background-color var(--motion-color),
    border-color var(--motion-color),
    color var(--motion-color);
}

.app-button--block {
  display: flex;
  width: 100%;
}

/* Sizes (fixed heights from DESIGN §4.1; the 1px border is inside them) */
.app-button--large {
  height: 53px;
  padding: calc(var(--space-spacing-14) - 1px) calc(var(--space-spacing-16) - 1px);
}

.app-button--medium {
  height: 44px;
  padding: calc(var(--space-spacing-12) - 1px) calc(var(--space-spacing-14) - 1px);
}

.app-button--small {
  height: 34px;
  padding: calc(var(--space-spacing-8) - 1px) calc(var(--space-spacing-12) - 1px);
}

/* Variants. [data-force-state] is only for the /playground page, to show hover/pressed side by side. */
.app-button--primary {
  background: var(--background-brand-active);
  color: var(--content-primary-inverse);
}

.app-button--secondary {
  background: var(--background-light);
  border-color: var(--stroke-secondary);
  color: var(--content-primary);
}

.app-button--danger {
  background: var(--background-system-default-negative);
  color: var(--content-primary-inverse);
}

@media (hover: hover) {
  .app-button--primary:not(:disabled, .is-loading):hover {
    background: var(--background-brand-hover);
  }

  .app-button--secondary:not(:disabled, .is-loading):hover {
    background: var(--background-hover);
  }

  .app-button--danger:not(:disabled, .is-loading):hover {
    background: var(--background-system-hover-negative);
  }
}

.app-button--primary[data-force-state='hover'] {
  background: var(--background-brand-hover);
}

.app-button--secondary[data-force-state='hover'] {
  background: var(--background-hover);
}

.app-button--danger[data-force-state='hover'] {
  background: var(--background-system-hover-negative);
}

.app-button--primary:not(:disabled, .is-loading):active,
.app-button--primary[data-force-state='pressed'] {
  background: var(--background-brand-clicked);
}

.app-button--secondary:not(:disabled, .is-loading):active,
.app-button--secondary[data-force-state='pressed'] {
  background: var(--background-disabled);
}

.app-button--danger:not(:disabled, .is-loading):active,
.app-button--danger[data-force-state='pressed'] {
  background: var(--background-system-hover-negative);
}

.app-button[data-force-state='focus'] {
  outline: 2px solid var(--stroke-focus);
  outline-offset: 2px;
}

/* Disabled: same for every variant, no border */
.app-button:disabled {
  background: var(--background-disabled);
  border-color: transparent;
  color: var(--content-disable);
  cursor: not-allowed;
}

.app-button.is-loading {
  cursor: progress;
}

.app-button__spinner {
  animation: app-button-spin 0.8s linear infinite;
}

@keyframes app-button-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
