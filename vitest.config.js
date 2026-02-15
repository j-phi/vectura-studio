const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/helpers/vitest.setup.js'],
    include: ['tests/**/*.test.js'],
    exclude: ['tests/e2e/**'],
    testTimeout: 20000,
  },
});
