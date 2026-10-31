// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import AppAlert from '@web/components/AppAlert.vue';
import AppShell from '@web/components/AppShell.vue';
import AppSkeleton from '@web/components/AppSkeleton.vue';
import BottomNav from '@web/components/BottomNav.vue';
import ConfirmDialog from '@web/components/ConfirmDialog.vue';
import EmptyState from '@web/components/EmptyState.vue';
import SideNav from '@web/components/SideNav.vue';
import ToastHost from '@web/components/ToastHost.vue';
import UserAvatar from '@web/components/UserAvatar.vue';
import {
  ACTION_DURATION,
  clearToasts,
  DEFAULT_DURATION,
  pause,
  resume,
  runAction,
  show,
  toasts,
} from '@web/composables/useToast';
import { isNavActive, NAV_ITEMS, SIDENAV_COLLAPSED_KEY } from '@web/nav';
import { me } from '@web/session';

// M13: the shell (DESIGN §4.4) and the feedback components (§4.5).

const Blank = defineComponent({ render: () => h('div') });

async function routerAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Blank },
      { path: '/transaksi/:id?', component: Blank },
      { path: '/statistik', component: Blank },
      { path: '/profil', component: Blank },
    ],
  });
  await router.push(path);
  await router.isReady();
  return router;
}

const activeLabels = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('[aria-current="page"]').map((a) => a.text());

describe('navigation: the active item comes from the route', () => {
  it.each([
    ['/', 'Home'],
    ['/transaksi', 'Transaksi'],
    ['/transaksi/123', 'Transaksi'],
    ['/statistik', 'Statistik'],
    ['/profil', 'Profil'],
  ])('%s → %s (both navs)', async (path, label) => {
    const router = await routerAt(path);
    const side = mount(SideNav, { global: { plugins: [router] } });
    const bottom = mount(BottomNav, { global: { plugins: [router] } });
    expect(activeLabels(side)).toEqual([label]);
    expect(activeLabels(bottom)).toEqual([label]);
    expect(side.findAll('.side-nav-item.is-active')).toHaveLength(1);
    expect(bottom.findAll('.bottom-nav__item.is-active')).toHaveLength(1);
  });

  it('follows navigation without anything passed by hand', async () => {
    const router = await routerAt('/');
    const bottom = mount(BottomNav, { global: { plugins: [router] } });
    await router.push('/statistik');
    await flushPromises();
    expect(activeLabels(bottom)).toEqual(['Statistik']);
  });

  it('the active BottomNav icon is filled, the others outlined', async () => {
    const router = await routerAt('/profil');
    const bottom = mount(BottomNav, { global: { plugins: [router] } });
    expect(bottom.findAll('svg').map((svg) => svg.attributes('fill'))).toEqual([
      'none',
      'none',
      'none',
      'currentColor',
    ]);
  });

  it('isNavActive: "/" only matches the home page', () => {
    const home = NAV_ITEMS[0] as (typeof NAV_ITEMS)[number];
    expect(isNavActive(home, '/')).toBe(true);
    expect(isNavActive(home, '/transaksi')).toBe(false);
    expect(isNavActive({ to: '/transaksi' }, '/transaksiku')).toBe(false);
  });

  it('BottomNav shows at most 5 items', async () => {
    const router = await routerAt('/');
    const items = Array.from({ length: 7 }, (_, i) => ({ ...NAV_ITEMS[0]!, key: `k${i}`, to: `/x${i}` }));
    expect(mount(BottomNav, { props: { items }, global: { plugins: [router] } }).findAll('a')).toHaveLength(5);
  });
});

describe('SideNav', () => {
  it('collapsed: icons only with the label as a tooltip; the name and profile text hide', async () => {
    const router = await routerAt('/');
    const user = { name: 'Nia Putri', subtitle: '@nia' };
    const open = mount(SideNav, { props: { user }, global: { plugins: [router] } });
    expect(open.find('.side-nav__name').text()).toBe('Hematin');
    expect(open.find('.side-nav__subtitle').text()).toBe('@nia');

    const collapsed = mount(SideNav, { props: { user, collapsed: true }, global: { plugins: [router] } });
    expect(collapsed.find('.side-nav__name').exists()).toBe(false);
    expect(collapsed.find('.side-nav__who').exists()).toBe(false);
    expect(collapsed.findAll('.side-nav-item').map((a) => a.attributes('title'))).toEqual(
      NAV_ITEMS.map((i) => i.label),
    );
    expect(collapsed.find('.user-avatar').exists()).toBe(true);
  });

  it('the toggle flips v-model:collapsed; logout is hidden when it can’t be used (Mini App)', async () => {
    const router = await routerAt('/');
    const wrapper = mount(SideNav, { props: { user: { name: 'N' } }, global: { plugins: [router] } });
    await wrapper.find('.side-nav__toggle').trigger('click');
    expect(wrapper.emitted('update:collapsed')).toEqual([[true]]);
    await wrapper.find('.side-nav__logout').trigger('click');
    expect(wrapper.emitted('logout')).toHaveLength(1);
    const miniApp = mount(SideNav, { props: { user: { name: 'N' }, canLogout: false }, global: { plugins: [router] } });
    expect(miniApp.find('.side-nav__logout').exists()).toBe(false);
  });
});

describe('AppShell: the collapsed sidebar is remembered (localStorage)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    me.value = {
      id: 'u1',
      firstName: 'Nia',
      telegramUsername: 'nia',
      role: 'OWNER',
      needsPct: 50,
      wantsPct: 30,
      savingsPct: 20,
    };
  });

  async function shell() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: AppShell, children: [{ path: '', component: Blank }] }],
    });
    await router.push('/');
    await router.isReady();
    return mount(RouterView, { global: { plugins: [router] } });
  }

  it('starts expanded; collapsing is saved; a new visit starts collapsed', async () => {
    const first = await shell();
    expect(first.find('.side-nav').classes()).not.toContain('is-collapsed');
    await first.find('.side-nav__toggle').trigger('click');
    expect(first.find('.side-nav').classes()).toContain('is-collapsed');
    expect(window.localStorage.getItem(SIDENAV_COLLAPSED_KEY)).toBe('1');

    const second = await shell();
    expect(second.find('.side-nav').classes()).toContain('is-collapsed');
    await second.find('.side-nav__toggle').trigger('click');
    expect(window.localStorage.getItem(SIDENAV_COLLAPSED_KEY)).toBe('0');
  });

  it('shows the user from /api/me: name, @username, initials when there’s no photo', async () => {
    const wrapper = await shell();
    expect(wrapper.find('.side-nav__user').text()).toBe('Nia');
    expect(wrapper.find('.side-nav__subtitle').text()).toBe('@nia');
    expect(wrapper.find('.user-avatar__initials').text()).toBe('N');
  });

  it('works when storage is unavailable (just not remembered)', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const wrapper = await shell();
    expect(wrapper.find('.side-nav').classes()).not.toContain('is-collapsed');
    spy.mockRestore();
  });
});

describe('toasts: timing and pausing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    clearToasts();
    vi.useRealTimers();
  });

  it('closes after 4 s, or 6 s with an action; 0 = until closed', () => {
    show({ message: 'a' });
    show({ message: 'b', actionLabel: 'Urungkan' });
    show({ message: 'c', duration: 0 });
    vi.advanceTimersByTime(DEFAULT_DURATION - 1);
    expect(toasts.toasts.map((t) => t.message)).toEqual(['a', 'b', 'c']);
    vi.advanceTimersByTime(1);
    expect(toasts.toasts.map((t) => t.message)).toEqual(['b', 'c']);
    vi.advanceTimersByTime(ACTION_DURATION - DEFAULT_DURATION);
    expect(toasts.toasts.map((t) => t.message)).toEqual(['c']);
    vi.advanceTimersByTime(60_000);
    expect(toasts.toasts.map((t) => t.message)).toEqual(['c']);
  });

  it('pausing keeps the time left; resuming runs only the rest', () => {
    const id = show({ message: 'a' });
    vi.advanceTimersByTime(1_000);
    pause(id);
    vi.advanceTimersByTime(30_000);
    expect(toasts.toasts).toHaveLength(1);
    resume(id);
    vi.advanceTimersByTime(2_999);
    expect(toasts.toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toasts.toasts).toHaveLength(0);
  });

  it('at most 3: the oldest goes', () => {
    ['1', '2', '3', '4'].forEach((message) => show({ message }));
    expect(toasts.toasts.map((t) => t.message)).toEqual(['2', '3', '4']);
  });

  it('the action runs once and closes the toast', () => {
    const onAction = vi.fn();
    const id = show({ message: 'Transaksi dihapus', actionLabel: 'Urungkan', onAction });
    runAction(id);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(toasts.toasts).toEqual([]);
  });

  it('ToastHost: hovering a toast pauses it; leaving resumes; the close button closes it', async () => {
    const host = mount(ToastHost);
    show({ tone: 'positive', message: 'Disimpan' });
    await nextTick();
    const item = host.find('.toast-host__item');
    await item.trigger('mouseenter');
    vi.advanceTimersByTime(10_000);
    expect(toasts.toasts).toHaveLength(1);
    await item.trigger('mouseleave');
    vi.advanceTimersByTime(DEFAULT_DURATION);
    expect(toasts.toasts).toHaveLength(0);

    show({ message: 'x', duration: 0 });
    await nextTick();
    await host.find('.app-toast__close').trigger('click');
    expect(toasts.toasts).toHaveLength(0);
  });

  it('ToastHost is a polite live region; a negative toast is an alert', async () => {
    const host = mount(ToastHost);
    expect(host.attributes()).toMatchObject({ role: 'status', 'aria-live': 'polite' });
    show({ tone: 'negative', message: 'Gagal' });
    await nextTick();
    expect(host.find('.app-toast').attributes('role')).toBe('alert');
  });
});

describe('ConfirmDialog: focus trap, Esc, overlay, Telegram back button', () => {
  type Fn = () => void;
  let backButton: {
    show: ReturnType<typeof vi.fn<Fn>>;
    hide: ReturnType<typeof vi.fn<Fn>>;
    onClick: ReturnType<typeof vi.fn<(cb: Fn) => void>>;
    offClick: ReturnType<typeof vi.fn<(cb: Fn) => void>>;
  };
  const mounted: { unmount: () => void }[] = [];

  beforeEach(() => {
    backButton = {
      show: vi.fn<Fn>(),
      hide: vi.fn<Fn>(),
      onClick: vi.fn<(cb: Fn) => void>(),
      offClick: vi.fn<(cb: Fn) => void>(),
    };
    window.Telegram = {
      WebApp: {
        initData: 'signed',
        initDataUnsafe: {},
        ready: vi.fn(),
        expand: vi.fn(),
        isVersionAtLeast: () => true,
        BackButton: backButton,
      },
    };
  });
  afterEach(() => {
    // Unmounting releases each dialog's back-button registration (the handler stack is app-wide).
    mounted.splice(0).forEach((w) => w.unmount());
    delete window.Telegram;
    document.body.innerHTML = '';
  });

  /** A trigger button + the dialog, like a page uses it. */
  async function opened() {
    const open = ref(false);
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const Host = defineComponent({
      setup: () => () => [
        h('button', { id: 'trigger', onClick: () => (open.value = true) }, 'Hapus'),
        h(ConfirmDialog, {
          open: open.value,
          title: 'Hapus transaksi?',
          message: 'Jajan cireng Rp10.000 bakal dihapus.',
          'onUpdate:open': (value: boolean) => (open.value = value),
          onCancel,
          onConfirm,
        }),
      ],
    });
    const wrapper = mount(Host, { attachTo: document.body });
    mounted.push(wrapper);
    const trigger = document.getElementById('trigger') as HTMLButtonElement;
    trigger.focus();
    trigger.click();
    await flushPromises();
    const panel = () => document.querySelector<HTMLElement>('.confirm-dialog__panel');
    const buttons = () => [...(panel()?.querySelectorAll('button') ?? [])];
    return { wrapper, open, onCancel, onConfirm, trigger, panel, buttons };
  }
  const key = (target: Element, init: KeyboardEventInit) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));

  it('opens as a modal alertdialog, labelled, with focus on Batal (the safer default)', async () => {
    const { panel, buttons } = await opened();
    expect(panel()?.getAttribute('role')).toBe('alertdialog');
    expect(panel()?.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(panel()?.getAttribute('aria-labelledby') ?? '')?.textContent).toBe(
      'Hapus transaksi?',
    );
    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Batal', 'Ya, hapus']);
    expect(document.activeElement).toBe(buttons()[0]);
  });

  it('Tab and Shift+Tab stay inside the panel', async () => {
    const { buttons } = await opened();
    const [cancel, confirm] = buttons() as [HTMLButtonElement, HTMLButtonElement];
    confirm.focus();
    key(confirm, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);
    key(cancel, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);
  });

  it('Esc cancels, closes, and gives focus back to the trigger', async () => {
    const { panel, open, onCancel, trigger } = await opened();
    key(panel() as HTMLElement, { key: 'Escape' });
    await flushPromises();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(open.value).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('a click on the overlay cancels; a click inside the panel doesn’t', async () => {
    const { panel, onCancel } = await opened();
    (panel() as HTMLElement).click();
    expect(onCancel).not.toHaveBeenCalled();
    (document.querySelector('.confirm-dialog') as HTMLElement).click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('confirm emits confirm (the page decides when to close)', async () => {
    const { buttons, onConfirm, open } = await opened();
    buttons()[1]?.click();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(open.value).toBe(true);
  });

  it('Telegram’s back button shows while it’s open and cancels it; hidden again after', async () => {
    const { onCancel, open } = await opened();
    expect(backButton.show).toHaveBeenCalledTimes(1);
    const handler = backButton.onClick.mock.calls[0]?.[0] as Fn;
    handler();
    await flushPromises();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(open.value).toBe(false);
    expect(backButton.hide).toHaveBeenCalledTimes(1);
    expect(backButton.offClick).toHaveBeenCalledWith(handler);
  });

  it('loading goes to the confirm button', async () => {
    const wrapper = mount(ConfirmDialog, { props: { open: true, title: 'T', loading: true }, attachTo: document.body });
    await flushPromises();
    expect(document.querySelector('.confirm-dialog__confirm')?.getAttribute('aria-busy')).toBe('true');
    wrapper.unmount();
  });
});

describe('AppAlert, EmptyState, AppSkeleton, UserAvatar', () => {
  it.each(['positive', 'warning', 'negative', 'info', 'neutral'] as const)('AppAlert tone %s has its icon', (tone) => {
    const wrapper = mount(AppAlert, { props: { tone, title: 'T' }, slots: { default: 'Pesan' } });
    expect(wrapper.classes()).toContain(`app-alert--${tone}`);
    expect(wrapper.find('svg').exists()).toBe(true);
    expect(wrapper.find('.app-alert__title').text()).toBe('T');
  });

  it('AppAlert: leadingIcon null hides the icon; dismissible emits close; the action slot', async () => {
    const wrapper = mount(AppAlert, {
      props: { leadingIcon: null, dismissible: true },
      slots: { default: 'x', action: '<button class="act">Lihat</button>' },
    });
    expect(wrapper.findAll('svg')).toHaveLength(1); // only the X
    await wrapper.find('.app-alert__close').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(wrapper.find('.act').exists()).toBe(true);
  });

  it('EmptyState: title, description, and an action button only when labelled', async () => {
    const wrapper = mount(EmptyState, { props: { title: 'Kosong', description: 'Belum ada', actionLabel: 'Tambah' } });
    expect(wrapper.find('.empty-state__title').text()).toBe('Kosong');
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('action')).toHaveLength(1);
    expect(
      mount(EmptyState, { props: { title: 'Kosong' } })
        .find('button')
        .exists(),
    ).toBe(false);
  });

  it('AppSkeleton: text takes the text style’s height; shapes; hidden from screen readers', () => {
    const text = mount(AppSkeleton, { props: { textClass: 'text-h3', width: '60%' } });
    expect(text.classes()).toEqual(expect.arrayContaining(['app-skeleton--text', 'text-h3']));
    expect(text.attributes('style')).toContain('width: 60%');
    expect(text.attributes('aria-hidden')).toBe('true');
    expect(mount(AppSkeleton, { props: { shape: 'circle', width: '48px' } }).classes()).toContain(
      'app-skeleton--circle',
    );
  });

  it('UserAvatar: the photo, or initials (also when the photo fails)', async () => {
    const photo = mount(UserAvatar, { props: { name: 'Nia Putri', src: 'https://t.me/i/userpic/320/x.jpg' } });
    expect(photo.find('img').attributes('src')).toBe('https://t.me/i/userpic/320/x.jpg');
    await photo.find('img').trigger('error');
    expect(photo.find('.user-avatar__initials').text()).toBe('NP');
    expect(mount(UserAvatar, { props: { name: '  ' } }).text()).toBe('?');
  });
});
