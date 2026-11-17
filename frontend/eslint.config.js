// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'dev-dist/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    // The classic Rules of Hooks. The React Compiler rules in the plugin's
    // newer presets flag long-standing patterns here (setState in effects,
    // refs read during render); adopt them deliberately, not in a lint baseline.
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Plain browser scripts served as-is (e.g. the pre-paint theme script).
    files: ['public/**/*.js'],
    languageOptions: { globals: globals.browser, sourceType: 'script' },
  },
  {
    files: ['src/sw.ts'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    rules: {
      // `let x = initial; if (…) x = …` is a deliberate, readable pattern here.
      'no-useless-assignment': 'off',
      // Empty catches are used for best-effort calls (storage, JSON parsing).
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Regexes intentionally match non-breaking and narrow spaces.
      'no-irregular-whitespace': ['error', { skipRegExps: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  prettier,
);
