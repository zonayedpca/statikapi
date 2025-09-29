// eslint.config.js
import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import n from 'eslint-plugin-n';
import promise from 'eslint-plugin-promise';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  // Ignore build & vendor stuff
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'tmp', '.tmp'],
  },

  // Base rules
  js.configs.recommended,

  // Monorepo base (Node + ESM)
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node, // <-- gives you process, console, __dirname, etc.
      },
    },
    plugins: {
      import: importPlugin,
      n,
      promise,
    },
    rules: {
      // import
      'import/first': 'error',
      'import/newline-after-import': 'warn',
      'import/no-duplicates': 'warn',
      // node (workspace imports can confuse this; enable later if desired)
      'n/no-missing-import': 'off',
      'n/no-unsupported-features/es-syntax': 'off',
      // promise
      'promise/no-return-wrap': 'error',
      'promise/param-names': 'warn',
      // general
      'no-console': 'off',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // CLI bin tweaks (shebang)
  {
    files: ['packages/cli/bin/**'],
    rules: {
      'n/shebang': 'off',
    },
  },

  // CommonJS override for *.cjs files (e.g., prettier.config.cjs)
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node, // gives 'module', 'require', etc.
      },
    },
  },

  // Keep Prettier last
  prettier,
];
