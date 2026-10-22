// Minimal flat config (no extra plugins needed beyond eslint core).
const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  chrome: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  MutationObserver: 'readonly',
  getComputedStyle: 'readonly',
  fetch: 'readonly',
  localStorage: 'readonly',
};

export default [
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: browserGlobals,
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
    },
  },
];
