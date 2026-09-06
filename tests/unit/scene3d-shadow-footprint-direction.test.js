/**
 * W-30 — shadow-RECEIVE direction for non-directional lights (point/spot/
 * area), `src/core/scene3d/shadows.js`.
 *
 * Finding (docs/3d-audit/STILL-OPEN.md W-30 / lane-reports/UnitD-phase-
 * review.md §4): the flat-face shadow-receive footprint model
 * (`scene3d.js`'s `buildFaceFootprint`, built on `Shadows.projectAlongDirTo-
 * Plane` + `Shadows.convexHull`) only ever had a PARALLEL projector
 * available, driven by `Regions.Lighting.lightWorldDir(light)` — which reads
 * `light.azimuth`/`light.elevation` UNCONDITIONALLY, regardless of
 * `light.type`. A point/spot/area light carries `position` instead of
 * azimuth/elevation, so `lightWorldDir` silently falls back to its own
 * default (135°/45°): the receive-shadow footprint lands in a direction
 * with NO relationship to where the light actually sits, while the
 * GROUND-shadow path (`Shadows.build()`, same file) already gets this right
 * via `projectShadowVertexPositional` (a perspective projection from the
 * light's own `position`).
 *
 * Fix: `Shadows.projectFromPositionToPlane` (perspective, arbitrary plane)
 * + `Shadows.projectLightToPlane` (light-type dispatch: perspective from
 * `light.position` for point/spot/area, else the existing parallel
 * `projectAlongDirToPlane` with a caller-supplied fallback direction) —
 * mirrors `build()`'s own `positional` detection exactly.
 *
 * Scope note (AGENT-PROTOCOL.md serialization table): `scene3d.js` is owned
 * by a different lane and is NOT touched here, so `buildFaceFootprint`'s
 * call site still always uses the parallel projector in production — see
 * `helper OLD_projectFootprint` below, which reproduces EXACTLY what that
 * call site does today (parallel projection along the `lightWorldDir`-style
 * default direction) so the RED proof is the real bug, not a strawman.
 * Wiring `buildFaceFootprint` to call `Shadows.projectLightToPlane` instead
 * is a follow-up for whichever lane next owns `scene3d.js`.
 *
 * RED against `8e9b0991` (branch HEAD immediately before this fix, per
 * `makeMultiFilePreShaRuntimeOptions`):
 *   VECTURA_PRE_W30=1 npx vitest run tests/unit/scene3d-shadow-footprint-direction.test.js
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { makeMultiFilePreShaRuntimeOptions } = require('../helpers/pre-wip-surface-fill');

const SHADOWS_REL = 'src/core/scene3d/shadows.js';
const BASE_SHA = '8e9b0991'; // branch HEAD assigned as this lane's base — immediately before W-30
const preW30RuntimeOptions = makeMultiFilePreShaRuntimeOptions(BASE_SHA, 'VECTURA_PRE_W30', [SHADOWS_REL]);

const v = (x, y, z) => ({ x, y, z });
const sub = (a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z);
const norm = (a) => {
  const len = Math.hypot(a.x, a.y, a.z) || 1;
  return v(a.x / len, a.y / len, a.z / len);
};
const angleBetweenDeg = (a, b) => {
  const na = norm(a); const nb = norm(b);
  const dot = na.x * nb.x + na.y * nb.y + na.z * nb.z;
  return Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
};

// What `Regions.Lighting.lightWorldDir` returns for ANY light record with no
// azimuth/elevation fields (the documented DEFAULT_LIGHT azimuth=135,
// elevation=45 — the exact fallback the finding names). Reproduced here as
// a plain literal so this test has no load-order dependency on regions.js
// (same self-contained-copy convention `shadow-receive.js` itself uses).
const DEG = Math.PI / 180;
const DEFAULT_AZ = 135 * DEG;
const DEFAULT_EL = 45 * DEG;
const DEFAULT_LIGHT_DIR = (() => {
  const cosEl = Math.cos(DEFAULT_EL);
  return norm(v(-cosEl * Math.sin(DEFAULT_AZ), -Math.sin(DEFAULT_EL), -cosEl * Math.cos(DEFAULT_AZ)));
})();

// A small hexagon of "caster silhouette" points around a sphere center —
// standing in for `buildFaceFootprint`'s per-vertex projection loop over a
// real caster's `otherRec.world` array, without needing a full mesh.
const casterRimPoints = (center, radius) => {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const theta = (i * 60) * DEG;
    pts.push(v(center.x + radius * Math.cos(theta), center.y + radius * Math.sin(theta), center.z));
  }
  return pts;
};
const centroid = (pts) => {
  const s = pts.reduce((acc, p) => v(acc.x + p.x, acc.y + p.y, acc.z + p.z), v(0, 0, 0));
  return v(s.x / pts.length, s.y / pts.length, s.z / pts.length);
};

// EXACTLY scene3d.js's `buildFaceFootprint` call pattern today (line ~767:
// `Shadows.projectAlongDirToPlane(world[i], lightDir, anchor, normalWorldArg)`,
// where `lightDir` is `Regions.Lighting.lightWorldDir(light)` computed ONCE
// per frame regardless of `light.type`) — the production bug, reproduced
// faithfully so the RED proof is honest.
const OLD_projectFootprint = (Shadows, casterPts, planeAnchor, planeNormal) => casterPts
  .map((P) => Shadows.projectAlongDirToPlane(P, DEFAULT_LIGHT_DIR, planeAnchor, planeNormal))
  .filter(Boolean);

// The fix: dispatch on `light.type`/`light.position` via the new export.
// Falls back to the OLD parallel path when the export does not exist (the
// pinned pre-fix `shadows.js`), so the SAME assertion genuinely fails there.
const NEW_projectFootprint = (Shadows, light, casterPts, planeAnchor, planeNormal) => {
  if (typeof Shadows.projectLightToPlane !== 'function') {
    return OLD_projectFootprint(Shadows, casterPts, planeAnchor, planeNormal);
  }
  return casterPts
    .map((P) => Shadows.projectLightToPlane(P, light, planeAnchor, planeNormal, DEFAULT_LIGHT_DIR))
    .filter(Boolean);
};

// Independent oracle for the GROUND-shadow world point of a positional
// light — the exact formula `projectShadowVertexPositional` computes BEFORE
// its camera-projection step (t = Lp.y/(Lp.y-P.y); g = Lp + t*(P-Lp), g.y=0).
// Recomputed here from scratch (never calls into shadows.js) so the "ground
// path and receive path must agree" assertion has a genuinely independent
// left-hand side.
const groundOracle = (P, Lp) => {
  const denom = Lp.y - P.y;
  if (!(denom > 1e-6)) return null;
  const t = Lp.y / denom;
  if (!(t > 0)) return null;
  return v(Lp.x + t * (P.x - Lp.x), 0, Lp.z + t * (P.z - Lp.z));
};

const runFixtures = (Shadows) => {
  describe.each([
    ['point light (+X of the caster, elevated)', { id: 'p1', type: 'point', position: v(80, 100, 0) }],
    // +X of the caster (like the point light above, and far enough along X
    // that no rim point's projection ray runs near-parallel to the wall
    // plane — a light too close to the caster's own x-range makes the
    // perspective divide near-singular for an off-axis rim point) so the
    // same wall at x=-100 is actually reachable — "above-left" is expressed
    // via a large -Z offset, not by crossing to the -X side (a light on the
    // wall's own side of the caster would cast AWAY from the wall, off the
    // fixture entirely). Chosen so its TRUE bearing is far (>15deg) from the
    // 135deg/45deg DEFAULT direction the bug falls back to — a position too
    // close to that default would make the "OLD is wrong" proof pass by
    // coincidence instead of by the real defect.
    ['spot light (aimed from above-left)', {
      id: 's1', type: 'spot', position: v(90, 70, -140), target: v(0, 0, 0), coneAngle: 45, penumbra: 10,
    }],
    ['area light (same position family as point/spot)', { id: 'a1', type: 'area', position: v(80, 100, 0), size: 60, samples: 6 }],
  ])('%s', (label, light) => {
    // Caster: a small sphere (rim-sampled) sitting between the light and the
    // receiver wall. Receiver: a vertical wall face at x=-100 (RGR spec's
    // "receiver box face"), normal +X (facing the caster/light side).
    const CASTER_CENTER = v(0, 40, 0);
    const CASTER_R = 15;
    const WALL_ANCHOR = v(-100, 40, 0);
    const WALL_NORMAL = v(1, 0, 0);
    const casterPts = casterRimPoints(CASTER_CENTER, CASTER_R);

    // The ONE geometric ground truth every assertion below checks against:
    // the ray from the light POSITION through the caster's center,
    // continued past it — the direction any real shadow must fall in.
    const expectedDir = sub(CASTER_CENTER, light.position);

    test('OLD (parallel, azimuth/elevation-blind) footprint direction is WRONG — proves the bug is real', () => {
      const footprint = OLD_projectFootprint(Shadows, casterPts, WALL_ANCHOR, WALL_NORMAL);
      expect(footprint.length).toBeGreaterThan(0); // anti-vacuity
      const fc = centroid(footprint);
      const gotDir = sub(fc, CASTER_CENTER);
      // Old code's projected direction is ALWAYS the fixed 135/45 default,
      // independent of the light's real position — must clear a wide margin.
      expect(angleBetweenDeg(gotDir, expectedDir)).toBeGreaterThan(15);
    });

    test('NEW footprint direction agrees with the light->caster ray within 5 deg (10 deg for area)', () => {
      const footprint = NEW_projectFootprint(Shadows, light, casterPts, WALL_ANCHOR, WALL_NORMAL);
      expect(footprint.length).toBeGreaterThan(0); // anti-vacuity
      const fc = centroid(footprint);
      const gotDir = sub(fc, CASTER_CENTER);
      const tol = light.type === 'area' ? 10 : 5;
      expect(angleBetweenDeg(gotDir, expectedDir)).toBeLessThanOrEqual(tol);
    });

    test('receive-path direction agrees with the ground-shadow path for the SAME light (within 5 deg)', () => {
      // Ground: independent oracle, one caster point (the sphere center is
      // enough — this checks the light-position wiring, not caster shape).
      const groundPt = groundOracle(CASTER_CENTER, light.position);
      expect(groundPt).not.toBeNull();
      const groundDir = sub(groundPt, CASTER_CENTER);

      // Receive: the SAME primitive under test, one point, wall plane.
      const receivePt = typeof Shadows.projectLightToPlane === 'function'
        ? Shadows.projectLightToPlane(CASTER_CENTER, light, WALL_ANCHOR, WALL_NORMAL, DEFAULT_LIGHT_DIR)
        : Shadows.projectAlongDirToPlane(CASTER_CENTER, DEFAULT_LIGHT_DIR, WALL_ANCHOR, WALL_NORMAL);
      expect(receivePt).not.toBeNull();
      const receiveDir = sub(receivePt, CASTER_CENTER);

      // Both directions are projections of the SAME underlying light-to-
      // caster ray onto two different planes — they must point the same way.
      expect(angleBetweenDeg(groundDir, receiveDir)).toBeLessThanOrEqual(5);
    });

    // Sanity check specifically for point/spot: the footprint must sit on
    // the FAR side of the caster from the light (never between the light
    // and the caster, never on the light's own side).
    if (light.type !== 'area') {
      test('footprint sits on the far side of the caster from the light (never between light and caster)', () => {
        const footprint = NEW_projectFootprint(Shadows, light, casterPts, WALL_ANCHOR, WALL_NORMAL);
        const fc = centroid(footprint);
        const distLightToCaster = Math.hypot(...['x', 'y', 'z'].map((k) => light.position[k] - CASTER_CENTER[k]));
        const distLightToFootprint = Math.hypot(...['x', 'y', 'z'].map((k) => light.position[k] - fc[k]));
        expect(distLightToFootprint).toBeGreaterThan(distLightToCaster);
      });
    }
  });
};

describe('Shadows — W-30 flat-face receive footprint direction (current/fixed code)', () => {
  let runtime;
  let Shadows;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    Shadows = runtime.window.Vectura.Scene3D.Shadows;
  });
  afterAll(() => runtime.cleanup());

  test('sanity — the new exports exist', () => {
    expect(typeof Shadows.projectFromPositionToPlane).toBe('function');
    expect(typeof Shadows.projectLightToPlane).toBe('function');
  });

  test('directional light — projectLightToPlane is BYTE-IDENTICAL to the existing parallel projector', () => {
    const light = { id: 'sun', type: 'directional', azimuth: 90, elevation: 25 };
    const dir = v(-0.9063, -0.4226, 0); // any fixed direction; identical for both calls below
    const P = v(0, 40, 0);
    const anchor = v(-100, 40, 0);
    const normal = v(1, 0, 0);
    const viaOld = Shadows.projectAlongDirToPlane(P, dir, anchor, normal);
    const viaNew = Shadows.projectLightToPlane(P, light, anchor, normal, dir);
    expect(viaNew).toEqual(viaOld);
  });

  test('absent/malformed light.position on a point light falls back to the parallel projector (never throws, never NaN)', () => {
    const light = { id: 'p-broken', type: 'point' }; // no position field
    const P = v(0, 40, 0);
    const anchor = v(-100, 40, 0);
    const normal = v(1, 0, 0);
    const viaOld = Shadows.projectAlongDirToPlane(P, DEFAULT_LIGHT_DIR, anchor, normal);
    const viaNew = Shadows.projectLightToPlane(P, light, anchor, normal, DEFAULT_LIGHT_DIR);
    expect(viaNew).toEqual(viaOld);
  });
});

// `runFixtures` builds a `describe.each` tree whose `test()` bodies need the
// REAL `Shadows` object — but that only exists after `beforeAll` resolves,
// while `describe.each` itself runs synchronously at collection time. Route
// every access through a Proxy that reads the CURRENT value of the closed-
// over `Shadows` variable at test-run time (not collection time), so this
// single call is the only place `runFixtures` is invoked.
describe('Shadows — W-30 per-light-type direction fixtures (current/fixed code)', () => {
  let runtime;
  let Shadows;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    Shadows = runtime.window.Vectura.Scene3D.Shadows;
  });
  afterAll(() => runtime.cleanup());

  test('bind — runtime loaded', () => { expect(Shadows).toBeTruthy(); });

  const lazyShadows = new Proxy({}, {
    get(_target, prop) { return Shadows[prop]; },
  });
  runFixtures(lazyShadows);
});

// ── RED-proof pin (BASE_SHA = 8e9b0991, this lane's assigned base — the
// commit immediately before W-30). The pinned shadows.js has neither
// `projectFromPositionToPlane` nor `projectLightToPlane`, so
// `NEW_projectFootprint`'s fallback kicks in and reproduces the OLD
// (parallel, light-blind) behavior — the "agrees within 5 deg" and "agrees
// with ground path" assertions below must FAIL against it.
//
//   VECTURA_PRE_W30=1 npx vitest run tests/unit/scene3d-shadow-footprint-direction.test.js
describe('W-30 RED-proof pin (8e9b0991) — receive-direction fix must be absent', () => {
  let runtime;
  let Shadows;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(preW30RuntimeOptions());
    Shadows = runtime.window.Vectura.Scene3D.Shadows;
  });
  afterAll(() => runtime.cleanup());

  test('pinned shadows.js has neither new export (sanity that this really is the pre-fix tree)', () => {
    if (process.env.VECTURA_PRE_W30 !== '1') {
      // Without the env var this loads the CURRENT (fixed) tree — both
      // exports are present, which is the expected/passing state; this
      // sanity check is only meaningful under VECTURA_PRE_W30=1.
      expect(typeof Shadows.projectLightToPlane).toBe('function');
      return;
    }
    expect(Shadows.projectFromPositionToPlane).toBeUndefined();
    expect(Shadows.projectLightToPlane).toBeUndefined();
  });

  test('same "agrees within 5 deg" assertion as the GREEN test must FAIL here (point light)', () => {
    const light = { id: 'p1', type: 'point', position: v(80, 100, 0) };
    const CASTER_CENTER = v(0, 40, 0);
    const CASTER_R = 15;
    const WALL_ANCHOR = v(-100, 40, 0);
    const WALL_NORMAL = v(1, 0, 0);
    const casterPts = casterRimPoints(CASTER_CENTER, CASTER_R);
    const expectedDir = sub(CASTER_CENTER, light.position);
    // UNCONDITIONAL — the exact same assertion the GREEN test in the
    // "per-light-type direction fixtures" block above makes. Run without
    // VECTURA_PRE_W30 this loads the CURRENT (fixed) tree and passes
    // trivially; run with VECTURA_PRE_W30=1 it loads the pinned 8e9b0991
    // `shadows.js` (no `projectLightToPlane` export), `NEW_projectFootprint`
    // falls back to the OLD parallel path, and this assertion FAILS — proof
    // the bug was real and this fix is what closes it.
    const footprint = NEW_projectFootprint(Shadows, light, casterPts, WALL_ANCHOR, WALL_NORMAL);
    const fc = centroid(footprint);
    const gotDir = sub(fc, CASTER_CENTER);
    const angle = angleBetweenDeg(gotDir, expectedDir);
    expect(angle).toBeLessThanOrEqual(5);
  });
});
