/*
 * RGR — a Scene orbit drag on a baked ring (Renderer spin mode).
 *  1. Once the ring is baked, a drag composes nothing (counter) and never draws a preview tier: each move snaps the swept
 *     yaw to a baked one and shows that frame's raster; pitch stays at the baked pitch.
 *  2. Release installs the shown frame: the settled ink equals a normal full render at that yaw (hash) with no compose.
 *  3. The ring is dropped when the scene changes for any reason but yaw, and kept when only yaw changed.
 *  4. Before the ring is ready the drag takes the legacy path (draft/warp) and the pitch is NOT locked.
 * RED (pre-change src): Renderer has no _spinStart / spin mode: the drag recomposes a preview tier per move
 * (composes +N, lastTier 'law'/'flat'/'warp') and the pitch follows the pointer.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const hashPaths = (paths) => {
  let h = 0x811c9dc5 >>> 0; let n = 0;
  const mix = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
  (paths || []).forEach((p) => { if (!Array.isArray(p)) return; n++; mix('|'); p.forEach((q) => mix(`${q.x},${q.y};`)); });
  return `${h.toString(16)}:${n}`;
};
const until = (fn, ms = 120000) => new Promise((resolve, reject) => {
  const t0 = Date.now();
  const tick = () => { if (fn()) resolve(); else if (Date.now() - t0 > ms) reject(new Error('timeout')); else setTimeout(tick, 5); };
  tick();
});

describe('Renderer spin mode (pre-baked turntable drag)', () => {
  let runtime; let V;
  beforeAll(async () => { runtime = await loadVecturaRuntime({ includeRenderer: true }); V = runtime.window.Vectura; }, 300000);
  afterAll(() => runtime.cleanup());
  afterEach(() => { ['sceneSpinRunner', 'sceneSpinStep', 'sceneSpinPool', 'sceneSpinDelayMs'].forEach((k) => delete V.SETTINGS[k]); });

  const build = () => {
    V.SETTINGS.sceneSpinRunner = V.Scene3D.SpinRing.inlineRunner;
    V.SETTINGS.sceneSpinStep = 90;
    V.SETTINGS.sceneSpinPool = 1;
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneTree();
    const child = engine.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    child.params.primitive = 'sphere';
    engine.generate(gid);
    const group = engine.getLayerById(gid);
    const renderer = new V.Renderer('main-canvas', engine);
    renderer.scale = 1; renderer.offsetX = 0; renderer.offsetY = 0;
    renderer.selectedLayerIds = new Set([gid]); renderer.selectedLayerId = gid;
    renderer.app = { pushHistory: () => {}, ui: { buildControls() {}, updateFormula() {} } };
    renderer.draw = () => {};
    renderer.updateCursor = () => {}; renderer.showDragTooltip = () => {}; renderer.hideDragTooltip = () => {};
    // rasters are canvas work; the contract here is WHICH frame is shown, so a raster is a marker
    renderer._spinRasterBegin = (g, frame) => { frame.raster = { empty: true, bytes: 0, view: { scale: renderer.scale, dpr: renderer.getBackingDpr() } }; return null; };
    return { engine, renderer, gid, group, child };
  };
  const startRing = async (o) => {
    o.renderer._spinStart({ groupId: o.gid, key: o.group._sceneSettledKey, targetId: 'camera' });
    const st = o.renderer._spin;
    expect(st && st.ring).toBeTruthy();
    await until(() => st.ring.complete() && Array.from(st.ring.frames.values()).every((f) => f.raster));
    return st.ring;
  };
  const grab = (o) => {
    const bounds = o.renderer.getSelectionBounds([o.group]);
    const control = o.renderer.get3DRotationControl(o.group, bounds);
    const start = o.renderer.worldToScreen(control.center.x, control.center.y);
    const hit = o.renderer.hit3DRotationControl(start.x, start.y, o.group, bounds);
    expect(hit.type).toBe('orbit');
    expect(o.renderer.begin3DRotationDrag(hit, { clientX: start.x, clientY: start.y })).toBe(true);
    return start;
  };

  test('a baked ring: the drag composes nothing, locks pitch, shows baked frames; release installs the exact frame', async () => {
    const o = build();
    const ring = await startRing(o);
    const pitch0 = o.group.params.camera.pitch;
    const composes = o.engine.sceneComposeStats.composes;
    const start = grab(o);
    expect(o.renderer.rotation3DDrag.spin).toBeTruthy();
    for (let i = 1; i <= 8; i++) {
      o.renderer.apply3DRotationDrag({ clientX: start.x + i * 40, clientY: start.y + i * 5 });
      expect(ring.yaws).toContain(o.group.params.camera.yaw);          // always a baked yaw
      expect(o.group.params.camera.pitch).toBe(pitch0);                  // pitch locked
      expect(o.group._spinBlit && o.group._spinBlit.frame.raster).toBeTruthy();
    }
    expect(o.engine.sceneComposeStats.composes).toBe(composes);          // nothing composed during the drag
    expect(o.engine.sceneComposeStats.lastTier).not.toMatch(/law|flat|warp/);
    const shown = o.group._spinBlit.frame;
    expect(shown.yaw).not.toBe(ring.base);                                // it left the starting pose
    expect(shown.yaw).toBe(o.group.params.camera.yaw);
    o.renderer.end3DRotationDrag();
    expect(o.group._spinBlit).toBeNull();
    expect(o.engine.sceneComposeStats.composes).toBe(composes);          // release composed nothing either
    expect(o.engine.sceneComposeStats.spinInstalls).toBe(1);
    expect(o.group._pathsFromDraft).toBe(false);
    expect(o.renderer._sceneSettle).toBeFalsy();                          // no deferred settle compose
    // identical to a plain full render of the same scene at that yaw
    const ref = build();
    ref.group.params.camera.yaw = shown.yaw; ref.engine.computeAllDisplayGeometry();
    // (baked frames are Float32, so equal to float32 precision: < 1e-4 mm)
    const a = o.group.scenePaths; const b = ref.group.scenePaths;
    expect(a.length).toBe(b.length);
    let worst = 0;
    a.forEach((p, i) => { expect(p.length).toBe(b[i].length); p.forEach((q, j) => { worst = Math.max(worst, Math.abs(q.x - b[i][j].x), Math.abs(q.y - b[i][j].y)); }); });
    expect(worst).toBeLessThan(1e-4);
    void hashPaths;
    o.renderer._spinDrop(); ref.renderer._spinDrop();
  }, 180000);

  test('the ring survives a yaw-only change and is dropped by any other edit', async () => {
    const o = build();
    const ring = await startRing(o);
    o.group.params.camera.yaw += 25;
    o.engine.generate(o.gid);
    o.renderer._spinMaintain();
    expect(o.renderer._spin && o.renderer._spin.ring).toBe(ring);
    o.group.params.camera.zoom = 1.4;
    o.engine.generate(o.gid);
    o.renderer._spinMaintain();
    expect(o.renderer._spin).toBeNull();
    expect(ring.disposed).toBe(true);
    o.renderer._spinDrop();
  }, 180000);

  test('before the ring is ready the drag is the legacy path and pitch follows the pointer', () => {
    const o = build();
    const pitch0 = o.group.params.camera.pitch;
    const start = grab(o);
    expect(o.renderer.rotation3DDrag.spin).toBeFalsy();
    o.renderer.apply3DRotationDrag({ clientX: start.x + 20, clientY: start.y + 60 });
    expect(o.group.params.camera.pitch).not.toBe(pitch0);
    o.renderer.end3DRotationDrag();
  });

  // ── gesture path is hash-free; raster density is capped (perf/scene3d-instant-drag) ──────────────────────────────
  // RED (pre-change): pointerdown re-derived the ring key (ring.valid -> sceneJobOnly -> _sceneComposeKey) and release hashed
  // the scene twice more (installSpinFrame verify + the precomputed compose), 50-130 ms each on a dense scene.
  test('no scene hashing on pointerdown, pointermove or release', async () => {
    const o = build();
    const ring = await startRing(o);
    let keys = 0;
    const orig = o.engine._sceneComposeKey.bind(o.engine);
    o.engine._sceneComposeKey = (...a) => { keys += 1; return orig(...a); };
    const start = grab(o);
    expect(o.renderer.rotation3DDrag.spin).toBeTruthy();
    for (let i = 1; i <= 12; i++) o.renderer.apply3DRotationDrag({ clientX: start.x + i * 30, clientY: start.y });
    o.renderer.end3DRotationDrag();
    expect(o.engine.sceneComposeStats.spinInstalls).toBe(1);
    expect(keys).toBe(0);
    // the ring is still this scene's afterwards without re-hashing on the next draw
    o.renderer._spinMaintain();
    expect(keys).toBe(0);
    expect(o.renderer._spin && o.renderer._spin.ring).toBe(ring);
    o.renderer._spinDrop();
  }, 180000);

  test('an edit between bake and gesture start falls back instead of trusting the ring', async () => {
    const o = build();
    await startRing(o);
    o.group.params.camera.zoom = 1.4;
    o.engine.generate(o.gid);                                           // settled key moved; _spinMaintain has not run yet
    const start = grab(o);
    expect(o.renderer.rotation3DDrag.spin).toBeFalsy();
    void start;
    o.renderer.end3DRotationDrag();
    o.renderer._spinDrop();
  }, 180000);

  test('raster density is capped by config (a 3x screen rasters at the cap, not 3x)', () => {
    const o = build();
    o.renderer.backingDpr = 3;
    expect(o.renderer._spinRasterDpr()).toBe(V.Scene3D.SpinRing.isMobile() ? V.SETTINGS.sceneSpinRasterMaxDprMobile : V.SETTINGS.sceneSpinRasterMaxDpr);
    o.renderer.backingDpr = 1;
    expect(o.renderer._spinRasterDpr()).toBe(1);
  });

  test('the raster budget evicts the frame farthest from the viewed yaw and never the kept one', async () => {
    const o = build();
    const ring = await startRing(o);
    ring.frames.forEach((f) => { f.raster = { empty: true, bytes: 1000, view: {} }; });
    const keep = ring.frameAt(ring.base);
    const dropped = ring.trimRasters(2000, keep, ring.base);
    expect(dropped).toBe(ring.frames.size - 2);
    expect(ring.rasterBytes()).toBeLessThanOrEqual(2000);
    expect(keep.raster).toBeTruthy();
    o.renderer._spinDrop();
  }, 180000);
});
