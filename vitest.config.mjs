import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/helpers/vitest.setup.js'],
    include: ['tests/**/*.test.js'],
    exclude: ['tests/e2e/**'],
    testTimeout: 20000,
  },
});
