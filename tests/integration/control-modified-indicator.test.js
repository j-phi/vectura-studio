const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * "Moved off its default" marker.
 *
 * A parameter can be set without the user ever touching it: the factory preset carries
 * it, a mode cascade seeds it when a checkbox is ticked, or it arrived inside a saved
 * document. Until now nothing on screen distinguished a value somebody chose from a
 * value that was chosen FOR them — which is why an Occlusion Bias of 1.5, seeded
 * silently by enabling "Lines as Planes", could put hooks on every border with no
 * reasonable way for anyone to suspect it.
 *
 * The marker's whole job is to make that case visible, so that is the case tested
 * hardest: a control the user has never touched, changed behind their back by a
 * cascade, must be flagged — and clicking the flag must put it back.
 */
describe('Control panel — parameters moved off their default are marked', () => {
  let runtime, window, document, app;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
  });
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  const rowFor = (label) => {
    for (const el of document.querySelectorAll('.control-label')) {
      if (el.textContent.trim().startsWith(label)) return el.closest('div');
    }
    return null;
  };
  const markerFor = (label) => {
    const row = rowFor(label);
    return row ? row.querySelector('.control-modified') : null;
  };

  test('a brand-new layer has nothing marked — factory state is not "modified"', () => {
    app.engine.addLayer('rasterPlane');
    app.ui.buildControls();
    const marks = document.querySelectorAll('.control-modified');
    const labels = Array.from(marks).map((m) => m.closest('div')?.querySelector('.control-label')?.textContent.trim());
    expect(marks.length, `a fresh layer should sit at its defaults, but marked: ${labels.join(', ')}`).toBe(0);
  });

  test('a value the USER changes is marked, and the marker resets it', () => {
    app.engine.addLayer('rasterPlane');
    const layer = app.engine.getActiveLayer();
    const factory = window.Vectura.factoryParams('rasterPlane');

    layer.params.amplitude = factory.amplitude + 25;
    app.ui.buildControls();

    const mark = markerFor('Amplitude');
    expect(mark, 'a changed Amplitude must be marked').toBeTruthy();

    mark.dispatchEvent(new window.Event('click', { bubbles: true }));
    expect(layer.params.amplitude, 'clicking the marker restores the default').toBe(factory.amplitude);

    app.ui.buildControls();
    expect(markerFor('Amplitude'), 'and the marker goes away once it is back').toBeNull();
  });

  test('a value a CASCADE sets behind the user\'s back is marked — the case that hid the bug', () => {
    // Nobody touches See-Through here. Ticking "Lines as Planes" moves it, along with
    // Base Height and Plane Width. Before the marker existed, the only way to discover
    // that was to already suspect it.
    app.engine.addLayer('rasterPlane');
    const layer = app.engine.getActiveLayer();
    layer.params.mode = 'lines';
    app.ui.buildControls();

    let cb = null;
    for (const box of document.querySelectorAll('input[type="checkbox"]')) {
      let n = box;
      for (let i = 0; i < 5 && n; i++) {
        n = n.parentElement;
        const lbl = n && n.querySelector && n.querySelector('.control-label');
        if (lbl && lbl.textContent.trim().startsWith('Lines as Planes')) { cb = box; break; }
      }
      if (cb) break;
    }
    expect(cb).toBeTruthy();
    cb.checked = true;
    cb.dispatchEvent(new window.Event('change'));
    app.ui.buildControls();

    const factory = window.Vectura.factoryParams('rasterPlane');
    // Sanity: the cascade really did move these away from factory state.
    expect(layer.params.seeThrough).not.toBe(factory.seeThrough);
    expect(layer.params.baseHeight).not.toBe(factory.baseHeight);

    expect(markerFor('See-Through'), 'See-Through was changed by the cascade — say so').toBeTruthy();
    expect(markerFor('Base Height'), 'Base Height was changed by the cascade — say so').toBeTruthy();
  });

  test('per-layer identity is never marked (seed, position, scale are not a "look")', () => {
    app.engine.addLayer('flowfield');
    const layer = app.engine.getActiveLayer();
    layer.params.seed = 12345;
    layer.params.posX = 40;
    app.ui.buildControls();
    for (const m of document.querySelectorAll('.control-modified')) {
      const label = m.closest('div')?.querySelector('.control-label')?.textContent.trim() || '';
      expect(label.toLowerCase()).not.toContain('seed');
    }
  });
});
