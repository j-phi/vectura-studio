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
  // v3 (Curved fill angle): Style > Hatch > Angle used to be IGNORED by the
  // chart-wrapped fill (Scene3D.SurfaceFill), so every curved primitive rendered
  // meridians no matter what the dial said — and the panel seeds a fresh hatch
  // at 45. Now that the angle is live, a saved scene storing 45 would silently
  // re-render as a helical wrap. SCENE_MIGRATIONS[2] pins fillAngle = 0 (the
  // meridian family) on the curved objects of a pre-v3 document, so it renders
  // BYTE-IDENTICALLY; new objects keep being born at 45.
  // v4 (Buckyball radius): a `solid` of family buckyball was built 13.1% SMALLER
  // than its stated Radius — Scene3D.Mesh.scaleMeshToRadius divided by a
  // Math.max(1, …)-floored circumradius, and the truncated icosahedron is the one
  // construction whose pre-scale circumradius (0.8685…) is below that floor, so
  // the divide was swallowed. With the mesh fixed, a saved buckyball would grow
  // ~15.1% on open. SCENE_MIGRATIONS[3] multiplies a pre-v4 buckyball's stored
  // radius by that same measured factor, so it renders BYTE-IDENTICALLY; new
  // buckyballs get the true radius.
  const SCENE_VERSION = 4;
  // Keyed by SOURCE version: SCENE_MIGRATIONS[n] upgrades an n payload to n+1.
  const SCENE_MIGRATIONS = {};

  // An unrecognized toneLaw id (a roster entry deleted after a document saved
  // it, or a hand-edited/corrupted file) is silently rewritten to 'ladder' by
  // clampStyleParam below — deliberately, so a document never fails to load.
  // But "silent" previously meant NO record at all: a future roster change
  // could quietly re-render every saved document carrying a since-removed id
  // with no way to notice. Warn ONCE per unknown id per session (not per path/
  // per frame — clampStyleParam runs on every style resolution) so a real
  // instance is observable without spamming the console.
  const WARNED_UNKNOWN_TONE_LAWS = new Set();
  const warnUnknownToneLaw = (id) => {
    if (WARNED_UNKNOWN_TONE_LAWS.has(id)) return;
    WARNED_UNKNOWN_TONE_LAWS.add(id);
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(`Vectura Scene3D: unknown toneLaw "${id}" — falling back to "ladder". `
        + 'This id is not in the current SCENE3D_TONE_LAWS roster (a saved document may '
        + 'predate a roster change, or the id may be hand-edited/corrupted).');
    }
  };

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

  // ── Rounded contour — which shapes are BORN with curved line output ───────
  // "Is this shape curved?" already has ONE answer in this repo:
  // `CURVED_FILL_PRIMITIVES` (defined below), the chart-wrapped set that routes
  // through SurfaceFill, gates the panel's Curves rows and gates
  // `Engine._applySceneCurveFinish`. This reads that set LIVE — never a copy —
  // and subtracts the one member whose CONTOUR is not actually round:
  //
  //   • `pyramid` is chart-wrapped (topoPyramid) but every face is FLAT and its
  //     base is a polygon, so its silhouette and its constant-height fill lines
  //     are made of real corners. Fitting them would round a corner that the
  //     mesh states exactly — the same regression a curved cube would be. It
  //     stays in the GATE (a user who asks for curves on a pyramid still gets
  //     them) and stays out of the DEFAULT.
  //   • `cylinder` and `cone` keep flat caps but their silhouettes and cap rims
  //     are circles, so they are rounded for this purpose.
  //   • A low-poly `sphere`/`ellipsoid` is faceted in the mesh but reads round;
  //     that is exactly what the fit is for.
  //
  // ONE set serves BOTH roles (Object tab ▸ Border lines, Style tab ▸ Fill
  // lines): the two exclusions above are properties of the SURFACE, not of the
  // kind of line drawn on it, so splitting them would only invite drift.
  const FLAT_FACED_CHART_PRIMITIVES = new Set(['pyramid']);
  const hasRoundedContour = (primitive) => (
    CURVED_FILL_PRIMITIVES.has(primitive) && !FLAT_FACED_CHART_PRIMITIVES.has(primitive)
  );

  // The line-finish keys a NEWLY CREATED rounded object is seeded with, and the
  // only two this seed ever writes. `curves` lives on the object3d leaf bag
  // (Border lines); `fillCurves` in that leaf's own `style.params` (Fill lines,
  // carried by StyleCascade). Smoothing / Simplify / Fidelity are deliberately
  // absent — a fit is exact, whereas those three trade the model away, so they
  // stay opt-in.
  //
  // This is a CREATION contract, exactly like PRIMITIVE_CREATE_DEFAULTS above:
  // nothing here is read while DESERIALIZING, and the resolution fallbacks in
  // Engine._applySceneCurveFinish still treat an absent key as off. A saved
  // document that never wrote these keys is therefore read exactly as it is
  // today, which is why this default needs no sceneVersion migration.
  const LINE_FINISH_CREATE_DEFAULTS = { curves: true, fillCurves: true };

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

  // ── SIZE_DISPLAY — the Geometry labels tell the truth ─────────────────────
  // PURE DISPLAY METADATA. Several Geometry rows in the object inspector named
  // a quantity the stored param is NOT: a torus's "Diameter" showed `sx`, but
  // the chart builds the ring at `major = 0.75·sx` and the tube at
  // `minor = 0.28·min(sy,sz)`, so an sx-80 torus is 125 mm across. The same
  // half-extent lie ran through cylinder/cone "Height", pyramid "Base"/"Height",
  // capsule "Length" and both torus-knot rows (a chart's `sy` is a HALF-height).
  //
  // Rather than rename the labels to awkward internal quantities, the labelled
  // number is CONVERTED: `to(stored, bag)` yields the quantity the label names
  // (a real world-mm measurement of the untransformed mesh), `from(shown, bag)`
  // converts an edit back to the stored param. Nothing here is read by a mesh
  // builder, by normalization, or by the swap size map — the stored params and
  // the emitted geometry of an existing object are untouched, which is what
  // makes this safe for every saved document.
  //
  // A row with NO entry is already honest (box/plane Width/Height/Depth are the
  // full extent; sphere/cylinder/cone/capsule "Radius" really is the radius;
  // ellipsoid/superellipsoid rows are semi-axes and are LABELLED "Radius X/Y/Z"
  // by the panel so they no longer read as bare axis names).
  //
  // Derivation (verified against real mesh bounding boxes in
  // tests/unit/scene-geometry-label-truth.test.js):
  //   cylinder/cone/pyramid  y extent = 2·sy          (charts use (v-0.5)·sy·2)
  //   pyramid                x extent = 2·sx          (unit-square perimeter)
  //   capsule                y extent = 2·max(r, sy), r = max(1, min(sx,sz))
  //   torus                  x/z extent = 2·(max(2, .75·sx) + minor)
  //                          y extent  = 2·minor, minor = max(1, .28·min(sy,sz))
  //   torusKnot              widest (z) extent = KNOT_SPAN·R + 2·tube,
  //                          R = max(2, .62·sx), tube = max(1, .24·min(sy,sz))
  //
  // Two conversions are NOT globally invertible because a `max()` floor binds:
  //   • torus Thickness — every sy ≤ 1/0.28 floors `minor` to 1, so they all
  //     display 2 mm. `from` returns the LARGEST preimage (1/0.28), which
  //     builds a byte-identical mesh, so the row is self-consistent instead of
  //     snapping back to a different number after a re-render.
  //   • capsule Length — a capsule with sy < r IS a sphere of radius r whose
  //     true length is 2r. `from` clamps to r for the same reason.
  // In both cases the clamped write is a no-op on the geometry (asserted).
  //
  // The knot's centreline span per unit R, for the hardcoded (p,q) = (2,3) knot
  // in Scene3D.Charts.topoTorusKnot. Numerically max(z)−min(z) of
  // r(t)=(2+cos3t)/2, z=r·sin2t — just under 2√2. The tube adds 2·tube there.
  // The knot is NOT axially symmetric (its x span is only 2.6822·R), so the row
  // is labelled "Span" (the widest measurement across) rather than "Diameter".
  const KNOT_SPAN = 2.82824744;
  const minOf = (bag, a, b) => Math.min(finite(bag[a], 20), finite(bag[b], 20));
  const torusMinor = (bag) => Math.max(1, minOf(bag, 'sy', 'sz') * 0.28);
  const knotTube = (bag) => Math.max(1, minOf(bag, 'sy', 'sz') * 0.24);
  const capsuleRadius = (bag) => Math.max(1, minOf(bag, 'sx', 'sz'));
  // A control that drives linked keys (a torus tube is sy AND sz) is edited as
  // ONE value, so the candidate `v` stands for the whole linked set.
  const doubled = (label, step) => ({
    label, step, to: (v) => 2 * finite(v, 0), from: (shown) => finite(shown, 0) / 2,
  });
  const SIZE_DISPLAY = {
    cylinder: { sy: doubled('Height', 1) },
    cone: { sy: doubled('Height', 1) },
    pyramid: { sx: doubled('Base', 1), sy: doubled('Height', 1) },
    capsule: {
      sy: {
        // `coupled` — this row's value depends on a SIBLING key, so the panel
        // re-renders the Geometry block after any dimension edit (a capsule's
        // Length floor moves with its Radius; a torus's outer Diameter grows
        // with its Thickness). Without it the sibling row reads stale.
        label: 'Length', step: 1, coupled: true,
        to: (v, bag) => 2 * Math.max(capsuleRadius(bag), finite(v, 0)),
        from: (shown, bag) => Math.max(capsuleRadius(bag), finite(shown, 0) / 2),
      },
    },
    torus: {
      sx: {
        label: 'Diameter', step: 1, coupled: true,
        to: (v, bag) => 2 * (Math.max(2, finite(v, 0) * 0.75) + torusMinor(bag)),
        from: (shown, bag) => Math.max(2, finite(shown, 0) / 2 - torusMinor(bag)) / 0.75,
      },
      sy: {
        label: 'Thickness', step: 0.5,
        to: (v) => 2 * Math.max(1, finite(v, 0) * 0.28),
        from: (shown) => Math.max(1, finite(shown, 0) / 2) / 0.28,
      },
    },
    torusKnot: {
      sx: {
        label: 'Span', step: 1, coupled: true,
        to: (v, bag) => KNOT_SPAN * Math.max(2, finite(v, 0) * 0.62) + 2 * knotTube(bag),
        from: (shown, bag) => Math.max(2, (finite(shown, 0) - 2 * knotTube(bag)) / KNOT_SPAN) / 0.62,
      },
      sy: {
        label: 'Thickness', step: 0.5,
        to: (v) => 2 * Math.max(1, finite(v, 0) * 0.24),
        from: (shown) => Math.max(1, finite(shown, 0) / 2) / 0.24,
      },
    },
  };
  // Labels for rows that are honest numbers under an AMBIGUOUS name. "X" says
  // nothing about whether it is a radius or a width; these are semi-axes, so
  // they are named the way the sphere's already-honest row is.
  const SIZE_LABEL = {
    ellipsoid: { sx: 'Radius X', sy: 'Radius Y', sz: 'Radius Z' },
    superellipsoid: { sx: 'Radius X', sy: 'Radius Y', sz: 'Radius Z' },
  };
  const sizeDisplay = (primitive, key) => {
    const row = SIZE_DISPLAY[primitive];
    return (row && row[key]) || null;
  };
  // True when ANY of this primitive's rows reads a sibling key, so an edit to
  // one dimension can change what another dimension DISPLAYS.
  const sizeDisplayCoupled = (primitive) => {
    const row = SIZE_DISPLAY[primitive];
    return !!row && Object.keys(row).some((k) => row[k].coupled === true);
  };
  const sizeLabel = (primitive, key, fallback) => {
    const conv = sizeDisplay(primitive, key);
    if (conv && conv.label) return conv.label;
    const row = SIZE_LABEL[primitive];
    return (row && row[key]) || fallback;
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
    shadowFalloff: 0.5,          // PENUMBRA SOFTNESS, UI label "Softness" (0.2..1).
                                 // NOT "density drop per layer" — that lever was
                                 // deleted by the fixed integer ladder (spec 2.3).
                                 // 0.2 = hard sun, umbra reaches the tip; 1.0 =
                                 // broad source, umbra dies inside the first third.
    shadowAngleFollowsLight: false, // orient hatch perpendicular to the light bearing
    shadowToneLaw: 'ladder',     // Fill Style (tone-law) applied to the shadow's
                                 // flat hatch — same roster/id space as
                                 // style.params.toneLaw, same 'ladder' fallback.
                                 // See shadows.js Shadows.toneLawApplies for which
                                 // mark classes actually change shadow geometry.
    shadowToneDepth: 0.75,       // 0..1. Blends the FLAT shadow's local ink density
                                 // from today's single scalar spacing (0) toward the
                                 // OBJECT's own tone ladder (Regions.band/coverageFor,
                                 // 1) keyed off distance from the caster's contact
                                 // point — nearest the object is darkest. Shipped ON
                                 // (0.75, not 0): the owner explicitly accepted that
                                 // every scene with a shadow changes appearance.
                                 // shadows.js's applyShadowToneGradient thins marks
                                 // via a keep-duty capped at 1 — the near-contact zone
                                 // can therefore never exceed today's density (no
                                 // flooding is possible at ANY depth), so 0.75 was
                                 // picked for a strongly-readable ramp (near/far ink
                                 // ratio ~2.3x measured on a clean synthetic footprint,
                                 // ~4.2-4.5x at 1.0) while keeping some margin below
                                 // the 1.0 extreme for the 40 non-hatch Fill Style
                                 // recipes this same thinning is applied to uniformly
                                 // in Stage 1 (S2 gives each its own class-honest
                                 // lever). Total ink at depth 0.75 is LOWER than at
                                 // depth 0 (thinning only ever removes ink), so this
                                 // default reduces plot time, it does not add to it.
                                 // See tests/unit/scene3d-shadow-tone-gradient.test.js.
                                 // 0 stays provably byte-identical to the pre-gradient
                                 // flat shadow (the explicit escape hatch).
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
  //
  // 'none' REPLACES the former 'keep' (Jay, 2026-08-09): "the keep highlight
  // choice should be changed to none and should represent no highlighting being
  // present at all. This means the lines must not break." So `none` is not a
  // treatment that draws something subtle — it is a total BYPASS of the
  // highlight and specular machinery. No ink is removed, thinned, re-spaced,
  // dashed, re-penned or re-tagged; the glint cap does not fire.
  //
  // COMPATIBILITY — silent alias, deliberately NOT a SCENE_MIGRATIONS step.
  // A migration is keyed to `formatVersion` and would need a version bump plus a
  // walker that visits `styleTable.scene`, every `byObject[*]` and every
  // `byFace[*]` to rewrite one string. The alias covers all three scopes (and
  // presets, and hand-edited params) at the single point where the value is
  // coerced, so a document saved with `keep` renders exactly as one saved with
  // `none` — which is what the rename means. Nothing structural changed, so
  // nothing needs versioning.
  const HIGHLIGHT_TREATMENTS = ['blank', 'none', 'dashed', 'dotted', 'sparse', 'altFill', 'burst', 'stippleOut'];
  const HIGHLIGHT_TREATMENT_ALIASES = { keep: 'none' };
  const normalizeHighlightTreatment = (value) => {
    const aliased = HIGHLIGHT_TREATMENT_ALIASES[value] || value;
    return HIGHLIGHT_TREATMENTS.includes(aliased) ? aliased : 'blank';
  };
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
      case 'highlightTreatment': return normalizeHighlightTreatment(value);
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
      // Surface-fill TONE LAW. The roster is owned by src/config/scene3d-tone-laws.js
      // so the UI, the generator and the normalizer cannot drift. Resolved lazily —
      // config loads before core, but the test runtime may not have it. A document
      // saved without `toneLaw` (an old scene, or a face override that predates the
      // control) resolves to 'ladder' here at normalization time — the same
      // silent-default reasoning HIGHLIGHT_TREATMENT_ALIASES uses above, and
      // deliberately NOT a SCENE_MIGRATIONS step: no structural shape changed.
      case 'toneLaw': {
        const R = (Vectura.SCENE3D_TONE_LAWS && Vectura.SCENE3D_TONE_LAWS.IDS) || null;
        if (typeof value === 'string' && (!R || R.indexOf(value) !== -1)) return value;
        // Warn only for a genuinely unrecognized id — not for the common
        // "no toneLaw set at all" case (undefined/''), which is the ordinary
        // default path for most layers and would spam every style resolution.
        if (typeof value === 'string' && value && R) warnUnknownToneLaw(value);
        return 'ladder';
      }
      // 'contFieldQuant' only — how many discrete gap sizes the field may use.
      case 'toneQuantLevels': return clamp(Math.round(finite(value, 128)), 4, 256);
      // 'contourFlow' only — which streamline family the rulings follow.
      case 'toneFlowMode': return value === 'grad' ? 'grad' : 'iso';
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
      // Border OFFSET (mm): how far the outline is drawn from the silhouette.
      // Negative = inward, positive = outward, 0 = ON the silhouette (legacy).
      // Declaration only — geometry/UI land elsewhere; this key merely
      // normalizes and clamps so downstream consumers can rely on its shape.
      offset: clamp(finite(src.offset, 0), -2, 2),
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
      // Reuses the exact `toneLaw` clamp `style.params.toneLaw` goes through
      // (single choke point, no drift) — unknown/absent id resolves to 'ladder'.
      shadowToneLaw: clampStyleParam('toneLaw', src.shadowToneLaw),
      shadowToneDepth: clamp(finite(src.shadowToneDepth, DEFAULT_SHADOW.shadowToneDepth), 0, 1),
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
  // Does this child's params bag DECLARE a style of its own? Only a real mapper
  // string counts — `undefined`, `{}` and `{penId,params}` all mean "not styled".
  //
  // The byObject slot must stay ABSENT for an unstyled child. `normalizeStyle`
  // turns a missing bag into `{penId:null, mapper:'none', params:{}}`, and
  // publishing THAT into byObject makes it BEAT styleTable.scene in the
  // whole-style-wins cascade (byFace > byObject > scene, no per-field merge) —
  // so a scene styled `hatch` rendered an unstyled child as a bare unfilled
  // outline (sceneFace + sceneEdge, sceneFill 0) while ground cast shadows, which
  // never read the object's style, kept rendering. Same failure shape 5cfdbeb
  // fixed for expansion, reached instead by loading a `.vectura` whose object3d
  // child has no `style`. Leaving the slot absent restores the documented
  // fall-through to the scene default.
  //
  // No UI-created child is affected: addObjectToScene seeds ALGO_DEFAULTS
  // .object3d.style (mapper 'wireframe'), Convert-to-Scene seeds 'hatch', and
  // expandMonolithToTree materializes a whole resolved style. An explicit
  // mapper:'none' is a real user choice and still publishes.
  const declaresStyle = (params) => {
    const s = isObject(params) ? params.style : null;
    return !!(isObject(s) && typeof s.mapper === 'string' && s.mapper);
  };

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
        if (declaresStyle(item.params)) byObject[item.id] = n.style;
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
        // Same inherit-when-unstyled rule as an object3d child.
        if (declaresStyle(bp)) byObject[item.id] = normalizeStyle(bp.style);
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

  // ── SCENE_MIGRATIONS[2] — the curved fill-angle pin (v2 → v3). ─────────────
  // Scene3D.SurfaceFill listed `fillAngle` in its opts contract but never READ
  // it: every chart-wrapped primitive was hard-wired to the meridian family, so
  // the Angle dial did nothing on a sphere/cylinder/torus/… The panel seeds a
  // fresh hatch at 45, so essentially every saved scene STORES 45 while
  // RENDERING meridians. With the angle live, those documents would open as a
  // helical wrap. This pins them to 0 — the meridian family — so a pre-v3
  // document renders byte-identically, while anything created at v3 keeps 45.
  //
  // SCOPE (measured, not assumed — a spy on SurfaceFill.buildObject over every
  // primitive × mapper):
  //   • CURVED_FILL_PRIMITIVES are the only primitives scene3d.js charts
  //     (TOPOFORM_MODES → SurfaceFill.chartFor). box / plane / solid (which
  //     covers polyhedra AND solidType:'importedMesh') never reach SurfaceFill
  //     and always honoured the angle — pinning them would corrupt a document
  //     that was already correct.
  //   • Only 'hatch' and 'crosshatch' read fillAngle inside SurfaceFill.
  //     contour / spiral / stipple are charted too but have no Angle control,
  //     and their output is provably identical at 0 and 45 — left alone.
  //   • An ABSENT fillAngle is NOT 0: scene3d.js reads finite(sp.fillAngle, 45),
  //     so an inherited-default hatch renders at 45 too and must be pinned. (The
  //     shipped `scene3d-studio-shadows` preset is exactly that case.)
  //   • Every angle ≡ 0 (mod 180) already takes the legacy axis emitters, so an
  //     object at 0 or 180 needs no change — which is also what makes the
  //     migration idempotent (re-running finds every curved style at 0).
  //
  // A CSG child is deliberately NOT special-cased: the assembly borrows the
  // primary object's id, and scene3d.js looks that id up in the ORIGINAL
  // objects, so a carve whose primary is curved IS surface-filled (verified with
  // the same spy) and must be pinned like any other curved object.
  const CURVED_FILL_PRIMITIVES = new Set([
    'sphere', 'ellipsoid', 'cylinder', 'cone', 'torus', 'torusKnot',
    'capsule', 'superellipsoid', 'pyramid',
  ]);
  const ANGLED_FILL_MAPPERS = new Set(['hatch', 'crosshatch']);
  // scene3d.js: `const angleDeg = finite(sp.fillAngle, 45)`.
  const LEGACY_FILL_ANGLE = 45;
  const rendersMeridians = (angle) => {
    const a = finite(angle, LEGACY_FILL_ANGLE);
    return (((a % 180) + 180) % 180) === 0;
  };
  // Returns a PINNED clone of `style`, or null when the style needs no change
  // (wrong mapper, no style at all, or already on the meridian axis). The clone
  // is whole — StyleCascade resolves whole-style-wins, so materializing an
  // object override out of the scene style must copy penId/mapper too.
  const pinCurvedFillAngle = (style) => {
    if (!isObject(style)) return null;
    if (!ANGLED_FILL_MAPPERS.has(style.mapper)) return null;
    const sp = isObject(style.params) ? style.params : {};
    if (rendersMeridians(sp.fillAngle)) return null;
    return { ...style, params: { ...sp, fillAngle: 0 } };
  };
  const migrateCurvedFillAngle = (params) => {
    const src = isObject(params) ? params : {};
    // MONOLITH / scene-group shape: inline objects[] + styleTable.
    if (Array.isArray(src.objects)) {
      const curved = new Set();
      src.objects.forEach((o) => {
        if (isObject(o) && typeof o.id === 'string' && CURVED_FILL_PRIMITIVES.has(o.primitive)) curved.add(o.id);
      });
      if (!curved.size) return src;
      const table = isObject(src.styleTable) ? src.styleTable : {};
      const sceneStyle = isObject(table.scene) ? table.scene : null;
      const byObject = { ...(isObject(table.byObject) ? table.byObject : {}) };
      const byFace = { ...(isObject(table.byFace) ? table.byFace : {}) };
      let touched = false;
      // Object scope: pin an existing override in place; an object that INHERITS
      // the scene style is materialized as its own override, so the pin never
      // drags the scene's faceted objects to 0 with it.
      curved.forEach((id) => {
        const pinned = pinCurvedFillAngle(isObject(byObject[id]) ? byObject[id] : sceneStyle);
        if (pinned) { byObject[id] = pinned; touched = true; }
      });
      // Face scope: byFace wins over byObject, so each face override on a curved
      // object carries its own angle and needs its own pin.
      Object.keys(byFace).forEach((key) => {
        const slash = key.indexOf('/');
        if (slash < 0 || !curved.has(key.slice(0, slash))) return;
        const pinned = pinCurvedFillAngle(byFace[key]);
        if (pinned) { byFace[key] = pinned; touched = true; }
      });
      if (!touched) return src;
      return { ...src, styleTable: { ...table, byObject, byFace } };
    }
    // LEAF object3d layer shape: params.primitive + params.style / faceStyles.
    // collectSceneParams routes a leaf's own style straight to byObject[layerId],
    // so a tree object never inherits the group's scene style — the leaf's own
    // bag is the whole story.
    if (CURVED_FILL_PRIMITIVES.has(src.primitive)) {
      let touched = false;
      const out = { ...src };
      const pinned = pinCurvedFillAngle(src.style);
      if (pinned) { out.style = pinned; touched = true; }
      if (isObject(src.faceStyles)) {
        const faceStyles = { ...src.faceStyles };
        Object.keys(faceStyles).forEach((key) => {
          const p = pinCurvedFillAngle(faceStyles[key]);
          if (p) { faceStyles[key] = p; touched = true; }
        });
        if (touched) out.faceStyles = faceStyles;
      }
      return touched ? out : src;
    }
    return src;
  };
  SCENE_MIGRATIONS[2] = migrateCurvedFillAngle;

  // ── SCENE_MIGRATIONS[3] — the buckyball radius correction (v3 → v4). ───────
  // Scene3D.Mesh.scaleMeshToRadius used to divide by meshBounds().maxRadius,
  // which is floored at Math.max(1, …) for the twist deformer's benefit. The
  // truncated icosahedron is the ONLY solid whose pre-scale circumradius sits
  // below that floor (its vertices are the 1/3 points of a UNIT icosahedron's
  // edges ⇒ 0.8685…), so the divide was clamped away and a buckyball came out at
  // 0.8685 · Radius — 13.1% under its stated size, and 13.1% under what the
  // (now honest) Geometry > Radius row claims. Every other family is exact:
  // the duals (dodecahedron / goldberg) normalize onto the unit sphere before
  // scaling, and nothing else calls scaleMeshToRadius at all. (Verified across
  // all 16 families — only buckyball's vertices move.)
  //
  // With the mesh fixed, a saved buckyball would silently grow ~15.1%
  // (1 / 0.8685). This scales its STORED radius by the same factor so the built
  // mesh is byte-identical to the one it renders today, while a buckyball
  // created at v4 gets its true circumradius.
  //
  // SCOPE — deliberately narrow:
  //   • primitive 'solid' AND solidType 'buckyball' only. An absent solidType
  //     IS a buckyball: PRIMITIVE_PARAM_DEFAULTS.solid.solidType is 'buckyball'
  //     and buildSolidBaseMesh falls through to the truncated icosahedron, so a
  //     bag that omits the key rendered small too and must be corrected.
  //   • 'importedMesh' is explicitly NOT touched — it scales by `radius`
  //     directly and never routed through the clamped divide.
  //   • Every other solidType, and every non-solid primitive, is left alone.
  //   • An absent radius is materialized from PRIMITIVE_PARAM_DEFAULTS.solid
  //     (20) — the deserialization fill this migration runs *ahead* of — because
  //     that bag rendered at 0.8685 · 20 too.
  // Idempotency: the step is version-gated by migrateScene (it runs only while
  // version < 4 and the payload leaves at SCENE_VERSION), so re-sanitizing an
  // already-migrated scene never re-applies the factor. Asserted by test.
  const LEGACY_BUCKYBALL_SOLID_TYPE = 'buckyball';
  // MEASURED from the mesh, never hardcoded: Scene3D.Mesh derives it from the
  // raw truncated-icosahedron construction itself, so regenerating that base
  // mesh moves this factor with it. The literal is only a last-resort fallback
  // for a runtime where Scene3D.Mesh somehow did not load; it is the same
  // number, sqrt((5 + 4/sqrt5)/9), and a test pins the two together.
  const legacyBuckyballScale = () => {
    const Mesh = Vectura.Scene3D && Vectura.Scene3D.Mesh;
    const measured = Mesh && typeof Mesh.legacyTruncatedIcosahedronScale === 'function'
      ? Mesh.legacyTruncatedIcosahedronScale()
      : NaN;
    return Number.isFinite(measured) && measured > 0 ? measured : Math.sqrt((5 + 4 / Math.sqrt(5)) / 9);
  };
  // An ABSENT params bag is still a buckyball — normalization would fill it from
  // PRIMITIVE_PARAM_DEFAULTS.solid, which is a buckyball at radius 20, and that
  // bag rendered small too. An absent solidType likewise falls through to the
  // truncated icosahedron in buildSolidBaseMesh.
  const isLegacyBuckyball = (primitive, bag) => {
    if (primitive !== 'solid') return false;
    const type = isObject(bag) ? bag.solidType : undefined;
    return type === undefined || type === null || type === LEGACY_BUCKYBALL_SOLID_TYPE;
  };
  const shrinkBuckyballRadius = (bag) => {
    const src = isObject(bag) ? bag : {};
    const stored = finite(src.radius, PRIMITIVE_PARAM_DEFAULTS.solid.radius);
    return { ...src, radius: stored * legacyBuckyballScale() };
  };
  const migrateBuckyballRadius = (params) => {
    const src = isObject(params) ? params : {};
    // MONOLITH / scene-group shape: inline objects[], each with its own params bag.
    if (Array.isArray(src.objects)) {
      let touched = false;
      const objects = src.objects.map((obj) => {
        if (!isObject(obj) || !isLegacyBuckyball(obj.primitive, obj.params)) return obj;
        touched = true;
        return { ...obj, params: shrinkBuckyballRadius(obj.params) };
      });
      return touched ? { ...src, objects } : src;
    }
    // LEAF object3d layer shape: params.primitive + the params bag alongside it.
    if (isLegacyBuckyball(src.primitive, src.params)) {
      return { ...src, params: shrinkBuckyballRadius(src.params) };
    }
    return src;
  };
  SCENE_MIGRATIONS[3] = migrateBuckyballRadius;

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
    // The chart-wrapped (SurfaceFill) primitives — the set the v2→v3 fill-angle
    // migration owns, and the one place that answers "is this shape curved?".
    CURVED_FILL_PRIMITIVES,
    // "Does this shape have a ROUNDED CONTOUR?" — CURVED_FILL_PRIMITIVES minus
    // the flat-faced charts, and the one gate on the line-finish creation seed.
    FLAT_FACED_CHART_PRIMITIVES,
    hasRoundedContour,
    LINE_FINISH_CREATE_DEFAULTS,
    MAPPERS,
    GROUP_OPS,
    PRIMITIVE_PARAM_DEFAULTS,
    PRIMITIVE_CREATE_DEFAULTS,
    PRIMITIVE_SIZE_KEYS,
    PRIMITIVE_SIZE_RANGE,
    // Display/label truth for the Geometry rows (pure metadata — see above).
    SIZE_DISPLAY,
    SIZE_LABEL,
    sizeDisplay,
    sizeDisplayCoupled,
    sizeLabel,
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
