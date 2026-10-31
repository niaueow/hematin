<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>

<template>
  <RouterView />
</template>

<style>
/* Minimal until the DESIGN.md styles land. Inside Telegram, follow its theme colours. */
:root {
  color-scheme: light dark;
  font-family: system-ui, sans-serif;
  background: var(--tg-theme-bg-color, Canvas);
  color: var(--tg-theme-text-color, CanvasText);
}

body {
  margin: 0;
}

.page {
  max-width: 32rem;
  margin: 3rem auto;
  padding: 0 1rem;
  line-height: 1.5;
}

button {
  font: inherit;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid currentColor;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
</style>
