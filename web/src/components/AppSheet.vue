<script setup lang="ts">
import { X } from '@lucide/vue';
import { computed, ref, useId } from 'vue';
import { useModal } from '@web/composables/useModal';

// 🆕 A form in a modal (DESIGN.md §4.5e's look and behaviour, for content instead of a question): a bottom
// sheet below 1024px, centered from 1024px. Esc, the overlay, the close button or Telegram's back button = cancel;
// focus is trapped and starts on the first field. Slots: default (the form), footer (the buttons).

const props = withDefaults(defineProps<{ open?: boolean; title: string }>(), { open: false });
const emit = defineEmits<{ 'update:open': [open: boolean]; cancel: [] }>();

const id = useId();
const panel = ref<HTMLElement | null>(null);

function cancel() {
  if (!props.open) return;
  emit('cancel');
  emit('update:open', false);
}

const { onKeydown } = useModal({
  open: computed(() => props.open),
  panel,
  onCancel: cancel,
  initialFocus: () => panel.value?.querySelector<HTMLElement>('.app-sheet__body input, .app-sheet__body button'),
});
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="open" class="app-sheet" @click.self="cancel">
        <div
          ref="panel"
          class="app-sheet__panel"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="`${id}-title`"
          @keydown="onKeydown"
        >
          <header class="app-sheet__header">
            <h2 :id="`${id}-title`" class="text-body-1-bold app-sheet__title">{{ title }}</h2>
            <button type="button" class="app-sheet__close" aria-label="Tutup" @click="cancel">
              <X :size="20" aria-hidden="true" />
            </button>
          </header>
          <div class="app-sheet__body"><slot /></div>
          <footer v-if="$slots.footer" class="app-sheet__footer"><slot name="footer" /></footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.app-sheet {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: var(--overlay-50);
}

.app-sheet__panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-spacing-16);
  width: 100%;
  max-height: 90vh;
  padding: var(--space-spacing-24);
  padding-bottom: calc(var(--space-spacing-24) + var(--app-safe-bottom));
  overflow-y: auto;
  border-radius: var(--radius-16) var(--radius-16) 0 0;
  background: var(--background-light);
  box-shadow: var(--shadow-l4-box-shadow, none);
}

.app-sheet__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-spacing-12);
}

.app-sheet__title {
  color: var(--content-primary);
}

.app-sheet__close {
  display: inline-flex;
  padding: 0;
  border: 0;
  border-radius: var(--radius-8);
  background: none;
  color: var(--content-gray);
  cursor: pointer;
}

.app-sheet__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-spacing-16);
}

/* Mobile: stacked full-width buttons, the main one on top (like ConfirmDialog). */
.app-sheet__footer {
  display: flex;
  flex-direction: column-reverse;
  gap: var(--space-spacing-8);
}

.app-sheet__footer > :deep(*) {
  width: 100%;
}

@media (min-width: 1024px) {
  .app-sheet {
    align-items: center;
  }

  .app-sheet__panel {
    width: min(480px, 100% - 32px);
    padding-bottom: var(--space-spacing-24);
    border-radius: var(--radius-16);
  }

  .app-sheet__footer {
    flex-direction: row;
    justify-content: flex-end;
  }

  .app-sheet__footer > :deep(*) {
    width: auto;
  }
}

.sheet-enter-active,
.sheet-leave-active {
  transition: opacity var(--motion-enter);
}

.sheet-enter-active .app-sheet__panel,
.sheet-leave-active .app-sheet__panel {
  transition: transform var(--motion-enter);
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

.sheet-enter-from .app-sheet__panel,
.sheet-leave-to .app-sheet__panel {
  transform: translateY(16px);
}
</style>
