import js from '@eslint/js';
import ts from 'typescript-eslint';
import vue from 'eslint-plugin-vue';

export default ts.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '.cache/**', '.local/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['tests/*.mjs'],
    languageOptions: { globals: { document: 'readonly', window: 'readonly' } },
  },
  {
    files: ['apps/test-site/src/browser/**/*.ts'],
    languageOptions: {
      globals: {
        document: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLFormElement: 'readonly',
        HTMLUListElement: 'readonly',
      },
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: ts.parser, extraFileExtensions: ['.vue'] } },
  },
  {
    files: ['**/*.{ts,vue,mjs}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        AbortSignal: 'readonly',
        AbortController: 'readonly',
        Buffer: 'readonly',
        structuredClone: 'readonly',
      },
    },
  },
);
