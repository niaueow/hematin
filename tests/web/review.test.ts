// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import AppShell from '@web/components/AppShell.vue';
import { routes } from '@web/router';
import { DARK_MODE_READY, initTheme } from '@web/theme';

// M15, the final review: what can be checked automatically (SECURITY §9 CSP item, accessibility, theme).

// happy-dom replaces the global URL, so resolve plain paths.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('CSP and headers for the SPA (SECURITY §6, §9): strict, and the Mini App still works', () => {
  type Header = { key: string; value: string };
  const vercel = JSON.parse(read('vercel.json')) as { headers: { source: string; headers: Header[] }[] };
  const spa = vercel.headers.find((h) => h.source === '/((?!api/).*)');
  const header = (key: string) => spa?.headers.find((h) => h.key === key)?.value ?? '';
  const directives = Object.fromEntries(
    header('Content-Security-Policy')
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .map(([name, ...sources]) => [name, sources]),
  ) as Record<string, string[]>;

  it('applies to every path except /api/ (the API sets its own, stricter CSP via helmet)', () => {
    expect(spa).toBeDefined();
    expect(new RegExp(`^${spa?.source.replace('(?!api/)', '(?!api/)')}$`).test('/statistik')).toBe(true);
  });

  it.each([
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", 'https://telegram.org']], // telegram-web-app.js, nothing inline, no eval
    ['frame-ancestors', ['https://web.telegram.org']], // Telegram Web embeds the Mini App in an iframe
    ['connect-src', ["'self'"]],
    ['style-src', ["'self'", 'https://fonts.googleapis.com']],
    ['font-src', ["'self'", 'https://fonts.gstatic.com']],
    ['img-src', ["'self'", 'data:', 'https://t.me']], // the Telegram profile photo
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
  ])('%s %j', (name, sources) => {
    expect(directives[name]).toEqual(sources);
  });

  it('nothing unsafe anywhere', () => {
    expect(header('Content-Security-Policy')).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
  });

  it('no Referer (the magic-link token is in /auth?token=…), no MIME sniffing', () => {
    expect(header('Referrer-Policy')).toBe('no-referrer');
    expect(header('X-Content-Type-Options')).toBe('nosniff');
  });

  it('index.html has no inline script, loads the Mini App bridge from telegram.org, and sends no Referer', () => {
    const html = read('web/index.html');
    const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
    expect(scripts.every(([, attrs, body]) => /\bsrc=/.test(attrs ?? '') && (body ?? '').trim() === '')).toBe(true);
    expect(html).toContain('src="https://telegram.org/js/telegram-web-app.js"');
    expect(html).toContain('<meta name="referrer" content="no-referrer" />');
    expect(html).toContain('lang="id"');
  });
});

describe('contrast of text tokens (WCAG 2.2 AA): the pairs that pass stay passing', () => {
  const css = `${read('web/src/styles/tokens.css')}\n${read('web/src/styles/tokens.fixes.css').split('[data-semantic-mode')[0]}`;
  const vars = new Map(
    [...css.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1] as string, (m[2] as string).trim()]),
  );
  const resolve = (name: string): string => {
    const value = vars.get(name) ?? '';
    const ref = /^var\((--[a-z0-9-]+)\)$/.exec(value);
    return ref ? resolve(ref[1] as string) : value;
  };
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (fg: string, bg: string) => {
    const [a, b] = [luminance(resolve(fg)), luminance(resolve(bg))];
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };

  it.each([
    ['body text', '--content-primary', '--background-primary', 4.5],
    ['card text', '--content-primary', '--background-light', 4.5],
    ['primary button', '--content-primary-inverse', '--background-brand-active', 4.5],
    ['primary button hover', '--content-primary-inverse', '--background-brand-hover', 4.5],
    ['links', '--content-brand-active', '--background-light', 4.5],
    ['info chip / pokok', '--content-system-default-info', '--background-system-subtle-info', 4.5],
    ['active nav item', '--content-brand-hover', '--background-brand-subtle', 4.5],
    ['focus ring (UI, 3:1)', '--stroke-focus', '--background-light', 3],
    ['filled input border (UI, 3:1)', '--stroke-secondary-inverse', '--background-light', 3],
  ])('%s: %s on %s ≥ %s', (_name, fg, bg, min) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  // The pairs that don't pass are Figma's palette, so changing them is a design decision: see the M15 review in
  // docs/DESIGN.md §1 for the ratios and the shades that would pass.
});

describe('theme', () => {
  it('stays light while there are no dark tokens, even on a dark-mode device', () => {
    expect(DARK_MODE_READY).toBe(false);
    const matchMedia = vi
      .spyOn(window, 'matchMedia')
      .mockReturnValue({ matches: true, addEventListener: vi.fn() } as never);
    const el = document.createElement('html');
    initTheme(el);
    expect(el.dataset.semanticMode).toBe('light');
    initTheme(el, true); // once dark tokens exist, it follows the device
    expect(el.dataset.semanticMode).toBe('dark');
    matchMedia.mockRestore();
  });
});

describe('keyboard and screen readers', () => {
  it('the shell has a skip link to the main content', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/',
          component: AppShell,
          children: [{ path: '', component: defineComponent({ render: () => h('p', 'x') }) }],
        },
      ],
    });
    await router.push('/');
    const wrapper = mount(RouterView, { global: { plugins: [router] } });
    await flushPromises();
    const skip = wrapper.find('a.app-shell__skip');
    expect(skip.attributes('href')).toBe('#main');
    expect(wrapper.find('main#main').attributes('tabindex')).toBe('-1');
    // It comes before the navigation in the tab order.
    const html = wrapper.html();
    expect(html.indexOf('app-shell__skip')).toBeLessThan(html.indexOf('side-nav'));
  });

  it('every page has a title (announced after navigation)', () => {
    const all = routes.flatMap((r) => [r, ...(r.children ?? [])]).filter((r) => r.component);
    expect(all.filter((r) => !r.meta?.title).map((r) => r.path)).toEqual(['/']); // the shell itself
  });
});
