/**
 * THE SHADOW-ANATOMY FIXTURE — ONE DEFINITION, IN THE REPOSITORY.
 *
 * Every camera, light, object, tone table and named view the shadow-anatomy
 * workstream measures lives here and nowhere else. Its consumers import it:
 *
 *   - the offline view harness (`scratchpad/shadowanatomy/render.js`) and the
 *     measurement scripts under `scripts/shadow-anatomy/`, which render SVG/PNG
 *     and drive the probes; and
 *   - the shadow-anatomy UNIT HARNESSES, which pin the protected numbers. That
 *     set is named explicitly — and enforced — in
 *     `tests/unit/scene3d-fixture-single-source.test.js`. It is NOT every
 *     `tests/unit/scene3d-*.test.js`: most scene3d unit tests build small scenes
 *     of their own that have nothing to do with this workstream, and pulling
 *     them under the rule would make it noise. The rule binds the harnesses that
 *     measure a shadow-anatomy criterion.
 *
 * ROUND 10: the header used to claim `tests/unit/scene3d-*.test.js` wholesale
 * when only three of the nine shadow-anatomy harnesses actually imported this
 * file. Six restated their own camera, sun, tone ladder and objects, and one of
 * the six — `scene3d-shadow-anatomy.test.js`, the workstream's namesake — had
 * already DRIFTED to `pitch: 22 / elevation: 45`, so it measured a camera and a
 * sun no rendered view uses. All six now import, and the guard test above fails
 * if a new one restates.
 *
 * WHY IT IS HERE AND NOT IN THE SCRATCHPAD.
 *
 * "A harness reads its fixture from the fixture module and never restates one"
 * has been broken five times in this workstream, each time producing a silent
 * scoring corruption: a hardcoded camera in Round 4; `[BALL]` measured against a
 * rendered `[BALL, POST]` in Round 6; a hardcoded `2 * 46` ball radius inside
 * the faceted instrument in Round 7; in Round 8 the cast-shadow test restating
 * the A-view because `tests/` could not import from a scratch directory; and in
 * Round 9 the ladder test. The Round 8 review named the fourth one the round's
 * standing risk: the restated test is now the SOLE enforcement of the protected
 * cast shadow, so if `render.js`'s A-view ever moved, the test would keep
 * passing on a scene nobody renders.
 *
 * It is also durability. The scratchpad lives under `/private/tmp`, which is
 * pruned between sessions — that is how the design spec and the Round 2-5
 * scorecards were lost. A fixture under version control cannot evaporate.
 *
 * Pure data + builders. No runtime is required to load this file; the two
 * builder entry points take the `Vectura` namespace as their first argument.
 */


const clone = (v) => JSON.parse(JSON.stringify(v));

const BOUNDS = {
  width: 320, height: 220, m: 10, dW: 300, dH: 200,
  penWidth: 0.3, truncate: 4, fastPreview: false, preview3dQuality: 'high',
};
const SEED = 0;

// Camera / light held fixed across every comparison set.
const CAMERA = { projection: 'orthographic', yaw: -30, pitch: 32, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
const CAMERA_ORBIT = { ...CAMERA, yaw: 10 };
const SUN = { id: 'sun', type: 'directional', azimuth: 135, elevation: 28, intensity: 1, castShadows: true };
// A sphere's contact set is a POINT, so a 4mm window can never be pure collar —
// which is the real reason C2/C3/C4/C15 have been unscoreable. An upright box has
// a rectangular contact set and therefore a collar wide enough to sample.
const POST = { id: 'post', name: 'Post', primitive: 'box', params: { sx: 30, sy: 70, sz: 30 }, transform: { x: 95, y: 35, z: 20, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };

const toneBands = (bands, specular = true, specSize = 1) => {
  const table = {
    2: { thresholds: [0.5], ladder: [0.25, 0.8] },
    3: { thresholds: [0.33, 0.66], ladder: [0.2, 0.5, 0.85] },
    4: { thresholds: [0.25, 0.5, 0.75], ladder: [0.15, 0.4, 0.65, 0.9] },
  }[bands];
  return { enabled: true, bands, ...clone(table), specular: { enabled: specular, size: specSize } };
};

const BALL = { id: 'ball', name: 'Ball', primitive: 'sphere', params: { radius: 46, detail: 26 }, transform: { x: 0, y: 46, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
const CUBE = { id: 'cube', name: 'Cube', primitive: 'box', params: { sx: 62, sy: 62, sz: 62 }, transform: { x: 0, y: 31, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
// FACETED low-poly sphere: a geodesic polyhedron goes through the faceted
// (coverageGain) path, unlike primitive:'sphere' which is chart-wrapped.
const LOWPOLY = { id: 'lowpoly', name: 'LowPoly', primitive: 'solid', params: { solidType: 'geodesic', radius: 40, frequency: 2 }, transform: { x: 0, y: 42, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
const CAPSULE = { id: 'capsule', name: 'Capsule', primitive: 'capsule', params: { radius: 26, height: 56 }, transform: { x: 0, y: 54, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };

const at = (obj, x, z) => ({ ...clone(obj), transform: { ...clone(obj.transform), x, z } });

// styleTable — routed through byObject (object scope) so the fixture never
// depends on the monolith scene-scope expansion defect.
const styleTable = (objects, styleParams = {}) => {
  const { mapper, ...rest } = styleParams;   // mapper is a STYLE key, not a param
  const base = { penId: null, mapper: mapper || 'hatch', params: { fillAngle: 0, fillDensity: 85, ...rest } };
  const byObject = {};
  objects.forEach((o) => { byObject[o.id] = clone(base); });
  // Bare paper ground: its own hatch would swamp every shadow measurement.
  byObject.ground = { penId: null, mapper: 'none', params: {} };
  return { scene: clone(base), byObject, byFace: {} };
};

const scene = (over = {}) => (V) => {
  const p = clone(V.ALGO_DEFAULTS.scene3d);
  p.seed = SEED;
  p.camera = clone(over.camera || CAMERA);
  p.ground = over.ground === undefined ? { enabled: true } : over.ground;
  p.backdrop = { enabled: false };
  p.objects = clone(over.objects || [BALL]);
  p.lights = clone(over.lights || [SUN]);
  p.tone = clone(over.tone || toneBands(4));
  p.shadow = { ...p.shadow, ...(over.shadow || {}) };
  p.styleTable = styleTable(p.objects, over.styleParams || {});
  return p;
};

// ── views ───────────────────────────────────────────────────────────────────
const shadowLayers = (n) => (n === 'off'
  ? { shadowLayers: false }
  : { shadowLayers: true, shadowLayerCount: n });

const AOBJ = [BALL, POST];
const VIEWS = [
  { id: 'A-off', build: scene({ objects: AOBJ, shadow: shadowLayers('off') }) },
  { id: 'A-2', build: scene({ objects: AOBJ, shadow: shadowLayers(2) }) },
  { id: 'A-3', build: scene({ objects: AOBJ, shadow: shadowLayers(3) }) },
  { id: 'A-4', build: scene({ objects: AOBJ, shadow: shadowLayers(4) }) },
  { id: 'D-soft02', build: scene({ objects: AOBJ, shadow: { ...shadowLayers(3), shadowFalloff: 0.2 } }) },
  { id: 'D-soft10', build: scene({ objects: AOBJ, shadow: { ...shadowLayers(3), shadowFalloff: 1.0 } }) },
  { id: 'E-bands2', build: scene({ ground: { enabled: false }, tone: toneBands(2) }) },
  { id: 'E-bands3', build: scene({ ground: { enabled: false }, tone: toneBands(3) }) },
  { id: 'E-bands4', build: scene({ ground: { enabled: false }, tone: toneBands(4) }) },
  {
    id: 'F-trio',
    build: scene({
      objects: [at(CUBE, -100, 0), at(LOWPOLY, 0, 0), at(CAPSULE, 100, 0)],
      shadow: shadowLayers(4),
    }),
  },
  {
    id: 'G-trio-orbit',
    build: scene({
      camera: CAMERA_ORBIT,
      objects: [at(CUBE, -100, 0), at(LOWPOLY, 0, 0), at(CAPSULE, 100, 0)],
      shadow: shadowLayers(4),
    }),
  },
  {
    id: 'F-spec0',
    build: scene({
      objects: [at(CUBE, -100, 0), at(LOWPOLY, 0, 0), at(CAPSULE, 100, 0)],
      tone: toneBands(4, true, 0.05), shadow: shadowLayers(4),
    }),
  },
  {
    id: 'F-spec3',
    build: scene({
      objects: [at(CUBE, -100, 0), at(LOWPOLY, 0, 0), at(CAPSULE, 100, 0)],
      tone: toneBands(4, true, 3), shadow: shadowLayers(4),
    }),
  },
];

// ── ROUND 3 views ───────────────────────────────────────────────────────────
// Eight of Round 2's criteria were NOT-MEASURABLE because no view existed.
const sp = (o) => o; // readability
const trio = (over = {}) => scene({
  objects: [at(CUBE, -100, 0), at(LOWPOLY, 0, 0), at(CAPSULE, 100, 0)],
  shadow: shadowLayers(4), ...over,
});

// H — treatment matrix (O14, O15, O16). `keep` was RENAMED to `none` and is now
// a total bypass, so the matrix carries `none` in its place.
['none', 'blank', 'sparse', 'stippleOut', 'burst', 'altFill'].forEach((t) => {
  VIEWS.push({ id: `H-perface-${t}`, build: scene({ objects: [CUBE], ground: { enabled: false }, styleParams: { highlightTreatment: t } }) });
  VIEWS.push({ id: `H-lightdriven-${t}`, build: scene({ objects: [CUBE], ground: { enabled: false }, styleParams: { highlightTreatment: t, highlightMode: 'lightDriven' } }) });
});
['none', 'blank', 'sparse', 'stippleOut', 'burst', 'altFill'].forEach((t) => {
  VIEWS.push({ id: `H-lp-perface-${t}`, build: scene({ objects: [LOWPOLY], ground: { enabled: false }, styleParams: { highlightTreatment: t } }) });
  VIEWS.push({ id: `H-lp-lightdriven-${t}`, build: scene({ objects: [LOWPOLY], ground: { enabled: false }, styleParams: { highlightTreatment: t, highlightMode: 'lightDriven' } }) });
});
['none', 'sparse', 'stippleOut', 'dashed'].forEach((t) => {
  VIEWS.push({ id: `I-lp-pen-${t}`, build: scene({ objects: [LOWPOLY], ground: { enabled: false }, styleParams: { highlightTreatment: t, highlightPenId: 'pen-hl' } }) });
});
[1, 3, 6].forEach((n) => {
  VIEWS.push({ id: `J-lp-sens-${n}`, build: scene({ objects: [LOWPOLY], ground: { enabled: false }, styleParams: { highlightSensitivity: n } }) });
});
VIEWS.push({ id: 'H-specular-off', build: scene({ objects: [CUBE], ground: { enabled: false }, tone: toneBands(4, false), styleParams: { highlightTreatment: 'burst' } }) });

// I — pen split (O11): the highlight on a SECOND pen.
['none', 'sparse', 'stippleOut', 'dashed'].forEach((t) => {
  VIEWS.push({ id: `I-pen-${t}`, build: scene({ objects: [CUBE], ground: { enabled: false }, styleParams: { highlightTreatment: t, highlightPenId: 'pen-hl' } }) });
});

// J — highlightSensitivity in the DEFAULT perFace mode (O9).
[1, 3, 6].forEach((n) => {
  VIEWS.push({ id: `J-sens-${n}`, build: scene({ objects: [CUBE], ground: { enabled: false }, styleParams: { highlightSensitivity: n } }) });
});

// K — spiral and stipple mappers at bands 2 and 4 (O18: both ignored ladder[]).
['spiral', 'stipple'].forEach((m) => [2, 4].forEach((b) => {
  VIEWS.push({ id: `K-${m}-bands${b}`, build: scene({ objects: [BALL], ground: { enabled: false }, tone: toneBands(b), styleParams: { mapper: m } }) });
}));

// L — shadowSensitivity staging reaching the FACETED path (O25).
[1, 6].forEach((n) => {
  VIEWS.push({ id: `L-shadowsens-${n}`, build: scene({ objects: [LOWPOLY], ground: { enabled: false }, styleParams: { shadowSensitivity: n } }) });
});

// M — the light moves, the camera does not (O7, and O27's "moves all three the
// same way"). 135 deg is the standard fixture; 45 is the comparison.
[135, 45].forEach((az) => {
  VIEWS.push({ id: `M-az${az}`, build: trio({ lights: [{ ...SUN, azimuth: az }] }) });
});

// G' — orbit keeping the SAME two cube faces visible (O28). Round 2's G swapped
// faces, so the comparison could not be made. +-12 deg keeps them.
[-30, -18].forEach((yaw) => {
  VIEWS.push({ id: `Gp-yaw${yaw}`, build: trio({ camera: { ...CAMERA, yaw } }) });
});

// N — the A and E sets at LOW density (~40), direct evidence for answer (c).
['off', 2, 3, 4].forEach((n) => {
  VIEWS.push({ id: `N-A-${n}`, build: scene({ shadow: { ...shadowLayers(n), shadowDensity: 40 }, styleParams: { fillDensity: 40 } }) });
});
[2, 3, 4].forEach((b) => {
  VIEWS.push({ id: `N-E-${b}`, build: scene({ ground: { enabled: false }, tone: toneBands(b), styleParams: { fillDensity: 40 } }) });
});

// ── ROUND 4 views ───────────────────────────────────────────────────────────
// G'' — the orbit pair with SPECULAR OFF, so a moving highlight cannot be
// mistaken for a leaking diffuse term (O28). Band indices are dumped separately.
[-30, -18].forEach((yaw) => {
  VIEWS.push({ id: `Gpp-yaw${yaw}`, build: trio({ camera: { ...CAMERA, yaw }, tone: toneBands(4, false) }) });
});
// H' — the treatment matrix on the BALL, so the curved O15 claim is checkable.
['none', 'blank', 'sparse', 'stippleOut', 'burst', 'altFill'].forEach((t) => {
  VIEWS.push({ id: `Hp-ball-perface-${t}`, build: scene({ objects: [BALL], ground: { enabled: false }, styleParams: { highlightTreatment: t } }) });
  VIEWS.push({ id: `Hp-ball-lightdriven-${t}`, build: scene({ objects: [BALL], ground: { enabled: false }, styleParams: { highlightTreatment: t, highlightMode: 'lightDriven' } }) });
});
// P — Density sweep on the ball, tone ON (the fix-1 evidence).
// ROUND 7 item 8: ALL SIX stops are shot. 25 and 60 were measured by m4 but
// never rendered, so the designer could never look at the two stops that
// actually bracket the dead zone.
const DENSITY_STOPS = [10, 25, 40, 60, 85, 100];
DENSITY_STOPS.forEach((d) => {
  VIEWS.push({ id: `P-density${d}`, build: scene({ objects: [BALL], ground: { enabled: false }, styleParams: { fillDensity: d } }) });
});
// Q — hatch against spiral on the ball at bands 4. K-spiral-bands4 is now the
// reference the hatch mapper is judged against.
['hatch', 'spiral'].forEach((m) => {
  VIEWS.push({ id: `Q-${m}`, build: scene({ objects: [BALL], ground: { enabled: false }, styleParams: { mapper: m } }) });
});

// ── ROUND 7 views ───────────────────────────────────────────────────────────
// R — the view asked for four rounds running (O19/O20/O21/O26). Cube and
// low-poly sphere, ALONE, at bands 2 / 3 / 4, ground off so nothing but the
// object's own facets carry ink. `facets.js` prints per-facet D off these.
[2, 3, 4].forEach((b) => {
  VIEWS.push({ id: `R-cube-bands${b}`, build: scene({ objects: [CUBE], ground: { enabled: false }, tone: toneBands(b) }) });
  VIEWS.push({ id: `R-lp-bands${b}`, build: scene({ objects: [LOWPOLY], ground: { enabled: false }, tone: toneBands(b) }) });
});
// R' — the O26 pairing in ONE frame: a faceted object and a curved one, same
// light, same bands. O26 asks for both conditions in one comparison.
VIEWS.push({
  id: 'R-pair-bands4',
  build: scene({ objects: [at(LOWPOLY, -70, 0), at(BALL, 70, 0)], ground: { enabled: false } }),
});
// ── DETACHED SHADOWS (Round 7 item 11) — measured, and it is the FIXTURE ────
// "The capsule and the low-poly float in F-trio" is correct, and it is not a
// shadow-code defect. Measured on the assembled mesh, lowest world vertex:
//     cube     y =  0.00 mm   rests
//     lowpoly  y =  2.00 mm   floats        (transform y 42, geodesic r 40)
//     capsule  y = 30.00 mm   floats        (transform y 54, half-extent 24)
// The shadow is drawn under an object that is genuinely in the air, so it is
// correctly detached. `F-trio` is left EXACTLY as it is — it carries the
// protected C15 acceptance rows and moving it would make those incomparable —
// and the corrected drawing is a new view beside it.
const REST = (obj, dropBy) => ({ ...clone(obj), transform: { ...clone(obj.transform), y: obj.transform.y - dropBy } });
const trioRest = (over = {}) => scene({
  objects: [at(CUBE, -100, 0), at(REST(LOWPOLY, 2), 0, 0), at(REST(CAPSULE, 30), 100, 0)],
  shadow: shadowLayers(4), ...over,
});
VIEWS.push({ id: 'F-trio-rest', build: trioRest() });
VIEWS.push({ id: 'F-trio-rest-2', build: trioRest({ shadow: shadowLayers(2) }) });

// W — the ladder fixture at TWICE the radius. Zone R is a band 12–18 % of the
// form's width (§5.1); on the 46 mm ball that is ~510 mm² of screen, i.e. ~32
// windows of 4 mm² TOTAL, so "measure R with n >= 30" is unreachable at that
// size no matter how good the mask is — the demand is a statement about the
// fixture, not about the instrument. Doubling the radius quadruples R's area
// and puts n where the ruling asks for it, at the same 4 mm window.
const BIGBALL = {
  ...clone(BALL), id: 'ball', params: { radius: 92, detail: 26 },
  transform: { x: 0, y: 92, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
};
VIEWS.push({ id: 'W-bigball-bands4', build: scene({ objects: [BIGBALL], ground: { enabled: false } }) });
VIEWS.push({ id: 'W-bigball-sun45', build: scene({ objects: [BIGBALL], ground: { enabled: false }, lights: [{ ...SUN, elevation: 45 }] }) });

// U — Jay's box caster, offline, at the SAME parameters jay-layers.js drives in
// the running app (box 34x78x34, yaw 18, x -10). The designer asked for a crop
// of the mid-throw mottling in `jay-layers/layers-4.png`; this is the same
// drawing at a scale that can actually be measured.
const JAYBOX = {
  id: 'box', name: 'Box', primitive: 'box', params: { sx: 34, sy: 78, sz: 34 },
  transform: { x: -10, y: 39, z: 0, yaw: 18, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
['off', 2, 3, 4].forEach((n) => {
  VIEWS.push({ id: `U-box-${n}`, build: scene({ objects: [JAYBOX], shadow: shadowLayers(n) }) });
});

// V — the SECOND fixture for the ladder (ruling iii): the standard sun is 28°,
// this is 45°. "A number that survives one fixture is an anecdote."
const SUN45 = { ...SUN, elevation: 45 };
VIEWS.push({ id: 'V-E-bands4-sun45', build: scene({ ground: { enabled: false }, lights: [SUN45] }) });
['off', 2, 3, 4].forEach((n) => {
  VIEWS.push({ id: `V-A-${n}-sun45`, build: scene({ objects: AOBJ, lights: [SUN45], shadow: shadowLayers(n) }) });
});

// ── ROUND 8 views — the four the Round 7 review recorded as OWED ────────────
//
// W-lp — the low-poly at TWICE the radius and frequency 3. On the frequency-2
// geodesic at r 40, 17 of 40 visible facets are smaller than the protocol's own
// 4 mm window and the scored ones carry n = 1-6, so O21 and O23 sit at the edge
// of what a 4 mm protocol can measure. The answer is a bigger fixture, not a
// smaller window (the same move `W-bigball` made for the curved ladder).
const BIGLP = {
  ...clone(LOWPOLY), id: 'lowpoly',
  params: { solidType: 'geodesic', radius: 80, frequency: 3 },
  transform: { ...clone(LOWPOLY.transform), y: 84 },
};
VIEWS.push({ id: 'W-lp-bands4', build: scene({ objects: [BIGLP], ground: { enabled: false } }) });
VIEWS.push({ id: 'W-lp-sun45', build: scene({ objects: [BIGLP], ground: { enabled: false }, lights: [{ ...SUN, elevation: 45 }] }) });

// R2 — the SECOND CUBE FIXTURE. The entire faceted score (O19-O22, O28) has
// rested on one cube orientation under one sun; `V-`/`W-` gave the ball a second
// column and the cube never got one. Different yaw AND a different sun, so the
// three visible faces sit at different N.L.
const CUBE2 = { ...clone(CUBE), transform: { ...clone(CUBE.transform), yaw: 24 } };
const SUN2 = { ...SUN, azimuth: 200, elevation: 40 };
[2, 3, 4].forEach((b) => {
  VIEWS.push({
    id: `R2-cube-bands${b}`,
    build: scene({ objects: [CUBE2], ground: { enabled: false }, tone: toneBands(b), lights: [SUN2] }),
  });
});

// O24 on the FACETED path, against the glint predicate `a2bf25d` replaced. Only
// the trio views swept specular, and they were never re-measured after the
// predicate changed.
[['spec0', 0.05], ['spec3', 3]].forEach(([tag, size]) => {
  VIEWS.push({ id: `R-cube-${tag}`, build: scene({ objects: [CUBE], ground: { enabled: false }, tone: toneBands(4, true, size) }) });
  VIEWS.push({ id: `R-lp-${tag}`, build: scene({ objects: [LOWPOLY], ground: { enabled: false }, tone: toneBands(4, true, size) }) });
});

// ── THE FIXTURE EXPORT ──────────────────────────────────────────────────────
// `buildPaths(V, viewId)` is the ONLY sanctioned way to get a view's geometry,
// so a measurement can never drift from the render.
const VIEW_BY_ID = {};
VIEWS.forEach((v) => { VIEW_BY_ID[v.id] = v; });

const buildParams = (V, viewId) => {
  const view = VIEW_BY_ID[viewId];
  if (!view) throw new Error(`no such view: ${viewId}`);
  return V.Scene3D.Params.normalizeParams(view.build(V));
};
const buildPaths = (V, viewId, bounds) => {
  const p = buildParams(V, viewId);
  const B = bounds || BOUNDS;
  return V.AlgorithmRegistry.scene3d.generate(
    V.Scene3D.Params.collectSceneParams(p, []), new V.SeededRNG(SEED), new V.SimpleNoise(SEED), B,
  ) || [];
};
// The object list a view actually renders — m4 used to guess this and got it
// wrong for every A-view.
const objectsOf = (V, viewId) => buildParams(V, viewId).objects.map((o) => ({ ...o }));

// THE TWO-FIXTURE BALL LADDER (ruling iii, R7 protected item 4): "a number that
// survives one fixture is an anecdote". The 46 mm ball and its 92 mm twin are the
// pair every curved criterion is scored on, so the PAIR is exported rather than
// the radii — a harness that iterates this list cannot restate a radius, and it
// cannot silently score only one of the two.
const BALL_LADDER = [BALL, BIGBALL];

module.exports = {
  BOUNDS, SEED, CAMERA, CAMERA_ORBIT, SUN, SUN45, SUN2,
  BALL, POST, CUBE, CUBE2, LOWPOLY, BIGLP, BIGBALL, CAPSULE, JAYBOX, AOBJ,
  BALL_LADDER,
  DENSITY_STOPS, toneBands, styleTable, scene, at, shadowLayers, trio,
  VIEWS, VIEW_BY_ID, buildParams, buildPaths, objectsOf,
};
