const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Geometry labels tell the truth — driven through the REAL object inspector.
 *
 * RGR — the inspector's torus row said "Diameter" and showed `sx`, but the
 * chart rings the torus at 0.75·sx and adds a 0.28·min(sy,sz) tube, so an sx-80
 * torus is 125 mm across. The unit suite pins the conversion table; this suite
 * pins that the PANEL actually uses it: the slider a user sees reads the true
 * world extent, and typing a number into it produces exactly that extent.
 *
 * The change is display-only, so the last test proves the composed scene ink of
 * an untouched object is identical before and after the panel is built.
 */

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Scene3D object inspector — honest Geometry labels', () => {
  let runtime, window, document, app, V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    V = window.Vectura;
    window.app = new V.App();
    app = window.app;
  });

  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const host = () => document.getElementById('dynamic-controls');
  const rowLabels = () => Array.from(host().querySelectorAll('.vs3-lbl')).map((l) => l.textContent.trim());
  const sliderFor = (aria) => host().querySelector(`input.ctrl-slider[aria-label="${aria}"]`);

  // Largest axis-aligned extent of the untransformed mesh the layer's STORED
  // params build — the ground truth every label is measured against.
  const extentOf = (layer) => {
    const mesh = V.Scene3D.Scene.buildPrimitiveMesh(
      { primitive: layer.params.primitive, params: layer.params.params }, 1,
    );
    const lo = { x: Infinity, y: Infinity, z: Infinity };
    const hi = { x: -Infinity, y: -Infinity, z: -Infinity };
    mesh.vertices.forEach((vt) => {
      ['x', 'y', 'z'].forEach((a) => { if (vt[a] < lo[a]) lo[a] = vt[a]; if (vt[a] > hi[a]) hi[a] = vt[a]; });
    });
    return Math.max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z);
  };

  // Each case starts from an empty document: a scene group left behind from an
  // earlier case would be re-composed by every later buildControls().
  const resetDoc = () => { app.engine.layers.length = 0; app.engine.activeLayerId = null; };

  // Add a scene group + one object3d child of `primitive`, select it, build.
  const openObject = (primitive, params) => {
    resetDoc();
    const gid = app.engine.addLayer('scene3d');
    const child = app.engine.getLayerChildren(gid).find((l) => l.type === 'object3d');
    child.params.primitive = primitive;
    child.params.params = { ...V.Scene3D.Params.PRIMITIVE_CREATE_DEFAULTS[primitive], ...(params || {}) };
    app.engine.activeLayerId = child.id;
    app.ui.buildControls();
    return { gid, child };
  };

  const drive = (input, value) => {
    input.value = String(value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
  };

  test('the torus Diameter row shows the real world extent, not sx', () => {
    const { child } = openObject('torus', { sx: 80, sy: 9, sz: 9 });
    const dia = sliderFor('torus diameter');
    expect(dia).toBeTruthy();
    expect(child.params.params.sx).toBe(80);          // stored value untouched
    expect(Number(dia.value)).toBeCloseTo(125, 0);    // …but the row reads 125
    expect(Number(dia.value)).toBeCloseTo(extentOf(child), 0);
  });

  test('typing a Diameter of 125 makes the torus exactly 125 mm across', () => {
    const { child } = openObject('torus', { sx: 34, sy: 9, sz: 9 });
    const dia = sliderFor('torus diameter');
    drive(dia, 125);
    expect(extentOf(child)).toBeCloseTo(125, 3);
    // The stored param is the internal one — the label is what changed, not it.
    expect(child.params.params.sx).toBeCloseTo(79.973, 2);
    expect(child.params.params.sx).not.toBe(125);
  });

  test('the torus Thickness row is the tube diameter and re-reads Diameter after an edit', () => {
    const { child } = openObject('torus', { sx: 34, sy: 9, sz: 9 });
    expect(Number(sliderFor('torus diameter').value)).toBeCloseTo(56.04, 1);
    drive(sliderFor('torus thickness'), 20);
    // 20 mm of tube: sy/sz solve 2*max(1, 0.28*s) = 20.
    expect(child.params.params.sy).toBeCloseTo(10 / 0.28, 6);
    expect(child.params.params.sz).toBeCloseTo(10 / 0.28, 6);
    // The Diameter row is COUPLED to the tube — it must not be left stale.
    expect(Number(sliderFor('torus diameter').value)).toBeCloseTo(2 * (0.75 * 34) + 20, 1);
  });

  test('half-extent rows (cylinder/cone/pyramid/capsule) now read the full size', () => {
    const checks = [
      ['cylinder', 'cylinder height'],
      ['cone', 'cone height'],
      ['pyramid', 'pyramid base'],
      ['pyramid', 'pyramid height'],
      ['capsule', 'capsule length'],
    ];
    const bad = [];
    checks.forEach(([prim, aria]) => {
      const { child } = openObject(prim);
      const el = sliderFor(aria);
      if (!el) { bad.push(`${aria} missing`); return; }
      const key = aria.endsWith('base') ? 'sx' : 'sy';
      const stored = child.params.params[key];
      if (Math.abs(Number(el.value) - stored) < 1e-6) bad.push(`${aria} still shows the raw half-extent ${stored}`);
      // Editing it lands the size that was typed.
      drive(el, 60);
      const built = V.Scene3D.Scene.buildPrimitiveMesh(
        { primitive: prim, params: child.params.params }, 1,
      );
      const axis = aria.endsWith('base') ? 'x' : 'y';
      const vals = built.vertices.map((vt) => vt[axis]);
      const span = Math.max(...vals) - Math.min(...vals);
      if (Math.abs(span - 60) > 0.05) bad.push(`${aria}: typed 60, mesh is ${span.toFixed(3)}`);
    });
    expect(bad).toEqual([]);
  });

  test('ambiguous ellipsoid / superellipsoid axes are named as the radii they are', () => {
    openObject('ellipsoid');
    expect(rowLabels()).toEqual(expect.arrayContaining(['Radius X', 'Radius Y', 'Radius Z']));
    expect(sliderFor('ellipsoid radius x')).toBeTruthy();
    openObject('superellipsoid');
    expect(rowLabels()).toEqual(expect.arrayContaining(['Radius X', 'Radius Y', 'Radius Z']));
  });

  test('honest rows are untouched: box Width and sphere Radius still read the param', () => {
    const { child: box } = openObject('box', { sx: 40, sy: 50, sz: 60 });
    expect(Number(sliderFor('box width').value)).toBe(40);
    expect(Number(sliderFor('box height').value)).toBe(50);
    const { child: sph } = openObject('sphere', { radius: 25 });
    expect(Number(sliderFor('sphere radius').value)).toBe(25);
    expect(sph.params.params.radius).toBe(25);
    expect(box.params.params.sx).toBe(40);
  });

  test('the torus-knot rows name what they measure (Span / Thickness)', () => {
    const { child } = openObject('torusKnot', { sx: 30, sy: 6, sz: 6 });
    expect(rowLabels()).toEqual(expect.arrayContaining(['Span', 'Thickness']));
    const span = sliderFor('torusKnot span');
    expect(Number(span.value)).toBeCloseTo(extentOf(child), 0);
    expect(child.params.params.sx).toBe(30);
  });

  // ── The hard constraint ──────────────────────────────────────────────────
  test('building the inspector changes NEITHER the stored params nor the composed ink', () => {
    resetDoc();
    const gid = app.engine.addLayer('scene3d');
    const child = app.engine.getLayerChildren(gid).find((l) => l.type === 'object3d');
    child.params.primitive = 'torus';
    child.params.params = { sx: 34, sy: 9, sz: 9, detail: 24 };
    const group = app.engine.getLayerById(gid);

    const composed = () => {
      app.engine.layers.forEach((l) => { if (!l.isGroup) app.engine.generate(l.id); });
      app.engine.computeAllDisplayGeometry();
      return JSON.stringify(group.scenePaths);
    };
    const paramsSnapshot = JSON.stringify(child.params);
    const before = composed();
    expect(before.length).toBeGreaterThan(100);

    app.engine.activeLayerId = child.id;
    app.ui.buildControls();          // the whole display layer runs here

    expect(JSON.stringify(child.params)).toBe(paramsSnapshot);
    expect(composed()).toBe(before);
  });
});
