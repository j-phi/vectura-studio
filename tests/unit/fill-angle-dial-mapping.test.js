/*
 * Adversarial-review fix A5 — the fill-control-surface angle controls now
 * mount the shared UI.AngleDial (keyboard + aria) instead of a hand-rolled
 * mouse-only dial. This file PINS the convention mapping:
 *
 *   Fill params are stored screen-atan2 style: 0° = east (3 o'clock), growing
 *   clockwise. UI.AngleDial's dial-space is 0° = up (12 o'clock), clockwise.
 *   The legacy dial rendered its needle at `--angle:(param+90)deg` in that
 *   same 0°-up space, so:
 *
 *       dial-space = param + 90     (mod 360)
 *
 *   This is the recorded 90° fillAngle convention gotcha (the reason fillAngle
 *   was excluded from the Text panel's shared surface). If a refactor drops
 *   the offset, every hatch rotates 90° out from under its needle — these
 *   tests exist to fail loudly when that happens.
 *
 * Also pinned: dblclick resets to the HOST default (paint bucket
 * DEFAULTS.fillAngle = 45), not a hardcoded 0; the host `.slider-val` chip
 * keeps showing/accepting PARAM-convention degrees.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');

const buildHarness = () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="grid"></div><div id="controls"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const ctx = dom.getInternalVMContext();
  for (const rel of [
    'src/ui/ui-fill-panel.js',
    'src/ui/components/slider.js',
    'src/ui/components/angle-dial.js',
    'src/ui/fill-control-surface.js',
  ]) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, ctx, { filename: path.basename(rel) });
  }
  return dom;
};

const mountHatch = (dom, params = {}, opts = {}) => {
  const { document } = dom.window;
  const merged = Object.assign({ fillMode: 'hatch', fillDensity: 1, fillAngle: 0 }, params);
  const surface = dom.window.Vectura.UI.FillControlSurface.mount(Object.assign({
    gridEl: document.getElementById('grid'),
    controlsEl: document.getElementById('controls'),
    params: merged,
    typeKey: 'fillMode',
    idPrefix: 'pb',
  }, opts));
  return { surface, params: merged, document };
};

const dialFor = (document, id = 'fillAngle') =>
  document.querySelector(`[data-fcs-angle="${id}"] svg.angle-dial`);

describe('FillControlSurface angle controls — UI.AngleDial with pinned convention mapping (A5)', () => {
  test('mounts the shared SVG dial (keyboard-operable) and hides its dial-space input in favor of the param chip', () => {
    const dom = buildHarness();
    const { document } = mountHatch(dom, { fillAngle: 0 });
    const dial = dialFor(document);
    expect(dial).toBeTruthy();
    expect(dial.getAttribute('role')).toBe('slider');
    expect(dial.tabIndex).toBe(0);
    // Legacy hand-rolled dial is gone.
    expect(document.querySelector('[data-fcs-angle="fillAngle"] div.angle-dial')).toBeFalsy();
    // The dial's own input is dial-space → hidden; the host chip stays.
    const innerWrap = document.querySelector('[data-fcs-angle="fillAngle"] .angle-inp-wrap');
    expect(innerWrap.style.display).toBe('none');
    expect(document.getElementById('pb-fillAngle-chip')).toBeTruthy();
  });

  test('PINNED param→dial mapping: dial-space = param + 90 (needle direction identical to the legacy dial)', () => {
    const dom = buildHarness();
    // param 0 (east) → dial 90 — exactly the legacy `--angle:(0+90)deg`.
    let h = mountHatch(dom, { fillAngle: 0 });
    let dial = dialFor(h.document);
    expect(dial.getAttribute('aria-valuenow')).toBe('90');
    // Needle points right/east: x2 > center, y2 == center (SVG is 38×38, r=16).
    const needle = dial.querySelector('.dial-needle');
    expect(Number(needle.getAttribute('x2'))).toBeCloseTo(19 + 16, 5);
    expect(Number(needle.getAttribute('y2'))).toBeCloseTo(19, 5);
    // param 45 → dial 135; param 270 → dial 0.
    h = mountHatch(dom, { fillAngle: 45 });
    expect(dialFor(h.document).getAttribute('aria-valuenow')).toBe('135');
    h = mountHatch(dom, { fillAngle: 270 });
    expect(dialFor(h.document).getAttribute('aria-valuenow')).toBe('0');
  });

  test('PINNED pointer→param mapping: pointing the dial east commits param 0, exactly like the legacy atan2 math', () => {
    const dom = buildHarness();
    const changes = [];
    const { document, params } = mountHatch(dom, { fillAngle: 45 }, {
      onChange: (committed) => changes.push(committed),
    });
    const dial = dialFor(document);
    dial.getBoundingClientRect = () => ({ left: 0, top: 0, right: 38, bottom: 38, width: 38, height: 38, x: 0, y: 0 });
    // Pointer at the 3-o'clock edge (east of center).
    dial.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 38, clientY: 19 }));
    expect(params.fillAngle).toBeCloseTo(0, 5); // east = param 0 (legacy convention)
    expect(changes[changes.length - 1]).toBe(false); // live frame
    dial.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 38, clientY: 19 }));
    expect(changes[changes.length - 1]).toBe(true); // release commits
    // Pointer at 6 o'clock (south) → screen-atan2 90°.
    dial.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 19, clientY: 38 }));
    expect(params.fillAngle).toBeCloseTo(90, 5);
    dial.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 19, clientY: 38 }));
  });

  test('keyboard arrows on the dial nudge the PARAM by 1° and commit; onEdit fires before the first write', () => {
    const dom = buildHarness();
    const calls = [];
    const { document, params } = mountHatch(dom, { fillAngle: 45 }, {
      onEdit: () => calls.push('edit'),
      onChange: (committed) => calls.push(committed ? 'commit' : 'live'),
    });
    const dial = dialFor(document);
    dial.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect(params.fillAngle).toBe(46);
    expect(calls[0]).toBe('edit');
    expect(calls).toContain('commit');
    // Chip shows the PARAM value, not dial-space.
    expect(document.getElementById('pb-fillAngle-chip').value).toBe('46°');
  });

  test('dblclick resets to the host default (DEFAULTS.fillAngle = 45), not hardcoded 0', () => {
    const dom = buildHarness();
    const { document, params } = mountHatch(dom, { fillAngle: 10 }, {
      defaults: { fillAngle: 45 },
    });
    const dial = dialFor(document);
    dial.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(params.fillAngle).toBe(45);
    expect(dial.getAttribute('aria-valuenow')).toBe('135'); // dial-space = 45 + 90
    expect(document.getElementById('pb-fillAngle-chip').value).toBe('45°');
  });

  test('chip edits accept PARAM-convention degrees and re-aim the dial with the +90 offset', () => {
    const dom = buildHarness();
    const { document, params } = mountHatch(dom, { fillAngle: 0 });
    const chip = document.getElementById('pb-fillAngle-chip');
    chip.value = '180';
    chip.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    expect(params.fillAngle).toBe(180);
    expect(dialFor(document).getAttribute('aria-valuenow')).toBe('270');
  });
});
