module.exports = {
  nodeTypeVersion: '22',
  env: { node: true, es2022: true },
  extends: ['eslint:recommended'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'script' },
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['error', 'warn'] }],
    'no-return-await': 'error',
    'prefer-const': 'error',
    'no-var': 'error',
  },
};
