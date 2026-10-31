<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>

<template>
  <RouterView />
</template>

<style>
/* A simple centered column for the sign-in pages until the dashboard layout exists. */
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-spacing-12);
  max-width: 32rem;
  margin: 0 auto;
  padding: var(--space-spacing-24) var(--space-spacing-16);
}
</style>
