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
    poolOptions: {
      forks: {
        // Headroom for the parent process. Workers ship console output and task
        // updates to the parent over birpc; if the parent's event loop stalls, a
        // worker's `onTaskUpdate` goes unacked past birpc's RPC timeout
        // (hard-coded 60s, no config knob) and the run dies on
        // "[vitest-worker]: Timeout calling onTaskUpdate" — an unhandled error
        // that fails CI even when every test passed.
        //
        // The stall's root cause was a console flood, fixed at the source by
        // stubbing canvas export in tests/helpers/load-vectura-runtime.js. Fork
        // count alone never fixed it (it still fired at 2). But 4 forks + the
        // parent still oversubscribe CI's 4-vCPU shared runner, so leave the
        // parent a core to breathe rather than betting solely on a quiet wire.
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
