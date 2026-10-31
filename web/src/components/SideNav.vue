<script setup lang="ts">
import { LogOut, PanelLeft } from '@lucide/vue';
import { useRoute } from 'vue-router';
import SideNavItem from '@web/components/SideNavItem.vue';
import UserAvatar from '@web/components/UserAvatar.vue';
import { isNavActive, NAV_ITEMS, type NavItem, type SideNavUser } from '@web/nav';

// DESIGN.md §4.4a: the desktop sidebar (≥ 1024px). `collapsed` is a v-model; AppShell remembers it.

withDefaults(
  defineProps<{ collapsed?: boolean; items?: readonly NavItem[]; user?: SideNavUser; canLogout?: boolean }>(),
  { collapsed: false, items: () => NAV_ITEMS, canLogout: true },
);
const emit = defineEmits<{ 'update:collapsed': [collapsed: boolean]; logout: [] }>();

const route = useRoute();
</script>

<template>
  <nav class="side-nav" :class="{ 'is-collapsed': collapsed }" aria-label="Menu utama">
    <div class="side-nav__header">
      <span class="side-nav__logo" aria-hidden="true">H</span>
      <span v-if="!collapsed" class="side-nav__name text-body-1">Hematin</span>
      <button
        type="button"
        class="side-nav__toggle"
        :aria-label="collapsed ? 'Lebarkan menu' : 'Ciutkan menu'"
        :aria-expanded="!collapsed"
        @click="emit('update:collapsed', !collapsed)"
      >
        <PanelLeft :size="24" aria-hidden="true" />
      </button>
    </div>

    <div class="side-nav__items">
      <SideNavItem
        v-for="item in items"
        :key="item.key"
        :icon="item.icon"
        :label="item.label"
        :to="item.to"
        :active="isNavActive(item, route.path)"
        :collapsed="collapsed"
      />
    </div>

    <div v-if="user" class="side-nav__profile">
      <UserAvatar :name="user.name" :src="user.avatarUrl" :online="user.online" />
      <template v-if="!collapsed">
        <div class="side-nav__who">
          <span class="side-nav__user text-body-2">{{ user.name }}</span>
          <span v-if="user.subtitle" class="side-nav__subtitle text-caption-1">{{ user.subtitle }}</span>
        </div>
        <button v-if="canLogout" type="button" class="side-nav__logout" aria-label="Keluar" @click="emit('logout')">
          <LogOut :size="24" aria-hidden="true" />
        </button>
      </template>
    </div>
  </nav>
</template>

<style scoped>
.side-nav {
  display: flex;
  flex-direction: column;
  gap: var(--space-spacing-24);
  width: 240px;
  height: 100%;
  padding: var(--space-spacing-12);
  border-right: 1px solid var(--stroke-primary);
  background: var(--background-light);
  overflow: hidden;
  transition: width var(--motion-enter);
}

/* 42px item + 12px padding on each side + the border */
.side-nav.is-collapsed {
  width: calc(42px + 2 * var(--space-spacing-12) + 1px);
}

.side-nav__header {
  display: flex;
  align-items: center;
  gap: var(--space-spacing-8);
  min-height: 51px;
}

.side-nav.is-collapsed .side-nav__header {
  flex-direction: column;
  align-items: center;
}

/* Logo mark: Plus Jakarta Sans 800, 40px (DESIGN §4.4a) */
.side-nav__logo {
  font-family: var(--font-family-base);
  font-size: 40px;
  font-weight: 800;
  line-height: normal;
  color: var(--content-brand-active);
}

.side-nav__name {
  flex: 1;
  color: var(--content-primary);
}

.side-nav__toggle,
.side-nav__logout {
  display: inline-flex;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: var(--radius-8);
  background: none;
  color: var(--content-primary);
  cursor: pointer;
}

.side-nav__items {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-spacing-4);
}

.side-nav__profile {
  display: flex;
  align-items: center;
  gap: var(--space-spacing-16);
  padding: var(--space-spacing-16) 0;
  border-top: 1px solid var(--stroke-primary);
}

.side-nav.is-collapsed .side-nav__profile {
  justify-content: center;
}

.side-nav__who {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.side-nav__user {
  color: var(--content-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side-nav__subtitle {
  color: var(--content-gray);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
