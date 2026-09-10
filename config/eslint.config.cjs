const eslint = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    files: ['server/**/*.js', 'public/js/app.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      eslint,
    },
    rules: {
      ...eslint.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      'no-return-await': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];
