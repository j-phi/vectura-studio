const { loadSurfaceLockRuntime, buildSurfaceLockScene, signature } = require('../helpers/surface-lock-scene');

// W2-B2 (docs/surface-lock-contract.md §13): the Level S bake moves off the main thread.
//  - ComposeJob.run hands back the MarkSets it baked; the main thread adopts them (a node-runtime job equals the main bake array for array).
//  - A Level S PREVIEW frame whose MarkSets are not cached composes nothing: it keeps the previous ink (owner Q4) and a worker
//    bakes and composes the state. A mezzo Density scrub therefore never bakes on the main thread, and the settled ink is the
//    fresh full generate.
// The worker is stood in for by running the same ComposeJob inline with `release` (it leaves the main cache cold, as a worker would).

describe('surface lock Level S off-thread bake (W2-B2)', () => {
  let rt; let V; let SL;
  beforeAll(async () => { rt = await loadSurfaceLockRuntime(); V = rt.V; SL = V.Scene3D.SurfaceLock; });
  afterAll(() => rt && rt.cleanup());

  const mezzo = () => buildSurfaceLockScene(V, { kind: 'sphere', toneLaw: 'mezzoRegion', mapper: 'hatch', markSpace: 'surface' });
  const geo = () => ({ width: 320, height: 220, penWidth: 0.3 });
  const sameArrays = (a, b) => ['positions', 'normals', 'runStart', 'runLevel', 'runRank', 'runFamily', 'runFlags']
    .every((k) => a[k].length === b[k].length && Buffer.compare(Buffer.from(a[k].buffer, a[k].byteOffset, a[k].byteLength), Buffer.from(b[k].buffer, b[k].byteOffset, b[k].byteLength)) === 0);

  // A worker stand-in: the job runs inline (baking into the shared cache, then released, as a worker's cache is never the main's).
  // `jobBakeMisses` is every bake miss that happened INSIDE a job; the rest of SL.stats.bakeMisses happened on the main thread.
  const fakeWorker = () => {
    const c = { runs: 0, jobBakeMisses: 0, pending: [], available: () => true };
    c.run = (job) => {
      c.runs += 1;
      const m0 = SL.stats.bakeMisses;
      const out = V.Scene3D.ComposeJob.run(job, { release: true });
      c.jobBakeMisses += SL.stats.bakeMisses - m0;
      let resolve; let reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      const h = {
        promise,
        cancel: () => reject(new Error('cancelled')),
        land: () => resolve({ packed: out.packed, finishedPacked: out.finished, bakes: out.bakes, ms: out.ms }),
      };
      c.pending.push(h);
      return h;
    };
    return c;
  };
  // Wait on the real condition, never a fixed delay: the settle unpacks the worker ink in 4 ms setTimeout slices and then composes
  // on the main thread, so its wall time grows with machine load. (A fixed 20 ms flush raced it and flaked under parallel shards.)
  const until = async (cond, what) => { while (!cond()) await new Promise((r) => setTimeout(r, 1)); return what; };
  const settled = (group) => until(() => !(group._sceneBakeSettle && group._sceneBakeSettle.running), 'settle idle');

  it('the job returns its bakes; they equal the main-thread bake array for array; the adopted cache generates byte-identically', () => {
    const s = mezzo();
    s.composeFull();
    const job = s.eng.sceneJobOnly(s.group);
    const algo = V.AlgorithmRegistry.scene3d;
    const specs = algo.levelSBakeSpecs(job.assembled, job.bounds);
    expect(specs.length).toBe(1);

    SL.clearCache();
    const main = specs.map((sp) => { const ms = SL.bake(sp); return { key: SL.bakeKey(sp), ms: Object.fromEntries(Object.entries(ms).map(([k, v]) => [k, ArrayBuffer.isView(v) ? v.slice() : v])) }; });
    SL.clearCache();
    const out = V.Scene3D.ComposeJob.run({ assembled: job.assembled, bounds: job.bounds, seed: job.seed }, { release: true });
    expect(out.bakes.length).toBe(main.length);
    main.forEach((m, i) => { expect(out.bakes[i].key).toBe(m.key); expect(sameArrays(out.bakes[i].ms, m.ms)).toBe(true); });
    expect(SL.stats.cacheEntries).toBe(0); // released: the worker's cache holds nothing the transfer detached

    const before = signature(V.Scene3D.ComposeJob.unpack(out.packed));
    expect(SL.missingBakes(specs).length).toBe(specs.length);
    expect(SL.adopt(out.bakes)).toBe(out.bakes.length);
    expect(SL.missingBakes(specs).length).toBe(0);
    SL.resetStats();
    const rng = new V.SeededRNG(job.seed); const noise = new V.SimpleNoise(job.seed);
    const adopted = algo.generate(job.assembled, rng, noise, job.bounds);
    expect(SL.stats.bakeMisses).toBe(0);
    expect(signature(adopted)).toBe(before);
    SL.clearCache();
    expect(signature(algo.generate(job.assembled, new V.SeededRNG(job.seed), new V.SimpleNoise(job.seed), job.bounds))).toBe(before);
  }, 60000);

  it('missingBakes is read-only and ignores specs with no baker', () => {
    const s = mezzo(); s.composeFull();
    const job = s.eng.sceneJobOnly(s.group);
    const specs = V.AlgorithmRegistry.scene3d.levelSBakeSpecs(job.assembled, job.bounds);
    SL.clearCache(); SL.resetStats();
    expect(SL.missingBakes(specs).length).toBe(1);
    expect(SL.stats.bakes).toBe(0);
    expect(SL.missingBakes([{ primitive: 'sphere', mapper: 'none' }]).length).toBe(0);
  });

  it('a mezzo Density scrub of 10 ticks never bakes on the main thread, holds the ink, and settles to the fresh generate', async () => {
    const s = mezzo();
    s.composeFull(); // warm cache and settled ink at the starting density
    const client = fakeWorker();
    s.eng.sceneBakeClient = client;
    const redraws = []; s.eng.onSceneInkReady = (g) => redraws.push(g.id);
    const leaf = s.objectsOf()[0];
    const inkBefore = s.group.scenePaths;
    const sigBefore = signature(inkBefore);
    SL.resetStats();
    const mainMisses0 = SL.stats.bakeMisses;
    for (let i = 1; i <= 10; i++) {
      leaf.params.style.params.fillDensity = 50 + i * 4;
      const paths = s.composePreview();
      expect(SL.stats.bakeMisses - client.jobBakeMisses, `tick ${i}`).toBe(mainMisses0); // no bake outside a job
      expect(paths, `tick ${i} holds the previous ink`).toBe(inkBefore);
      expect(signature(paths)).toBe(sigBefore);
    }
    expect(s.eng.sceneComposeStats.bakeHolds).toBe(10);
    expect(client.runs).toBe(1); // ticks 2..10 coalesce behind the first job
    // land the first (stale: density of tick 1) job; the engine then posts ONE follow-up for the latest state
    client.pending[0].land(); await until(() => client.runs >= 2);
    expect(client.runs).toBe(2);
    client.pending[1].land(); await settled(s.group);
    expect(redraws.length).toBeGreaterThanOrEqual(1);
    expect(SL.stats.bakeMisses - client.jobBakeMisses).toBe(mainMisses0);
    const settledInk = signature(s.group.scenePaths);
    expect(settledInk).not.toBe(sigBefore);
    // the settled ink is the fresh full generate (cold cache, no worker)
    s.eng.sceneBakeClient = null; SL.clearCache();
    expect(signature(s.composeFull())).toBe(settledInk);
  }, 120000);

  it('an object-scale tick never bakes on the main thread, and the release bakes once (in the worker)', async () => {
    const s = mezzo();
    s.composeFull();
    const client = fakeWorker();
    s.eng.sceneBakeClient = client;
    const leaf = s.objectsOf()[0];
    const ink = s.group.scenePaths;
    SL.resetStats();
    for (let i = 1; i <= 5; i++) {
      leaf.params.transform = { ...(leaf.params.transform || {}), scale: 1 + i * 0.05 };
      expect(s.composePreview()).toBe(ink);
    }
    expect(SL.stats.bakeMisses - client.jobBakeMisses).toBe(0);
    client.pending[0].land(); await until(() => client.runs >= 2); // the follow-up for the latest scale
    expect(client.runs).toBe(2);
    client.pending[1].land(); await settled(s.group);
    expect(client.jobBakeMisses).toBe(2); // one bake per job (two states), none on the main thread
    expect(SL.stats.bakeMisses - client.jobBakeMisses).toBe(0);
    // release: the state is already composed (installed from the worker's result): a memo hit, no new job
    const runs = client.runs;
    const ctx = s.eng.beginSceneAsync(s.gid, { client: { available: () => true, run: () => { throw new Error('no job expected'); } } });
    expect(ctx && ctx.done).toBe(true);
    expect(client.runs).toBe(runs);
  }, 120000);

  it('pose drags (camera, object yaw) never hold: the bake key is pose-free', () => {
    const s = mezzo();
    s.composeFull();
    const client = fakeWorker(); s.eng.sceneBakeClient = client;
    for (let i = 0; i < 6; i++) { s.setPose({ camYaw: -30 + i * 9, camPitch: 20 }); s.composePreview(); }
    expect(client.runs).toBe(0);
    expect(s.eng.sceneComposeStats.bakeHolds).toBe(0);
    expect(s.eng.sceneComposeStats.lastTier).toBe('full');
  });

  // FX-J2: an interactive COMMIT (app.regen -> engine.generate({ holdBakes: true })) holds exactly like a preview tick.
  it('FX-J2: a held commit does 0 main-thread bakes, schedules one worker settle, and settles to the fresh generate; without the flag it bakes on main', async () => {
    const s = mezzo();
    s.composeFull();
    const client = fakeWorker(); s.eng.sceneBakeClient = client;
    const leaf = s.objectsOf()[0];
    const inkBefore = s.group.scenePaths;
    leaf.params.style.params.fillDensity = 77;
    SL.resetStats();
    s.eng.generate(leaf.id, { holdBakes: true });
    expect(SL.stats.bakeMisses - client.jobBakeMisses).toBe(0);
    expect(SL.stats.bakes).toBe(client.jobBakeMisses);
    expect(s.group.scenePaths).toBe(inkBefore);
    expect(s.eng.sceneComposeStats.bakeHolds).toBeGreaterThanOrEqual(1);
    expect(client.runs).toBe(1);
    client.pending[0].land(); await settled(s.group);
    expect(SL.stats.bakeMisses - client.jobBakeMisses).toBe(0);
    const settledInk = signature(s.group.scenePaths);
    expect(settledInk).not.toBe(signature(inkBefore));
    s.eng.sceneBakeClient = null; SL.clearCache();
    expect(signature(s.composeFull())).toBe(settledInk);
    // mutation proof: the same edit without the flag bakes on the main thread
    SL.clearCache(); // the settle above cached the density-77 bake by content; the mutation proof needs it cold
    const s2 = mezzo(); s2.composeFull();
    const c2 = fakeWorker(); s2.eng.sceneBakeClient = c2;
    s2.objectsOf()[0].params.style.params.fillDensity = 77;
    SL.resetStats();
    s2.eng.generate(s2.objectsOf()[0].id, {});
    expect(SL.stats.bakeMisses - c2.jobBakeMisses).toBe(1);
    expect(c2.runs).toBe(0);
  }, 120000);

  it('FX-J2: export/save requested while a bake is held get the exact new ink (they compose synchronously, never the held ink)', async () => {
    const s = mezzo();
    s.composeFull();
    const client = fakeWorker(); s.eng.sceneBakeClient = client;
    const leaf = s.objectsOf()[0];
    const stale = signature(s.group.scenePaths);
    leaf.params.style.params.fillDensity = 81;
    s.eng.generate(leaf.id, { holdBakes: true });
    expect(signature(s.group.scenePaths)).toBe(stale); // held: the screen still shows the old ink
    // export / save path: computeAllDisplayGeometry (no hold flag) bakes in place and installs the exact state
    s.eng.computeAllDisplayGeometry();
    const exported = signature(s.group.scenePaths);
    expect(exported).not.toBe(stale);
    const B = V.ExportSvgBuilder;
    if (B && typeof B.countPaths === 'function' && typeof B.snapshotSteps === 'function') {
      const n = B.countPaths(B.snapshotSteps(s.eng, { computeDisplayGeometry: () => {}, optimizeTargets: null }));
      expect(n).toBeGreaterThan(0);
    }
    // the in-flight worker settle (same state) lands afterwards: the ink is unchanged
    client.pending[0].land(); await settled(s.group);
    expect(signature(s.group.scenePaths)).toBe(exported);
    s.eng.sceneBakeClient = null; SL.clearCache();
    expect(signature(s.composeFull())).toBe(exported);
  }, 120000);

  it('FX-J2: pose mode (markSpace pose) and a first compose are never held by a commit', () => {
    const s = buildSurfaceLockScene(V, { kind: 'sphere', toneLaw: 'mezzoRegion', mapper: 'hatch', markSpace: 'pose' });
    s.composeFull();
    const client = fakeWorker(); s.eng.sceneBakeClient = client;
    const leaf = s.objectsOf()[0];
    leaf.params.style.params.fillDensity = 77;
    const ink = s.group.scenePaths;
    s.eng.generate(leaf.id, { holdBakes: true });
    expect(s.group.scenePaths).not.toBe(ink);
    expect(s.eng.sceneComposeStats.bakeHolds).toBe(0);
    expect(client.runs).toBe(0);
  }, 60000);

  it('with no worker the preview bakes in place, as before', () => {
    const s = mezzo();
    s.composeFull();
    s.eng.sceneBakeClient = { available: () => false, run: () => { throw new Error('unused'); } };
    s.objectsOf()[0].params.style.params.fillDensity = 80;
    const ink = s.group.scenePaths;
    const paths = s.composePreview();
    expect(paths).not.toBe(ink);
    expect(signature(paths)).toBe(signature(s.composeFull()));
    expect(s.eng.sceneComposeStats.bakeHolds).toBe(0);
  });

  it('a failed worker job turns the hold off, so the next frame composes in place', async () => {
    const s = mezzo();
    s.composeFull();
    const client = { available: () => true, run: () => ({ promise: Promise.reject(new Error('worker error')), cancel() {} }) };
    s.eng.sceneBakeClient = client;
    s.objectsOf()[0].params.style.params.fillDensity = 70;
    const ink = s.group.scenePaths;
    expect(s.composePreview()).toBe(ink);
    await until(() => s.group._sceneBakeOffFailed);
    s.objectsOf()[0].params.style.params.fillDensity = 72;
    const paths = s.composePreview();
    expect(paths).not.toBe(ink);
    expect(signature(paths)).toBe(signature(s.composeFull()));
  });
});
