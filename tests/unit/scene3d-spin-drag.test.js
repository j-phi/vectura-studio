/*
 * RGR — a Scene orbit drag on a baked ring (Renderer spin mode).
 *  1. Once the ring is baked, a drag composes nothing (counter) and never draws a preview tier: each move snaps the swept
 *     yaw to a baked one and shows that frame's raster;  pitch stays at the baked pitch.
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
    renderer._spinRasterBegin = (g, frame) => { frame.raster = { empty: true, bytes: 0, view: renderer._spinViewNow(g) }; return null; };
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
      o.renderer.apply3DRotationDrag({ clientX: start.x + i * 40, clientY: start.y + (i % 2) * 4 });
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
    // identical to a plain full render of the same scene at that yaw, byte for byte (RED pre-change: frames were Float32)
    const ref = build();
    ref.group.params.camera.yaw = shown.yaw; ref.engine.computeAllDisplayGeometry();
    const a = o.group.scenePaths; const b = ref.group.scenePaths;
    expect(a.length).toBe(b.length);
    a.forEach((p, i) => { expect(p.length).toBe(b[i].length); p.forEach((q, j) => { if (q.x !== b[i][j].x || q.y !== b[i][j].y) throw new Error(`path ${i} point ${j} differs`); }); });
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

  // ── a settled Scene whose ink is a baked frame redraws from that frame's raster (hover / release redraws) ───────────
  // RED (pre-change): no _spinAdopt / _spinIdleFrame; after release the whole scene was re-stroked as vectors (60-140 ms flush).
  test('idle blit: the settled ink is adopted by its frame, kept after release, and dropped by any edit, zoom or recompose', async () => {
    const o = build();
    const ring = await startRing(o);
    const st = o.renderer._spin;
    o.renderer._spinMaintain();                                          // adopts the ring's starting frame
    expect(o.group._spinShown && o.group._spinShown.frame).toBe(ring.frames.get(0));
    expect(o.renderer._spinIdleFrame(o.group)).toBe(ring.frames.get(0));
    // a stale zoom strokes vectors until the raster is redone
    o.renderer.scale = 1.5;
    expect(o.renderer._spinIdleFrame(o.group)).toBeNull();
    o.renderer.scale = 1;
    expect(o.renderer._spinIdleFrame(o.group)).toBe(ring.frames.get(0));
    // release keeps the shown frame as the idle frame
    const start = grab(o);
    for (let i = 1; i <= 6; i++) o.renderer.apply3DRotationDrag({ clientX: start.x + i * 40, clientY: start.y });
    const shown = o.group._spinBlit.frame;
    o.renderer.end3DRotationDrag();
    expect(o.group._spinShown.frame).toBe(shown);
    expect(o.renderer._spinIdleFrame(o.group)).toBe(shown);
    // while a drag is in progress the idle path is not used
    expect(st).toBeTruthy();
    // any recompose replaces the ink: the frame no longer stands in for it
    o.engine.computeAllDisplayGeometry();
    expect(o.renderer._spinIdleFrame(o.group)).toBeNull();
    o.renderer._spinMaintain();                                          // ...and is adopted again when still equal
    expect(o.renderer._spinIdleFrame(o.group)).toBe(shown);
    o.group.params.camera.zoom = 1.4;                                    // an edit: different scene
    o.engine.generate(o.gid);
    expect(o.renderer._spinIdleFrame(o.group)).toBeNull();
    o.renderer._spinDrop();
    expect(o.group._spinShown).toBeNull();
  }, 180000);

  test('the ring\'s starting frame stands in for the state the ring began in even when its key differs only by in-place defaults', async () => {
    const o = build();
    const ring = await startRing(o);
    ring.frames.get(0).key = `${ring.frames.get(0).key} `;               // the compose filled defaults into the shared params: key text differs
    o.group._spinShown = null; o.renderer._spin.adoptTried = null;
    o.renderer._spinMaintain();
    expect(o.group._spinShown && o.group._spinShown.frame).toBe(ring.frames.get(0));
    o.renderer._spinDrop();
  }, 180000);

  // ── review fixes (perf/scene3d-instant-drag) ───────────────────────────────────────────────────────────────────────
  // RED (pre-change): a raster was valid for any pan / canvas size / pen / dash / theme (only scale and dpr were compared), so a
  // panned or re-penned Scene redrew a clipped or wrongly coloured picture.
  test('a raster is valid only for the view and style it was made in: pan, canvas size, pen colour / width, dash and theme', async () => {
    const o = build();
    const ring = await startRing(o);
    o.renderer._spinMaintain();
    const f0 = ring.frames.get(0);
    expect(o.renderer._spinIdleFrame(o.group)).toBe(f0);
    const flip = (label, change, restore) => {
      change();
      expect(o.renderer._spinIdleFrame(o.group), label).toBeNull();
      restore();
      expect(o.renderer._spinIdleFrame(o.group), `${label} restored`).toBe(f0);
    };
    flip('pan x', () => { o.renderer.offsetX += 7; }, () => { o.renderer.offsetX -= 7; });
    flip('pan y', () => { o.renderer.offsetY += 3; }, () => { o.renderer.offsetY -= 3; });
    flip('canvas size', () => { o.renderer.canvas.width += 2; }, () => { o.renderer.canvas.width -= 2; });
    if (!Array.isArray(V.SETTINGS.pens) || !V.SETTINGS.pens.length) V.SETTINGS.pens = [{ id: 'pen-1', name: 'Pen 1', color: '#000000', width: 0.3 }];
    const pen = V.SETTINGS.pens[0];
    const c0 = pen.color; const w0 = pen.width;
    flip('pen colour', () => { pen.color = '#ff0000'; }, () => { pen.color = c0; });
    flip('pen width', () => { pen.width = w0 + 0.2; }, () => { pen.width = w0; });
    flip('layer dash', () => { o.group.dash = { enabled: true, pattern: [2, 1] }; }, () => { delete o.group.dash; });
    const ui0 = V.SETTINGS.uiTheme;
    flip('theme (uiTheme)', () => { V.SETTINGS.uiTheme = 'zz-test-theme'; }, () => { V.SETTINGS.uiTheme = ui0; });
    flip('theme (root attribute)', () => { runtime.window.document.documentElement.setAttribute('data-theme', 'sepia-test'); }, () => { runtime.window.document.documentElement.removeAttribute('data-theme'); });
    o.renderer._spinDrop();
  }, 180000);

  // RED (pre-change): release installed the nearest frame THAT HAD A RASTER (any distance away), not the frame nearest the pointer.
  test('release installs the vector frame nearest the pointer even when its raster is not made yet', async () => {
    const o = build();
    const ring = await startRing(o);
    const start = grab(o);
    const yaw0 = o.group.params.camera.yaw;
    const target = ring.frameAt(yaw0 + 80);                              // the pointer ends 80 degrees round: nearest is the +90 frame
    const others = Array.from(ring.frames.values()).filter((f) => f !== target);
    expect(target.yaw).not.toBe(yaw0);
    o.renderer.apply3DRotationDrag({ clientX: start.x + Math.round(40 / 0.45), clientY: start.y });
    target.raster = null;                                                 // its raster has not been made (evicted / still slicing)
    o.renderer.apply3DRotationDrag({ clientX: start.x + Math.round(80 / 0.45), clientY: start.y });
    expect(o.group._spinBlit.frame).not.toBe(target);                    // a neighbour's raster is on screen meanwhile
    expect(others).toContain(o.group._spinBlit.frame);
    expect(o.group.params.camera.yaw).toBe(target.yaw);
    o.renderer.end3DRotationDrag();
    expect(o.group.params.camera.yaw).toBe(target.yaw);
    expect(o.group._sceneSettledKey).toBe(target.key);
    expect(o.group._spinShown.frame).toBe(target);
    expect(o.group._spinShown.hold).toBeTruthy();
    expect(o.renderer._spinIdleFrame(o.group)).toBe(o.group._spinShown.hold);   // the stand-in, until the real raster lands
    target.raster = { empty: true, bytes: 0, view: o.renderer._spinViewNow(o.group) };
    expect(o.renderer._spinIdleFrame(o.group)).toBe(target);
    o.renderer._spinDrop();
  }, 180000);

  // The pitch rule: pitch always follows the pointer. A free-orbit drag on a ready ring holds the baked pitch only while the pointer's
  // pitch stays within SPIN_PITCH_EPS of the gesture's start; past that the gesture runs on the legacy tiers with the pointer's pitch.
  // RED (pre-change): the pitch was locked for the whole gesture whenever the ring was ready, and followed the pointer when it was not.
  test('pitch rule: a ready ring holds pitch within the dead zone, and a deliberate vertical move releases to the legacy path', async () => {
    const o = build();
    const ring = await startRing(o);
    const pitch0 = o.group.params.camera.pitch;
    const start = grab(o);
    o.renderer.apply3DRotationDrag({ clientX: start.x + 30, clientY: start.y + 6 });   // 6 px = 2.7 degrees: inside the zone
    expect(o.renderer.rotation3DDrag.spin).toBeTruthy();
    expect(o.group.params.camera.pitch).toBe(pitch0);
    o.renderer.apply3DRotationDrag({ clientX: start.x + 40, clientY: start.y - 60 });  // 27 degrees: outside
    expect(o.renderer.rotation3DDrag.spin).toBeNull();
    expect(o.group._spinBlit).toBeNull();
    expect(o.group.params.camera.pitch).toBeGreaterThan(pitch0 + 20);                     // the pointer's pitch, same as with no ring
    o.renderer.end3DRotationDrag();
    expect(ring.disposed).toBe(false);
    o.renderer._spinDrop();
  }, 180000);

  // The 54-67 ms task on the first pointer entry (CDP profile: _recomputeSceneHoverHint -> _sceneCandidatesAtPoint -> _scenePickFaces
  // (assembleScene) + a convex hull over every vertex). RED (pre-change): each hover rebuilt the hulls and the first one built the pick faces.
  test('hover: silhouettes are cached per composed ink, and the pick faces are warmed while idle (the first pointer entry builds nothing)', async () => {
    const o = build();
    const Scene = V.Scene3D.Scene;
    const realAsm = Scene.assembleScene; let asm = 0;
    Scene.assembleScene = (...a) => { asm += 1; return realAsm.apply(Scene, a); };
    let hulls = 0; const realHull = o.renderer._convexHull2D.bind(o.renderer);
    o.renderer._convexHull2D = (pts) => { hulls += 1; return realHull(pts); };
    try {
      o.renderer._pickWarm();                                           // what draw() does once the Scene has settled
      await new Promise((r) => setTimeout(r, 900));                    // the idle callbacks
      const warmAsm = asm; const warmHulls = hulls;
      expect(warmAsm).toBeGreaterThan(0);
      expect(warmHulls).toBeGreaterThan(0);
      const b = o.renderer.getSelectionBounds([o.group]);
      const c = o.renderer.get3DRotationControl(o.group, b).center;
      o.renderer._sceneCandidatesAtPoint({ x: c.x, y: c.y }, 'object');
      o.renderer._sceneCandidatesAtPoint({ x: c.x + 1, y: c.y }, 'object');
      o.renderer._sceneCandidatesAtPoint({ x: c.x, y: c.y + 1 }, 'face');
      expect(asm).toBe(warmAsm);                                         // no pick-face build on the hover
      expect(hulls).toBe(warmHulls);                                     // no hull on any hover
    } finally { Scene.assembleScene = realAsm; }
    o.renderer._spinDrop();
  }, 180000);

  // RED (pre-change): the panel rebuild (buildControls, 18-25 ms) ran inside the release task.
  test('release does not rebuild the panel inside the release task', async () => {
    const o = build();
    await startRing(o);
    let rebuilds = 0; o.renderer.app.ui.buildControls = () => { rebuilds += 1; };
    const start = grab(o);
    for (let i = 1; i <= 4; i++) o.renderer.apply3DRotationDrag({ clientX: start.x + i * 60, clientY: start.y });
    o.renderer.end3DRotationDrag();
    expect(rebuilds).toBe(0);
    await new Promise((r) => setTimeout(r, 120));
    expect(rebuilds).toBe(1);
    o.renderer._spinDrop();
  }, 180000);
});
