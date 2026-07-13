/*
 * Raster-Plane — mesh/topography true hidden-line removal (See-Through OFF).
 *
 * The per-vertex back-face test alone lets front-facing geometry BEHIND a hill
 * draw straight through it (a far valley shows through the near plateau). With
 * See-Through OFF the emitted wires must additionally be clipped against the
 * surface itself: a screen-space depth buffer built from the same sampler
 * occludes every surviving path, with slope-scaled bias so the surface never
 * eats its own crest/silhouette lines.
 *
 * Fixture: a 64×64 step grid — tall plateau (h=1) on the plan half NEARER the
 * camera, low ground behind. Pre-change the far half leaked through the tall
 * top face (~131 sampled points for mesh); post-change the leak must be zero
 * while See-Through ON output stays byte-identical.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Raster-Plane — mesh/topography hidden-line removal (See-Through OFF)', () => {
  let runtime;
  let V;
  let G3;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    G3 = V.Geometry3D;
  });

  afterAll(() => runtime.cleanup());

  const bounds = { width: 800, height: 600 };
  const SIZE = 150;
  const ROT = -45;
  const TILT = 60;
  const AMP = 30;

  const gen = (params) =>
    V.AlgorithmRegistry.rasterPlane.generate(params, null, new V.SimpleNoise(7), bounds);

  const baseParams = (extra) => ({
    mode: 'mesh', rows: 24, columns: 24, sampleDetail: 84, amplitude: AMP,
    artworkSize: SIZE, smoothing: 0, rotate: ROT, tilt: TILT, seeThrough: false,
    depthBias: 0.5, ...extra,
  });

  // Which plan half is nearer the camera (larger rotated z = nearer)?
  const planZ = (pz) => G3.rotatePoint({ x: 0, y: 0, z: pz }, { yaw: ROT, pitch: TILT, roll: 0 }).z;
  const nearIsHighV = () => planZ(SIZE / 2) > planZ(-SIZE / 2);
  const highV = (vv) => (nearIsHighV() ? vv >= 0.5 : vv <= 0.5);

  // Step fixture: tall plateau (h=1) on the near half, low ground (h=0) behind.
  const stepGrid = () => Array.from({ length: 64 }, (_, y) =>
    Array.from({ length: 64 }, () => (highV((y + 0.5) / 64) ? 1 : 0)));

  // Same step, but the far half carries height stripes along u (0.2 / 0.5) so
  // topography draws real contour lines BEHIND the plateau.
  const stripeGrid = () => Array.from({ length: 64 }, (_, y) =>
    Array.from({ length: 64 }, (_, x) => {
      if (highV((y + 0.5) / 64)) return 1;
      return (Math.floor(x / 8) % 2) ? 0.5 : 0.2;
    }));

  // Mirror of the algorithm's surface projection (ortho, centerX 400 / centerY 300).
  const proj = (u, vv, h) => {
    const centered = { x: -SIZE / 2 + u * SIZE, y: (h - 0.5) * AMP, z: -SIZE / 2 + vv * SIZE };
    const rotated = G3.rotatePoint(centered, { yaw: ROT, pitch: TILT, roll: 0 });
    return G3.projectPoint(rotated, { centerX: bounds.width / 2, centerY: bounds.height / 2, scale: 1 });
  };

  // Projected top-face quad of the tall plateau (h = 1 over the near half).
  const tallTopQuad = () => {
    const vA = nearIsHighV() ? 0.5 : 0;
    const vB = nearIsHighV() ? 1 : 0.5;
    return [proj(0, vA, 1), proj(1, vA, 1), proj(1, vB, 1), proj(0, vB, 1)];
  };

  const pointInPoly = (px, py, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if (((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  };

  const distToPolyEdge = (px, py, poly) => {
    let best = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const ax = poly[j].x, ay = poly[j].y, bx = poly[i].x, by = poly[i].y;
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d < best) best = d;
    }
    return best;
  };

  // Walk every path at ~2px steps and count samples inside the (4px-eroded) quad.
  const countInsideQuad = (paths, quad, classify) => {
    let count = 0;
    paths.forEach((p) => {
      if (!Array.isArray(p) || p.length < 2) return;
      for (let i = 0; i < p.length - 1; i++) {
        const steps = Math.max(1, Math.round(Math.hypot(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y) / 2));
        for (let k = 0; k <= steps; k++) {
          const t = k / steps;
          const x = p[i].x + (p[i + 1].x - p[i].x) * t;
          const y = p[i].y + (p[i + 1].y - p[i].y) * t;
          if (classify && !classify(x, y)) continue;
          if (pointInPoly(x, y, quad) && distToPolyEdge(x, y, quad) > 4) count++;
        }
      }
    });
    return count;
  };

  const totalLen = (paths) => paths.reduce((sum, p) => {
    if (!Array.isArray(p)) return sum;
    let len = 0;
    for (let i = 1; i < p.length; i++) len += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    return sum + len;
  }, 0);

  test('A: far low ground no longer leaks through the tall top face (mesh)', () => {
    const paths = gen(baseParams({ fixtureGrid: stepGrid() }));
    expect(paths.length).toBeGreaterThan(0);
    // NOTE on classification: proximity to projected low-grid points is
    // degenerate under these exact parameters — proj(u, v, 1) lands within
    // ~0.35px of proj(u - 2/24, v - 2/24, 0), so every hidden ground vertex
    // coincides on screen with a LEGIT plateau vertex two rows nearer. Screen
    // proximity therefore cannot tell leaked far ink from correct near ink.
    // Classify by the path's own camera depth instead: a row path whose mean
    // depth is on the ground side of the step must never put a sample inside
    // the (4px-eroded) tall top-face quad. Pre-change the full ground row at
    // v = 11/24 rides straight through the quad — red.
    const rotZ = (vv, h) => G3.rotatePoint(
      { x: 0, y: (h - 0.5) * AMP, z: -SIZE / 2 + vv * SIZE },
      { yaw: ROT, pitch: TILT, roll: 0 },
    ).z;
    const cutoff = (rotZ(11 / 24, 0) + rotZ(13 / 24, 1)) / 2;
    const quad = tallTopQuad();
    const farRowPaths = paths.filter((p) => Array.isArray(p) && p.meta
      && p.meta.axis === 'row' && Number.isFinite(p.meta.depth) && p.meta.depth < cutoff);
    const leak = countInsideQuad(farRowPaths, quad, null);
    expect(leak).toBe(0);
    // The plateau itself must still be drawn (near-depth rows cross the quad).
    const nearRowPaths = paths.filter((p) => Array.isArray(p) && p.meta
      && p.meta.axis === 'row' && Number.isFinite(p.meta.depth) && p.meta.depth >= cutoff);
    expect(countInsideQuad(nearRowPaths, quad, null)).toBeGreaterThan(0);
  });

  test('B: See-Through ON output is untouched by the surface clip', () => {
    const paths = gen(baseParams({ fixtureGrid: stepGrid(), seeThrough: true }));
    // Pinned pre-change values for this exact scene: the surface clip must not
    // alter the see-through pipeline in any way.
    expect(paths.length).toBe(75);
    expect(paths.filter((p) => p.meta && p.meta.hiddenLine).length).toBe(1);
    expect(totalLen(paths)).toBeCloseTo(6723.290616859425, 6);
  });

  test('C: far contours no longer leak through the tall top face (topography)', () => {
    const paths = gen(baseParams({ mode: 'topography', fixtureGrid: stripeGrid() }));
    expect(paths.length).toBeGreaterThan(0);
    // The plateau top is flat at h=1 (no contours cross it) and its cliff is
    // back-facing (culled), so EVERY point inside the eroded tall quad is a
    // leaked far contour. Pre-change: 35 leaked samples.
    const leak = countInsideQuad(paths, tallTopQuad(), null);
    expect(leak).toBe(0);
  });

  test('E: no over-occlusion — the plateau wireframe survives whole (mesh)', () => {
    // View chosen to break the -45/60/30 lattice degeneracy AND to expose the
    // crest defect: at -38/55 the central-difference surface normal at the
    // crest row (v = 0.5) smears the cliff into the top-face vertex and used
    // to misclassify the whole crest row as back-facing — the visibility pass
    // ate a legitimately-visible line the depth clip would have kept. Nothing
    // is in front of the plateau top in this scene, so ≥ 99.5% of its
    // wireframe must emit ink.
    const rot = -38;
    const tilt = 55;
    const amp = 26;
    const planZ2 = (pz) => G3.rotatePoint({ x: 0, y: 0, z: pz }, { yaw: rot, pitch: tilt, roll: 0 }).z;
    const nearHigh = planZ2(SIZE / 2) > planZ2(-SIZE / 2);
    const hv = (vv) => (nearHigh ? vv >= 0.5 : vv <= 0.5);
    const grid = Array.from({ length: 64 }, (_, y) =>
      Array.from({ length: 64 }, () => (hv((y + 0.5) / 64) ? 1 : 0)));
    const paths = gen(baseParams({ rotate: rot, tilt, amplitude: amp, fixtureGrid: grid }));
    const pr = (u, vv, h) => {
      const c = { x: -SIZE / 2 + u * SIZE, y: (h - 0.5) * amp, z: -SIZE / 2 + vv * SIZE };
      return G3.projectPoint(G3.rotatePoint(c, { yaw: rot, pitch: tilt, roll: 0 }),
        { centerX: bounds.width / 2, centerY: bounds.height / 2, scale: 1 });
    };
    const distToSeg = (px, py, a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / L2)) : 0;
      return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
    };
    const inkNear = (x, y) => paths.some((p) => {
      if (!Array.isArray(p) || p.length < 2) return false;
      for (let i = 0; i < p.length - 1; i++) if (distToSeg(x, y, p[i], p[i + 1]) < 0.8) return true;
      return false;
    });
    // Sample the plateau's own wireframe (h=1 rows and columns of the high half).
    const highRows = [];
    for (let yi = 0; yi <= 24; yi++) if (hv(yi / 24)) highRows.push(yi);
    const wires = [];
    highRows.forEach((yi) => {
      for (let xi = 0; xi < 24; xi++) wires.push([pr(xi / 24, yi / 24, 1), pr((xi + 1) / 24, yi / 24, 1)]);
    });
    for (let xi = 0; xi <= 24; xi++) {
      for (let k = 0; k < highRows.length - 1; k++) {
        if (highRows[k + 1] - highRows[k] !== 1) continue;
        wires.push([pr(xi / 24, highRows[k] / 24, 1), pr(xi / 24, highRows[k + 1] / 24, 1)]);
      }
    }
    let total = 0;
    let missing = 0;
    wires.forEach(([a, b]) => {
      const steps = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 2));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        total++;
        if (!inkNear(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) missing++;
      }
    });
    expect(missing / total).toBeLessThanOrEqual(0.005);
  });

  test('D: default relief shows no depth-acne fragmentation (mesh)', () => {
    const paths = gen(baseParams({}));
    expect(paths.length).toBeGreaterThan(0);
    // Self-occlusion must not stipple lines that lie ON the surface: tiny
    // fragments (< 1.5px) stay rare and the drawn length stays sane.
    const tiny = paths.filter((p) => Array.isArray(p) && totalLen([p]) < 1.5).length;
    expect(tiny / paths.length).toBeLessThan(0.05);
    const len = totalLen(paths);
    expect(len).toBeGreaterThan(2000);
    expect(len).toBeLessThan(8000);
  });

  test('E: no whisker hooks at the crest — far ink stays off the plateau side (crease rule)', () => {
    // View deliberately breaks the (-45, 60) lattice symmetry: at the default
    // angles the far grid projects onto the plateau's own lattice, so burrs
    // hide inside legitimate wires and no screen metric can see them.
    const ROT2 = -38, TILT2 = 55, AMP2 = 26;
    const nearHigh2 = G3.rotatePoint({ x: 0, y: 0, z: SIZE / 2 }, { yaw: ROT2, pitch: TILT2, roll: 0 }).z
      > G3.rotatePoint({ x: 0, y: 0, z: -SIZE / 2 }, { yaw: ROT2, pitch: TILT2, roll: 0 }).z;
    const highV2 = (vv) => (nearHigh2 ? vv >= 0.5 : vv <= 0.5);
    const grid2 = Array.from({ length: 64 }, (_, y) =>
      Array.from({ length: 64 }, () => (highV2((y + 0.5) / 64) ? 1 : 0)));
    // Each far-grid column crosses the step through a cliff-drop segment that
    // STARTS exactly on the crest surface. A per-vertex visibility test keeps
    // that segment (both endpoints are flat and visible) and the depth bias
    // then preserves its first pixel — a "hook" burr at every crest crossing.
    // The crease rule kills the drop at the source: a grid segment draws only
    // if one of its two adjacent faces looks at the camera, and both faces
    // beside a back-facing cliff drop are the cliff itself.
    const paths = gen(baseParams({ fixtureGrid: grid2, rotate: ROT2, tilt: TILT2, amplitude: AMP2 }));
    const proj = (u, vv, h) => G3.projectPoint(
      G3.rotatePoint(
        { x: -SIZE / 2 + u * SIZE, y: (h - 0.5) * AMP2, z: -SIZE / 2 + vv * SIZE },
        { yaw: ROT2, pitch: TILT2, roll: 0 },
      ),
      { centerX: bounds.width / 2, centerY: bounds.height / 2, scale: 1 },
    );
    const cA = proj(0, 0.5, 1);
    const cB = proj(1, 0.5, 1);
    const crossSide = (x, y) => (cB.x - cA.x) * (y - cA.y) - (cB.y - cA.y) * (x - cA.x);
    const refIn = proj(0.5, nearHigh2 ? 0.9 : 0.1, 1);
    const plateauSign = Math.sign(crossSide(refIn.x, refIn.y) || 1);
    const distToCrest = (x, y) => {
      const dx = cB.x - cA.x, dy = cB.y - cA.y;
      const L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, ((x - cA.x) * dx + (y - cA.y) * dy) / L2)) : 0;
      return Math.hypot(x - (cA.x + t * dx), y - (cA.y + t * dy));
    };
    // Attribution is geometric, not depth-based (at this yaw the camera depth
    // varies more ALONG the crest than between the two surfaces): ink on the
    // plateau side of the crest is legitimate only where the plateau's own
    // wireframe runs. A hook is ink in the mid-crest band, 0.5–4px onto the
    // plateau side, further than 1.2px from EVERY plateau wire (rows, columns
    // and boundary edges of the h=1 half) — the cliff drops kink away from
    // the lattice, so pre-fix burrs land squarely in that dead zone. The u
    // extremes are excluded (around-the-corner visibility there is genuine).
    const distToSegLocal = (x, y, a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y;
      const L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2)) : 0;
      return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
    };
    const N = 24;
    const wires = [];
    for (let yi = 0; yi <= N; yi++) {
      if (!highV2(yi / N) && Math.abs(yi / N - 0.5) > 1e-9) continue;
      for (let xi = 0; xi < N; xi++) wires.push([proj(xi / N, yi / N, 1), proj((xi + 1) / N, yi / N, 1)]);
    }
    for (let xi = 0; xi <= N; xi++) {
      for (let yi = 0; yi < N; yi++) {
        const vA = yi / N, vB = (yi + 1) / N;
        if (!(highV2(vA) || Math.abs(vA - 0.5) < 1e-9) || !highV2(vB)) continue;
        wires.push([proj(xi / N, vA, 1), proj(xi / N, vB, 1)]);
      }
    }
    const onPlateauWire = (x, y) => wires.some(([a, b]) => distToSegLocal(x, y, a, b) < 1.2);
    const uBandLo = 0.15, uBandHi = 0.85;
    const bandLoX = cA.x + (cB.x - cA.x) * uBandLo;
    const bandHiX = cA.x + (cB.x - cA.x) * uBandHi;
    let hooks = 0;
    paths.forEach((p) => {
      if (!Array.isArray(p) || p.length < 2) return;
      for (let i = 0; i < p.length - 1; i++) {
        const steps = Math.max(1, Math.round(Math.hypot(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y) * 2));
        for (let k = 0; k <= steps; k++) {
          const t = k / steps;
          const x = p[i].x + (p[i + 1].x - p[i].x) * t;
          const y = p[i].y + (p[i + 1].y - p[i].y) * t;
          if (x < Math.min(bandLoX, bandHiX) || x > Math.max(bandLoX, bandHiX)) continue;
          if (Math.sign(crossSide(x, y) || plateauSign) !== plateauSign) continue;
          const d = distToCrest(x, y);
          if (d <= 0.5 || d >= 4) continue;
          if (!onPlateauWire(x, y)) hooks++;
        }
      }
    });
    expect(hooks).toBe(0);
  });
});
