/*
 * Regression: the Type layer's Fill tab and the paint bucket tool must render
 * the SAME fill controls from ONE shared implementation
 * (Vectura.UI.FillControlSurface). Before this module existed the Type Fill tab
 * hand-rolled a 5-option subset; the surface exposes the full paint-bucket
 * variant grid + per-variant parameters and is configurable per host
 * (typeKey, exclude, id namespace, onEdit/onChange).
 *
 * Harness: load src/ui/ui-fill-panel.js (real FILL_CAPS) + the shared
 * UI.Slider component + src/ui/fill-control-surface.js into JSDOM (mirrors
 * layers-panel-dblclick-child-select), mount against a params bag, and drive
 * the rendered DOM. Range controls render through UI.Slider since the
 * ui-consistency migration — the surface no longer hand-rolls sliders.
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
  for (const rel of ['src/ui/ui-fill-panel.js', 'src/ui/components/slider.js', 'src/ui/fill-control-surface.js']) {
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

  test('range controls render through the shared UI.Slider component', () => {
    const dom = buildHarness();
    const { document, Vectura } = dom.window;
    const controls = document.getElementById('controls');
    const params = { fillType: 'hatch', fillDensity: 21 };
    Vectura.UI.FillControlSurface.mount({
      gridEl: document.getElementById('grid'),
      controlsEl: controls, params, typeKey: 'fillType', idPrefix: 'txtfill',
    });
    const row = controls.querySelector('[data-ctrl="fillDensity"]');
    // UI.Slider markup: .slider-row > .sld-fx-wrap > input.ctrl-slider + chip.
    const sliderRow = row.querySelector('.slider-row');
    expect(sliderRow).toBeTruthy();
    const input = sliderRow.querySelector('.sld-fx-wrap > input.ctrl-slider');
    expect(input).toBeTruthy();
    expect(input.id).toBe('txtfill-fillDensity');
    const chip = sliderRow.querySelector('.slider-val');
    expect(chip).toBeTruthy();
    expect(chip.id).toBe('txtfill-fillDensity-chip');
    // The wrap keeps the paint-bucket layout class + the --fill gradient var
    // is initialised at construction (hidden-tab safe — no layout() needed).
    const wrap = sliderRow.querySelector('.sld-fx-wrap');
    expect(wrap.classList.contains('paint-bucket-slider-wrap')).toBe(true);
    expect(wrap.style.getPropertyValue('--fill')).not.toBe('');
  });

  test('onEdit fires once per drag interaction, before the first write', () => {
    const dom = buildHarness();
    const { document, Vectura, Event } = dom.window;
    const controls = document.getElementById('controls');
    const params = { fillType: 'hatch', fillDensity: 21 };
    const log = [];
    Vectura.UI.FillControlSurface.mount({
      gridEl: document.getElementById('grid'),
      controlsEl: controls, params, typeKey: 'fillType', idPrefix: 'txtfill',
      onEdit: () => log.push(['edit', params.fillDensity]),
      onChange: (committed) => log.push(['change', committed]),
    });
    const slider = controls.querySelector('#txtfill-fillDensity');
    slider.value = '30';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.value = '35';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    // ONE snapshot, taken while the param still held its pre-drag value.
    expect(log.filter(([k]) => k === 'edit')).toEqual([['edit', 21]]);
    expect(log[0][0]).toBe('edit');
    expect(log[log.length - 1]).toEqual(['change', true]);
  });

  test('chip edit clamps to range and commits through onEdit + committed onChange', () => {
    const dom = buildHarness();
    const { document, Vectura, Event } = dom.window;
    const controls = document.getElementById('controls');
    const params = { fillType: 'hatch', fillDensity: 21 };
    let edits = 0; const changes = [];
    Vectura.UI.FillControlSurface.mount({
      gridEl: document.getElementById('grid'),
      controlsEl: controls, params, typeKey: 'fillType', idPrefix: 'txtfill',
      onEdit: () => { edits += 1; },
      onChange: (committed) => { changes.push(committed); },
    });
    const chip = controls.querySelector('#txtfill-fillDensity-chip');
    chip.value = '999'; // above the hatch max of 50
    chip.dispatchEvent(new Event('blur', { bubbles: true }));
    expect(params.fillDensity).toBe(50);
    expect(edits).toBe(1);
    expect(changes[changes.length - 1]).toBe(true);
  });

  test('defaults map wires double-click reset (fires snapshot + committed change)', () => {
    const dom = buildHarness();
    const { document, Vectura, Event } = dom.window;
    const controls = document.getElementById('controls');
    const params = { fillType: 'hatch', fillDensity: 30 };
    let edits = 0; const changes = [];
    Vectura.UI.FillControlSurface.mount({
      gridEl: document.getElementById('grid'),
      controlsEl: controls, params, typeKey: 'fillType', idPrefix: 'pb',
      defaults: { fillDensity: 1 },
      onEdit: () => { edits += 1; },
      onChange: (committed) => { changes.push(committed); },
    });
    const slider = controls.querySelector('#pb-fillDensity');
    slider.dispatchEvent(new Event('dblclick', { bubbles: true, cancelable: true }));
    expect(params.fillDensity).toBe(1);
    expect(edits).toBe(1);
    expect(changes[changes.length - 1]).toBe(true);
  });

  test('distance params stay canonical mm in the bag and show a unit chip', () => {
    const dom = buildHarness();
    const { document, Vectura, Event } = dom.window;
    const controls = document.getElementById('controls');
    // Metric doc (no Vectura.SETTINGS in harness → defaults to mm 1:1).
    const params = { fillType: 'hatch', fillDensity: 21, fillPadding: 2 };
    Vectura.UI.FillControlSurface.mount({
      gridEl: document.getElementById('grid'),
      controlsEl: controls, params, typeKey: 'fillType', idPrefix: 'txtfill',
    });
    const chip = controls.querySelector('#txtfill-fillPadding-chip');
    expect(chip.value).toBe('2mm');
    const slider = controls.querySelector('#txtfill-fillPadding');
    slider.value = '3.5';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(params.fillPadding).toBe(3.5);
    expect(chip.value).toBe('3.5mm');
  });
});
