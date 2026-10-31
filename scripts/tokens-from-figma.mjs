// Converts the Figma token export (PRIMITIVE.json, SEMANTIC.JSON, RADIUS.JSON in W3C design-token format)
// into web/src/styles/tokens.css, the way Figma's CSS export names variables (DESIGN.md §1):
//   "Brand / 500"            → --brand-500
//   "Background / Brand Active" → --background-brand-active
//   "{Neutral.900}"          → var(--neutral-900)
//   "Radius 8"               → --radius-8: 8px
// Usage: node scripts/tokens-from-figma.mjs <export folder>   (npm run tokens)
// It reproduces the export as-is, including its problems; DESIGN.md §1's fixes live in tokens.fixes.css.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const folder = process.argv[2];
if (!folder) throw new Error('usage: node scripts/tokens-from-figma.mjs <folder with the Figma JSON export>');

const read = (name) => {
  const file = readdirSync(folder).find((f) => f.toLowerCase() === `${name.toLowerCase()}.json`);
  if (!file) throw new Error(`${name}.json not found in ${folder}`);
  return JSON.parse(readFileSync(join(folder, file), 'utf8'));
};

const cssName = (segments) =>
  `--${segments
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;

/** {Neutral.900} → var(--neutral-900); plain values pass through. */
const cssValue = (value) =>
  typeof value === 'string' && /^\{.+\}$/.test(value)
    ? `var(${cssName(value.slice(1, -1).split('.'))})`
    : String(value);

function* tokens(node, path = []) {
  if (node && typeof node === 'object' && '$value' in node) {
    yield [path, node.$value];
    return;
  }
  for (const [key, child] of Object.entries(node ?? {})) yield* tokens(child, [...path, key]);
}

const block = (title, entries) => [`  /* ${title} */`, ...entries.map(([name, value]) => `  ${name}: ${value};`)];

const primitive = [...tokens(read('PRIMITIVE'))].map(([path, value]) => [cssName(path), cssValue(value)]);
const semantic = [...tokens(read('SEMANTIC'))].map(([path, value]) => [cssName(path), cssValue(value)]);
const radius = [...tokens(read('RADIUS'))].map(([path, value]) => [cssName(path), `${value}px`]);

const css = [
  "/* Generated from the Figma token export by scripts/tokens-from-figma.mjs (npm run tokens). Don't hand-edit:",
  '   re-export from Figma and rerun. Fixes for this export are in tokens.fixes.css (DESIGN.md §1). */',
  ':root {',
  ...block('Primitive (never use directly in components)', primitive),
  '',
  ...block('Semantic, light mode', semantic),
  '',
  ...block('Radius', radius),
  '}',
  '',
].join('\n');

writeFileSync(new URL('../web/src/styles/tokens.css', import.meta.url), css);
console.log(`tokens.css: ${primitive.length} primitive, ${semantic.length} semantic, ${radius.length} radius`);
