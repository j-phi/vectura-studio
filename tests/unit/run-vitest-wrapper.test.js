/*
 * The vitest wrapper tolerates exactly one thing: vitest's own birpc
 * "Timeout calling onTaskUpdate" RPC timeout, and only when the run is otherwise
 * perfectly clean. These tests pin that boundary — the whole point of the wrapper
 * is that it must NOT become a way to sweep real failures under the rug.
 */
const { isBenignRpcTimeout } = require('../../scripts/run-vitest');

const RPC_TIMEOUT = 'Error: [vitest-worker]: Timeout calling "onTaskUpdate"';
const CAUGHT_ONE = 'Vitest caught 1 unhandled error during the test run.';

describe('run-vitest: what counts as a benign RPC timeout', () => {
  test('all tests passed + the RPC timeout is the only unhandled error → tolerated', () => {
    const output = [
      ' Test Files  170 passed (170)',
      '      Tests  1188 passed (1188)',
      CAUGHT_ONE,
      RPC_TIMEOUT,
      '     Errors  1 error',
    ].join('\n');
    expect(isBenignRpcTimeout(1, output)).toBe(true);
  });

  test('a FAILING test alongside the RPC timeout → still fails the build', () => {
    const output = [
      ' Test Files  1 failed | 169 passed (170)',
      '      Tests  3 failed | 1185 passed (1188)',
      CAUGHT_ONE,
      RPC_TIMEOUT,
    ].join('\n');
    expect(isBenignRpcTimeout(1, output)).toBe(false);
  });

  test('a failure in ONE shard of a multi-run invocation → still fails the build', () => {
    const output = [
      ' Test Files  149 passed (149)',
      ' Test Files  1 failed | 146 passed (147)',
      RPC_TIMEOUT,
    ].join('\n');
    expect(isBenignRpcTimeout(1, output)).toBe(false);
  });

  test('a DIFFERENT unhandled error → still fails the build', () => {
    const output = [
      ' Test Files  170 passed (170)',
      'Vitest caught 1 unhandled error during the test run.',
      'Error: connect ECONNREFUSED 127.0.0.1:5432',
    ].join('\n');
    expect(isBenignRpcTimeout(1, output)).toBe(false);
  });

  test('the RPC timeout PLUS another unhandled error → still fails the build', () => {
    const output = [
      ' Test Files  170 passed (170)',
      'Vitest caught 2 unhandled errors during the test run.',
      RPC_TIMEOUT,
      'Error: something else entirely',
    ].join('\n');
    expect(isBenignRpcTimeout(1, output)).toBe(false);
  });

  test('a crash with no test summary at all (e.g. segfault) → still fails the build', () => {
    expect(isBenignRpcTimeout(139, 'Segmentation fault: 11')).toBe(false);
  });

  test('a non-zero exit with no RPC timeout → still fails the build', () => {
    expect(isBenignRpcTimeout(1, ' Test Files  170 passed (170)')).toBe(false);
  });

  test('a clean exit is never routed through the tolerance path', () => {
    const output = ' Test Files  170 passed (170)';
    expect(isBenignRpcTimeout(0, output)).toBe(false);
  });
});
