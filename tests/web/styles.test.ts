import { readdirSync, readFileSync } from 'node:fs';
import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';

// DESIGN.md §1 and §3 rule 1, checked on the source: the colour lint catches raw colours in components, and the
// token fixes are all there.

const root = new URL('../../', import.meta.url);
const lint = async (code: string, codeFilename: string) => {
  const { results } = await stylelint.lint({
    code,
    codeFilename: new URL(codeFilename, root).pathname,
    configBasedir: root.pathname,
  });
  return results[0]?.warnings.map((w) => w.rule) ?? [];
};
const vue = (css: string) => `<template><div /></template>\n<style scoped>\n.x { ${css} }\n</style>\n`;

describe('the colour lint (stylelint, DESIGN §3 rule 1)', () => {
  it.each([
    ['a hex colour', 'color: #fff;', 'color-no-hex'],
    ['rgb()', 'color: rgb(0 0 0);', 'function-disallowed-list'],
    ['rgba()', 'background: rgba(0, 0, 0, 0.5);', 'function-disallowed-list'],
    ['hsl()', 'border-color: hsl(0 0% 0%);', 'function-disallowed-list'],
    ['a named colour', 'color: red;', 'color-named'],
  ])('rejects %s in a .vue file', async (_name, css, rule) => {
    expect(await lint(vue(css), 'web/src/components/X.vue')).toContain(rule);
  });

  it('accepts tokens, transparent and currentColor', async () => {
    const css = 'color: var(--content-primary); border-color: transparent; fill: currentColor;';
    expect(await lint(vue(css), 'web/src/components/X.vue')).toEqual([]);
  });

  it('the token files are the one place raw colours live', async () => {
    expect(await lint(':root { --brand-500: #1155cc; }', 'web/src/styles/tokens.css')).toEqual([]);
  });
});

describe('tokens.fixes.css (DESIGN §1)', () => {
  const fixes = readFileSync(new URL('web/src/styles/tokens.fixes.css', root), 'utf8');
  const tokens = readFileSync(new URL('web/src/styles/tokens.css', root), 'utf8');

  it.each([
    '--radius-8: 8px;',
    '--radius-16: 16px;',
    '--radius-full: 999px;',
    '--space-spacing-0: 0px;',
    '--space-spacing-14: 14px;',
    '--space-spacing-24: 24px;',
    "--font-family-base: 'Plus Jakarta Sans', sans-serif;",
    '--caption-caption-3-letter-spacing: 0;',
    '--body-body-2-letter-spacing: 0.01em;',
    '--overlay-50: var(--neutral-overlay-50);',
    '--overlay-50-inverse: var(--neutral-overlay-50-inverse);',
    '--background-system-hover-negative: var(--system-negative-600);',
    '--background-system-hover-negative: var(--system-negative-300);',
  ])('has %s', (declaration) => {
    expect(fixes).toContain(declaration);
  });

  it('the export still has the overlay cycle that fix 4 repairs (so the fix is still needed)', () => {
    expect(tokens).toContain('--overlay-50: var(--overlay-50);');
  });

  it('every token the components and pages use is defined (a var() with a fallback may be missing)', () => {
    const files = ['web/src/components/', 'web/src/pages/'].flatMap((dir) =>
      readdirSync(new URL(dir, root))
        .filter((f) => f.endsWith('.vue'))
        .map((f) => readFileSync(new URL(`${dir}${f}`, root), 'utf8')),
    );
    const app = readFileSync(new URL('web/src/App.vue', root), 'utf8');
    const base = readFileSync(new URL('web/src/styles/base.css', root), 'utf8');
    const used = new Set(
      [...files, app].flatMap((code) => [...code.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1])),
    );
    const defined = new Set(
      [
        ...`${tokens}
${fixes}
${base}`.matchAll(/(--[a-z0-9-]+):/g),
      ].map((m) => m[1]),
    );
    expect([...used].filter((name) => !defined.has(name))).toEqual([]);
  });
});
