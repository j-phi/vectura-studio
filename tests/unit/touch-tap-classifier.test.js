/*
 * TUX-020 - multi-finger tap classifier (pure function + arbiter integration).
 * Two-finger tap = undo, three-finger tap = redo. The window comes from
 * UI_CONSTANTS.TOUCH_GESTURE: TAP_MAX_SKEW_MS 150, TAP_MAX_DURATION_MS 350, TAP_SLOP_PX 10.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeEach } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const load = () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only' });
  const ctx = dom.getInternalVMContext();
  ['src/config/ui-constants.js', 'src/render/touch-gesture-arbiter.js'].forEach((rel) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
  });
  return dom.window;
};

const ev = (id, t, x, y, type = 'touch') => ({ pointerId: id, pointerType: type, timeStamp: t, clientX: x, clientY: y, type: 'x' });

describe('TouchGestureArbiter tap classifier (TUX-020)', () => {
  let A;
  let cfg;
  beforeEach(() => {
    A = load().Vectura.TouchGestureArbiter;
    cfg = A.readConfig();
  });

  it('config carries the tap window', () => {
    expect(cfg.TAP_MAX_SKEW_MS).toBe(150);
    expect(cfg.TAP_MAX_DURATION_MS).toBe(350);
    expect(cfg.TAP_SLOP_PX).toBe(10);
  });

  // Drive the arbiter like the renderer does: down / update / release.
  const run = (steps, { foreignBefore = false } = {}) => {
    const arb = A.create();
    if (foreignBefore) arb.foreignDown(99);
    let last = null;
    steps.forEach(([op, e]) => {
      if (op === 'down') arb.down(e);
      else if (op === 'move') arb.update(e);
      else last = arb.release(e) || last;
    });
    return last;
  };

  it('accepts a two-finger tap', () => {
    const r = run([['down', ev(1, 0, 100, 100)], ['down', ev(2, 40, 200, 100)], ['up', ev(1, 120, 100, 100)], ['up', ev(2, 125, 200, 100)]]);
    expect(r).toMatchObject({ tap: true, count: 2 });
  });

  it('accepts a three-finger tap (max simultaneous count decides)', () => {
    const r = run([
      ['down', ev(1, 0, 100, 100)], ['down', ev(2, 30, 200, 100)], ['down', ev(3, 60, 300, 100)],
      ['up', ev(1, 150, 100, 100)], ['up', ev(2, 152, 200, 100)], ['up', ev(3, 155, 300, 100)],
    ]);
    expect(r).toMatchObject({ tap: true, count: 3 });
  });

  it('rejects when the landing skew is too large', () => {
    const r = run([['down', ev(1, 0, 100, 100)], ['down', ev(2, 151, 200, 100)], ['up', ev(1, 200, 100, 100)], ['up', ev(2, 210, 200, 100)]]);
    expect(r).toMatchObject({ tap: false, reason: 'skew' });
  });

  it('rejects when the whole gesture lasts too long', () => {
    const r = run([['down', ev(1, 0, 100, 100)], ['down', ev(2, 40, 200, 100)], ['up', ev(1, 340, 100, 100)], ['up', ev(2, 351, 200, 100)]]);
    expect(r).toMatchObject({ tap: false, reason: 'duration' });
  });

  it('rejects an early lift (first finger leaves before the second lands)', () => {
    const r = run([['down', ev(1, 0, 100, 100)], ['up', ev(1, 40, 100, 100)], ['down', ev(2, 60, 200, 100)], ['up', ev(2, 90, 200, 100)]]);
    expect(r === null || r.tap === false).toBe(true);
  });

  it('rejects when one finger drifts 10 px or more', () => {
    const r = run([['down', ev(1, 0, 100, 100)], ['down', ev(2, 40, 200, 100)], ['move', ev(1, 60, 100, 111)], ['up', ev(1, 100, 100, 111)], ['up', ev(2, 110, 200, 100)]]);
    expect(r).toMatchObject({ tap: false, reason: 'drift' });
  });

  it('rejects when the finger span changes 10 px or more', () => {
    const r = run([['down', ev(1, 0, 100, 100)], ['down', ev(2, 40, 200, 100)], ['move', ev(2, 60, 209, 100)], ['move', ev(2, 70, 208, 106)], ['up', ev(1, 100, 100, 100)], ['up', ev(2, 110, 208, 106)]]);
    // drift per finger is < 10 here (9.0 and 10.0 hypot) so the span rule must be the one that fires
    expect(r.tap).toBe(false);
  });

  it('a pure span change of 12 px with small drift is a pinch, not a tap', () => {
    const r = run([['down', ev(1, 0, 100, 100)], ['down', ev(2, 40, 200, 100)], ['move', ev(1, 60, 94, 100)], ['move', ev(2, 61, 206, 100)], ['up', ev(1, 100, 94, 100)], ['up', ev(2, 110, 206, 100)]]);
    expect(r).toMatchObject({ tap: false, reason: 'span' });
  });

  it('rejects when a finger started outside the canvas (foreign finger down)', () => {
    const r = run([['down', ev(1, 0, 100, 100)], ['down', ev(2, 40, 200, 100)], ['up', ev(1, 100, 100, 100)], ['up', ev(2, 110, 200, 100)]], { foreignBefore: true });
    expect(r).toMatchObject({ tap: false, reason: 'foreign' });
  });

  it('pointerType mouse and pen are never a tap', () => {
    ['mouse', 'pen'].forEach((type) => {
      const r = run([['down', ev(1, 0, 100, 100, type)], ['down', ev(2, 40, 200, 100, type)], ['up', ev(1, 100, 100, 100, type)], ['up', ev(2, 110, 200, 100, type)]]);
      expect(r).toBeNull();
    });
  });

  it('a pen plus a finger is never a tap', () => {
    const r = run([['down', ev(1, 0, 100, 100, 'pen')], ['down', ev(2, 40, 200, 100)], ['up', ev(1, 100, 100, 100, 'pen')], ['up', ev(2, 110, 200, 100)]]);
    expect(r === null || r.tap === false).toBe(true);
  });

  it('a single finger tap is not a multi-finger tap', () => {
    const r = run([['down', ev(1, 0, 100, 100)], ['up', ev(1, 50, 100, 100)]]);
    expect(r).toBeNull();
  });

  it('pure classifyTap boundary values', () => {
    const base = { count: 2, skewMs: 150, durationMs: 350, maxDrift: 9.99, spanDelta: 9.99, earlyLift: false, foreign: false, onlyTouch: true };
    expect(A.classifyTap(base, cfg).tap).toBe(true);
    expect(A.classifyTap({ ...base, skewMs: 150.5 }, cfg).tap).toBe(false);
    expect(A.classifyTap({ ...base, durationMs: 351 }, cfg).tap).toBe(false);
    expect(A.classifyTap({ ...base, maxDrift: 10 }, cfg).tap).toBe(false);
    expect(A.classifyTap({ ...base, spanDelta: 10 }, cfg).tap).toBe(false);
    expect(A.classifyTap({ ...base, count: 4 }, cfg).tap).toBe(false);
  });
});
