/*
 * Guardrail: `hookTimeout` must be raised alongside `testTimeout` (2026-07-12).
 *
 * `vitest.config.mjs` raises `testTimeout` to 60s because the CI jobs run the
 * suite under fork contention (maxForks 4) and v8 coverage instrumentation,
 * which makes the heavy full-stack jsdom mounts run ~5-8x slower than an
 * isolated local run. But `testTimeout` does NOT apply to `beforeEach` /
 * `beforeAll` hooks — those are bounded by `hookTimeout`, which defaults to
 * 10_000ms.
 *
 * ~20 integration files perform their full-stack mount inside a hook, so the
 * un-raised default silently capped every one of them at 10s in CI while the
 * test bodies got 60s. `raster-plane-source-widget.test.js` (a full mount per
 * test, ~3s locally) was the first to cross the line and turned CI red with
 * "Hook timed out in 10000ms".
 *
 * This asserts the two timeouts stay in lockstep so a mount-in-a-hook file
 * can't be capped at the default again.
 */
import { describe, it, expect } from 'vitest';
import config from '../../vitest.config.mjs';

describe('vitest config: hook timeout', () => {
  it('raises hookTimeout for slow full-stack jsdom mounts in beforeEach/beforeAll', () => {
    expect(config.test.hookTimeout).toBeGreaterThanOrEqual(60000);
  });

  it('keeps hookTimeout at least as generous as testTimeout', () => {
    expect(config.test.hookTimeout).toBeGreaterThanOrEqual(config.test.testTimeout);
  });
});
