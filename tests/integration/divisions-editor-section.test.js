/*
 * Phase 4A Inc-1 — Divisions editor section (src/ui/sections/divisions-section.js).
 *
 * The `divisions` section registers on the shared FillControlSurface and, when
 * mounted sectionsOnly against a live layer, authors layer.divisions and drives
 * a real recompute so divided fragments appear on the chosen pen. This test
 * runs the FULL app runtime (engine + division pass) so the write path is the
 * production one: section DOM → layer.divisions → ensureLayerDivisions →
 * computeAllDisplayGeometry (division pass at the optimizeLayers tail).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Phase 4A Inc-1 — Divisions editor section', () => {
  let runtime;
  let window;
  let document;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      useIndexHtml: true,
    });
    window = runtime.window;
    document = runtime.document;
  });

  afterAll(() => runtime.cleanup());

  const fire = (elem, type) => elem.dispatchEvent(new window.Event(type, { bubbles: true }));

  // Fresh app + a single layer whose geometry is a known 100mm horizontal line,
  // so the cycle length is deterministic and fragment pens are assertable.
  const setup = () => {
    const { Vectura } = window;
    const app = window.app = new Vectura.App();
    Vectura.SETTINGS.pens = [
      { id: 'p1', name: 'P1', color: '#111111', width: 0.3 },
      { id: 'p2', name: 'P2', color: '#22cc55', width: 0.5 },
    ];
    app.engine.layers = [];
    const id = app.engine.addLayer('wavetable');
    const layer = app.engine.getLayerById(id);
    layer.penId = 'p1';
    layer.params = layer.params || {};
    layer.params.curves = false;
    const line = [{ x: 20, y: 20 }, { x: 120, y: 20 }];
    line.meta = {};
    layer.paths = [line];

    const host = document.createElement('div');
    document.body.appendChild(host);
    let edits = 0;
    const origPush = app.pushHistory ? app.pushHistory.bind(app) : () => {};
    app.pushHistory = () => { edits += 1; origPush(); };

    const surface = Vectura.UI.FillControlSurface.mount({
      controlsEl: host,
      params: {},
      sectionsOnly: true,
      caps: ['divisions'],
      sections: ['divisions'],
      sectionContext: { app, engine: app.engine, getLayer: () => layer },
    });
    return { app, layer, host, surface, editsRef: () => edits };
  };

  test('registers a `divisions` section on FillControlSurface', () => {
    const FCS = window.Vectura.UI.FillControlSurface;
    expect(FCS).toBeTruthy();
    expect(typeof FCS.registerSection).toBe('function');
    const { host } = setup();
    expect(host.querySelector('[data-fcs-section="divisions"]')).toBeTruthy();
    expect(host.querySelector('[data-divisions-enable]')).toBeTruthy();
  });

  test('divisions OFF emits NO divided fragments (baseline)', () => {
    const { app, layer } = setup();
    app.engine.computeAllDisplayGeometry();
    // Disabled divisions leave dividedPaths cleared — the canvas draws the
    // undivided source, so the OFF path must not synthesize fragments.
    expect(layer.dividedPaths == null || layer.dividedPaths.length === 0).toBe(true);
  });

  test('enabling divides the stroke; fragments land on the chosen class pen', () => {
    const { app, layer, host, editsRef } = setup();

    // Enable.
    const enable = host.querySelector('[data-divisions-enable]');
    enable.checked = true;
    fire(enable, 'change');
    expect(layer.divisions.enabled).toBe(true);
    expect(Array.isArray(layer.dividedPaths)).toBe(true);
    expect(layer.dividedPaths.length).toBeGreaterThan(1);
    expect(editsRef()).toBeGreaterThan(0);

    // The back-filled default cycle's first (non-gap) class inherits the layer
    // pen (p1) — no fragment carries an explicit p2 yet.
    expect(layer.dividedPaths.some((f) => f.meta && f.meta.penId === 'p2')).toBe(false);

    // Assign the first class to pen p2 via the row's shared pen Select.
    const firstRow = host.querySelector('[data-division-row="0"]');
    const penSel = firstRow.querySelector('[data-division-pen] select');
    expect(penSel).toBeTruthy();
    penSel.value = 'p2';
    fire(penSel, 'change');
    expect(layer.divisions.classes[0].penId).toBe('p2');
    // Recompute re-cut the stroke: fragments now plot on p2.
    expect(layer.dividedPaths.some((f) => f.meta && f.meta.penId === 'p2')).toBe(true);
  });

  test('add / edit length / reorder / remove all rewrite layer.divisions + recut', () => {
    const { app, layer, host } = setup();
    host.querySelector('[data-divisions-enable]').checked = true;
    fire(host.querySelector('[data-divisions-enable]'), 'change');
    const before = layer.divisions.classes.length; // default cycle = 2 classes

    // Add a class.
    host.querySelector('[data-divisions-add]').click();
    expect(layer.divisions.classes.length).toBe(before + 1);

    // Edit the new class length (doc units == mm in metric).
    const rows = host.querySelectorAll('[data-division-row]');
    const lastLen = rows[rows.length - 1].querySelector('[data-division-len]');
    lastLen.value = '7';
    fire(lastLen, 'change');
    expect(layer.divisions.classes[before].lenMm).toBeCloseTo(7, 5);

    // Reorder: move row 0 down, swapping the first two classes.
    const firstLen0 = layer.divisions.classes[0].lenMm;
    const secondLen0 = layer.divisions.classes[1].lenMm;
    host.querySelector('[data-division-row="0"] [data-division-down]').click();
    expect(layer.divisions.classes[0].lenMm).toBeCloseTo(secondLen0, 5);
    expect(layer.divisions.classes[1].lenMm).toBeCloseTo(firstLen0, 5);

    // Remove a class.
    const afterAdd = layer.divisions.classes.length;
    host.querySelector('[data-division-row="0"] [data-division-remove]').click();
    expect(layer.divisions.classes.length).toBe(afterAdd - 1);

    // A recut still produced fragments the canvas will draw.
    app.engine.computeAllDisplayGeometry();
    expect(Array.isArray(layer.dividedPaths)).toBe(true);
  });
});
