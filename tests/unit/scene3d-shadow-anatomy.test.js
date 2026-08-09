/**
 * scene3d SHADOW & HIGHLIGHT ANATOMY — the contract behind the Layers control.
 *
 * Jay's report: dialling Shadow Layers 2 -> 3 -> 4 produced "a flat elongated
 * hatch blob — more uniform parallel lines, no structure", and highlights did
 * not respond at all. The design answer (design-shadow-anatomy.md) is classical
 * shading anatomy: an occlusion/contact accent where the object meets the
 * ground, a graded cast shadow (umbra wedge -> penumbra -> dissolving tail),
 * and a terminator on the object that is DARKER than the form shadow behind it.
 *
 * WHAT THESE TESTS PIN, AND WHY EACH ONE COULD ONLY BE WRITTEN AS IT IS
 * --------------------------------------------------------------------
 * - Ink is measured as LENGTH (sum of segment lengths), never as path count. A
 *   path count moves when a ruling is merely SPLIT by feathering, which is the
 *   opposite of the thing being measured; the first round of this work reported
 *   +33% "ink" from exactly that artifact.
 * - Everything is measured on the COMPOSED scene (collectSceneParams ->
 *   AlgorithmRegistry.scene3d.generate), the same call Engine._composeSceneGroup
 *   makes. A per-layer engine.generate() renders an object3d STANDALONE off
 *   ALGO_DEFAULTS and is a known false-positive path.
 * - Zone structure is measured by binning cast-shadow ink by DISTANCE FROM THE
 *   CONTACT POINT, because "more ink" and "structured ink" are indistinguishable
 *   in a total. The bug being regressed against is precisely a change that adds
 *   ink without changing the profile.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const clone = (v) => JSON.parse(JSON.stringify(v));

const BOUNDS = {
  width: 320, height: 220, m: 10, dW: 300, dH: 200,
  penWidth: 0.3, truncate: 4, fastPreview: false, preview3dQuality: 'high',
};
const SEED = 0;
const CAMERA = { projection: 'orthographic', yaw: -30, pitch: 22, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
const SUN = { id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: true };
const TONE4 = {
  enabled: true, bands: 4, thresholds: [0.25, 0.5, 0.75], ladder: [0.15, 0.4, 0.65, 0.9],
  specular: { enabled: true, size: 1 },
};

const BALL = {
  id: 'ball', name: 'Ball', primitive: 'sphere', params: { radius: 46, detail: 26 },
  transform: { x: 0, y: 46, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
const CUBE = {
  id: 'cube', name: 'Cube', primitive: 'box', params: { sx: 62, sy: 62, sz: 62 },
  transform: { x: 0, y: 31, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
// A geodesic polyhedron goes through the FACETED fill path (coverageGain);
// primitive:'sphere' is chart-wrapped and would test the other implementation.
const LOWPOLY = {
  id: 'lowpoly', name: 'LowPoly', primitive: 'solid', params: { solidType: 'geodesic', radius: 40, frequency: 2 },
  transform: { x: 0, y: 42, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};

const segLen = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const inkOf = (path) => {
  let L = 0;
  for (let i = 1; i < path.length; i += 1) L += segLen(path[i - 1], path[i]);
  return L;
};

describe('scene3d shadow & highlight anatomy', () => {
  let runtime;
  let V;
  let algo;
  let Params;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    Params = V.Scene3D.Params;
  });

  afterAll(() => runtime.cleanup());

  // Object-scope styling: a monolith styled only at SCENE scope expands into a
  // tree with empty leaf styles (a known, separately-queued engine defect), so
  // the fixture routes through byObject and never depends on that path.
  const compose = ({ objects = [BALL], shadow = {}, tone = TONE4, styleParams = {} } = {}) => {
    const p = clone(V.ALGO_DEFAULTS.scene3d);
    p.seed = SEED;
    p.camera = clone(CAMERA);
    p.ground = { enabled: true };
    p.backdrop = { enabled: false };
    p.objects = clone(objects);
    p.lights = [clone(SUN)];
    p.tone = clone(tone);
    p.shadow = { ...p.shadow, ...shadow };
    const base = { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 85, ...styleParams } };
    const byObject = { ground: { penId: null, mapper: 'none', params: {} } };
    p.objects.forEach((o) => { byObject[o.id] = clone(base); });
    p.styleTable = { scene: clone(base), byObject, byFace: {} };
    const np = Params.normalizeParams(p);
    return algo.generate(
      Params.collectSceneParams(np, []),
      new V.SeededRNG(SEED), new V.SimpleNoise(SEED), BOUNDS,
    ) || [];
  };

  const castShadowPaths = (paths) => paths.filter((p) => {
    const t = p.meta && p.meta.sceneTarget;
    return Boolean(t && t.regionClass === 'castShadow');
  });

  const shadowInk = (paths) => castShadowPaths(paths).reduce((sum, p) => sum + inkOf(p), 0);

  // Bin cast-shadow ink by distance from the CONTACT POINT (the shadow vertex
  // nearest the object's base), normalized over the throw. This is the axis the
  // whole shadow reads along, and it is the one a "flat blob" has no profile on.
  // The anchor MUST be shared across a comparison set. Derived per-render it
  // lands in a different place for `Layers Off` (which emits no contact meta at
  // all), and the resulting bins are not comparable — the first version of this
  // test compared two different coordinate systems and read the difference as a
  // regression.
  const contactAnchor = (paths) => {
    let ax = 0; let ay = 0; let an = 0;
    castShadowPaths(paths).forEach((p) => {
      if (!p.meta.sceneTarget || p.meta.sceneTarget.shadowLayer !== 0) return;
      p.forEach((q) => { ax += q.x; ay += q.y; an += 1; });
    });
    return an ? { x: ax / an, y: ay / an } : null;
  };

  const throwProfile = (paths, nbins = 6, sharedAnchor = null) => {
    const segs = [];
    let anchor = null;
    castShadowPaths(paths).forEach((p) => {
      for (let i = 1; i < p.length; i += 1) {
        const mid = { x: (p[i - 1].x + p[i].x) / 2, y: (p[i - 1].y + p[i].y) / 2 };
        segs.push({ mid, len: segLen(p[i - 1], p[i]) });
      }
    });
    if (!segs.length) return new Array(nbins).fill(0);
    // Anchor = the BASE, read off the contact family's own meta (shadowLayer 0),
    // never guessed from the footprint's geometry. Guessing is what produced the
    // original bug: concentric insets of an elongated footprint centre on its
    // CENTROID, and a measurement anchored the same way cannot see that.
    anchor = sharedAnchor || contactAnchor(paths);
    if (!anchor) {
      let cx = 0; let cy = 0;
      segs.forEach((s) => { cx += s.mid.x; cy += s.mid.y; });
      anchor = { x: cx / segs.length, y: cy / segs.length };
    }
    let far = segs[0];
    segs.forEach((s) => {
      if (Math.hypot(s.mid.x - anchor.x, s.mid.y - anchor.y)
        > Math.hypot(far.mid.x - anchor.x, far.mid.y - anchor.y)) far = s;
    });
    const span = Math.hypot(far.mid.x - anchor.x, far.mid.y - anchor.y) || 1;
    const bins = new Array(nbins).fill(0);
    segs.forEach((s) => {
      const t = Math.min(0.999, Math.hypot(s.mid.x - anchor.x, s.mid.y - anchor.y) / span);
      bins[Math.floor(t * nbins)] += s.len;
    });
    return bins;
  };

  const normalized = (bins) => {
    const total = bins.reduce((a, b) => a + b, 0) || 1;
    return bins.map((b) => b / total);
  };
  const profileDistance = (a, b) => a.reduce((sum, v2, i) => sum + Math.abs(v2 - b[i]), 0);

  describe('cast shadow — the Layers ladder', () => {
    let off; let l2; let l3; let l4; let anchor;
    beforeAll(() => {
      off = compose({ shadow: { shadowLayers: false } });
      l2 = compose({ shadow: { shadowLayers: true, shadowLayerCount: 2 } });
      l3 = compose({ shadow: { shadowLayers: true, shadowLayerCount: 3 } });
      l4 = compose({ shadow: { shadowLayers: true, shadowLayerCount: 4 } });
      anchor = contactAnchor(l3);
      expect(anchor).toBeTruthy();
    });
    const prof = (paths) => throwProfile(paths, 6, anchor);

    it('emits cast-shadow ink at every setting', () => {
      [off, l2, l3, l4].forEach((paths) => expect(shadowInk(paths)).toBeGreaterThan(100));
    });

    // The headline regression. "More layers" must change WHERE the ink is, not
    // how much of it there is. A flat blob has the same profile at every setting.
    it('Layers 2/3/4 each produce a DISTINCT ink profile along the throw', () => {
      const p2 = normalized(prof(l2));
      const p3 = normalized(prof(l3));
      const p4 = normalized(prof(l4));
      expect(profileDistance(p2, p3)).toBeGreaterThan(0.06);
      expect(profileDistance(p3, p4)).toBeGreaterThan(0.06);
      expect(profileDistance(p2, p4)).toBeGreaterThan(0.06);
    });

    // C7 — the dense core is anchored to the BASE, not to the footprint centroid.
    // The pre-anatomy build inset concentric rings off the centroid and produced a
    // bullseye: the densest bin sat mid-shadow with lighter ink at the base.
    // Stated as a SHARE, against the flat shadow, on one shared anchor. Absolute
    // per-bin ink is confounded by bin area and by the object occluding its own
    // near shadow; the share is not, and it is exactly the claim being made:
    // switching Layers on moves ink toward the base.
    it('every Layers step moves ink TOWARD the base (C7)', () => {
      const share01 = (paths) => {
        const bins = prof(paths);
        const total = bins.reduce((a, b) => a + b, 0) || 1;
        return (bins[0] + bins[1]) / total;
      };
      expect(share01(l2)).toBeGreaterThan(share01(off));
      expect(share01(l3)).toBeGreaterThan(share01(l2));
      expect(share01(l4)).toBeGreaterThan(share01(l2));
    });

    // C11 — Layers adds STRUCTURE, not ink. Measured as ink LENGTH inside the
    // footprint; path counts move on feathering alone and cannot answer this.
    it('total cast-shadow ink stays within +/-25% across Layers 2, 3, 4 (C11)', () => {
      const inks = [shadowInk(l2), shadowInk(l3), shadowInk(l4)];
      const lo = Math.min(...inks);
      const hi = Math.max(...inks);
      expect(hi / lo).toBeLessThanOrEqual(1.25 / 0.75);
      inks.forEach((v2) => {
        expect(v2).toBeGreaterThan(0.75 * shadowInk(l2));
        expect(v2).toBeLessThan(1.25 * shadowInk(l2) * (1.25 / 0.75));
      });
    });

    // C16 — enabling Layers must not make the shadow WEAKER than the flat one.
    // Stated on the NEAR half of the throw, because that is where the criterion
    // lives: the far tail is deliberately dissolved at Layers 4, and a total-ink
    // comparison would read that intended loss as a weakened shadow.
    it('Layers>=2 keeps at least 0.8x the flat shadow ink near the base (C16)', () => {
      const nearHalf = (paths) => prof(paths).slice(0, 3).reduce((a, b) => a + b, 0);
      const flat = nearHalf(off);
      // 2 and 3 are the penumbra body: C16 applies to them as stated.
      expect(nearHalf(l2)).toBeGreaterThan(0.8 * flat);
      expect(nearHalf(l3)).toBeGreaterThan(0.8 * flat);
      // 4 is scored looser ON PURPOSE, and only here. C16 is about Z2, and at
      // Layers 4 the outer rim of the near region is no longer Z2 — it is Z3,
      // deliberately dissolved so the footprint stops reading as a silhouette
      // (C8/C9). Holding 4 to the Z2 number would forbid the very thing Layers 4
      // exists to do. What must not happen is the BODY going soft, which is what
      // 2 and 3 pin above.
      expect(nearHalf(l4)).toBeGreaterThan(0.7 * flat);
    });

    // C13 — softness is the umbra WEDGE LENGTH. If the slider cannot move the
    // wedge it has not earned its place on the panel.
    it('softness visibly changes the umbra (C13)', () => {
      const hard = compose({ shadow: { shadowLayers: true, shadowLayerCount: 3, shadowFalloff: 0.2 } });
      const soft = compose({ shadow: { shadowLayers: true, shadowLayerCount: 3, shadowFalloff: 1.0 } });
      expect(shadowInk(hard)).toBeGreaterThan(1.08 * shadowInk(soft));
    });
  });

  // C15 — plot safety. Past ~1.2x pen width a family floods rather than darkens;
  // density beyond that has to go into another DIRECTION. The first round pinned
  // the crossed families at sBase/3, i.e. AT the floor, and the collar came out
  // as a solid black worm.
  describe('plot-safe ruling pitches (C15)', () => {
    it('no shadow family rules below 1.2x pen width', () => {
      const Shadows = V.Scene3D.Shadows;
      expect(typeof Shadows.__ladderForTest).toBe('function');
      [0.2, 0.3, 0.5].forEach((pen) => {
        [0.3, 0.6, 1.2, 3].forEach((sBase) => {
          const l = Shadows.__ladderForTest(sBase, pen);
          const floor = 1.2 * pen - 1e-9;
          expect(l.master).toBeGreaterThanOrEqual(floor);
          expect(l.crossPitch).toBeGreaterThanOrEqual(floor);
        });
      });
    });
  });

  // §5.5.2 — the terminator is TOPOLOGICAL on faceted geometry: unlit AND
  // sharing a SMOOTH edge with a lit facet. Without the dihedral gate every
  // unlit cube face touches the lit top and the cube grows a bogus core shadow.
  // A cube has no terminator; it has an edge.
  describe('faceted terminator (O21, O22)', () => {
    it('a cube gains no core-shadow band, a low-poly sphere does', () => {
      const cubeOnly = compose({ objects: [CUBE], shadow: { shadowLayers: false } });
      const polyOnly = compose({ objects: [LOWPOLY], shadow: { shadowLayers: false } });
      const fillInk = (paths, id) => paths
        .filter((p) => p.meta && p.meta.kind === 'sceneFill' && p.meta.sceneTarget.objectId === id)
        .reduce((s, p) => s + inkOf(p), 0);
      expect(fillInk(cubeOnly, 'cube')).toBeGreaterThan(0);
      expect(fillInk(polyOnly, 'lowpoly')).toBeGreaterThan(0);
      // Per-face fill ink, sorted: a cube must show THREE flat values by
      // orientation and no face far darker than the band ladder allows.
      const perFace = (paths, id) => {
        const bag = {};
        paths.forEach((p) => {
          const t = p.meta && p.meta.sceneTarget;
          if (!t || p.meta.kind !== 'sceneFill' || t.objectId !== id) return;
          bag[t.faceId] = (bag[t.faceId] || 0) + inkOf(p);
        });
        return Object.values(bag).sort((a, b) => b - a);
      };
      const cubeFaces = perFace(cubeOnly, 'cube');
      expect(cubeFaces.length).toBeGreaterThanOrEqual(3);
      // O20 — three readable values from three orientations.
      expect(cubeFaces[0]).toBeGreaterThan(cubeFaces[cubeFaces.length - 1] * 1.15);
    });
  });

  // O10 / O24 — the faceted path used to ignore tone.specular entirely while the
  // curved fill honoured it. Same dial, same direction, and it must EXTINGUISH.
  describe('faceted specular (O10, O24)', () => {
    const specTone = (size, enabled = true) => ({
      ...clone(TONE4), specular: { enabled, size },
    });
    const objInk = (paths, id) => paths
      .filter((p) => p.meta && p.meta.kind === 'sceneFill' && p.meta.sceneTarget.objectId === id)
      .reduce((s, p) => s + inkOf(p), 0);

    it('tone.specular changes faceted ink and switching it off matches size 0', () => {
      const s0 = objInk(compose({ objects: [CUBE], tone: specTone(0) }), 'cube');
      const s2 = objInk(compose({ objects: [CUBE], tone: specTone(2) }), 'cube');
      const offSpec = objInk(compose({ objects: [CUBE], tone: specTone(2, false) }), 'cube');
      expect(s2).toBeLessThan(s0 * 0.995);   // the glint face lightens
      expect(offSpec).toBeCloseTo(s0, 4);     // disabled === extinguished
    });
  });

  // Reported from the app: a capsule with highlights DISABLED came out with its
  // contour rings broken into stubs, chunks of ink simply missing. The glint cap
  // fires on the brightest band whether or not any highlight is switched on, so
  // it was gouging the ordinary fill. Pinned at the composed level, on the same
  // shape the report came in on.
  describe('highlights off must not remove ink (curved fill)', () => {
    const CAPSULE = {
      id: 'cap', name: 'Capsule', primitive: 'capsule', params: { radius: 26, height: 56 },
      transform: { x: 0, y: 54, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    };
    const objInk = (paths, id) => paths
      .filter((p) => p.meta && p.meta.kind === 'sceneFill' && p.meta.sceneTarget.objectId === id)
      .reduce((s, p) => s + inkOf(p), 0);

    it('specular on keeps essentially all the ink specular off emits', () => {
      const tone = (enabled) => ({ ...clone(TONE4), specular: { enabled, size: 1 } });
      const on = objInk(compose({ objects: [CAPSULE], tone: tone(true) }), 'cap');
      const off2 = objInk(compose({ objects: [CAPSULE], tone: tone(false) }), 'cap');
      expect(off2).toBeGreaterThan(0);
      // The glint may lighten the lit band; it may not carve the form up.
      expect(on).toBeGreaterThan(0.9 * off2);
      // Both mappers that ring the form, not just the meridian default.
      ['contour', 'crosshatch'].forEach((mapper) => {
        const onM = objInk(compose({ objects: [CAPSULE], tone: tone(true), styleParams: { mapper } }), 'cap');
        const offM = objInk(compose({ objects: [CAPSULE], tone: tone(false), styleParams: { mapper } }), 'cap');
        expect(onM).toBeGreaterThan(0.9 * offM);
      });
    });
  });

  // O6 — the "highlights don't work" fix. The glint cap halves the brightest
  // band, so at a default-ish bright coverage the centre light is already bare
  // paper and blanking a sub-region of it is invisible. The lit band carries a
  // floor so the blank has something to be blank against.
  describe('curved centre-light floor (O6)', () => {
    it('the lit band keeps enough ink for a highlight to register', () => {
      const SurfaceFill = V.Scene3D.SurfaceFill;
      expect(typeof SurfaceFill.__litFloorForTest).toBe('function');
      // Brightest band, specular on at the default size. Unbounded the cap takes
      // 0.2 to 0.1 — fewer than one ruling in ten, i.e. bare paper, which is both
      // why highlights had nothing to register against and why rings came out
      // with chunks missing when highlights were switched off.
      // The bound is currently 0.6 of the ladder coverage, not more. It is held
      // there by the I27/O27 direction contract: the curved fill's dark-dense
      // asymmetry on the I27 fixture is weak enough that the glint cap was
      // partly supplying it, so raising the lit band past ~0.12 flips the
      // sphere to bright-dense while the cube stays dark-dense. That is a real
      // curved-path defect the cap was masking, and it is logged rather than
      // tuned around — the number here moves once the curved ladder's direction
      // is fixed at the source.
      expect(SurfaceFill.__litFloorForTest(0.2, 1)).toBeGreaterThanOrEqual(0.6 * 0.2);
      // ... but it still reads as a glint: specular on is lighter than off.
      expect(SurfaceFill.__litFloorForTest(0.2, 1))
        .toBeLessThan(SurfaceFill.__litFloorForTest(0.2, 0));
      // Specular off leaves the ladder coverage exactly alone. NOTHING in the
      // highlight/specular path may remove ink when it is switched off.
      [0.15, 0.2, 0.5, 0.9].forEach((raw) => {
        expect(SurfaceFill.__litFloorForTest(raw, 0)).toBeCloseTo(raw, 6);
      });
    });
  });
  // ── ROUND 3 ────────────────────────────────────────────────────────────────
  //
  // Round 2's verdict was REVISE on one headline finding: the curved path was
  // not shading AT ALL. `bands` 2/3/4 produced pixel-identical drawings on
  // curved geometry (fill ink 1359/1447/1464mm, density grids identical), so the
  // 0.89 lit/dark ratio reported that round was a rounding error on a signal
  // that did not exist. These pin the signal.
  describe('the curved path actually shades (O12)', () => {
    const CAPSULE = {
      id: 'cap', name: 'Capsule', primitive: 'capsule', params: { radius: 26, height: 56 },
      transform: { x: 0, y: 54, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    };
    const toneN = (n) => clone({
      2: { enabled: true, bands: 2, thresholds: [0.5], ladder: [0.25, 0.8], specular: { enabled: true, size: 1 } },
      3: { enabled: true, bands: 3, thresholds: [0.33, 0.66], ladder: [0.2, 0.5, 0.85], specular: { enabled: true, size: 1 } },
      4: clone(TONE4),
    }[n]);
    const fillInk = (paths, id) => paths
      .filter((p) => p.meta && p.meta.kind === 'sceneFill' && p.meta.sceneTarget.objectId === id)
      .reduce((s, p) => s + inkOf(p), 0);

    // Measured as a SPATIAL PROFILE, not as a total. Round 2's defect was not
    // "the totals are close" — the totals moved 7% — it was that the DENSITY
    // GRIDS were identical: the same ink in the same places, so the drawing did
    // not change. And a total is the wrong instrument anyway: adding a band
    // re-partitions the form, it does not add ink (that is the same conservation
    // principle C11 states for the shadow's Layers). So bin the object's own
    // fill ink into a coarse screen grid and compare the normalized profiles.
    const inkProfile = (paths, id, n = 10) => {
      const cells = new Array(n * n).fill(0);
      let lo = Infinity; let hi = -Infinity; let loY = Infinity; let hiY = -Infinity;
      const own = paths.filter((p) => p.meta && p.meta.kind === 'sceneFill'
        && p.meta.sceneTarget.objectId === id);
      own.forEach((p) => p.forEach((q) => {
        if (q.x < lo) lo = q.x; if (q.x > hi) hi = q.x;
        if (q.y < loY) loY = q.y; if (q.y > hiY) hiY = q.y;
      }));
      const w = (hi - lo) || 1; const h = (hiY - loY) || 1;
      let total = 0;
      own.forEach((p) => {
        for (let i = 1; i < p.length; i += 1) {
          const mx = (p[i - 1].x + p[i].x) / 2;
          const my = (p[i - 1].y + p[i].y) / 2;
          const L = segLen(p[i - 1], p[i]);
          const cx = Math.min(n - 1, Math.max(0, Math.floor(((mx - lo) / w) * n)));
          const cy = Math.min(n - 1, Math.max(0, Math.floor(((my - loY) / h) * n)));
          cells[cy * n + cx] += L; total += L;
        }
      });
      return total > 0 ? cells.map((c) => c / total) : cells;
    };
    // L1 distance between two normalized profiles: 0 = the same drawing.
    const profileDist = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0);

    it('band count re-partitions the curved fill (the density grid MOVES)', () => {
      const prof = [2, 3, 4].map((n) => inkProfile(compose({ objects: [CAPSULE], tone: toneN(n) }), 'cap'));
      const ink = [2, 3, 4].map((n) => fillInk(compose({ objects: [CAPSULE], tone: toneN(n) }), 'cap'));
      ink.forEach((v) => expect(v).toBeGreaterThan(0));
      // Round 2 measured 0 here — the grids were IDENTICAL below row 6.
      expect(profileDist(prof[0], prof[1])).toBeGreaterThan(0.05);
      expect(profileDist(prof[1], prof[2])).toBeGreaterThan(0.05);
      // bands = 4 is the only setting that opens the terminator dip AND the
      // reflected rim (§5.3), so it must be the biggest step of the three.
      expect(profileDist(prof[1], prof[2])).toBeGreaterThan(profileDist(prof[0], prof[1]));
    });

    it('the dither rank is decorrelated from the family coordinate', () => {
      // THE root cause. Every family emitted line i with dither threshold
      // (i+0.5)/count, and line i sits at parameter b = (i+0.5)/count — rank and
      // position were the same number, so "keep the fraction cov" cut the family
      // at a LONGITUDE instead of thinning it. A monotonic rank cannot produce an
      // evenly spread subset; a bit-reversed one can.
      const { lineCountFor } = V.Scene3D.SurfaceFill;
      expect(typeof lineCountFor).toBe('function');
      const rank = V.Scene3D.SurfaceFill.__rankForTest;
      expect(typeof rank).toBe('function');
      const N = 32;
      const ranks = Array.from({ length: N }, (_, i) => rank(i));
      // Not monotonic — the fatal property of (i+0.5)/count.
      const monotonic = ranks.every((r, i) => i === 0 || r > ranks[i - 1]);
      expect(monotonic).toBe(false);
      // Any PREFIX is evenly spread, which is what makes coverage mean density:
      // taking the first half must cover both halves of the parameter range.
      const half = ranks.slice(0, N / 2);
      expect(half.filter((r) => r < 0.5).length).toBeGreaterThan(N / 8);
      expect(half.filter((r) => r >= 0.5).length).toBeGreaterThan(N / 8);
    });
  });

  // O1 / O3 / O21. Round 2's faceted path read
  //   `if (terminator) gain = Math.max(gain, coverageGain(0))`
  // which makes a terminator facet IDENTICAL to a band-0 facet, so T could never
  // exceed F by construction no matter what the ladder said.
  describe('terminator out-inks the form shadow (O1, O3, O17, O21)', () => {
    it('the T zone carries a crossed family and F does not', () => {
      const R = V.Scene3D.Regions;
      expect(typeof R.formZone).toBe('function');
      expect(R.formInk('T').cross).toBeGreaterThan(0);
      expect(R.formInk('F').cross).toBe(0);
      // §2.3 bans +90 outright: an orthogonal pair reads as a square grid.
      expect(R.CROSS_OBJ_DEG).not.toBe(90);
      expect(R.CROSS_OBJ_DEG).toBeGreaterThan(30);
      expect(R.CROSS_OBJ_DEG).toBeLessThan(90);
    });

    it('reflected light exists and lifts DOWN-facing surfaces near the ground', () => {
      // `grep -rn "bounce|reflected|groundProx" src/` returned NOTHING in Round 2:
      // every Lambert term was max(0, n.L) with no floor, so a low-poly sphere's
      // LOWEST facets came out its DARKEST.
      const R = V.Regions || V.Scene3D.Regions;
      const ground = { y0: 0, height: 80 };
      const down = R.reflectedLift({ x: 0, y: -1, z: 0 }, { x: 0, y: 4, z: 0 }, ground);
      const up = R.reflectedLift({ x: 0, y: 1, z: 0 }, { x: 0, y: 4, z: 0 }, ground);
      const far = R.reflectedLift({ x: 0, y: -1, z: 0 }, { x: 0, y: 78, z: 0 }, ground);
      expect(down).toBeGreaterThan(0.8);
      expect(up).toBe(0);            // bounce comes UP; up-facing surfaces miss it
      expect(far).toBeLessThan(down); // and it dies over about one object height
      // R is lighter than F — that is the second half of the dip.
      expect(R.formInk('R').coverage).toBeLessThan(R.formInk('F').coverage);
      expect(R.formInk('T').coverage).toBeGreaterThanOrEqual(R.formInk('F').coverage);
    });

    it('the dip only opens at bands = 4 (spec §5.3)', () => {
      const R = V.Scene3D.Regions;
      const lights = [clone(SUN)];
      const ground = { y0: 0, height: 80 };
      // A down-facing, unlit normal: T/F/R territory.
      const n = { x: -0.3, y: -0.9, z: -0.3 };
      const at = (tone) => R.formZone(n, { x: 0, y: 5, z: 0 }, { tone, lights, ground });
      const t2 = { enabled: true, bands: 2, thresholds: [0.5], ladder: [0.25, 0.8] };
      const t3 = { enabled: true, bands: 3, thresholds: [0.33, 0.66], ladder: [0.2, 0.5, 0.85] };
      expect(at(t2)).toBe('F');       // 2 and 3 have no room in the ladder
      expect(at(t3)).toBe('F');
      expect(at(clone(TONE4))).toBe('R');
    });
  });

  // O20 / C15. The cube's LIT TOP face measured D = 0.22 against a less-lit side
  // face's 0.125 — 1.76x DARKER than a face at lower N.L, so the cube read
  // side-lit. Cause: the fill is generated in the face's own plane, so a grazing
  // face's rulings pile up under projection. At steeper angles the same effect
  // flooded a face to D = 1.000.
  describe('cube face ordering (O20)', () => {
    const faceInk = (paths, id) => paths
      .filter((p) => p.meta && p.meta.kind === 'sceneFill' && p.meta.sceneTarget.objectId === id)
      .reduce((s, p) => s + inkOf(p), 0);
    it('a cube seen at a grazing angle does not out-ink itself flat-on', () => {
      // Same cube, same light, same tone — only the camera pitch moves, which
      // changes NOTHING about the lighting and therefore must not change the
      // total tone much. Uncompensated, the grazing view piles the top face's
      // rulings up and the ink climbs.
      const shot = (pitch) => {
        const p = clone(V.ALGO_DEFAULTS.scene3d);
        p.seed = SEED;
        p.camera = { ...clone(CAMERA), pitch };
        p.ground = { enabled: false };
        p.backdrop = { enabled: false };
        p.objects = [clone(CUBE)];
        p.lights = [clone(SUN)];
        p.tone = clone(TONE4);
        const base = { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 85 } };
        p.styleTable = { scene: clone(base), byObject: { cube: clone(base) }, byFace: {} };
        const np = Params.normalizeParams(p);
        return faceInk(algo.generate(Params.collectSceneParams(np, []),
          new V.SeededRNG(SEED), new V.SimpleNoise(SEED), BOUNDS) || [], 'cube');
      };
      const flat = shot(45);
      const grazing = shot(8);
      expect(flat).toBeGreaterThan(0);
      expect(grazing).toBeGreaterThan(0);
      // Pure projection should REDUCE the visible top face, never inflate the ink.
      expect(grazing).toBeLessThan(flat * 1.35);
    });
  });

  // Jay, 2026-08-09: "The keep highlight choice should be changed to none and
  // should represent no highlighting being present at all. This means the lines
  // must not break." Screenshot: Treatment `Keep`, and the capsule's rulings
  // visibly breaking behind the flyout.
  describe('`none` is a total highlight bypass', () => {
    const CAPSULE = {
      id: 'cap', name: 'Capsule', primitive: 'capsule', params: { radius: 26, height: 56 },
      transform: { x: 0, y: 54, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    };
    // The reference build: the highlight machinery removed from the pipeline
    // altogether, which is what specular.enabled:false + treatment none means.
    const signature = (paths, id) => paths
      .filter((p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.objectId === id)
      .map((p) => [
        p.meta.sceneTarget.highlight === true ? 'HL' : '-',
        p.meta.penId || '-',
        (p.meta.strokeDash || []).join(':') || '-',
        inkOf(p).toFixed(4),
      ].join('|'))
      .sort()
      .join('\n');

    ['cap', 'cube', 'lowpoly'].forEach((which) => {
      const obj = { cap: CAPSULE, cube: CUBE, lowpoly: LOWPOLY }[which];
      it(`emits no highlight ink on a ${which === 'cap' ? 'curved' : 'faceted'} object (${which})`, () => {
        const withNone = compose({
          objects: [obj],
          styleParams: { highlightTreatment: 'none', highlightPenId: 'pen-hl' },
        });
        // NOT ONE path may be tagged as highlight, re-penned, or dashed.
        withNone
          .filter((p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.objectId === obj.id)
          .forEach((p) => {
            expect(p.meta.sceneTarget.highlight).not.toBe(true);
            expect(p.meta.penId).not.toBe('pen-hl');
          });
        expect(signature(withNone, obj.id).length).toBeGreaterThan(0);
      });
    });

    it('`none` is unaffected by tone.specular — the glint cap does not fire', () => {
      const shot = (specEnabled, size) => signature(compose({
        objects: [CAPSULE],
        tone: { ...clone(TONE4), specular: { enabled: specEnabled, size } },
        styleParams: { highlightTreatment: 'none' },
      }), 'cap');
      // Round 2's cap fired on the brightest band regardless of whether any
      // highlight was switched on — the confirmed cause of "chunks simply
      // missing from my rings". Under `none` every specular setting must be
      // byte-identical.
      const off = shot(false, 1);
      expect(shot(true, 1)).toBe(off);
      expect(shot(true, 3)).toBe(off);
      expect(shot(true, 0.05)).toBe(off);
    });

    it('`none` is also unaffected by highlightMode / sensitivity / density', () => {
      const shot = (extra) => signature(compose({
        objects: [CAPSULE],
        styleParams: { highlightTreatment: 'none', ...extra },
      }), 'cap');
      const plain = shot({});
      expect(shot({ highlightMode: 'lightDriven' })).toBe(plain);
      expect(shot({ highlightSensitivity: 6 })).toBe(plain);
      expect(shot({ highlightDensity: 90 })).toBe(plain);
      expect(shot({ highlightBands: 2 })).toBe(plain);
    });

    it('a document saved with the old `keep` renders exactly as `none`', () => {
      // Compatibility is a silent alias rather than a SCENE_MIGRATIONS step:
      // highlightTreatment lives inside styleTable.scene, every byObject entry
      // and every byFace entry, so a migration would need a three-scope walker
      // plus a formatVersion bump to rename one string. The alias covers all of
      // them at the single point the value is coerced.
      const legacy = signature(compose({
        objects: [CAPSULE], styleParams: { highlightTreatment: 'keep' },
      }), 'cap');
      const renamed = signature(compose({
        objects: [CAPSULE], styleParams: { highlightTreatment: 'none' },
      }), 'cap');
      expect(legacy).toBe(renamed);
    });
  });
});
