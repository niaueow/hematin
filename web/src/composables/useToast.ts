import { reactive, readonly } from 'vue';
import type { Tone } from '@web/lib/tones';

// DESIGN.md §4.5a: toast.show({ tone, message, actionLabel?, onAction?, duration? }) from anywhere; one
// <ToastHost /> in the layout renders them. At most 3 at a time (the oldest goes). A toast closes after its
// duration (4 s, or 6 s with an action; 0 = until closed); hovering or focusing it pauses the timer.

export type ToastOptions = {
  tone?: Tone;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** ms; 0 = stays until closed. */
  duration?: number;
};

export type Toast = Required<Pick<ToastOptions, 'tone' | 'message' | 'duration'>> &
  Pick<ToastOptions, 'actionLabel' | 'onAction'> & { id: number };

export const MAX_TOASTS = 3;
export const DEFAULT_DURATION = 4000;
export const ACTION_DURATION = 6000;

type Timer = { remaining: number; startedAt: number; handle: ReturnType<typeof setTimeout> | null };

const state = reactive({ toasts: [] as Toast[] });
const timers = new Map<number, Timer>();
let nextId = 1;

function startTimer(id: number, ms: number) {
  if (ms <= 0) return;
  timers.set(id, { remaining: ms, startedAt: Date.now(), handle: setTimeout(() => dismiss(id), ms) });
}

export function dismiss(id: number) {
  const timer = timers.get(id);
  if (timer?.handle) clearTimeout(timer.handle);
  timers.delete(id);
  const index = state.toasts.findIndex((t) => t.id === id);
  if (index !== -1) state.toasts.splice(index, 1);
}

export function show(options: ToastOptions): number {
  const id = nextId++;
  const duration = options.duration ?? (options.actionLabel ? ACTION_DURATION : DEFAULT_DURATION);
  state.toasts.push({
    id,
    tone: options.tone ?? 'neutral',
    message: options.message,
    duration,
    actionLabel: options.actionLabel,
    onAction: options.onAction,
  });
  while (state.toasts.length > MAX_TOASTS) dismiss((state.toasts[0] as Toast).id);
  startTimer(id, duration);
  return id;
}

/** Hover / focus: stop the clock, keeping the time left. */
export function pause(id: number) {
  const timer = timers.get(id);
  if (!timer?.handle) return;
  clearTimeout(timer.handle);
  timer.remaining -= Date.now() - timer.startedAt;
  timer.handle = null;
}

/** Leave / blur: run the rest of the time. */
export function resume(id: number) {
  const timer = timers.get(id);
  if (!timer || timer.handle) return;
  timer.startedAt = Date.now();
  timer.handle = setTimeout(() => dismiss(id), Math.max(timer.remaining, 0));
}

/** The action button: run it, then close. */
export function runAction(id: number) {
  const toast = state.toasts.find((t) => t.id === id);
  toast?.onAction?.();
  dismiss(id);
}

export function clearToasts() {
  [...state.toasts].forEach((t) => dismiss(t.id));
}

export const toasts = readonly(state);

export function useToast() {
  return { show, dismiss };
}
