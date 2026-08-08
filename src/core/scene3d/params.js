/**
 * Scene3D.Params — scene3d params schema (CONTRACT A): normalization,
 * sanitization, and the sceneVersion migration slot.
 *
 * The scene lives fully serialized in layer.params (JSON-safe; regenerates
 * from params). `normalizeParams` back-fills every scene noun (objects,
 * lights, ground, backdrop, camera, styleTable, assets, groups), clamps
 * numerics to finite values, and guarantees unique `obj-<n>` object ids —
 * WITHOUT mutating its input. `sanitizeSceneParams` is the engine's import
 * branch: migration first (keyed on params.sceneVersion), then normalization.
 *
 * Dependency chain: Geometry3D → Scene3D.Charts → Scene3D.Mesh →
 * Scene3D.Params → Scene3D.Scene/Edges/Depth/HLR → algorithms/scene3d.js.
 */
(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const G3 = Vectura.Geometry3D || {};
  const finite = G3.finite || ((value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback));
  const clamp = G3.clamp || ((value, min, max) => Math.max(min, Math.min(max, Number(value) || 0)));

  // Format version of the scene schema INSIDE layer.params (independent of the
  // .vectura engine formatVersion). Bump + add a SCENE_MIGRATIONS step when the
  // scene shape changes incompatibly.
  // v2 (X-ray fold): x-ray narrows to see-through back-face FILLS only; the
  // hidden-EDGE dash is owned entirely by edgeStyles.hidden. SCENE_MIGRATIONS[1]
  // seeds edgeStyles.hidden = dash on every x-ray object (whose xrayHiddenEdges
  // was not explicitly false) so a saved scene renders BYTE-IDENTICALLY — the
  // seeded override is a pure treatment flip (pen/weightMm/dash all null ⇒
  // edgeStyleMeta returns null ⇒ no overlay meta).
  const SCENE_VERSION = 2;
  // Keyed by SOURCE version: SCENE_MIGRATIONS[n] upgrades an n payload to n+1.
  const SCENE_MIGRATIONS = {};

  const PRIMITIVES = [
    'box', 'plane', 'sphere', 'ellipsoid', 'cylinder', 'cone', 'torus',
    'torusKnot', 'capsule', 'superellipsoid', 'pyramid', 'solid',
  ];

  // Phase 1 set + Phase 3 surface-fill mappers + CtS I5 depth-slice treatment.
  // 'contourSlice' cuts the assembled mesh with parallel planes (topographic
  // cross-sections) — DISTINCT from 'contour' (UV parallels / inset rings). No
  // existing content sets it, so its dormant branch keeps every baseline
  // byte-identical.
  const MAPPERS = ['none', 'hatch', 'wireframe', 'crosshatch', 'contour', 'spiral', 'stipple', 'contourSlice'];

  // CSG group booleans. 'none' = independent children (the legacy default);
  // 'subtract'/'union'/'intersect' combine the group's children into one carved
  // pseudo-object (Scene3D.Boolean). An absent op normalizes to 'none'.
  const GROUP_OPS = ['none', 'union', 'subtract', 'intersect'];

  // Per-primitive params-bag defaults. Sizes are document mm. For the topoform
  // family (ellipsoid…pyramid) sx/sy/sz feed the Scene3D.Mesh chart builders
  // directly (they interpret them as radius / half-height per chart).
  const PRIMITIVE_PARAM_DEFAULTS = {
    box: { sx: 40, sy: 40, sz: 40 },
    plane: { sx: 120, sz: 120 },
    sphere: { radius: 20, detail: 16 },
    ellipsoid: { sx: 26, sy: 18, sz: 20, detail: 16 },
    cylinder: { sx: 16, sy: 22, sz: 16, detail: 16 },
    cone: { sx: 18, sy: 22, sz: 18, detail: 16 },
    torus: { sx: 30, sy: 22, sz: 22, detail: 16 },
    torusKnot: { sx: 26, sy: 22, sz: 22, detail: 20 },
    capsule: { sx: 14, sy: 24, sz: 14, detail: 16 },
    superellipsoid: { sx: 20, sy: 20, sz: 20, detail: 16 },
    pyramid: { sx: 20, sy: 20, sz: 20, detail: 8 },
    // Convert-to-Scene (I2) — the deformer keys (expand / twist / explode /
    // extrude / shard) let a converted polyhedron ride the LIVE solid path and
    // re-evaluate its deformers through the compositor. Every default is INERT
    // (expand 100 ⇒ ×1.0, the rest 0), so createSolidMesh's deformed pass is an
    // identity and any pre-I2 solid renders byte-identically.
    solid: {
      solidType: 'buckyball', radius: 20, sideCount: 5, depth: 24, frequency: 2, taper: 55, starRatio: 45,
      expand: 100, twist: 0, explode: 0, extrude: 0, shard: 0,
    },
  };

  // ── Creation defaults — the ONE table an add OR a swap is seeded from ──────
  // `PRIMITIVE_PARAM_DEFAULTS` above is the DESERIALIZATION contract: it fills
  // the gaps in a bag read off disk, so its numbers must never move (changing
  // one silently reshapes every saved document that omitted that key).
  // `PRIMITIVE_CREATE_DEFAULTS` is the CREATION contract: the proportions a
  // brand-new object is born with. Historically the add shelf (engine
  // OBJECT3D_PRIMITIVE_DEFAULTS + the panel's PRIMITIVES.defaults()) and the
  // primitive swap (PRIMITIVE_PARAM_DEFAULTS) disagreed for 8 of 10 primitives
  // — `add torus` made a thin ring (sy/sz 9), `swap → torus` a fat donut
  // (sy/sz 22). The CURATED ADD proportions win; every creation path now reads
  // this table, and nothing here feeds normalizePrimitiveParams, so existing
  // documents render byte-identically.
  const PRIMITIVE_CREATE_DEFAULTS = {
    box: { sx: 40, sy: 40, sz: 40 },
    // Plane: buildPlaneMesh reads sx and **sz**. The legacy add bag wrote `sy`,
    // so a fresh plane was 60 × 120 (sz fell through to the mesh's own 120
    // literal) and its Depth slider was inert. Seeding `sz` makes Depth live
    // for NEW planes only — a saved plane still carries no sz, still takes the
    // 120 fallback, and still renders exactly as it does today.
    plane: { sx: 60, sz: 60 },
    sphere: { radius: 25, detail: 28 },
    // ellipsoid + pyramid were swap-reachable but had no add path, no labels
    // and no dimension controls (selecting one blanked the inspector). Adopted
    // here with add-shelf-style proportions (generous `detail`; the pyramid
    // keeps 8 — its perimeter chart wants a multiple of 4 to land crisp corners
    // and extra rows on a flat face are coplanar).
    ellipsoid: { sx: 30, sy: 20, sz: 22, detail: 26 },
    cylinder: { sx: 20, sy: 22, sz: 20, detail: 24 },
    cone: { sx: 20, sy: 22, sz: 20, detail: 24 },
    torus: { sx: 34, sy: 9, sz: 9, detail: 24 },
    torusKnot: { sx: 30, sy: 6, sz: 6, detail: 28 },
    capsule: { sx: 14, sy: 16, sz: 14, detail: 22 },
    superellipsoid: { sx: 26, sy: 26, sz: 26, detail: 24 },
    pyramid: { sx: 24, sy: 26, sz: 24, detail: 8 },
    solid: { ...PRIMITIVE_PARAM_DEFAULTS.solid },
  };

  // Keys that carry SIZE (document mm) per primitive — the ones a swap scales.
  // Everything else (detail, solidType, sideCount, frequency, taper, starRatio,
  // the deformers, importedMesh) describes shape or quality, not size, and is
  // left at its creation default.
  const PRIMITIVE_SIZE_KEYS = {
    box: ['sx', 'sy', 'sz'],
    plane: ['sx', 'sz'],
    sphere: ['radius'],
    ellipsoid: ['sx', 'sy', 'sz'],
    cylinder: ['sx', 'sy', 'sz'],
    cone: ['sx', 'sy', 'sz'],
    torus: ['sx', 'sy', 'sz'],
    torusKnot: ['sx', 'sy', 'sz'],
    capsule: ['sx', 'sy', 'sz'],
    superellipsoid: ['sx', 'sy', 'sz'],
    pyramid: ['sx', 'sy', 'sz'],
    // `depth` is a linear extent in the same units as `radius` (prism height,
    // frustum height, star-prism extrusion), so it rides the same scale factor.
    solid: ['radius', 'depth'],
  };

  // The editing range of each size key. The Geometry controls in the object
  // inspector read their slider min/max from here, so a scaled swap can never
  // land a value outside the control that edits it.
  const RANGE = (min, max) => ({ min, max });
  const PRIMITIVE_SIZE_RANGE = {
    box: { sx: RANGE(2, 200), sy: RANGE(2, 200), sz: RANGE(2, 200) },
    plane: { sx: RANGE(2, 300), sz: RANGE(2, 300) },
    sphere: { radius: RANGE(2, 150) },
    ellipsoid: { sx: RANGE(2, 150), sy: RANGE(2, 150), sz: RANGE(2, 150) },
    cylinder: { sx: RANGE(2, 150), sy: RANGE(2, 150), sz: RANGE(2, 150) },
    cone: { sx: RANGE(2, 150), sy: RANGE(2, 150), sz: RANGE(2, 150) },
    torus: { sx: RANGE(4, 200), sy: RANGE(1, 60), sz: RANGE(1, 60) },
    torusKnot: { sx: RANGE(6, 150), sy: RANGE(1, 40), sz: RANGE(1, 40) },
    capsule: { sx: RANGE(2, 100), sy: RANGE(2, 150), sz: RANGE(2, 100) },
    superellipsoid: { sx: RANGE(2, 150), sy: RANGE(2, 150), sz: RANGE(2, 150) },
    pyramid: { sx: RANGE(2, 150), sy: RANGE(2, 150), sz: RANGE(2, 150) },
    solid: { radius: RANGE(20, 130), depth: RANGE(0, 180) },
  };

  // ── Nominal size ──────────────────────────────────────────────────────────
  // The largest axis-aligned extent (document mm) of the UNTRANSFORMED mesh a
  // params bag produces, in closed form. Derived from the MESH BUILDERS, never
  // from the slider labels: a torus's "Diameter" (sx) is only 0.75× its ring
  // radius and its "Thickness" 0.28× its tube radius, so an sx-34 torus is
  // really ~56 mm across. Preserving the true EXTENT is what makes a swapped
  // object still read as the same object in the same place.
  //   box              max(sx, sy, sz)                       (buildBoxMesh)
  //   plane            max(sx, sz)                           (buildPlaneMesh)
  //   sphere           2·radius                              (sizes = r,r,r)
  //   ellipsoid |
  //   cylinder  |
  //   capsule   |      2·max(sx, sy, sz)                     (semi-axis charts)
  //   superell. |
  //   pyramid   |
  //   cone             2·max(sx, sy)                         (sz unread)
  //   torus            2·(max(2, .75·sx) + max(1, .28·min(sy,sz)))
  //   torusKnot        3·max(2, .62·sx) + max(1, .24·min(sy,sz))
  //   solid            MEASURED (see solidNominalSize)
  // Every closed-form row is homogeneous of degree 1 in its size keys (apart
  // from the degenerate max(2,·)/max(1,·) floors, which only bind at
  // sub-millimetre inputs), which is why scaling the size keys by k scales the
  // extent by k. tests/unit/scene-geometry-size-map.test.js checks every row
  // against the real mesh bounding box.
  //
  // `solid` is the exception: its 16 families are inscribed in `radius` by
  // wildly different factors (a flat polygon spans 1.90·r, a buckyball 1.70·r,
  // a cube only 1.15·r), so no single formula fits. Measure the real solid
  // instead — it is a few dozen vertices and only runs on a swap.
  const solidNominalSize = (bag) => {
    const closed = Math.max(2 * finite(bag.radius, 20), finite(bag.depth, 0));
    const Mesh = Vectura.Scene3D && Vectura.Scene3D.Mesh;
    if (!Mesh || typeof Mesh.createSolidMesh !== 'function') return closed;
    try {
      const mesh = Mesh.createSolidMesh({ ...bag, applyDeformers: true });
      const verts = mesh && mesh.vertices;
      if (!verts || !verts.length) return closed;
      let extent = 0;
      ['x', 'y', 'z'].forEach((axis) => {
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = 0; i < verts.length; i += 1) {
          const value = finite(verts[i][axis], 0);
          if (value < lo) lo = value;
          if (value > hi) hi = value;
        }
        if (hi - lo > extent) extent = hi - lo;
      });
      return extent > 0 ? extent : closed;
    } catch (_) {
      return closed;
    }
  };
  const primitiveNominalSize = (primitive, bag) => {
    const p = isObject(bag) ? bag : {};
    const sx = finite(p.sx, 20);
    const sy = finite(p.sy, 20);
    const sz = finite(p.sz, 20);
    if (primitive === 'box') return Math.max(finite(p.sx, 40), finite(p.sy, 40), finite(p.sz, 40));
    if (primitive === 'plane') return Math.max(finite(p.sx, 120), finite(p.sz, 120));
    if (primitive === 'sphere') return 2 * finite(p.radius, 20);
    if (primitive === 'cone') return 2 * Math.max(sx, sy);
    if (primitive === 'torus') return 2 * (Math.max(2, sx * 0.75) + Math.max(1, Math.min(sy, sz) * 0.28));
    if (primitive === 'torusKnot') return 3 * Math.max(2, sx * 0.62) + Math.max(1, Math.min(sy, sz) * 0.24);
    if (primitive === 'solid') return solidNominalSize(p);
    return 2 * Math.max(sx, sy, sz);
  };

  // A swap can legitimately need a big factor (a 200 mm box → a capsule whose
  // default is 32 mm across is ×6.25), but a pathological bag must not produce
  // an absurd one. 0.1×..12× brackets every in-range pair.
  const SWAP_SCALE_MIN = 0.1;
  const SWAP_SCALE_MAX = 12;

  // Build the params bag for `primitive`, seeded from PRIMITIVE_CREATE_DEFAULTS
  // and — when a previous bag is supplied — uniformly rescaled so the object
  // keeps roughly its previous overall size. Shape params are DELIBERATELY not
  // carried (a box's sx/sy/sz means nothing to a sphere); only the size follows.
  // An imported-mesh payload IS carried across any swap, so solid → box → solid
  // is reversible instead of a one-way trip only Cmd+Z could undo.
  const buildPrimitiveParams = (primitive, prevPrimitive, prevParams) => {
    const base = PRIMITIVE_CREATE_DEFAULTS[primitive];
    if (!base) return null;
    const out = { ...base };
    const prev = isObject(prevParams) ? prevParams : null;
    const mesh = prev && prev.importedMesh;
    if (isObject(mesh) && Array.isArray(mesh.vertices) && Array.isArray(mesh.faces)) {
      out.importedMesh = mesh;
      if (primitive === 'solid') out.solidType = 'importedMesh';
    }
    if (!prev || !PRIMITIVE_CREATE_DEFAULTS[prevPrimitive]) return out;
    const prevSize = primitiveNominalSize(prevPrimitive, prev);
    const baseSize = primitiveNominalSize(primitive, out);
    if (!(prevSize > 0) || !(baseSize > 0)) return out;
    const k = clamp(prevSize / baseSize, SWAP_SCALE_MIN, SWAP_SCALE_MAX);
    const ranges = PRIMITIVE_SIZE_RANGE[primitive] || {};
    (PRIMITIVE_SIZE_KEYS[primitive] || []).forEach((key) => {
      if (typeof out[key] !== 'number') return;
      const scaled = Math.round(out[key] * k * 2) / 2;
      const r = ranges[key];
      out[key] = r ? clamp(scaled, r.min, r.max) : scaled;
    });
    return out;
  };

  const DEFAULT_TRANSFORM = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
  const DEFAULT_CAMERA = {
    projection: 'orthographic', yaw: -30, pitch: 20, roll: 0,
    cameraDistance: 620, focalLength: 520, zoom: 1,
  };
  const DEFAULT_LIGHT = { id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: true };
  // Positional (point/spot) light defaults. `position` is a world-space point;
  // `range` is the LINEAR falloff distance in world mm (0 ⇒ no falloff). A spot
  // adds a `target` (cone axis = normalize(target − position)), a `coneAngle`
  // (half-angle deg) and a soft `penumbra` (deg) edge.
  const DEFAULT_LIGHT_POSITION = { x: 120, y: 200, z: 120 };
  const DEFAULT_LIGHT_TARGET = { x: 0, y: 0, z: 0 };
  const DEFAULT_LIGHT_RANGE = 400;
  const DEFAULT_CONE_ANGLE = 30;
  const DEFAULT_PENUMBRA = 8;
  // Area (soft) light: a positional bulb with a physical extent. `size` is the
  // world-mm diameter of the emitter; the shader spreads `samples` deterministic
  // sub-samples across that extent and averages them, so the terminator is a
  // softer gradient and the cast shadow a softer penumbra than a hard point.
  const DEFAULT_AREA_SIZE = 120;
  const DEFAULT_AREA_SAMPLES = 6;
  // Phase 5 — scene-level shadow controls. Every default reproduces the legacy
  // hardcoded look (angle 45°, coverage 0.5 ⇔ density 50, solid, single flat
  // hull, pen inherited from the caster) so a scene with no `shadow` block
  // renders byte-identically to the pre-Phase-5 renderer.
  const DEFAULT_SHADOW = {
    shadowMode: 'additive',      // 'additive' emits hatch; 'inverse' thins the ground's own fill (I26)
    shadowAngle: 45,             // hatch orientation (deg); replaces SHADOW_ANGLE
    shadowDensity: 50,           // 1..100; 50 maps to the legacy coverage 0.5
    shadowPenId: null,           // null ⇒ inherit the caster's pen (legacy)
    shadowLineType: 'solid',     // reuse the Phase-1 stroke enum
    shadowLayers: false,         // penumbra: nested inset rings when true
    shadowLayerCount: 3,         // 2..4 nested layers when layered
    shadowFalloff: 0.5,          // density drop per layer outward (0.2..1)
    shadowAngleFollowsLight: false, // orient hatch perpendicular to the light bearing
  };
  // CONTRACT L3 — light-driven tone. `enabled: false` ⇒ EXACT Phase 1 flat look.
  // bands is a soft hint (2|3|4); the tone READER (Scene3D.Regions) trusts the
  // ladder length for the real band count, so a hand-edited length mismatch
  // degrades gracefully rather than throwing.
  const DEFAULT_TONE = {
    enabled: true,
    bands: 3,
    thresholds: [0.33, 0.66], // ascending intensity cut points (length bands-1)
    ladder: [0.2, 0.5, 0.85], // coverage (0..1) per band, dark→light (length bands)
    specular: { enabled: true, size: 1 },
  };

  const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

  // ── Per-edge-class EdgeStyle table (C-06). Each class carries its OWN
  // { pen, weightMm, dash } (the `hidden` class also a hiddenTreatment). Every
  // default is a strict NO-OP — pen null (inherit the object/layer pen),
  // weightMm null (inherit the base stroke weight), dash null (inherit the line
  // type), hidden.hiddenTreatment 'drop' (today's solid behavior; 'dash' = the
  // x-ray see-through look). So a scene with NO edgeStyles block, or one carrying
  // only defaults, renders byte-identically. `seam` (CSG) is intentionally NOT in
  // the class list yet — the shape is open, so a future seam class is additive
  // (no schema break). Emitted ONLY when the scene actually has one (normalizeParams
  // attaches it only when present), so a legacy scene serializes unchanged.
  const EDGE_STYLE_CLASSES = ['silhouette', 'crease', 'boundary', 'interior', 'hidden'];
  const HIDDEN_TREATMENTS = ['drop', 'dash'];
  const normalizeDashPattern = (dash) => {
    if (!Array.isArray(dash) || !dash.length) return null;
    const out = dash.map((n) => finite(n, 0)).filter((n) => n > 0);
    return out.length ? out : null;
  };
  const normalizeEdgeStyle = (style, cls) => {
    const src = isObject(style) ? style : {};
    const out = {
      pen: (typeof src.pen === 'string' && src.pen) ? src.pen : null,
      weightMm: src.weightMm == null ? null : clamp(finite(src.weightMm, 0.3), 0.05, 5),
      dash: normalizeDashPattern(src.dash),
    };
    if (cls === 'hidden') {
      out.hiddenTreatment = HIDDEN_TREATMENTS.includes(src.hiddenTreatment) ? src.hiddenTreatment : 'drop';
    }
    return out;
  };
  const normalizeEdgeStyles = (styles) => {
    const src = isObject(styles) ? styles : {};
    const out = {};
    EDGE_STYLE_CLASSES.forEach((cls) => { out[cls] = normalizeEdgeStyle(src[cls], cls); });
    return out;
  };
  // Polish P-B — per-OBJECT EdgeStyle override. Unlike the scene-wide table
  // (every class filled with a no-op default), an object override keeps ONLY the
  // classes the user explicitly set — an ABSENT class inherits the scene default
  // (null/absent = inherit). Returns null when nothing is overridden so the
  // object serializes + renders byte-identically. The emit resolver (edgeStyleFor)
  // merges PER FIELD: for a present class each field is objectOverride[field] ??
  // sceneEdgeStyle[field] ?? null, resolved independently — so overriding one
  // field (e.g. the X-ray fold's hidden.hiddenTreatment seed) inherits the scene
  // class's other fields (pen/weightMm/dash) rather than blanking them.
  const normalizeObjectEdgeStyles = (styles) => {
    if (!isObject(styles)) return null;
    const out = {};
    EDGE_STYLE_CLASSES.forEach((cls) => {
      if (isObject(styles[cls])) out[cls] = normalizeEdgeStyle(styles[cls], cls);
    });
    return Object.keys(out).length ? out : null;
  };

  // Known style.params keys carry an explicit clamp/whitelist so a hand-edited
  // scene degrades gracefully (do NOT rely on passthrough alone). Unknown keys
  // still pass through for forward compat. Returns `undefined` for keys with no
  // dedicated clamp (the generic finite-guard below then applies).
  const STROKE_LINE_TYPES = ['solid', 'dashed', 'dotted', 'dashdot'];
  const SPIRAL_CENTERS = ['centroid', 'bboxCenter'];
  const SPIRAL_MODES = ['flatClip', 'surfaceHelix'];
  const ANGLE_REFS = ['face', 'screen', 'worldUp'];
  const CONTOUR_STYLES = ['region', 'surface'];
  const DOT_SHAPES = ['dot', 'ring', 'cross', 'plus', 'tick'];
  const EDGE_CLASS_KEYS = ['silhouette', 'boundary', 'crease', 'interior'];
  // Phase 4 — highlight (specular band) treatments. 'blank' is the legacy
  // default (the brightest band drops to bare paper). altFillMapper reuses the
  // surface-fill mapper set.
  const HIGHLIGHT_TREATMENTS = ['blank', 'keep', 'dashed', 'dotted', 'sparse', 'altFill', 'burst', 'stippleOut'];
  const ALT_FILL_MAPPERS = ['hatch', 'crosshatch', 'contour', 'spiral', 'stipple'];
  const BURST_CENTERS = ['specular', 'centroid'];
  // CtS I5 — depth-slice ('contourSlice') controls. All inert on any other
  // mapper (no existing scene sets this mapper), so every default is a no-op.
  const SLICE_VISIBILITIES = ['visibleOnly', 'fullContour'];
  const clampStyleParam = (key, value) => {
    switch (key) {
      case 'lineType': return STROKE_LINE_TYPES.includes(value) ? value : 'solid';
      case 'dashScale': return clamp(finite(value, 1), 0.25, 4);
      case 'wobble': return clamp(finite(value, 0), 0, 100);
      case 'wobbleScale': return clamp(finite(value, 6), 1, 30);
      case 'overstroke': return value === true;
      case 'crossAngleDelta': return clamp(finite(value, 90), 10, 170);
      case 'crossDensityRatio': return clamp(finite(value, 1), 0.25, 2);
      case 'tripleHatch': return value === true;
      // Phase 3 — true-spiral mapper controls.
      case 'spiralPitch': return clamp(finite(value, 3), 0.5, 20);
      case 'spiralAngleOffset': return clamp(finite(value, 0), 0, 360);
      case 'spiralCenter': return SPIRAL_CENTERS.includes(value) ? value : 'centroid';
      case 'axisSnap': return value === true;
      case 'spiralMode': return SPIRAL_MODES.includes(value) ? value : 'surfaceHelix';
      case 'spiralEccentricity': return clamp(finite(value, 1), 0.3, 3);
      // ── Phase 2 — per-mapper controls (all no-op at their defaults). ─────────
      // HATCH: the frame the hatch angle is measured in, and boustrophedon
      // scanline linking (default false ⇒ disjoint segments = Phase-1 look).
      case 'angleRef': return ANGLE_REFS.includes(value) ? value : 'face';
      case 'linkFill': return value === true;
      // CONTOUR: region (concentric inset rings, the faceted look) vs surface
      // (parametric parallels, the curved default); an explicit mm step alias.
      case 'contourStyle': return CONTOUR_STYLES.includes(value) ? value : 'surface';
      case 'contourStep': return clamp(finite(value, 3), 0.5, 40);
      // STIPPLE: dot mark shape/size/rotation + deterministic lattice jitter.
      case 'dotSize': return clamp(finite(value, 0.7), 0.1, 3);
      case 'dotShape': return DOT_SHAPES.includes(value) ? value : 'dot';
      case 'stippleJitter': return clamp(finite(value, 40), 0, 100);
      case 'dotAngle': return clamp(finite(value, 0), 0, 360);
      // WIREFRAME: per-class edge visibility (default all true = current look)
      // and a dashed occluded-edge pass (x-ray-lite, default off).
      case 'edgeClasses': {
        const s = isObject(value) ? value : {};
        const out = {};
        EDGE_CLASS_KEYS.forEach((k) => { out[k] = s[k] !== false; });
        return out;
      }
      case 'showHidden': return value === true;
      // Phase 6 — x-ray controls. Only meaningful when the OBJECT is set to
      // visibility:'xray' (that toggle is the on/off); these shape the look.
      case 'xrayHiddenEdges': return value !== false; // dashed occluded edges
      case 'xrayBackFaces': return value !== false;   // render far-surface fills (THE FIX)
      case 'xrayBackDensity': return clamp(finite(value, 0.4), 0.2, 1); // back fill sparser
      case 'xrayBackPenId': return (typeof value === 'string' && value) ? value : null; // inherit when null
      case 'xrayBackLineType': return STROKE_LINE_TYPES.includes(value) ? value : 'dashed';
      case 'xrayFront': return value === 'faded' ? 'faded' : 'solid';
      // Quantitative X-ray (interpretation A): modulate the see-through back-fill
      // by how far behind the front surface each sample sits. 'off' (default) is
      // the flat x-ray, byte-identical. 'density'/'weight'/'both' opt in.
      case 'xrayDepthCue': return ['off', 'density', 'weight', 'both'].includes(value) ? value : 'off';
      // Phase 4 — highlight (specular band) treatments. Default 'blank' = the
      // legacy bare-paper highlight; the others render the top tone band(s) with
      // a distinct treatment instead of dropping.
      case 'highlightTreatment': return HIGHLIGHT_TREATMENTS.includes(value) ? value : 'blank';
      // I8 — light-driven highlight/shadow mode. 'perFace' (default) = the legacy
      // per-face/per-band highlight (byte-identical). 'lightDriven' places the
      // highlight by ACTUAL lighting (per-sample specular). highlightSensitivity /
      // shadowSensitivity are stage counts: 1 = binary difference, N = a graded
      // gradient. All three default to the byte-identical no-op.
      case 'highlightMode': return value === 'lightDriven' ? 'lightDriven' : 'perFace';
      case 'highlightSensitivity': return clamp(Math.round(finite(value, 1)), 1, 6);
      case 'shadowSensitivity': return clamp(Math.round(finite(value, 1)), 1, 6);
      case 'highlightBands': return clamp(Math.round(finite(value, 1)), 1, 2);
      case 'highlightPenId': return (typeof value === 'string' && value) ? value : null; // inherit when null
      case 'highlightDensity': return clamp(finite(value, 25), 1, 100);
      case 'altFillMapper': return ALT_FILL_MAPPERS.includes(value) ? value : 'stipple';
      // CtS I5 — depth-slice ('contourSlice') controls. sliceCount mirrors
      // topoform's lineCount (default 26); sliceRotate/sliceTilt fully orient the
      // cutting planes (topoform planeRotate/planeTilt — together they reach any
      // plane normal, so no separate base-axis knob is needed); sliceVisibility
      // mirrors contourVisibility (drop back-facing vs keep the full ring).
      case 'sliceCount': return clamp(Math.round(finite(value, 26)), 2, 120);
      case 'sliceRotate': return clamp(finite(value, 0), -360, 360);
      case 'sliceTilt': return clamp(finite(value, 0), -180, 180);
      case 'sliceVisibility': return SLICE_VISIBILITIES.includes(value) ? value : 'visibleOnly';
      case 'burstCount': return clamp(Math.round(finite(value, 16)), 6, 48);
      case 'burstCenter': return BURST_CENTERS.includes(value) ? value : 'specular';
      default: return undefined;
    }
  };

  const normalizeStyle = (style) => {
    const src = isObject(style) ? style : {};
    const params = {};
    if (isObject(src.params)) {
      Object.keys(src.params).forEach((key) => {
        const clamped = clampStyleParam(key, src.params[key]);
        if (clamped !== undefined) { params[key] = clamped; return; }
        const value = src.params[key];
        if (typeof value === 'number') {
          if (Number.isFinite(value)) params[key] = value;
        } else {
          params[key] = value;
        }
      });
    }
    return {
      penId: typeof src.penId === 'string' && src.penId ? src.penId : null,
      mapper: MAPPERS.includes(src.mapper) ? src.mapper : 'none',
      params,
    };
  };

  const normalizeStyleTable = (table) => {
    const src = isObject(table) ? table : {};
    const mapOf = (bag) => {
      const out = {};
      if (isObject(bag)) {
        Object.keys(bag).forEach((key) => { out[key] = normalizeStyle(bag[key]); });
      }
      return out;
    };
    return {
      scene: normalizeStyle(src.scene),
      byObject: mapOf(src.byObject),
      byFace: mapOf(src.byFace),
    };
  };

  const normalizeTransform = (transform) => {
    const src = isObject(transform) ? transform : {};
    const scale = Math.max(0.01, finite(src.scale, 1));
    const out = {
      x: finite(src.x, 0),
      y: finite(src.y, 0),
      z: finite(src.z, 0),
      yaw: finite(src.yaw, 0),
      pitch: finite(src.pitch, 0),
      roll: finite(src.roll, 0),
      scale,
    };
    // I23 — optional per-axis (non-uniform) scale. `sx/sy/sz` are ABSOLUTE
    // per-axis factors; an absent key inherits the uniform `scale`, so a legacy
    // scale-only object round-trips byte-identically (no per-axis keys emitted).
    // The three keys are written ONLY when the object is genuinely non-uniform,
    // keeping a default/uniform transform's shape unchanged.
    if (src.sx != null || src.sy != null || src.sz != null) {
      const sx = Math.max(0.01, finite(src.sx, scale));
      const sy = Math.max(0.01, finite(src.sy, scale));
      const sz = Math.max(0.01, finite(src.sz, scale));
      if (!(sx === scale && sy === scale && sz === scale)) {
        out.sx = sx;
        out.sy = sy;
        out.sz = sz;
      }
    }
    return out;
  };

  const normalizePrimitiveParams = (primitive, params) => {
    const defaults = PRIMITIVE_PARAM_DEFAULTS[primitive] || PRIMITIVE_PARAM_DEFAULTS.box;
    const src = isObject(params) ? params : {};
    const out = {};
    // Known keys: coerce to finite numbers (strings like solidType pass through).
    Object.keys(defaults).forEach((key) => {
      const fallback = defaults[key];
      if (typeof fallback === 'number') out[key] = finite(src[key], fallback);
      else out[key] = typeof src[key] === typeof fallback ? src[key] : fallback;
    });
    // Extra keys survive (forward compat), with non-finite numbers dropped.
    Object.keys(src).forEach((key) => {
      if (key in out) return;
      const value = src[key];
      if (typeof value === 'number' && !Number.isFinite(value)) return;
      out[key] = value;
    });
    return out;
  };

  // Per-object cast-shadow override. `enabled: null` = inherit (the object casts,
  // matching the legacy default); `true` = force cast; `false` = never cast. Kept
  // as its own sub-object so future per-object shadow style keys can join it.
  const normalizeObjectShadow = (shadow) => {
    const src = isObject(shadow) ? shadow : {};
    const enabled = src.enabled === true ? true : (src.enabled === false ? false : null);
    return { enabled };
  };

  // Per-object silhouette border (ctxbar Highlight flyout, ask #8). Default OFF
  // = zero extra ink, so a scene with no `border` block renders byte-identical.
  // When enabled, scene3d overstrokes the object's silhouette + boundary edges
  // proportional to `strength`; `penId` (null ⇒ inherit the edge pen) recolours
  // the emphasis passes.
  const normalizeObjectBorder = (border) => {
    const src = isObject(border) ? border : {};
    return {
      enabled: src.enabled === true,
      strength: clamp(finite(src.strength, 1), 0.25, 4),
      penId: (typeof src.penId === 'string' && src.penId) ? src.penId : null,
    };
  };

  // Per-object EMISSIVE group (Phase 7 — the sixth light type: a shape that
  // emits light). Default OFF ⇒ zero extra ink + zero contribution, so a scene
  // with no `emissive` block renders byte-identically. When enabled the object
  // (1) SELF-RENDERS a glow (outward radial burst / concentric halo rings, with
  // an optionally blank/bright core) and (2) acts as a co-located POINT LIGHT at
  // its own world centroid that shades every OTHER object (never itself).
  //   intensity  0..4  — the co-located point-light weight + glow scale;
  //   penId      null ⇒ inherit the object pen for the glow strokes;
  //   halo       'burst' (radial rays) | 'ring' (concentric circles) | 'none';
  //   haloCount  4..48  — burst ray count;
  //   haloRings  1..6   — concentric ring count (halo:'ring');
  //   coreBlank  bool   — leave the object's own surface fill blank (bright core).
  const EMISSIVE_HALOS = ['burst', 'ring', 'none'];
  const normalizeObjectEmissive = (emissive) => {
    const src = isObject(emissive) ? emissive : {};
    return {
      enabled: src.enabled === true,
      intensity: clamp(finite(src.intensity, 1), 0, 4),
      penId: (typeof src.penId === 'string' && src.penId) ? src.penId : null,
      halo: EMISSIVE_HALOS.includes(src.halo) ? src.halo : 'burst',
      haloCount: clamp(Math.round(finite(src.haloCount, 16)), 4, 48),
      haloRings: clamp(Math.round(finite(src.haloRings, 3)), 1, 6),
      coreBlank: src.coreBlank !== false,
    };
  };

  const normalizeShadow = (shadow) => {
    const src = isObject(shadow) ? shadow : {};
    return {
      shadowMode: src.shadowMode === 'inverse' ? 'inverse' : 'additive',
      shadowAngle: clamp(finite(src.shadowAngle, DEFAULT_SHADOW.shadowAngle), 0, 360),
      shadowDensity: clamp(finite(src.shadowDensity, DEFAULT_SHADOW.shadowDensity), 1, 100),
      shadowPenId: (typeof src.shadowPenId === 'string' && src.shadowPenId) ? src.shadowPenId : null,
      shadowLineType: STROKE_LINE_TYPES.includes(src.shadowLineType) ? src.shadowLineType : 'solid',
      shadowLayers: src.shadowLayers === true,
      shadowLayerCount: clamp(Math.round(finite(src.shadowLayerCount, DEFAULT_SHADOW.shadowLayerCount)), 2, 4),
      shadowFalloff: clamp(finite(src.shadowFalloff, DEFAULT_SHADOW.shadowFalloff), 0.2, 1),
      shadowAngleFollowsLight: src.shadowAngleFollowsLight === true,
    };
  };

  const normalizeObject = (obj, index, usedIds) => {
    if (!isObject(obj)) return null;
    const primitive = PRIMITIVES.includes(obj.primitive) ? obj.primitive : 'box';
    let id = typeof obj.id === 'string' && obj.id ? obj.id : '';
    if (!id || usedIds.has(id)) {
      let n = index + 1;
      while (!id || usedIds.has(id)) { id = `obj-${n}`; n += 1; }
    }
    usedIds.add(id);
    return {
      id,
      name: typeof obj.name === 'string' && obj.name ? obj.name : `Object ${index + 1}`,
      primitive,
      // CSG role: a 'hole' object subtracts inside a boolean group; every other
      // value (or absent) is a solid. A hole NOT in a boolean group is inert
      // (renders as a solid) — Scene3D.Boolean owns that semantics.
      role: obj.role === 'hole' ? 'hole' : 'solid',
      params: normalizePrimitiveParams(primitive, obj.params),
      transform: normalizeTransform(obj.transform),
      visibility: obj.visibility === 'xray' ? 'xray' : 'solid',
      shadow: normalizeObjectShadow(obj.shadow),
      border: normalizeObjectBorder(obj.border),
      emissive: normalizeObjectEmissive(obj.emissive),
    };
  };

  // Scene-tree Increment A — normalize ONE object3d leaf layer's params. An
  // object3d layer holds exactly one primitive PLUS its own Style + per-face
  // Style overrides (which live in the scene styleTable when composited). This
  // wraps `normalizeObject` (the object entry) and `normalizeStyle` (the layer
  // Style + each faceStyle) so an object3d layer normalizes IDENTICALLY to one
  // scene3d object — no new shapes. The absent-id case yields the stable
  // 'obj-1' (index 0), matching a fresh scene3d object.
  const normalizeObjectLayerParams = (p) => {
    const src = isObject(p) ? p : {};
    const obj = normalizeObject(src, 0, new Set());
    const faceStyles = {};
    if (isObject(src.faceStyles)) {
      Object.keys(src.faceStyles).forEach((key) => {
        faceStyles[key] = normalizeStyle(src.faceStyles[key]);
      });
    }
    return {
      id: obj.id,
      name: obj.name,
      primitive: obj.primitive,
      role: obj.role,
      params: obj.params,
      transform: obj.transform,
      visibility: obj.visibility,
      shadow: obj.shadow,
      border: obj.border,
      emissive: obj.emissive,
      style: normalizeStyle(src.style),
      faceStyles,
      // Polish P-B — per-object EdgeStyle override (null ⇒ inherit scene).
      edgeStyles: normalizeObjectEdgeStyles(src.edgeStyles),
    };
  };

  // Scene-tree Increment B — assemble ONE scene-group layer's render input by
  // COLLECTING its descendant object3d / booleanGroup3d layers back into exactly
  // today's normalized scene shape (objects[] / groups[] / styleTable), then
  // UNIONing them with any INLINE arrays still on the group. The result feeds the
  // UNCHANGED scene3d compositor — the collection reconstructs the same input a
  // monolith carries, so a scene group renders byte-identically to the monolith.
  //
  //   groupParams  the scene-group layer's params (camera / lights / ground /
  //                backdrop / tone / shadow / styleTable.scene / assets, plus any
  //                legacy inline objects[] / groups[]).
  //   collected    descendant descriptors in TREE (depth-first) order:
  //                { kind:'object',  id:<layerId>, params:<object3d layer params> }
  //                { kind:'boolean', id:<layerId>, params:<booleanGroup3d params>,
  //                                  children:[<child object3d layer ids>] }
  //                { kind:'light',   id:<layerId>, params:<sceneLight3d params> }
  //                { kind:'ground',  id:<layerId>, params:<sceneGround3d params> }
  //
  // The child LAYER id becomes the objectId (so meta.sceneTarget.objectId maps
  // straight to a tree layer — no lookup table). An object's Style routes to
  // styleTable.byObject[layerId] and each faceStyle to byFace[`${layerId}/${faceId}`]
  // — NOT styleTable.scene (that scene-scope slot stays the group's own default).
  // BACK-COMPAT: inline arrays come FIRST, collected children after; a group with
  // inline objects and ZERO children yields its params unchanged.
  //
  // Increment E — GROUND & LIGHTS as children:
  //   • light children APPEND to params.lights[] (in tree order), UNIONed after
  //     any inline lights — the child LAYER id is the light's stable id. A tree
  //     empties its inline lights so only the children count; a legacy monolith
  //     (inline lights, no light children) passes through unchanged.
  //   • a ground child sets params.ground = { enabled: true }. NO ground child ⇒
  //     the group's INLINE ground is kept: a tree pre-sets inline ground OFF (so
  //     deleting the ground child turns the ground off), while a legacy monolith
  //     keeps its inline ground ON (inline back-compat).
  const collectSceneParams = (groupParams, collected) => {
    const gp = isObject(groupParams) ? groupParams : {};
    const items = Array.isArray(collected) ? collected : [];
    const st = isObject(gp.styleTable) ? gp.styleTable : {};

    const objects = [];
    const groups = [];
    const byObject = { ...(isObject(st.byObject) ? st.byObject : {}) };
    const byFace = { ...(isObject(st.byFace) ? st.byFace : {}) };
    // Polish P-B — per-object EdgeStyle overrides collected by object id. Only an
    // object that actually overrides a class contributes an entry (inherit-scene
    // objects stay absent), so a scene with no overrides yields an empty map ⇒
    // the emit resolver falls straight through to the scene-wide table.
    const edgeStylesByObject = {};
    // Lights: inline (legacy) first, then child lights in tree order.
    const lights = [];
    (Array.isArray(gp.lights) ? gp.lights : []).forEach((l) => { if (isObject(l)) lights.push(l); });
    let groundChild = null; // last ground child wins (only one is ever added)

    // UNION the inline (legacy) arrays FIRST so a mixed scene keeps its inline
    // objects ahead of collected child layers, and an inline-only scene is a pass-
    // through (empty `collected` ⇒ objects/groups === the inline arrays).
    (Array.isArray(gp.objects) ? gp.objects : []).forEach((o) => { if (isObject(o)) objects.push(o); });
    (Array.isArray(gp.groups) ? gp.groups : []).forEach((g) => { if (isObject(g)) groups.push(g); });

    items.forEach((item) => {
      if (!isObject(item) || typeof item.id !== 'string') return;
      if (item.kind === 'light') {
        const lp = isObject(item.params) ? item.params : {};
        // The child LAYER id is the stable light id (identity contract, mirrors
        // objects) so selection + the gizmo map straight back to a tree layer.
        lights.push({ ...lp, id: item.id });
        return;
      }
      if (item.kind === 'ground') {
        groundChild = isObject(item.params) ? item.params : {};
        return;
      }
      if (item.kind === 'object') {
        const n = normalizeObjectLayerParams(item.params);
        objects.push({
          id: item.id,          // the LAYER id is the objectId (identity contract)
          name: n.name,
          primitive: n.primitive,
          role: n.role,
          params: n.params,
          transform: n.transform,
          visibility: n.visibility,
          shadow: n.shadow,
          border: n.border,
          emissive: n.emissive,
        });
        byObject[item.id] = n.style;
        if (n.edgeStyles) edgeStylesByObject[item.id] = n.edgeStyles;
        Object.keys(n.faceStyles || {}).forEach((fid) => {
          const full = fid.indexOf('/') >= 0 ? fid : `${item.id}/${fid}`;
          byFace[full] = n.faceStyles[fid];
        });
      } else if (item.kind === 'boolean') {
        const bp = isObject(item.params) ? item.params : {};
        groups.push({
          id: item.id,
          name: typeof bp.name === 'string' && bp.name ? bp.name : item.id,
          op: GROUP_OPS.includes(bp.op) ? bp.op : 'none',
          children: (Array.isArray(item.children) ? item.children : []).filter((c) => typeof c === 'string'),
        });
        byObject[item.id] = normalizeStyle(bp.style);
      }
    });

    const out = {
      ...gp,
      objects,
      groups,
      lights,
      styleTable: {
        scene: st.scene,
        byObject,
        byFace,
      },
    };
    // A ground child (enabled) turns the ground ON. Absent ⇒ keep the group's
    // INLINE ground (a tree pre-sets it OFF; a monolith keeps it as authored).
    if (groundChild) out.ground = { ...groundChild, enabled: groundChild.enabled !== false };
    // Polish P-B — attach the per-object EdgeStyle map ONLY when non-empty, so a
    // scene with no overrides carries no new key (byte-identical assembly).
    if (Object.keys(edgeStylesByObject).length) out.edgeStylesByObject = edgeStylesByObject;
    return out;
  };

  // Canonical group list: each group is { id: unique 'grp-<n>', name, op, children }.
  // `objectIds` is the Set of live object ids; dangling child ids are dropped and
  // every object may belong to at most ONE group (a later group's duplicate claim
  // loses). Order within `children` is preserved (it drives positional subtract).
  const normalizeGroups = (groups, objectIds) => {
    const src = (Array.isArray(groups) ? groups : []).filter(isObject);
    const usedGroupIds = new Set();
    // Pass 1 — assign every group a stable, unique id FIRST so a group may be
    // referenced as another group's child (nesting) regardless of source order.
    const withIds = src.map((group, index) => {
      let id = typeof group.id === 'string' && group.id ? group.id : '';
      if (!id || usedGroupIds.has(id)) {
        let n = index + 1;
        id = '';
        while (!id || usedGroupIds.has(id)) { id = `grp-${n}`; n += 1; }
      }
      usedGroupIds.add(id);
      return { group, id };
    });
    const groupIds = new Set(withIds.map((w) => w.id));
    // Pass 2 — validate children. A child may be an OBJECT id or a GROUP id
    // (nesting). Each id is claimed by at most one parent; a group is never its
    // own child; dangling / duplicate ids are dropped. Cycles that survive here
    // (A⊂B, B⊂A) are broken at resolve time by Scene3D.Boolean's `seen` guard.
    const claimed = new Set();
    const out = [];
    withIds.forEach(({ group, id }, index) => {
      const children = [];
      (Array.isArray(group.children) ? group.children : []).forEach((cid) => {
        if (typeof cid !== 'string') return;
        if (cid === id) return;                                    // no self-membership
        if (!objectIds.has(cid) && !groupIds.has(cid)) return;     // dangling id
        if (claimed.has(cid)) return;                              // already in another group
        claimed.add(cid);
        children.push(cid);
      });
      out.push({
        id,
        name: typeof group.name === 'string' && group.name ? group.name : `Group ${index + 1}`,
        op: GROUP_OPS.includes(group.op) ? group.op : 'none',
        children,
      });
    });
    return out;
  };

  const normalizeVec3 = (val, fallback) => {
    const src = isObject(val) ? val : {};
    return {
      x: finite(src.x, fallback.x),
      y: finite(src.y, fallback.y),
      z: finite(src.z, fallback.z),
    };
  };

  const normalizeLight = (light, index) => {
    const src = isObject(light) ? light : {};
    // A-15: type field is kept verbatim for unknown (future) light types so new
    // kinds round-trip without a format migration. v1 renders 'directional' (the
    // sun), 'ambient' (a constant fill), and the positional 'point'/'spot'
    // lights; unknown types shade as directional.
    const type = typeof src.type === 'string' && src.type ? src.type : 'directional';
    const out = {
      id: typeof src.id === 'string' && src.id ? src.id : (index === 0 ? 'sun' : `light-${index + 1}`),
      type,
      azimuth: finite(src.azimuth, DEFAULT_LIGHT.azimuth),
      elevation: finite(src.elevation, DEFAULT_LIGHT.elevation),
      // Per-light weight. Directional defaults to 1 (a lone sun stays exactly
      // Phase-2); ambient defaults to a soft 0.25 fill. Total intensity is
      // clamped to [0,1] downstream, so this can push/fill without overflow.
      intensity: clamp(finite(src.intensity, type === 'ambient' ? 0.25 : 1), 0, 4),
      castShadows: src.castShadows !== false,
    };
    // Positional lights carry a world position. A point/spot adds a linear
    // falloff range (a spot additionally its cone axis target + cone/penumbra
    // half-angles); an AREA light adds a physical `size` (extent) + `samples`
    // sub-sample count instead — it has no distance range (softness, not falloff).
    if (type === 'point' || type === 'spot' || type === 'area') {
      out.position = normalizeVec3(src.position, DEFAULT_LIGHT_POSITION);
      if (type === 'point' || type === 'spot') {
        out.range = Math.max(0, finite(src.range, DEFAULT_LIGHT_RANGE));
        if (type === 'spot') {
          out.target = normalizeVec3(src.target, DEFAULT_LIGHT_TARGET);
          out.coneAngle = clamp(finite(src.coneAngle, DEFAULT_CONE_ANGLE), 1, 89);
          out.penumbra = clamp(finite(src.penumbra, DEFAULT_PENUMBRA), 0, 45);
        }
      } else {
        out.size = clamp(finite(src.size, DEFAULT_AREA_SIZE), 10, 600);
        out.samples = clamp(Math.round(finite(src.samples, DEFAULT_AREA_SAMPLES)), 2, 16);
      }
    }
    return out;
  };

  const ladderFor = (n) => {
    const out = [];
    for (let i = 0; i < n; i++) out.push(Math.round(((i + 0.5) / n) * 100) / 100);
    return out;
  };
  const thresholdsFor = (n) => {
    const out = [];
    for (let i = 1; i < n; i++) out.push(Math.round((i / n) * 100) / 100);
    return out;
  };

  const normalizeTone = (tone) => {
    const src = isObject(tone) ? tone : {};
    // `bands` is a soft hint used ONLY to size fallbacks when the arrays are
    // absent. The ladder length is authoritative for the real band count.
    const bandsHint = clamp(Math.round(finite(src.bands, DEFAULT_TONE.bands)), 1, 4);
    let ladder = Array.isArray(src.ladder) && src.ladder.length
      ? src.ladder.map((c) => clamp(finite(c, 0), 0, 1))
      : ladderFor(bandsHint);
    let thresholds = Array.isArray(src.thresholds) && src.thresholds.length
      ? src.thresholds.map((t) => clamp(finite(t, 0), 0, 1))
      : thresholdsFor(bandsHint);
    // Reconcile the three length-coupled fields so the panel SegCtrl, the
    // threshold/coverage sliders, and Regions all agree. Trim/pad the thresholds
    // to exactly bands-1 ascending cut points so a legacy or hand-edited length
    // mismatch self-heals instead of desyncing the UI.
    const realBands = clamp(ladder.length, 1, 4);
    if (ladder.length > realBands) ladder = ladder.slice(0, realBands);
    if (thresholds.length > realBands - 1) thresholds = thresholds.slice(0, realBands - 1);
    while (thresholds.length < realBands - 1) {
      const i = thresholds.length + 1;
      thresholds.push(Math.round((i / realBands) * 100) / 100);
    }
    thresholds = thresholds.slice().sort((a, b) => a - b); // ascending
    const spec = isObject(src.specular) ? src.specular : {};
    return {
      enabled: src.enabled !== false,
      bands: realBands,
      thresholds,
      ladder,
      specular: {
        enabled: spec.enabled !== false,
        size: Math.max(0, finite(spec.size, DEFAULT_TONE.specular.size)),
      },
    };
  };

  const normalizeCamera = (camera) => {
    const src = isObject(camera) ? camera : {};
    return {
      projection: src.projection === 'perspective' ? 'perspective' : 'orthographic',
      yaw: finite(src.yaw, DEFAULT_CAMERA.yaw),
      pitch: finite(src.pitch, DEFAULT_CAMERA.pitch),
      roll: finite(src.roll, DEFAULT_CAMERA.roll),
      cameraDistance: Math.max(0, finite(src.cameraDistance, DEFAULT_CAMERA.cameraDistance)),
      focalLength: Math.max(1, finite(src.focalLength, DEFAULT_CAMERA.focalLength)),
      zoom: clamp(finite(src.zoom, 1), 0.05, 40),
    };
  };

  // Pure normalization: returns a NEW params object with every scene noun in
  // canonical shape. Non-scene keys (posX, scaleX, label, …) pass through.
  // `assets` is kept BY REFERENCE (content-hashed table; cloneLayerParams
  // ref-skips it, so normalization must not fork it either).
  const normalizeParams = (params) => {
    const src = isObject(params) ? params : {};
    const out = { ...src };
    out.sceneVersion = Math.max(1, Math.round(finite(src.sceneVersion, SCENE_VERSION)));
    out.seed = finite(src.seed, 0);
    const usedIds = new Set();
    // An ABSENT objects key (legacy/migrated payload) seeds a default box; an
    // EXPLICIT empty array is an intentionally emptied scene and stays empty —
    // otherwise deleting the last object silently resurrects Box 1 on regen.
    const hasObjectsKey = Array.isArray(src.objects);
    const objects = (hasObjectsKey ? src.objects : [])
      .map((obj, index) => normalizeObject(obj, index, usedIds))
      .filter(Boolean);
    out.objects = objects.length || hasObjectsKey
      ? objects
      : [normalizeObject({ primitive: 'box', name: 'Box 1' }, 0, usedIds)];
    // An ABSENT lights key (legacy/migrated payload) seeds a default sun; an
    // EXPLICIT empty array is an intentionally lightless scene (I4: remove the
    // sun) and stays empty — otherwise deleting the last light would silently
    // resurrect the sun on regen. Mirrors the objects contract above. A lightless
    // scene shades flat and casts no shadows: lightWorldDir/combinedIntensity and
    // the castShadows loop in scene3d.js all degrade gracefully on an empty list.
    const hasLightsKey = Array.isArray(src.lights);
    const lights = (hasLightsKey ? src.lights : [])
      .filter(isObject)
      .map((light, index) => normalizeLight(light, index));
    out.lights = lights.length || hasLightsKey ? lights : [{ ...DEFAULT_LIGHT }];
    out.tone = normalizeTone(src.tone);
    out.shadow = normalizeShadow(src.shadow);
    out.ground = { enabled: isObject(src.ground) ? src.ground.enabled !== false : true };
    out.backdrop = { enabled: isObject(src.backdrop) ? src.backdrop.enabled === true : false };
    out.camera = normalizeCamera(src.camera);
    out.groups = normalizeGroups(src.groups, new Set(out.objects.map((o) => o.id)));
    out.assets = isObject(src.assets) ? src.assets : {};
    out.styleTable = normalizeStyleTable(src.styleTable);
    // Per-edge-class EdgeStyle table (C-06). Attached ONLY when the scene carries
    // one, so a legacy/default scene keeps its exact serialized shape (and, since
    // every default is a no-op, its exact render). scene3d.js reads p.edgeStyles
    // defensively (absent ⇒ all defaults).
    if (isObject(src.edgeStyles)) out.edgeStyles = normalizeEdgeStyles(src.edgeStyles);
    return out;
  };

  // ── SCENE_MIGRATIONS[1] — the X-ray fold seed (v1 → v2). ───────────────────
  // X-ray used to FORCE dashed hidden edges. The fold hands that treatment to
  // edgeStyles.hidden, so a v1 x-ray object must carry a per-object hidden=dash
  // override or it would lose its dashes. The override is a NO-OP-meta flip
  // ({hiddenTreatment:'dash', pen:null, weightMm:null, dash:null}) ⇒ byte-identical.
  //
  // Handles BOTH scene shapes:
  //   • MONOLITH / scene-group inline objects[] — seeds params.edgeStylesByObject
  //     (the same per-object map the emit resolver reads); xrayHiddenEdges is
  //     resolved through the style cascade (byObject[id] whole-wins over scene).
  //   • a single object3d LEAF layer (top-level visibility/style/edgeStyles) —
  //     seeds params.edgeStyles.hidden directly.
  // Idempotent: an object that already carries a hidden override is left alone.
  const XRAY_HIDDEN_SEED = { hiddenTreatment: 'dash', pen: null, weightMm: null, dash: null };
  const resolveXrayHiddenEdges = (styleTable, id) => {
    const t = isObject(styleTable) ? styleTable : {};
    const byObj = isObject(t.byObject) ? t.byObject : {};
    // Whole-style-wins: byObject[id] if present, else the scene default.
    const style = isObject(byObj[id]) ? byObj[id] : (isObject(t.scene) ? t.scene : {});
    const sp = isObject(style.params) ? style.params : {};
    return sp.xrayHiddenEdges !== false; // default true = the old dashed behavior
  };
  const seedHidden = (existing) => ({
    ...(isObject(existing) ? existing : {}),
    hidden: { ...XRAY_HIDDEN_SEED },
  });
  const migrateXrayHiddenEdges = (params) => {
    const src = isObject(params) ? params : {};
    const out = { ...src };
    if (Array.isArray(src.objects)) {
      const byObject = { ...(isObject(src.edgeStylesByObject) ? src.edgeStylesByObject : {}) };
      let touched = false;
      src.objects.forEach((obj) => {
        if (!isObject(obj) || obj.visibility !== 'xray') return;
        const id = (typeof obj.id === 'string' && obj.id) ? obj.id : null;
        if (!id) return;
        if (isObject(byObject[id]) && isObject(byObject[id].hidden)) return; // idempotent
        if (!resolveXrayHiddenEdges(src.styleTable, id)) return; // xrayHiddenEdges:false ⇒ inherit
        byObject[id] = seedHidden(byObject[id]);
        touched = true;
      });
      if (touched) out.edgeStylesByObject = byObject;
    } else if (src.visibility === 'xray') {
      const alreadyHidden = isObject(src.edgeStyles) && isObject(src.edgeStyles.hidden);
      const sp = (isObject(src.style) && isObject(src.style.params)) ? src.style.params : {};
      if (!alreadyHidden && sp.xrayHiddenEdges !== false) {
        out.edgeStyles = seedHidden(src.edgeStyles);
      }
    }
    return out;
  };
  SCENE_MIGRATIONS[1] = migrateXrayHiddenEdges;

  // Scene migration chain (keyed on params.sceneVersion), then normalization.
  // Payloads NEWER than SCENE_VERSION load as-is (best-effort forward compat).
  const migrateScene = (params) => {
    let out = isObject(params) ? params : {};
    let version = Math.max(1, Math.round(finite(out.sceneVersion, 1)));
    while (version < SCENE_VERSION) {
      const step = SCENE_MIGRATIONS[version];
      if (typeof step === 'function') out = step(out) || out;
      version += 1;
    }
    return { ...out, sceneVersion: Math.max(version, SCENE_VERSION) };
  };

  // Engine import branch (sanitizeImportedParams → scene3d): migrate, then
  // normalize. Never throws; garbage in → canonical scene out.
  const sanitizeSceneParams = (params) => normalizeParams(migrateScene(params));

  const api = {
    SCENE_VERSION,
    PRIMITIVES,
    MAPPERS,
    GROUP_OPS,
    PRIMITIVE_PARAM_DEFAULTS,
    PRIMITIVE_CREATE_DEFAULTS,
    PRIMITIVE_SIZE_KEYS,
    PRIMITIVE_SIZE_RANGE,
    primitiveNominalSize,
    buildPrimitiveParams,
    EDGE_STYLE_CLASSES,
    HIDDEN_TREATMENTS,
    DEFAULT_TRANSFORM,
    DEFAULT_CAMERA,
    DEFAULT_TONE,
    DEFAULT_SHADOW,
    normalizeEdgeStyles,
    normalizeEdgeStyle,
    normalizeObjectEdgeStyles,
    normalizeTone,
    normalizeShadow,
    normalizeStyle,
    normalizeStyleTable,
    normalizeObjectLayerParams,
    collectSceneParams,
    normalizeGroups,
    normalizeParams,
    migrateScene,
    sanitizeSceneParams,
  };

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, { Params: api });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
