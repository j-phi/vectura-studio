const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.AngleDial', () => {
  let runtime;
  let AngleDial;

  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'motion', 'angle-dial']);
    AngleDial = runtime.window.Vectura.UI.AngleDial;
  });
  afterEach(() => runtime.cleanup());

  test('renders an SVG dial + numeric input with the value normalized to [0, 360)', () => {
    const inst = AngleDial(runtime.document.body, { value: 405, ariaLabel: 'Angle' });
    expect(inst.el.classList.contains('angle-ctrl')).toBe(true);
    expect(inst.el.querySelector('svg.angle-dial')).toBeTruthy();
    expect(inst.el.querySelector('.angle-inp')).toBeTruthy();
    expect(inst.getValue()).toBe(45);
    expect(inst.el.querySelector('.angle-inp').value).toBe('45');
    inst.destroy();
  });

  test('input Enter commits parsed value and fires onCommit', () => {
    const events = [];
    const inst = AngleDial(runtime.document.body, { value: 0, onCommit: (v) => events.push(v) });
    const input = inst.el.querySelector('.angle-inp');
    input.value = '90';
    input.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBe(90);
    expect(events).toEqual([90]);
    inst.destroy();
  });

  test('ArrowUp/ArrowDown nudge in input; Shift multiplies', () => {
    const inst = AngleDial(runtime.document.body, { value: 0 });
    const input = inst.el.querySelector('.angle-inp');
    input.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBe(1);
    input.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBe(11);
    inst.destroy();
  });

  test('setValue wraps unless allowOverflow', () => {
    const inst = AngleDial(runtime.document.body, { value: 0 });
    inst.setValue(720, { silent: true });
    expect(inst.getValue()).toBe(0);
    inst.update({ allowOverflow: true });
    inst.setValue(720, { silent: true });
    expect(inst.getValue()).toBe(720);
    inst.destroy();
  });

  test('destroy() detaches and removes', () => {
    const inst = AngleDial(runtime.document.body, { value: 0 });
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
  });
});

describe('UI.AngleDial (dial keyboard + defaultValue reset)', () => {
  let runtime;
  let AngleDial;
  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'motion', 'angle-dial']);
    AngleDial = runtime.window.Vectura.UI.AngleDial;
  });
  afterEach(() => runtime.cleanup());

  test('arrow keys on the dial SVG nudge the angle and commit', () => {
    const commits = [];
    const inst = AngleDial(runtime.document.body, { value: 0, onCommit: (v) => commits.push(v) });
    const dial = inst.dialEl;
    dial.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBe(1);
    dial.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBe(11);
    dial.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBe(10);
    dial.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBe(0);
    expect(commits.length).toBe(4);
    inst.destroy();
  });

  test('dblclick resets to defaultValue and commits', () => {
    const commits = [];
    const inst = AngleDial(runtime.document.body, { value: 135, defaultValue: 45, onCommit: (v) => commits.push(v) });
    inst.dialEl.dispatchEvent(new runtime.window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBe(45);
    expect(commits).toEqual([45]);
    inst.destroy();
  });

  test('dblclick without defaultValue is a no-op', () => {
    const inst = AngleDial(runtime.document.body, { value: 135 });
    inst.dialEl.dispatchEvent(new runtime.window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBe(135);
    inst.destroy();
  });
});

describe('UI.AngleDial (release wave originates from the handle, clipped to the outer ring)', () => {
  let runtime;
  let AngleDial;
  let motion;
  // SIZE=38, CENTER=19, RING_R=16 are the module's own geometry constants
  // (angle-dial.js) — hardcoded here since they aren't exported, and are
  // stable dial-face geometry, not app config.
  const CENTER = 19;
  const RING_R = 16;

  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'motion', 'angle-dial']);
    AngleDial = runtime.window.Vectura.UI.AngleDial;
    motion = runtime.window.Vectura.UI.motion;
  });
  afterEach(() => runtime.cleanup());

  // jsdom has no PointerEvent constructor; dispatch a plain Event with the
  // pointer-ish properties the handlers read (matches the pattern used
  // elsewhere in this repo's tests, e.g. tests/integration/algo-draw-toolbar).
  const firePointerEvent = (target, type, props = {}) => {
    const event = new runtime.window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, clientX: 0, clientY: 0, ...props });
    target.dispatchEvent(event);
  };

  test('pointerup passes the handle\'s current position (not the dial center) plus the outer-ring clip bounds', () => {
    const calls = [];
    const original = motion.triggerDialWave;
    motion.triggerDialWave = (...args) => { calls.push(args); return original(...args); };

    const inst = AngleDial(runtime.document.body, { value: 0 });
    const svg = inst.dialEl;
    const handle = svg.querySelector('.dial-handle');

    // Drag to some non-zero angle so the handle isn't sitting at its initial spot.
    firePointerEvent(svg, 'pointerdown', { clientX: 100, clientY: 0 });
    const expectedCx = parseFloat(handle.getAttribute('cx'));
    const expectedCy = parseFloat(handle.getAttribute('cy'));
    firePointerEvent(svg, 'pointerup', {});

    expect(calls.length).toBe(1);
    const [calledSvg, cx, cy, opts] = calls[0];
    expect(calledSvg).toBe(svg);
    expect(cx).toBe(expectedCx);
    expect(cy).toBe(expectedCy);
    // The handle always sits on the ring circumference (radius RING_R from
    // CENTER), so it can never coincide with the dial's own center point —
    // this is the regression check that the origin moved off-center.
    expect(cx === CENTER && cy === CENTER).toBe(false);
    expect(opts).toEqual({ clipCx: CENTER, clipCy: CENTER, clipR: RING_R });

    motion.triggerDialWave = original;
    inst.destroy();
  });

  test('dblclick-reset passes the reset position\'s coordinates plus the same outer-ring clip bounds', () => {
    const calls = [];
    const original = motion.triggerDialWave;
    motion.triggerDialWave = (...args) => { calls.push(args); return original(...args); };

    const inst = AngleDial(runtime.document.body, { value: 135, defaultValue: 45 });
    const svg = inst.dialEl;
    const handle = svg.querySelector('.dial-handle');

    svg.dispatchEvent(new runtime.window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));

    expect(calls.length).toBe(1);
    const [, cx, cy, opts] = calls[0];
    expect(cx).toBe(parseFloat(handle.getAttribute('cx')));
    expect(cy).toBe(parseFloat(handle.getAttribute('cy')));
    expect(opts).toEqual({ clipCx: CENTER, clipCy: CENTER, clipR: RING_R });

    motion.triggerDialWave = original;
    inst.destroy();
  });
});

describe('UI.AngleDial (non-default min/max domain — data-corruption regression)', () => {
  let runtime;
  let AngleDial;
  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'motion', 'angle-dial']);
    AngleDial = runtime.window.Vectura.UI.AngleDial;
  });
  afterEach(() => runtime.cleanup());

  test('a negative value within a half-circle domain (min:-90,max:90) is preserved, not force-wrapped to [0,360) and clamped to max', () => {
    const inst = AngleDial(runtime.document.body, { value: -30, min: -90, max: 90 });
    // Bug: setValue() always did wrap360() regardless of domain, so -30 became
    // 330, which the callers' onCommit clamp(deg, -90, 90) then collapsed to 90
    // -- every negative value in the domain was unreachable.
    expect(inst.getValue()).toBe(-30);
    expect(inst.el.querySelector('.angle-inp').value).toBe('-30');
    inst.destroy();
  });

  test('arrow-key nudge from a negative value stays in the correct direction/domain', () => {
    const inst = AngleDial(runtime.document.body, { value: -30, min: -90, max: 90 });
    const input = inst.el.querySelector('.angle-inp');
    input.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBe(-29);
    input.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    input.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBe(-31);
    inst.destroy();
  });

  test('nudging past an edge in a half-circle domain saturates at that edge instead of wrapping to the opposite extreme', () => {
    const inst = AngleDial(runtime.document.body, { value: 89, min: -90, max: 90 });
    const input = inst.el.querySelector('.angle-inp');
    input.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    input.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBe(90);
    inst.destroy();
  });

  test('a value dragged into the "back half" dead zone of a half-circle domain saturates to the nearest valid edge', () => {
    const inst = AngleDial(runtime.document.body, { value: 0, min: -90, max: 90 });
    // 200deg is outside [-90,90]; geometrically it is closer to the -90 edge
    // (wrapped to 270) than to the +90 edge, so it should saturate to -90.
    inst.setValue(200);
    expect(inst.getValue()).toBe(-90);
    inst.destroy();
  });

  test('aria-valuemin/aria-valuemax reflect the real domain, not hardcoded 0/360', () => {
    const inst = AngleDial(runtime.document.body, { value: -30, min: -90, max: 90 });
    expect(inst.dialEl.getAttribute('aria-valuemin')).toBe('-90');
    expect(inst.dialEl.getAttribute('aria-valuemax')).toBe('90');
    inst.destroy();
  });

  test('a full-circle asymmetric domain (min:-180,max:180) behaves like a simple modular fold, matching planeRotate', () => {
    const inst = AngleDial(runtime.document.body, { value: 0, min: -180, max: 180 });
    inst.setValue(200, { silent: true });
    expect(inst.getValue()).toBe(-160);
    inst.destroy();
  });

  test('default domain (min/max omitted) behavior is completely unchanged: still wraps into [0, 360)', () => {
    const inst = AngleDial(runtime.document.body, { value: 405 });
    expect(inst.getValue()).toBe(45);
    expect(inst.dialEl.getAttribute('aria-valuemin')).toBe('0');
    expect(inst.dialEl.getAttribute('aria-valuemax')).toBe('360');
    inst.destroy();
  });
});
