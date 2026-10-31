<script setup lang="ts">
import { computed, ref, watch } from 'vue';

// DESIGN.md §4.4a profile area: the Telegram photo, or initials when there's none (or it fails to load).

const props = withDefaults(defineProps<{ name: string; src?: string | null; online?: boolean; size?: number }>(), {
  src: null,
  online: undefined,
  size: 48,
});

const failed = ref(false);
watch(
  () => props.src,
  () => (failed.value = false),
);

/** "Nia Putri" → "NP", "nia" → "N". */
const initials = computed(
  () =>
    props.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => [...part][0]?.toUpperCase() ?? '')
      .join('') || '?',
);
</script>

<template>
  <span class="user-avatar" :style="{ width: `${size}px`, height: `${size}px` }">
    <img v-if="src && !failed" :src="src" alt="" class="user-avatar__img" @error="failed = true" />
    <span v-else class="user-avatar__initials text-body-2-bold" aria-hidden="true">{{ initials }}</span>
    <span v-if="online" class="user-avatar__online" aria-label="online" />
  </span>
</template>

<style scoped>
.user-avatar {
  position: relative;
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  background: var(--background-brand-subtle);
  color: var(--content-brand-active);
}

.user-avatar__img {
  width: 100%;
  height: 100%;
  border-radius: var(--radius-full);
  object-fit: cover;
}

.user-avatar__online {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--background-system-default-positive);
}
</style>
