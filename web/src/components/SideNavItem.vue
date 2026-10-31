<script setup lang="ts">
import type { Component } from 'vue';
import { RouterLink } from 'vue-router';

// DESIGN.md §4.4a. `active` is computed by SideNav from the route. Collapsed: icon only, the label as a tooltip.

defineProps<{ icon: Component; label: string; to: string; active: boolean; collapsed: boolean }>();
</script>

<template>
  <RouterLink
    :to="to"
    class="side-nav-item text-caption-1"
    :class="{ 'is-active': active, 'is-collapsed': collapsed }"
    :aria-current="active ? 'page' : undefined"
    :title="collapsed ? label : undefined"
    :aria-label="collapsed ? label : undefined"
  >
    <component :is="icon" :size="20" aria-hidden="true" />
    <span v-if="!collapsed">{{ label }}</span>
  </RouterLink>
</template>

<style scoped>
.side-nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-spacing-8);
  height: 36px;
  padding: var(--space-spacing-8);
  border-radius: var(--radius-8);
  background: var(--background-light);
  color: var(--content-primary);
  text-decoration: none;
  white-space: nowrap;
  transition:
    background-color var(--motion-color),
    color var(--motion-color);
}

.side-nav-item.is-collapsed {
  justify-content: center;
  width: 42px;
}

@media (hover: hover) {
  .side-nav-item:not(.is-active):hover {
    background: var(--background-hover);
  }
}

.side-nav-item.is-active {
  background: var(--background-brand-subtle);
  color: var(--content-brand-hover);
}
</style>
