import { defineConfig } from 'vitest/config';

const CI = !!process.env.CI;

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/helpers/vitest.setup.js'],
    include: ['tests/**/*.test.js'],
    exclude: ['tests/e2e/**'],
    // 60s, not 20s: the CI `test:coverage` job runs the full suite under v8
    // instrumentation with fork contention (maxForks 4), which makes the heavy
    // full-stack jsdom mounts (e.g. preset-save-dev-mode) run ~5-8x slower than
    // an isolated local coverage run (~3.7s → >20s in CI). The plain test:ci job
    // never hits this. A genuine hang still fails well within 60s.
    testTimeout: 60000,
    // Same reasoning, applied to hooks: `testTimeout` does NOT bound
    // beforeEach/beforeAll, which default to 10s. Many integration files do
    // their full-stack mount inside the hook, so under CI contention the mount
    // blew the default while the test body had 60s ("Hook timed out in
    // 10000ms" — raster-plane-source-widget). Keep the two in lockstep.
    hookTimeout: 60000,
    // Stay on forks. The threads pool would avoid the process-IPC transport that
    // birpc's RPC times out on (and runs ~1.7x faster), but jsdom inside
    // worker_threads segfaults V8 partway through this suite — a native crash is
    // worse than a slow run.
    poolOptions: {
      forks: {
        // Leave the parent a core: it services every worker's RPC, and if it is
        // starved on CI's shared runner the acks are what stall.
        maxForks: CI ? 2 : 4,
      },
    },
  },
  coverage: {
    provider: 'v8',
    reporter: ['text', 'lcov'],
    include: ['src/**/*.js'],
    exclude: ['src/vendor/**'],
  },
});
