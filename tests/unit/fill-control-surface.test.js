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

  test('section registration: a registered section renders for a host declaring its caps', () => {
    const dom = buildHarness();
    const { document, Vectura } = dom.window;
    const FCS = Vectura.UI.FillControlSurface;
    expect(typeof FCS.registerSection).toBe('function');
    const controls = document.getElementById('controls');
    const params = { fillMode: 'hatch', fillDensity: 21 };
    FCS.registerSection('penPicker', {
      caps: ['pens'],
      build: (ctx) => {
        const el = ctx.container.ownerDocument.createElement('div');
        el.className = 'pen-picker-body';
        el.textContent = 'pens';
        ctx.container.appendChild(el);
      },
    });
    const api = FCS.mount({
      gridEl: document.getElementById('grid'),
      controlsEl: controls, params, idPrefix: 'pb',
      caps: ['pens'],
    });
    const sectionEl = controls.querySelector('[data-fcs-section="penPicker"]');
    expect(sectionEl).toBeTruthy();
    expect(sectionEl.querySelector('.pen-picker-body')).toBeTruthy();
    // The stock control output stays a strict prefix — sections append after it.
    expect(controls.querySelector('[data-ctrl="fillDensity"]')).toBeTruthy();
    const density = controls.querySelector('[data-ctrl="fillDensity"]');
    expect(density.compareDocumentPosition(sectionEl) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(typeof api.refreshSections).toBe('function');
  });

  test('section registration: hosts that pass no caps render ZERO sections (opt-in gating)', () => {
    const dom = buildHarness();
    const { document, Vectura } = dom.window;
    const FCS = Vectura.UI.FillControlSurface;
    const controls = document.getElementById('controls');
    FCS.registerSection('penPicker', {
      caps: ['pens'],
      build: (ctx) => { ctx.container.textContent = 'pens'; },
    });
    FCS.registerSection('freebie', {
      // Even a caps-free section must not leak into a host that never opted in.
      build: (ctx) => { ctx.container.textContent = 'free'; },
    });
    FCS.mount({
      gridEl: document.getElementById('grid'),
      controlsEl: controls,
      params: { fillMode: 'hatch', fillDensity: 21 },
      idPrefix: 'pb',
    });
    expect(controls.querySelectorAll('[data-fcs-section]').length).toBe(0);
  });

  test('section registration: existing hosts stay bit-identical with vs without registry entries', () => {
    const dom = buildHarness();
    const { document, Vectura } = dom.window;
    const FCS = Vectura.UI.FillControlSurface;
    const controls = document.getElementById('controls');
    const mountPb = () => {
      FCS.mount({
        gridEl: document.getElementById('grid'),
        controlsEl: controls,
        params: { fillMode: 'hatch', fillDensity: 21, fillAngle: 45, fillPadding: 0 },
        idPrefix: 'pb',
      });
      return controls.innerHTML;
    };
    const before = mountPb(); // SECTIONS registry empty
    FCS.registerSection('penPicker', {
      caps: ['pens'],
      build: (ctx) => { ctx.container.textContent = 'pens'; },
    });
    const after = mountPb(); // registered, but host declares no caps
    expect(after).toBe(before);
  });

  test('section registration: EVERY section cap must be present in the host caps', () => {
    const dom = buildHarness();
    const { document, Vectura } = dom.window;
    const FCS = Vectura.UI.FillControlSurface;
    const controls = document.getElementById('controls');
    FCS.registerSection('strokeDivisions', {
      caps: ['pens', 'divisions'],
      build: (ctx) => { ctx.container.textContent = 'divisions'; },
    });
    FCS.mount({
      gridEl: document.getElementById('grid'),
      controlsEl: controls,
      params: { fillMode: 'hatch', fillDensity: 21 },
      idPrefix: 'pb',
      caps: ['pens'], // missing 'divisions'
    });
    expect(controls.querySelector('[data-fcs-section="strokeDivisions"]')).toBeNull();
    FCS.mount({
      gridEl: document.getElementById('grid'),
      controlsEl: controls,
      params: { fillMode: 'hatch', fillDensity: 21 },
      idPrefix: 'pb',
      caps: ['pens', 'divisions'],
    });
    expect(controls.querySelector('[data-fcs-section="strokeDivisions"]')).toBeTruthy();
  });

  test('section registration: opts.sections allowlists which registered sections may render', () => {
    const dom = buildHarness();
    const { document, Vectura } = dom.window;
    const FCS = Vectura.UI.FillControlSurface;
    const controls = document.getElementById('controls');
    FCS.registerSection('penPicker', { caps: ['pens'], build: (ctx) => { ctx.container.textContent = 'pens'; } });
    FCS.registerSection('toneResponse', { caps: ['pens'], build: (ctx) => { ctx.container.textContent = 'tone'; } });
    FCS.mount({
      gridEl: document.getElementById('grid'),
      controlsEl: controls,
      params: { fillMode: 'hatch', fillDensity: 21 },
      idPrefix: 'pb',
      caps: ['pens'],
      sections: ['toneResponse'],
    });
    expect(controls.querySelector('[data-fcs-section="penPicker"]')).toBeNull();
    expect(controls.querySelector('[data-fcs-section="toneResponse"]')).toBeTruthy();
  });

  test('section registration: sections render sorted by (order, registration index)', () => {
    const dom = buildHarness();
    const { document, Vectura } = dom.window;
    const FCS = Vectura.UI.FillControlSurface;
    const controls = document.getElementById('controls');
    FCS.registerSection('late', { order: 10, build: (ctx) => { ctx.container.textContent = 'late'; } });
    FCS.registerSection('early', { order: -5, build: (ctx) => { ctx.container.textContent = 'early'; } });
    FCS.registerSection('mid', { build: (ctx) => { ctx.container.textContent = 'mid'; } }); // order 0
    FCS.mount({
      gridEl: document.getElementById('grid'),
      controlsEl: controls,
      params: { fillMode: 'hatch', fillDensity: 21 },
      idPrefix: 'pb',
      caps: [],
      sections: ['late', 'early', 'mid'],
    });
    const names = Array.from(controls.querySelectorAll('[data-fcs-section]'))
      .map((el) => el.dataset.fcsSection);
    expect(names).toEqual(['early', 'mid', 'late']);
  });

  test('section registration: build ctx exposes working get/set, hooks, idPrefix, and an attached container', () => {
    const dom = buildHarness();
    const { document, Vectura } = dom.window;
    const FCS = Vectura.UI.FillControlSurface;
    const controls = document.getElementById('controls');
    const params = { fillMode: 'hatch', fillDensity: 21, penId: 'p1' };
    let edits = 0; const changes = [];
    let seen = null;
    FCS.registerSection('penPicker', {
      caps: ['pens'],
      build: (ctx) => {
        seen = ctx;
        expect(ctx.params).toBe(params);
        expect(ctx.get('penId')).toBe('p1');
        expect(ctx.idPrefix).toBe('pb');
        expect(controls.contains(ctx.container)).toBe(true);
        expect(typeof ctx.onEdit).toBe('function');
        expect(typeof ctx.refresh).toBe('function');
        ctx.set('penId', 'p2');
      },
    });
    FCS.mount({
      gridEl: document.getElementById('grid'),
      controlsEl: controls, params, idPrefix: 'pb',
      caps: ['pens'],
      onEdit: () => { edits += 1; },
      onChange: (committed) => { changes.push(committed); },
    });
    expect(seen).toBeTruthy();
    expect(params.penId).toBe('p2'); // set writes the caller-owned bag
    expect(changes[changes.length - 1]).toBe(true); // and reports the change
  });

  test('section registration: re-registering a name replaces it in place (no duplicates)', () => {
    const dom = buildHarness();
    const { document, Vectura } = dom.window;
    const FCS = Vectura.UI.FillControlSurface;
    const controls = document.getElementById('controls');
    FCS.registerSection('penPicker', { caps: ['pens'], build: (ctx) => { ctx.container.textContent = 'v1'; } });
    FCS.registerSection('other', { caps: ['pens'], order: 5, build: (ctx) => { ctx.container.textContent = 'other'; } });
    FCS.registerSection('penPicker', { caps: ['pens'], build: (ctx) => { ctx.container.textContent = 'v2'; } });
    FCS.mount({
      gridEl: document.getElementById('grid'),
      controlsEl: controls,
      params: { fillMode: 'hatch', fillDensity: 21 },
      idPrefix: 'pb',
      caps: ['pens'],
    });
    const nodes = controls.querySelectorAll('[data-fcs-section="penPicker"]');
    expect(nodes.length).toBe(1);
    expect(nodes[0].textContent).toBe('v2');
    // Replacement keeps the original registration position (same order key → first).
    const names = Array.from(controls.querySelectorAll('[data-fcs-section]'))
      .map((el) => el.dataset.fcsSection);
    expect(names).toEqual(['penPicker', 'other']);
  });

  test('section registration: refreshSections re-runs the section pass', () => {
    const dom = buildHarness();
    const { document, Vectura } = dom.window;
    const FCS = Vectura.UI.FillControlSurface;
    const controls = document.getElementById('controls');
    const params = { fillMode: 'hatch', fillDensity: 21, penId: 'p1' };
    FCS.registerSection('penPicker', {
      caps: ['pens'],
      build: (ctx) => { ctx.container.textContent = `pen:${ctx.get('penId')}`; },
    });
    const api = FCS.mount({
      gridEl: document.getElementById('grid'),
      controlsEl: controls, params, idPrefix: 'pb',
      caps: ['pens'],
    });
    expect(controls.querySelector('[data-fcs-section="penPicker"]').textContent).toBe('pen:p1');
    params.penId = 'p9';
    api.refreshSections();
    const nodes = controls.querySelectorAll('[data-fcs-section="penPicker"]');
    expect(nodes.length).toBe(1); // re-run replaces, never accumulates
    expect(nodes[0].textContent).toBe('pen:p9');
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
