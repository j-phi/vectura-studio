/*
 * SHP-1/2 — Shape Properties popover DOM wiring.
 *
 * Loads the config + sub-modes module into JSDOM and drives the standalone
 * anchored popover against a fake renderer implementing the SHP plumbing
 * contract (getShapePropsState / begin / setShapeUniformCornerRadius /
 * setShapeSides / endShapePropsEdit). The real renderer plumbing is covered by
 * shape-props-plumbing.test.js; this pins the popover UI: which controls render
 * per shape type, that edits route to the plumbing with one gesture bracket, and
 * that the fields reflect the persisted params.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '../..');

const buildHarness = () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only',
  });
  const ctx = dom.getInternalVMContext();
  for (const rel of ['src/config/shape-props.js', 'src/ui/shell/context-bar-modes.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: path.basename(rel) });
  }
  return dom;
};

const fire = (dom, node, type) => node.dispatchEvent(new dom.window.Event(type, { bubbles: true }));

// Fake renderer honoring the SHP plumbing contract, backed by a mutable shape.
const makeRenderer = (shape) => {
  const calls = { begins: 0, ends: 0 };
  const state = () => {
    const type = shape.type;
    const radii = Array.isArray(shape.cornerRadii) ? shape.cornerRadii : [];
    const uniform = radii.length ? Math.max(...radii) : 0;
    return {
      layerId: 'l1', pathIndex: 0, type,
      supportsCornerRadius: type === 'rect' || type === 'polygon',
      supportsSides: type === 'polygon',
      cornerRadiusMm: uniform,
      cornerRadiusMixed: false,
      maxCornerRadiusMm: 100,
      sides: type === 'polygon' ? shape.sides : null,
    };
  };
  return {
    calls,
    getSelectionScreenBounds: () => ({ minX: 100, minY: 80, maxX: 240, maxY: 120, width: 140, height: 40, centerX: 170, centerY: 100 }),
    getShapePropsState: () => state(),
    beginShapePropsEdit: () => { calls.begins += 1; return true; },
    setShapeUniformCornerRadius: (mm) => {
      const n = shape.type === 'polygon' ? shape.sides : 4;
      shape.cornerRadii = new Array(n).fill(Math.max(0, mm));
      return state();
    },
    setShapeSides: (s) => {
      shape.sides = Math.max(3, Math.round(s));
      const u = (shape.cornerRadii && shape.cornerRadii.length) ? Math.max(...shape.cornerRadii) : 0;
      shape.cornerRadii = new Array(shape.sides).fill(u);
      return state();
    },
    endShapePropsEdit: () => { calls.ends += 1; return true; },
  };
};

describe('SHP-1 — polygon shape-properties popover', () => {
  let dom;
  beforeEach(() => { dom = buildHarness(); });

  test('renders Corner radius + Side Count controls and no popover for a non-shape selection', () => {
    const Modes = dom.window.Vectura.UI.ContextBarModes;
    // No renderer / no shape → null.
    expect(Modes.enterShapeProps({ renderer: null })).toBeNull();

    const shape = { type: 'polygon', sides: 6, cornerRadii: [0, 0, 0, 0, 0, 0] };
    const renderer = makeRenderer(shape);
    Modes.enterShapeProps({ renderer });
    const pop = dom.window.document.querySelector('.shape-props-popover');
    expect(pop).not.toBeNull();
    expect(pop.querySelector('.shape-props-corner-field')).not.toBeNull();
    expect(pop.querySelector('.shape-props-sides-slider')).not.toBeNull();
    expect(pop.querySelector('.shape-props-sides-field')).not.toBeNull();
    expect(pop.querySelector('.shape-props-title').textContent).toBe('Polygon');
  });

  test('Side Count stepper writes the persisted sides with one gesture bracket', () => {
    const shape = { type: 'polygon', sides: 6, cornerRadii: new Array(6).fill(0) };
    const renderer = makeRenderer(shape);
    const Modes = dom.window.Vectura.UI.ContextBarModes;
    Modes.enterShapeProps({ renderer });
    const pop = dom.window.document.querySelector('.shape-props-popover');
    const inc = pop.querySelectorAll('.shape-props-sides .shape-props-stepper')[1];
    inc.click();
    expect(shape.sides).toBe(7);
    expect(renderer.calls.begins).toBe(1);
    expect(renderer.calls.ends).toBe(1);
    // The sides field reflects the new persisted value.
    expect(pop.querySelector('.shape-props-sides-field').value).toBe('7');
  });

  test('Side Count slider drag is one gesture bracket; sides follow live', () => {
    const shape = { type: 'polygon', sides: 6, cornerRadii: new Array(6).fill(0) };
    const renderer = makeRenderer(shape);
    const Modes = dom.window.Vectura.UI.ContextBarModes;
    Modes.enterShapeProps({ renderer });
    const slider = dom.window.document.querySelector('.shape-props-sides-slider');
    fire(dom, slider, 'pointerdown');
    slider.value = '9';
    fire(dom, slider, 'input');
    slider.value = '11';
    fire(dom, slider, 'input');
    fire(dom, slider, 'pointerup');
    expect(shape.sides).toBe(11);
    expect(renderer.calls.begins).toBe(1);
    expect(renderer.calls.ends).toBe(1);
  });

  test('Corner radius field commit writes a uniform radius (document units → mm)', () => {
    const shape = { type: 'polygon', sides: 5, cornerRadii: new Array(5).fill(0) };
    const renderer = makeRenderer(shape);
    const Modes = dom.window.Vectura.UI.ContextBarModes;
    Modes.enterShapeProps({ renderer });
    const field = dom.window.document.querySelector('.shape-props-corner-field');
    field.value = '3';
    fire(dom, field, 'change');
    expect(shape.cornerRadii.every((r) => Math.abs(r - 3) < 1e-6)).toBe(true);
    expect(renderer.calls.begins).toBe(1);
    expect(renderer.calls.ends).toBe(1);
  });
});

describe('SHP-2 — rectangle popover', () => {
  let dom;
  beforeEach(() => { dom = buildHarness(); });

  test('rectangle shows Corner radius and no Side Count', () => {
    const shape = { type: 'rect', cornerRadii: [2, 2, 2, 2] };
    const renderer = makeRenderer(shape);
    const Modes = dom.window.Vectura.UI.ContextBarModes;
    Modes.enterShapeProps({ renderer });
    const pop = dom.window.document.querySelector('.shape-props-popover');
    expect(pop.querySelector('.shape-props-corner-field')).not.toBeNull();
    expect(pop.querySelector('.shape-props-sides-slider')).toBeNull();
    expect(pop.querySelector('.shape-props-title').textContent).toBe('Rectangle');
    expect(pop.querySelector('.shape-props-corner-field').value).toBe('2');
  });
});
