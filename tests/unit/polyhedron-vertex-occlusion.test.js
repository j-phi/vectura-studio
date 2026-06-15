/**
 * Regression test for audit defect D1 (WU-R1): polyhedron `vertexOcclusionMode`
 * ('Point Fill' → 'Outline Only' / 'Hide Interior') was BROKEN.
 *
 * Before the fix, `buildVertexMarkers` consulted only each vertex's own
 * front-face flag to decide visibility, and the 'occlude' branch merely pushed a
 * screen-space clip mask — it never DROPPED a vertex glyph that sat behind a
 * NEARER opaque front face. So on the convex default buckyball (and on any
 * convex solid) 'outline' and 'occlude' rendered identically, and the control
 * read as dead.
 *
 * The fix wires 'occlude' (label 'Hide Interior') to TRUE face occlusion: a
 * vertex glyph is dropped when its projected (x,y) point falls inside a front
 * face whose camera depth is nearer than the vertex's own depth (with a small
 * edge tolerance so a vertex never occludes itself / its incident faces). The
 * 'outline' branch is untouched, so default output stays byte-identical.
 *
 * Geometric reality (from the design): convex solids have NO vertex hidden
 * behind a nearer face, so 'occlude' is correctly a no-op there. The fix only
 * manifests on a self-occluding configuration. The fixture below applies heavy
 * `twist` + `shard` to an icosahedron and renders ALL faces (surfaceMode:'all'),
 * so the far-side vertices genuinely project behind nearer front faces.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Polyhedron — vertexOcclusionMode true face occlusion (audit D1)', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => runtime.cleanup());

  const generate = (overrides = {}) => {
    const { AlgorithmRegistry, SeededRNG, SimpleNoise, ALGO_DEFAULTS } = runtime.window.Vectura;
    const base = JSON.parse(JSON.stringify(ALGO_DEFAULTS.polyhedron));
    delete base.label;
    delete base.is3d;
    delete base.preset;
    return AlgorithmRegistry.polyhedron.generate(
      { ...base, ...overrides },
      new SeededRNG(42),
      new SimpleNoise(42),
      { width: 400, height: 400 },
    );
  };

  // A vertex glyph path is tagged with an integer `meta.vertex` index (0..N).
  const countVertexGlyphs = (paths) =>
    paths.filter((p) => p.meta && typeof p.meta.vertex === 'number').length;

  // Geometry signature: path count | total point count | total length.
  const signature = (paths) => {
    let points = 0;
    let length = 0;
    for (const path of paths) {
      points += path.length;
      for (let i = 1; i < path.length; i++) {
        length += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
      }
    }
    return `${paths.length}|${points}|${length.toFixed(4)}`;
  };

  // NAMED self-occluding fixture. Verified (during impl) to put front-mesh
  // vertices behind nearer front faces: a heavily twisted + sharded icosahedron
  // with every face rendered.
  const SELF_OCCLUDING = {
    solidType: 'icosahedron',
    twist: 170,
    shard: 90,
    showVertices: true,
    showFaces: true,
    showEdges: false,
    surfaceMode: 'all',
    faceOpacityMode: 'seeThrough',
  };

  it("'occlude' drops STRICTLY FEWER vertex glyphs than 'outline' on a self-occluding solid", () => {
    const outlineGlyphs = countVertexGlyphs(generate({ ...SELF_OCCLUDING, vertexOcclusionMode: 'outline' }));
    const occludeGlyphs = countVertexGlyphs(generate({ ...SELF_OCCLUDING, vertexOcclusionMode: 'occlude' }));

    // 'outline' keeps every candidate vertex glyph.
    expect(outlineGlyphs).toBeGreaterThan(0);
    // 'occlude' must hide at least one vertex that falls behind a nearer face.
    // (Pre-fix this was EQUAL — the Red failure.)
    expect(occludeGlyphs).toBeLessThan(outlineGlyphs);
  });

  it("default vertexOcclusionMode is 'outline' (occlude is NOT the default)", () => {
    const { ALGO_DEFAULTS } = runtime.window.Vectura;
    expect(ALGO_DEFAULTS.polyhedron.vertexOcclusionMode).toBe('outline');
  });

  it("default-params output is unaffected (omitting the key === passing 'outline')", () => {
    // Default config uses 'outline'; the fix only touches the 'occlude' branch,
    // so the default render is byte-identical to passing 'outline' explicitly.
    const noKey = signature(generate({}));
    const explicitOutline = signature(generate({ vertexOcclusionMode: 'outline' }));
    expect(noKey).toBe(explicitOutline);
  });

  it("baseline-neutral: default 'outline' signature is unchanged by the fix (pinned)", () => {
    // The 'outline' branch is untouched by the D1 wiring. This pins the exact
    // pre-change signature of the default polyhedron so any accidental change to
    // the outline path is caught. (Captured against the pre-fix generator.)
    expect(signature(generate({ vertexOcclusionMode: 'outline' }))).toBe('159|1294|5975.2134');
  });

  it("'outline' is byte-identical between pre/post fix on the self-occluding fixture (occlude-off changes nothing)", () => {
    // Pinned signature of the fixture under 'outline'. The fix never runs the
    // occlude drop here, so this must match the pre-change baseline exactly.
    expect(signature(generate({ ...SELF_OCCLUDING, vertexOcclusionMode: 'outline' }))).toBe('160|1540|17043.5180');
  });
});
