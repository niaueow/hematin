import { onBeforeUnmount, watch, type Ref } from 'vue';
import { pushTelegramBack } from '@web/telegram';

/** While `active` is true, Telegram's back button calls `handler` (a no-op outside Telegram). */
export function useTelegramBack(active: Ref<boolean>, handler: () => void) {
  let release: (() => void) | null = null;
  const stop = () => {
    release?.();
    release = null;
  };
  watch(
    active,
    (on) => {
      if (on && !release) release = pushTelegramBack(handler);
      if (!on) stop();
    },
    { immediate: true },
  );
  onBeforeUnmount(stop);
}
