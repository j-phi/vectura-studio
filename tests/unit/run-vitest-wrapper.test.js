/*
 * The vitest wrapper tolerates exactly one thing: vitest's own birpc
 * "Timeout calling onTaskUpdate" RPC timeout, and only when the run is otherwise
 * perfectly clean. These tests pin that boundary — the whole point of the wrapper
 * is that it must never become a way to sweep real failures under the rug, so the
 * predicate must FAIL CLOSED on anything it cannot positively recognise.
 *
 * The fixtures mirror REAL vitest output (block banners + the "Vitest caught N"
 * count line). An adversarial review showed that hand-simplified fixtures hid
 * three separate fail-open holes, because they never reproduced the shape of the
 * output the predicate actually has to reason about.
 */
const { isBenignRpcTimeout } = require('../../scripts/run-vitest');

const RPC = 'Error: [vitest-worker]: Timeout calling "onTaskUpdate"';
const BANNER = '⎯⎯⎯⎯⎯⎯ Unhandled Error ⎯⎯⎯⎯⎯⎯⎯';

// A faithful reproduction of what a real green-but-RPC-timed-out run prints.
const realRpcTimeoutRun = [
  ' ✓ tests/integration/thing.test.js (10 tests) 2451ms',
  '',
  '⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯',
  '',
  'Vitest caught 1 unhandled error during the test run.',
  'This might cause false positive tests.',
  '',
  BANNER,
  RPC,
  ' ❯ Object.onTimeoutError node_modules/vitest/dist/chunks/rpc.-pEldfrD.js:53:10',
  '',
  ' Test Files  170 passed (170)',
  '      Tests  1188 passed (1188)',
  '     Errors  1 error',
].join('\n');

describe('run-vitest: what counts as a benign RPC timeout', () => {
  test('a green suite whose ONLY unhandled error is the RPC timeout → tolerated', () => {
    expect(isBenignRpcTimeout(1, realRpcTimeoutRun)).toBe(true);
  });

  test('a clean exit never routes through the tolerance path', () => {
    expect(isBenignRpcTimeout(0, realRpcTimeoutRun)).toBe(false);
  });

  test('a FAILING test alongside the RPC timeout → still fails the build', () => {
    const output = realRpcTimeoutRun
      .replace(' Test Files  170 passed (170)', ' Test Files  1 failed | 169 passed (170)')
      .replace('      Tests  1188 passed (1188)', '      Tests  3 failed | 1185 passed (1188)');
    expect(isBenignRpcTimeout(1, output)).toBe(false);
  });

  test('one failing run among several summaries (e.g. shards) → still fails the build', () => {
    const output = [realRpcTimeoutRun, ' Test Files  1 failed | 146 passed (147)'].join('\n');
    expect(isBenignRpcTimeout(1, output)).toBe(false);
  });

  test('a DIFFERENT unhandled error → still fails the build', () => {
    const output = [
      '⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯',
      'Vitest caught 1 unhandled error during the test run.',
      BANNER,
      'Error: connect ECONNREFUSED 127.0.0.1:5432',
      ' Test Files  170 passed (170)',
    ].join('\n');
    expect(isBenignRpcTimeout(1, output)).toBe(false);
  });

  test('the RPC timeout PLUS a real error in a second block → still fails the build', () => {
    const output = [
      '⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯',
      'Vitest caught 2 unhandled errors during the test run.',
      BANNER,
      RPC,
      BANNER,
      'Error: kaboom — a real regression',
      ' Test Files  170 passed (170)',
    ].join('\n');
    expect(isBenignRpcTimeout(1, output)).toBe(false);
  });

  // Regression: the predicate used to count OCCURRENCES OF THE RPC STRING rather
  // than error blocks, so a second real error was tolerated whenever the RPC text
  // happened to appear twice (vitest echoes source lines around a failure — and
  // this very file contains the literal). Each block must itself be the timeout.
  test('a real error is not excused by the RPC text appearing twice → still fails', () => {
    const output = [
      '⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯',
      'Vitest caught 2 unhandled errors during the test run.',
      BANNER,
      RPC,
      `  9|  const RPC = '${RPC}';`, // an echoed source line — not an error block
      BANNER,
      'Error: kaboom — a real regression',
      ' Test Files  170 passed (170)',
    ].join('\n');
    expect(isBenignRpcTimeout(1, output)).toBe(false);
  });

  // Regression: fail CLOSED. The count line is what lets us verify nothing else is
  // hiding in the run; without it we cannot, so we must not tolerate.
  test('no "Vitest caught N" count line → still fails the build', () => {
    const output = [BANNER, RPC, ' Test Files  170 passed (170)'].join('\n');
    expect(isBenignRpcTimeout(1, output)).toBe(false);
  });

  test('vitest\'s error count disagreeing with the blocks printed → still fails', () => {
    const output = [
      'Vitest caught 2 unhandled errors during the test run.',
      BANNER,
      RPC,
      ' Test Files  170 passed (170)',
    ].join('\n');
    expect(isBenignRpcTimeout(1, output)).toBe(false);
  });

  // Regression: an unanchored summary regex matched an ECHOED source line, so a
  // segfault that printed no real summary was waved through on the strength of a
  // string literal in a test file.
  test('a crash whose only "Test Files" text is an echoed source line → still fails', () => {
    const output = [
      ' FAIL tests/unit/x.test.js',
      "     71|     const output = ' Test Files  170 passed (170)';",
      'Vitest caught 1 unhandled error during the test run.',
      BANNER,
      RPC,
      'Segmentation fault: 11',
    ].join('\n');
    expect(isBenignRpcTimeout(139, output)).toBe(false);
  });

  test('a crash with no test summary at all (e.g. segfault) → still fails the build', () => {
    expect(isBenignRpcTimeout(139, 'Segmentation fault: 11')).toBe(false);
  });

  // Regression: "N skipped" is not "N passed". A suite that ran nothing must not
  // be able to go green on the tolerance path.
  test('an all-skipped run + the RPC timeout → still fails the build', () => {
    const output = realRpcTimeoutRun.replace(
      ' Test Files  170 passed (170)',
      ' Test Files  170 skipped (170)'
    );
    expect(isBenignRpcTimeout(1, output)).toBe(false);
  });

  test('a non-zero exit with no RPC timeout at all → still fails the build', () => {
    expect(isBenignRpcTimeout(1, ' Test Files  170 passed (170)')).toBe(false);
  });

  test('tolerates the real thing through ANSI colour codes', () => {
    const coloured = realRpcTimeoutRun
      .replace(' Test Files  170 passed (170)', '\x1b[2m Test Files \x1b[22m \x1b[1m\x1b[32m170 passed\x1b[39m\x1b[22m\x1b[90m (170)\x1b[39m');
    expect(isBenignRpcTimeout(1, coloured)).toBe(true);
  });
});
