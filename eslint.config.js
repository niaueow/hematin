import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Hard rules from AGENTS.md that a linter can catch.
const bannedProperties = [
  { property: '$queryRawUnsafe', message: 'Banned (AGENTS.md rule 10). Use tagged $queryRaw.' },
  { property: '$executeRawUnsafe', message: 'Banned (AGENTS.md rule 10). Use tagged $executeRaw.' },
  { object: 'express', property: 'static', message: "Doesn't work on Vercel (AGENTS.md rule 10)." },
  { property: 'toFixed', message: 'Money is integer rupiah; format with formatRupiah() (AGENTS.md rule 1).' },
];
const localDateProperties = ['getDate', 'getDay', 'getMonth', 'getFullYear', 'getHours'].map((property) => ({
  property,
  message: 'Vercel runs in UTC. Do date math in server/budget/periods.ts (AGENTS.md rule 2).',
}));

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/', '.vercel/', 'server/db/generated/'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],

  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },

  {
    files: ['**/*.{js,mjs,ts}'],
    ignores: ['web/**'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['web/**/*.{ts,vue}'],
    languageOptions: { globals: globals.browser },
  },

  {
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-restricted-properties': ['error', ...bannedProperties],
      'vue/no-v-html': 'error',
    },
  },
  {
    files: ['api/**/*.ts', 'server/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@server/*', '@web/*'],
              message:
                'Vercel functions do not resolve tsconfig paths. Use a relative import with .js (DECISIONS D-022).',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'setInterval', message: 'Serverless: no timers that outlive the request (AGENTS.md rule 11).' },
      ],
      'no-restricted-properties': ['error', ...bannedProperties, ...localDateProperties],
    },
  },
  {
    files: ['server/budget/periods.ts'],
    rules: { 'no-restricted-properties': ['error', ...bannedProperties] },
  },

  prettier,
);
