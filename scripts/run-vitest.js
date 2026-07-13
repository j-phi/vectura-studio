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
 * So: re-run once (it is load-dependent, not deterministic), and only if the retry
 * ALSO ends in that exact state do we pass — and only when the run is otherwise
 * perfectly clean. This predicate FAILS CLOSED: anything it cannot positively
 * recognise as "green suite + RPC timeout and nothing else" fails the build.
 *
 * It reads the two lines vitest itself prints as its verdict, rather than
 * pattern-matching loose prose:
 *   - the `Test Files  N passed (N)` summary (anchored to its own line, so an
 *     echoed source line or console output cannot fake one), and
 *   - one `⎯ Unhandled Error ⎯` block per unhandled error, cross-checked against
 *     vitest's own `Vitest caught N unhandled error(s)` count.
 * Every one of those blocks must be the RPC timeout.
 *
 * It deliberately does NOT use vitest's `dangerouslyIgnoreUnhandledErrors`, which
 * blanket-ignores every unhandled error including real ones.
 */

const { spawn } = require('child_process');

const RPC_TIMEOUT_RE = /\[vitest-worker\]: Timeout calling "onTaskUpdate"/;

// Vitest's own summary line, anchored to the start of its line and required to end
// in the "(N)" total — e.g. " Test Files  170 passed (170)". Anchoring matters: a
// code-frame echo ("  71|   const x = ' Test Files  170 passed (170)';") or a
// console.log must NOT be mistaken for a summary, or a crash could be waved through.
const TEST_FILES_RE = /^\s*Test Files\s+(.+\(\d+\))\s*$/gm;
// The banner vitest prints above each unhandled error it collected.
const UNHANDLED_BLOCK_RE = /⎯+\s*Unhandled Error\s*⎯+/;
const CAUGHT_COUNT_RE = /Vitest caught (\d+) unhandled error/;

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

const runVitest = (args) =>
  new Promise((resolve) => {
    // Stream straight through to the terminal/CI log AND capture a copy. spawnSync
    // could not do both: it buffers everything until exit (nothing appears live) and
    // its 1MB default maxBuffer SIGTERMs the child on overflow.
    const child = spawn('npx', ['vitest', ...args], { env: process.env, stdio: ['inherit', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (d) => { output += d; process.stdout.write(d); });
    child.stderr.on('data', (d) => { output += d; process.stderr.write(d); });
    child.on('error', (error) => resolve({ status: 1, output, error }));
    child.on('close', (code, signal) => resolve({ status: code ?? 1, output, signal }));
  });

// True only when vitest printed at least one real summary line, every one of them
// reports passing files, and none reports a failure. An all-skipped run is not a
// pass, and a crash that printed no summary at all is certainly not one.
const everyTestPassed = (output) => {
  const summaries = [...stripAnsi(output).matchAll(TEST_FILES_RE)].map((m) => m[1]);
  if (!summaries.length) return false;
  return summaries.every((s) => /\d+ passed/.test(s) && !/failed/.test(s));
};

// True only when vitest collected at least one unhandled error, its own count of them
// agrees with the number of error blocks printed, and EVERY block is the RPC timeout.
// If vitest's count line is missing we cannot verify what else may be in there, so we
// refuse to tolerate — fail closed.
const onlyErrorIsRpcTimeout = (output) => {
  const clean = stripAnsi(output);
  const declared = clean.match(CAUGHT_COUNT_RE);
  if (!declared) return false;

  // Split on the block banner; segment 0 is everything before the first error.
  const blocks = clean.split(UNHANDLED_BLOCK_RE).slice(1);
  if (!blocks.length) return false;
  if (blocks.length !== Number(declared[1])) return false;
  return blocks.every((block) => RPC_TIMEOUT_RE.test(block));
};

const isBenignRpcTimeout = (status, output) =>
  status !== 0 && everyTestPassed(output) && onlyErrorIsRpcTimeout(output);

const reportSpawnTrouble = ({ error, signal }) => {
  if (error) console.error(`\n[run-vitest] failed to launch vitest: ${error.message}`);
  else if (signal) console.error(`\n[run-vitest] vitest was killed by signal ${signal}`);
};

const main = async () => {
  const args = process.argv.slice(2);

  let result = await runVitest(args);
  if (result.status === 0) return 0;
  reportSpawnTrouble(result);

  if (!isBenignRpcTimeout(result.status, result.output)) return result.status;

  console.warn(
    '\n[run-vitest] All tests passed, but the run exited non-zero on vitest\'s\n' +
    '[run-vitest] birpc "Timeout calling onTaskUpdate" (a worker<->parent RPC\n' +
    '[run-vitest] timeout, not a test failure). Retrying once...\n'
  );

  result = await runVitest(args);
  if (result.status === 0) return 0;
  reportSpawnTrouble(result);

  if (isBenignRpcTimeout(result.status, result.output)) {
    console.warn(
      '\n[run-vitest] The retry hit the same RPC timeout with every test still\n' +
      '[run-vitest] passing. Treating as a pass: no test failed and that timeout is\n' +
      '[run-vitest] the only unhandled error. A real failure still fails the build.\n'
    );
    return 0;
  }

  return result.status;
};

module.exports = { isBenignRpcTimeout, everyTestPassed, onlyErrorIsRpcTimeout };

if (require.main === module) {
  // Set exitCode rather than calling process.exit(): process.exit() discards
  // whatever is still queued on stdout when it is a pipe (as it is under CI), which
  // silently truncated the log — the summary lines are at the very end.
  main().then((code) => { process.exitCode = code; });
}
