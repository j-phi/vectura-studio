const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { pathSignature } = require('../helpers/path-signature');

const clone = (value) => JSON.parse(JSON.stringify(value));

const bounds = {
  width: 320,
  height: 220,
  m: 20,
  dW: 280,
  dH: 180,
  truncate: true,
};

const countPoints = (paths) =>
  (paths || []).reduce((sum, path) => sum + (Array.isArray(path) ? path.length : 0), 0);

const finitePaths = (paths) =>
  Array.isArray(paths) &&
  paths.length > 0 &&
  paths.every((path) =>
    Array.isArray(path) &&
    path.length >= 2 &&
    path.every((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y))
  );

const totalLen = (paths) =>
  (paths || []).reduce((sum, path) => {
    if (!Array.isArray(path)) return sum;
    let len = 0;
    for (let i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    return sum + len;
  }, 0);

const closed = (path) => {
  const first = path?.[0];
  const last = path?.[path.length - 1];
  return !!first && !!last && Math.hypot(first.x - last.x, first.y - last.y) < 1e-6;
};

describe('Vectura geometry algorithms', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  const generate = (type, overrides = {}, seed = 4242, extraBounds = {}) => {
    const params = {
      ...clone(V.ALGO_DEFAULTS[type]),
      ...clone(overrides),
      seed,
      posX: 0,
      posY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      simplify: 0,
    };
    return V.Algorithms[type].generate(
      params,
      new V.SeededRNG(seed),
      new V.SimpleNoise(seed),
      { ...bounds, ...extraBounds }
    ) || [];
  };

  test.each(['spirograph', 'spiralizer', 'polyhedron', 'topoform', 'rasterPlane'])('%s default output is finite and non-empty', (type) => {
    expect(finitePaths(generate(type))).toBe(true);
  });

  test.each(['spirograph', 'spiralizer', 'polyhedron', 'topoform', 'rasterPlane'])('%s has an explicit layer icon', (type) => {
    const icon = V.Icons?.layer?.[type];
    expect(typeof icon).toBe('function');
    expect(icon()).toContain('<svg');
    expect(icon()).not.toBe(V.Icons.layer.grid());
  });

  test('spirograph closes inside/outside paths and clamps oversized gear ratios', () => {
    const both = generate('spirograph', { rollMode: 'both', curveResolution: 260 });
    expect(both).toHaveLength(2);
    expect(both.every(closed)).toBe(true);

    const oversized = generate('spirograph', { rollMode: 'inside', mainTeeth: 20, gearTeeth: 499, curveResolution: 180 });
    expect(finitePaths(oversized)).toBe(true);
    expect(closed(oversized[0])).toBe(true);
  });

  test('spiralizer supports shapes, see-through hidden dashes, and dot loops', () => {
    ['sphere', 'cone', 'cylinder', 'ellipsoid', 'torus', 'capsule'].forEach((shape) => {
      expect(finitePaths(generate('spiralizer', { shape, curveResolution: 120 }))).toBe(true);
    });

    const sphere = generate('spiralizer', { shape: 'sphere', sphereRadius: 50, curveResolution: 120 });
    const equalEllipsoid = generate('spiralizer', {
      shape: 'ellipsoid',
      ellipsoidEquatorRadius: 50,
      ellipsoidPolarRadius: 50,
      curveResolution: 120,
    });
    expect(pathSignature(sphere)).toBe(pathSignature(equalEllipsoid));

    const front = generate('spiralizer', { surfaceMode: 'front', curveResolution: 160 });
    const seeThrough = generate('spiralizer', { surfaceMode: 'seeThrough', curveResolution: 160 });
    expect(countPoints(seeThrough)).toBeGreaterThanOrEqual(countPoints(front));
    expect(seeThrough.some((path) => path.meta?.hiddenLine && Array.isArray(path.meta.strokeDash))).toBe(true);

    const dots = generate('spiralizer', { renderStyle: 'dots', dotSpacing: 8, curveResolution: 100 });
    expect(dots.some(closed)).toBe(true);
  });

  test('spiralizer torus and capsule surfaces are finite and geometrically distinct', () => {
    const opts = { curveResolution: 240, turns: 24 };
    const sphere = generate('spiralizer', { shape: 'sphere', ...opts });
    const torus = generate('spiralizer', { shape: 'torus', torusRingRadius: 64, torusTubeRadius: 24, ...opts });
    const capsule = generate('spiralizer', { shape: 'capsule', capsuleRadius: 44, capsuleHeight: 120, ...opts });
    [torus, capsule].forEach((paths) => {
      expect(finitePaths(paths)).toBe(true);
      expect(countPoints(paths)).toBeGreaterThan(0);
    });
    // Each surface produces a different wrap, so signatures must diverge.
    expect(pathSignature(torus)).not.toBe(pathSignature(sphere));
    expect(pathSignature(capsule)).not.toBe(pathSignature(sphere));
    expect(pathSignature(torus)).not.toBe(pathSignature(capsule));

    // A degenerate-height capsule collapses to a sphere of the same radius:
    // both caps meet with no barrel, so the wrap matches a sphere wrap.
    const flatCapsule = generate('spiralizer', { shape: 'capsule', capsuleRadius: 50, capsuleHeight: 0, ...opts });
    const matchSphere = generate('spiralizer', { shape: 'sphere', sphereRadius: 50, ...opts });
    expect(pathSignature(flatCapsule)).toBe(pathSignature(matchSphere));
  });

  test('spiralizer 3D enhancements (depth-cue + emphasizeOutline + hidden-line dash) alter output', () => {
    // Use a closed surface with a front-only outline so the silhouette + hidden-
    // line machinery is exercised (the helix shape itself is an open coil whose
    // default outline is none — that path is covered in spiralizer-render-styles).
    const baseOverrides = { curveResolution: 200, shape: 'sphere', surfaceMode: 'front', outlineMode: 'outline' };
    const off = generate('spiralizer', baseOverrides);
    const on = generate('spiralizer', {
      ...baseOverrides,
      depthCue: 'dash',
      depthCueStrength: 80,
      emphasizeOutline: true,
      outlineWeight: 3,
      hiddenLineMode: 'dash',
    });

    // Still finite and non-empty.
    expect(finitePaths(on)).toBe(true);

    // Output differs from all-off.
    expect(pathSignature(on)).not.toBe(pathSignature(off));

    // Hidden-line 'dash' keeps back-facing wrap runs and marks them dashed.
    expect(on.some((path) => path.meta?.hiddenLine && Array.isArray(path.meta.strokeDash))).toBe(true);
    expect(on.length).toBeGreaterThan(off.length);

    // emphasizeOutline stamps weightScale on the silhouette rings (off has none).
    expect(on.some((path) => path.meta?.outline && path.meta.weightScale === 3)).toBe(true);
    expect(off.every((path) => path.meta?.weightScale === undefined)).toBe(true);

    // depthCue stamps a near/far strokeDash on visible (non-hidden) wrap paths;
    // all-off leaves every path solid (no strokeDash).
    expect(on.some((path) => !path.meta?.hiddenLine && Array.isArray(path.meta?.strokeDash))).toBe(true);
    expect(off.every((path) => !Array.isArray(path.meta?.strokeDash))).toBe(true);
  });

  test('polyhedron supports solids, toggles, and dashed hidden lines', () => {
    [
      'flatPolygon',
      'prism',
      'antiprism',
      'bipyramid',
      'tetrahedron',
      'cube',
      'octahedron',
      'icosahedron',
      'buckyball',
    ].forEach((solidType) => {
      expect(finitePaths(generate('polyhedron', { solidType, sideCount: 6, faceBands: 1 }))).toBe(true);
    });

    const edgesOnly = generate('polyhedron', { showFaces: false, showEdges: true, showVertices: false });
    const verticesOnly = generate('polyhedron', { showFaces: false, showEdges: false, showVertices: true });
    expect(edgesOnly.length).toBeGreaterThan(0);
    expect(verticesOnly.length).toBeGreaterThan(0);

    const seeThrough = generate('polyhedron', { surfaceMode: 'all', faceOpacityMode: 'seeThrough' });
    const opaque = generate('polyhedron', { surfaceMode: 'all', faceOpacityMode: 'opaque' });
    expect(seeThrough.some((path) => path.meta?.hiddenLine)).toBe(true);
    expect(opaque.some((path) => path.meta?.hiddenLine)).toBe(false);
  });

  test('polyhedron buckyball uses pentagon/hexagon topology', () => {
    const vertexOnly = generate('polyhedron', {
      solidType: 'buckyball',
      surfaceMode: 'all',
      faceOpacityMode: 'seeThrough',
      showFaces: false,
      showEdges: false,
      showVertices: true,
      vertexOcclusionMode: 'outline',
      vertexRings: 1,
    });
    expect(vertexOnly.filter((path) => path.meta?.vertex !== undefined)).toHaveLength(60);

    const edgeOnly = generate('polyhedron', {
      solidType: 'buckyball',
      surfaceMode: 'all',
      faceOpacityMode: 'seeThrough',
      showFaces: false,
      showEdges: true,
      edgeStyle: 'line',
      showVertices: false,
    });
    expect(edgeOnly.filter((path) => path.meta?.edge)).toHaveLength(90);
  });

  test('polyhedron point fill masks underlying linework without culling markers', () => {
    const base = {
      solidType: 'cube',
      surfaceMode: 'all',
      faceOpacityMode: 'seeThrough',
      showFaces: true,
      faceBands: 2,
      showEdges: true,
      edgeStyle: 'line',
      showVertices: true,
      vertexSize: 10,
      vertexRings: 1,
    };
    const outline = generate('polyhedron', { ...base, vertexOcclusionMode: 'outline' });
    const masked = generate('polyhedron', { ...base, vertexOcclusionMode: 'occlude' });
    expect(finitePaths(masked)).toBe(true);
    expect(masked.filter((path) => path.meta?.vertex !== undefined)).toHaveLength(
      outline.filter((path) => path.meta?.vertex !== undefined).length
    );
    expect(pathSignature(masked)).not.toBe(pathSignature(outline));
    expect(countPoints(masked)).not.toBe(countPoints(outline));
  });

  test('polyhedron wires the four shared 3D enhancements (each toggle changes output, default stays off)', () => {
    const baseline = generate('polyhedron');
    const baselineSig = pathSignature(baseline);
    expect(finitePaths(baseline)).toBe(true);

    // Geometry-changing toggles must alter the projected path geometry itself.
    // (pathSignature hashes only x/y, so meta-only toggles are verified separately.)
    const geometryCases = {
      emphasizeOutline: { emphasizeOutline: true, outlineWeight: 3 },
      showCreases: { showCreases: true, creaseAngle: 20 },
      hiddenLineRemove: { hiddenLineMode: 'remove' },
      hiddenLineDash: { hiddenLineMode: 'dash' },
      hatchEnable: { hatchEnable: true, hatchSpacing: 5 },
      crossHatch: { hatchEnable: true, crossHatch: true, hatchSpacing: 5 },
    };
    Object.entries(geometryCases).forEach(([name, overrides]) => {
      const out = generate('polyhedron', overrides);
      expect(finitePaths(out), `${name} produces finite non-empty geometry`).toBe(true);
      expect(pathSignature(out), `${name} differs from all-off baseline`).not.toBe(baselineSig);
    });

    // #2 Depth cue is meta-only: stamps meta.depth + a depth-driven strokeDash on
    // visible paths; default (off) leaves no depth meta anywhere.
    const cued = generate('polyhedron', { depthCue: 'dash', depthCueStrength: 80 });
    expect(finitePaths(cued)).toBe(true);
    expect(cued.some((path) => Array.isArray(path.meta?.strokeDash) && path.meta?.depth !== undefined)).toBe(true);
    expect(baseline.every((path) => path.meta?.depth === undefined)).toBe(true);

    // #3 Silhouette emits outline-flagged edges; creases emit crease-flagged edges.
    expect(generate('polyhedron', geometryCases.emphasizeOutline).some((path) => path.meta?.outline)).toBe(true);
    expect(generate('polyhedron', geometryCases.showCreases).some((path) => path.meta?.crease)).toBe(true);

    // #4 Hidden-line 'dash' marks occluded edge runs hidden; 'backface' (default) never does.
    expect(generate('polyhedron', geometryCases.hiddenLineDash).some((path) => path.meta?.hiddenLine && path.meta?.edge)).toBe(true);
    expect(baseline.some((path) => path.meta?.hiddenLine && path.meta?.edge)).toBe(false);

    // #5 Hatching emits hatch-flagged scan segments; default emits none.
    expect(generate('polyhedron', geometryCases.hatchEnable).some((path) => path.meta?.hatch)).toBe(true);
    expect(baseline.some((path) => path.meta?.hatch)).toBe(false);
  });

  test('topoform supports primitive sources, render modes, and line count changes', () => {
    [
      'sphere', 'torus', 'cube', 'cone', 'ellipsoid',
      'cylinder', 'capsule', 'pyramid', 'superellipsoid', 'torusKnot',
    ].forEach((sourceMode) => {
      expect(finitePaths(generate('topoform', { sourceMode, primitiveDetail: 8, lineCount: 8 }))).toBe(true);
    });

    // The five new primitives must each be geometrically distinct from the sphere,
    // not silently fall through to the default sphere branch.
    const sphereSig = pathSignature(generate('topoform', { sourceMode: 'sphere', renderMode: 'wireframe', primitiveDetail: 10 }));
    ['cylinder', 'capsule', 'pyramid', 'superellipsoid', 'torusKnot'].forEach((sourceMode) => {
      const sig = pathSignature(generate('topoform', { sourceMode, renderMode: 'wireframe', primitiveDetail: 10 }));
      expect(sig).not.toBe(sphereSig);
    });

    const wire = generate('topoform', { renderMode: 'wireframe', primitiveDetail: 8 });
    const contoursLow = generate('topoform', { renderMode: 'contours', primitiveDetail: 10, lineCount: 6 });
    const contoursHigh = generate('topoform', { renderMode: 'contours', primitiveDetail: 10, lineCount: 18 });
    expect(wire.length).toBeGreaterThan(0);
    expect(countPoints(contoursHigh)).not.toBe(countPoints(contoursLow));

    const full = generate('topoform', { contourVisibility: 'fullContour', primitiveDetail: 12, lineCount: 14 });
    expect(full.some((path) => path.meta?.hiddenLine)).toBe(true);
  });

  test('topoform honors primitive detail above the legacy cap of 48', () => {
    const atOldCap = generate('topoform', { renderMode: 'wireframe', sourceMode: 'sphere', primitiveDetail: 48 });
    const fine = generate('topoform', { renderMode: 'wireframe', sourceMode: 'sphere', primitiveDetail: 96 });
    expect(finitePaths(fine)).toBe(true);
    // With the legacy clamp of 48 these would be identical; raising the ceiling to 100
    // must make detail 96 strictly denser than detail 48.
    expect(countPoints(fine)).toBeGreaterThan(countPoints(atOldCap));
  });

  test('3D contour smoothing emits forceCurves bezier anchors, not straight polylines', () => {
    const straight = generate('topoform', { renderMode: 'contours', contourSmoothing: 0, primitiveDetail: 12, lineCount: 12 });
    const smooth = generate('topoform', { renderMode: 'contours', contourSmoothing: 80, primitiveDetail: 12, lineCount: 12 });

    // Smoothing OFF: contours stay verbatim straight polylines with no bezier handles.
    const straightContours = straight.filter((p) => p.meta?.contour);
    expect(straightContours.length).toBeGreaterThan(0);
    expect(straightContours.every((p) => p.meta.straight === true && !p.meta.anchors)).toBe(true);

    // Smoothing ON: contours become native cubic beziers (forceCurves + real handles),
    // and the straight flag is dropped so renderer + SVG export draw them as curves.
    const smoothContours = smooth.filter((p) => p.meta?.contour);
    expect(smoothContours.length).toBeGreaterThan(0);
    expect(smoothContours.every((p) => p.meta.forceCurves === true && !p.meta.straight)).toBe(true);
    expect(smoothContours.some((p) => Array.isArray(p.meta.anchors) && p.meta.anchors.some((a) => a && (a.in || a.out)))).toBe(true);
  });

  test('smoothToBezier is a no-op at amount 0 and preserves hidden-line dashes when smoothing', () => {
    const G3 = V.Geometry3D;
    const poly = [{ x: 0, y: 0 }, { x: 10, y: 6 }, { x: 20, y: 0 }, { x: 30, y: 8 }];
    poly.meta = { straight: true, hiddenLine: true, strokeDash: [3, 2] };
    const unchanged = G3.smoothToBezier(poly, 0);
    expect(unchanged).toBe(poly); // identity at amount 0
    expect(unchanged.meta.straight).toBe(true);

    const curved = G3.smoothToBezier(poly, 60);
    expect(curved.meta.straight).toBeUndefined();
    expect(curved.meta.forceCurves).toBe(true);
    expect(curved.meta.hiddenLine).toBe(true); // hidden-line metadata survives smoothing
    expect(curved.meta.strokeDash).toEqual([3, 2]);
    expect(curved.meta.anchors.some((a) => a.in && a.out)).toBe(true);
  });

  test('curves toggle alone turns mesh contours into beziers (no contourSmoothing needed)', () => {
    const opts = { renderMode: 'contours', primitiveDetail: 16, lineCount: 16 };
    const polyline = generate('topoform', { ...opts, curves: false, contourSmoothing: 0 });
    const curved = generate('topoform', { ...opts, curves: true, contourSmoothing: 0 });

    const rawContours = polyline.filter((p) => p.meta?.contour);
    const curvedContours = curved.filter((p) => p.meta?.contour);
    expect(rawContours.length).toBeGreaterThan(0);
    expect(curvedContours.length).toBeGreaterThan(0);

    // Curves OFF (and smoothing 0): verbatim straight polylines (unchanged contract).
    expect(rawContours.every((p) => p.meta.straight === true && !p.meta.anchors)).toBe(true);
    // Curves ON: every contour with enough points to curve becomes a native cubic
    // bezier even without raising the smoothing slider (2-point fragments can't curve).
    const curvable = curvedContours.filter((p) => p.length >= 3);
    expect(curvable.length).toBeGreaterThan(0);
    expect(curvable.every((p) => p.meta.forceCurves === true && !p.meta.straight)).toBe(true);
    expect(curvable.some((p) => Array.isArray(p.meta.anchors) && p.meta.anchors.some((a) => a && (a.in || a.out)))).toBe(true);
  });

  test('contour smoothing simplifies before fitting: fewer anchors than raw samples, more so as it rises', () => {
    const opts = { renderMode: 'contours', primitiveDetail: 18, lineCount: 18 };
    const raw = generate('topoform', { ...opts, curves: false, contourSmoothing: 0 });
    const gentle = generate('topoform', { ...opts, curves: true, contourSmoothing: 25 });
    const strong = generate('topoform', { ...opts, curves: true, contourSmoothing: 90 });

    const ctrlPoints = (paths) => paths.filter((p) => p.meta?.contour)
      .reduce((s, p) => s + (Array.isArray(p.meta.anchors) ? p.meta.anchors.length : p.length), 0);

    const rawPts = ctrlPoints(raw);
    const gentleAnchors = ctrlPoints(gentle);
    const strongAnchors = ctrlPoints(strong);
    expect(rawPts).toBeGreaterThan(0);

    // The densely-sampled slice polyline (one vertex per ~1-2px) is simplified
    // before bezier handles are fit, so the curved output is materially leaner
    // than the raw samples — "optimized, elegant lines" when deconstructed.
    expect(strongAnchors).toBeLessThan(rawPts * 0.6);
    // Stronger smoothing yields a sparser (more optimized) curve than gentle.
    expect(strongAnchors).toBeLessThanOrEqual(gentleAnchors);
  });

  test('rasterPlane supports modes and image controls', () => {
    const fixtureGrid = [
      [0, 0.1, 0.2, 0.3],
      [0.2, 0.4, 0.6, 0.8],
      [0.8, 0.6, 0.4, 0.2],
      [0.3, 0.2, 0.1, 0],
    ];
    ['lines', 'mesh', 'topography', 'bars'].forEach((mode) => {
      expect(finitePaths(generate('rasterPlane', { mode, fixtureGrid, sampleDetail: 24, rows: 8, columns: 8, barRows: 5, barColumns: 5 }))).toBe(true);
    });

    const base = generate('rasterPlane', { fixtureGrid, sampleDetail: 24, rows: 8 });
    const inverted = generate('rasterPlane', { fixtureGrid, sampleDetail: 24, rows: 8, invert: true, gamma: 0.6, contrast: 30 });
    const flipped = generate('rasterPlane', { fixtureGrid, sampleDetail: 24, rows: 8, normalFlipY: true });
    expect(pathSignature(base)).not.toBe(pathSignature(inverted));
    expect(pathSignature(base)).not.toBe(pathSignature(flipped));

    const planeSolid = generate('rasterPlane', {
      mode: 'lines',
      horizontalLinesAsPlanes: true,
      seeThrough: false,
      fixtureGrid,
      sampleDetail: 18,
      rows: 5,
    });
    const planeSeeThrough = generate('rasterPlane', {
      mode: 'lines',
      horizontalLinesAsPlanes: true,
      seeThrough: true,
      fixtureGrid,
      sampleDetail: 18,
      rows: 5,
    });
    // See-Through OFF draws the closed relief curtains (occluded near→far); no
    // hidden-line dashes survive (floating-horizon mode 'remove' drops them).
    expect(planeSolid.some((path) => path.meta?.reliefPlane)).toBe(true);
    expect(planeSolid.some((path) => path.meta?.hiddenLine)).toBe(false);
    // See-Through ON draws ONLY the lifted top surface — no curtain walls, no floor
    // lattice (planeBase/planeDrop) and no hidden-line dashes. In a see-through
    // wireframe the curtain lattice read as disconnected clutter, so it was dropped.
    expect(planeSeeThrough.every((path) => !(path.meta && (path.meta.planeDrop || path.meta.planeBase || path.meta.hiddenLine)))).toBe(true);

    // See-through OFF runs real inter-row hidden-line removal: a tall ridge band
    // occludes the curtains of the rows behind it. Compare the SAME solid render at a
    // tight vs a very loose Occlusion Bias (the floating-horizon eps tolerance) —
    // apples to apples (both draw curtains) — so the tight pass draws materially less
    // visible length. The bug was that solid relief planes never occluded at all.
    const ridgeGrid = Array.from({ length: 11 }, (_, y) =>
      Array.from({ length: 11 }, () => (y === 5 ? 1 : 0.12)));
    const ridgeCfg = {
      mode: 'lines',
      horizontalLinesAsPlanes: true,
      seeThrough: false,
      fixtureGrid: ridgeGrid,
      sampleDetail: 40,
      rows: 22,
      amplitude: 80,
    };
    const ridgeTight = generate('rasterPlane', { ...ridgeCfg, depthBias: 0.3 });
    const ridgeLoose = generate('rasterPlane', { ...ridgeCfg, depthBias: 50 });
    expect(finitePaths(ridgeTight)).toBe(true);
    expect(countPoints(ridgeTight)).toBeGreaterThan(0);
    expect(totalLen(ridgeTight)).toBeLessThan(totalLen(ridgeLoose) * 0.85);

    const solidBars = generate('rasterPlane', {
      mode: 'bars',
      fixtureGrid,
      barRows: 4,
      barColumns: 4,
      barGap: 3,
      seeThrough: false,
    });
    const hiddenBars = generate('rasterPlane', {
      mode: 'bars',
      fixtureGrid,
      barRows: 4,
      barColumns: 4,
      barGap: 3,
      seeThrough: true,
    });
    expect(solidBars.some((path) => path.meta?.barSide)).toBe(true);
    expect(hiddenBars.some((path) => path.meta?.barSide && path.meta?.hiddenLine)).toBe(true);
    expect(hiddenBars.some((path) => path.meta?.vertical)).toBe(false);
  });

  test('occludeSegments only lets occluders hide segments with a different owner', () => {
    const G3 = V.Geometry3D;
    // A flat near segment lying inside a nearer screen polygon.
    const seg = { a: { x: 0, y: 5, z: 0 }, b: { x: 10, y: 5, z: 0 }, meta: { straight: true } };
    const poly = [{ x: -2, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 10 }, { x: -2, y: 10 }];
    const occluder = { polygon: poly, depth: 50 };
    // Different owner → the whole segment is removed.
    const hidden = G3.occludeSegments([{ ...seg, owner: 1 }], [{ ...occluder, owner: 2 }], { mode: 'remove' });
    expect(countPoints(hidden)).toBe(0);
    // Same owner → self-occlusion is skipped, the segment survives.
    const kept = G3.occludeSegments([{ ...seg, owner: 5 }], [{ ...occluder, owner: 5 }], { mode: 'remove' });
    expect(kept.length).toBeGreaterThan(0);
  });

  test('rasterPlane bars run hidden-line occlusion when see-through is off', () => {
    // A tall spike in the centre with short bars around it: at the default iso
    // view the spike's faces cover bars sitting behind it. With see-through off
    // the algorithm must clip those hidden runs (otherwise far bars bleed through
    // the gaps — the "bizarre gaps" regression).
    const grid = Array.from({ length: 7 }, (_, y) =>
      Array.from({ length: 7 }, (_, x) => (x === 3 && y === 3 ? 1 : 0.15)));
    const cfg = { mode: 'bars', fixtureGrid: grid, barRows: 7, barColumns: 7, barGap: 0, amplitude: 60, seeThrough: false };

    const occluded = generate('rasterPlane', cfg);
    expect(finitePaths(occluded)).toBe(true);
    // Surviving bar edges collapse back to clean 2-point segments (the dense
    // occlusion resampling must not bloat the export); the base floor loop is the
    // only multi-point bar path.
    expect(occluded.every((path) => path.length === 2 || path.meta?.barFloor)).toBe(true);

    // Routing/effect proof: neutralise occlusion and confirm the geometry differs.
    const G3 = V.Geometry3D;
    const realOcclude = G3.occludeSegments;
    G3.occludeSegments = (segments) =>
      (segments || []).map((seg) => {
        const path = [{ x: seg.a.x, y: seg.a.y }, { x: seg.b.x, y: seg.b.y }];
        path.meta = seg.meta ? { ...seg.meta } : {};
        return path;
      });
    let unoccluded;
    try {
      unoccluded = generate('rasterPlane', cfg);
    } finally {
      G3.occludeSegments = realOcclude;
    }
    expect(pathSignature(occluded)).not.toBe(pathSignature(unoccluded));
  });

  test('topoform 3D enhancements each produce finite output that differs from all-off', () => {
    const base = { sourceMode: 'cube', primitiveDetail: 6, lineCount: 8 };
    // All-off baseline (every shared 3D toggle at its default). pathSignature is
    // geometry-only (it ignores path.meta), so meta-only enhancements assert via a
    // full structural snapshot; enhancements that add/clip geometry assert via the
    // signature too.
    const snapshot = (paths) =>
      JSON.stringify((paths || []).map((p) => ({
        pts: p.map((pt) => ({ x: Math.round(pt.x * 1e4), y: Math.round(pt.y * 1e4) })),
        meta: p.meta || null,
      })));
    const offWire = generate('topoform', { ...base, renderMode: 'wireframe' });
    const offContour = generate('topoform', { ...base, renderMode: 'contours' });
    expect(finitePaths(offWire)).toBe(true);
    const offWireSig = pathSignature(offWire);
    const offContourSig = pathSignature(offContour);
    const offWireSnap = snapshot(offWire);

    // #2 depth cue — stamps strokeDash by per-path camera depth (meta-only).
    const depthCue = generate('topoform', { ...base, renderMode: 'wireframe', sceneLighting: true, depthCue: 'dash', depthCueStrength: 80 });
    expect(finitePaths(depthCue)).toBe(true);
    expect(snapshot(depthCue)).not.toBe(offWireSnap);
    expect(depthCue.some((path) => Array.isArray(path.meta?.strokeDash))).toBe(true);

    // #3 emphasize outline — weights the silhouette edges (meta-only).
    const outline = generate('topoform', { ...base, renderMode: 'wireframe', emphasizeOutline: true, outlineWeight: 4 });
    expect(finitePaths(outline)).toBe(true);
    expect(snapshot(outline)).not.toBe(offWireSnap);
    expect(outline.some((path) => path.meta?.outline && path.meta?.weightScale === 4)).toBe(true);

    // #3 creases — feature edges sharper than creaseAngle (cube has 90° creases);
    // adds geometry, so the geometric signature changes too.
    const creases = generate('topoform', { ...base, renderMode: 'wireframe', showCreases: true, creaseAngle: 30 });
    expect(finitePaths(creases)).toBe(true);
    expect(pathSignature(creases)).not.toBe(offWireSig);
    expect(creases.some((path) => path.meta?.crease)).toBe(true);

    // #4 hidden-line dash — occlusion splits/dashes hidden runs (geometry changes).
    const hiddenDash = generate('topoform', { ...base, renderMode: 'wireframe', hiddenLineMode: 'dash' });
    expect(finitePaths(hiddenDash)).toBe(true);
    expect(pathSignature(hiddenDash)).not.toBe(offWireSig);
    expect(hiddenDash.some((path) => path.meta?.hiddenLine)).toBe(true);
    // Hidden-line on contours also differs from the all-off contour render.
    const hiddenContour = generate('topoform', { ...base, renderMode: 'contours', hiddenLineMode: 'dash' });
    expect(finitePaths(hiddenContour)).toBe(true);
    expect(pathSignature(hiddenContour)).not.toBe(offContourSig);

    // #5 hatching — Lambert tonal fill on front faces (adds geometry).
    const hatch = generate('topoform', { ...base, renderMode: 'wireframe', sceneLighting: true, hatchEnable: true, hatchSpacing: 4 });
    expect(finitePaths(hatch)).toBe(true);
    expect(pathSignature(hatch)).not.toBe(offWireSig);
    expect(hatch.some((path) => path.meta?.hatch)).toBe(true);
  });

  test('rasterPlane depth-cue + hatching enhancements are additive and toggle output', () => {
    const fixtureGrid = [
      [0, 0.1, 0.2, 0.3],
      [0.2, 0.4, 0.6, 0.8],
      [0.8, 0.6, 0.4, 0.2],
      [0.3, 0.2, 0.1, 0],
    ];
    const common = { fixtureGrid, sampleDetail: 24, rows: 8, columns: 8, barRows: 5, barColumns: 5 };

    // Depth cue applies to ALL modes. It is metadata-only (geometry byte-identical
    // — pathSignature is purely geometric), so it must NOT move any vertex but it
    // must stamp a depth-derived meta.strokeDash that the all-off output lacks.
    ['lines', 'mesh', 'topography', 'bars'].forEach((mode) => {
      const off = generate('rasterPlane', { ...common, mode });
      const cued = generate('rasterPlane', { ...common, mode, depthCue: 'dash', depthCueStrength: 80 });
      expect(finitePaths(cued)).toBe(true);
      // Geometry unchanged by depth cue.
      expect(pathSignature(off)).toBe(pathSignature(cued));
      // Off state stamps no strokeDash; depth cue adds it to non-hidden paths.
      expect(off.some((path) => !path.meta?.hiddenLine && Array.isArray(path.meta?.strokeDash))).toBe(false);
      expect(cued.some((path) => !path.meta?.hiddenLine && Array.isArray(path.meta?.strokeDash))).toBe(true);
      // Near vs far paths get different dash patterns (the actual depth cue).
      const dashes = cued
        .filter((path) => !path.meta?.hiddenLine && Array.isArray(path.meta?.strokeDash))
        .map((path) => path.meta.strokeDash.join(','));
      expect(new Set(dashes).size).toBeGreaterThan(1);
    });

    // Hatching applies to mesh + bars: adds Lambert scan lines (meta.hatch), keeps
    // output finite, and differs from the hatch-off baseline.
    ['mesh', 'bars'].forEach((mode) => {
      const off = generate('rasterPlane', { ...common, mode });
      const hatched = generate('rasterPlane', { ...common, mode, hatchEnable: true, hatchSpacing: 4, hatchAngle: 30 });
      expect(finitePaths(hatched)).toBe(true);
      expect(hatched.length).toBeGreaterThan(off.length);
      expect(hatched.some((path) => path.meta?.hatch)).toBe(true);
      expect(pathSignature(off)).not.toBe(pathSignature(hatched));
    });

    // Hatching is N/A for lines/topography: enabling it is a no-op (byte-identical).
    ['lines', 'topography'].forEach((mode) => {
      const off = generate('rasterPlane', { ...common, mode });
      const on = generate('rasterPlane', { ...common, mode, hatchEnable: true });
      expect(pathSignature(off)).toBe(pathSignature(on));
    });
  });

  test('perspective projection foreshortens depth and stays orthographic by default', () => {
    const G3 = V.Geometry3D;
    // resolveProjection: ortho by default (empty options), perspective when toggled.
    expect(G3.resolveProjection({ projection: 'orthographic' })).toEqual({});
    expect(G3.resolveProjection({ projection: 'perspective' }).focal).toBeGreaterThan(0);
    // Perspective Strength floors at 1 (not 50) so an extreme wide-angle look is reachable.
    expect(G3.resolveProjection({ projection: 'perspective', focalLength: 1 }).focal).toBe(1);
    expect(G3.resolveProjection({ projection: 'perspective', focalLength: -5 }).focal).toBe(1);

    // projectPoint: nearer z (toward viewer) magnifies, farther z shrinks — pure ortho leaves them equal.
    const opts = { centerX: 0, centerY: 0, scale: 1, ...G3.resolveProjection({ projection: 'perspective' }) };
    const near = G3.projectPoint({ x: 10, y: 0, z: 100 }, opts);
    const far = G3.projectPoint({ x: 10, y: 0, z: -100 }, opts);
    expect(Math.abs(near.x)).toBeGreaterThan(Math.abs(far.x));
    const orthoNear = G3.projectPoint({ x: 10, y: 0, z: 100 }, { centerX: 0, centerY: 0, scale: 1 });
    const orthoFar = G3.projectPoint({ x: 10, y: 0, z: -100 }, { centerX: 0, centerY: 0, scale: 1 });
    expect(orthoNear.x).toBe(orthoFar.x);

    // Each 3D algorithm still yields finite geometry under perspective, distinct from orthographic.
    ['topoform', 'polyhedron', 'spiralizer', 'rasterPlane'].forEach((type) => {
      const ortho = generate(type, { projection: 'orthographic' });
      const persp = generate(type, { projection: 'perspective', cameraDistance: 400, focalLength: 500 });
      expect(finitePaths(persp)).toBe(true);
      expect(pathSignature(persp)).not.toBe(pathSignature(ortho));
    });
  });

  test('3D preview quality scales live-drag fidelity (draft < high, full render unaffected)', () => {
    const G3 = V.Geometry3D;
    // Outside a fast preview the scale is always 1 — final renders never down-rate.
    expect(G3.previewDetailScale({ fastPreview: false, preview3dQuality: 'draft' })).toBe(1);
    // During a preview, higher quality yields a larger detail multiplier.
    const draftScale = G3.previewDetailScale({ fastPreview: true, preview3dQuality: 'draft' });
    const highScale = G3.previewDetailScale({ fastPreview: true, preview3dQuality: 'high' });
    expect(draftScale).toBeLessThan(highScale);
    expect(highScale).toBe(1);
    // Unknown/missing quality falls back to balanced (between draft and high).
    const fallback = G3.previewDetailScale({ fastPreview: true });
    expect(fallback).toBeGreaterThan(draftScale);
    expect(fallback).toBeLessThan(highScale);

    // End-to-end: a high-quality preview keeps more points than a draft preview.
    const draft = generate('spiralizer', { fastPreview: true, curveResolution: 1600 }, 4242, { fastPreview: true, preview3dQuality: 'draft' });
    const high = generate('spiralizer', { fastPreview: true, curveResolution: 1600 }, 4242, { fastPreview: true, preview3dQuality: 'high' });
    expect(countPoints(high)).toBeGreaterThan(countPoints(draft));
  });

  test('fast preview reduces heavy algorithm point counts without changing the public contract', () => {
    const full = generate('rasterPlane', { mode: 'bars', barRows: 30, barColumns: 30 });
    const preview = generate('rasterPlane', { mode: 'bars', barRows: 30, barColumns: 30, fastPreview: true }, 4242, { fastPreview: true });
    expect(finitePaths(preview)).toBe(true);
    expect(countPoints(preview)).toBeLessThan(countPoints(full));
  });
});
