<script setup lang="ts">
// DESIGN.md §4.5d: a placeholder while data loads (never show Rp0 while loading). For `text`, the height is the
// line height of `textClass`, so it lines up with the real text.

withDefaults(
  defineProps<{ shape?: 'text' | 'rect' | 'circle'; textClass?: string; width?: string; height?: string }>(),
  { shape: 'text', textClass: 'text-body-3', width: '100%' },
);
</script>

<template>
  <span
    class="app-skeleton"
    :class="[`app-skeleton--${shape}`, shape === 'text' ? textClass : undefined]"
    :style="{ width, height }"
    aria-hidden="true"
    >&#8203;</span
  >
</template>

<style scoped>
.app-skeleton {
  display: block;
  border-radius: var(--radius-8);
  color: transparent;
  background: linear-gradient(
    90deg,
    var(--background-hover) 0%,
    var(--background-disabled) 50%,
    var(--background-hover) 100%
  );
  background-size: 200% 100%;
  animation: app-skeleton-shimmer 1.2s ease-in-out infinite;
  user-select: none;
}

.app-skeleton--circle {
  border-radius: var(--radius-full);
  aspect-ratio: 1;
}

@keyframes app-skeleton-shimmer {
  0% {
    background-position: 100% 0;
  }

  100% {
    background-position: -100% 0;
  }
}
</style>
