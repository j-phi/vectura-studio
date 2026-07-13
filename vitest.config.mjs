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
    // The heavy jsdom mounts spam console output that every worker ships to the
    // main process over birpc. Keeping the logs of passing tests off that wire
    // removes the bulk of the chatter; failing tests still print theirs, so CI
    // diagnostics are unaffected.
    silent: CI ? 'passed-only' : false,
    poolOptions: {
      forks: {
        // 4 forks + the main process oversubscribe CI's shared runner. Starved
        // of CPU, the parent can go >60s without servicing a worker's
        // `onTaskUpdate`, and birpc's RPC timeout (hard-coded 60s, no config
        // knob) throws "[vitest-worker]: Timeout calling onTaskUpdate" — which
        // fails the run as an unhandled error even when every test passed. That
        // was an intermittent flake the coverage job papered over with retries;
        // once the raster-plane hook fix let its 10 full-app mounts actually run
        // instead of aborting at 10s, the extra load made it hit every attempt.
        // Leave the parent a core to breathe: fix the starvation, not the symptom.
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
