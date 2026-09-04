const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Scene3D I26 — inverse / subtractive shadow mode.
 *
 * additive (default): the cast shadow ADDS hatch in the footprint.
 * inverse: the shadow SUBTRACTS/THINS the ground layer's OWN fill inside the
 *   footprint so more dark paper shows through (white ink on black paper).
 *
 * Both runs are driven through the FULL scene3d algorithm (generate) with a
 * hatch-FILLED ground + one box caster, so the inverse composition is exercised
 * against real ground fill lines — a unit test that only calls Shadows.build in
 * isolation could never see the ground's own fill.
 */

const clone = (value) => JSON.parse(JSON.stringify(value));
const BOUNDS = { width: 320, height: 220, penWidth: 0.3 };

const boxObj = (id, x, y, size = 30) => ({
  id, name: id, primitive: 'box', params: { sx: size, sy: size, sz: size },
  transform: { x, y, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
});

// A flat torus above the plate — its cast footprint is an ANNULUS, so inverse
// thinning must leave the ground fill under the central HOLE untouched.
const torusObj = (id, x, y) => ({
  id, name: id, primitive: 'torus', params: { sx: 80, sy: 18, sz: 18, detail: 26 },
  transform: { x, y, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
});

describe('Scene3D I26 — inverse / subtractive shadow mode', () => {
  let runtime;
  let V;
  let HLR;
  let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    HLR = V.Scene3D.HLR;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });

  afterAll(() => runtime.cleanup());

  // A scene with a hatch-FILLED ground + given casters, a fixed sun, and the
  // shadow bag supplied by the caller (mode + density live here).
  const sceneParams = (objects, shadow) => V.Scene3D.Params.normalizeParams({
    ...clone(defaults),
    objects,
    ground: { enabled: true },
    // Give the ground its OWN hatch pattern — the surface inverse mode thins.
    styleTable: { byObject: { ground: { mapper: 'hatch', penId: null, params: { fillDensity: 70 } } } },
    lights: [{ id: 'sun', type: 'directional', azimuth: 160, elevation: 45, castShadows: true }],
    camera: { projection: 'orthographic', yaw: 0, pitch: 55, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
    shadow,
  });

  const run = (objects, shadow) =>
    V.AlgorithmRegistry.scene3d.generate(sceneParams(objects, shadow), null, null, BOUNDS) || [];

  const isCastShadow = (p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.regionClass === 'castShadow';
  const isGroundFill = (p) => p.meta && p.meta.kind === 'sceneFill'
    && p.meta.sceneTarget && p.meta.sceneTarget.objectId === 'ground'
    && p.meta.sceneTarget.regionClass !== 'castShadow';

  // Footprint polygon(s) from an ADDITIVE run's cast-shadow pickPolygons.
  const footprintPolys = (paths) => [...new Set(
    paths.filter(isCastShadow).map((p) => JSON.stringify(p.meta.sceneTarget.pickPolygon)))]
    .map((s) => JSON.parse(s));

  const insideAnyFootprint = (pt, polys) => polys.some((poly) => HLR.pointInPolygon(pt, poly));

  // Ground fill lines span the whole plate, so measure INK LENGTH inside vs
  // outside the footprint (not a per-line count): subdivide each segment and
  // attribute each step's length by whether its midpoint sits in a footprint.
  const groundInk = (paths, polys) => {
    let inside = 0; let outside = 0;
    paths.filter(isGroundFill).forEach((path) => {
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]; const b = path[i];
        const segLen = Math.hypot(b.x - a.x, b.y - a.y);
        if (!(segLen > 0)) continue;
        const steps = Math.max(1, Math.ceil(segLen / 1.5));
        for (let k = 0; k < steps; k++) {
          const t = (k + 0.5) / steps;
          const m = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
          if (polys && insideAnyFootprint(m, polys)) inside += segLen / steps; else outside += segLen / steps;
        }
      }
    });
    return { inside, outside };
  };

  test('additive default: emits cast-shadow hatch and leaves the ground fill intact', () => {
    const additive = run([boxObj('box', 0, 40, 34)], { shadowMode: 'additive', shadowDensity: 50 });
    expect(additive.filter(isCastShadow).length).toBeGreaterThan(0);
    // Sanity: the ground actually carries its own fill to thin.
    expect(additive.filter(isGroundFill).length).toBeGreaterThan(20);
  });

  test('inverse: thins the ground fill INSIDE the footprint, emits NO shadow hatch', () => {
    const objects = [boxObj('box', 0, 40, 34)];
    const additive = run(objects, { shadowMode: 'additive', shadowDensity: 50 });
    const inverse = run(objects, { shadowMode: 'inverse', shadowDensity: 50 });

    const polys = footprintPolys(additive);
    expect(polys.length).toBeGreaterThan(0);

    // Inverse emits no additive shadow hatch — it only subtracts.
    expect(inverse.filter(isCastShadow).length).toBe(0);

    const add = groundInk(additive, polys);
    const inv = groundInk(inverse, polys);

    // Sanity: there IS meaningful ground fill inside the footprint to subtract.
    expect(add.inside).toBeGreaterThan(5);
    // Ground ink INSIDE the footprint is reduced vs additive (portions erased).
    expect(inv.inside).toBeLessThan(add.inside * 0.85);
    // Ground ink OUTSIDE the footprint is untouched (within float tolerance).
    expect(Math.abs(inv.outside - add.outside)).toBeLessThan(add.outside * 0.02 + 1);
  });

  test('inverse density: a denser shadow removes MORE ground fill inside the footprint', () => {
    const objects = [boxObj('box', 0, 40, 34)];
    const additive = run(objects, { shadowMode: 'additive', shadowDensity: 50 });
    const polys = footprintPolys(additive);

    const light = run(objects, { shadowMode: 'inverse', shadowDensity: 20 });
    const heavy = run(objects, { shadowMode: 'inverse', shadowDensity: 90 });

    const lightInside = groundInk(light, polys).inside;
    const heavyInside = groundInk(heavy, polys).inside;
    // Higher shadow density ⇒ more ink removed ⇒ less ground ink remains inside.
    expect(heavyInside).toBeLessThan(lightInside);
  });

  test('inverse preserves the torus HOLE: ground fill under the annulus centre survives', () => {
    const objects = [torusObj('ring', 0, 120)];
    const additive = run(objects, { shadowMode: 'additive', shadowDensity: 60 });
    const inverse = run(objects, { shadowMode: 'inverse', shadowDensity: 60 });

    // Outer footprint ring + its centroid (the hole centre).
    const polys = footprintPolys(additive);
    expect(polys.length).toBeGreaterThan(0);
    const area = (poly) => { let a = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j].x * poly[i].y - poly[i].x * poly[j].y; return Math.abs(a); };
    const outer = polys.slice().sort((a, b) => area(b) - area(a))[0];
    let cx = 0; let cy = 0; outer.forEach((p) => { cx += p.x; cy += p.y; }); cx /= outer.length; cy /= outer.length;
    let R = 0; outer.forEach((p) => { R = Math.max(R, Math.hypot(p.x - cx, p.y - cy)); });

    // Ground INK in the central hole (< 0.15 R of the centroid, safely inside the
    // inner rim) must be ESSENTIALLY UNCHANGED between additive and inverse — the
    // annulus never thins its own hole (even-odd → the hole reads as outside).
    const holeInk = (paths) => {
      let total = 0;
      paths.filter(isGroundFill).forEach((path) => {
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1]; const b = path[i];
          const segLen = Math.hypot(b.x - a.x, b.y - a.y);
          if (!(segLen > 0)) continue;
          const steps = Math.max(1, Math.ceil(segLen / 1.5));
          for (let k = 0; k < steps; k++) {
            const t = (k + 0.5) / steps;
            const mx = a.x + (b.x - a.x) * t; const my = a.y + (b.y - a.y) * t;
            if (Math.hypot(mx - cx, my - cy) < R * 0.15) total += segLen / steps;
          }
        }
      });
      return total;
    };
    const addHole = holeInk(additive);
    expect(addHole).toBeGreaterThan(5);
    // Inverse keeps ≥ 99% of the hole ink (contrast the footprint at large, which
    // loses a real share) — the central hole is preserved.
    expect(holeInk(inverse)).toBeGreaterThan(addHole * 0.99);
  });

  test('inverse with an UNFILLED ground is a no-op (nothing to subtract)', () => {
    // Ground mapper 'none' → no ground fill; inverse can only thin an existing
    // pattern, so the output is byte-identical to the additive-minus-hatch case.
    const objects = [boxObj('box', 0, 40, 34)];
    const params = V.Scene3D.Params.normalizeParams({
      ...clone(defaults), objects, ground: { enabled: true },
      styleTable: { byObject: { ground: { mapper: 'none', penId: null, params: {} } } },
      lights: [{ id: 'sun', type: 'directional', azimuth: 160, elevation: 45, castShadows: true }],
      camera: { projection: 'orthographic', yaw: 0, pitch: 55, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
      shadow: { shadowMode: 'inverse', shadowDensity: 50 },
    });
    const paths = V.AlgorithmRegistry.scene3d.generate(params, null, null, BOUNDS) || [];
    // No ground fill to thin, and inverse emits no additive hatch.
    expect(paths.filter(isGroundFill).length).toBe(0);
    expect(paths.filter(isCastShadow).length).toBe(0);
  });

  test('shadowMode round-trips through normalizeParams (serialization parity)', () => {
    const norm = V.Scene3D.Params.normalizeParams({ ...clone(defaults), shadow: { shadowMode: 'inverse' } });
    expect(norm.shadow.shadowMode).toBe('inverse');
    const back = V.Scene3D.Params.normalizeParams({ ...clone(defaults), shadow: { shadowMode: 'bogus' } });
    expect(back.shadow.shadowMode).toBe('additive');
    const missing = V.Scene3D.Params.normalizeParams({ ...clone(defaults) });
    expect(missing.shadow.shadowMode).toBe('additive');
  });
});
