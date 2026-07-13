#!/usr/bin/env node

/**
 * Vitest wrapper that tolerates ONE specific vitest infrastructure error —
 * and nothing else.
 *
 * The bug: workers talk to the parent process over birpc, whose RPC timeout is a
 * hard-coded 60s with no config knob (vitest passes no `timeout` in
 * createForksRpcOptions). On GitHub's shared runners this suite's heavy jsdom
 * mounts regularly push an `onTaskUpdate` ack past that window, and the worker
 * throws `[vitest-worker]: Timeout calling "onTaskUpdate"`. Vitest counts that as
 * an unhandled error and exits non-zero — with a 100% green suite. CI has failed
 * this way with 1201/1201 and 3847/3847 tests passing.
 *
 * Everything reasonable was tried first and none of it eliminated the error:
 * fewer forks (it still fired at 2), killing the console flood that crossed the
 * RPC wire, sharding the run, scoping coverage to src/ (it fires in the
 * integration job too, which has no instrumentation at all), and two genuine perf
 * fixes that cut the worst file's CPU by ~3x. The threads pool would sidestep the
 * transport entirely but segfaults V8 with jsdom.
 *
 * So: re-run once (it is load-dependent, not deterministic), and only if the
 * retry ALSO ends in that exact state do we pass — and only when the run is
 * otherwise perfectly clean:
 *
 *   - vitest reported at least one test file, and ZERO failed,
 *   - the ONLY unhandled error is the onTaskUpdate RPC timeout.
 *
 * Any failing test, any other unhandled error, or an unparseable summary still
 * fails the build. This does not use `dangerouslyIgnoreUnhandledErrors`, which
 * would blanket-ignore every unhandled error including real ones.
 */

const { spawnSync } = require('child_process');

const RPC_TIMEOUT_RE = /\[vitest-worker\]: Timeout calling "onTaskUpdate"/;
// "Test Files  170 passed (170)" / "Test Files  1 failed | 169 passed (170)"
const TEST_FILES_RE = /Test Files\s+(.*)$/gm;

const stripAnsi = (s) => s.replace(/\[[0-9;]*m/g, '');

const runVitest = (args) => {
  const res = spawnSync('npx', ['vitest', ...args], {
    encoding: 'utf8',
    env: process.env,
    // Capture so we can inspect, but stream through so CI logs stay live.
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  const stdout = res.stdout || '';
  const stderr = res.stderr || '';
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  return { status: res.status ?? 1, output: stripAnsi(stdout + '\n' + stderr) };
};

// True only when vitest printed at least one "Test Files" summary and none of
// them reported a failure. A missing summary (crash, segfault) is NOT clean.
const everyTestPassed = (output) => {
  const summaries = [...output.matchAll(TEST_FILES_RE)].map((m) => m[1]);
  if (!summaries.length) return false;
  return summaries.every((s) => !/failed/.test(s));
};

// The RPC timeout must be the ONLY unhandled error in the run.
const onlyErrorIsRpcTimeout = (output) => {
  if (!RPC_TIMEOUT_RE.test(output)) return false;
  const declared = output.match(/Vitest caught (\d+) unhandled error/);
  const rpcHits = (output.match(new RegExp(RPC_TIMEOUT_RE.source, 'g')) || []).length;
  // Every unhandled error vitest counted must be an onTaskUpdate timeout.
  return declared ? Number(declared[1]) <= rpcHits : true;
};

const isBenignRpcTimeout = (status, output) =>
  status !== 0 && everyTestPassed(stripAnsi(output)) && onlyErrorIsRpcTimeout(stripAnsi(output));

const main = () => {
  const args = process.argv.slice(2);

  let { status, output } = runVitest(args);
  if (status === 0) process.exit(0);

  if (!isBenignRpcTimeout(status, output)) process.exit(status);

  console.warn(
    '\n[run-vitest] All tests passed, but the run exited non-zero on vitest\'s\n' +
    '[run-vitest] birpc "Timeout calling onTaskUpdate" (a worker<->parent RPC\n' +
    '[run-vitest] timeout, not a test failure). Retrying once...\n'
  );

  ({ status, output } = runVitest(args));
  if (status === 0) process.exit(0);

  if (isBenignRpcTimeout(status, output)) {
    console.warn(
      '\n[run-vitest] The retry hit the same RPC timeout with every test still\n' +
      '[run-vitest] passing. Treating as a pass: no test failed and the timeout is\n' +
      '[run-vitest] the only unhandled error. A real failure still fails the build.\n'
    );
    process.exit(0);
  }

  process.exit(status);
};

module.exports = { isBenignRpcTimeout, everyTestPassed, onlyErrorIsRpcTimeout };

if (require.main === module) main();
