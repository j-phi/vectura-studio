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

  test.each(['spirograph', 'spiral3d', 'polyhedron', 'meshTopography', 'imageSurface'])('%s default output is finite and non-empty', (type) => {
    expect(finitePaths(generate(type))).toBe(true);
  });

  test.each(['spirograph', 'spiral3d', 'polyhedron', 'meshTopography', 'imageSurface'])('%s has an explicit layer icon', (type) => {
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

  test('spiral3d supports shapes, see-through hidden dashes, and dot loops', () => {
    ['sphere', 'cone', 'cylinder', 'ellipsoid'].forEach((shape) => {
      expect(finitePaths(generate('spiral3d', { shape, curveResolution: 120 }))).toBe(true);
    });

    const sphere = generate('spiral3d', { shape: 'sphere', sphereRadius: 50, curveResolution: 120 });
    const equalEllipsoid = generate('spiral3d', {
      shape: 'ellipsoid',
      ellipsoidEquatorRadius: 50,
      ellipsoidPolarRadius: 50,
      curveResolution: 120,
    });
    expect(pathSignature(sphere)).toBe(pathSignature(equalEllipsoid));

    const front = generate('spiral3d', { surfaceMode: 'front', curveResolution: 160 });
    const seeThrough = generate('spiral3d', { surfaceMode: 'seeThrough', curveResolution: 160 });
    expect(countPoints(seeThrough)).toBeGreaterThanOrEqual(countPoints(front));
    expect(seeThrough.some((path) => path.meta?.hiddenLine && Array.isArray(path.meta.strokeDash))).toBe(true);

    const dots = generate('spiral3d', { renderStyle: 'dots', dotSpacing: 8, curveResolution: 100 });
    expect(dots.some(closed)).toBe(true);
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

  test('meshTopography supports primitive sources, render modes, and line count changes', () => {
    [
      'sphere', 'torus', 'cube', 'cone', 'ellipsoid',
      'cylinder', 'capsule', 'pyramid', 'superellipsoid', 'torusKnot',
    ].forEach((sourceMode) => {
      expect(finitePaths(generate('meshTopography', { sourceMode, primitiveDetail: 8, lineCount: 8 }))).toBe(true);
    });

    // The five new primitives must each be geometrically distinct from the sphere,
    // not silently fall through to the default sphere branch.
    const sphereSig = pathSignature(generate('meshTopography', { sourceMode: 'sphere', renderMode: 'wireframe', primitiveDetail: 10 }));
    ['cylinder', 'capsule', 'pyramid', 'superellipsoid', 'torusKnot'].forEach((sourceMode) => {
      const sig = pathSignature(generate('meshTopography', { sourceMode, renderMode: 'wireframe', primitiveDetail: 10 }));
      expect(sig).not.toBe(sphereSig);
    });

    const wire = generate('meshTopography', { renderMode: 'wireframe', primitiveDetail: 8 });
    const contoursLow = generate('meshTopography', { renderMode: 'contours', primitiveDetail: 10, lineCount: 6 });
    const contoursHigh = generate('meshTopography', { renderMode: 'contours', primitiveDetail: 10, lineCount: 18 });
    expect(wire.length).toBeGreaterThan(0);
    expect(countPoints(contoursHigh)).not.toBe(countPoints(contoursLow));

    const full = generate('meshTopography', { contourVisibility: 'fullContour', primitiveDetail: 12, lineCount: 14 });
    expect(full.some((path) => path.meta?.hiddenLine)).toBe(true);
  });

  test('meshTopography honors primitive detail above the legacy cap of 48', () => {
    const atOldCap = generate('meshTopography', { renderMode: 'wireframe', sourceMode: 'sphere', primitiveDetail: 48 });
    const fine = generate('meshTopography', { renderMode: 'wireframe', sourceMode: 'sphere', primitiveDetail: 96 });
    expect(finitePaths(fine)).toBe(true);
    // With the legacy clamp of 48 these would be identical; raising the ceiling to 100
    // must make detail 96 strictly denser than detail 48.
    expect(countPoints(fine)).toBeGreaterThan(countPoints(atOldCap));
  });

  test('3D contour smoothing emits forceCurves bezier anchors, not straight polylines', () => {
    const straight = generate('meshTopography', { renderMode: 'contours', contourSmoothing: 0, primitiveDetail: 12, lineCount: 12 });
    const smooth = generate('meshTopography', { renderMode: 'contours', contourSmoothing: 80, primitiveDetail: 12, lineCount: 12 });

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

  test('imageSurface supports modes and image controls', () => {
    const fixtureGrid = [
      [0, 0.1, 0.2, 0.3],
      [0.2, 0.4, 0.6, 0.8],
      [0.8, 0.6, 0.4, 0.2],
      [0.3, 0.2, 0.1, 0],
    ];
    ['lines', 'mesh', 'topography', 'bars'].forEach((mode) => {
      expect(finitePaths(generate('imageSurface', { mode, fixtureGrid, sampleDetail: 24, rows: 8, columns: 8, barRows: 5, barColumns: 5 }))).toBe(true);
    });

    const base = generate('imageSurface', { fixtureGrid, sampleDetail: 24, rows: 8 });
    const inverted = generate('imageSurface', { fixtureGrid, sampleDetail: 24, rows: 8, invert: true, gamma: 0.6, contrast: 30 });
    const flipped = generate('imageSurface', { fixtureGrid, sampleDetail: 24, rows: 8, normalFlipY: true });
    expect(pathSignature(base)).not.toBe(pathSignature(inverted));
    expect(pathSignature(base)).not.toBe(pathSignature(flipped));

    const planeSolid = generate('imageSurface', {
      mode: 'lines',
      horizontalLinesAsPlanes: true,
      seeThrough: false,
      fixtureGrid,
      sampleDetail: 18,
      rows: 5,
    });
    const planeSeeThrough = generate('imageSurface', {
      mode: 'lines',
      horizontalLinesAsPlanes: true,
      seeThrough: true,
      fixtureGrid,
      sampleDetail: 18,
      rows: 5,
    });
    expect(planeSolid.some((path) => path.meta?.reliefPlane && path.meta?.hiddenLine)).toBe(false);
    expect(planeSeeThrough.some((path) => path.meta?.reliefPlane && path.meta?.hiddenLine)).toBe(true);

    const solidBars = generate('imageSurface', {
      mode: 'bars',
      fixtureGrid,
      barRows: 4,
      barColumns: 4,
      barGap: 3,
      seeThrough: false,
    });
    const hiddenBars = generate('imageSurface', {
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

  test('imageSurface depth-cue + hatching enhancements are additive and toggle output', () => {
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
      const off = generate('imageSurface', { ...common, mode });
      const cued = generate('imageSurface', { ...common, mode, depthCue: 'dash', depthCueStrength: 80 });
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
      const off = generate('imageSurface', { ...common, mode });
      const hatched = generate('imageSurface', { ...common, mode, hatchEnable: true, hatchSpacing: 4, hatchAngle: 30 });
      expect(finitePaths(hatched)).toBe(true);
      expect(hatched.length).toBeGreaterThan(off.length);
      expect(hatched.some((path) => path.meta?.hatch)).toBe(true);
      expect(pathSignature(off)).not.toBe(pathSignature(hatched));
    });

    // Hatching is N/A for lines/topography: enabling it is a no-op (byte-identical).
    ['lines', 'topography'].forEach((mode) => {
      const off = generate('imageSurface', { ...common, mode });
      const on = generate('imageSurface', { ...common, mode, hatchEnable: true });
      expect(pathSignature(off)).toBe(pathSignature(on));
    });
  });

  test('perspective projection foreshortens depth and stays orthographic by default', () => {
    const G3 = V.Geometry3D;
    // resolveProjection: ortho by default (empty options), perspective when toggled.
    expect(G3.resolveProjection({ projection: 'orthographic' })).toEqual({});
    expect(G3.resolveProjection({ projection: 'perspective' }).focal).toBeGreaterThan(0);

    // projectPoint: nearer z (toward viewer) magnifies, farther z shrinks — pure ortho leaves them equal.
    const opts = { centerX: 0, centerY: 0, scale: 1, ...G3.resolveProjection({ projection: 'perspective' }) };
    const near = G3.projectPoint({ x: 10, y: 0, z: 100 }, opts);
    const far = G3.projectPoint({ x: 10, y: 0, z: -100 }, opts);
    expect(Math.abs(near.x)).toBeGreaterThan(Math.abs(far.x));
    const orthoNear = G3.projectPoint({ x: 10, y: 0, z: 100 }, { centerX: 0, centerY: 0, scale: 1 });
    const orthoFar = G3.projectPoint({ x: 10, y: 0, z: -100 }, { centerX: 0, centerY: 0, scale: 1 });
    expect(orthoNear.x).toBe(orthoFar.x);

    // Each 3D algorithm still yields finite geometry under perspective, distinct from orthographic.
    ['meshTopography', 'polyhedron', 'spiral3d', 'imageSurface'].forEach((type) => {
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
    const draft = generate('spiral3d', { fastPreview: true, curveResolution: 1600 }, 4242, { fastPreview: true, preview3dQuality: 'draft' });
    const high = generate('spiral3d', { fastPreview: true, curveResolution: 1600 }, 4242, { fastPreview: true, preview3dQuality: 'high' });
    expect(countPoints(high)).toBeGreaterThan(countPoints(draft));
  });

  test('fast preview reduces heavy algorithm point counts without changing the public contract', () => {
    const full = generate('imageSurface', { mode: 'bars', barRows: 30, barColumns: 30 });
    const preview = generate('imageSurface', { mode: 'bars', barRows: 30, barColumns: 30, fastPreview: true }, 4242, { fastPreview: true });
    expect(finitePaths(preview)).toBe(true);
    expect(countPoints(preview)).toBeLessThan(countPoints(full));
  });
});
