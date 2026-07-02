/*
 * Regression: the Type layer's Fill tab and the paint bucket tool must render
 * the SAME fill controls from ONE shared implementation
 * (Vectura.UI.FillControlSurface). Before this module existed the Type Fill tab
 * hand-rolled a 5-option subset; the surface exposes the full paint-bucket
 * variant grid + per-variant parameters and is configurable per host
 * (typeKey, exclude, id namespace, onEdit/onChange).
 *
 * Harness: load src/ui/ui-fill-panel.js (real FILL_CAPS) + src/ui/
 * fill-control-surface.js into JSDOM (mirrors layers-panel-dblclick-child-select),
 * mount against a params bag, and drive the rendered DOM.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '../..');

const buildHarness = () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="grid"></div><div id="controls"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const ctx = dom.getInternalVMContext();
  for (const rel of ['src/ui/ui-fill-panel.js', 'src/ui/fill-control-surface.js']) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, ctx, { filename: path.basename(rel) });
  }
  return dom;
};

describe('Vectura.UI.FillControlSurface (shared fill control surface)', () => {
  test('registers on window.Vectura.UI with the 12 paint-bucket fill types', () => {
    const dom = buildHarness();
    const FCS = dom.window.Vectura.UI.FillControlSurface;
    expect(FCS).toBeTruthy();
    expect(typeof FCS.mount).toBe('function');
    const values = FCS.FILL_TYPE_OPTIONS.map((o) => o.value);
    expect(values).toEqual([
      'none', 'hatch', 'wave', 'dots', 'contour', 'spiral',
      'radial', 'polygonal', 'truchet', 'maze', 'stripes', 'weave',
    ]);
  });

  test('renders one variant button per fill type and marks the active type', () => {
    const dom = buildHarness();
    const { document, Vectura } = dom.window;
    const grid = document.getElementById('grid');
    const controls = document.getElementById('controls');
    const params = { fillType: 'hatch', fillDensity: 21 };
    Vectura.UI.FillControlSurface.mount({
      gridEl: grid, controlsEl: controls, params, typeKey: 'fillType', idPrefix: 'txtfill',
    });
    const btns = grid.querySelectorAll('.pb-variant-btn');
    expect(btns.length).toBe(12);
    const active = grid.querySelector('.pb-variant-btn.active');
    expect(active.dataset.bucketVariant).toBe('hatch');
  });

  test('honours typeKey — clicking a variant writes that key and fires onEdit/onChange', () => {
    const dom = buildHarness();
    const { document, Vectura } = dom.window;
    const params = { fillType: 'hatch', fillDensity: 21 };
    let edits = 0; const changes = [];
    Vectura.UI.FillControlSurface.mount({
      gridEl: document.getElementById('grid'),
      controlsEl: document.getElementById('controls'),
      params, typeKey: 'fillType', idPrefix: 'txtfill',
      onEdit: () => { edits += 1; },
      onChange: (committed) => { changes.push(committed); },
    });
    const contourBtn = document.querySelector('.pb-variant-btn[data-bucket-variant="contour"]');
    contourBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    expect(params.fillType).toBe('contour');
    // Contour reads density as ring count — the variant switch seeds a legible default.
    expect(params.fillDensity).toBe(50);
    expect(edits).toBe(1);
    expect(changes).toEqual([true]);
  });

  test('exclude omits controls the host owns (text keeps its own angle/offset/inset)', () => {
    const dom = buildHarness();
    const { document, Vectura } = dom.window;
    const controls = document.getElementById('controls');
    const params = { fillType: 'hatch', fillDensity: 21, fillAngle: 0, fillPadding: 0 };
    Vectura.UI.FillControlSurface.mount({
      gridEl: document.getElementById('grid'),
      controlsEl: controls, params, typeKey: 'fillType', idPrefix: 'txtfill',
      exclude: ['fillAngle', 'fillPadding', 'fillShiftX', 'fillShiftY'],
    });
    // Density renders; the excluded angle/padding controls do not.
    expect(controls.querySelector('[data-ctrl="fillDensity"]')).toBeTruthy();
    expect(controls.querySelector('[data-ctrl="fillAngle"]')).toBeNull();
    expect(controls.querySelector('[data-ctrl="fillPadding"]')).toBeNull();
    // idPrefix namespaces the DOM ids so both panels can coexist.
    expect(controls.querySelector('#txtfill-fillDensity')).toBeTruthy();
  });

  test('a range control writes the stored param and previews (uncommitted) then commits', () => {
    const dom = buildHarness();
    const { document, Vectura, Event } = dom.window;
    const controls = document.getElementById('controls');
    const params = { fillType: 'hatch', fillDensity: 21 };
    const changes = [];
    Vectura.UI.FillControlSurface.mount({
      gridEl: document.getElementById('grid'),
      controlsEl: controls, params, typeKey: 'fillType', idPrefix: 'txtfill',
      exclude: ['fillAngle', 'fillPadding', 'fillShiftX', 'fillShiftY'],
      onChange: (committed) => { changes.push(committed); },
    });
    const slider = controls.querySelector('#txtfill-fillDensity');
    slider.value = '30';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(params.fillDensity).toBe(30);
    expect(changes[changes.length - 1]).toBe(false); // live preview
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    expect(changes[changes.length - 1]).toBe(true); // committed on release
  });
});
