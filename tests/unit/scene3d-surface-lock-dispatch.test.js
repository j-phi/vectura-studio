const { loadSurfaceLockRuntime, buildSurfaceLockScene, signature } = require('../helpers/surface-lock-scene');

// Surface-locked fills, Level F dispatch (docs/surface-lock-contract.md §6.1, §8, §12, §14).
// The curved branch of algorithms/scene3d.js asks SurfaceLock for a framed MarkSet when the style says
// markSpace 'surface'; the clip/emit loop that follows is unchanged. Everything here is driven through
// engine.addLayer (buildSurfaceLockScene), so defaults and the factory preset are in play.

const LAWS = [
  { name: 'mezzo', toneLaw: 'mezzoRegion' },
  { name: 'ladder hatch', toneLaw: 'ladder' },
];

describe('surface lock Level F dispatch', () => {
  let rt; let V; let SL; let realFrameable;
  let R; // the default sphere's radius, read from the leaf the engine creates (never a literal)
  beforeAll(async () => {
    rt = await loadSurfaceLockRuntime(); V = rt.V; SL = V.Scene3D.SurfaceLock;
    // This file guards Level F (the per-object dispatch); a default sphere is now Level S (scene3d-surface-lock-scene-frame), so switch it off here.
    realFrameable = SL.frameable; SL.frameable = () => false;
    R = buildSurfaceLockScene(V, { kind: 'sphere', ground: false, shadow: false }).objectsOf()[0].params.params.radius;
  });
  afterAll(() => { SL.frameable = realFrameable; if (rt) rt.cleanup(); });

  const build = (law, extra = {}) => buildSurfaceLockScene(V, {
    kind: 'sphere', toneLaw: law, mapper: 'hatch', markSpace: 'surface', shadow: false, ground: false, ...extra,
  });

  // Spy on SurfaceLock.frame: keeps every call's (markSet, pose, view) and the lines it returned.
  const spyFrame = () => {
    const real = SL.frame; const calls = [];
    SL.frame = (sets, pose, view) => {
      const lines = real(sets, pose, view);
      calls.push({ ms: Array.isArray(sets) ? sets[0] : sets, pose, view, lines });
      return lines;
    };
    return { calls, restore: () => { SL.frame = real; } };
  };

  const rotMat = (a) => {
    const rot = V.Geometry3D.makeRotator(a);
    const ex = rot({ x: 1, y: 0, z: 0 }); const ey = rot({ x: 0, y: 1, z: 0 }); const ez = rot({ x: 0, y: 0, z: 1 });
    return [ex.x, ey.x, ez.x, ex.y, ey.y, ez.y, ex.z, ey.z, ez.z];
  };
  const mulV = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
  const mulVT = (M, v) => [M[0] * v[0] + M[3] * v[1] + M[6] * v[2], M[1] * v[0] + M[4] * v[1] + M[7] * v[2], M[2] * v[0] + M[5] * v[1] + M[8] * v[2]];

  // Screen point (+ the frame's own camera z) -> object space. Inverse of contract §4.
  const toObject = (pose, pt) => {
    const c = pose.cam; const o = pose.obj;
    const camR = rotMat({ yaw: c.yaw, pitch: c.pitch, roll: c.roll });
    const objR = rotMat({ yaw: o.yaw, pitch: o.pitch, roll: o.roll });
    let sv = c.scale;
    if (c.persp) sv = c.focal / (c.focal + c.dist - pt.z) * c.scale;
    const cam = [(pt.x - c.cx) / sv, (c.cy - pt.y) / sv, pt.z];
    const w = mulVT(camR, cam);
    return { obj: mulVT(objR, [w[0] - o.x, w[1] - o.y, w[2] - o.z]), objR };
  };

  const distToSegment = (p, a, b) => {
    const ex = b[0] - a[0]; const ey = b[1] - a[1]; const ez = b[2] - a[2];
    const L2 = ex * ex + ey * ey + ez * ez || 1e-12;
    let t = ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey + (p[2] - a[2]) * ez) / L2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - a[0] - t * ex, p[1] - a[1] - t * ey, p[2] - a[2] - t * ez);
  };

  const setLightAz = (scene, az) => {
    (scene.group.params.lights || []).forEach((l) => { l.azimuth = az; });
    scene.eng.getLayerDescendants(scene.gid).filter((l) => l && l.type === 'sceneLight3d')
      .forEach((l) => { l.params.azimuth = az; });
  };

  LAWS.forEach(({ name, toneLaw }) => {
    describe(name, () => {
      it('§14.1 the bake survives a 36-yaw sweep and a light-azimuth sweep (one miss, the rest hits)', () => {
        const scene = build(toneLaw);
        SL.clearCache(); SL.resetStats();
        for (let i = 0; i < 36; i++) { scene.setPose({ camYaw: i * 10, camPitch: 20 }); scene.composeFull(); }
        const afterYaw = { ...SL.stats };
        expect(afterYaw.frames, 'every yaw drew a frame').toBeGreaterThanOrEqual(36);
        expect(afterYaw.bakeMisses).toBe(1);
        expect(afterYaw.bakeHits).toBe(afterYaw.bakes - 1);
        expect(afterYaw.bakeErrors).toBe(0);
        for (let i = 0; i < 12; i++) { setLightAz(scene, i * 30); scene.composeFull(); }
        expect(SL.stats.bakeMisses, 'light azimuth never rebakes').toBe(1);
        expect(SL.stats.bakeHits).toBe(SL.stats.bakes - 1);
        expect(SL.stats.frames).toBeGreaterThanOrEqual(48);
      });

      it('§14.3 every fill point, inverse-transformed, lies on the MarkSet (< 1e-6 mm) at 8 poses', () => {
        const scene = build(toneLaw);
        const spy = spyFrame();
        const poses = [{ camYaw: -30, camPitch: 20 }, { camYaw: 0, camPitch: 20 }, { camYaw: 35, camPitch: 10 }, { camYaw: 80, camPitch: 30 },
          { camYaw: 150, camPitch: 5 }, { camYaw: -120, camPitch: 45 }, { camYaw: -30, camPitch: 20, objYaw: 40 }, { camYaw: -30, camPitch: 20, objYaw: -75 }];
        try {
          poses.forEach((pose) => {
            spy.calls.length = 0;
            scene.setPose(pose); scene.composeFull();
            expect(spy.calls.length).toBeGreaterThan(0);
            const { ms, pose: fp, lines } = spy.calls[spy.calls.length - 1];
            const P = ms.positions;
            const segs = [];
            for (let r = 0; r < ms.runCount; r++) {
              for (let v = ms.runStart[r]; v < ms.runStart[r + 1] - 1; v++) {
                segs.push([[P[3 * v], P[3 * v + 1], P[3 * v + 2]], [P[3 * v + 3], P[3 * v + 4], P[3 * v + 5]]]);
              }
            }
            // A bounded sample of the framed vertices; each is matched against the MarkSet's own segments.
            const pts = [];
            lines.forEach((ln) => ln.forEach((pt) => pts.push(pt)));
            expect(pts.length).toBeGreaterThan(200);
            const step = Math.max(1, Math.floor(pts.length / 150));
            let worst = 0;
            for (let i = 0; i < pts.length; i += step) {
              const q = toObject(fp, pts[i]).obj;
              let best = Infinity;
              // Prefilter by sphere shell: only segments whose endpoint is near q can be nearest.
              for (let s = 0; s < segs.length; s++) {
                const a = segs[s][0];
                if (Math.abs(a[0] - q[0]) > 1.2 || Math.abs(a[1] - q[1]) > 1.2 || Math.abs(a[2] - q[2]) > 1.2) continue;
                const d = distToSegment(q, a, segs[s][1]);
                if (d < best) best = d;
              }
              worst = Math.max(worst, best);
            }
            // Float32 positions: the MarkSet stores them at 1e-7 relative, well inside the 1e-6 mm bar at this R.
            expect(worst, JSON.stringify(pose)).toBeLessThan(1e-6);
          });
        } finally { spy.restore(); }
      });

      // Ink per unit SURFACE area by intensity band (contract §14.4). Ink is measured on the surface (object-space chord
      // length) and area on the surface too, so foreshortening toward the limb cancels and only the tone law is left.
      // `sphereZ` places a z-less (pose-mode) screen point on the front hemisphere.
      const bandDensities = (fp, toneFn, lines, sphereZ) => {
        const intensityAt = (sx, sy, sz) => {
          const { obj, objR } = toObject(fp, { x: sx, y: sy, z: sz });
          const n = mulV(objR, [obj[0] / R, obj[1] / R, obj[2] / R]);
          const w = mulV(objR, obj);
          return toneFn({ x: n[0], y: n[1], z: n[2] }, { x: w[0] + fp.obj.x, y: w[1] + fp.obj.y, z: w[2] + fp.obj.z });
        };
        const B = 5; const ink = new Array(B).fill(0); const area = new Array(B).fill(0);
        const bandOf = (I) => Math.max(0, Math.min(B - 1, Math.floor(I * B)));
        if (fp.cam.persp) throw new Error('this rig is orthographic');
        const sc = fp.cam.scale; const cell = 0.25;
        const camR = rotMat({ yaw: fp.cam.yaw, pitch: fp.cam.pitch, roll: fp.cam.roll });
        const cc = mulV(camR, [fp.obj.x, fp.obj.y, fp.obj.z]);
        const cx = fp.cam.cx + cc[0] * sc; const cy = fp.cam.cy - cc[1] * sc; const rr = R * sc;
        const facingAt = (x, y) => { const dx = (x - cx) / sc; const dy = (cy - y) / sc; return Math.sqrt(Math.max(0, R * R - dx * dx - dy * dy)) / R; };
        const withZ = (pt) => (sphereZ ? { x: pt.x, y: pt.y, z: cc[2] + facingAt(pt.x, pt.y) * R } : pt);
        lines.forEach((ln) => {
          for (let i = 1; i < ln.length; i++) {
            const a = withZ(ln[i - 1]); const b = withZ(ln[i]);
            const pa = toObject(fp, a).obj; const pb = toObject(fp, b).obj;
            const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
            ink[bandOf(intensityAt(m.x, m.y, m.z))] += Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
          }
        });
        // Area: a screen grid over the disc; each cell is 1/facing of surface area. The grazing ring the frame culls
        // (facing < NZ_CULL) is left out of the area as well.
        for (let x = cx - rr; x <= cx + rr; x += cell) {
          for (let y = cy - rr; y <= cy + rr; y += cell) {
            const facing = facingAt(x, y);
            if (facing < V.SCENE3D_SURFACE_LOCK.NZ_CULL) continue;
            area[bandOf(intensityAt(x, y, cc[2] + facing * R))] += (cell / sc) * (cell / sc) / facing;
          }
        }
        return { dens: ink.map((l, i) => (area[i] > 40 ? l / area[i] : null)), ink, area };
      };

      it('§14.4 ink per surface area falls as the light intensity I rises (area-normalised bands)', () => {
        const scene = build(toneLaw);
        const spy = spyFrame();
        try {
          scene.setPose({ camYaw: -30, camPitch: 20 }); scene.composeFull();
          const { pose: fp, view, lines } = spy.calls[spy.calls.length - 1];
          expect(typeof view.toneFn).toBe('function');
          const { dens, ink, area } = bandDensities(fp, view.toneFn, lines, false);
          const have = dens.filter((d) => d !== null);
          expect(have.length, JSON.stringify({ ink, area })).toBeGreaterThanOrEqual(3);
          // The darkest band demands more than the plot floor can draw at the limb (the floor cap, contract §5), so it
          // saturates: it only has to stay within 25% of the next band. From there on ink must not rise with I.
          expect(have[0], JSON.stringify(dens)).toBeGreaterThanOrEqual(have[1] * 0.75);
          for (let i = 2; i < have.length; i++) expect(have[i], JSON.stringify(dens)).toBeLessThanOrEqual(have[i - 1] * 1.08 + 1e-6);
          expect(have[have.length - 1], JSON.stringify(dens)).toBeLessThan(have[0] * 0.85);
        } finally { spy.restore(); }
      });

      // Contract §14.4 tone RANGE: the surface fill's dark/lit density ratio against the pose fill's own (same pose, same
      // tone function, same measure). Mezzo meets the bar since FX-P (capToneRemap, p0 x 1.2).
      it('§14.4 TONE RANGE: surface dark/lit density ratio >= 0.5 x the pose ratio', () => {
        const pose = { camYaw: -30, camPitch: 20 };
        const surf = build(toneLaw);
        const spy = spyFrame();
        let fp; let toneFn; let surfLines;
        try {
          surf.setPose(pose); surf.composeFull();
          ({ pose: fp, lines: surfLines } = spy.calls[spy.calls.length - 1]);
          toneFn = spy.calls[spy.calls.length - 1].view.toneFn;
        } finally { spy.restore(); }
        const ratio = (d) => { const have = d.filter((x) => x !== null); return have[0] / have[have.length - 1]; };
        const surfRatio = ratio(bandDensities(fp, toneFn, surfLines, false).dens);
        const flat = build(toneLaw, { markSpace: 'pose' });
        flat.setPose(pose);
        const poseLines = flat.fills(flat.composeFull()).map((f) => f.map((pt) => ({ x: pt.x, y: pt.y })));
        expect(poseLines.length).toBeGreaterThan(20);
        const poseRatio = ratio(bandDensities(fp, toneFn, poseLines, true).dens);
        expect(surfRatio, `surface ${surfRatio} vs pose ${poseRatio}`).toBeGreaterThanOrEqual(0.5 * poseRatio);
      });

      it('§14.5 no fill endpoint strays more than 0.15 mm outside the silhouette', () => {
        const scene = build(toneLaw);
        const paths = scene.composeFull();
        const outline = [];
        scene.edges(paths).forEach((p) => { if (Array.isArray(p)) p.forEach((pt) => outline.push({ x: pt.x, y: pt.y })); });
        const hull = (pts) => {
          const p = pts.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
          const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
          const lo = []; for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
          const up = []; for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
          lo.pop(); up.pop(); return lo.concat(up);
        };
        const H = hull(outline);
        const outside = (x, y) => {
          let inside = true; let best = Infinity;
          for (let i = 0; i < H.length; i++) {
            const a = H[i]; const b = H[(i + 1) % H.length];
            const ex = b.x - a.x; const ey = b.y - a.y; const L = Math.hypot(ex, ey) || 1e-12;
            if (ex * (y - a.y) - ey * (x - a.x) < 0) inside = false;
            const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / (L * L)));
            best = Math.min(best, Math.hypot(x - a.x - t * ex, y - a.y - t * ey));
          }
          return inside ? 0 : best;
        };
        const fills = scene.fills(paths);
        expect(fills.length).toBeGreaterThan(20);
        let worst = 0;
        fills.forEach((f) => { [f[0], f[f.length - 1]].forEach((pt) => { worst = Math.max(worst, outside(pt.x, pt.y)); }); });
        expect(worst).toBeLessThanOrEqual(0.15);
      });

      // Contract §14.6 asks for 0.8 x floorPitch between any two drawn runs away from the limb. Cut ends are exempt (a tone
      // or facing cut ends a run wherever the demand crosses its rank, next to whatever else is drawn there).
      const minRunGap = () => {
        const scene = build(toneLaw);
        const spy = spyFrame();
        try {
          scene.setPose({ camYaw: -30, camPitch: 20 }); scene.composeFull();
          const { lines, pose: fp, ms, view } = spy.calls[spy.calls.length - 1];
          // Active floor (decision O1): a law may declare its own floor in pen widths (meta.floorPitchPen); else the plot floor.
          const declared = ms && ms.meta && ms.meta.floorPitchPen;
          const pen = Number.isFinite(view.penWidth) ? view.penWidth : 0.3;
          const floorPitch = Number.isFinite(declared) && declared > 0 ? declared * pen : V.Scene3D.Regions.PLOT_FLOOR_PEN * 0.3;
          const camR = rotMat({ yaw: fp.cam.yaw, pitch: fp.cam.pitch, roll: fp.cam.roll });
          const cc = mulV(camR, [fp.obj.x, fp.obj.y, fp.obj.z]);
          const cx = fp.cam.cx + cc[0] * fp.cam.scale; const cy = fp.cam.cy - cc[1] * fp.cam.scale; const rr = R * fp.cam.scale;
          const cellSz = floorPitch * 2;
          const grid = new Map();
          const key = (i, j) => `${i},${j}`;
          const segs = [];
          lines.forEach((ln, li) => {
            for (let i = 1; i < ln.length; i++) {
              const sg = { a: ln[i - 1], b: ln[i], li };
              const id = segs.push(sg) - 1;
              const x0 = Math.floor(Math.min(sg.a.x, sg.b.x) / cellSz); const x1 = Math.floor(Math.max(sg.a.x, sg.b.x) / cellSz);
              const y0 = Math.floor(Math.min(sg.a.y, sg.b.y) / cellSz); const y1 = Math.floor(Math.max(sg.a.y, sg.b.y) / cellSz);
              for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
                const k = key(gx, gy); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(id);
              }
            }
          });
          const segDist = (px, py, a, b) => {
            const ex = b.x - a.x; const ey = b.y - a.y; const L2 = ex * ex + ey * ey || 1e-12;
            const t = Math.max(0, Math.min(1, ((px - a.x) * ex + (py - a.y) * ey) / L2));
            return Math.hypot(px - a.x - t * ex, py - a.y - t * ey);
          };
          const nearLimb = (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - rr) < 0.5;
          let min = Infinity; let where = null; let compared = 0;
          lines.forEach((ln, li) => {
            const first = ln[0]; const last = ln[ln.length - 1];
            for (let i = 1; i < ln.length; i++) {
              const a = ln[i - 1]; const b = ln[i]; const len = Math.hypot(b.x - a.x, b.y - a.y);
              const n = Math.max(1, Math.round(len / 0.25));
              for (let k = 0; k <= n; k++) {
                const t = k / n; const px = a.x + t * (b.x - a.x); const py = a.y + t * (b.y - a.y);
                if (nearLimb(px, py)) continue;
                if (Math.hypot(px - first.x, py - first.y) < 0.5 || Math.hypot(px - last.x, py - last.y) < 0.5) continue;
                const gx = Math.floor(px / cellSz); const gy = Math.floor(py / cellSz);
                for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                  const ids = grid.get(key(gx + dx, gy + dy)); if (!ids) continue;
                  for (let q = 0; q < ids.length; q++) {
                    const sg = segs[ids[q]];
                    if (sg.li === li) continue;
                    compared += 1;
                    const d = segDist(px, py, sg.a, sg.b);
                    if (d < min) { min = d; where = [Math.round(px * 100) / 100, Math.round(py * 100) / 100]; }
                  }
                }
              }
            }
          });
          return { min, where, floorPitch, compared };
        } finally { spy.restore(); }
      };

      it('§14.6 drawn runs keep clear of each other (regression bar: 0.6 x the active floor pitch)', () => {
        const { min, where, floorPitch, compared } = minRunGap();
        expect(compared).toBeGreaterThan(1000);
        expect(min, `at ${where}`).toBeGreaterThanOrEqual(0.6 * floorPitch);
      });

      // The contract bar, against the ACTIVE floor (decision O1). Mezzo declares its own floor (meta.floorPitchPen, the pose
      // mezzo's dark pitch) and meets 0.8 x it (measured 0.803). The ladder measures ~0.71 x the plot floor mid-run (W1 baker /
      // prepass spacing, a follow-up for the baker owners): it.fails keeps that bar visible and turns red the day it is met.
      const contractIt = toneLaw === 'mezzoRegion' ? it : it.fails;
      contractIt('§14.6 CONTRACT BAR: no two drawn runs closer than 0.8 x the active floor pitch', () => {
        const { min, where, floorPitch } = minRunGap();
        expect(min, `at ${where}`).toBeGreaterThanOrEqual(0.8 * floorPitch);
      });

      // The fill POINTS are the Level F half of drag == export. `sceneTarget.depth` is the nearest-face depth of the
      // (draft-tessellated) mesh record, an ordering hint outside the lock path, so it is left out of the comparison.
      const draftParity = (extra) => {
        const scene = build(toneLaw, extra);
        const reg = V.AlgorithmRegistry.scene3d; const realGen = reg.generate;
        let captured = null;
        reg.generate = (...args) => { captured = args; return realGen(...args); };
        SL.resetStats();
        try { scene.composeFull(); } finally { reg.generate = realGen; }
        expect(captured, 'the engine called scene3d.generate').toBeTruthy();
        expect(SL.stats.frames, 'the group is surface-locked').toBeGreaterThan(0);
        const [params, rng, noise, bounds] = captured;
        const strip = (paths) => paths.map((p) => { const q = p.slice(); q.meta = { ...p.meta, sceneTarget: { ...p.meta.sceneTarget, depth: 0 } }; return q; });
        const run = (fastPreview) => signature(strip(reg.generate(params, rng, noise, { ...bounds, fastPreview }).filter((p) => p && p.meta && p.meta.kind === 'sceneFill')));
        const full = run(false); const draft = run(true);
        expect(full.length).toBeGreaterThan(1000);
        return draft === full;
      };

      it('draft parity: fastPreview true and false give identical fill paths for a surface group', () => {
        expect(draftParity()).toBe(true);
      });

      // G2: the tone shape (gamma, contrast, depth fade) was gated on the draft tier, so a drag frame drew the identity
      // curve and the settled frame / export drew the shaped one.
      it('draft parity holds with toneGamma 1.8', () => { expect(draftParity({ style: { toneGamma: 1.8 } })).toBe(true); });
      it('draft parity holds with toneContrast 0.4', () => { expect(draftParity({ style: { toneContrast: 0.4 } })).toBe(true); });

      it('tone off draws the user Density pitch, not the plot floor (F-A1)', () => {
        const scene = build(toneLaw);
        scene.group.params.tone = { ...scene.group.params.tone, enabled: false };
        const spy = spyFrame();
        try {
          scene.setPose({ camYaw: -30, camPitch: 20 }); scene.composeFull();
          const { lines, view, pose: fp } = spy.calls[spy.calls.length - 1];
          expect(view.toneFn, 'no tone function when tone is off').toBeNull();
          // Ink on the surface per surface area of the front hemisphere (2 pi R^2, less the culled grazing ring).
          let ink = 0;
          lines.forEach((ln) => {
            for (let i = 1; i < ln.length; i++) {
              const a = toObject(fp, ln[i - 1]).obj; const b = toObject(fp, ln[i]).obj;
              ink += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
            }
          });
          const cull = V.SCENE3D_SURFACE_LOCK.NZ_CULL;
          const perMm = ink / (2 * Math.PI * R * R * (1 - cull));
          const density = 1 / 7.5;            // hatchSpacing(50): the user's Density
          const floor = 1 / (V.Scene3D.Regions.PLOT_FLOOR_PEN * 0.3);
          if (toneLaw === 'ladder') {
            expect(perMm).toBeGreaterThan(density * 0.7);
            expect(perMm).toBeLessThan(density * 1.3);
            expect(perMm).toBeLessThan(floor * 0.3);
          } else {
            expect(perMm).toBeGreaterThan(0);
          }
        } finally { spy.restore(); }
      });

      it('a baker that throws falls back to exactly the pose-mode output', () => {
        const baker = V.Scene3D[toneLaw === 'mezzoRegion' ? 'SurfaceLockMezzo' : 'SurfaceLockLadder'];
        // One scene, so layer ids (they are in the path meta) match: the throwing surface compose, then the same
        // scene with the key removed.
        const scene = build(toneLaw);
        SL.clearCache(); SL.resetStats();
        const realBake = baker.bake;
        baker.bake = () => { throw new Error('boom'); };
        let sig;
        try { sig = signature(scene.composeFull()); } finally { baker.bake = realBake; }
        expect(SL.stats.bakeErrors).toBeGreaterThan(0);
        expect(SL.stats.frames).toBe(0);
        delete scene.objectsOf()[0].params.style.params.markSpace;
        expect(sig === signature(scene.composeFull())).toBe(true);
      });
    });
  });

  // G8: the one-group gate was read off the FRONT faces, so an object with a style override on its back side changed mode
  // mid-orbit. The gate is now a property of the object (any per-face override, or more than one fill style over ALL faces).
  describe('face-style gate is pose-independent (G8)', () => {
    it('a yaw sweep of 12 on a sphere with one back-face style override frames the same number of times per compose', () => {
      const scene = build('ladder');
      const reg = V.AlgorithmRegistry.scene3d; const realGen = reg.generate;
      let captured = null;
      reg.generate = (...args) => { captured = args; return realGen(...args); };
      try { scene.composeFull(); } finally { reg.generate = realGen; }
      const [params, , , bounds] = captured;
      const rec = V.Scene3D.Scene.assembleScene(params, bounds).objects[0];
      // A back face near the equator, so a camera orbit brings it round to the front (a polar face never would).
      const back = rec.faces.filter((fc) => !fc.front && fc.normalWorld)
        .sort((x, y) => Math.abs(x.normalWorld.y) - Math.abs(y.normalWorld.y))[0];
      expect(back, 'the start pose has a back face').toBeTruthy();
      const leaf = scene.objectsOf()[0];
      const base = JSON.parse(JSON.stringify(leaf.params.style));
      base.params = { ...base.params, fillDensity: 80 };
      leaf.params.faceStyles = { [back.faceId]: base };
      const frames = [];
      for (let i = 0; i < 12; i++) {
        scene.setPose({ camYaw: i * 30, camPitch: 20 });
        SL.resetStats(); scene.composeFull();
        frames.push(SL.stats.frames);
      }
      expect(new Set(frames).size, JSON.stringify(frames)).toBe(1);
    });
  });

  // Tone memo (FX-A view.toneKey + FX-D key). The memo is filled lazily per vertex, so a repeat
  // compose at the same pose makes 0 tone evaluations and a new yaw evaluates only newly seen vertices.
  describe('tone memo across camera yaw', () => {
    it('a repeat compose makes 0 tone evaluations; a new yaw evaluates fewer than the first', () => {
      const scene = build('mezzoRegion');
      SL.clearCache(); SL.resetStats();
      scene.setPose({ camYaw: -30, camPitch: 20 }); scene.composeFull();
      const first = SL.stats.toneEvals;
      expect(first).toBeGreaterThan(0);
      SL.resetStats();
      scene.composeFull();
      expect(SL.stats.frames).toBeGreaterThan(0);
      expect(SL.stats.toneEvals).toBe(0);
      SL.resetStats();
      scene.setPose({ camYaw: 20, camPitch: 20 }); scene.composeFull();
      expect(SL.stats.toneEvals).toBeLessThan(first);
    });
  });

  describe('exclusions (contract §12) at the dispatch', () => {
    it("highlightTreatment 'keep' stays surface; 'thin' renders pose byte-identically", () => {
      SL.clearCache(); SL.resetStats();
      build('ladder', { style: { highlightTreatment: 'keep' } }).composeFull();
      expect(SL.stats.frames, "'keep' is surface").toBeGreaterThan(0);

      // W3-E: addLayer now bakes the freshly born (surface) scene before the style is applied, so zero the counters AFTER build.
      const thin = build('ladder', { style: { highlightTreatment: 'thin' } });
      SL.resetStats();
      const thinSig = signature(thin.composeFull());
      expect(SL.stats.frames, "'thin' never frames").toBe(0);
      delete thin.objectsOf()[0].params.style.params.markSpace;
      expect(thinSig === signature(thin.composeFull())).toBe(true);
    });

    it('a pose-mode style never touches SurfaceLock', () => {
      const poseScene = build('ladder', { markSpace: 'pose' });
      SL.resetStats(); // W3-E: after build (addLayer's creation compose is surface); only the pose compose is measured
      poseScene.composeFull();
      expect(SL.stats.bakes + SL.stats.frames).toBe(0);
    });
  });
});
