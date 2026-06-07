import prettier from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const reactHooksRules = {
  'react-hooks/rules-of-hooks': reactHooksPlugin.rules['rules-of-hooks'],
  'react-hooks/exhaustive-deps': reactHooksPlugin.rules['exhaustive-deps'],
};

export default [
  { ignores: ['dist/**', 'node_modules/**', 'build/**', '*.config.*'] },
  ...tseslint.configs.recommended,
  {
    plugins: {
      prettier: prettierPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    settings: {
      react: {
        version: '19',
      },
    },
    rules: {
      'prettier/prettier': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': 'error',
      'react/react-in-jsx-scope': 'off',
      ...reactHooksRules,
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  prettier,
];
