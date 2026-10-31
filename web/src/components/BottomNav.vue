<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router';
import { isNavActive, NAV_ITEMS, type NavItem } from '@web/nav';

// DESIGN.md §4.4b: the mobile / Mini App navbar (< 1024px), at most 5 items. The active item gets the brand top
// border and a filled icon. Lucide has no official filled style: its guide sets `fill`, which suits solid shapes
// (house, user, pie); compare each with Figma.

withDefaults(defineProps<{ items?: readonly NavItem[] }>(), { items: () => NAV_ITEMS });
const route = useRoute();
</script>

<template>
  <nav class="bottom-nav" aria-label="Menu utama">
    <RouterLink
      v-for="item in items.slice(0, 5)"
      :key="item.key"
      :to="item.to"
      class="bottom-nav__item"
      :class="{ 'is-active': isNavActive(item, route.path) }"
      :aria-current="isNavActive(item, route.path) ? 'page' : undefined"
    >
      <component
        :is="item.icon"
        :size="24"
        :fill="isNavActive(item, route.path) ? 'currentColor' : 'none'"
        aria-hidden="true"
      />
      <span class="text-caption-2">{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.bottom-nav {
  display: flex;
  justify-content: space-between;
  padding: 0 var(--space-spacing-24) var(--app-safe-bottom);
  border-radius: var(--radius-12) var(--radius-12) 0 0;
  background: var(--background-light);
}

.bottom-nav__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-spacing-8);
  width: 60px;
  padding: var(--space-spacing-14) var(--space-spacing-4);
  border-top: 2px solid transparent;
  color: var(--content-gray);
  text-decoration: none;
  transition:
    color var(--motion-color),
    border-color var(--motion-color);
}

.bottom-nav__item.is-active {
  border-top-color: var(--stroke-brand);
  color: var(--content-brand-active);
}
</style>
