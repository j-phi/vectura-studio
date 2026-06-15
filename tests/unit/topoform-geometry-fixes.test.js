/**
 * Topoform (topoform) geometry + lighting fixes — five-part regression.
 *
 * 1. CUBE honors primitiveDetail and has uniformly outward face winding.
 * 2. SILHOUETTE coincides with the wireframe's projected outer boundary.
 * 3. PRIMITIVE WINDING audit — grid primitives are consistently outward.
 * 4. SPHERE/UV POLE de-fan — the projected pole is not an asterisk of many
 *    micro-segments.
 * 5. SCENE LIGHTING gating — light-derived output (hatch + depth-cue dashes) is
 *    suppressed unless sceneLighting === true; default output unchanged.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Topoform geometry + lighting fixes', () => {
  let runtime;
  let Vectura;
  let G3;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    Vectura = runtime.window.Vectura;
    G3 = Vectura.Geometry3D;
  });

  afterAll(() => runtime.cleanup());

  const gen = (overrides = {}) => {
    const { AlgorithmRegistry, SeededRNG, SimpleNoise } = Vectura;
    return AlgorithmRegistry.topoform.generate(
      {
        sourceMode: 'sphere',
        renderMode: 'contours',
        primitiveDetail: 12,
        primitiveScaleX: 60,
        primitiveScaleY: 60,
        primitiveScaleZ: 60,
        lineCount: 8,
        yaw: -28,
        pitch: 34,
        ...overrides,
      },
      new SeededRNG(0),
      new SimpleNoise(0),
      { width: 400, height: 400 },
    );
  };

  // Reach the module-private mesh builder by reconstructing it the same way the
  // algorithm does: we cannot import it directly (IIFE-private), so we exercise
  // it through the public render output where possible, and reflect mesh-level
  // winding via a tiny in-test mesh probe that mirrors createPrimitiveMesh
  // inputs. For mesh-structure assertions we instead drive generate() and read
  // path counts / geometry, which is what users actually see.

  const meshFor = (params) => {
    // The algorithm exposes no mesh getter; rebuild the public path output and
    // also use the shared G3 helpers to recompute normals where we need mesh
    // structure. For winding tests we use the dedicated probe below.
    return params;
  };

  // ── Mesh probe: replicate the registry's detail resolution and call into the
  // private createPrimitiveMesh by round-tripping through generate with a
  // wireframe render and counting unique projected edges is indirect; instead
  // we attach a debug hook. Since none exists, winding is validated through
  // faceNormal on the reconstructed primitive via the exported builder when
  // available, else through render-output invariants.

  // ---------------------------------------------------------------------------
  // Fix 1 — CUBE honors detail + outward winding
  // ---------------------------------------------------------------------------
  describe('Fix 1 — cube subdivision + outward winding', () => {
    const cubeMesh = (detail) => {
      // Mirror the registry: it builds the mesh then renders. We expose mesh via
      // a private debug hook installed by the algorithm (G3.__lastMesh) when the
      // env flag is set. Use that.
      Vectura.__captureMesh = true;
      gen({ sourceMode: 'cube', renderMode: 'wireframe', primitiveDetail: detail });
      const m = Vectura.__lastMesh;
      Vectura.__captureMesh = false;
      return m;
    };

    it('cube triangle count scales with primitiveDetail', () => {
      const low = cubeMesh(4);
      const high = cubeMesh(8);
      expect(low).toBeTruthy();
      expect(high).toBeTruthy();
      // 6 faces * detail^2 quads * 2 tris.
      expect(low.faces.length).toBe(6 * 4 * 4 * 2);
      expect(high.faces.length).toBe(6 * 8 * 8 * 2);
      expect(high.faces.length).toBeGreaterThan(low.faces.length);
    });

    it('every cube face normal points outward from the mesh centroid', () => {
      const m = cubeMesh(6);
      const centroid = { x: 0, y: 0, z: 0 };
      m.vertices.forEach((vt) => { centroid.x += vt.x; centroid.y += vt.y; centroid.z += vt.z; });
      const n = m.vertices.length || 1;
      centroid.x /= n; centroid.y /= n; centroid.z /= n;
      let outward = 0;
      m.faces.forEach((face) => {
        const tri = face.map((idx) => m.vertices[idx]);
        const normal = G3.faceNormal(tri);
        const fc = { x: 0, y: 0, z: 0 };
        tri.forEach((pt) => { fc.x += pt.x; fc.y += pt.y; fc.z += pt.z; });
        fc.x /= 3; fc.y /= 3; fc.z /= 3;
        const radial = { x: fc.x - centroid.x, y: fc.y - centroid.y, z: fc.z - centroid.z };
        const d = normal.x * radial.x + normal.y * radial.y + normal.z * radial.z;
        if (d > 0) outward++;
      });
      expect(outward).toBe(m.faces.length);
    });
  });

  // ---------------------------------------------------------------------------
  // Fix 2 — silhouette hugs the wireframe projected boundary
  // ---------------------------------------------------------------------------
  describe('Fix 2 — silhouette alignment with wireframe', () => {
    const bbox = (paths) => {
      let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
      paths.forEach((path) => path.forEach((pt) => {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      }));
      return { minX, minY, maxX, maxY };
    };

    it('cube silhouette points lie within the wireframe bbox (not oversized/offset)', () => {
      // Wireframe-only (no outline) for the reference boundary.
      const wire = gen({ sourceMode: 'cube', renderMode: 'wireframe', showOutline: false });
      // Outline-only contribution: render with silhouette and isolate its paths.
      const all = gen({ sourceMode: 'cube', renderMode: 'wireframe', showOutline: true });
      const sil = all.filter((p) => p.meta && p.meta.silhouette);
      expect(sil.length).toBeGreaterThan(0);
      const wb = bbox(wire);
      const diag = Math.hypot(wb.maxX - wb.minX, wb.maxY - wb.minY) || 1;
      const eps = diag * 0.02;
      sil.forEach((path) => path.forEach((pt) => {
        expect(pt.x).toBeGreaterThanOrEqual(wb.minX - eps);
        expect(pt.x).toBeLessThanOrEqual(wb.maxX + eps);
        expect(pt.y).toBeGreaterThanOrEqual(wb.minY - eps);
        expect(pt.y).toBeLessThanOrEqual(wb.maxY + eps);
      }));
    });
  });

  // ---------------------------------------------------------------------------
  // Fix 3 — grid primitive winding audit
  // ---------------------------------------------------------------------------
  describe('Fix 3 — grid primitive outward winding', () => {
    // Star-shaped solids: outward = away from the global centroid (the centroid
    // sees every surface face from "inside"). torus/torusKnot are NOT star-shaped
    // from a single point, so they use a tube-center-line reference instead.
    const starShaped = ['sphere', 'ellipsoid', 'cone', 'cylinder', 'capsule', 'pyramid', 'superellipsoid'];
    const tubes = ['torus', 'torusKnot'];

    const captureMesh = (sourceMode) => {
      Vectura.__captureMesh = true;
      gen({ sourceMode, renderMode: 'wireframe', primitiveDetail: 10 });
      const m = Vectura.__lastMesh;
      Vectura.__captureMesh = false;
      return m;
    };

    const faceCentroid = (tri) => {
      const fc = { x: 0, y: 0, z: 0 };
      tri.forEach((pt) => { fc.x += pt.x; fc.y += pt.y; fc.z += pt.z; });
      fc.x /= 3; fc.y /= 3; fc.z /= 3;
      return fc;
    };

    // Fraction of faces whose normal agrees with the supplied outward reference.
    const outwardFraction = (m, outwardRef) => {
      let outward = 0; let counted = 0;
      m.faces.forEach((face) => {
        const tri = face.map((idx) => m.vertices[idx]);
        const normal = G3.faceNormal(tri);
        const fc = faceCentroid(tri);
        const r = outwardRef(fc);
        const rlen = Math.hypot(r.x, r.y, r.z);
        if (rlen < 1e-6) return;
        counted++;
        if (normal.x * r.x + normal.y * r.y + normal.z * r.z > 0) outward++;
      });
      return outward / Math.max(1, counted);
    };

    starShaped.forEach((mode) => {
      it(`${mode}: faces wind outward (away from centroid)`, () => {
        const m = captureMesh(mode);
        expect(m).toBeTruthy();
        const c = { x: 0, y: 0, z: 0 };
        m.vertices.forEach((vt) => { c.x += vt.x; c.y += vt.y; c.z += vt.z; });
        const n = m.vertices.length || 1;
        c.x /= n; c.y /= n; c.z /= n;
        const frac = outwardFraction(m, (fc) => ({ x: fc.x - c.x, y: fc.y - c.y, z: fc.z - c.z }));
        expect(frac).toBeGreaterThan(0.95);
      });
    });

    // Nearest point on a swept tube's center-line, sampled finely. Used as the
    // outward reference for tube surfaces (a face normal must point away from the
    // nearest center-line point). For the plain torus the center-line is the XZ
    // major ring; for the knot it is the (p,q) knot curve the algorithm sweeps.
    const nearestCenterline = (fc, samples) => {
      let best = null; let bestD = Infinity;
      for (let i = 0; i < samples.length; i++) {
        const c = samples[i];
        const d = (fc.x - c.x) ** 2 + (fc.y - c.y) ** 2 + (fc.z - c.z) ** 2;
        if (d < bestD) { bestD = d; best = c; }
      }
      return best;
    };

    const torusCenterline = () => {
      const major = Math.max(2, 60 * 0.75);
      const pts = [];
      for (let i = 0; i < 720; i++) {
        const a = (i / 720) * Math.PI * 2;
        pts.push({ x: Math.cos(a) * major, y: 0, z: Math.sin(a) * major });
      }
      return pts;
    };

    const knotCenterline = () => {
      // Mirror createPrimitiveMesh's knotCenter: pK=2, qK=3, R=max(2, sx*0.62).
      const pK = 2; const qK = 3; const R = Math.max(2, 60 * 0.62);
      const pts = [];
      for (let i = 0; i < 1440; i++) {
        const t = (i / 1440) * Math.PI * 2;
        const r = R * (2 + Math.cos(qK * t)) * 0.5;
        pts.push({ x: r * Math.cos(pK * t), y: R * Math.sin(qK * t) * 0.5, z: r * Math.sin(pK * t) });
      }
      return pts;
    };

    tubes.forEach((mode) => {
      it(`${mode}: faces wind outward (away from the tube center-line)`, () => {
        const m = captureMesh(mode);
        expect(m).toBeTruthy();
        const samples = mode === 'torus' ? torusCenterline() : knotCenterline();
        const frac = outwardFraction(m, (fc) => {
          const c = nearestCenterline(fc, samples);
          return { x: fc.x - c.x, y: fc.y - c.y, z: fc.z - c.z };
        });
        // Tube faces point away from the nearest center-line point. A strong
        // majority confirms consistent outward winding (a handful of grazing
        // faces near high-curvature regions can disagree with the discrete
        // center-line sampling).
        expect(frac).toBeGreaterThan(0.9);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Fix 4 — UV pole de-fan
  // ---------------------------------------------------------------------------
  describe('Fix 4 — sphere pole renders as rings, not an asterisk', () => {
    // Orient a pole toward the camera and count very-short segments converging
    // on the projected pole point.
    const poleFanCount = (overrides) => {
      const paths = gen({
        renderMode: 'wireframe',
        primitiveDetail: 16,
        yaw: 0,
        pitch: 90, // look straight down a pole
        showOutline: false,
        ...overrides,
      });
      // The projected pole sits at the screen center for an orthographic camera
      // pointed down the axis; find the densest convergence point instead.
      // Bucket segment endpoints and find the most-shared endpoint.
      const buckets = new Map();
      const key = (pt) => `${Math.round(pt.x)},${Math.round(pt.y)}`;
      paths.forEach((path) => {
        if (path.length < 2) return;
        const len = Math.hypot(path[path.length - 1].x - path[0].x, path[path.length - 1].y - path[0].y);
        // Only count short segments (candidate fan spokes).
        if (len > 8) return;
        [path[0], path[path.length - 1]].forEach((pt) => {
          const k = key(pt);
          buckets.set(k, (buckets.get(k) || 0) + 1);
        });
      });
      let worst = 0;
      buckets.forEach((c) => { if (c > worst) worst = c; });
      return worst;
    };

    it('no large fan of short segments converges on the projected pole', () => {
      // A UV sphere at high detail has `detail` spokes to each pole. After the
      // de-fan fix the convergence count must be bounded well below detail.
      const fan = poleFanCount({ sourceMode: 'sphere' });
      expect(fan).toBeLessThanOrEqual(6);
    });

    // Count ALL incident segments (any length) at the densest convergence point.
    const poleSpokeCount = (overrides) => {
      const paths = gen({
        renderMode: 'wireframe', primitiveDetail: 16, yaw: 0, pitch: 90,
        showOutline: false, ...overrides,
      });
      const buckets = new Map();
      const key = (pt) => `${Math.round(pt.x)},${Math.round(pt.y)}`;
      paths.forEach((path) => {
        if (path.length < 2) return;
        [path[0], path[path.length - 1]].forEach((pt) => {
          const k = key(pt);
          buckets.set(k, (buckets.get(k) || 0) + 1);
        });
      });
      let worst = 0;
      buckets.forEach((c) => { if (c > worst) worst = c; });
      return worst;
    };

    it('does NOT delete the pole spokes at low detail (no hole) — regression for the screen-relative threshold', () => {
      // At detail 8 the pole's spokes read at full length; the de-fan threshold
      // must NOT remove them (which would leave a hole). The dense star at higher
      // detail is thinned by the sibling 'no large fan' test above.
      const lowDetail = poleSpokeCount({ sourceMode: 'sphere', primitiveDetail: 8 });
      expect(lowDetail).toBeGreaterThanOrEqual(7);
    });

    it('preserves a hard apex (pyramid tip) at default detail', () => {
      // The pyramid apex is a genuine sharp feature; its (longer) spokes must
      // survive the de-fan, not be clipped into a blank tip.
      const apex = poleSpokeCount({ sourceMode: 'pyramid', primitiveDetail: 18 });
      expect(apex).toBeGreaterThanOrEqual(7);
    });
  });

  // ---------------------------------------------------------------------------
  // Fix 5 — scene lighting gating
  // ---------------------------------------------------------------------------
  describe('Fix 5 — scene lighting gating', () => {
    const sig = (paths) => paths
      .map((p) => p.map((pt) => `${pt.x.toFixed(3)},${pt.y.toFixed(3)}`).join('|'))
      .join(';');

    const hatchPaths = (paths) => paths.filter((p) => p.meta && p.meta.hatch);
    const dashedNonHidden = (paths) => paths.filter((p) =>
      p.meta && Array.isArray(p.meta.strokeDash) && !p.meta.hiddenLine);

    it('sceneLighting falsy: hatchEnable + depthCue produce NO hatch and NO lighting dashes', () => {
      const paths = gen({
        sourceMode: 'cube',
        renderMode: 'wireframe',
        hatchEnable: true,
        depthCue: 'dash',
        depthCueStrength: 80,
      });
      expect(hatchPaths(paths).length).toBe(0);
      expect(dashedNonHidden(paths).length).toBe(0);
    });

    it('sceneLighting true: hatchEnable produces hatch paths', () => {
      const paths = gen({
        sourceMode: 'cube',
        renderMode: 'wireframe',
        sceneLighting: true,
        hatchEnable: true,
      });
      expect(hatchPaths(paths).length).toBeGreaterThan(0);
    });

    it('sceneLighting true: depthCue dash modulation applies', () => {
      const paths = gen({
        sourceMode: 'cube',
        renderMode: 'wireframe',
        sceneLighting: true,
        depthCue: 'dash',
        depthCueStrength: 80,
      });
      expect(dashedNonHidden(paths).length).toBeGreaterThan(0);
    });

    it('default output (hatch/depthcue off) is identical whether or not the gate exists', () => {
      // With both hatch and depthcue at their defaults (off), sceneLighting has
      // no effect — output must match between explicit-off and explicit-on.
      const off = gen({ sourceMode: 'sphere' });
      const onGate = gen({ sourceMode: 'sphere', sceneLighting: true });
      expect(sig(off)).toBe(sig(onGate));
    });

    it('hidden-line occlusion is NOT gated by sceneLighting (visibility, not lighting)', () => {
      const lit = gen({ sourceMode: 'cube', renderMode: 'wireframe', sceneLighting: true, hiddenLineMode: 'remove' });
      const unlit = gen({ sourceMode: 'cube', renderMode: 'wireframe', sceneLighting: false, hiddenLineMode: 'remove' });
      // Both should apply occlusion → identical geometry (occlusion independent
      // of the lighting gate).
      expect(sig(lit)).toBe(sig(unlit));
    });
  });
});
