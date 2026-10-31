// DESIGN.md §3 rule 1: components use tokens only. No hex, rgb()/hsl()/… or named colours in .vue files or the
// web styles; the raw values live only in the token files (the Figma export and its fixes).
const tokensOnly = 'Use a semantic token, e.g. var(--content-primary) (DESIGN.md §3 rule 1)';

export default {
  overrides: [{ files: ['**/*.vue', '**/*.html'], customSyntax: 'postcss-html' }],
  ignoreFiles: ['web/src/styles/tokens.css', 'web/src/styles/tokens.fixes.css', 'dist/**', 'node_modules/**'],
  rules: {
    'color-no-hex': [true, { message: tokensOnly }],
    'color-named': ['never', { message: tokensOnly }],
    'function-disallowed-list': [
      ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color', 'color-mix'],
      { message: tokensOnly },
    ],
  },
};
