<script setup lang="ts">
import { X } from '@lucide/vue';
import { TONE_ICON, type Tone } from '@web/lib/tones';

// DESIGN.md §4.5a: one toast. Presentational; timing and stacking are ToastHost + useToast.

withDefaults(defineProps<{ tone?: Tone; message: string; actionLabel?: string }>(), { tone: 'neutral' });
defineEmits<{ action: []; close: [] }>();
</script>

<template>
  <div class="app-toast" :class="`app-toast--${tone}`" :role="tone === 'negative' ? 'alert' : undefined">
    <component :is="TONE_ICON[tone]" :size="20" class="app-toast__icon" aria-hidden="true" />
    <p class="app-toast__message text-body-3">{{ message }}</p>
    <button v-if="actionLabel" type="button" class="app-toast__action text-body-3-bold" @click="$emit('action')">
      {{ actionLabel }}
    </button>
    <button type="button" class="app-toast__close" aria-label="Tutup" @click="$emit('close')">
      <X :size="16" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.app-toast {
  display: flex;
  align-items: center;
  gap: var(--space-spacing-12);
  width: 100%;
  max-width: 400px;
  padding: var(--space-spacing-12) var(--space-spacing-16);
  border: 1px solid var(--stroke-primary);
  border-radius: var(--radius-16);
  background: var(--background-light);
  box-shadow: var(--shadow-l3-box-shadow, none);
}

.app-toast__icon {
  flex: none;
}

.app-toast--positive .app-toast__icon {
  color: var(--content-system-default-positive);
}

.app-toast--warning .app-toast__icon {
  color: var(--content-system-default-warning);
}

.app-toast--negative .app-toast__icon {
  color: var(--content-system-default-negative);
}

.app-toast--info .app-toast__icon {
  color: var(--content-system-default-info);
}

.app-toast--neutral .app-toast__icon {
  color: var(--content-gray);
}

.app-toast__message {
  flex: 1;
  min-width: 0;
  color: var(--content-primary);
}

.app-toast__action,
.app-toast__close {
  flex: none;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  border-radius: var(--radius-8);
}

.app-toast__action {
  color: var(--content-brand-active);
  transition: color var(--motion-color);
}

@media (hover: hover) {
  .app-toast__action:hover {
    color: var(--content-brand-hover);
  }
}

.app-toast__close {
  display: inline-flex;
  color: var(--content-gray);
}
</style>
