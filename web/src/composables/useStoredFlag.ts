import { ref, watch } from 'vue';

// A boolean remembered in localStorage for this browser (e.g. the sidebar's collapsed state). Storage can be
// unavailable (private mode, blocked site data): then it just isn't remembered.

export function readFlag(key: string, fallback = false): boolean {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === '1';
  } catch {
    return fallback;
  }
}

export function useStoredFlag(key: string, fallback = false) {
  const flag = ref(readFlag(key, fallback));
  watch(flag, (value) => {
    try {
      window.localStorage.setItem(key, value ? '1' : '0');
    } catch {
      // not remembered
    }
  });
  return flag;
}
