import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// AGENTS.md rule 3, checked on the source (ESLint also enforces it).
const source = (file: string) => readFileSync(new URL(`../../server/budget/${file}`, import.meta.url), 'utf8');

describe('the budget engine is pure', () => {
  it('engine.ts imports only periods.ts', () => {
    const imports = [...source('engine.ts').matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    expect(imports).toEqual(['./periods.js']);
  });

  it.each(['engine.ts', 'periods.ts'])('%s never reads the clock', (file) => {
    const code = source(file);
    expect(code).not.toMatch(/Date\.now\s*\(/);
    expect(code).not.toMatch(/new Date\(\s*\)/);
    const imports = [...code.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    expect(imports.filter((i) => /prisma|\/db\//i.test(i ?? ''))).toEqual([]);
  });
});
