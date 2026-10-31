import { nextTick, watch, type Ref } from 'vue';
import { useTelegramBack } from '@web/composables/useTelegramBack';

// Shared behaviour of ConfirmDialog and AppSheet (DESIGN.md §4.5e): while open, Esc and Telegram's back button
// cancel, Tab / Shift+Tab stay inside the panel, focus starts on `initialFocus` (else the first focusable), and
// goes back to whatever had it when the modal closes.

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModal(options: {
  open: Ref<boolean>;
  panel: Ref<HTMLElement | null>;
  onCancel: () => void;
  initialFocus?: () => HTMLElement | null | undefined;
}) {
  let returnFocus: HTMLElement | null = null;
  const focusables = () => [...(options.panel.value?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];

  useTelegramBack(options.open, options.onCancel);

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      options.onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const all = focusables();
    const first = all[0];
    const last = all.at(-1);
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
    options.open,
    async (open) => {
      if (open) {
        returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        await nextTick();
        (options.initialFocus?.() ?? focusables()[0])?.focus();
      } else {
        returnFocus?.focus();
        returnFocus = null;
      }
    },
    { immediate: true },
  );

  return { onKeydown };
}
