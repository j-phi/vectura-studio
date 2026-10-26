/*
 * TUX-017 — touch gesture arbiter (pure decision + pointer map + latch).
 * Loads src/render/touch-gesture-arbiter.js into JSDOM next to ui-constants.js.
 *
 * Window rule: roll back when dt < ARBITRATION_MS OR travel < ARBITRATION_SLOP_PX.
 * Commit the first action only when BOTH are met. The boundary is OUTSIDE the
 * window: dt === 250 ms and travel === 10 px commit.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeEach } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const load = () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
    runScripts: 'outside-only',
  });
  const ctx = dom.getInternalVMContext();
  ['src/config/ui-constants.js', 'src/render/touch-gesture-arbiter.js'].forEach((rel) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
  });
  return dom.window;
};

const ev = (id, t, x, y, type = 'touch') => ({ pointerId: id, pointerType: type, timeStamp: t, clientX: x, clientY: y });

describe('TouchGestureArbiter.decide (truth table)', () => {
  let A;
  beforeEach(() => { A = load().Vectura.TouchGestureArbiter; });

  it('module is registered', () => {
    expect(A).toBeTruthy();
    expect(typeof A.decide).toBe('function');
  });

  const cells = [
    ['3 px @ 60 ms', 3, 60, 'rollback'],
    ['40 px @ 400 ms', 40, 400, 'commitFirst'],
    ['8 px @ 80 ms', 8, 80, 'rollback'],
    ['40 px @ 100 ms (OR rule: time wins)', 40, 100, 'rollback'],
    ['3 px @ 1000 ms (OR rule: slop wins)', 3, 1000, 'rollback'],
    ['10 px @ 250 ms (boundary: >= is outside the window)', 10, 250, 'commitFirst'],
    ['9.9 px @ 250 ms', 9.9, 250, 'rollback'],
    ['10 px @ 249 ms', 10, 249, 'rollback'],
  ];
  cells.forEach(([label, px, ms, expected]) => {
    it(label, () => {
      const d = A.decide({ dtMs: ms, travelPx: px });
      expect(d.start).toBe('pinch');
      expect(d.rollback).toBe(expected === 'rollback');
      expect(d.commitFirst).toBe(expected === 'commitFirst');
    });
  });

  it('reads the window from UI_CONSTANTS.TOUCH_GESTURE; overriding it changes the result', () => {
    const w = load();
    const Arb = w.Vectura.TouchGestureArbiter;
    expect(w.Vectura.UI_CONSTANTS.TOUCH_GESTURE).toEqual({ ARBITRATION_MS: 250, ARBITRATION_SLOP_PX: 10, touchDragSlopPx: 6, TAP_MAX_SKEW_MS: 250, TAP_MAX_DURATION_MS: 250, TAP_SLOP_PX: 10 });
    expect(Arb.decide({ dtMs: 400, travelPx: 40 }).commitFirst).toBe(true);
    w.Vectura.UI_CONSTANTS.TOUCH_GESTURE = { ARBITRATION_MS: 500, ARBITRATION_SLOP_PX: 60 };
    expect(Arb.decide({ dtMs: 400, travelPx: 40 }).rollback).toBe(true);
    w.Vectura.UI_CONSTANTS.TOUCH_GESTURE = { ARBITRATION_MS: 100, ARBITRATION_SLOP_PX: 2 };
    expect(Arb.decide({ dtMs: 120, travelPx: 3 }).commitFirst).toBe(true);
  });
});

describe('TouchGestureArbiter pointer map and latch', () => {
  let A;
  let arb;
  beforeEach(() => { A = load().Vectura.TouchGestureArbiter; arb = A.create(); });

  it('down(p1) -> move(3px) -> down(p2, +60ms) => rollback + pinch', () => {
    expect(arb.down(ev(1, 1000, 100, 100)).role).toBe('first');
    arb.update(ev(1, 1030, 103, 100));
    const info = arb.down(ev(2, 1060, 200, 100));
    expect(info.role).toBe('second');
    expect(info.dtMs).toBe(60);
    expect(info.travelPx).toBeCloseTo(3);
    expect(info.decision).toEqual({ rollback: true, commitFirst: false, start: 'pinch' });
  });

  it('down(p1) -> move(40px) -> down(p2, +400ms) => commitFirst + pinch', () => {
    arb.down(ev(1, 1000, 100, 100));
    arb.update(ev(1, 1200, 140, 100));
    const info = arb.down(ev(2, 1400, 200, 100));
    expect(info.decision).toEqual({ rollback: false, commitFirst: true, start: 'pinch' });
  });

  it('max travel is kept even if the finger returns to the start', () => {
    arb.down(ev(1, 0, 0, 0));
    arb.update(ev(1, 10, 50, 0));
    arb.update(ev(1, 20, 1, 0));
    expect(arb.get(1).maxTravel).toBeCloseTo(50);
  });

  it('a non-touch pointer is never entered into the map', () => {
    expect(arb.down(ev(7, 0, 5, 5, 'pen'))).toBeNull();
    expect(arb.down(ev(8, 0, 5, 5, 'mouse'))).toBeNull();
    arb.update(ev(7, 5, 9, 9, 'pen'));
    expect(arb.pointers.size).toBe(0);
    expect(arb.gestureActive).toBe(false);
  });

  it('update() ignores a pointer that never went down', () => {
    expect(arb.update(ev(3, 0, 1, 1))).toBeNull();
    expect(arb.pointers.size).toBe(0);
  });

  it('a third finger while the latch is held is ignored (no new decision)', () => {
    arb.down(ev(1, 0, 0, 0));
    arb.down(ev(2, 50, 100, 0));
    expect(arb.gestureActive).toBe(true);
    const third = arb.down(ev(3, 80, 50, 50));
    expect(third.role).toBe('latched');
    expect(third.decision).toBeUndefined();
  });

  it('a new finger while one finger of a pinch is still down is ignored', () => {
    arb.down(ev(1, 0, 0, 0));
    arb.down(ev(2, 50, 100, 0));
    arb.release(ev(2, 200, 100, 0));
    expect(arb.gestureActive).toBe(true);
    expect(arb.down(ev(4, 300, 20, 20)).role).toBe('latched');
  });

  it('the latch clears only when the map is empty', () => {
    arb.down(ev(1, 0, 0, 0));
    arb.down(ev(2, 50, 100, 0));
    arb.down(ev(3, 60, 50, 50));
    arb.release(ev(1, 300, 0, 0));
    expect(arb.gestureActive).toBe(true);
    arb.release(ev(2, 310, 100, 0));
    expect(arb.gestureActive).toBe(true);
    arb.release(ev(3, 320, 50, 50));
    expect(arb.gestureActive).toBe(false);
    expect(arb.down(ev(5, 400, 1, 1)).role).toBe('first');
  });

  it('abort() drops the map and the latch', () => {
    arb.down(ev(1, 0, 0, 0));
    arb.down(ev(2, 50, 100, 0));
    arb.abort();
    expect(arb.pointers.size).toBe(0);
    expect(arb.gestureActive).toBe(false);
  });

  it('onSecondFinger listeners run once when the second finger lands', () => {
    const seen = [];
    arb.onSecondFinger((info) => seen.push(info.firstId));
    arb.down(ev(1, 0, 0, 0));
    arb.down(ev(2, 50, 100, 0));
    arb.down(ev(3, 60, 5, 5));
    expect(seen).toEqual([1]);
  });

  it('exports one interaction flag list and the Escape-ordered cancel paths', () => {
    expect(A.INTERACTION_FLAGS.length).toBeGreaterThan(20);
    expect(new Set(A.INTERACTION_FLAGS).size).toBe(A.INTERACTION_FLAGS.length);
    expect(A.CANCEL_PATHS[0]).toBe('_cancelSceneObjectGizmoDrag');
    expect(A.CANCEL_PATHS[A.CANCEL_PATHS.length - 1]).toBe('cancelLayerDrag');
  });

  it('C1: every long-press yield flag is an interaction flag; soft marquee/pan/pending-move flags are not yield flags', () => {
    expect(A.LONG_PRESS_YIELD_FLAGS.length).toBeGreaterThan(10);
    A.LONG_PRESS_YIELD_FLAGS.forEach((f) => expect(A.INTERACTION_FLAGS).toContain(f));
    ['isPan', 'isSelecting', 'isLassoSelecting', 'isDirectMarquee', '_touchMovePending', 'directDrag']
      .forEach((f) => expect(A.LONG_PRESS_YIELD_FLAGS).not.toContain(f));
    ['rotation3DDrag', '_sceneObjectGizmoDrag', 'isLayerDrag', 'penAnchorDrag'].forEach((f) => expect(A.LONG_PRESS_YIELD_FLAGS).toContain(f));
  });
});

describe('TUX-021: Apple Pencil pointer preempts touch (pen-preempts-touch policy)', () => {
  let arb;
  const pen = (id, extra = {}) => ({ pointerId: id, pointerType: 'pen', buttons: 1, pressure: 0.5, timeStamp: 0, clientX: 0, clientY: 0, ...extra });
  beforeEach(() => { arb = load().Vectura.TouchGestureArbiter.create(); });

  it('touch then pen: roll the touch back and start the pen', () => {
    arb.down(ev(1, 0, 10, 10));
    const d = arb.penDown(pen(2), { touchActive: true });
    expect(d).toMatchObject({ preempt: true, rollback: 'touch', stopGesture: false, restoreView: false, start: 'pen', ignoredIds: [1] });
    expect(arb.pointers.size).toBe(0);
  });

  it('a pinch then pen: stop the gesture and restore the view', () => {
    arb.down(ev(1, 0, 10, 10));
    arb.down(ev(3, 50, 40, 10));
    const d = arb.penDown(pen(2), { touchActive: false, touchGesture: true });
    expect(d).toMatchObject({ preempt: true, rollback: null, stopGesture: true, restoreView: true, start: 'pen' });
    expect(d.ignoredIds.sort()).toEqual([1, 3]);
    expect(arb.gestureActive).toBe(false);
  });

  it('pen then touch: the touches are ignored and start no pinch', () => {
    arb.penDown(pen(2), {});
    expect(arb.touchPolicy(ev(1, 0, 5, 5)).ignore).toBe(true);
    expect(arb.touchPolicy(ev(3, 10, 9, 9)).ignore).toBe(true);
    expect(arb.pointers.size).toBe(0);
    expect(arb.isIgnoredTouch(ev(1, 0, 0, 0))).toBe(true);
  });

  it('ignored touches stay ignored after the pen lifts, until they lift', () => {
    arb.penDown(pen(2), {});
    arb.touchPolicy(ev(1, 0, 5, 5));
    arb.penRelease(pen(2));
    expect(arb.penActive).toBe(false);
    expect(arb.touchPolicy(ev(1, 0, 5, 5)).ignore).toBe(true);
    expect(arb.releaseIgnored(ev(1, 0, 0, 0))).toBe(true);
    expect(arb.touchPolicy(ev(1, 0, 5, 5)).ignore).toBe(false);
  });

  it('a touch cancel of a preempted palm is reported as ignored (never aborts the pen)', () => {
    arb.down(ev(1, 0, 10, 10));
    arb.penDown(pen(2), { touchActive: true });
    expect(arb.releaseIgnored({ pointerId: 1, pointerType: 'touch', type: 'pointercancel' })).toBe(true);
    expect(arb.penActive).toBe(true);
  });

  it('pen hover (buttons 0, pressure 0) makes no transition', () => {
    arb.down(ev(1, 0, 10, 10));
    expect(arb.penDown(pen(2, { buttons: 0, pressure: 0 }), { touchActive: true })).toBeNull();
    expect(arb.pointers.size).toBe(1);
    expect(arb.penActive).toBe(false);
  });

  it('a pen pointerdown without buttons and pressure counts as contact', () => {
    expect(arb.penDown({ pointerId: 2, pointerType: 'pen' }, {})).toMatchObject({ start: 'pen' });
  });

  it('mouse is unchanged: no pen decision, touches still tracked', () => {
    arb.down(ev(1, 0, 10, 10));
    expect(arb.penDown({ pointerId: 9, pointerType: 'mouse', buttons: 1 }, { touchActive: true })).toBeNull();
    expect(arb.pointers.size).toBe(1);
    expect(arb.touchPolicy(ev(4, 0, 1, 1)).ignore).toBe(false);
  });

  it('a new touch stays ignored while a preempted palm still rests, even after the pen lifts', () => {
    arb.down(ev(1, 0, 10, 10));
    arb.penDown(pen(2), { touchActive: true });
    arb.penRelease(pen(2));
    expect(arb.touchPolicy(ev(3, 0, 5, 5)).ignore).toBe(true);
    arb.releaseIgnored(ev(1, 0, 0, 0));
    arb.releaseIgnored(ev(3, 0, 0, 0));
    expect(arb.touchPolicy(ev(4, 0, 5, 5)).ignore).toBe(false);
  });

  it('abort clears the ignored set so a lost lift cannot leave ids ignored', () => {
    arb.down(ev(1, 0, 10, 10));
    arb.penDown(pen(2), { touchActive: true });
    arb.abort();
    expect(arb.isIgnoredTouch(ev(1, 0, 0, 0))).toBe(false);
    expect(arb.touchPolicy(ev(5, 0, 5, 5)).ignore).toBe(false);
  });
});
