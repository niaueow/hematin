import { ChartPie, House, ReceiptText, User } from '@lucide/vue';
import type { Component } from 'vue';

// DESIGN.md §4.4: the one list both navs read, so desktop and mobile always show the same pages.
// The active item comes from the current route (isNavActive), never passed by hand.

export type NavItem = { key: string; label: string; to: string; icon: Component };

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'home', label: 'Home', to: '/', icon: House },
  { key: 'tx', label: 'Transaksi', to: '/transaksi', icon: ReceiptText },
  { key: 'stats', label: 'Statistik', to: '/statistik', icon: ChartPie },
  { key: 'me', label: 'Profil', to: '/profil', icon: User },
];

/** "/" only on the home page itself; other items also for their sub-pages ("/transaksi/123"). */
export function isNavActive(item: Pick<NavItem, 'to'>, path: string): boolean {
  if (item.to === '/') return path === '/';
  return path === item.to || path.startsWith(`${item.to}/`);
}

/** The sidebar's profile area. `subtitle` = the Telegram @username (instead of the e-mail in Figma). */
export type SideNavUser = { name: string; subtitle?: string; avatarUrl?: string | null; online?: boolean };

/** localStorage key for the sidebar's collapsed state (DESIGN §4.4a: remembered per browser). */
export const SIDENAV_COLLAPSED_KEY = 'hematin.sidenav.collapsed';
