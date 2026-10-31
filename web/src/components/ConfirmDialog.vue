<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import AppButton from '@web/components/AppButton.vue';
import { useTelegramBack } from '@web/composables/useTelegramBack';

// DESIGN.md §4.5e: before destructive actions. Esc, a click on the overlay, or Telegram's back button = cancel.
// Focus is trapped in the panel and starts on the cancel button (the safer default), then returns to whatever
// had it before. Centered on desktop; a bottom sheet below 1024px.

const props = withDefaults(
  defineProps<{
    open?: boolean;
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: 'danger' | 'default';
    loading?: boolean;
  }>(),
  { open: false, confirmLabel: 'Ya, hapus', cancelLabel: 'Batal', tone: 'danger', loading: false },
);

const emit = defineEmits<{ 'update:open': [open: boolean]; confirm: []; cancel: [] }>();

const id = useId();
const panel = ref<HTMLElement | null>(null);
const cancelButton = ref<InstanceType<typeof AppButton> | null>(null);
let returnFocus: HTMLElement | null = null;

const isOpen = computed(() => props.open);

function cancel() {
  if (!props.open) return;
  emit('cancel');
  emit('update:open', false);
}

useTelegramBack(isOpen, cancel);

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    cancel();
    return;
  }
  if (event.key !== 'Tab' || !panel.value) return;
  const focusable = [...panel.value.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      await nextTick();
      (cancelButton.value?.$el as HTMLElement | undefined)?.focus();
    } else {
      returnFocus?.focus();
      returnFocus = null;
    }
  },
  { immediate: true },
);
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="open" class="confirm-dialog" @click.self="cancel">
        <div
          ref="panel"
          class="confirm-dialog__panel"
          role="alertdialog"
          aria-modal="true"
          :aria-labelledby="`${id}-title`"
          :aria-describedby="message ? `${id}-message` : undefined"
          @keydown="onKeydown"
        >
          <h2 :id="`${id}-title`" class="confirm-dialog__title text-body-1-bold">{{ title }}</h2>
          <p v-if="message" :id="`${id}-message`" class="confirm-dialog__message text-body-3">{{ message }}</p>
          <div class="confirm-dialog__actions">
            <AppButton
              ref="cancelButton"
              variant="secondary"
              size="medium"
              class="confirm-dialog__cancel"
              @click="cancel"
            >
              {{ cancelLabel }}
            </AppButton>
            <AppButton
              :variant="tone === 'danger' ? 'danger' : 'primary'"
              size="medium"
              :loading="loading"
              class="confirm-dialog__confirm"
              @click="emit('confirm')"
            >
              {{ confirmLabel }}
            </AppButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm-dialog {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: var(--overlay-50);
}

/* Mobile: a bottom sheet (top corners only, clears the home bar / Telegram). */
.confirm-dialog__panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: var(--space-spacing-24);
  padding-bottom: calc(var(--space-spacing-24) + var(--app-safe-bottom));
  border-radius: var(--radius-16) var(--radius-16) 0 0;
  background: var(--background-light);
  box-shadow: var(--shadow-l4-box-shadow, none);
}

.confirm-dialog__title {
  color: var(--content-primary);
}

.confirm-dialog__message {
  margin-top: var(--space-spacing-8);
  color: var(--content-gray);
}

/* Mobile: stacked full width, confirm on top. */
.confirm-dialog__actions {
  display: flex;
  flex-direction: column-reverse;
  gap: var(--space-spacing-8);
  margin-top: var(--space-spacing-24);
}

.confirm-dialog__actions > * {
  width: 100%;
}

@media (min-width: 1024px) {
  .confirm-dialog {
    align-items: center;
  }

  .confirm-dialog__panel {
    width: min(400px, 100% - 32px);
    padding-bottom: var(--space-spacing-24);
    border-radius: var(--radius-16);
  }

  /* Desktop: a right-aligned row, cancel then confirm. */
  .confirm-dialog__actions {
    flex-direction: row;
    justify-content: flex-end;
  }

  .confirm-dialog__actions > * {
    width: auto;
  }
}

.dialog-enter-active,
.dialog-leave-active {
  transition: opacity var(--motion-enter);
}

.dialog-enter-active .confirm-dialog__panel,
.dialog-leave-active .confirm-dialog__panel {
  transition: transform var(--motion-enter);
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-from .confirm-dialog__panel,
.dialog-leave-to .confirm-dialog__panel {
  transform: translateY(16px);
}
</style>
