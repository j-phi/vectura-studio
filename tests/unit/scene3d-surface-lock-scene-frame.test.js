const { loadSurfaceLockRuntime, buildSurfaceLockScene, signature, DEFAULT_POSES } = require('../helpers/surface-lock-scene');

// Surface-locked fills, Level S (docs/surface-lock-contract.md §6.2, §7, §10, §13): when every object in a Scene3D is a
// surface-locked fill (or draws none) the whole scene composes through SurfaceLock.sceneFrame from cached data: fills,
// silhouette outlines through the occluder, the ground cast shadow, the ground outline. No assembleScene, no edge
// classification, no HLR, no shadow rebuild. Anything else renders as before (Level F, then pose mode).
// Every scene is built through engine.addLayer (buildSurfaceLockScene), so defaults and the factory preset are in play.

const LAWS = [
  { name: 'mezzo', toneLaw: 'mezzoRegion' },
  { name: 'ladder', toneLaw: 'ladder' },
];

describe('surface lock Level S (sceneFrame wired into generateScene)', () => {
  let rt; let V; let SL;
  beforeAll(async () => { rt = await loadSurfaceLockRuntime(); V = rt.V; SL = V.Scene3D.SurfaceLock; });
  afterAll(() => rt && rt.cleanup());

  const build = (law, extra = {}) => buildSurfaceLockScene(V, {
    kind: 'sphere', toneLaw: law, mapper: 'hatch', markSpace: 'surface', ...extra,
  });
  // Two overlapping spheres, both surface-locked (the second is added through the engine like the panel does).
  const buildTwo = (law) => {
    const s = build(law);
    const id = s.eng.addObjectToScene(s.gid, 'sphere');
    const leaf = s.eng.getLayerById(id);
    const first = s.objectsOf()[0];
    leaf.params.transform = { ...(leaf.params.transform || {}), x: 30, y: 25, z: 0 };
    leaf.params.params = { ...(leaf.params.params || {}), radius: 25 };
    leaf.params.style = JSON.parse(JSON.stringify(first.params.style));
    s.setPose({ camYaw: -30, camPitch: 20 });
    return s;
  };

  // Run `fn` with Level S switched off (frameable() false): the scene composes as Level F / pose mode.
  const withoutLevelS = (fn) => {
    const real = SL.frameable; SL.frameable = () => false;
    try { return fn(); } finally { SL.frameable = real; }
  };
  const spyCalls = (obj, key) => {
    const real = obj[key]; const calls = { n: 0 };
    obj[key] = function spy(...a) { calls.n += 1; return real.apply(this, a); };
    calls.restore = () => { obj[key] = real; };
    return calls;
  };

  // The generateScene half of drag == export: a drag frame (bounds.fastPreview) and a settled/export frame give the same
  // paths. (The engine's own preview tiers, PosePreview warp and SpinRing are W2-B; Level S must simply not read `draft`.)
  const dragVsExport = (s, poses) => {
    const gen = (fast) => {
      const p = s.group._sceneAssembled;
      const b = { width: 320, height: 220, penWidth: 0.3, ...(fast ? { fastPreview: true } : {}) };
      return V.AlgorithmRegistry.scene3d.generate(JSON.parse(JSON.stringify(p)), null, null, b);
    };
    return poses.map((pose) => {
      s.setPose(pose); s.composeFull(); // refreshes _sceneAssembled for the pose
      const a = gen(true); const b = gen(false);
      return { pose, equal: signature(a) === signature(b), previewPaths: a.length };
    });
  };
  const objectId = (s) => s.objectsOf()[0].id;
  const metaOf = (p) => (p && p.meta) || {};
  const tgt = (p) => metaOf(p).sceneTarget || {};
  const isShadow = (p) => tgt(p).regionClass === 'castShadow';
  const fillsOf = (paths, id) => paths.filter((p) => metaOf(p).kind === 'sceneFill' && tgt(p).objectId === id);
  const shadowsOf = (paths) => paths.filter(isShadow);
  const edgesOf = (paths, id, cls) => paths.filter((p) => metaOf(p).kind === 'sceneEdge' && tgt(p).objectId === id && (!cls || tgt(p).edgeClass === cls));
  const len = (path) => { let l = 0; for (let i = 1; i < path.length; i++) l += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y); return l; };
  const totalLen = (paths) => paths.reduce((a, p) => a + len(p), 0);
  const ptsKey = (paths, f = 1e6) => JSON.stringify(paths.map((p) => p.map((q) => [Math.round(q.x * f) / f, Math.round(q.y * f) / f])));

  // Spatial hash of segments for "distance from a point to this path set".
  const segIndex = (paths, cell = 2) => {
    const grid = new Map();
    const add = (k, seg) => { (grid.get(k) || grid.set(k, []).get(k)).push(seg); };
    paths.forEach((p) => {
      for (let i = 1; i < p.length; i++) {
        const a = p[i - 1]; const b = p[i];
        const x0 = Math.floor(Math.min(a.x, b.x) / cell); const x1 = Math.floor(Math.max(a.x, b.x) / cell);
        const y0 = Math.floor(Math.min(a.y, b.y) / cell); const y1 = Math.floor(Math.max(a.y, b.y) / cell);
        for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) add(`${gx}|${gy}`, [a, b]);
      }
    });
    const dSeg = (q, [a, b]) => {
      const dx = b.x - a.x; const dy = b.y - a.y; const L2 = dx * dx + dy * dy || 1e-12;
      const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2));
      return Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
    };
    return (q, reach = 1) => {
      let best = Infinity;
      const gx = Math.floor(q.x / cell); const gy = Math.floor(q.y / cell);
      for (let dx = -reach; dx <= reach; dx++) for (let dy = -reach; dy <= reach; dy++) {
        (grid.get(`${gx + dx}|${gy + dy}`) || []).forEach((s) => { best = Math.min(best, dSeg(q, s)); });
      }
      return best;
    };
  };
  // Length of `paths` (sampled every 0.5 mm) that lies within `tol` of `ref`.
  const agreement = (paths, ref, tol) => {
    const near = segIndex(ref); let hit = 0; let all = 0;
    paths.forEach((p) => {
      for (let i = 1; i < p.length; i++) {
        const a = p[i - 1]; const b = p[i]; const L = Math.hypot(b.x - a.x, b.y - a.y);
        const n = Math.max(1, Math.ceil(L / 0.5));
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n; const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
          all += L / n; if (near(q) <= tol) hit += L / n;
        }
      }
    });
    return { frac: all > 0 ? hit / all : 1, length: all };
  };

  describe('the default sphere scene (ground and cast shadow on)', () => {
    LAWS.forEach(({ name, toneLaw }) => {
      it(`${name}: composes through sceneFrame with no mesh assembly, edge classification or shadow rebuild (§13)`, () => {
        const s = build(toneLaw);
        s.setPose({ camYaw: -30, camPitch: 20 });
        s.composeFull();
        expect(SL.frameable(V.Scene3D.Params.normalizeParams(s.group._sceneAssembled), { width: 320, height: 220, penWidth: 0.3 })).toBe(true);
        const asm = spyCalls(V.Scene3D.Scene, 'assembleScene');
        const shd = spyCalls(V.Scene3D.Shadows, 'build');
        const cls = spyCalls(V.Scene3D.Edges, 'classifyEdges');
        try {
          s.composeFull(); // cold: bakes
          SL.resetStats(); asm.n = 0; shd.n = 0; cls.n = 0;
          const paths = s.composeFull(); // warm
          expect(SL.stats.sceneFrames).toBe(1);
          expect(SL.stats.sceneFallbacks).toBe(0);
          expect(SL.stats.bakeHits).toBeGreaterThan(0);
          expect(asm.n).toBe(0); expect(shd.n).toBe(0); expect(cls.n).toBe(0);
          const id = objectId(s);
          expect(fillsOf(paths, id).length).toBeGreaterThan(20);
          expect(edgesOf(paths, id, 'silhouette').length).toBeGreaterThanOrEqual(1);
          expect(shadowsOf(paths).length).toBeGreaterThan(10);
          expect(edgesOf(paths, 'ground', 'boundary').length).toBe(4);
        } finally { asm.restore(); shd.restore(); cls.restore(); }
      });

      it(`${name}: the drag frame equals a fresh full compose at the 8 default poses (§0, §13)`, () => {
        const s = build(toneLaw);
        s.composeFull(); SL.resetStats();
        const rows = dragVsExport(s, DEFAULT_POSES);
        rows.forEach((r) => { expect(r.equal, JSON.stringify(r.pose)).toBe(true); expect(r.previewPaths).toBeGreaterThan(30); });
        expect(SL.stats.sceneFrames).toBeGreaterThanOrEqual(24); // 8 poses: refresh + drag + export
        expect(SL.stats.sceneFallbacks).toBe(0);
      });

      it(`${name}: fill lines match the Level F render of the same scene (§6.1 vs §6.2)`, () => {
        const s = build(toneLaw);
        [{ camYaw: -30, camPitch: 20 }, { camYaw: 40, camPitch: 10 }, { camYaw: -30, camPitch: 20, objYaw: 40 }].forEach((pose) => {
          s.setPose(pose);
          const S = s.composeFull();
          const F = withoutLevelS(() => s.composeFull());
          const id = objectId(s);
          const fs = fillsOf(S, id); const ff = fillsOf(F, id);
          expect(fs.length, JSON.stringify(pose)).toBeGreaterThan(20);
          // Same marks; Level F's clipper may drop a collinear vertex, so compare geometry, not vertex lists.
          expect(fs.length).toBe(ff.length);
          expect(Math.abs(totalLen(fs) / totalLen(ff) - 1), JSON.stringify(pose)).toBeLessThan(1e-4);
          expect(agreement(fs, ff, 0.01).frac, JSON.stringify(pose)).toBeGreaterThan(0.9999);
          expect(agreement(ff, fs, 0.01).frac, JSON.stringify(pose)).toBeGreaterThan(0.9999);
        });
      });

      it(`${name}: the silhouette and the ground outline agree with the pose-compositor render within 0.15 mm (§7)`, () => {
        const s = build(toneLaw);
        [{ camYaw: -30, camPitch: 20 }, { camYaw: 80, camPitch: 30 }].forEach((pose) => {
          s.setPose(pose);
          const S = s.composeFull();
          const F = withoutLevelS(() => s.composeFull());
          const id = objectId(s);
          const ss = edgesOf(S, id, 'silhouette'); const sf = edgesOf(F, id, 'silhouette');
          expect(ss.length).toBe(sf.length);
          expect(agreement(ss, sf, 0.15).frac, `sil ${JSON.stringify(pose)}`).toBeGreaterThan(0.99);
          expect(agreement(sf, ss, 0.15).frac, `sil back ${JSON.stringify(pose)}`).toBeGreaterThan(0.99);
          const gs = edgesOf(S, 'ground', 'boundary'); const gf = edgesOf(F, 'ground', 'boundary');
          expect(gs.length).toBe(4);
          expect(agreement(gs, gf, 0.15).frac).toBeGreaterThan(0.99);
        });
      });

      it(`${name}: the cast shadow matches the pose-compositor shadow (ink in [0.6, 1.15] x pose, same place) and stays pickable (§10)`, () => {
        const s = build(toneLaw);
        [{ camYaw: -30, camPitch: 20 }, { camYaw: 80, camPitch: 30 }, { camYaw: 0, camPitch: 45 }].forEach((pose) => {
          s.setPose(pose);
          const S = shadowsOf(s.composeFull());
          const F = shadowsOf(withoutLevelS(() => s.composeFull()));
          const ratio = totalLen(S) / totalLen(F);
          // Q3: world-fixed lines under a spacing floor may be lighter than pose; the spacing bar is the FX-S test below.
          expect(ratio, `ink ${JSON.stringify(pose)}`).toBeGreaterThan(0.6);
          expect(ratio).toBeLessThan(1.15);
          // Every locked shadow mark lies inside the pose shadow's footprint (the union of its pickPolygons).
          const poly = tgt(F[0]).pickPolygon;
          expect(Array.isArray(tgt(S[0]).pickPolygon) && tgt(S[0]).pickPolygon.length).toBeGreaterThanOrEqual(3);
          const bb = (pts) => pts.reduce((a, q) => ({ x0: Math.min(a.x0, q.x), x1: Math.max(a.x1, q.x), y0: Math.min(a.y0, q.y), y1: Math.max(a.y1, q.y) }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
          const a = bb(tgt(S[0]).pickPolygon); const b = bb(poly);
          ['x0', 'x1', 'y0', 'y1'].forEach((k) => expect(Math.abs(a[k] - b[k]), `${k} ${JSON.stringify(pose)}`).toBeLessThan(3));
          expect(metaOf(S[0]).kind).toBe('sceneFill');
          expect(tgt(S[0]).objectId).toBe('ground');
        });
      });

      it(`${name}: no fill endpoint lies more than 0.15 mm outside the drawn silhouette (§7)`, () => {
        const s = build(toneLaw);
        [{ camYaw: -30, camPitch: 20 }, { camYaw: 150, camPitch: 5 }].forEach((pose) => {
          s.setPose(pose);
          const paths = s.composeFull(); const id = objectId(s);
          const sil = edgesOf(paths, id, 'silhouette')[0];
          const inside = (q) => { let c = false; for (let i = 0, j = sil.length - 1; i < sil.length; j = i++) { if ((sil[i].y > q.y) !== (sil[j].y > q.y) && q.x < (sil[j].x - sil[i].x) * (q.y - sil[i].y) / (sil[j].y - sil[i].y) + sil[i].x) c = !c; } return c; };
          const near = segIndex([sil]);
          let worst = 0;
          fillsOf(paths, id).forEach((p) => [p[0], p[p.length - 1]].forEach((q) => { if (!inside(q)) worst = Math.max(worst, near(q, 3)); }));
          expect(worst, JSON.stringify(pose)).toBeLessThanOrEqual(0.15);
        });
      });

      it(`${name}: the tone memo works through Level S, a 1 degree orbit step re-evaluates under 2 % of the vertices (FX-A, §5)`, () => {
        const s = build(toneLaw);
        s.setPose({ camYaw: -30, camPitch: 20 }); s.composeFull();
        s.setPose({ camYaw: -29, camPitch: 20 }); s.composeFull();
        SL.resetStats();
        s.setPose({ camYaw: -28, camPitch: 20 }); s.composeFull();
        expect(SL.stats.sceneFrames).toBe(1);
        // Only vertices newly turned toward the camera are evaluated; without the memo it is every facing vertex.
        expect(SL.stats.toneEvals).toBeLessThan(0.02 * SL.stats.verticesIn);
        expect(SL.stats.bakeMisses).toBe(0);
      });
    });
  });

  describe('two overlapping spheres', () => {
    LAWS.forEach(({ name, toneLaw }) => {
      it(`${name}: drag equals export and the fill visibility agrees with Level F on >= 99 % of fill length (§7)`, () => {
        const s = buildTwo(toneLaw);
        const rows = dragVsExport(s, DEFAULT_POSES.slice(0, 4));
        rows.forEach((r) => expect(r.equal, JSON.stringify(r.pose)).toBe(true));
        [{ camYaw: -30, camPitch: 20 }, { camYaw: 60, camPitch: 15 }].forEach((pose) => {
          s.setPose(pose);
          SL.resetStats();
          const S = s.composeFull();
          expect(SL.stats.sceneFrames).toBe(1);
          const F = withoutLevelS(() => s.composeFull());
          s.objectsOf().forEach((leaf) => {
            const fs = fillsOf(S, leaf.id); const ff = fillsOf(F, leaf.id);
            expect(fs.length).toBeGreaterThan(10);
            const a = agreement(fs, ff, 0.3); const b = agreement(ff, fs, 0.3);
            expect(a.frac, `S in F ${JSON.stringify(pose)}`).toBeGreaterThanOrEqual(0.99);
            expect(b.frac, `F in S ${JSON.stringify(pose)}`).toBeGreaterThanOrEqual(0.99);
          });
        });
      });
    });
  });

  describe('scenes Level S does not take', () => {
    it('a pose-mode object composes exactly as before (no sceneFrame)', () => {
      const s = build('ladder', { markSpace: 'pose' });
      SL.resetStats();
      s.composeFull();
      expect(SL.stats.sceneFrames).toBe(0);
    });

    it('a scene whose only objects draw no fill stays pose (its outline and shadow are the pose path\'s)', () => {
      const s = build('ladder', { mapper: 'none' });
      SL.resetStats();
      s.composeFull();
      expect(SL.stats.sceneFrames).toBe(0);
    });

    it('ground off: no ground outline and no shadow; shadow off: the ground outline stays', () => {
      const noGround = build('ladder', { ground: false });
      let paths = noGround.composeFull();
      expect(SL.stats.sceneFrames).toBeGreaterThan(0);
      expect(edgesOf(paths, 'ground').length).toBe(0); expect(shadowsOf(paths).length).toBe(0);
      const noShadow = build('ladder', { shadow: false });
      SL.resetStats();
      paths = noShadow.composeFull();
      expect(SL.stats.sceneFrames).toBe(1);
      expect(edgesOf(paths, 'ground', 'boundary').length).toBe(4); expect(shadowsOf(paths).length).toBe(0);
    });

    it('a baker that throws falls back to the pose-mode render, byte for byte (counted as a fallback)', () => {
      const s = build('ladder');
      s.setPose({ camYaw: -30, camPitch: 20 });
      const pose = (() => { const q = build('ladder', { markSpace: 'pose' }); q.setPose({ camYaw: -30, camPitch: 20 }); return q.composeFull(); })();
      const baker = V.Scene3D.SurfaceLockLadder; const real = baker.bake;
      SL.clearCache(); SL.resetStats();
      baker.bake = () => { throw new Error('boom'); };
      let paths;
      try { paths = s.composeFull(); } finally { baker.bake = real; SL.clearCache(); }
      expect(SL.stats.sceneFallbacks).toBe(1);
      expect(ptsKey(paths)).toBe(ptsKey(pose));
    });

    it('a receive-shadow scene, per-object hidden-edge dashes and a filled ground are not frameable', () => {
      const s = build('ladder');
      s.composeFull();
      const p0 = JSON.parse(JSON.stringify(V.Scene3D.Params.normalizeParams(s.group._sceneAssembled)));
      const bounds = { width: 320, height: 220, penWidth: 0.3 };
      expect(SL.frameable(p0, bounds)).toBe(true);
      const recv = JSON.parse(JSON.stringify(p0)); recv.shadow = { ...(recv.shadow || {}), shadowReceiveOnObjects: true };
      expect(SL.frameable(recv, bounds)).toBe(false);
      const dash = JSON.parse(JSON.stringify(p0)); dash.edgeStylesByObject = { [dash.objects[0].id]: { hidden: { hiddenTreatment: 'dash' } } };
      expect(SL.frameable(dash, bounds)).toBe(false);
      const gfill = JSON.parse(JSON.stringify(p0)); gfill.styleTable.byObject.ground = { penId: null, mapper: 'hatch', params: {} };
      expect(SL.frameable(gfill, bounds)).toBe(false);
      const wire = JSON.parse(JSON.stringify(p0)); wire.styleTable.byObject[wire.objects[0].id].mapper = 'wireframe';
      expect(SL.frameable(wire, bounds)).toBe(false);
    });
  });

  // ── FX-S (W2-C review I1-I4, Q3, explainMarkSpace) ─────────────────────────────────────────────────────────────────
  describe('FX-S: shadow spacing floor, multi-sun, ground ring, pose emit order', () => {
    const POSES = [];
    [-30, 40, 120].forEach((yaw) => [5, 8, 12, 15, 20, 30, 45].forEach((pitch) => POSES.push({ camYaw: yaw, camPitch: pitch })));
    // Nearest distance from each sample to a DIFFERENT path (the line gap), 1st percentile.
    const gapStats = (paths) => {
      const pts = [];
      paths.forEach((p, pi) => { for (let i = 1; i < p.length; i++) {
        const a = p[i - 1]; const b = p[i]; const L = Math.hypot(b.x - a.x, b.y - a.y); const n = Math.max(1, Math.ceil(L / 0.25));
        for (let k = 0; k < n; k++) { const t = k / n; pts.push([a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, pi]); }
      } });
      const grid = new Map();
      pts.forEach((q, i) => { const k = `${Math.floor(q[0])},${Math.floor(q[1])}`; (grid.get(k) || grid.set(k, []).get(k)).push(i); });
      const d = [];
      pts.forEach((q) => {
        let best = 1e9; const cx = Math.floor(q[0]); const cy = Math.floor(q[1]);
        for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) (grid.get(`${cx + dx},${cy + dy}`) || []).forEach((j) => {
          const r = pts[j]; if (r[2] === q[2]) return; best = Math.min(best, Math.hypot(r[0] - q[0], r[1] - q[1]));
        });
        if (best < 1e9) d.push(best);
      });
      d.sort((a, b) => a - b);
      return d.length ? { p1: d[Math.floor(0.01 * (d.length - 1))], p50: d[Math.floor(0.5 * (d.length - 1))] } : null;
    };
    const FX = { measured: [] };
    LAWS.forEach(({ name, toneLaw }) => {
      it(`${name}: the locked shadow keeps its line gap >= 0.8 x pose and its ink in [0.6, 1.15] x pose (I1, Q3)`, () => {
        const s = build(toneLaw);
        const worstSpacing = []; const ink = [];
        POSES.forEach((pose) => {
          s.setPose(pose);
          const S = shadowsOf(s.composeFull());
          const F = withoutLevelS(() => shadowsOf(s.composeFull()));
          const gs = gapStats(S); const gf = gapStats(F);
          if (!gs || !gf) return;
          const ratio = gs.p1 / gf.p1; worstSpacing.push({ pose, ratio });
          // Pose may be lighter than the shadow only at low pitch; the ink bar applies at every pose.
          ink.push({ pose, ratio: totalLen(S) / totalLen(F) });
        });
        expect(worstSpacing.length).toBeGreaterThan(15);
        const minSp = Math.min(...worstSpacing.map((q) => q.ratio));
        const inkMin = Math.min(...ink.map((q) => q.ratio)); const inkMax = Math.max(...ink.map((q) => q.ratio));
        FX.measured.push({ name, minSp, inkMin, inkMax });
        // eslint-disable-next-line no-console
        console.log('FX-S shadow', name, 'min spacing ratio', minSp.toFixed(3), 'ink', inkMin.toFixed(3), inkMax.toFixed(3));
        expect(minSp).toBeGreaterThanOrEqual(0.8);
        expect(inkMin).toBeGreaterThanOrEqual(0.6);
        expect(inkMax).toBeLessThanOrEqual(1.15);
      });
    });

    it('two shadow-casting suns: every sun casts its footprint, length within 15 % of Level F (I2)', () => {
      const s = build('ladder');
      s.eng.addLightToScene(s.gid, 'directional');
      const lights = s.eng.getLayerDescendants(s.gid).filter((l) => l && l.type === 'sceneLight3d');
      expect(lights.length).toBeGreaterThan(1);
      lights.forEach((l, i) => { l.params.castShadows = true; l.params.azimuth = i === 0 ? 135 : 300; l.params.elevation = 45; });
      s.setPose({ camYaw: -30, camPitch: 20 });
      const S = shadowsOf(s.composeFull());
      const F = withoutLevelS(() => shadowsOf(s.composeFull()));
      expect(F.length).toBeGreaterThan(0);
      expect(Math.abs(totalLen(S) / totalLen(F) - 1)).toBeLessThan(0.15);
    });

    it('an enlarged ground x3: the ground outline equals Level F within 0.15 mm (I3)', () => {
      const s = build('ladder');
      const g = s.eng.getLayerDescendants(s.gid).find((l) => l && l.type === 'sceneGround3d');
      g.params.scaleX = 3; g.params.scaleZ = 3;
      s.setPose({ camYaw: -30, camPitch: 20 });
      const S = edgesOf(s.composeFull(), 'ground');
      const F = withoutLevelS(() => edgesOf(s.composeFull(), 'ground'));
      expect(F.length).toBeGreaterThan(0);
      expect(Math.abs(totalLen(S) - totalLen(F))).toBeLessThan(0.15);
      const bbox = (paths) => { const b = [Infinity, Infinity, -Infinity, -Infinity]; paths.forEach((p) => p.forEach((q) => { b[0] = Math.min(b[0], q.x); b[1] = Math.min(b[1], q.y); b[2] = Math.max(b[2], q.x); b[3] = Math.max(b[3], q.y); })); return b; };
      bbox(S).forEach((v, i) => expect(Math.abs(v - bbox(F)[i])).toBeLessThan(0.15));
    });

    it('paint and export order is the pose order: objects, then the ground outline, then the shadow last (I4)', () => {
      const s = build('ladder');
      s.setPose({ camYaw: -30, camPitch: 20 });
      const paths = s.composeFull();
      const lastObject = paths.map((p, i) => ((metaOf(p).kind === 'sceneFill' || metaOf(p).kind === 'sceneEdge') && tgt(p).objectId !== 'ground' && !isShadow(p) ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
      const firstGround = paths.findIndex((p) => tgt(p).objectId === 'ground' && !isShadow(p));
      const firstShadow = paths.findIndex(isShadow);
      expect(firstShadow).toBeGreaterThan(-1);
      expect(firstGround).toBeGreaterThan(lastObject);
      expect(firstShadow).toBeGreaterThan(firstGround);
    });

    it('explainMarkSpace names the exclusion that forces pose, or no baker, or surface', () => {
      expect(typeof SL.explainMarkSpace).toBe('function');
      expect(SL.explainMarkSpace({ markSpace: 'pose' }, {})).toEqual({ mode: 'pose', reason: 'markSpace' });
      expect(SL.explainMarkSpace({ markSpace: 'surface', toneBands: 3 }, {})).toEqual({ mode: 'pose', reason: 'toneBands' });
      expect(SL.explainMarkSpace({ markSpace: 'surface' }, { receiveShadow: true })).toEqual({ mode: 'pose', reason: 'receiveShadow' });
      expect(SL.explainMarkSpace({ markSpace: 'surface' }, { mapper: 'nonexistentMapper', spec: { mapper: 'nonexistentMapper', style: { markSpace: 'surface' } } })).toEqual({ mode: 'pose', reason: 'no baker' });
      EXCL_AGREE();
      function EXCL_AGREE() {
        SL.EXCLUSIONS.forEach((e) => {
          const r = SL.explainMarkSpace(Object.assign({ markSpace: 'surface' }, e.example.style || {}), e.example.ctx || {});
          expect(r.mode).toBe('pose'); expect(r.reason).toBe(e.id);
          expect(SL.effectiveMarkSpace(Object.assign({ markSpace: 'surface' }, e.example.style || {}), e.example.ctx || {})).toBe(r.mode);
        });
      }
    });
  });
});
