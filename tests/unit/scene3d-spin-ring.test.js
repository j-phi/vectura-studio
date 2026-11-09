/*
 * RGR — pre-baked spin for a 3D Scene (Scene3D.SpinRing).
 *  1. The ring is keyed by the scene minus the swept yaw: a yaw change keeps it valid, any other edit invalidates it.
 *  2. Frames are baked outward from the current yaw; nearest() is circular.
 *  3. Installing a baked frame equals a normal full render at that yaw (byte for byte, including memo and plot stats) and runs no compose.
 *  4. A stale frame (scene edited since) is refused.
 * RED (pre-change src): Scene3D.SpinRing, Engine.sceneJobOnly and Engine.installSpinFrame do not exist.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const hashPaths = (paths) => {
  let h = 0x811c9dc5 >>> 0; let n = 0;
  const mix = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
  (paths || []).forEach((p) => { if (!Array.isArray(p)) return; n++; mix('|'); p.forEach((q) => mix(`${q.x},${q.y};`)); });
  return `${h.toString(16)}:${n}`;
};
const wait = (ring, n) => new Promise((resolve, reject) => {
  const t0 = Date.now();
  const tick = () => {
    if (ring.readyCount() >= n) resolve();
    else if (Date.now() - t0 > 120000) reject(new Error('bake timeout'));
    else setTimeout(tick, 5);
  };
  tick();
});

describe('Scene3D.SpinRing', () => {
  let runtime; let V;
  beforeAll(async () => { runtime = await loadVecturaRuntime({ includeUi: false }); V = runtime.window.Vectura; }, 300000);
  afterAll(() => runtime && runtime.cleanup && runtime.cleanup());

  const make = () => {
    const engine = new V.VectorEngine();
    const gid = engine.addLayer('scene3d');
    const group = engine.layers.find((l) => l.id === gid);
    const child = engine.getLayerDescendants(gid).find((l) => l && l.type === 'object3d');
    child.params.primitive = 'sphere';
    child.params.style = { penId: null, mapper: 'hatch', params: { fillCurves: true } };
    engine.computeAllDisplayGeometry();
    const target = { id: 'camera', get: () => group.params.camera.yaw, set: (y) => { group.params.camera.yaw = y; } };
    return { engine, group, child, target };
  };
  const ringOf = (o, step = 90) => V.Scene3D.SpinRing.create({ engine: o.engine, group: o.group, target: o.target, step, runnerFactory: V.Scene3D.SpinRing.inlineRunner, poolSize: 1 });

  test('key is the scene minus yaw: yaw edits keep the ring, other edits drop it', () => {
    const o = make(); const ring = ringOf(o);
    expect(ring.key0).toBeTruthy();
    o.group.params.camera.yaw += 17;
    expect(ring.valid()).toBe(true);
    o.group.params.camera.pitch += 4;
    expect(ring.valid()).toBe(false);
    ring.dispose();
  });

  test('bakes outward from the current yaw and finds the nearest frame circularly', async () => {
    const o = make(); o.group.params.camera.yaw = 170;
    const ring = ringOf(o, 90);
    expect(ring.count).toBe(4);
    ring.start();
    await wait(ring, 1);
    expect(ring.frames.has(0)).toBe(true);           // the starting yaw is first
    await wait(ring, 4);
    expect(ring.frameAt(-175).yaw).toBe(ring.yaws[ring.frameAt(-175).idx]);
    expect(ring.frameAt(179).yaw).toBe(170);
    expect(ring.report().vectorMB).toBeGreaterThan(0);
    expect(o.group.params.camera.yaw).toBe(170);      // baking never leaves the scene turned
    ring.dispose();
  }, 120000);

  // RED (pre-change): frames were held as Float32, so an installed frame differed from a fresh render by up to ~3e-5 mm in the
  // geometry the layer KEEPS (memo, optimization, export, plot stats), not only in what was drawn.
  const exact = (a, b) => {
    expect(a.length).toBe(b.length);
    a.forEach((p, i) => { expect(p.length).toBe(b[i].length); p.forEach((q, j) => { if (q.x !== b[i][j].x || q.y !== b[i][j].y) throw new Error(`path ${i} point ${j}: ${q.x},${q.y} vs ${b[i][j].x},${b[i][j].y}`); }); });
  };
  test('an installed frame is byte-identical to a full render at that yaw (paths, memo, stats) and runs no compose', async () => {
    const o = make(); const ring = ringOf(o, 90); ring.start(); await wait(ring, 4);
    const f = ring.frames.get(1);
    ring.frames.forEach((fr) => [fr.packed, fr.finishedPacked].forEach((pk) => pk.paths.forEach((e) => { if (e.flat) expect(e.flat.BYTES_PER_ELEMENT).toBe(8); })));
    o.group.params.camera.yaw = f.yaw;
    const composes = o.engine.sceneComposeStats.composes;
    expect(o.engine.installSpinFrame(o.group, f)).toBe(true);
    expect(o.engine.sceneComposeStats.composes).toBe(composes);
    expect(o.group._pathsFromDraft).toBe(false);
    const installed = hashPaths(o.group.scenePaths);
    // reference: a fresh engine, same scene, same yaw, plain compose
    const ref = make(); ref.group.params.camera.yaw = f.yaw; ref.engine.computeAllDisplayGeometry();
    exact(o.group.scenePaths, ref.group.scenePaths);
    expect(installed).toBe(hashPaths(ref.group.scenePaths));
    // the memo it left behind serves later regenerations identically, and equals the fresh memo
    o.engine.computeAllDisplayGeometry();
    expect(hashPaths(o.group.scenePaths)).toBe(installed);
    exact(o.group.scenePaths, ref.group.scenePaths);
    // what export and plot stats read is the same: stats of the installed layer equal the fresh render's
    const sa = JSON.stringify(o.engine.getStats()); const sb = JSON.stringify(ref.engine.getStats());
    expect(sa).toBe(sb);
    ring.dispose();
  }, 120000);

  test('a stale frame is refused', async () => {
    const o = make(); const ring = ringOf(o, 180); ring.start(); await wait(ring, 2);
    const f = ring.frames.get(1);
    o.group.params.camera.yaw = f.yaw;
    o.group.params.camera.zoom = 1.3;
    expect(o.engine.installSpinFrame(o.group, f)).toBe(false);
    ring.dispose();
  }, 120000);

  // ── memory + bake order (perf/scene3d-instant-drag) ──────────────────────────────────────────────────────────────
  // RED (pre-change): frames held Float64Array flat ink twice (raw + finished), baked in plain outward order with no byte
  // budget by device, and Scene3D.SpinRing exposed no budgetMB / spacing().
  test('bakes a coarse pass first (every second step) and then fills in between; spacing() reports it', async () => {
    const o = make(); const ring = ringOf(o, 45);                      // 8 frames, 4 in the coarse pass
    expect(ring.coarse).toBe(true);
    ring.start(); await wait(ring, 4);
    expect(Array.from(ring.frames.keys()).every((i) => i % 2 === 0)).toBe(true);
    expect(ring.spacing()).toBe(90);
    await wait(ring, 8);
    expect(ring.complete()).toBe(true);
    expect(ring.spacing()).toBe(45);
    ring.dispose();
  }, 180000);

  test('frames are stored compactly: exact Float64 ink, raw and finished kept once when the finish changed nothing', async () => {
    const o = make(); const ring = ringOf(o, 180); ring.start(); await wait(ring, 2);
    ring.frames.forEach((f) => {
      [f.packed, f.finishedPacked].forEach((pk) => pk.paths.forEach((e) => { if (e.flat) expect(e.flat.BYTES_PER_ELEMENT).toBe(8); }));
      expect(f.packed.buffers).toEqual([]);                            // the worker's transfer list is not retained
    });
    const { samePacked } = V.Scene3D.SpinRing;
    ring.frames.forEach((f) => { if (samePacked(f.packed, f.finishedPacked)) expect(f.finishedPacked).toBe(f.packed); });
    // the byte count is the real size: unique typed-array bytes, never more
    ring.frames.forEach((f) => {
      const seen = new Set(); let raw = 0;
      [f.packed, f.finishedPacked].forEach((pk) => pk.paths.forEach((e) => { if (e.flat && !seen.has(e.flat)) { seen.add(e.flat); raw += e.flat.byteLength; } }));
      expect(f.bytes).toBeGreaterThanOrEqual(raw);
    });
    ring.dispose();
  }, 180000);

  test('the vector byte cap is honored: baking stops at the cap and keeps an even coarse ring', async () => {
    const o = make();
    const probe = ringOf(o, 45); probe.start(); await wait(probe, 1);
    const one = probe.frames.get(0).bytes; probe.dispose();
    const ring = V.Scene3D.SpinRing.create({ engine: o.engine, group: o.group, target: o.target, step: 45, runnerFactory: V.Scene3D.SpinRing.inlineRunner, poolSize: 1, maxBytes: one * 2.5 });
    ring.start();
    await new Promise((r) => setTimeout(r, 4000));
    expect(ring.stats.capped).toBe(true);
    expect(ring.frames.size).toBeLessThan(ring.count);
    expect(ring.stats.vectorBytes).toBeLessThanOrEqual(one * 2.5);
    expect(Array.from(ring.frames.keys()).every((i) => i % 2 === 0)).toBe(true);
    ring.dispose();
  }, 180000);

  // RED (pre-change): the cap was tested as vectorBytes + frameBytes after adding the frame, and frames already in flight when it was
  // reached were still stored, so a pool of 3 ended 1-2 frames past the cap.
  test('the byte cap is strict: each frame counted once, frames in flight past the cap are dropped', async () => {
    const o = make();
    const probe = ringOf(o, 45); probe.start(); await wait(probe, 1);
    const one = probe.frames.get(0).bytes; probe.dispose();
    const ring = V.Scene3D.SpinRing.create({ engine: o.engine, group: o.group, target: o.target, step: 45, runnerFactory: V.Scene3D.SpinRing.inlineRunner, poolSize: 3, maxBytes: one * 2.5 });
    ring.start();
    await new Promise((r) => setTimeout(r, 4000));
    expect(ring.stats.capped).toBe(true);
    expect(ring.stats.vectorBytes).toBeLessThanOrEqual(one * 2.5);
    expect(ring.stats.vectorBytes).toBe(Array.from(ring.frames.values()).reduce((n, fr) => n + fr.bytes, 0));   // each frame counted once
    expect(ring.frames.size).toBeGreaterThanOrEqual(1);
    expect(ring.frames.size).toBeLessThan(ring.count);
    ring.dispose();
  }, 180000);

  test('budgets come from config: desktop values, and the smaller Mobile ones on a touch / low-memory device', () => {
    const { budgetMB } = V.Scene3D.SpinRing;
    const saved = Object.assign({}, V.SETTINGS);
    try {
      expect(V.SETTINGS.sceneSpinMaxMB).toBeGreaterThan(0);
      expect(V.SETTINGS.sceneSpinMaxMBMobile).toBeLessThan(V.SETTINGS.sceneSpinMaxMB);
      expect(V.SETTINGS.sceneSpinRasterMaxMB + V.SETTINGS.sceneSpinMaxMB).toBeLessThanOrEqual(40);
      V.SETTINGS.sceneSpinMaxMB = 7;
      expect(budgetMB('sceneSpinMaxMB', 24, 12)).toBe(V.Scene3D.SpinRing.isMobile() ? V.SETTINGS.sceneSpinMaxMBMobile : 7);
    } finally { Object.assign(V.SETTINGS, saved); }
  });

  // RED (pre-change): ComposeJob had no unpackRange / entryPoints, so a baked frame could only be materialized whole (a 30-60 ms task).
  test('a packed frame can be materialized in slices that concatenate to the whole', async () => {
    const o = make(); const ring = ringOf(o, 180); ring.start(); await wait(ring, 1);
    const f = ring.frames.get(0); const Job = V.Scene3D.ComposeJob;
    const whole = Job.unpack(f.finishedPacked);
    const n = f.finishedPacked.paths.length;
    const parts = [];
    for (let i = 0; i < n; i += 7) parts.push(...Job.unpackRange(f.finishedPacked, i, Math.min(n, i + 7)));
    expect(parts.length).toBe(whole.length);
    expect(JSON.stringify(parts)).toBe(JSON.stringify(whole));
    const pts = f.finishedPacked.paths.reduce((a, e) => a + Job.entryPoints(e), 0);
    expect(pts).toBe(whole.reduce((a, p) => a + (Array.isArray(p) ? p.length : 8), 0));
    ring.dispose();
  }, 120000);
});
