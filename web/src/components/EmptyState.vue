<script setup lang="ts">
import { Inbox } from '@lucide/vue';
import type { Component } from 'vue';
import AppButton from '@web/components/AppButton.vue';

// DESIGN.md §4.5c: when a list or chart has no data.

withDefaults(defineProps<{ icon?: Component; title: string; description?: string; actionLabel?: string }>(), {
  icon: () => Inbox,
});
defineEmits<{ action: [] }>();
</script>

<template>
  <div class="empty-state">
    <span class="empty-state__icon"><component :is="icon" :size="32" aria-hidden="true" /></span>
    <div class="empty-state__text">
      <p class="empty-state__title text-body-2-bold">{{ title }}</p>
      <p v-if="description" class="empty-state__description text-caption-1">{{ description }}</p>
    </div>
    <AppButton v-if="actionLabel" size="medium" @click="$emit('action')">{{ actionLabel }}</AppButton>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-spacing-16);
  padding: var(--space-spacing-24);
  text-align: center;
}

.empty-state__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-full);
  background: var(--background-brand-subtle);
  color: var(--content-brand-active);
}

.empty-state__text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-spacing-4);
}

.empty-state__title {
  color: var(--content-primary);
}

.empty-state__description {
  max-width: 280px;
  color: var(--content-gray);
}
</style>
