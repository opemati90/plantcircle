const js = require('@eslint/js');
const reactHooks = require('eslint-plugin-react-hooks');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      '.expo',
      'ios',
      'android',
      'test-results',
      'expo-env.d.ts',
      '**/*.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: __dirname },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // React Native bundles static assets with require().
      '@typescript-eslint/no-require-imports': ['error', { allow: ['\\.(jpg|png)$'] }],
    },
  },
);
