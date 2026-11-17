/**
 * A23 — the scene's Shading slider (p.tone.darkness), driven through the real panel and engine.addLayer.
 *
 *  - a fresh scene (engine.addLayer('scene3d')) carries tone.darkness 50 (ALGO_DEFAULTS) and a v2 tone model;
 *  - the Tone section shows a "Shading" slider (aria "Shading darkness") at 50; committing it writes params.tone.darkness;
 *  - the composed scene's fill ink rises with the slider (0 < 50 < 100), and 50 composes exactly what a scene without the key does;
 *  - the value round-trips through exportState / importState; a payload without the key reopens at the default look;
 *  - under the legacy tone model the row is disabled with its reason.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true,
};

describe('Scene3D Shading slider (A23) — panel + engine', () => {
  let runtime; let window; let document; let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    window = runtime.window; document = runtime.document; V = window.Vectura;
    if (typeof window.getThemeToken !== 'function') window.getThemeToken = (_t, fallback) => fallback ?? '';
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
  const commitSlider = (input, value) => { input.value = String(value); fire(input, 'input'); fire(input, 'change'); };

  const newScene = () => {
    const engine = new V.VectorEngine();
    const gid = engine.addLayer('scene3d');
    const grp = engine.layers.find((l) => l.id === gid);
    return { engine, grp };
  };
  const mountPanel = (layer) => {
    const ui = { app: { pushHistory: vi.fn(), regen: vi.fn() }, storeLayerParams: vi.fn() };
    const container = document.createElement('div');
    document.body.appendChild(container);
    V.UI.Scene3DPanel.build(ui, layer, container);
    return container;
  };
  // Total drawn fill length of the composed scene (the ink), mm.
  const fillInk = (engine, grp) => {
    engine.computeAllDisplayGeometry();
    let len = 0;
    (grp.scenePaths || []).filter((p) => p && p.meta && p.meta.kind === 'sceneFill').forEach((p) => {
      for (let i = 1; i < p.length; i++) len += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    });
    return len;
  };

  test('a new scene carries the default (50) on the v2 model', () => {
    const { grp } = newScene();
    expect(grp.params.tone.model).toBe('v2');
    expect(grp.params.tone.darkness).toBe(V.SCENE3D_SURFACE_LOCK.SHADE.DEFAULT);
    expect(grp.params.tone.darkness).toBe(50);
  });

  test('the Tone section shows the Shading slider; committing it writes params.tone.darkness', () => {
    const { grp } = newScene();
    const container = mountPanel(grp);
    const input = container.querySelector('input.ctrl-slider[aria-label="Shading darkness"]');
    expect(input).toBeTruthy();
    expect(Number(input.value)).toBe(50);
    const row = input.closest('.vs3-row');
    expect(row.querySelector('.vs3-lbl').textContent).toBe('Shading');
    expect(row.classList.contains('is-disabled')).toBe(false);
    commitSlider(input, 80);
    expect(grp.params.tone.darkness).toBe(80);
  });

  test('composed ink rises with the slider, and 50 is exactly the scene without the key', () => {
    const { engine, grp } = newScene();
    const at = (dk) => {
      if (dk === undefined) delete grp.params.tone.darkness; else grp.params.tone.darkness = dk;
      return fillInk(engine, grp);
    };
    const none = at(undefined);
    const def = at(50);
    const lo = at(0);
    const hi = at(100);
    expect(def).toBe(none);
    expect(lo).toBeLessThan(def * 0.9);
    expect(hi).toBeGreaterThan(def * 1.02);
  }, 240000);

  test('the value round-trips through save / open; a payload without it opens at the default', () => {
    const { engine, grp } = newScene();
    grp.params.tone.darkness = 23;
    const state = JSON.parse(JSON.stringify(engine.exportState()));
    const e2 = new V.VectorEngine();
    e2.importState(state);
    const g2 = e2.layers.find((l) => l.type === 'scene3d' && l.isGroup);
    expect(g2.params.tone.darkness).toBe(23);
    const state2 = JSON.parse(JSON.stringify(engine.exportState()));
    state2.layers.filter((l) => l.type === 'scene3d').forEach((l) => { if (l.params && l.params.tone) delete l.params.tone.darkness; });
    const e3 = new V.VectorEngine();
    e3.importState(state2);
    const g3 = e3.layers.find((l) => l.type === 'scene3d' && l.isGroup);
    expect(V.Scene3D.SurfaceLock.toneDarknessOf(g3.params)).toBeUndefined();
  });

  test('legacy tone model: the row is disabled with its reason', () => {
    const { grp } = newScene();
    grp.params.tone.model = 'legacy';
    const container = mountPanel(grp);
    const input = container.querySelector('input.ctrl-slider[aria-label="Shading darkness"]');
    expect(input).toBeTruthy();
    const row = input.closest('.vs3-row');
    expect(row.classList.contains('is-disabled')).toBe(true);
    expect(row.getAttribute('title')).toMatch(/legacy/i);
  });
});
