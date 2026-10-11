/**
 * TUX-025: touch-sized, separated 3D rotation gizmo (orbit pad, yaw, pitch, roll).
 * Mouse and pen keep the old geometry and 9 px radii. Touch geometry keys on body.touch-ui or a
 * coarse pointer. Touch radii (22 px) key on pointerType === 'touch'.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('TUX-025: 3D rotation gizmo touch geometry and hit radii', () => {
  let runtime;
  let V;
  let win;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    V = runtime.window.Vectura;
    win = runtime.window;
  });
  afterAll(() => runtime.cleanup());
  afterEach(() => {
    win.document.body.classList.remove('touch-ui');
    win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  });

  const setTouch = (on) => {
    win.document.body.classList.toggle('touch-ui', on);
    win.matchMedia = () => ({ matches: on, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  };

  const buildScene = () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneTree();
    engine.computeAllDisplayGeometry();
    const renderer = new V.Renderer('main-canvas', engine);
    renderer.app = { pushHistory: () => {}, render: () => {}, history: [{}, {}] };
    renderer.activeTool = 'select';
    renderer.ready = true;
    renderer.setSelection([gid], gid);
    renderer.setSceneSelection(null);
    return { engine, renderer, layer: engine.getLayerById(gid), bounds: null };
  };

  const buildPoly = () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const id = engine.addLayer('polyhedron');
    const renderer = new V.Renderer('main-canvas', engine);
    renderer.app = { pushHistory: () => {}, render: () => {}, history: [{}, {}] };
    renderer.activeTool = 'select';
    renderer.ready = true;
    renderer.setSelection([id], id);
    const layer = engine.layers.find((l) => l.id === id);
    return { engine, renderer, layer, bounds: renderer.getSelectionBounds([layer]) };
  };

  const fixtures = [['scene3d', buildScene], ['polyhedron', buildPoly]];

  const control = (f) => f.renderer.get3DRotationControl(f.layer, f.bounds);
  const scr = (f, p) => f.renderer.worldToScreen(p.x, p.y);
  const targets = (f) => {
    const c = control(f);
    const t = { C: scr(f, c.center), Y: scr(f, c.yawMarker), P: scr(f, c.pitchMarker) };
    if (c.rollHandle) t.R = scr(f, c.rollHandle);
    return t;
  };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const setRot = (f, patch) => {
    const spec = f.renderer.get3DRotationSpec(f.layer);
    f.renderer._write3DRotation(f.layer, spec, patch);
    return spec;
  };
  const hitAt = (f, p, pointerType) => f.renderer.hit3DRotationControl(p.x, p.y, f.layer, f.bounds, pointerType);

  const grid = (f) => {
    const spec = f.renderer.get3DRotationSpec(f.layer);
    const pitches = [spec.pitchMin, (spec.pitchMin + spec.pitchMax) / 2, spec.pitchMax];
    const rows = [];
    for (const yaw of [0, 90, 180, 270]) for (const pitch of pitches) for (const roll of [0, 90, 180, 270]) rows.push({ yaw, pitch, roll });
    return rows;
  };

  describe.each(fixtures)('%s', (name, build) => {
    test('a) touch targets are pairwise >= 28 px apart in every state', () => {
      setTouch(true);
      const f = build();
      let worst = Infinity;
      let worstAt = '';
      for (const s of grid(f)) {
        setRot(f, { yaw: s.yaw, pitch: s.pitch, roll: s.roll });
        const t = targets(f);
        const keys = Object.keys(t);
        for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
          const d = dist(t[keys[i]], t[keys[j]]);
          if (d < worst) { worst = d; worstAt = `${keys[i]}-${keys[j]} yaw=${s.yaw} pitch=${s.pitch} roll=${s.roll}`; }
        }
      }
      expect({ worst: Math.round(worst * 10) / 10, worstAt }).toEqual({ worst: expect.any(Number), worstAt: expect.any(String) });
      expect(worst, `separation expected >=28, got ${worst.toFixed(1)} px at ${worstAt}`).toBeGreaterThanOrEqual(28);
    });

    test('b) 12 px samples in 8 directions arm that marker; c) 18 px away samples arm it', () => {
      setTouch(true);
      const f = build();
      for (const s of grid(f)) {
        setRot(f, { yaw: s.yaw, pitch: s.pitch, roll: s.roll });
        const t = targets(f);
        const types = { Y: 'yaw', P: 'pitch', R: 'roll' };
        for (const k of Object.keys(types)) {
          if (!t[k]) continue;
          for (let a = 0; a < 8; a++) {
            const ang = (a * Math.PI) / 4;
            const p = { x: t[k].x + 12 * Math.cos(ang), y: t[k].y + 12 * Math.sin(ang) };
            const h = hitAt(f, p, 'touch');
            expect(h && h.type, `${k} 12px dir ${a} yaw=${s.yaw} pitch=${s.pitch}`).toBe(types[k]);
          }
          // 18 px directly away from the nearest other target.
          let near = null;
          for (const o of Object.keys(t)) if (o !== k && (!near || dist(t[k], t[o]) < dist(t[k], t[near]))) near = o;
          const dx = t[k].x - t[near].x;
          const dy = t[k].y - t[near].y;
          const l = Math.hypot(dx, dy) || 1;
          const p = { x: t[k].x + (18 * dx) / l, y: t[k].y + (18 * dy) / l };
          const h = hitAt(f, p, 'touch');
          expect(h && h.type, `${k} 18px away yaw=${s.yaw} pitch=${s.pitch}`).toBe(types[k]);
        }
      }
    });

    test('d) a tap 8 px from the centre in 8 directions arms orbit', () => {
      setTouch(true);
      const f = build();
      setRot(f, { yaw: 270 });
      const t = targets(f);
      for (let a = 0; a < 8; a++) {
        const ang = (a * Math.PI) / 4;
        const h = hitAt(f, { x: t.C.x + 8 * Math.cos(ang), y: t.C.y + 8 * Math.sin(ang) }, 'touch');
        expect(h && h.type).toBe('orbit');
      }
    });

    test('f) mouse and pen keep the old geometry and 9 px radius', () => {
      setTouch(false);
      const f = build();
      setRot(f, { yaw: 0 });
      const c = control(f);
      const unit = 1 / f.renderer.scale;
      expect(c.touch).toBeFalsy();
      expect(c.padRadius).toBeCloseTo(17 * unit, 6);
      expect(c.ringRadius).toBeCloseTo(28 * unit, 6);
      expect(c.yawRadiusX).toBeCloseTo(17 * 0.72 * unit, 6);
      expect(c.yawRadiusY).toBeCloseTo(17 * 0.48 * unit, 6);
      expect(c.pitchRadiusX).toBeCloseTo(17 * 0.62 * unit, 6);
      expect(c.pitchMarker.x).toBeCloseTo(c.center.x - 17 * 0.62 * unit, 6);
      const t = targets(f);
      const near = { x: t.Y.x + 12, y: t.Y.y };
      for (const pt of ['mouse', 'pen', undefined]) {
        const h = hitAt(f, near, pt);
        expect(h && h.type).not.toBe('yaw');
      }
      const on = hitAt(f, { x: t.Y.x + 4, y: t.Y.y }, 'pen');
      expect(on && on.type).toBe('yaw');
    });
  });

  test('e) precedence: an enlarged orbit zone yields to the scene object gizmo', () => {
    setTouch(true);
    const f = buildScene();
    const { renderer, engine, layer } = f;
    const child = engine.getLayerDescendants(layer.id).find((l) => l.type === 'object3d');
    renderer.setSelection([layer.id], layer.id);
    renderer.setSceneSelection({ layerId: layer.id, mode: 'object', objectIds: [child.id] });
    const gz = renderer.getSceneObjectGizmo ? renderer.getSceneObjectGizmo(layer) : null;
    expect(gz, 'object gizmo should show').toBeTruthy();
    // Sample the object gizmo's own hit points; pick the one nearest the orbit centre.
    const t = targets(f);
    const pts = [];
    (function collect(o, depth) {
      if (!o || depth > 3 || typeof o !== 'object') return;
      if (Number.isFinite(o.x) && Number.isFinite(o.y)) pts.push(renderer.worldToScreen(o.x, o.y));
      else for (const k of Object.keys(o)) collect(o[k], depth + 1);
    })(gz, 0);
    expect(pts.length).toBeGreaterThan(0);
    pts.sort((a, b) => dist(a, t.C) - dist(b, t.C));
    let armedGizmo = null;
    for (const p of pts.slice(0, 6)) {
      const hit = renderer.hitSceneObjectGizmo(p.x, p.y, layer);
      if (!hit) continue;
      renderer.rotation3DDrag = null;
      renderer.down({ clientX: p.x, clientY: p.y, button: 0, pointerType: 'touch', cancelable: true, preventDefault() {}, stopPropagation() {} });
      armedGizmo = { type: renderer.rotation3DDrag && renderer.rotation3DDrag.type };
      expect(renderer.rotation3DDrag, `object gizmo point (${p.x.toFixed(0)},${p.y.toFixed(0)}) must beat orbit`).toBeNull();
      renderer.up && renderer.up({ clientX: p.x, clientY: p.y, button: 0, pointerType: 'touch', preventDefault() {} });
    }
    expect(armedGizmo).toBeTruthy();
  });
});
