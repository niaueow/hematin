<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>

<template>
  <RouterView />
</template>

<style>
/* A centered column for the pages outside the shell (sign-in). */
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-spacing-12);
  max-width: 32rem;
  margin: 0 auto;
  padding: var(--space-spacing-24) var(--space-spacing-16);
}

/* A page inside AppShell. */
.shell-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-spacing-16);
  max-width: 960px;
  padding: var(--space-spacing-24) var(--space-spacing-16);
}

.shell-page__link {
  color: var(--content-brand-active);
}

@media (min-width: 1024px) {
  .shell-page {
    padding: var(--space-spacing-24);
  }
}
</style>
