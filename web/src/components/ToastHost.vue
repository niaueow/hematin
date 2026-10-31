<script setup lang="ts">
import AppToast from '@web/components/AppToast.vue';
import { dismiss, pause, resume, runAction, toasts } from '@web/composables/useToast';

// DESIGN.md §4.5a: mounted once in the layout. Mobile: bottom centre, 16px above the bottom navbar. Desktop:
// bottom right, 24px from the edges. Newest at the bottom, stacking upward. Hover or focus pauses a toast's timer.
</script>

<template>
  <div class="toast-host" role="status" aria-live="polite">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts.toasts"
        :key="toast.id"
        class="toast-host__item"
        @mouseenter="pause(toast.id)"
        @mouseleave="resume(toast.id)"
        @focusin="pause(toast.id)"
        @focusout="resume(toast.id)"
      >
        <AppToast
          :tone="toast.tone"
          :message="toast.message"
          :action-label="toast.actionLabel"
          @action="runAction(toast.id)"
          @close="dismiss(toast.id)"
        />
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  z-index: 50;
  left: var(--space-spacing-16);
  right: var(--space-spacing-16);
  bottom: calc(var(--app-bottom-nav-height) + var(--app-safe-bottom) + var(--space-spacing-16));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-spacing-8);
  pointer-events: none;
}

.toast-host__item {
  display: flex;
  justify-content: center;
  width: 100%;
  pointer-events: auto;
}

@media (min-width: 1024px) {
  .toast-host {
    left: auto;
    right: var(--space-spacing-24);
    bottom: var(--space-spacing-24);
    align-items: flex-end;
    width: 400px;
  }

  .toast-host__item {
    justify-content: flex-end;
  }
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity var(--motion-enter),
    transform var(--motion-enter);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
