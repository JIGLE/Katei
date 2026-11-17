// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'public/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
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
