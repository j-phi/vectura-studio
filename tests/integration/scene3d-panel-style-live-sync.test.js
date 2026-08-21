const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Object3d docked panel — Style page live-signature sync.
 *
 * RGR — the product owner reported the left docked panel and the ctxbar
 * Style flyout showing different values for the same object. The Object
 * page already had a narrow fix for exactly this (`syncPrimitive`, keyed on
 * `params.primitive` only, fired on `pointerenter`/`focusin`), but the Style
 * page had NO equivalent: a write from `renderer.setSceneObjectStyle`
 * (what the ctxbar Style flyout calls) landed on `child.params.style`
 * without ever re-rendering the docked panel, so it kept showing stale
 * values until the layer was reselected.
 *
 * This widens the same mechanism into a live-signature check covering the
 * Style page (mapper / penId / toneLaw / fillDensity / fillAngle / the
 * fill-line sub-params that page also renders), while proving:
 *   - it does not fire when nothing changed (anti-thrash guard, via a
 *     render-count data attribute stamped on the page each render),
 *   - it does not clobber a control that currently holds focus (the main
 *     risk of widening a pointerenter/focusin trigger),
 *   - the existing Object-page primitive resync keeps working,
 *   - it does not recurse (one trigger → at most one extra render).
 */

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Object3d docked panel — Style page live sync', () => {
  let runtime, window, document, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
  });

  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const host = () => document.getElementById('dynamic-controls');
  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
  const panelRoot = () => host().querySelector('.vs3-panel');
  const stylePage = () => host().querySelector('.vs3-page[data-page="style"]');
  const objectPage = () => host().querySelector('.vs3-page[data-page="object"]');
  const styleTabBtn = () => host().querySelector('.tab-btn[data-value="style"]');
  const byAria = (label) => host().querySelector(`[aria-label="${label}"]`);
  const styleRenderCount = () => Number(stylePage().dataset.renderCount || '0');

  const freshScene = () => {
    app.engine.layers = app.engine.layers.filter(
      (l) => !String(l.type).startsWith('scene') && l.type !== 'object3d' && l.type !== 'booleanGroup3d',
    );
    return app.engine.addLayer('scene3d');
  };

  // Add a box, open its inspector, and switch to the Style tab.
  const openObjectOnStyleTab = () => {
    const gid = freshScene();
    const oid = app.engine.addObjectToScene(gid, 'box');
    const child = app.engine.getLayerById(oid);
    child.params.style = { penId: null, mapper: 'wireframe', params: {} };
    app.engine.activeLayerId = oid;
    app.ui.buildControls();
    fire(styleTabBtn(), 'click');
    return { gid, oid, child };
  };

  test('a ctxbar-style write (mapper / penId / toneLaw / fillDensity / fillAngle) shows up on pointerenter without reselecting the layer', () => {
    const { gid, oid, child } = openObjectOnStyleTab();
    expect(byAria('Fill type').value).toBe('wireframe');
    expect(byAria('Style pen').value).toBe('');

    const before = styleRenderCount();

    // Simulate what the ctxbar Style flyout does: renderer.setSceneObjectStyle.
    expect(app.renderer.setSceneObjectStyle(gid, [oid], {
      penId: 'pen-2',
      mapper: 'hatch',
      params: { toneLaw: 'etfKang', fillDensity: 88, fillAngle: 137 },
    })).toBe(true);

    // The panel has not been touched yet — still shows the OLD values.
    expect(byAria('Fill type').value).toBe('wireframe');

    // Interacting with the panel re-checks the live signature.
    fire(panelRoot(), 'pointerenter');

    expect(styleRenderCount()).toBe(before + 1);
    expect(byAria('Fill type').value).toBe('hatch');
    expect(byAria('Style pen').value).toBe('pen-2');
    expect(byAria('Fill style').value).toBe('etfKang');
    expect(byAria('Fill density').value).toBe('88');
    expect(child.params.style.params.fillAngle).toBe(137);
  });

  test('no render happens when nothing changed (anti-thrash guard)', () => {
    openObjectOnStyleTab();
    const before = styleRenderCount();

    fire(panelRoot(), 'pointerenter');
    fire(panelRoot(), 'focusin');
    fire(panelRoot(), 'pointerenter');

    expect(styleRenderCount()).toBe(before);
  });

  test('a single external write triggers exactly one render, not a cascade (no recursion)', () => {
    const { gid, oid } = openObjectOnStyleTab();
    const before = styleRenderCount();

    app.renderer.setSceneObjectStyle(gid, [oid], { mapper: 'crosshatch', params: { fillDensity: 40 } });
    fire(panelRoot(), 'pointerenter');

    // Exactly ONE additional render — if the render itself re-triggered the
    // sync (recursion), or the sync somehow fired twice, this would be +2.
    expect(styleRenderCount()).toBe(before + 1);
  });

  test('a re-render does not fire while a control on the Style page is focused mid-edit', () => {
    const { gid, oid } = openObjectOnStyleTab();
    const penSelect = byAria('Style pen');
    penSelect.focus();
    expect(document.activeElement).toBe(penSelect);
    const before = styleRenderCount();

    app.renderer.setSceneObjectStyle(gid, [oid], { mapper: 'hatch', params: { fillDensity: 77 } });
    // A stray pointerenter while the page holds focus (e.g. the pointer
    // dipping outside the panel bounds mid-drag and re-entering) must not
    // blow away the in-progress edit.
    fire(panelRoot(), 'pointerenter');

    expect(styleRenderCount()).toBe(before);
    // The stale value is still what's on screen — nothing was clobbered, and
    // nothing was silently lost either (focus is still where it was).
    expect(document.activeElement).toBe(penSelect);
  });

  test('the existing Object-page primitive resync keeps working', () => {
    const gid = freshScene();
    const oid = app.engine.addObjectToScene(gid, 'box');
    app.engine.activeLayerId = oid;
    app.ui.buildControls();
    expect(byAria('box width')).toBeTruthy();

    app.renderer.setSceneObjectPrimitive(gid, [oid], 'sphere');
    fire(panelRoot(), 'pointerenter');

    expect(byAria('sphere radius')).toBeTruthy();
    expect(host().querySelector('[aria-label="box width"]')).toBeNull();
  });

  test('switching to the Style tab always renders fresh, independent of the drift check', () => {
    const gid = freshScene();
    const oid = app.engine.addObjectToScene(gid, 'box');
    const child = app.engine.getLayerById(oid);
    child.params.style = { penId: null, mapper: 'wireframe', params: {} };
    app.engine.activeLayerId = oid;
    app.ui.buildControls();

    fire(styleTabBtn(), 'click');
    expect(byAria('Fill type').value).toBe('wireframe');

    app.renderer.setSceneObjectStyle(gid, [oid], { mapper: 'stipple', params: {} });
    // Leaving and re-entering the tab (Object → Style) is a normal renderStyle
    // call, unconditional on the drift check — must not regress either.
    const objTabBtn = host().querySelector('.tab-btn[data-value="object"]');
    fire(objTabBtn, 'click');
    fire(styleTabBtn(), 'click');
    expect(byAria('Fill type').value).toBe('stipple');
  });
});
