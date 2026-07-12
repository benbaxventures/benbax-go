import prettier from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.expo/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**',
      '**/metro.config.js',
      '**/app.config.js',
    ],
  },
  ...tseslint.configs.recommended,
  {
    plugins: {
      prettier: prettierPlugin,
      // Registered so `react-hooks/*` rules resolve everywhere lint-staged runs
      // from the repo root. Kept as warnings so pre-commit does not hard-fail on
      // hook-dependency hints; the per-app configs enforce the stricter levels.
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': 'error',
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  prettier,
];
