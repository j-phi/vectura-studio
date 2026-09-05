/**
 * scene3d algorithm — 3D Scene Studio Phase 1 orchestrator.
 *
 * Pipeline (spec §6): S1 assemble (Scene3D.Scene) → S2 project → S3 classify
 * edges (Scene3D.Edges) → S6 visibility (Scene3D.HLR flat-face fast path,
 * Scene3D.Depth fallback) → emit paths stamped with the CONTRACT B meta
 * channel (kind sceneFace/sceneEdge/sceneFill + sceneTarget + penId).
 *
 * Style resolution routes through Vectura.Scene3D.StyleCascade (CONTRACT C,
 * owned by stream 1B) when present; a neutral { penId: null, mapper: 'none' }
 * fallback keeps this stream self-sufficient. Phase 1 mappers: none | hatch |
 * wireframe.
 *
 * Determinism (A-17): no randomness anywhere — the same params + bounds
 * produce byte-identical output.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  const G3 = Vectura.Geometry3D;
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};

  const { finite, clamp, pathWithMeta, markHidden, hatchPolygon,
    v, add, sub, mul, dot, cross, normalize,
    strokeTreatment, applyStrokeTreatment, overstrokeCopy, NO_STROKE_TREATMENT } = G3;

  // Support-plane depth is exact, so the anti-z-fight bias can sit just above
  // fp/perspective-fit noise. A large bias grows "whisker" stubs where hidden
  // edges leave a silhouette corner (the covering face's plane depth converges
  // to the edge's own depth there). The depth-buffer fallback floors this to
  // 0.5 internally (quantized cells need the headroom).
  const HLR_BIAS = 0.05;
  // Emission floor (document mm): visibility crumbs shorter than this draw as
  // dots at best on a plotter and are usually corner-transition artifacts.
  const MIN_RUN_MM = 0.6;
  // F7 — analytic self-occlusion Z margin (document mm), torus only. The
  // occluder here is `Scene3D.TorusOcclusion`'s exact closed-form surface
  // (zero tessellation error), so this is NOT absorbing occluder noise the
  // way `hlr.js`'s mesh-based `SELF_OCCLUDE_BIAS` (6mm) has to — it exists
  // to reject a SHALLOW false positive: a self-crossing decorative law
  // ('onePenDown') chains one long ribbon across most of the visible
  // surface, and even a couple of millimetres of dilation-found "nearer"
  // surface at ONE sample along that chain is enough to fragment its single
  // CLS_WALLS-classified stretch into pieces too short to classify at all
  // (`stats.wallRings` measured 0, "ribbons degenerated to bare
  // centrelines" — a FAILURE dressed as a pass). Every GENUINE self-
  // occlusion crossing measured on this fixture (the torus's near tube wall
  // hiding its own far wall through the inner hole) has a real depth gap of
  // 20mm or more — nowhere close to this margin — so raising it clears the
  // shallow false positive without weakening real detection at all.
  // Measured: `onePenDown` recovers `wallRings > 0` at margin >= ~10mm and
  // stays recovered through 15; margins tried below that (0.5-6mm, matching
  // `dilateRadiusMm` below) all measured `wallRings === 0` for `onePenDown`
  // regardless of radius — see `scene3d-ribbon-wall-coverage.test.js`'s own
  // header for the full margin/radius/survivors/coverage/wallRings curve.
  const TORUS_SELF_OCCLUDE_ANALYTIC_MARGIN_MM = 15;
  // 2D (screen mm) dilation radius for the SAME analytic test — see
  // `Scene3D.TorusOcclusion.buildSelfOcclusionTest`'s own header for why a Z
  // margin alone is not enough near the inner-hole cusp (steep local
  // foreshortening there means a fraction-of-a-mm lateral shift can put a
  // ray from "misses the near sheet entirely" to "30+ mm behind it"). This
  // is the knob that actually governs F7 survivor detection (the margin
  // above is deliberately decoupled and much larger); measured smallest
  // value that still reaches 0/0 survivors on
  // `scene3d-ribbon-f7-self-occlusion.test.js` — 1-2mm miss real survivors,
  // 3mm is the first value that catches all of them.
  const TORUS_SELF_OCCLUDE_DILATE_RADIUS_MM = 3;
  // ── §0 — A FACET IS RULED, NOT MERELY MARKED ───────────────────────────────
  // The fewest rulings that read as a FILL rather than as bare paper with a line
  // on it. Two parallel lines are a stripe; the third is the first that gives
  // the facet an interior. Consumed only by the carrier-family grant in
  // `faceHatchLines`, and always bounded above by the facet's own
  // `Regions.formCeiling(zone)`, so it can lighten no zone past a darker one and
  // can never fire on a facet Density has already ruled. See the grant.
  const FACET_MIN_RULINGS = 3;

  const runLength = (pts) => {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return len;
  };

  // ── CtS I5 — depth-slice ('contourSlice') geometry + budgets ────────────────
  // Slice an assembled mesh with parallel planes (topographic cross-sections),
  // mirroring topoform's trianglePlaneSegment cut math (topoform.js:132-147) but
  // generalized to an arbitrary plane orientation and working directly in WORLD
  // space, so every cut point projects to an EXACT camera depth for HLR.
  //
  // Anti-hang backstop ONLY: slicing by N planes costs triCount × planes cheap
  // world-space cuts. This cap is set high enough that it NEVER bites at
  // primitiveDetail ≤ 100 (a detail-100 topoform is ~40k faces ≈ 80k tris; even
  // at the max 120 planes that is ~9.6M cuts, well under the budget) — so the
  // effective plane count stays a pure function of sliceCount. It exists only to
  // stop a truly pathological (programmatic, out-of-slider-range) detail from
  // hanging. The real render cost is the HLR clip work, bounded in the pass.
  const SLICE_TRI_BUDGET = 24000000;

  // buildSliceSegments({ world, faces, front?, sliceCount, sliceRotate, sliceTilt })
  //   world       [{x,y,z}]  world-space vertices (record.world)
  //   faces       [[i,j,k…]] index faces (record.faceIndexArrays); quads+ fan
  //   front       [bool]     per-face front flag (record.faces[i].front), 1:1
  //   sliceCount             plane count (clamped 2..120, then arithmetic-capped)
  //   sliceRotate/Tilt (deg) plane orientation (topoform planeRotate/planeTilt)
  // Returns { segments: [{ a:{x,y,z}, b:{x,y,z}, front, plane }], planes }. Each
  // segment is tagged with its 1-based `plane` index so the caller can link the
  // per-triangle cuts of a single plane into continuous contour polylines (the
  // 2D linkSegments key is only unique WITHIN a plane). Pure + deterministic (no
  // RNG). A plane outside [minD,maxD] never crosses a face, so only in-range
  // planes emit segments.
  const buildSliceSegments = (opts = {}) => {
    const world = Array.isArray(opts.world) ? opts.world : [];
    const faces = Array.isArray(opts.faces) ? opts.faces : [];
    const front = Array.isArray(opts.front) ? opts.front : null;
    if (!world.length || !faces.length) return { segments: [], planes: 0 };
    let count = Math.max(2, Math.round(finite(opts.sliceCount, 26)));
    // Plane normal = world +z after rotate(yaw:sliceRotate, pitch:sliceTilt),
    // matching rotatePoint's yaw→pitch order (geometry3d.js). Cutting on the
    // scalar d = v·N keeps the crossing point in world space (no inverse
    // rotation), so its projected depth is exact.
    const yr = (finite(opts.sliceRotate, 0) * Math.PI) / 180;
    const pr = (finite(opts.sliceTilt, 0) * Math.PI) / 180;
    const cy = Math.cos(yr); const sy = Math.sin(yr);
    const cp = Math.cos(pr); const sp = Math.sin(pr);
    const nx = -sy * cp; const ny = sp; const nz = cy * cp;
    const d = new Array(world.length);
    let minD = Infinity; let maxD = -Infinity;
    for (let i = 0; i < world.length; i++) {
      const w = world[i];
      const dv = w.x * nx + w.y * ny + w.z * nz;
      d[i] = dv;
      if (dv < minD) minD = dv;
      if (dv > maxD) maxD = dv;
    }
    let triCount = 0;
    for (let f = 0; f < faces.length; f++) triCount += Math.max(0, faces[f].length - 2);
    if (triCount > 0) {
      const planeCap = Math.max(2, Math.floor(SLICE_TRI_BUDGET / triCount));
      if (count > planeCap) count = planeCap;
    }
    const span = (maxD - minD) || 1;
    const segments = [];
    const edgeCross = (va, vb, dva, dvb, level, pts) => {
      const ea = dva - level;
      const eb = dvb - level;
      if (Math.abs(ea) < 1e-6) pts.push({ x: va.x, y: va.y, z: va.z });
      if (ea * eb < 0) {
        const t = Math.abs(ea) / (Math.abs(ea) + Math.abs(eb));
        pts.push({ x: va.x + (vb.x - va.x) * t, y: va.y + (vb.y - va.y) * t, z: va.z + (vb.z - va.z) * t });
      }
    };
    for (let level = 1; level <= count; level++) {
      const z = minD + (level / (count + 1)) * span;
      for (let f = 0; f < faces.length; f++) {
        const face = faces[f];
        const isFront = front ? front[f] !== false : true;
        // Fan-triangulate the (quad+) face; cut each triangle at z.
        for (let t = 1; t + 1 < face.length; t++) {
          const ia = face[0]; const ib = face[t]; const ic = face[t + 1];
          const pa = world[ia]; const pb = world[ib]; const pc = world[ic];
          if (!pa || !pb || !pc) continue;
          const pts = [];
          edgeCross(pa, pb, d[ia], d[ib], z, pts);
          if (pts.length < 2) edgeCross(pb, pc, d[ib], d[ic], z, pts);
          if (pts.length < 2) edgeCross(pc, pa, d[ic], d[ia], z, pts);
          if (pts.length < 2) continue;
          segments.push({ a: pts[0], b: pts[1], front: isFront, plane: level });
        }
      }
    }
    return { segments, planes: count };
  };

  // FIXED HLR work budget for the contourSlice pass, expressed in OCCLUDER-TESTS.
  // clipPath resamples each path every ~SLICE_SAMPLE_STEP mm and tests every
  // sample against every occluder face, so the true cost of clipping a path is
  // (pathLength / step) × occluders — NOT "one test per segment": a long linked
  // ring costs its length in samples (up to ~400 per straight span), so a naive
  // clip-CALL count undercounts by that per-clip sample factor. The pass tracks
  // this actual cost and, once the budget is spent, emits the remaining front
  // rings RAW (un-occluded) so every plane still draws — only occlusion fidelity
  // degrades on a pathological (detail > 100) density. The plane count is never
  // touched, so it stays a pure function of sliceCount (camera pose, occluder
  // count, other scene objects, and draft-vs-full never change it).
  const SLICE_SAMPLE_STEP = 2.5; // mirrors HLR SAMPLE_STEP (hlr.js)
  const SLICE_CLIP_WORK = 35000000;

  const Scene3DNS = (Vectura.Scene3D = Vectura.Scene3D || {});
  Scene3DNS.Slices = { buildSliceSegments };

  const FALLBACK_STYLE = { penId: null, mapper: 'none', params: {} };

  // Mappers that fill the SURFACE (vs 'none' = outlines, 'wireframe' = edges).
  // A surface fill replaces the face outline + creases with the treatment.
  // hatch/crosshatch are line fills handled in-plane; contour/spiral/stipple are
  // region fills delegated to Scene3D.Mappers on the projected region polygon.
  const SURFACE_FILL = new Set(['hatch', 'crosshatch', 'contour', 'spiral', 'stipple']);
  const REGION_MAPPERS = new Set(['contour', 'spiral', 'stipple']);
  // W-02 follow-up (drift guard) — the SAME five mappers are read by
  // `SCENE_FILL_STYLES.isReachableOn` (src/config/context-bar.js) via
  // `Vectura.Scene3D.Params.SURFACE_FILL_MAPPERS` (params.js), which used to be
  // an independently hand-copied literal with nothing pinning the two lists
  // equal. Exposing THIS Set (the engine's own dispatch gate, and now the
  // file's only literal copy — see the highlightCfg altFillMapper clamp below,
  // which used to declare a second one) gives params.js a live source to
  // mirror instead of a floating duplicate.
  //
  // W-21 reviewer follow-up — this used to hand out the LIVE `SURFACE_FILL`
  // Set itself, "read-only by convention" only: `Object.freeze` on a Set does
  // NOT intercept `.add`/`.delete` (they mutate an internal slot, not an own
  // property), so any external `.add`/`.delete` on the exported value quietly
  // corrupted every one of this file's five dispatch sites that read
  // `SURFACE_FILL.has(...)` directly. A read-only VIEW closes that: it forwards
  // `has`/`size`/iteration to the real Set but carries no `add`/`delete` of its
  // own, so calling either on the export throws `TypeError: ... is not a
  // function` instead of silently mutating engine dispatch.
  const readonlySetView = (set) => {
    const view = { has: (v) => set.has(v), get size() { return set.size; } };
    view[Symbol.iterator] = () => set[Symbol.iterator]();
    return Object.freeze(view);
  };
  Scene3DNS.SURFACE_FILL_MAPPERS = readonlySetView(SURFACE_FILL);

  // ── THE OBJECT PLOT FLOOR (§0 / C15) ───────────────────────────────────────
  //
  // No single OBJECT hatch family may rule closer than this multiple of the pen
  // width ON PAPER. Two different bounds want a say here and the floor has to
  // satisfy both; only one of them binds.
  //
  //   THE CRAFT RULE (§0). "Past roughly 1.2 x pen width you do not get darker
  //   by ruling closer, you get a flooded blob." That is a statement about wet
  //   ink, and it is where the constant's old value of 1.2 came from.
  //
  //   C15, which the old comment CITED but could not enforce. A single family
  //   at `mult x pen` covers `pen / (mult x pen)` = `1 / mult` of the paper, so
  //   at 1.2 its coverage is 0.8333 — and C15's clause is "a run of windows at
  //   D >= 0.80 is a breach". The floor legalised, by construction, a single
  //   family that breaches the criterion named on the line above it. (Round 9
  //   scorecard §4.2. Round 9 fixed WHERE the floor is measured; this fixes that
  //   its VALUE could not bind the thing it names.)
  //
  // THE VALUE. `1 / mult < 0.80` needs `mult > 1.25` STRICTLY — at exactly 1.25
  // the coverage is exactly 0.80, which is the breach threshold and not under
  // it, so the review's ">= 1.25" is off by the relation. And `criteria.md` §0
  // requires a bar to name its instrument: `pen / pitch` is an ideal quantity
  // closest to the boolean grid, and the browser raster reads 8-12 % higher on
  // the same drawing. C15's 0.80 names no instrument, so the floor clears it on
  // the worse one:
  //
  //     1 / 1.25 = 0.8000   breach outright
  //     1 / 1.40 = 0.7143   x 1.12 = 0.800  — lands ON the bar, no margin
  //     1 / 1.50 = 0.6667   x 1.12 = 0.747  — clear on both instruments
  //
  // 1.5 also satisfies the craft rule with room, since it is strictly wider than
  // 1.2. It enters as `Math.max(requestedPitch, mult x pen)`, so it can only
  // WIDEN a pitch: raising it can remove ink, never add it. At the shadow-
  // anatomy pen of 0.3 mm the floor is 0.45 mm against requested pitches of
  // ~2 mm, so it binds on nothing in this workstream and the change measures
  // zero — which is the point. A floor is not there to bind today; it is there
  // so that no scene CAN reach the breach.
  //
  // NOT to be confused with `PLOT_FLOOR_MULT` in `src/core/scene3d/shadows.js`,
  // which is the CAST SHADOW's floor and is explicitly protected.
  const PLOT_FLOOR_MULT_OBJ = 1.5;
  // Coverage of a single family at a given pen-width multiple. Pen-independent.
  const singleFamilyCoverage = (mult) => 1 / mult;

  const makeStyleResolver = (styleTable) => {
    const cascade = Vectura.Scene3D && Vectura.Scene3D.StyleCascade;
    const cache = new Map();
    return (objectId, faceId) => {
      const key = `${objectId}/${faceId}`;
      if (cache.has(key)) return cache.get(key);
      let style = FALLBACK_STYLE;
      if (cascade && typeof cascade.resolve === 'function') {
        try {
          style = cascade.resolve(styleTable, { objectId, faceId }) || FALLBACK_STYLE;
        } catch (err) {
          style = FALLBACK_STYLE;
        }
      }
      cache.set(key, style);
      return style;
    };
  };

  // Fold every CSG record's per-fragment source-attributed styles into a
  // NON-PERSISTENT clone of the style table, so a combined unit's fragments
  // resolve to their originating objects through the ordinary byFace cascade.
  // Keys are `${record.id}/${faceId}` — record.id is the primary the carve
  // borrows, faceId the unique `face:csg:<i>`, so entries never collide. Returns
  // the ORIGINAL table (same reference) when no record carries overrides, so the
  // common single-style case is byte-identical.
  const mergeCsgFaceStyles = (styleTable, records) => {
    const extra = {};
    let any = false;
    (records || []).forEach((r) => {
      const ov = r && r.faceStyleOverrides;
      if (!ov) return;
      Object.keys(ov).forEach((faceId) => { extra[`${r.id}/${faceId}`] = ov[faceId]; any = true; });
    });
    if (!any) return styleTable;
    const src = styleTable && typeof styleTable === 'object' ? styleTable : {};
    return { ...src, byFace: { ...(src.byFace || {}), ...extra } };
  };

  // fillDensity (0–500; UI ceiling raised 100→200→500 across three rounds)
  // → hatch spacing in document mm. Monotonic: denser in, tighter lines out.
  //
  // 0-100 is BYTE-IDENTICAL to the pre-rescale formula
  // (`Math.max(1, 14 - 0.13 * clamp(d, 0, 100))`) — existing saved artwork
  // must render unchanged, so that arm is untouched, just re-clamped at its
  // own boundary. It already floors at exactly 1mm at d=100 (14 - 0.13*100 =
  // 1), so the `Math.max(1, …)` there never actually engages within 0-100.
  //
  // 100-200 is untouched from the prior round: linearly continues the
  // descent from 1mm down to HATCH_SPACING_FLOOR_MM at d=200. That floor is
  // 0.3mm — below a typical plotter nib/fineliner width (≈0.3-0.5mm), so
  // tighter spacing only multiplies path count and draw time without adding
  // visible density; ink just re-covers the same groove. This is the honest
  // "meaningful" ceiling: past d≈200-220 the spacing is already finer than
  // most pens can resolve.
  //
  // 200-500 is new: the raised ceiling asks for more headroom than the
  // meaningful bound above actually has. Rather than silently plateau again
  // (the exact defect the two floors above were built to fix) OR pretend
  // sub-nib spacing is meaningful, this arm continues the SAME taper shape
  // one notch further, from 0.3mm down to HATCH_SPACING_FLOOR_EXT_MM
  // (0.18mm) at d=500. That is honestly a path-count/plot-time knob, not a
  // visible-tone knob — see the report this shipped with for the measured
  // density beyond which the drawing stops changing. `hatchPolygon`
  // (geometry3d.js) already hard-caps at 2000 lines per polygon regardless,
  // so this arm cannot runaway even at the extreme end.
  const HATCH_SPACING_FLOOR_MM = 0.3;
  const HATCH_SPACING_FLOOR_EXT_MM = 0.18;
  // The minSpacing floor to hand `hatchPolygon` for a given density: flat at
  // HATCH_SPACING_FLOOR_MM through the whole 0-200 range (unchanged — this is
  // what protects every existing d<=200 document), then follows the SAME
  // 200-500 taper `hatchSpacing` itself uses, so the floor never re-clamps
  // the value `hatchSpacing` just computed back upward.
  const hatchFloorFor = (density) => {
    const d = clamp(finite(density, 50), 0, 500);
    if (d <= 200) return HATCH_SPACING_FLOOR_MM;
    const t = (d - 200) / 300; // 0..1 across the new 200→500 span
    return HATCH_SPACING_FLOOR_MM - t * (HATCH_SPACING_FLOOR_MM - HATCH_SPACING_FLOOR_EXT_MM);
  };
  // fs-v2-facetedangle — the automatic tone-zone cross family's OWN floor.
  // `crossFamilies`'s dark-side second direction (`spacing / w`, w<=1) kept
  // the historic unconditional 1mm floor while family A above it got
  // `minSpacing` relief, so above Density 100 family A tightened past 1mm
  // while the cross family could not — the ink ratio between the two
  // families shifted with density and the AGGREGATE rendered bearing
  // drifted even though `fillAngle` never changed (11.0deg at d50, 4.1deg at
  // d150 on a box, fillAngle 20).
  //
  // Naively threading `hatchFloorFor` in unconditionally is NOT safe: unlike
  // family B's `crossDensityRatio` (which is the only thing that risks going
  // sub-1mm at d<=100, the reason THAT branch stays floored), this family's
  // `spacing` already comes out of `spacingBand` as `Math.max(penWidth,
  // s0/gain)`, and `gain` can exceed 1 (T-zone `coverageGain(0)`, up to
  // ~1.6) even at density <= 100 — so `spacing / w` can already sit under
  // 1mm in an EXISTING saved document at low density, same trap `minSpacing`
  // dodges elsewhere. So this is gated exactly like `curvedMasterFloorPen`
  // above (the curved path's analogous relief, same density boundary, same
  // reasoning): `undefined` for d<=100, so the option is OMITTED and
  // `hatchPolygon`'s own untouched 1mm default applies — byte-identical to
  // today, by construction. Only above 100 does it relax, and only to the
  // SAME floor family A already uses, so the two families move together and
  // the ratio stops drifting.
  const crossFloorFor = (density) => {
    const d = clamp(finite(density, 50), 0, 500);
    return d <= 100 ? undefined : hatchFloorFor(d);
  };
  const hatchSpacing = (density) => {
    const d = clamp(finite(density, 50), 0, 500);
    if (d <= 100) return Math.max(1, 14 - 0.13 * d);
    if (d <= 200) {
      const t = (d - 100) / 100; // 0..1 across the 100→200 span
      return 1 - t * (1 - HATCH_SPACING_FLOOR_MM);
    }
    return hatchFloorFor(d); // 200-500: the floor function IS the formula here
  };

  // ── CURVED-PATH DENSITY HEADROOM (I5 follow-up) ─────────────────────────────
  // `hatchSpacing` above fixed Density > 100 on FACETED primitives. Curved
  // primitives (sphere/torus/capsule/…) route through SurfaceFill's own
  // parametric master grid instead, and that grid floors its line-count pitch
  // at a SEPARATE constant, `PLOT_FLOOR_PEN` (2.2 × pen, declared in
  // surface-fill.js and duplicated here as CURVED_FLOOR_PEN_MAX for the same
  // "read together, not import" reason `MONO_PLOT_FLOOR_PEN` below is).
  // Measured: a sphere's line count went 27/61/61/61 across d=50/100/150/200
  // — flat above 100, because `tonePitch` (density's own signal) keeps
  // shrinking past d=100 while the floor it's clamped against does not, so
  // every Density above ~100 collapses onto the identical clamped pitch.
  //
  // The fix mirrors `hatchSpacing`'s own two-arm shape rather than just
  // swapping the constant for a lower one:
  //   0-100  → returns `undefined`, so SurfaceFill's `masterFloorPen` option
  //            is OMITTED and its committed 2.2×-pen default applies exactly
  //            as before. That floor ALREADY binds at d=100 today (tonePitch
  //            there is well under it), so lowering it for d<=100 would move
  //            existing saved artwork — the same trap `minSpacing` above
  //            dodges for the faceted crosshatch family.
  //   100-200 → linearly relaxes the multiplier down to CURVED_FLOOR_PEN_MIN
  //            = 1.2× pen, the bound surface-fill.js's own PLOT_FLOOR_PEN
  //            comment names as the point real ink floods (2.2× was always
  //            the STRICTER, conservative bar chosen there; 1.2× is the
  //            honest physical one). TAPERING the floor itself — not just
  //            lowering it once — is what keeps the line count strictly
  //            increasing all the way to d=200: a fixed lower floor, however
  //            low, still goes flat again the moment tonePitch dips under it
  //            a second time.
  // Threaded only into the ONE direct density→line-count SurfaceFill call
  // below. The curved crosshatch family-B count derives from family A's own
  // N by ratio (`count / crossRatio` in surface-fill.js), not by an
  // independent spacing/floor comparison, so there is no equivalent
  // "already-sub-floor in a saved document" risk to dodge for it the way
  // `minSpacing` has to for the faceted path's `spacing × crossDensityRatio`.
  const CURVED_FLOOR_PEN_MAX = 2.2; // == surface-fill.js's PLOT_FLOOR_PEN
  const CURVED_FLOOR_PEN_MIN = 1.2; // the "ink floods" bound, not the conservative one
  // 200-500 (fs-m1, ceiling raised again): 1.2x pen is ALREADY the point
  // surface-fill.js's own comment names as where real ink floods, so pushing
  // the master-grid floor lower still is past the honest physical limit —
  // it is not a tone knob any more, only a path-count knob, exactly like
  // `HATCH_SPACING_FLOOR_EXT_MM` above. Kept small (1.2 → 0.7x pen) and, same
  // as before, TAPERED rather than swapped to a single lower constant, so N
  // keeps climbing instead of re-flattening at a new plateau. `masterGrid`'s
  // own MASTER_MAX_LINES (420, surface-fill.js) is the hard backstop that
  // keeps this bounded regardless of how far density pushes.
  const CURVED_FLOOR_PEN_EXT_MIN = 0.7;
  const curvedMasterFloorPen = (density) => {
    const d = clamp(finite(density, 50), 0, 500);
    if (d <= 100) return undefined;
    if (d <= 200) {
      const t = (d - 100) / 100;
      return CURVED_FLOOR_PEN_MAX - t * (CURVED_FLOOR_PEN_MAX - CURVED_FLOOR_PEN_MIN);
    }
    const t = (d - 200) / 300; // 0..1 across the new 200→500 span
    return CURVED_FLOOR_PEN_MIN - t * (CURVED_FLOOR_PEN_MIN - CURVED_FLOOR_PEN_EXT_MIN);
  };

  // Strip the geometry-mutating part of a treatment, keeping only the line-type
  // dash. Edges and per-face outlines are DOUBLE-DRAWN (the face outline loop and
  // the silhouette/crease/boundary edge pass both emit the same structural edge);
  // wobbling only one copy would split them. So structural lines take dash only,
  // while sceneFill lines (unique, no double-draw) take the full wobble/overstroke.
  const dashOnly = (tr) => {
    if (!tr || (tr.wobble <= 0 && !tr.overstroke)) return tr;
    return {
      lineType: tr.lineType, dash: tr.dash, wobble: 0, wobbleScale: tr.wobbleScale,
      overstroke: false, amp: 0, active: Boolean(tr.dash),
    };
  };

  // The 2D boundary of a set of front faces = edges shared by exactly one face
  // in the set (interior edges appear twice and cancel). Returns [[p0,p1],…] in
  // projected 2D. This silhouette (outer rim + any holes) is what a continuous
  // surface hatch fills, via the even-odd rule below.
  const frontRegionBoundary = (record, faceIndices) => {
    const counts = new Map();
    const seg = new Map();
    faceIndices.forEach((fi) => {
      const idx = record.faceIndexArrays[fi];
      if (!Array.isArray(idx)) return;
      for (let e = 0, f = idx.length - 1; e < idx.length; f = e++) {
        const a = idx[f]; const b = idx[e];
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        counts.set(key, (counts.get(key) || 0) + 1);
        if (!seg.has(key)) seg.set(key, [a, b]);
      }
    });
    const out = [];
    counts.forEach((c, key) => {
      if (c !== 1) return;
      const [a, b] = seg.get(key);
      const pa = record.projected[a]; const pb = record.projected[b];
      if (pa && pb && Number.isFinite(pa.x) && Number.isFinite(pb.x)) {
        out.push([{ x: pa.x, y: pa.y }, { x: pb.x, y: pb.y }]);
      }
    });
    return out;
  };

  // Scanline hatch across the region bounded by `segments` (an arbitrary set of
  // 2D edges forming one or more closed loops), even-odd rule so holes stay
  // empty. Returns [[p0,p1],…]. Continuous across the whole surface, unlike
  // per-face hatching of a fine tessellation.
  //
  // `minSpacing` (optional, default 1 — the historic hard floor) lets a
  // density-driven caller ask for sub-1mm spacing. Every existing call site
  // omits it, so behavior is byte-identical unless a caller opts in.
  const hatchSegments = (segments, angleDeg, spacing, minSpacing) => {
    if (!segments.length) return [];
    const ang = finite(angleDeg, 45) * Math.PI / 180;
    const dirX = Math.cos(ang); const dirY = Math.sin(ang);
    const perpX = -dirY; const perpY = dirX;
    let pMin = Infinity; let pMax = -Infinity;
    segments.forEach(([a, b]) => {
      [a, b].forEach((p) => {
        const proj = p.x * perpX + p.y * perpY;
        if (proj < pMin) pMin = proj;
        if (proj > pMax) pMax = proj;
      });
    });
    if (!Number.isFinite(pMin)) return [];
    const sp = Math.max(Math.max(0, finite(minSpacing, 1)), spacing);
    const count = Math.min(3000, Math.floor((pMax - pMin) / sp));
    const out = [];
    for (let i = 1; i <= count; i++) {
      const offset = pMin + i * sp;
      const hits = [];
      segments.forEach(([a, b]) => {
        const pa = a.x * perpX + a.y * perpY;
        const pb = b.x * perpX + b.y * perpY;
        if ((pa > offset) === (pb > offset)) return;
        const t = (offset - pa) / ((pb - pa) || 1e-9);
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        hits.push({ s: x * dirX + y * dirY, x, y });
      });
      hits.sort((p, q) => p.s - q.s);
      // Even-odd: fill between hit pairs (0-1, 2-3, …).
      for (let k = 0; k + 1 < hits.length; k += 2) {
        out.push([{ x: hits[k].x, y: hits[k].y }, { x: hits[k + 1].x, y: hits[k + 1].y }]);
      }
    }
    return out;
  };

  const sceneTargetMeta = (objectId, face, edgeClass, depthZ, occluded) => {
    const normal = (face && face.normalWorld) || { x: 0, y: 0, z: 1 };
    return {
      objectId,
      faceId: face ? face.faceId : null,
      edgeClass: edgeClass || null,
      depth: -finite(depthZ, 0), // CONTRACT B: bigger = farther (camera z is bigger = nearer)
      normal: { x: normal.x, y: normal.y, z: normal.z },
      facingUp: normal.y > 0.7,
      occluded: Boolean(occluded),
    };
  };

  // NOTE (F6c, reverted): a closed-form ray/torus self-occlusion depth
  // source (src/core/scene3d/ray-torus.js, kept — see its own test file) was
  // wired in here and tried at two scopes:
  //   1. Applied broadly (every `seg.selfOcclude` call, matching the mesh
  //      bias's own reach): measurably reduced far-sheet survivors in the
  //      independent oracle test but mass-misfired on ordinary ribbon OUTLINE
  //      vertices (roughly a third of all sampled surface points), visibly
  //      fragmenting the whole hatched surface — a regression.
  //   2. Scoped to ONLY SurfaceFill's pre-split `selfOcclusionTest` callback
  //      (exact chart centreline samples, where a tight epsilon is valid):
  //      safe, zero test/visual regressions, but had NO measurable visual
  //      effect on the reported stray dash — confirmed via matched-camera
  //      before/after renders (pixel diff confined to antialiasing noise).
  // Root cause of (1): a ribbon outline vertex sits OFF the true analytic
  // surface by up to ~2.3mm (the ribbon's own half-width/rounding — not a
  // defect), while a genuine cusp occlusion can be as small as ~0.05mm of
  // depth margin on this fixture. Those ranges OVERLAP, so no single
  // z-margin epsilon can separate "harmless outline offset" from "real
  // self-occlusion" at the post-hoc-clip layer, and (2) alone isn't where
  // the visible bug lives. Reverted per this task's own instruction: a
  // disclosed non-fix beats a partial one left in the tree. See the report
  // for the full diagnosis.

  window.Vectura.AlgorithmRegistry.scene3d = {
    generate: (params = {}, rng, noise, bounds = {}) => {
      const Params = Vectura.Scene3D.Params;
      const Scene = Vectura.Scene3D.Scene;
      const Edges = Vectura.Scene3D.Edges;
      const HLR = Vectura.Scene3D.HLR;

      const p = Params.normalizeParams(params);
      const scene = Scene.assembleScene(p, bounds);
      // Per-fragment CSG styling: a combined carve borrows the primary solid's
      // id, so each fragment's source-attributed style (Scene3D.Boolean) is
      // merged into a NON-PERSISTENT byFace clone keyed `${primaryId}/${faceId}`.
      // resolveStyle then routes every fragment (faces, edges, x-ray, highlight)
      // to its originating object's style through the ordinary cascade. When no
      // record carries overrides the clone is skipped and p.styleTable is used
      // verbatim (byte-identical single-style path).
      const styleTable = mergeCsgFaceStyles(p.styleTable, scene.objects);
      const resolveStyle = makeStyleResolver(styleTable);
      const out = [];

      // ── Per-edge-class EdgeStyle (C-06). p.edgeStyles maps each class
      // (silhouette/crease/boundary/interior/hidden) → { pen, weightMm, dash[,
      // hiddenTreatment] }. Absent / all-default ⇒ every overlay below is null ⇒
      // byte-identical output. weightMm is expressed against the layer's base pen
      // width (bounds.penWidth, 0.3mm fallback) and rides the SAME tested
      // meta.weightScale path the silhouette-emphasis passes use.
      const EDGE_REF_WIDTH = finite(bounds && bounds.penWidth, 0.3);
      // Polish P-B + X-ray fold — per-object override resolves PER FIELD, not
      // whole-class: each field is objectOverride[field] ?? sceneEdgeStyle[field]
      // ?? null (pen / weightMm / dash, plus hiddenTreatment for the hidden class),
      // resolved INDEPENDENTLY. So an object that overrides only ONE field inherits
      // the scene class's other fields — and, critically, the X-ray fold's migrated
      // hidden seed (which sets ONLY hiddenTreatment='dash', leaving pen/weightMm/
      // dash null) still inherits the scene hidden class's pen/weight/dash OVERLAY,
      // reproducing pre-fold x-ray byte-for-byte. An object that overrides nothing
      // falls straight through to the scene class (or null). p.edgeStylesByObject
      // (assembled by collectSceneParams) keeps ONLY the classes an object touched.
      const edgeStyleFor = (cls, objectId) => {
        const byObj = p.edgeStylesByObject;
        const ov = (objectId && byObj && byObj[objectId]) ? byObj[objectId][cls] : null;
        const t = p.edgeStyles;
        const base = (t && t[cls]) || null;
        if (!ov) return base;
        if (!base) return ov;
        const pick = (k) => (ov[k] != null ? ov[k] : (base[k] != null ? base[k] : null));
        const merged = { pen: pick('pen'), weightMm: pick('weightMm'), dash: pick('dash') };
        if (cls === 'hidden') merged.hiddenTreatment = ov.hiddenTreatment || base.hiddenTreatment || 'drop';
        return merged;
      };
      // Build a meta overlay (penId / weightScale / strokeDash) from an EdgeStyle,
      // or null when the style is a pure no-op. penId overrides the object pen;
      // weightScale/strokeDash are honored by the renderer + SVG export.
      const edgeStyleMeta = (es) => {
        if (!es) return null;
        const m = {};
        if (es.pen) m.penId = es.pen;
        if (es.weightMm != null) {
          const ws = clamp(es.weightMm / (EDGE_REF_WIDTH || 0.3), 0.1, 6);
          if (ws !== 1) m.weightScale = ws;
        }
        if (Array.isArray(es.dash) && es.dash.length) m.strokeDash = es.dash.slice();
        return Object.keys(m).length ? m : null;
      };

      // ── Occluder set (S6): solid front faces occlude everyone; x-ray front
      // faces occlude only their own object; ground/backdrop never occlude.
      const occluderFaces = [];
      scene.objects.forEach((record) => {
        record.faces.forEach((face) => {
          if (!face.front) return;
          occluderFaces.push({
            id: face.key,
            objectId: record.id,
            polygon: face.polygon,
            onlyOwnObject: record.visibility === 'xray',
          });
        });
      });
      // P5 (draft-only coarser HLR sampling): `bounds.fastPreview` is a
      // `generate()` argument, set once by its caller and never reassigned
      // before this point (verified — the only other `bounds` identifier in
      // this file is an unrelated `const` inside a nested per-face closure
      // far below), so it is safe to read here, ahead of the `draft` const
      // used later for tone/specular gating. Threading it into
      // HLR.createClipper is what actually activates hlr.js's SAMPLE_STEP
      // multiplier during a live drag — see scene3d-hlr-draft-flag-wiring
      // .test.js for the RGR proof that this reaches the clipper.
      const draftHLR = Boolean(bounds && bounds.fastPreview);
      const clipper = HLR.createClipper(occluderFaces, { bias: HLR_BIAS, draft: draftHLR });

      // ── Phase 2 lighting: light-made tone + cast shadows (streams 2A). ──────
      const Lighting = Vectura.Scene3D.Lighting;
      const Regions = Vectura.Scene3D.Regions;
      const Shadows = Vectura.Scene3D.Shadows;
      const Mappers = Vectura.Scene3D.Mappers;
      const SurfaceFill = Vectura.Scene3D.SurfaceFill;
      const linkSegments = G3.linkSegments;

      // Correlate a scene record back to its source object (records don't carry
      // params/transform) so SurfaceFill can re-evaluate the object's chart.
      const objById = new Map((p.objects || []).map((o) => [o.id, o]));
      // The primitive → chart (mode, sizes, detail) mapping — mirrors
      // Scene.buildPrimitiveMesh so the wrap fill lands on the rendered surface.
      const TOPOFORM_MODES = {
        sphere: 'sphere', ellipsoid: 'sphere', cylinder: 'cylinder', cone: 'cone',
        torus: 'torus', torusKnot: 'torusKnot', capsule: 'capsule',
        superellipsoid: 'superellipsoid', pyramid: 'pyramid',
      };
      const curvedChartParams = (obj) => {
        const mode = TOPOFORM_MODES[obj.primitive];
        if (!mode) return null; // box/plane/solid are faceted, not chart-wrapped
        const pr = obj.params || {};
        const detail = Math.max(4, Math.round(finite(pr.detail, 24)));
        const r = finite(pr.radius, 20);
        const sizes = obj.primitive === 'sphere'
          ? { sx: r, sy: r, sz: r }
          : { sx: finite(pr.sx, 20), sy: finite(pr.sy, 20), sz: finite(pr.sz, 20) };
        return { mode, sizes, detail };
      };
      const light = (p.lights && p.lights[0]) || {};
      const lightDir = Lighting && typeof Lighting.lightWorldDir === 'function'
        ? Lighting.lightWorldDir(light) : null;
      // toneOn drives the intensity → band → coverage → spacing modulation of the
      // existing hatch. When false, hatching is EXACTLY Phase 1 (density-based,
      // light-invariant) — CONTRACT L3 regression safety.
      // Draft previews (live drag) SKIP tone banding and the specular hotspot —
      // the same responsiveness contract that makes shadows skip booleans (L4).
      // The drag shows flat Phase-1 hatch; full tone returns on release.
      // (draftHLR, hoisted above the clipper build, is the single source of
      // truth for "this is a live-drag preview frame" — reused here rather
      // than recomputed so the two draft-gated behaviors can't drift apart.)
      const draft = draftHLR;
      const toneOn = Boolean(!draft && p.tone && p.tone.enabled && Regions && lightDir);
      // Multi-light shading: intensity at a world normal + world POINT is
      // ambient + every directional Lambert term + every positional (point/spot)
      // term (distance falloff, spot cone), clamped to [0,1] (Regions.combined-
      // Intensity). A lone sun reduces to the Phase-2 single-light look. The
      // world point is only consulted by point/spot lights; a call site with no
      // meaningful point passes the region centroid.
      // `activeLights` is REASSIGNED per record (below) so an EMISSIVE object's
      // co-located point light shades every OTHER object but never itself. With
      // no emissive object it stays === p.lights, so intensityFn — and thus every
      // toned scene — is byte-identical to pre-emissive. intensityFn reads the
      // live binding, so the per-record reassignment is picked up by every helper
      // (spacingBand, the curved pass, SurfaceFill) without re-plumbing them.
      let activeLights = p.lights;
      const intensityFn = toneOn ? (nw, wp) => Regions.combinedIntensity(nw, wp, activeLights) : null;
      // I8 — per-sample specular term for light-driven highlight mode. Reads the
      // live `activeLights` binding (like intensityFn) so an emissive object's
      // co-located light is picked up. shininess derives from the tone Specular
      // size (bigger size → broader glint). Only consumed when a style opts into
      // highlightMode:'lightDriven'; a null fn is a strict no-op otherwise.
      const specShininess = (toneOn && Regions && typeof Regions.shininessForSize === 'function')
        ? Regions.shininessForSize(p.tone && p.tone.specular && p.tone.specular.size) : 24;
      const specularFn = (toneOn && Regions && typeof Regions.specularTerm === 'function')
        ? (nw, wp) => Regions.specularTerm(nw, wp, activeLights, scene.camera, specShininess) : null;
      const penWidth = finite(bounds.penWidth, 0.3);

      // Mean world position of a face's verts (the point at which point/spot
      // lights are sampled for that face). null when the face has no world verts.
      const faceWorldCentroid = (face) => {
        const wv = face && face.worldVerts;
        if (!Array.isArray(wv) || !wv.length) return null;
        let x = 0; let y = 0; let z = 0; let c = 0;
        for (let i = 0; i < wv.length; i++) {
          const pw = wv[i];
          if (pw && Number.isFinite(pw.x) && Number.isFinite(pw.y) && Number.isFinite(pw.z)) {
            x += pw.x; y += pw.y; z += pw.z; c += 1;
          }
        }
        return c ? { x: x / c, y: y / c, z: z / c } : null;
      };

      // The object's own FOOTING — world-Y floor and height — for the reflected
      // (bounce) term of §5.2. Bounce comes up off the ground and dies over
      // roughly one object height, so a floating object must not collect light
      // it cannot physically receive. Cached per record: every sample of a
      // curved fill asks for it.
      const groundCache = new Map();
      const recordGround = (record) => {
        if (!record) return null;
        if (groundCache.has(record)) return groundCache.get(record);
        let lo = Infinity; let hi = -Infinity;
        ((record && record.faces) || []).forEach((f) => {
          ((f && f.worldVerts) || []).forEach((pw) => {
            if (pw && Number.isFinite(pw.y)) {
              if (pw.y < lo) lo = pw.y;
              if (pw.y > hi) hi = pw.y;
            }
          });
        });
        const g = (Number.isFinite(lo) && hi > lo) ? { y0: lo, height: hi - lo } : null;
        groundCache.set(record, g);
        return g;
      };

      // Hatch a flat face IN ITS OWN PLANE and project the result to screen, so
      // the strokes lie on the surface and foreshorten with it — a cube reads as
      // three distinct 3D planes, not one flat screen field. The hatch angle is
      // measured in the face plane (0 = along the face's first edge). Spacing is
      // Phase-1 density when tone is off, else intensity→coverage; the darkest
      // tone band adds a perpendicular cross-pass. Returns SCREEN-space lines.
      // Tone-aware fill spacing for a face/region normal + its darkest-band flag.
      // Phase-1 density when tone is off, else intensity→band→coverage→spacing.
      // Density is AUTHORITATIVE; tone is a MULTIPLIER (Phase-1 density bug fix).
      // s0 = density-driven base spacing; a band's coverage warps it around a
      // midpoint gain of ~1, floored at the pen width. Coverage 0..1 → gain
      // 0.5..1.6, so changing Density visibly re-spaces the fill with tone ON.
      //
      // I27 (direction unify): faceted fills now shade DARK = DENSE, BRIGHT =
      // SPARSE — the SAME physically-correct direction the curved SurfaceFill
      // path uses (dark surface = every line; the lit cap = near-blank = the
      // highlight). Before this, faceted read the ladder coverage DIRECTLY
      // (dark→light), so a lit band packed tighter → bright=DENSE, the OPPOSITE
      // of a sphere in the same scene. We now read the COMPLEMENT band's coverage
      // (nBands-1-bandIdx), matching SurfaceFill.coverageForSample, so a cube and
      // a sphere lit alike shade alike.
      // ── O20 — the cube's three orientations, three readable values ────────
      //
      // This was a QUANTIZER defect, not a fill defect, and four rounds of fill
      // tuning could not reach it. A cube's lit faces fall high in the
      // thresholds' range but not at the top of it: measured, the best-lit face
      // sat at band 2 of 4 and the next at band 1, so the object used the dark
      // two thirds of the ladder and its two lit faces came out 0.012 apart in
      // density. At bands 3 they shared a band outright and the order inverted.
      //
      // `Regions.rankBands` re-quantizes an object's own facet orientations by
      // RANK when — and only when — the thresholds leave the top of the ladder
      // unused. See regions.js for the two guards that keep it honest (it never
      // darkens, and it never touches an object that already spans the ladder).
      //
      // Sub-band gain gradation was the other candidate and is the wrong route:
      // tilting the gain across a band's own width collapses the faceted
      // band-COUNT contract in tests/visual/scene3d-tone-baseline.test.js (a
      // cube at bands 3 and bands 4 emits identical ink under the tilt). Rank
      // quantization emits a band INDEX, so the value it produces is still read
      // off that band count's own ladder and the contract survives.
      const toneBandCount = () => (p.tone && Array.isArray(p.tone.ladder) && p.tone.ladder.length) ? p.tone.ladder.length : 3;
      const coverageGain = (bandIdx) => {
        const nb = toneBandCount();
        return 0.5 + clamp(Regions.coverageFor(nb - 1 - bandIdx, p.tone), 0, 1) * 1.1;
      };
      // ── Faceted TERMINATOR — a dihedral ELIGIBILITY gate (O21, O22) ─────────
      //
      // A cube has no terminator. It has an EDGE. The terminator is a curvature
      // phenomenon, so a facet can only carry one when it belongs to a
      // SMOOTH-SHADED region — one whose facets meet at a dihedral below
      // TERMINATOR_SMOOTH_DEG, the same intrinsic world-space measure
      // Edges.classifyEdges uses for crease. A low-poly sphere's facets sit
      // inside that angle and produce a discrete ring; a cube's 90-degree edges
      // never do, and a cylinder's flat cap (whose only edge is its sharp rim)
      // never does either while its barrel does.
      //
      // WHAT WAS WRONG (O21 measured 0.91x — the terminator ring came out
      // LIGHTER than the form shadow below it, inverted):
      //
      // The ring itself used to be located topologically, "unlit facet sharing a
      // smooth edge with a lit one", against a hard-coded `I >= 0.5` light test.
      // But `Regions.formZone` hands T out only in band 0 (`if (b > 0) return
      // 'M'`), and under the default thresholds a facet at I just under 0.5 is
      // in band 1. So every facet the topological rule could flag was
      // intercepted before the terminator branch, the T zone was UNREACHABLE on
      // a faceted object, and its crossed family never drew. T and F measured
      // identical because they WERE identical.
      //
      // So the gate stays and the LOCATION goes back to the one classifier both
      // paths share: inside a smooth region, `formZone`'s own signed-Lambert
      // rule places the ring, exactly as it does on a curved surface. That is
      // the §5.5.3 / I27 parity contract stated properly — a cube and a sphere
      // lit alike land in the same zones — instead of two rules that disagreed
      // about where the dark side starts.
      // Where `shadowSensitivity` starts staging the dark side. Half-lit is the
      // curved fill's own split point, and it is deliberately NOT the terminator
      // (which lives at band 0): the stages grade everything below mid-light.
      const SHADOW_STAGE_TH = 0.5;
      // ROUND 9 — the gate itself now lives in `Regions`, beside `formZone`, so
      // the renderer and the shadow-anatomy instrument decide it with the same
      // code and the same threshold instead of two edge maps that happen to
      // agree. Cached per record; every face asks for it.
      const smoothCache = new Map();
      const smoothShadedFaces = (record) => {
        if (smoothCache.has(record)) return smoothCache.get(record);
        const set = (Regions && typeof Regions.smoothShadedFaces === 'function')
          ? Regions.smoothShadedFaces((record && record.faces) || [], (record && record.edges) || [])
          : new Set();
        smoothCache.set(record, set);
        return set;
      };

      // ── The object's own tone grade (O20) ───────────────────────────────────
      //
      // Ranked over EVERY facet of the record, front and back, so the grade is a
      // property of the object and the light and never of where the camera
      // happens to be (O28). Cached per record: every face asks for it.
      const rankBandCache = new Map();
      const recordBands = (record) => {
        if (rankBandCache.has(record)) return rankBandCache.get(record);
        let map = null;
        const faces = (record && record.faces) || [];
        if (faces.length && Regions && typeof Regions.rankBands === 'function') {
          const I = faces.map((f) => (f && f.normalWorld
            ? intensityFn(f.normalWorld, faceWorldCentroid(f)) : 0));
          const bands = Regions.rankBands(I, p.tone);
          map = new Map();
          faces.forEach((f, i) => map.set(f, bands[i]));
        }
        rankBandCache.set(record, map);
        return map;
      };

      // I8 parity — per-FACE specular. A facet either catches the glint or it does
      // not, so Regions.specularTerm evaluates once per face. That discreteness IS
      // flat shading (a low-poly sphere pops one or two facets; a cube often none)
      // and must not be smoothed into a fake hotspot. Before this the faceted path
      // ignored tone.specular entirely while the curved fill honoured it — the same
      // class of divergence I27 already had to repair once.
      const specOnFaceted = Boolean(toneOn && p.tone && p.tone.specular && p.tone.specular.enabled !== false);
      const specSizeFaceted = specOnFaceted ? clamp(finite(p.tone.specular.size, 1), 0, 3) : 0;
      const faceSpecular = (normalWorld, worldPoint) => {
        if (!specOnFaceted || !Regions || typeof Regions.specularTerm !== 'function') return 0;
        return clamp(Regions.specularTerm(normalWorld, worldPoint, activeLights, scene.camera, specShininess), 0, 1);
      };

      // ── The H zone on a FACETED object (§5.5.2) ──────────────────────────────
      //
      // "Facets whose specular term clears the threshold." The curved fill can
      // use a fixed ~15-degree cone because a wrapped surface always contains a
      // normal that close to the half-vector. A facet set does not: measured on
      // the design fixture, the cube's BEST facet sits 43.8 degrees off the
      // half-vector, so a fixed cone hands a cube nothing at all — and with no H
      // facet the whole treatment dispatch below was dead code. `blank`,
      // `sparse`, `stippleOut` and `altFill` rendered byte-identically (O14),
      // `highlightPenId` reached no ink (O11), and `highlightSensitivity` was
      // inert outside lightDriven (O9).
      //
      // The faceted reading of the same rule is the DISCRETE one: a facet
      // catches the glint when it is the record's best mirror, or close enough
      // to the best one to belong to the same glint. Two gates:
      //
      //   GLINT_ABS — the cone's outer edge, on the sharpened term. Tighten it
      //     far enough and even the best facet falls outside, which is §5.5.2's
      //     "on a cube, often none — a legitimate result, not a failure".
      //   GLINT_REL — and it must be within this fraction of the record's best
      //     facet, which is what keeps the highlight to the 1-3 facets §5.5.2
      //     describes instead of the whole lit side.
      //
      // `highlightSensitivity` is the cone's ANGULAR TIGHTNESS (O9). The term is
      // S = cos(N,H)^shininess, so raising S to the sensitivity re-exponentiates
      // that cosine and closes the cone: at specular size 1 the acceptance angle
      // runs ~73 deg (1) → ~49 deg (3) → ~36 deg (6). Sensitivity 1 returns the
      // term exactly as specularTerm reports it, so the default is unchanged.
      // Bigger tone.specular.size lowers the shininess and therefore OPENS the
      // cone — the same direction the curved path moves in (§5.5.3 parity).
      const GLINT_ABS = 0.002;
      const GLINT_REL = 0.6;
      // Zone-H coverage for a glint facet, as a MULTIPLIER on the band's own
      // gain. Two properties matter and both come from it being a multiplier:
      //
      //   - Capped, not emptied. A cube shows three faces, and emptying one reads
      //     as a hole rather than as a highlight (§5.4 #1 — a highlight is
      //     defined by the ink AROUND it). The step lands on the facet boundary,
      //     which is the blocky polygon-edged highlight §5.5.1 calls right.
      //   - The tone ladder still shows THROUGH it. An absolute floor made the
      //     glint facet's spacing independent of the band count, which collapses
      //     the faceted band-COUNT contract pinned in
      //     tests/visual/scene3d-tone-baseline.test.js.
      const GLINT_GAIN_MULT = 0.45;
      const glintSensitivity = (styleParams) => clamp(
        Math.round(finite(styleParams && styleParams.highlightSensitivity, 1)), 1, 6,
      );
      const perFaceHighlight = (styleParams) => !styleParams || styleParams.highlightMode !== 'lightDriven';
      const faceGlintTerm = (normalWorld, worldPoint, sens) => {
        const S = faceSpecular(normalWorld, worldPoint);
        if (!(S > 0)) return 0;
        return sens <= 1 ? S : clamp(Math.pow(S, sens), 0, 1);
      };
      // Brightest sharpened term across a record's facets, memoized per
      // (record, sensitivity). Read while that record's `activeLights` binding is
      // in force, exactly like faceSpecular.
      const glintMaxCache = new Map();
      const recordGlintMax = (record, sens) => {
        let bySens = glintMaxCache.get(record);
        if (!bySens) { bySens = new Map(); glintMaxCache.set(record, bySens); }
        if (bySens.has(sens)) return bySens.get(sens);
        let best = 0;
        ((record && record.faces) || []).forEach((f) => {
          const t = faceGlintTerm(f.normalWorld, faceWorldCentroid(f), sens);
          if (t > best) best = t;
        });
        bySens.set(sens, best);
        return best;
      };
      // ── A ONE-FACET RECORD CANNOT HAVE A GLINT (§5.4 #1) ─────────────────────
      //
      // `GLINT_REL` is a RELATIVE gate — "is this facet within 60 % of the
      // record's best mirror?" — and on a record with exactly ONE visible facet
      // that facet IS the best mirror, so `t >= GLINT_REL * t` is a tautology and
      // the whole surface is declared the highlight. `GLINT_ABS` cannot save it:
      // at 0.002 it sits two orders of magnitude below any term a facet produces.
      //
      // The `ground` plate is excluded by id for exactly this reason ("one
      // enormous facet, always its own best mirror"). The `plane` PRIMITIVE is
      // the same one-quad geometry and was never covered by it. MEASURED on the
      // APP DEFAULT plane (60 x 60 mm, the app's own sun, tone on): the single
      // face was 100 % glint, its coverage multiplied by GLINT_GAIN_MULT, and it
      // drew ONE ruling — 77.2 % of the face bare paper, widest gap 35.3 mm on a
      // fill whose Density asked for 7.5 mm.
      //
      // So state §5.4 #1 — "a highlight is defined by the ink AROUND it" — as the
      // precondition it is: with one visible facet there is no around, so there
      // is no highlight. This is the degenerate case only; a record with two or
      // more visible facets is classified exactly as before, which is what keeps
      // O9/O11/O14/O15's cube and low-poly dispatch untouched.
      const GLINT_MIN_FRONT_FACETS = 2;
      const recordFrontFacets = (record) => {
        let n = 0;
        ((record && record.faces) || []).forEach((f) => { if (f && f.front) n += 1; });
        return n;
      };
      const faceIsGlint = (normalWorld, worldPoint, record, styleParams) => {
        // O24 — the glint must EXTINGUISH as tone.specular.size → 0, exactly as
        // the coverage multiplier below does, so size 0 and enabled:false agree.
        if (!specOnFaceted || !(specSizeFaceted > 0)) return false;
        // The H zone is the OBJECT's own shading (§5.5). The ground plate is one
        // enormous facet, so it is always its own best mirror and would take the
        // glint across the whole floor — the highlight region pass already
        // excludes it for the same reason.
        if (!record || record.id === 'ground') return false;
        if (recordFrontFacets(record) < GLINT_MIN_FRONT_FACETS) return false;
        const sens = glintSensitivity(styleParams);
        const t = faceGlintTerm(normalWorld, worldPoint, sens);
        if (!(t >= GLINT_ABS)) return false;
        const best = recordGlintMax(record, sens);
        return best > 0 && t >= GLINT_REL * best;
      };

      // FORM ZONE for a facet — the faceted twin of the curved classifier, and
      // the same function, which is what keeps a cube and a sphere in the same
      // zones under one light (§5.5.3, the I27 contract). The one difference is
      // that ELIGIBILITY is decided HERE and handed in: the dihedral gate (a
      // cube has an edge, not a terminator) is the thing formZone must not be
      // allowed to second-guess.
      const faceZone = (normalWorld, worldPoint, face, record) => {
        if (!Regions || typeof Regions.formZone !== 'function') return null;
        const ctx = {
          tone: p.tone,
          lights: activeLights,
          ground: recordGround(record),
        };
        // Only a facet in a smooth-shaded region is ELIGIBLE for a terminator.
        // Ineligible ⇒ `terminator: false`, which is formZone's explicit "this
        // caller has ruled T out, do not second-guess it" contract; eligible ⇒
        // the key is absent and formZone places the ring itself, on the same
        // signed-Lambert rule the curved fill uses.
        if (!(record && face && smoothShadedFaces(record).has(face))) ctx.terminator = false;
        return Regions.formZone(normalWorld, worldPoint, ctx);
      };

      // ── THE TONE LAW ON FACETED GEOMETRY (box / plane / solid) ──────────────
      //
      // `SurfaceFill.chartFor` resolves a parametric chart for nine primitives
      // and returns null for `box`, `plane` and `solid`, so those three fall
      // through to THIS faceted planar fill — which, until this round, never
      // read `style.params.toneLaw` at all. Measured at the byte level while
      // building `docs/tone-laws/`: for those three primitives the rendered
      // output was MD5-IDENTICAL across all 47 laws, while `sphere` differed for
      // every one. The gallery labelled those columns "no law", correctly.
      //
      // WHAT A FLAT FACE CAN AND CANNOT CARRY. A face has a CONSTANT normal, so
      // under a directional light every sample on it has the same Lambert
      // intensity. Any law whose tone varies with per-sample intensity is
      // therefore uniform ACROSS one face by construction, and all faceted
      // shading comes from face-to-face variation — which is what `coverageGain`
      // below already carries, and what each law's own tone map re-derives from
      // the per-sample `I` it is handed. Point and spot lights DO vary across a
      // face (their direction depends on the world point) and grade within one.
      //
      // WHICH LAWS ARE REACHABLE FROM HERE. `Scene3D.SurfaceFillMono.emit` is a
      // public, caller-parameterised entry point: it takes a chart SUBSTRATE
      // (`sampleAt` / `pushRun` / the pitch bars) rather than a primitive, so a
      // face's own planar (u,v) frame can be handed to it and the nine `mono`
      // laws' REAL implementations run here unmodified — see `faceMonoLines`.
      // The other 37 laws live INSIDE `buildObject`'s closure in
      // `surface-fill.js` and are reachable only through `chartFor`, whose
      // switch has no planar mode. They are reported unsupported here rather
      // than approximated: an arbitrary faceted stand-in for a named law is
      // worse than an honest gap, and nothing in this file re-implements one.
      const MonoFill = () => (Vectura.Scene3D && Vectura.Scene3D.SurfaceFillMono) || null;
      // The style's tone law, VALIDATED exactly as `buildObject` validates it:
      // an id the running build does not carry degrades to "no law asked" rather
      // than throwing or silently drawing nothing.
      const facetedToneLaw = (styleParams) => {
        const asked = typeof (styleParams && styleParams.toneLaw) === 'string' ? styleParams.toneLaw : '';
        if (!asked) return '';
        const IDS = (Vectura.SCENE3D_TONE_LAWS && Vectura.SCENE3D_TONE_LAWS.IDS) || null;
        return (!IDS || IDS.indexOf(asked) !== -1) ? asked : '';
      };
      const spacingBand = (normalWorld, styleParams, worldPoint, face, record, opts) => {
        const s0 = hatchSpacing(styleParams.fillDensity);
        if (!toneOn) return { spacing: s0, bandIdx: -1, terminator: false };
        // `toneLaw: 'none'` is STAGE 0 — the tone apparatus switched off — and it
        // is NOT the same thing as `tone.enabled = false`, which the line above
        // handles. The curved path implements Stage 0 by clearing `masterGrid` +
        // `dither`; the faceted path's whole tone apparatus IS this function, so
        // Stage 0 here is this early return: every ruling of the density grid
        // draws, at one pitch, with no band, no zone, no cross family and no
        // glint cap. Returning no `zone` is what withholds the cross family —
        // `crossWeightFor(undefined, …)` is 0, the same as the untoned path.
        if (facetedToneLaw(styleParams) === 'none') return { spacing: s0, bandIdx: -1, terminator: false };
        // `none` — the total highlight/specular bypass (Jay, 2026-08-09). Nothing
        // below may thin, re-space or re-tag this facet's ink on a highlight's
        // account, so the specular gain multiplier is skipped outright.
        const hlOff = styleParams.highlightTreatment === 'none' || styleParams.highlightTreatment === 'keep';
        const I = intensityFn(normalWorld, worldPoint);
        // O20 — the object's own rank grade when the thresholds under-use the
        // ladder, the plain threshold band otherwise (and always, for a caller
        // with no face/record to grade against).
        const graded = (record && face) ? recordBands(record) : null;
        const bandIdx = (graded && graded.has(face)) ? graded.get(face) : Regions.band(I, p.tone);
        let gain = coverageGain(bandIdx);
        // shadowStage parity: the dark-side coverage boost was curved-path only, so
        // faceted objects got no grading below the terminator and read flat.
        const shadowSens = clamp(Math.round(finite(styleParams.shadowSensitivity, 1)), 1, 8);
        if (shadowSens > 1 && typeof Regions.shadowStage === 'function') {
          const stg = Regions.shadowStage(I, shadowSens, SHADOW_STAGE_TH);
          if (stg && Number.isFinite(stg.boost)) gain *= clamp(stg.boost, 0.5, 2);
        }
        // Specular: the glint facet reads LIGHTER, never denser — the highlight is
        // negative space bounded by the surrounding hatch, never a drawn disc.
        // O24: the response must EXTINGUISH as tone.specular.size → 0, so the
        // size multiplies straight through with no floor under it.
        // O9 — the response reads the SHARPENED term, so highlightSensitivity is
        // live in the default perFace mode. At sensitivity 1 the sharpened term
        // IS the raw term, so the default response is unchanged.
        const S = hlOff ? 0 : faceGlintTerm(normalWorld, worldPoint, glintSensitivity(styleParams));
        if (S > 0 && specSizeFaceted > 0) gain *= clamp(1 - 0.55 * specSizeFaceted * S, 0.25, 1);
        // ── The form-zone ladder on facets (§5.1) ──────────────────────────────
        //
        // Round 2 wrote `if (terminator) gain = max(gain, coverageGain(0))`, which
        // made a terminator facet IDENTICAL to a band-0 facet: T could never
        // exceed F by construction, so O1/O3/O21 were unreachable no matter what
        // the ladder said. The ceiling is real — gain tops out at 1.6 — so the
        // excess has to go into a second DIRECTION (§5.0), which `faceHatchLines`
        // spends through `Regions.formInk(zone).cross` — T's full family against
        // F's 0.40 of one, the same recipe the curved fill spends.
        //
        // R (reflected) is the other half of the dip: the away-facing rim was
        // falling to a hard Lambert 0 with nothing under it, so a low-poly
        // sphere's LOWEST facets came out its darkest. R lightens them back.
        const zone = faceZone(normalWorld, worldPoint, face, record);
        if (zone === 'T') gain = Math.max(gain, coverageGain(0));
        else if (zone === 'R') gain = Math.min(gain, coverageGain(0) * 0.55);
        // ── H (§5.5.2): the glint FACET set. Its coverage is capped to a single
        // discrete step so the highlight reads as a blocky, polygon-edged
        // lightening of whole facets.
        //
        // The cap IS the `blank` treatment, so it fires only for `blank` — every
        // other treatment REPLACES the H drop with its own mark and must be
        // handed the facet's full ladder fill to thin, exactly as SurfaceFill
        // dispatches inside its drop zone. Stacking the two made `sparse`
        // indistinguishable from `blank` on a low-poly sphere, whose facets carry
        // one ruling each once the cap has been applied.
        //
        // perFace only: lightDriven places its glint per SAMPLE and would
        // otherwise double-lighten the facet it sits on. `none` (hlOff) is a
        // total bypass and never reaches here.
        const glint = !hlOff && perFaceHighlight(styleParams)
          && highlightCfg(styleParams).treatment === 'blank'
          && faceIsGlint(normalWorld, worldPoint, record, styleParams);
        if (glint) gain *= GLINT_GAIN_MULT;
        return { spacing: Math.max(penWidth, s0 / gain), bandIdx, terminator: zone === 'T', zone, glint };
      };

      // In-plane basis for a flat face: its world verts expressed in a 2D (u,v)
      // frame on the face (WORLD mm), plus a uv→screen projector. Fills are
      // generated in this frame so their spacing is true surface mm and they
      // foreshorten with the face when projected. null ⇒ caller falls back to
      // the cheap screen-space fill (draft, or a face without world verts).
      const faceUVScaffold = (face, normalWorld) => {
        const wv = face.worldVerts;
        if (draft || !scene.projectWorld || !Array.isArray(wv) || wv.length < 3) return null;
        const origin = wv[0];
        // ── THE FACE FRAME IS ANCHORED TO THE WORLD, NOT TO EDGE 0 ────────────
        //
        // U used to be `normalize(wv[1] - origin)` — the face's FIRST EDGE. On a
        // box that is stable enough to look deliberate, but on a geodesic
        // polyhedron every triangle's first edge points somewhere arbitrary, so
        // every facet's hatch ran at an effectively random angle. Neighbouring
        // facets' rulings met at nonsense angles, no tonal ordering was legible
        // across the form, and the low-poly sphere read as decoration rather than
        // as a lit solid. It was the single largest reason faceted geometry
        // looked wrong, and it was never a tone problem at all.
        //
        // So the in-plane frame is anchored to a WORLD axis projected onto the
        // face: adjacent facets of a curved approximation now carry near-parallel
        // rulings that flow across the form, and the ladder can finally be read.
        // World UP is the reference (it is what an engraver would use); a face
        // whose normal is near-parallel to it falls back to world +X, and only a
        // degenerate face falls back to the old first-edge behaviour.
        // Gated on `toneOn`, for two separate reasons. Untoned faceted output must
        // stay byte-identical (six x-ray goldens pin it). And `angleRef` is a
        // user-facing control whose 'face' setting is DOCUMENTED as "0 = along the
        // face's first edge" — silently making it world-anchored everywhere would
        // collapse 'face' and 'worldUp' into the same thing and quietly remove a
        // dial. Tone is where the defect lives: a ladder can only be read across a
        // form if adjacent facets' rulings are comparable.
        const axisFor = () => {
          if (!toneOn) return normalize(sub(wv[1], origin));
          // World +X first, NOT +Y: `angleRef:'worldUp'` already anchors to world
          // up, and anchoring the toned default to the same axis would make the
          // two settings produce identical line directions — collapsing a dial
          // instead of fixing a defect. Both are stable across facets; they just
          // are not the same stabilization.
          const cand = [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }];
          for (let i = 0; i < cand.length; i++) {
            const a = cand[i];
            const proj = sub(a, mul(normalWorld, dot(a, normalWorld)));
            if (Math.hypot(proj.x, proj.y, proj.z) > 1e-3) return normalize(proj);
          }
          return normalize(sub(wv[1], origin));
        };
        const U = axisFor();
        const V = normalize(cross(normalWorld, U)); // in-plane, ⟂ U
        const uv = wv.map((pw) => { const d = sub(pw, origin); return { x: dot(d, U), y: dot(d, V) }; });
        // uv → WORLD (for per-sample lighting, I8) and uv → SCREEN.
        const toWorld = (pt) => add(origin, add(mul(U, pt.x), mul(V, pt.y)));
        const toScreen = (pt) => scene.projectWorld(toWorld(pt));
        return { uv, toScreen, toWorld, origin, U, V };
      };

      // WORLD-UP hatch reference (Phase 2 `angleRef:'worldUp'`): the in-plane
      // angle (deg, hatchPolygon convention) whose lines run along world vertical
      // projected onto the face plane, so a tilted face still engraves "upright".
      // Returns 0 when world up is (near) parallel to the face normal (a floor/
      // ceiling face) so the fill degrades to the face-frame angle.
      const worldUpAngleInUV = (scaf) => {
        if (!scaf || !scaf.U || !scaf.V) return 0;
        const up = { x: 0, y: 1, z: 0 };
        const ua = dot(up, scaf.U);
        const va = dot(up, scaf.V);
        if (Math.hypot(ua, va) < 1e-4) return 0;
        return Math.atan2(va, ua) * 180 / Math.PI;
      };

      // Boustrophedon linking (Phase 2 `linkFill`): chain disjoint scanline
      // segments into one continuous pen path, joining each segment to the nearest
      // end of the previous one (so the connectors are short). Fewer, longer
      // polylines = one pen-down per family. Deterministic; input order preserved.
      const linkBoustrophedon = (segments) => {
        const segs = segments.filter((s) => Array.isArray(s) && s.length >= 2);
        if (segs.length < 2) return segs;
        const path = [segs[0][0], segs[0][segs[0].length - 1]];
        for (let i = 1; i < segs.length; i++) {
          const s = segs[i];
          const a = s[0];
          const b = s[s.length - 1];
          const last = path[path.length - 1];
          const d0 = (a.x - last.x) ** 2 + (a.y - last.y) ** 2;
          const d1 = (b.x - last.x) ** 2 + (b.y - last.y) ** 2;
          if (d1 < d0) { path.push(b, a); } else { path.push(a, b); }
        }
        return [path];
      };

      // Independent crosshatch families (Phase 1.3): family-A is the primary
      // hatch at fillAngle; family-B (crosshatch only) is at fillAngle +
      // crossAngleDelta with spacing × crossDensityRatio (ratio > 1 ⇒ sparser
      // B); tripleHatch adds a third pass at +45° in the darkest tone band only.
      // §2.3 — object-side crossed families are +65° / +32°, NEVER +90°.
      const CROSS_OBJ_DEG_B = (Regions && Regions.CROSS_OBJ_DEG) || 65;
      const CROSS_OBJ_DEG_C = 32;
      // `crossW` is the zone's own `Regions.formInk(zone).cross` — the coverage
      // of the SECOND family in units of the first, so its pitch is spacing /
      // crossW. T spends a full family (1.00), F four tenths of one (0.40), and
      // everything lighter spends none. Passing a weight rather than a boolean
      // is what puts the faceted path on the curved path's recipe.
      //
      // ── EVERY FAMILY IS SPACED IN ITS OWN FRAME (Round 9, C15/O20) ──────────
      //
      // `planeFor(angleDeg, screenPitch)` converts a family's desired SCREEN
      // pitch into the spacing to ask for in the surface's own plane, using THAT
      // family's own foreshortening. Omitted ⇒ `spacing` is already the spacing
      // to use verbatim, which is what the untoned path, the screen-space
      // fallback and the ground all want, and keeps them byte-identical.
      //
      // Before this, family B was handed family A's compensation and then scaled
      // in the plane. On a face turned nearly edge-on the two families' factors
      // differ by 1.7x or more, so B landed that much tighter on paper than the
      // recipe asked for — and the plot floor, which is also stated per family,
      // never saw it.
      // `minSpacing` (last, optional) lowers hatchPolygon's hard 1mm floor —
      // but ONLY on family A, the direct density→spacing ruling. Family B (the
      // user's crosshatch, spacing × crossDensityRatio) keeps the historic
      // floor of 1 unconditionally: crossDensityRatio can already push spacing
      // below 1 in an existing saved document (ratio as low as 0.25 against a
      // density-100 base of exactly 1mm), and that path must stay
      // byte-identical. Omitted (undefined) ⇒ hatchPolygon's own default (1)
      // applies — every call site that doesn't pass it is untouched.
      //
      // The zone-driven dark-side second direction (spacing / w) gets its OWN
      // relief via `crossFloorFor` (fs-v2-facetedangle, defined above) rather
      // than reusing `minSpacing` verbatim: it is gated to d<=100 ⇒ undefined
      // for the same byte-identity reason, then matches family A's floor
      // above 100 so the two families' ink ratio stops drifting with density.
      const crossFamilies = (target, angleDeg, spacing, styleParams, crossPass, crossW, push, planeFor, minSpacing) => {
        const plane = (deg, screenPitch) => (planeFor ? planeFor(deg, screenPitch) : screenPitch);
        push(hatchPolygon(target, { angleDeg, spacing: plane(angleDeg, spacing), minSpacing }));
        const w = clamp(finite(crossW, 0), 0, 1);
        if (crossPass) {
          const delta = clamp(finite(styleParams.crossAngleDelta, 90), 10, 170);
          const ratio = clamp(finite(styleParams.crossDensityRatio, 1), 0.25, 2);
          push(hatchPolygon(target, { angleDeg: angleDeg + delta, spacing: plane(angleDeg + delta, spacing * ratio) }));
          if (styleParams.tripleHatch === true && w >= 1) {
            // §2.3 — the tone-driven third pass sits at +32°, not +45°. With
            // family B already at the user's delta, +45 lands close enough to A
            // or B to beat against it. Reserved for the core shadow, the only
            // zone whose recipe asks for a whole extra family.
            push(hatchPolygon(target, {
              angleDeg: angleDeg + CROSS_OBJ_DEG_C,
              spacing: plane(angleDeg + CROSS_OBJ_DEG_C, spacing * ratio),
            }));
          }
        } else if (w > 0) {
          // The dark side's second DIRECTION. Two Round-2 defects, both fixed
          // here:
          //
          //   O17 — it ruled at +90°, which is a square grid. On a faceted object
          //         that reads as wire mesh, and it beats against the raster.
          //         §2.3 bans +90 outright; +65 is the engraver's answer.
          //   O1  — it fired on ALL of band 0, so the form shadow got the same
          //         two directions the core shadow did and T could never out-ink
          //         F. The weight now comes from formInk, so T's family and F's
          //         lighter one differ by construction and the dip stays open.
          push(hatchPolygon(target, {
            angleDeg: angleDeg + CROSS_OBJ_DEG_B,
            spacing: plane(angleDeg + CROSS_OBJ_DEG_B, spacing / w),
            minSpacing: crossFloorFor(styleParams.fillDensity),
          }));
        }
      };
      // Zone → second-family weight, with the faceted path's one exemption: the
      // GLINT facet is negative space and must never gain a direction.
      const crossWeightFor = (zone, glint) => {
        if (!toneOn || glint || !zone || !Regions || typeof Regions.formInk !== 'function') return 0;
        return clamp(finite(Regions.formInk(zone).cross, 0), 0, 1);
      };

      // linkFill (Phase 2): boustrophedon-chain each hatch family into one pen
      // path. Default off ⇒ disjoint segments (Phase-1 output). Draft frames skip
      // the linking (cheap live drag). Applied per family so crosshatch keeps two
      // independent connected passes.
      const maybeLink = (segs, styleParams) =>
        (styleParams.linkFill === true && !draft ? linkBoustrophedon(segs) : segs);

      // ── PLANE PITCH → PAPER PITCH, FOR ONE FAMILY (C15, O20) ────────────────
      //
      // How much of one mm of in-plane spacing survives to paper, measured the
      // way the eye reads it: PERPENDICULAR to the ruling, after the projection.
      // 1 = face-on, → 0 as the face turns edge-on.
      //
      // This used to measure the LENGTH of one unit ACROSS the rulings, i.e.
      // |M·a| for the across-direction a. That is not the pitch. Rulings spaced
      // `s` apart in the plane sweep a strip of area `s × 1` per unit of ruling
      // length; the map takes that to `s × |det M|`, and the mapped ruling has
      // length |M·d|, so the perpendicular distance between neighbours on paper
      // is
      //                    s × |det M| / |M · d|.
      //
      // The two agree only when the map has no shear. As a facet turns edge-on
      // the shear grows without bound and they diverge — on `R2-cube`'s `+X`
      // face the old measure read 0.848 where the truth is 0.165, so the fill
      // was compensated 5.1x too little and the face flooded to a projected
      // coverage of 1.046 (harness D 0.891, past every ceiling in the document
      // and past the plot floor it was supposed to be enforcing). Its sibling
      // `+Z` — same zone, same light, same recipe, 9.5x the projected area —
      // measured 0.179. A cap stated on a proxy one transform away from the
      // metric, for the fourth time in this workstream.
      //
      // Sampled numerically from the scaffold's own uv→screen map, so it is
      // exact for orthographic and perspective alike.
      const uvPitchFactor = (scaf, alongAngleDeg) => {
        if (!scaf || typeof scaf.toScreen !== 'function') return 1;
        const o = scaf.uv[0] || { x: 0, y: 0 };
        const p0 = scaf.toScreen({ x: o.x, y: o.y });
        const px = scaf.toScreen({ x: o.x + 1, y: o.y });
        const py = scaf.toScreen({ x: o.x, y: o.y + 1 });
        if (!p0 || !px || !py || !Number.isFinite(p0.x) || !Number.isFinite(px.x) || !Number.isFinite(py.x)) return 1;
        const m00 = px.x - p0.x; const m10 = px.y - p0.y;
        const m01 = py.x - p0.x; const m11 = py.y - p0.y;
        const det = Math.abs(m00 * m11 - m01 * m10);
        const a = finite(alongAngleDeg, 0) * Math.PI / 180;
        const dx = Math.cos(a); const dy = Math.sin(a);
        const along = Math.hypot(m00 * dx + m01 * dy, m10 * dx + m11 * dy);
        if (!(along > 1e-9) || !Number.isFinite(det)) return 1;
        // Floored well below the old 0.12: a facet at 0.02 is asking for a
        // spacing 50x its plane extent, which draws no line at all — the correct
        // outcome for a face with no projected area — and the floor only has to
        // keep the arithmetic finite.
        return clamp(det / along, 0.02, 4);
      };
      // §0 / C15 — the object plot floor. Module scope; see its derivation there.

      const faceHatchLines = (face, styleParams, normalWorld, crossPass, record, hlOpts) => {
        // angleRef (Phase 2): 'face' (default) measures the hatch angle in the
        // face plane; 'screen' engraves flat in screen space regardless of the
        // face; 'worldUp' keeps the lines upright (world vertical projected onto
        // the face). 'screen' reuses the cheap screen-space path below.
        const angleRef = styleParams.angleRef === 'screen' || styleParams.angleRef === 'worldUp'
          ? styleParams.angleRef : 'face';
        const userAngle = finite(styleParams.fillAngle, 45);
        // Sample point/spot lights at the face's world centroid.
        const worldPoint = faceWorldCentroid(face);
        const scaf = angleRef === 'screen' ? null : faceUVScaffold(face, normalWorld);
        if (!scaf) {
          // Cheap screen-space hatch (draft / no world verts / angleRef:'screen')
          // — snaps back to the surface-oriented hatch on release.
          const sb = spacingBand(normalWorld, styleParams, worldPoint, face, record, hlOpts);
          const lines = [];
          crossFamilies(face.polygon, userAngle, sb.spacing, styleParams, crossPass,
            crossWeightFor(sb.zone, sb.glint),
            (segs) => maybeLink(segs, styleParams).forEach((l) => lines.push(l)),
            undefined, hatchFloorFor(styleParams.fillDensity));
          return lines;
        }
        const { spacing, zone, glint } = spacingBand(normalWorld, styleParams, worldPoint, face, record, hlOpts);
        // worldUp rotates the in-plane base angle so the lines follow world
        // vertical; 'face' leaves the user angle measured in the face frame.
        const baseAngle = angleRef === 'worldUp' ? worldUpAngleInUV(scaf) + userAngle : userAngle;
        const uvLines = [];
        // ── FORESHORTENING COMPENSATION (O20, and half of C15) ─────────────────
        //
        // The fill is generated in the face's OWN plane in world mm and then
        // projected, which is what makes a cube read as three 3D planes. But it
        // also means a grazing face's spacing is COMPRESSED on paper: the tone
        // the ladder asked for is not the tone that lands.
        //
        // The cube proved it. Top face N·L = 0.707, near side N·L = 0.5 — the top
        // is the better-lit face and must be the lighter one. Measured, the top
        // came out D = 0.22 against the side's 0.125: 1.76x DARKER, purely
        // because the top is seen at 22 degrees and its rulings piled up. The cube
        // read side-lit. At a steeper grazing angle the same effect flooded a face
        // to D = 1.000 — solid black, well under the 1.2 x pen floor, and a wet
        // blown-out plot.
        //
        // So measure how much of one mm of in-plane spacing survives to paper —
        // PERPENDICULAR to the ruling, which is the only place a pitch can be
        // read — and divide it back out. The tone ladder then lands in SCREEN
        // space, where the eye reads it, and the plot-safe floor is enforced
        // there too.
        //
        // ROUND 9. Two halves of this were wrong and both flooded the same face.
        // (a) The measure was the LENGTH of one unit across the rulings, not
        //     their perpendicular spacing after the map — see `uvPitchFactor`.
        // (b) Only family A's factor was computed, and family B was then scaled
        //     in the PLANE, so B was compensated with A's foreshortening. The
        //     conversion is now handed to `crossFamilies` as a function of the
        //     family's own angle, and the plot floor is applied per family, in
        //     screen mm, where the floor is stated.
        //
        // Gated on `toneOn`. An UNTONED fill makes no tonal claim — its spacing
        // is the user's Density, read in the face plane, and every existing
        // untoned scene (and every byte-identical golden that pins one) must
        // stay exactly as it was. The defect being fixed is a TONE-ordering
        // defect, so it is corrected where tone is doing the talking.
        //
        // ── A FAMILY WIDER THAN ITS OWN FACET DRAWS NOTHING (ROUND 10) ────────
        //
        // `hatchPolygon` places rulings at `pMin + i·spacing` for
        // `i = 1 … floor(extent / spacing)`. A spacing wider than the facet's own
        // in-plane extent across the rulings therefore yields count = 0: the
        // facet is dropped from the drawing entirely, at whatever tone it was
        // asked for, and no instrument in this workstream could see it because
        // `facets.js` omitted its own sub-window table.
        //
        // Measured on `W-lp-sun45`, nine visible facets carried NO fill, five of
        // them zone L — the CENTRE LIGHT — and the two largest of those are
        // 202.5 mm² at N·L 0.898 and 188.8 mm² at N·L 0.950. This is the same
        // defect §4.4 of the Round 9 scorecard found from the other side (two
        // facets at N·L 0.746 and 0.744 measuring D 0.000 and D 0.163), and it is
        // one half of why the tone ladder does not read as a ladder in the app.
        //
        // Two distinct causes, both landing here:
        //   (a) the TONE asked for a pitch wider than the facet — zone L at a
        //       screen pitch of 15.9 mm on a facet 14 mm across;
        //   (b) `uvPitchFactor` on a near-edge-on facet (k 0.02–0.09) blew a
        //       4.7 mm screen pitch up to a 54–213 mm plane pitch.
        //
        // THE RULE. Draw ONE ruling instead of none — but only when the facet's
        // own width ON PAPER can absorb one ruling inside the zone's composed
        // ceiling. One ruling across a convex facet covers about
        // `pen / widthOnPaper` (its length is ≈ area / width), so the test is
        // exact enough to make without drawing it.
        //
        // The ceiling gate is what keeps this from being a flood, and it is the
        // reason the fix is not simply "lower the k floor". On the 9 mm² sliver
        // `face:21` one ruling lands ≈ 0.20 coverage against zone L's ceiling of
        // 0.0987 — three times over — so that facet stays bare, correctly. On the
        // 202 mm² `face:26` it lands ≈ 0.021 against the same ceiling and is
        // drawn. The ceiling is `Regions.formCeiling`, the same law the curved
        // path has always enforced; until Round 10 the faceted path had no copy
        // of it at all.
        //
        // The budget is composed across families, family A first, so a second
        // direction can only be granted with what family A left — which is §5.3's
        // ruling on the narrow facet stated as arithmetic.
        const perpExtentUV = (deg) => {
          const a = finite(deg, 0) * Math.PI / 180;
          const nx = -Math.sin(a); const ny = Math.cos(a);
          let lo = Infinity; let hi = -Infinity;
          for (let i = 0; i < scaf.uv.length; i++) {
            const p = scaf.uv[i];
            if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
            const t = p.x * nx + p.y * ny;
            if (t < lo) lo = t;
            if (t > hi) hi = t;
          }
          return (Number.isFinite(lo) && hi > lo) ? hi - lo : 0;
        };
        // Wider than any facet: `hatchPolygon` yields count = 0, i.e. the
        // pre-Round-10 behaviour, for a family the ceiling refuses.
        const DRAW_NOTHING = 1e6;
        const zoneCeil = (Regions && typeof Regions.formCeiling === 'function')
          ? Regions.formCeiling(zone) : 0;
        const crossW = crossWeightFor(zone, glint);
        // ── PASS 1: what is this facet's recipe actually asking for? ──────────
        //
        // `crossFamilies` owns which families exist (the user's crosshatch, the
        // tone-driven cross at +65, the triple pass at +32) and Round 10 must not
        // restate that decision — restating a rule the renderer owns is this
        // workstream's signature bug. So the families are COLLECTED by running
        // `crossFamilies` once with a no-op push and a plane function that asks
        // for a pitch no facet can hold, which makes `hatchPolygon` emit nothing
        // and cost nothing.
        const asks = [];
        if (toneOn) {
          crossFamilies(scaf.uv, baseAngle, spacing, styleParams, crossPass, crossW,
            () => {}, (deg, screenPitch) => { asks.push({ deg, screenPitch }); return DRAW_NOTHING; });
        }
        // ── The plan, in coverage rather than in pitch ────────────────────────
        //
        // §5.3's ruling on the narrow facet is "give it its second direction and
        // the total D must not move", and the second half is the hard half:
        // measured, simply granting `R2-cube`'s `+X` sliver its missing crossed
        // family takes it from 0.155 to 0.206 while its sibling `+Z` sits at
        // 0.183 — which re-breaks the very O20 ordering Round 9 bought. (I
        // predicted 0.201 from `pen / facetWidth` before running it and measured
        // 0.206; the model is good to 2.5 %.)
        //
        // So the direction is paid for out of the CARRIER. Each family's asked-for
        // coverage is `pen / screenPitch`; a family too wide for its own facet is
        // granted exactly one ruling at `pen / widthOnPaper`, and family A's pitch
        // is then widened by whatever that grant overspent, so the composed total
        // is the total the recipe asked for — see the withdrawal note below.

        const plan = asks.map((q) => {
          const k = uvPitchFactor(scaf, q.deg);
          const screen = Math.max(q.screenPitch, PLOT_FLOOR_MULT_OBJ * penWidth);
          const ext = perpExtentUV(q.deg);
          return {
            k,
            ext,
            plane: screen / k,
            covWant: penWidth / screen,
            covOne: (ext > 0) ? penWidth / Math.max(1e-6, ext * k) : Infinity,
            fits: !(ext > 0) || (screen / k) <= ext,
          };
        });
        plan.forEach((f, i) => {
          // ── A FACET IS RULED, NOT MERELY MARKED (the ceiling's missing twin) ──
          //
          // Round 10 gave this path a copy of `Regions.formCeiling` — the law
          // that says how much ink a zone may carry AT MOST — and nothing that
          // says how little it may carry at all. So a facet could legally come
          // out with one ruling across it, and on the APP DEFAULT it did:
          //
          //   box  face:+Y  40 x 40 mm, zone L   1 ruling   16.3 % bare, gap 12.5 mm
          //   box  face:+X  40 x 40 mm, zone M   2 rulings  19.8 % bare, gap 15.6 mm
          //   plane face:+Y 60 x 60 mm, zone L   1 ruling   77.2 % bare, gap 35.3 mm
          //
          // A stripe or two is not a fill; the facet reads as bare paper with a
          // line on it. The grant below already existed for the count = 0 case
          // ("draw ONE ruling instead of none") — the count is simply wrong. One
          // was never the answer; the answer is whatever the facet's OWN zone
          // ceiling can pay for, up to the point where the facet is ruled.
          //
          // WHY THIS CANNOT FLATTEN THE LADDER. Every grant is bounded above by
          // `zoneCeil / covOne` — the number of rulings the facet's own zone
          // ceiling permits — and the ceilings are ordered F > M > L by
          // construction, so a lighter zone can never be granted its way past a
          // darker one. And the grant only fires on a facet ASKING for fewer
          // than `FACET_MIN_RULINGS`; a facet already ruled is left exactly
          // where Density put it, which is what keeps Density authoritative.
          //
          // Gated on `toneOn` with the rest of the plan machinery, so every
          // untoned golden is byte-identical.
          if (i > 0) return; // carrier only — the §5.3 withdrawal below stands
          if (f.ext > 0 && zoneCeil > 0 && f.covOne > 0 && f.covOne <= zoneCeil) {
            // A GLINT facet gets the SAME floor. §5.5.2 states the cap as
            // "capped, not emptied" — a single ruling across a whole facet is
            // the hole it forbids — and the cap survives the floor because it
            // still sets the PITCH everywhere the facet is wide enough to hold
            // more than the floor. O9 (ink rises as the cone tightens) is read
            // off exactly that and stays green.
            const want = Math.min(Math.floor(zoneCeil / f.covOne), FACET_MIN_RULINGS);
            if (want >= 1) {
              // A MAXIMUM PITCH, not a count top-up. `hatchPolygon` rules at
              // `pMin + i*spacing`, so a pitch that merely DIVIDES into the
              // extent puts its last ruling on the facet's own edge, where it
              // has almost no length. Stating the floor as a pitch — ext/(n+0.5),
              // which yields exactly n rulings, inset off both boundaries —
              // makes the granted and ungranted cases agree at equal n. Stating
              // it as "top up the count when it falls short" did not: a facet
              // granted 3 well-placed rulings out-inked the same facet drawing 3
              // of its own with the last one hugging the edge, and the object's
              // total ink then fell as `highlightSensitivity` rose (O9, -0.16 %).
              const target = f.ext / (want + 0.5);
              if (target < f.plane) { f.plane = target; f.fits = true; return; }
            }
          }
          if (f.fits) return;
          // ── §5.3's SECOND DIRECTION IS MEASURED AND NOT LANDED (Round 10) ────
          //
          // (The `i > 0` guard above is this clause.) The grant is restricted to
          // the CARRIER. Granting it to a crossed
          // family as well — with the carrier widened to pay for it, so the
          // composed total is exactly what the recipe asked for — was built,
          // measured, and withdrawn:
          //
          //   R2-cube  face:+X  0.1515 (A) + 0.0303 (B) intended = 0.1818
          //            granted  0.1358 (A) + 0.0460 (B) landed   = 0.1771
          //            sibling  face:+Z, same zone, same recipe  = 0.1699
          //
          // Both faces are aiming at 0.1818 and both fall short by integer ruling
          // counts; `+X` lands CLOSER to the recipe than `+Z` does, and O20's
          // ordering clause then reads that as `+X` out of order by 0.0072 — a
          // quarter of O20's own 0.03 readability bar. The clause cannot
          // adjudicate two facets of one zone whose intended tone is identical.
          // Rather than prescribe a lever that fails its own criterion, the grant
          // stops at the carrier and the finding goes to the reviewer.
          // A family wider than its own facet draws NOTHING — `hatchPolygon`
          // places rulings at `pMin + i*spacing` for `i = 1 … floor(ext/spacing)`.
          // Reaching here means the grant above could NOT pay for even one ruling
          // inside the zone's composed ceiling (`covOne > zoneCeil`, the 9 mm²
          // sliver at three times its ceiling), so the facet stays bare — a
          // decision with arithmetic behind it rather than the residue of a
          // k-floor chosen to keep the arithmetic finite.
          f.plane = DRAW_NOTHING;
        });
        let served = 0;
        const planeFor = toneOn
          ? (deg, screenPitch) => {
            const f = plan[served++];
            return f ? f.plane
              : Math.max(screenPitch, PLOT_FLOOR_MULT_OBJ * penWidth) / uvPitchFactor(scaf, deg);
          }
          : null;
        // The dark side crosses a second family: the ladder tops out at 1.6x
        // gain, so the core shadow is unreachable by spacing alone (§5.0). The
        // weight is the zone's own formInk.cross — a whole family for T, 0.40 of
        // one for F — so the dip between them is a property of the recipe, not
        // of how tightly the carrier happens to run at the limb.
        crossFamilies(scaf.uv, baseAngle, spacing, styleParams, crossPass, crossW,
          (segs) => maybeLink(segs, styleParams).forEach((l) => uvLines.push(l)), planeFor,
          hatchFloorFor(styleParams.fillDensity));
        return uvLines.map((line) => line.map(scaf.toScreen));
      };

      // Deterministic screen hash (mirrors SurfaceFill.sfHash) for the light-driven
      // per-sample drop dither. Same quantized point → same value, no RNG.
      const ldHash = (a, b) => {
        let h = ((a | 0) * 73856093) ^ ((b | 0) * 19349663);
        h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
      };

      // ── sparse / stippleOut on a GLINT FACET (§5.4 #3, O14) ──────────────────
      //
      // The faceted path used to implement both by scaling the facet's Density
      // down, which made them the SAME drawing — a slightly thinner hatch — and
      // is the collapse O14 measured. They are two different marks, and the
      // curved fill already distinguishes them:
      //
      //   sparse     — keep every Nth RULING (a thinner grating; the surviving
      //                lines stay whole).
      //   stippleOut — thin the ruling itself, per sample, with a keep
      //                probability that RISES with shade, so the ink dissolves
      //                toward the glint and re-forms away from it.
      //
      // Both are deterministic (the same quantized screen point always gives the
      // same hash) and both operate on the SCREEN-space lines, which is the same
      // space SurfaceFill's per-sample dither works in.
      const sparseStepFor = (density) => Math.max(1, Math.round(100 / clamp(finite(density, 25), 1, 100)));
      const STIPPLE_STEP_MM = 2.5;
      const stippleOutLines = (lines, density, shade) => {
        const keepProb = clamp((clamp(finite(density, 25), 1, 100) / 100) * (0.3 + shade * 2), 0, 1);
        const out = [];
        lines.forEach((line) => {
          let run = [];
          let lastDir = null;
          let lastStep = STIPPLE_STEP_MM;
          const flush = () => {
            // A LONE surviving sample is still a stipple mark. Requiring two in a
            // row erased the treatment outright on small facets — a low-poly
            // sphere's glint facets carry only a few short rulings, so every mark
            // (and with it the whole highlight channel and its pen) vanished.
            if (run.length === 1 && lastDir) {
              const h = lastStep * 0.4;
              out.push([
                { x: run[0].x - lastDir.x * h, y: run[0].y - lastDir.y * h },
                { x: run[0].x + lastDir.x * h, y: run[0].y + lastDir.y * h },
              ]);
            } else if (run.length >= 2) out.push(run);
            run = [];
          };
          for (let seg = 0; seg + 1 < line.length; seg++) {
            const a = line[seg]; const b = line[seg + 1];
            const dx = b.x - a.x; const dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1e-6;
            const steps = Math.max(1, Math.round(len / STIPPLE_STEP_MM));
            lastDir = { x: dx / len, y: dy / len };
            lastStep = len / steps;
            for (let s = seg === 0 ? 0 : 1; s <= steps; s++) {
              const tt = s / steps;
              const pt = { x: a.x + dx * tt, y: a.y + dy * tt };
              if (ldHash(Math.round(pt.x * 4), Math.round(pt.y * 4)) < keepProb) run.push(pt);
              else flush();
            }
          }
          flush();
        });
        return out;
      };

      // ── A FACE IS A CHART. The planar substrate the tone laws run on ────────
      //
      // The laws in `surface-fill.js` / `surface-fill-mono.js` are written
      // against a PARAMETRIC CHART: they sample `(a, b)` and are handed a
      // position, a normal, an intensity and the local screen pitch. A flat face
      // has no such chart — but `faceUVScaffold` already gives it the exact
      // planar parameterisation one would synthesise: an in-plane (u, v) frame
      // in world millimetres, anchored to a world axis (so adjacent facets carry
      // comparable rulings), with a uv→world and a uv→screen map. Wrapping that
      // frame in `SurfaceFillMono.emit`'s substrate contract — the same
      // `{ sampleAt, pushRun, penWidth, inkWidth, floorPitch, litMaxPitch,
      // minMarkMM, hash, angleDeg }` object `buildObject` builds for a sphere —
      // runs the mono laws' real implementations on faceted geometry with no
      // faceted variant of any law existing anywhere.
      //
      // THE DOMAIN IS THE FACE'S OWN uv BOX, PADDED. Two things follow from the
      // padding and both are load-bearing:
      //
      //   (1) `makeCtx` treats `b` as PERIODIC — right for a chart whose second
      //       coordinate is a wind, wrong for a planar patch. A law stepping off
      //       the right edge would wrap to the left one and keep drawing a
      //       single stroke straight across the face. With the face's polygon
      //       strictly INSIDE the domain, a wrapped `b` lands in the pad, fails
      //       the polygon test and reads as off-surface — which is what the edge
      //       of a face is.
      //   (2) `sampleAt` returning null outside the face polygon is the ONLY
      //       silhouette guard the substrate needs: `emitPts` / `emitScr` bisect
      //       the crossing back onto the boundary, exactly as they do at a
      //       sphere's limb. Marks outside the face are impossible by
      //       construction, not by a post-clip.
      //
      // COST, AND WHY THE CAP IS ALSO THE RIGHT VISUAL CALL. A mono law owns one
      // chart and budgets itself for a whole object — `voronoiWeb` throws a
      // fixed 26 000 darts, `mazeFill` walks a spanning tree, `turingStripe`
      // runs a reaction — so the work does NOT shrink with the patch. Measured
      // on the shadow-anatomy fixture at the shipped 0.3 mm pen: one chart-
      // wrapped sphere costs 3.5 s (mazeFill) to 13.1 s (turingStripe), and one
      // BOX FACE costs about the same, so the faceted path pays that per front
      // face. A geodesic solid with 40 front faces would therefore cost minutes.
      //
      // It would also look wrong. This file already refuses to hatch a fine
      // tessellation per face ("faces too small to hatch individually") and
      // routes it through the continuous region pass instead; forty independent
      // mazes, one per triangle, is that same defect in a louder form. So the
      // cap is stated on FRONT faces — the ones that would actually be filled —
      // and a record above it draws the ordinary faceted hatch, unchanged.
      // Every platonic solid, every box and every plane sits below it.
      const MONO_MAX_FRONT_FACES = 12;
      // `surface-fill.js` states these three as INK_SPREAD 0.12, PLOT_FLOOR_PEN
      // 2.2 and LIT_MAX_PITCH_PEN 12. They are the envelope a law's own tone map
      // interpolates between, so the faceted substrate must hand over the same
      // numbers or the same law would land on a different ramp on the two paths.
      const MONO_INK_SPREAD = 0.12;
      const MONO_PLOT_FLOOR_PEN = 2.2;
      const monoLitMaxPitch = () => {
        const R = Vectura.Scene3D && Vectura.Scene3D.Regions;
        const pen = (R && Number.isFinite(R.LIT_MAX_PITCH_PEN)) ? R.LIT_MAX_PITCH_PEN : 12;
        return pen * penWidth;
      };
      const uvInPoly = (poly, x, y) => {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const a = poly[i]; const b = poly[j];
          if (!a || !b) continue;
          if ((a.y > y) !== (b.y > y)
            && x < ((b.x - a.x) * (y - a.y)) / ((b.y - a.y) || 1e-12) + a.x) inside = !inside;
        }
        return inside;
      };
      // Returns SCREEN polylines for this face under the asked mono law, or null
      // when the law is not one this path can run — in which case the caller
      // draws the ordinary faceted hatch, unchanged, exactly as before.
      const faceMonoLines = (face, styleParams, normalWorld, mapper, record) => {
        const M = MonoFill();
        const algo = facetedToneLaw(styleParams);
        if (!algo || !M || typeof M.isMono !== 'function' || typeof M.emit !== 'function') return null;
        if (!M.isMono(algo)) return null;
        // Tone off / a draft frame / no lighting to read: the law has nothing to
        // shade with, and a live drag must stay on the cheap hatch.
        if (!toneOn || draft || typeof intensityFn !== 'function') return null;
        if (mapper !== 'hatch' && mapper !== 'crosshatch') return null;
        if (record && Array.isArray(record.faces)) {
          let front = 0;
          for (let i = 0; i < record.faces.length; i++) if (record.faces[i] && record.faces[i].front) front += 1;
          if (front > MONO_MAX_FRONT_FACES) return null;
        }
        const scaf = faceUVScaffold(face, normalWorld);
        if (!scaf || !Array.isArray(scaf.uv) || scaf.uv.length < 3) return null;
        let uLo = Infinity; let uHi = -Infinity; let vLo = Infinity; let vHi = -Infinity;
        for (let i = 0; i < scaf.uv.length; i++) {
          const pt = scaf.uv[i];
          if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
          if (pt.x < uLo) uLo = pt.x;
          if (pt.x > uHi) uHi = pt.x;
          if (pt.y < vLo) vLo = pt.y;
          if (pt.y > vHi) vHi = pt.y;
        }
        if (!(uHi - uLo > 1e-6) || !(vHi - vLo > 1e-6)) return null;
        const PAD = 0.10;
        const u0 = uLo - (uHi - uLo) * PAD; const uSpan = (uHi - uLo) * (1 + 2 * PAD);
        const v0 = vLo - (vHi - vLo) * PAD; const vSpan = (vHi - vLo) * (1 + 2 * PAD);
        const uvAt = (a, b) => ({ x: u0 + a * uSpan, y: v0 + b * vSpan });
        const scrAt = (a, b) => scene.projectWorld(scaf.toWorld(uvAt(a, b)));
        // `nz` is the camera-space normal's z — the "how close to the contour is
        // this sample" measure. On a flat face it is CONSTANT, which is the whole
        // point: a facet has no limb of its own, and the laws that taper at one
        // correctly do nothing here.
        const camNz = (() => {
          if (!G3 || typeof G3.rotatePoint !== 'function' || !scene || !scene.camera) return 1;
          const n = G3.rotatePoint(normalWorld, scene.camera);
          return (n && Number.isFinite(n.z)) ? n.z : 1;
        })();
        const EPSP = 1 / 4096;
        const sampleAt = (a, b) => {
          if (!(a >= 0 && a <= 1) || !(b >= 0 && b <= 1)) return null;
          const uv = uvAt(a, b);
          if (!uvInPoly(scaf.uv, uv.x, uv.y)) return null;
          const world = scaf.toWorld(uv);
          const scr = scene.projectWorld(world);
          if (!scr || !Number.isFinite(scr.x) || !Number.isFinite(scr.y)) return null;
          // The screen derivatives are PUBLISHED, not left to be measured.
          // `makeCtx.frame` falls back to two extra `sampleAt` calls, and within
          // one step of a face edge those land outside the polygon and return
          // null — which would strand every law along the whole boundary. They
          // are lazy (getters) because the 9 312-point lattice pass reads only
          // x / y / I / nz and would otherwise pay for them 9 312 times.
          const aFwd = a + EPSP <= 1; const bFwd = b + EPSP <= 1;
          return {
            x: scr.x, y: scr.y, z: scr.z,
            front: true,
            nz: camNz,
            I: clamp(finite(intensityFn(normalWorld, world), 0), 0, 1),
            S: (typeof specularFn === 'function')
              ? clamp(finite(specularFn(normalWorld, world), 0), 0, 1) : 0,
            wN: normalWorld,
            world,
            get dA() {
              const s = scrAt(aFwd ? a + EPSP : a - EPSP, b);
              if (!s || !Number.isFinite(s.x)) return null;
              const g = aFwd ? 1 : -1;
              return { x: ((s.x - scr.x) / EPSP) * g, y: ((s.y - scr.y) / EPSP) * g };
            },
            get dB() {
              const s = scrAt(a, bFwd ? b + EPSP : b - EPSP);
              if (!s || !Number.isFinite(s.x)) return null;
              const g = bFwd ? 1 : -1;
              return { x: ((s.x - scr.x) / EPSP) * g, y: ((s.y - scr.y) / EPSP) * g };
            },
          };
        };
        // The law's base direction, stated on PAPER. The mono laws rotate in
        // screen space (`C.rot = o.angleDeg + deg`), so handing them the raw
        // in-plane angle would let a grazing face's fill run visibly off the
        // direction every other family on that face uses. Project the in-plane
        // direction and measure it where it lands.
        const userAngle = finite(styleParams.fillAngle, 45);
        const baseAngle = (styleParams.angleRef === 'worldUp' ? worldUpAngleInUV(scaf) : 0) + userAngle;
        const screenAngleDeg = (() => {
          const r = baseAngle * Math.PI / 180;
          const L = Math.max(uSpan, vSpan) * 0.2;
          const c = uvAt(0.5, 0.5);
          const p0 = scene.projectWorld(scaf.toWorld(c));
          const p1 = scene.projectWorld(scaf.toWorld({ x: c.x + Math.cos(r) * L, y: c.y + Math.sin(r) * L }));
          if (!p0 || !p1 || !Number.isFinite(p0.x) || !Number.isFinite(p1.x)) return baseAngle;
          return Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180 / Math.PI;
        })();
        const out = [];
        const sb = spacingBand(normalWorld, styleParams, faceWorldCentroid(face), face, record, null);
        let handled = false;
        try {
          handled = M.emit({
            algo,
            back: false,
            count: 0,
            mapper: mapper === 'crosshatch' ? 'crosshatch' : 'hatch',
            sampleAt,
            pushRun: (run) => {
              if (Array.isArray(run) && run.length >= 2) out.push(run.map((pt) => ({ x: pt.x, y: pt.y })));
            },
            penWidth,
            inkWidth: penWidth * (1 + MONO_INK_SPREAD),
            floorPitch: MONO_PLOT_FLOOR_PEN * penWidth,
            // What the facet's own ladder rung asked for, so Density and the
            // tone band still set the scale the law works at.
            masterPitch: Math.max(penWidth, finite(sb.spacing, hatchSpacing(styleParams.fillDensity))),
            litMaxPitch: monoLitMaxPitch(),
            targetArea: null,
            // Never below the structural emission floor this file has carried
            // since Phase 1 — a sub-pen-width fragment is a pen-down dot, not a
            // mark, on the faceted path exactly as on the curved one.
            minMarkMM: Math.max(MIN_RUN_MM, 2 * penWidth),
            hash: ldHash,
            angleDeg: screenAngleDeg,
          });
        } catch (e) {
          return null; // a law that throws must not take the facet with it
        }
        // `emit` returns true for a law it knows even when the substrate was too
        // small to draw on. An empty result falls back rather than leaving the
        // facet bare — a blank face is the one failure mode this cannot tell
        // apart from a law that legitimately drew nothing.
        return (handled && out.length) ? out : null;
      };

      // I8 — LIGHT-DRIVEN faceted fill. The base tone hatch (dark=dense) still
      // runs; on top of it the actual per-sample specular term S carves the lit
      // glint. Because a POSITIONAL light's direction varies across a flat face,
      // S>0 clusters near the light-facing corner and SPANS the two adjacent
      // faces (the semicircular highlight) — NOT the per-face-uniform band the
      // perFace path uses. Sensitivity stages the drop: 1 = binary (the whole
      // region treated uniformly), N = a gradient (brightest = blankest).
      // Returns { base:[screenLines], hl:[screenLines] } or null (no scaffold →
      // caller uses the plain faceHatchLines path). Deterministic.
      const faceLightDrivenLines = (face, styleParams, normalWorld, crossPass, hlCfg) => {
        if (draft || !specularFn) return null;
        const angleRef = styleParams.angleRef === 'worldUp' ? 'worldUp' : 'face';
        const scaf = faceUVScaffold(face, normalWorld);
        if (!scaf) return null;
        const worldPoint = faceWorldCentroid(face);
        const { spacing, bandIdx } = spacingBand(normalWorld, styleParams, worldPoint);
        const userAngle = finite(styleParams.fillAngle, 45);
        const baseAngle = angleRef === 'worldUp' ? worldUpAngleInUV(scaf) + userAngle : userAngle;
        const uvLines = [];
        // lightDriven places the glint per SAMPLE, so it has no face zone to
        // read; the darkest band buys the same whole second family T does.
        crossFamilies(scaf.uv, baseAngle, spacing, styleParams, crossPass, bandIdx === 0 ? 1 : 0,
          (segs) => uvLines.push(...segs), undefined, hatchFloorFor(styleParams.fillDensity));
        const SREG = 0.025;
        const N = hlCfg.sensitivity;
        const treat = hlCfg.treatment;
        const routeHL = treat === 'dashed' || treat === 'dotted';
        // O15 — `sparse` and `stippleOut` used to fall into the `blank` arm
        // below, so switching highlightMode to lightDriven silently turned a
        // sparse or stippled highlight into a hole. They now thin ON the
        // highlight channel here, exactly as they do under perFace (and exactly
        // as SurfaceFill already does on the curved path).
        const thinHL = treat === 'sparse' || treat === 'stippleOut';
        const sparseStep = sparseStepFor(hlCfg.density);
        const shade = clamp(1 - finite(intensityFn ? intensityFn(normalWorld, worldPoint) : 0, 0), 0, 1);
        const stippleKeep = clamp((clamp(finite(hlCfg.density, 25), 1, 100) / 100) * (0.3 + shade * 2), 0, 1);
        const STEP_MM = 2.5;                         // resample so S varies smoothly across a big face
        const base = []; const hl = [];
        uvLines.forEach((line, lineIndex) => {
          const lineKept = lineIndex % sparseStep === 0;
          let baseRun = []; let hlRun = [];
          const flushBase = () => { if (baseRun.length >= 2) base.push(baseRun); baseRun = []; };
          const flushHL = () => { if (hlRun.length >= 2) hl.push(hlRun); hlRun = []; };
          for (let seg = 0; seg + 1 < line.length; seg++) {
            const a = line[seg]; const b = line[seg + 1];
            const dx = b.x - a.x; const dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1e-6;
            const steps = Math.max(1, Math.round(len / STEP_MM));
            for (let s = seg === 0 ? 0 : 1; s <= steps; s++) {
              const tt = s / steps;
              const uv = { x: a.x + dx * tt, y: a.y + dy * tt };
              const wp = scaf.toWorld(uv);
              const S = specularFn(normalWorld, wp);
              const st = Regions.highlightStage(S, N, SREG);
              const scr = scaf.toScreen(uv);
              if (!st.inRegion) { flushHL(); baseRun.push({ x: scr.x, y: scr.y }); continue; }
              // In the glint: `openness` is the per-sample treatment strength
              // (brightest → ~1). A TREATED sample is rerouted (keep/dashed/dotted
              // → highlight channel) or blanked (blank/sparse → bare paper); an
              // UNTREATED sample stays on the normal base run. sensitivity 1 →
              // openness 1 → whole region treated (binary); N → graded.
              const treated = ldHash(Math.round(scr.x * 4), Math.round(scr.y * 4)) < st.openness;
              if (routeHL) {
                if (treated) { flushBase(); hlRun.push({ x: scr.x, y: scr.y }); }
                else { flushHL(); baseRun.push({ x: scr.x, y: scr.y }); }
              } else if (thinHL) {
                // Untreated samples stay on the base run; treated ones survive
                // only on the HIGHLIGHT channel, sparse by ruling and stippleOut
                // by a shade-weighted per-sample probability.
                if (!treated) { flushHL(); baseRun.push({ x: scr.x, y: scr.y }); }
                else if (treat === 'sparse'
                  ? lineKept
                  : ldHash(Math.round(scr.x * 4) ^ 0x5f3a, Math.round(scr.y * 4)) < stippleKeep) {
                  flushBase(); hlRun.push({ x: scr.x, y: scr.y });
                } else { flushBase(); flushHL(); }
              } else if (treated) { flushBase(); flushHL(); }        // blank glint
              else { flushHL(); baseRun.push({ x: scr.x, y: scr.y }); }
            }
          }
          flushBase(); flushHL();
        });
        return { base, hl };
      };

      // Region fill (contour/spiral/stipple) for a flat face — generated IN THE
      // FACE PLANE (true surface mm) then projected, so density matches hatch and
      // the fill foreshortens with the face. Falls back to a screen-space fill
      // when there is no plane scaffold.
      // True-spiral (Phase 3) controls read off style.params, passed to
      // Mappers.regionFill('spiral', …). pitch omitted ⇒ density-derived spacing;
      // eccentricity omitted ⇒ auto-fit the region aspect.
      const spiralOptsFrom = (styleParams) => ({
        pitch: Number.isFinite(styleParams.spiralPitch) ? styleParams.spiralPitch : undefined,
        center: styleParams.spiralCenter === 'bboxCenter' ? 'bboxCenter' : 'centroid',
        offset: finite(styleParams.spiralAngleOffset, 0),
        axisSnap: styleParams.axisSnap === true,
        eccentricity: Number.isFinite(styleParams.spiralEccentricity) ? styleParams.spiralEccentricity : undefined,
      });

      // Spiral pitch (mm) from Density (I13): Density 100 collapses the pitch
      // toward the pen width so the loops FULLY overlap (max ink, no gaps); lower
      // Density opens it up to ~14mm. An explicit spiralPitch alias still wins
      // (spiralOptsFrom → trueSpiral.pitch); this only sets the density fallback.
      const spiralPitchFor = (density) => clamp(14 - 0.136 * clamp(finite(density, 50), 0, 100), 0.35, 14);
      // Region-fill spacing (mm): the explicit contourStep alias wins over the
      // Density mapping when the user set it (contour only); the spiral uses the
      // full-overlap pitch law above; every other region mapper uses Density.
      const regionSpacingFor = (mapper, styleParams) => {
        if (mapper === 'contour' && Number.isFinite(styleParams.contourStep)) return clamp(styleParams.contourStep, 0.5, 40);
        if (mapper === 'spiral') return spiralPitchFor(finite(styleParams.fillDensity, 50));
        return hatchSpacing(finite(styleParams.fillDensity, 50));
      };

      // Stipple mark options (Phase 2) read off style.params. Absent keys keep
      // the legacy circle / derived radius / 0.7 jitter — a no-op default.
      const stippleOptsFrom = (styleParams) => ({
        dotShape: styleParams.dotShape,
        dotAngle: finite(styleParams.dotAngle, 0),
        stippleJitter: styleParams.stippleJitter,
        ...(Number.isFinite(styleParams.dotSize) ? { dotRadius: clamp(styleParams.dotSize, 0.1, 3) } : {}),
      });

      const faceRegionLines = (face, mapper, normalWorld, styleParams) => {
        if (!Mappers || typeof Mappers.regionFill !== 'function') return [];
        // Region fills (rings/dots/spiral) read the Density slider directly
        // (1–14mm) — NOT the tone spacing, which floors near the pen width for
        // line coverage and would pack thousands of rings/dots. Tone-driven
        // region density is a later refinement.
        const spacing = regionSpacingFor(mapper, styleParams);
        const opts = mapper === 'spiral'
          ? { spacing, ...spiralOptsFrom(styleParams) }
          : mapper === 'stipple'
            ? { spacing, ...stippleOptsFrom(styleParams) }
            : { spacing };
        const scaf = faceUVScaffold(face, normalWorld);
        // Faceted faces are always a flat clip — a genuine spiral in the face
        // plane, projected so it foreshortens with the face.
        if (!scaf) return Mappers.regionFill(mapper, [face.polygon], opts) || [];
        const uvLines = Mappers.regionFill(mapper, [scaf.uv], opts) || [];
        return uvLines.map((line) => line.map(scaf.toScreen));
      };

      // Emit chokepoint — the single home for the shared stroke treatment
      // (line type / wobble / overstroke, Phase 1.1). `tr` is a descriptor from
      // strokeTreatment(style.params); a call site with nothing to apply passes
      // NO_STROKE_TREATMENT. Draft frames keep the (free) dash but skip the
      // geometry-mutating wobble/overstroke so live drags stay responsive.
      // `opts.forceHidden` routes EVERY run (even geometrically-visible ones)
      // through the occluded/dashed branch — this is how x-ray back-face FILLS
      // are emitted (the far surface reads as dashed "seen-through" lines), a
      // generalization of the hiddenTreatment==='dash' edge branch to fills.
      const emitRuns = (runs, baseMeta, hiddenTreatment, hiddenExtras, tr, opts) => {
        const treat = tr || NO_STROKE_TREATMENT;
        const forceHidden = Boolean(opts && opts.forceHidden);
        // `hiddenOnly` drops visible runs and keeps only the occluded (dashed)
        // ones — an x-ray suppressed crease shows its far side, not its front.
        const hiddenOnly = Boolean(opts && opts.hiddenOnly);
        // Per-edge-class overlays (C-06). Only the structural-edge pass passes
        // these; every other caller leaves them undefined ⇒ byte-identical.
        const visibleMeta = opts && opts.visibleMeta;
        const hiddenMeta = opts && opts.hiddenMeta;
        // `opts.chained` — the caller has ALREADY applied the emission floor, to
        // whole welded CHAINS of runs rather than to each run (see
        // `chainedFloorSurvivors`). Re-applying the per-run floor here would
        // re-punch the very holes the chaining just closed. Only the structural
        // edge pass sets it; every other caller leaves it undefined ⇒ the
        // per-run floor is byte-identical to what it always was.
        const chained = Boolean(opts && opts.chained);
        runs.forEach((run) => {
          if (!chained && runLength(run.pts) < MIN_RUN_MM) return;
          if (run.visible && !forceHidden) {
            if (hiddenOnly) return;
            const meta = (treat.active || visibleMeta) ? { ...baseMeta, ...(visibleMeta || {}) } : baseMeta;
            const pts = applyStrokeTreatment(run.pts, treat, meta, draft);
            const path = pathWithMeta(pts, meta);
            if (path.length >= 2) {
              out.push(path);
              if (treat.overstroke && !draft) {
                const dbl = pathWithMeta(overstrokeCopy(pts), meta);
                if (dbl.length >= 2) out.push(dbl);
              }
            }
            return;
          }
          if (hiddenTreatment !== 'dash') return; // solid: hidden runs drop
          const meta = { ...baseMeta, sceneTarget: { ...baseMeta.sceneTarget, occluded: true, ...(hiddenExtras || {}) }, ...(hiddenMeta || {}) };
          const pts = applyStrokeTreatment(run.pts, treat, meta, draft);
          // The hidden class's own dash (when set) is authoritative over the line
          // type applyStrokeTreatment may have stamped; markHidden then keeps it
          // rather than falling back to [3,2].
          if (hiddenMeta && Array.isArray(hiddenMeta.strokeDash)) meta.strokeDash = hiddenMeta.strokeDash.slice();
          const path = pathWithMeta(pts, meta);
          if (path.length >= 2) out.push(markHidden(path));
        });
      };

      // ── Chained emission floor (structural edges) ──────────────────────────
      // `MIN_RUN_MM` exists to suppress visibility CRUMBS: sub-pen-width
      // fragments that draw as a dot at best and only cost pen-down travel.
      // Applied to ONE STICK it does something else entirely. Structural edges
      // are emitted ONE PROJECTED MESH EDGE PER PATH, so raising Fidelity only
      // shortens every stick, until stick after stick falls under the floor and
      // punches a hole in the object OUTLINE — the exact defect the border pass
      // was fixed for, on the Border-OFF path. Measured on a capsule sx18 sy84:
      // 56 of 156 silhouette sticks culled at Fidelity 40, breaking the outline
      // into 14 pieces (28 dangling endpoints); 36 dangling at Fidelity 60.
      // Zeroing MIN_RUN_MM took every one of those to 0, so the cull was the
      // sole cause — the mesh silhouette is one closed loop at every Fidelity.
      //
      // So the floor splits into the two jobs it was always doing at once:
      //
      //   A CLIPPING FRAGMENT — a run on an edge the clipper had to CUT, so one
      //   of its ends is an HLR crossing rather than a mesh vertex — keeps the
      //   per-run floor. That is the floor's original job, and hlr.js's own
      //   bisection comment names it: "corner whiskers collapse below the
      //   emission floor". A whisker is the 0.02mm sliver of an otherwise
      //   occluded crease that survives at a silhouette corner. Dropping it
      //   trims the outline where it ENTERS occlusion; it cannot open a hole,
      //   because a fragment always sits at an occlusion boundary and never in
      //   the interior of a drawn stretch. This trim also SHRINKS as Fidelity
      //   rises (it is bounded by one edge length), so it converges.
      //
      //   A WHOLE EDGE — the clipper returned it uncut — is never a whisker,
      //   however short it is at high Fidelity. It is judged by the WELDED
      //   CHAIN it belongs to, exactly as the border pass judges its stitched
      //   run. A short edge continuing a longer contiguous outline survives; a
      //   genuinely isolated speck, whose ENTIRE chain is under the floor, is
      //   still dropped.
      //
      // Runs are welded on INTEGER MESH VERTEX INDICES, never on screen
      // coordinates, so contiguity cannot depend on float equality and cannot
      // depend on tessellation. Runs come back from the clipper ordered along
      // a→b, so run 0 touches mesh vertex `a` and the last run touches `b`; a
      // single run means the edge was never cut. Visible and hidden (dashed)
      // runs weld in separate classes: they are different ink, and a dashed
      // far-side stretch must not prop up a visible crumb. Only runs that will
      // actually be emitted take part, so an edge whose hidden treatment is
      // 'remove' cannot anchor anything.
      //
      // Returns the Set of runs that clear the floor; the caller passes the
      // filtered runs to `emitRuns` with `chained: true`.
      const chainedFloorSurvivors = (plan) => {
        const runsById = [];
        const lens = [];
        const parent = [];
        const find = (i) => {
          let r = i;
          while (parent[r] !== r) { parent[r] = parent[parent[r]]; r = parent[r]; }
          return r;
        };
        const union = (i, j) => { const a = find(i); const b = find(j); if (a !== b) parent[a] = b; };
        const anchors = new Map();
        plan.forEach((item) => {
          const runs = item.runs || [];
          const last = runs.length - 1;
          // >1 run ⇒ the clipper CUT this edge, so every run on it is a
          // fragment with an HLR crossing for at least one end.
          const cut = runs.length > 1;
          runs.forEach((run, r) => {
            if (!run || !Array.isArray(run.pts) || run.pts.length < 2) return;
            const willEmit = run.visible ? !item.hiddenOnly : item.hidden === 'dash';
            if (!willEmit) return;
            // Sub-floor clipping fragment: a whisker. Dropped outright, and it
            // does not anchor — a whisker must not weld two stretches together.
            if (cut && runLength(run.pts) < MIN_RUN_MM) return;
            const id = runsById.length;
            runsById.push(run);
            lens.push(runLength(run.pts));
            parent.push(id);
            const cls = run.visible ? 'v' : 'h';
            if (r === 0) {
              const k = `${item.a}|${cls}`;
              const prev = anchors.get(k);
              if (prev === undefined) anchors.set(k, id); else union(prev, id);
            }
            if (r === last) {
              const k = `${item.b}|${cls}`;
              const prev = anchors.get(k);
              if (prev === undefined) anchors.set(k, id); else union(prev, id);
            }
          });
        });
        const chainLen = new Map();
        for (let i = 0; i < runsById.length; i++) {
          const root = find(i);
          chainLen.set(root, (chainLen.get(root) || 0) + lens[i]);
        }
        const keep = new Set();
        for (let i = 0; i < runsById.length; i++) {
          if (chainLen.get(find(i)) >= MIN_RUN_MM) keep.add(runsById[i]);
        }
        return keep;
      };

      // Per-vertex normal offset of a screen-space run by `d` mm — used by the
      // silhouette border emphasis to lay parallel over-strikes beside a run.
      // `closed` wraps the tangent window at the seam so an offset LOOP still
      // closes exactly: without it the seam vertex averages a one-sided tangent
      // that no other vertex on the loop shares, and the ring opens by a hair.
      const offsetRun = (pts, d, closed) => {
        const n = pts.length;
        const wrap = closed === true && n > 2;
        const span = n - 1; // distinct vertices on a closed run (pts[0] === pts[n-1])
        const arr = [];
        for (let i = 0; i < n; i++) {
          const ia = wrap ? ((i - 1 + span) % span) : Math.max(0, i - 1);
          const ib = wrap ? ((i + 1) % span) : Math.min(n - 1, i + 1);
          const a = pts[ia];
          const b = pts[ib];
          let tx = b.x - a.x; let ty = b.y - a.y;
          const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
          arr.push({ x: pts[i].x - ty * d, y: pts[i].y + tx * d, z: pts[i].z });
        }
        if (wrap) arr[n - 1] = { ...arr[0] }; // exact closure, not merely near
        return arr;
      };

      // ── Border emphasis (ask #8) ───────────────────────────────────────────
      // Contract: "a border should be a contiguous single outline of the
      // silhouette of a 3d object from the current viewing angle." Multiple
      // loops are legitimate (a torus seen face-on has two); each must be
      // UNBROKEN.
      //
      // WHY THIS IS CHAINED BEFORE IT IS OFFSET
      // ---------------------------------------
      // Structural edges are emitted ONE PROJECTED MESH EDGE PER PATH. The old
      // border offset each 2-point stick along ITS OWN screen normal, so the
      // mesh vertex two adjacent sticks share landed at two different screen
      // points — a gap of 2·d·tan(theta/2) at EVERY vertex. That is the dashed
      // outline. It also defeated the display-stage chain in
      // `Engine._applySceneCurveFinish` (exact-endpoint by design), so 104 of
      // 112 border paths stayed 2-point `meta.straight` sticks even with Curves
      // on and Smoothing 1.00 — and a 2-point path IS a straight line, which no
      // fitter can smooth. That is the lumpy crown. Per-stick `MIN_RUN_MM`
      // culling compounded it: raising Fidelity only shortens every stick, so
      // more of them fell under the floor and punched more holes.
      //
      // So the border is assembled in three stages:
      //   1. CHAIN on integer mesh vertex indices — never on screen coordinates.
      //      Contiguity then cannot depend on float equality, and the loop count
      //      is topological, so it is invariant as Fidelity rises. A vertex of
      //      degree != 2 is a junction and terminates a chain; a branch there
      //      would be arbitrary.
      //   2. STITCH the per-edge HLR runs in traversal order. Each edge is still
      //      clipped individually against its OWN adjacent faces, so hidden-line
      //      removal is bit-for-bit what it was — a genuinely occluded stretch
      //      still breaks the outline, which is correct. Only a run that ends
      //      exactly where the next begins is welded.
      //   3. OFFSET the stitched polyline as a whole (loop-aware), and apply the
      //      MIN_RUN_MM floor to the STITCHED run rather than to each stick.
      //
      // The emitted run is a real polyline with no `straight` flag, so the
      // universal Curves/Smoothing stage can finally fit it.
      //
      // Draft frames skip the border entirely (keeps live drags cheap); a record
      // with no border block never enters here, so default-off output stays
      // byte-identical.
      const BORDER_STEP_MM = 0.12;
      const BORDER_WELD_EPS = 1e-9; // exact-endpoint weld: these ARE the same projected vertex
      // `border.offset` (mm, [-2, 2], negative = inward / positive = outward)
      // shifts the WHOLE multi-pass band by that many mm while preserving the
      // passes' relative spread. Default 0 ⇒ byte-identical to today's output.
      const borderCfg = (record) => {
        const border = record && record.border;
        if (!border || !border.enabled || draft) return null;
        const strength = clamp(finite(border.strength, 1), 0.25, 4);
        return {
          passes: Math.max(1, Math.round(strength * 2)),
          penId: border.penId || null,
          offset: clamp(finite(border.offset, 0), -2, 2),
        };
      };

      // SIGN. A prior pass here hard-coded a single fixed sign, "empirically
      // determined" from one sphere at one fixed camera angle (yaw 0 / pitch
      // 0). That was wrong: offsetRun's per-vertex normal is the LEFT side of
      // the chain's travel direction, and which screen-space winding a
      // silhouette chain gets (CW vs CCW) depends on the camera view and on
      // which edge happens to seed `chainBorderEdges` — it is NOT a fixed
      // property of the codebase. Proof: the exact same sphere at the app's
      // actual default scene camera (yaw -30 / pitch 20 — what every new 3D
      // Scene layer ships with) offset OUTWARD (grows the bbox) at NEGATIVE
      // offset and INWARD at POSITIVE — precisely inverted from the fixed-sign
      // assumption, and reproducible again at yaw 90 (see
      // tests/unit/scene3d-border-offset-geometry.test.js "positive offset
      // stays outward across camera angles (winding-independent)").
      //
      // Fix: determine polarity PER STRIP, not globally. Probe a tiny
      // offsetRun(pts, PROBE_D, loop) and compare each point's distance from
      // the object's projected centroid (avg of record.projected — the WHOLE
      // object's vertices, not just this strip's, so a partial/occluded
      // silhouette segment still reads against the true object center) before
      // vs after the probe nudge. If the probe average distance did not grow,
      // the strip's chain wound the "wrong" way for this view — flip.
      const PROBE_D = 1; // mm; offsetRun is linear in d, so sign is magnitude-independent
      const objectCentroid = (record) => {
        const pts = (record && record.projected) || [];
        let sx = 0; let sy = 0; let n = 0;
        pts.forEach((p) => {
          if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) { sx += p.x; sy += p.y; n += 1; }
        });
        return n ? { x: sx / n, y: sy / n } : { x: 0, y: 0 };
      };
      const stripPolarity = (record, pts, loop, centroid) => {
        if (pts.length < 2) return 1;
        const probe = offsetRun(pts, PROBE_D, loop);
        let before = 0; let after = 0;
        for (let i = 0; i < pts.length; i++) {
          before += Math.hypot(pts[i].x - centroid.x, pts[i].y - centroid.y);
          after += Math.hypot(probe[i].x - centroid.x, probe[i].y - centroid.y);
        }
        return after >= before ? 1 : -1;
      };

      // Chain `items` ({ a, b } integer vertex indices) into maximal runs.
      // Returns [{ seq: [{ i, fwd }], closed }].
      const chainBorderEdges = (items) => {
        const incident = new Map();
        items.forEach((it, i) => {
          [it.a, it.b].forEach((v) => {
            let arr = incident.get(v);
            if (!arr) { arr = []; incident.set(v, arr); }
            arr.push(i);
          });
        });
        // The one continuation off vertex `v` when arriving via edge `from`.
        // Degree != 2 is a junction: never guess a branch.
        const step = (v, from) => {
          const inc = incident.get(v);
          if (!inc || inc.length !== 2) return -1;
          const j = inc[0] === from ? inc[1] : inc[0];
          return j === from ? -1 : j;
        };
        const used = new Array(items.length).fill(false);
        const chains = [];
        items.forEach((_, seed) => {
          if (used[seed]) return;
          used[seed] = true;
          const seq = [{ i: seed, fwd: true }];
          let head = items[seed].a;
          let tail = items[seed].b;
          let closed = false;
          for (;;) {
            const j = step(tail, seq[seq.length - 1].i);
            if (j < 0) break;
            if (used[j]) { if (j === seed) closed = true; break; }
            used[j] = true;
            const fwd = items[j].a === tail;
            seq.push({ i: j, fwd });
            tail = fwd ? items[j].b : items[j].a;
          }
          if (!closed) {
            for (;;) {
              const j = step(head, seq[0].i);
              if (j < 0 || used[j]) break;
              used[j] = true;
              const fwd = items[j].b === head;
              seq.unshift({ i: j, fwd });
              head = fwd ? items[j].a : items[j].b;
            }
          }
          chains.push({ seq, closed });
        });
        return chains;
      };

      // Weld the per-edge HLR runs along one chain into contiguous strips. A
      // hidden run, or a run that does not start exactly where the previous one
      // ended, opens a new strip — those breaks are real occlusion.
      const stitchBorderStrips = (items, chain) => {
        const strips = [];
        let cur = null;
        const flush = () => { if (cur && cur.length >= 2) strips.push(cur); cur = null; };
        chain.seq.forEach(({ i, fwd }) => {
          const runs = items[i].runs || [];
          (fwd ? runs : runs.slice().reverse()).forEach((run) => {
            if (!run || !run.visible || !Array.isArray(run.pts) || run.pts.length < 2) { flush(); return; }
            const pts = fwd ? run.pts : run.pts.slice().reverse();
            if (!cur) { cur = pts.map((q) => ({ ...q })); return; }
            const last = cur[cur.length - 1];
            if (Math.abs(last.x - pts[0].x) > BORDER_WELD_EPS
              || Math.abs(last.y - pts[0].y) > BORDER_WELD_EPS) {
              flush();
              cur = pts.map((q) => ({ ...q }));
              return;
            }
            for (let k = 1; k < pts.length; k++) cur.push({ ...pts[k] });
          });
        });
        flush();
        // The walk starts at an arbitrary edge, so on a closed chain the first
        // and last strips may be two halves of ONE visible stretch. Rejoin them.
        if (chain.closed && strips.length > 1) {
          const first = strips[0];
          const last = strips[strips.length - 1];
          const e = last[last.length - 1];
          const s = first[0];
          if (Math.abs(e.x - s.x) <= BORDER_WELD_EPS && Math.abs(e.y - s.y) <= BORDER_WELD_EPS) {
            strips.pop();
            strips[0] = last.concat(first.slice(1));
          }
        }
        return strips;
      };

      const emitBorderChains = (record, collected) => {
        const cfg = borderCfg(record);
        if (!cfg || !collected.length) return;
        const centroid = objectCentroid(record);
        // Partition by the pen the emphasis will actually draw with, so a chain
        // can never silently recolour halfway round. With an explicit border pen
        // every edge lands in one bucket, which is the common case.
        const buckets = new Map();
        collected.forEach((it) => {
          const key = cfg.penId || (it.baseMeta.penId || '');
          let arr = buckets.get(key);
          if (!arr) { arr = []; buckets.set(key, arr); }
          arr.push(it);
        });
        buckets.forEach((items) => {
          chainBorderEdges(items).forEach((chain) => {
            const src = items[chain.seq[0].i].baseMeta;
            stitchBorderStrips(items, chain).forEach((pts) => {
              if (runLength(pts) < MIN_RUN_MM) return;
              const loop = pts.length > 2
                && Math.abs(pts[0].x - pts[pts.length - 1].x) <= BORDER_WELD_EPS
                && Math.abs(pts[0].y - pts[pts.length - 1].y) <= BORDER_WELD_EPS;
              // Polarity is per-STRIP: this chain's own screen-space winding
              // (camera- and topology-dependent) decides which raw sign of
              // offsetRun's `d` reads as "outward" for it. See stripPolarity.
              const polarity = stripPolarity(record, pts, loop, centroid);
              for (let k = 1; k <= cfg.passes; k++) {
                const sign = (k % 2 === 0) ? 1 : -1;
                // Shift the whole band by `offset`, spread between passes
                // untouched. `polarity` corrects offsetRun's raw `d` so
                // POSITIVE here always means outward regardless of winding.
                const mag = polarity * (sign * BORDER_STEP_MM * Math.ceil(k / 2) + cfg.offset);
                const meta = {
                  ...src,
                  sceneTarget: { ...src.sceneTarget },
                  ...(cfg.penId ? { penId: cfg.penId } : {}),
                };
                // A stitched run is a polyline, not a stick: drop the `straight`
                // refusal so the universal curve stage can fit it.
                if (pts.length > 2) delete meta.straight;
                if (loop) meta.closed = true;
                const path = pathWithMeta(offsetRun(pts, mag, loop), meta);
                if (path.length >= 2) out.push(path);
              }
            });
          });
        });
      };

      // X-ray (Phase 6) config read off a style.params bag. `visibility:'xray'`
      // on the object is the on/off; these shape it. Back-face fills default ON
      // (the actual fix), dashed, at 0.4× density, inheriting the object pen.
      const STROKE_LINE_TYPES = ['solid', 'dashed', 'dotted', 'dashdot'];
      const xrayCfg = (sp) => {
        const s = sp || {};
        return {
          backFaces: s.xrayBackFaces !== false,
          hiddenEdges: s.xrayHiddenEdges !== false,
          backDensity: clamp(finite(s.xrayBackDensity, 0.4), 0.2, 1),
          backLineType: STROKE_LINE_TYPES.includes(s.xrayBackLineType) ? s.xrayBackLineType : 'dashed',
          backPenId: (typeof s.xrayBackPenId === 'string' && s.xrayBackPenId) ? s.xrayBackPenId : null,
          front: s.xrayFront === 'faded' ? 'faded' : 'solid',
          depthCue: XRAY_DEPTH_CUES.includes(s.xrayDepthCue) ? s.xrayDepthCue : 'off',
        };
      };

      // ── Quantitative X-ray, interpretation A (depth-cued see-through fill).
      // Map a NORMALIZED depth gap (0 = flush behind the front surface, 1 =
      // deepest material) to a see-through back-fill look: a DENSITY keep-fraction
      // and/or a stroke WEIGHT scale. Deterministic (no RNG): the density keep is a
      // golden-ratio low-discrepancy dither over a FULL-density hatch, so deeper
      // material keeps more lines (reads denser); weight ramps faint→heavy with
      // depth. 'off' (default) never touches the flat x-ray path ⇒ byte-identical.
      const XRAY_DEPTH_CUES = ['off', 'density', 'weight', 'both'];
      const XRAY_CUE_MIN_KEEP = 0.25; // shallowest kept fraction of the full hatch
      const XRAY_CUE_W_LO = 0.5;      // faint stroke at the front surface
      const XRAY_CUE_W_HI = 2.2;      // heavy stroke deep in the material
      const cueKeepFraction = (norm) => XRAY_CUE_MIN_KEEP + (1 - XRAY_CUE_MIN_KEEP) * clamp(norm, 0, 1);
      const cueWeightScale = (norm) => clamp(XRAY_CUE_W_LO + (XRAY_CUE_W_HI - XRAY_CUE_W_LO) * clamp(norm, 0, 1), 0.1, 6);
      const cueDitherKeep = (idx, keep) => ((idx * 0.6180339887498949) % 1) < keep; // low-discrepancy, deterministic
      const round3 = (val) => Math.round(val * 1000) / 1000;
      const pipXY = (x, y, poly) => {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const yi = poly[i].y; const yj = poly[j].y;
          if (((yi > y) !== (yj > y))
            && (x < (poly[j].x - poly[i].x) * (y - yi) / (yj - yi) + poly[i].x)) inside = !inside;
        }
        return inside;
      };
      // Screen-depth extent of an object's projected faces, plus the frontmost
      // (nearest, largest-z) FRONT support plane covering a screen point — the
      // reference the back-fill gap is measured against. Falls back to the object
      // near bound where no front plane covers the point (design v1).
      const objDepthBounds = (record) => {
        let zMin = Infinity; let zMax = -Infinity;
        record.faces.forEach((f) => (f.polygon || []).forEach((v0) => {
          if (v0.z < zMin) zMin = v0.z;
          if (v0.z > zMax) zMax = v0.z;
        }));
        const extent = (zMax - zMin) > 1e-6 ? (zMax - zMin) : 1;
        return { zMin, zMax, extent };
      };

      // ── Highlight treatments (Phase 4): the top tone band(s) render as a
      // chosen treatment instead of ALWAYS dropping to bare paper. Read off a
      // style.params bag. `blank` (default) is a strict no-op — every highlight
      // branch below is gated on treatment !== 'blank', so toned output with the
      // default is byte-identical to pre-Phase-4.
      // 'none' (formerly 'keep') is a TOTAL bypass, not a subtle treatment — see
      // the note on HIGHLIGHT_TREATMENTS in params.js. `keep` is accepted as a
      // silent alias so saved documents render identically.
      const HIGHLIGHT_TREATMENTS = ['blank', 'none', 'dashed', 'dotted', 'sparse', 'altFill', 'burst', 'stippleOut'];
      const highlightCfg = (sp) => {
        const s = sp || {};
        const raw = s.highlightTreatment === 'keep' ? 'none' : s.highlightTreatment;
        const treatment = HIGHLIGHT_TREATMENTS.includes(raw) ? raw : 'blank';
        return {
          treatment,
          // I8 — light-driven highlight/shadow. mode 'lightDriven' places the
          // highlight by the per-sample specular term; sensitivity/shadowSensitivity
          // are stage counts (1 = binary, N = graded). All default to the no-op.
          mode: s.highlightMode === 'lightDriven' ? 'lightDriven' : 'perFace',
          sensitivity: clamp(Math.round(finite(s.highlightSensitivity, 1)), 1, 6),
          shadowSensitivity: clamp(Math.round(finite(s.shadowSensitivity, 1)), 1, 6),
          bands: clamp(Math.round(finite(s.highlightBands, 1)), 1, 2),
          penId: (typeof s.highlightPenId === 'string' && s.highlightPenId) ? s.highlightPenId : null,
          density: clamp(finite(s.highlightDensity, 25), 1, 100),
          // W-02 follow-up (drift guard) — this used to be a SECOND literal
          // Set([...same five mappers...]) alongside module-scope SURFACE_FILL
          // (line ~195). Both answer "is this one of the five surface-fill
          // mappers?"; reading SURFACE_FILL directly (same IIFE closure, in
          // scope here) collapses the two to ONE literal, so they cannot drift
          // apart. See SURFACE_FILL's own comment and the exported
          // `Vectura.Scene3D.SURFACE_FILL_MAPPERS` mirror below.
          altFillMapper: SURFACE_FILL.has(s.altFillMapper) ? s.altFillMapper : 'stipple',
          burstCount: clamp(Math.round(finite(s.burstCount, 16)), 6, 48),
          burstCenter: s.burstCenter === 'centroid' ? 'centroid' : 'specular',
        };
      };
      // Total tone-band count (ladder length is authoritative) and the highlight
      // predicate: a sample/face is in the highlight band when its band index is
      // within the top `bands` of the ladder. Only meaningful when tone is on.
      const nBands = (p.tone && Array.isArray(p.tone.ladder) && p.tone.ladder.length) ? p.tone.ladder.length : 3;
      const isHighlightBand = (I, bands) => toneOn && Regions.band(I, p.tone) >= (nBands - clamp(bands, 1, 2));
      // The line type stamped on dashed/dotted highlight runs.
      const hlLineType = (treatment) => (treatment === 'dotted' ? 'dotted' : 'dashed');

      // Mean WORLD position of every vert across a record's faces — the point a
      // co-located emissive light sits at (the object's centroid). null when the
      // record carries no world verts (e.g. a draft/degenerate assembly).
      const recordWorldCentroid = (record) => {
        let x = 0; let y = 0; let z = 0; let c = 0;
        (record.faces || []).forEach((face) => {
          const wv = face && face.worldVerts;
          if (!Array.isArray(wv)) return;
          for (let i = 0; i < wv.length; i++) {
            const pw = wv[i];
            if (pw && Number.isFinite(pw.x) && Number.isFinite(pw.y) && Number.isFinite(pw.z)) {
              x += pw.x; y += pw.y; z += pw.z; c += 1;
            }
          }
        });
        return c ? { x: x / c, y: y / c, z: z / c } : null;
      };

      // ── Emissive contribution (Phase 7): every ENABLED emissive object injects
      // a co-located POINT light at its world centroid (range 0 ⇒ pure Lambert,
      // no distance falloff — a legible, monotonic lift on the surfaces it faces).
      // `_srcId` lets the per-record reassignment exclude the emitter from lighting
      // ITSELF (its glow is the self-render below). No emissive objects ⇒ empty
      // list ⇒ activeLights stays === p.lights (byte-identical regression pin).
      const emissiveLights = [];
      scene.objects.forEach((record) => {
        const src = objById.get(record.id);
        const em = src && src.emissive;
        if (!em || !em.enabled) return;
        const c = recordWorldCentroid(record);
        if (!c) return;
        emissiveLights.push({ type: 'point', position: c, intensity: em.intensity, range: 0, _srcId: record.id });
      });

      const records = scene.ground ? scene.objects.concat([scene.ground]) : scene.objects;

      records.forEach((record) => {
        // Shade THIS record under the scene lights plus every OTHER object's
        // emissive point light (self excluded). Empty emissive list ⇒ p.lights.
        activeLights = emissiveLights.length
          ? p.lights.concat(emissiveLights.filter((e) => e._srcId !== record.id))
          : p.lights;
        // Emissive self-render config for this object (never the ground).
        const emSrc = objById.get(record.id);
        const emCfg = (emSrc && emSrc.emissive && emSrc.emissive.enabled && record.id !== 'ground')
          ? emSrc.emissive : null;
        const emissiveCoreBlank = Boolean(emCfg && emCfg.coreBlank);
        // F7b — analytic self-occlusion depth source (torus only; see
        // `Scene3D.TorusOcclusion` and `hlr.js`'s `hiddenAt` for why the
        // mesh-based test alone (SELF_OCCLUDE_BIAS) can miss a shallow cusp
        // crossing). Built ONCE per record — cheap closures only, the actual
        // per-vertex quartic solve happens lazily inside `hiddenAt` and only
        // for a genuinely non-convex torus. `null` for every other primitive
        // and for a convex torus-shaped edge case (never happens today, but
        // keeps this strictly additive), so nothing else changes.
        const torusChartSizes = (record.primitive === 'torus' && !record.convex)
          ? (curvedChartParams(emSrc || {}) || {}).sizes : null;
        const torusAnalyticHidden = (torusChartSizes && Vectura.Scene3D && Vectura.Scene3D.TorusOcclusion)
          ? Vectura.Scene3D.TorusOcclusion.buildSelfOcclusionTest(
            (emSrc || {}).transform, scene.camera, scene.projOpts, torusChartSizes,
            { marginMm: TORUS_SELF_OCCLUDE_ANALYTIC_MARGIN_MM, dilateRadiusMm: TORUS_SELF_OCCLUDE_DILATE_RADIUS_MM })
          : null;
        // X-ray fold: x-ray's SEE-THROUGH FILLS stay coupled to visibility — the
        // occluded BASE-FILL / face-outline dash is a fills concern (the far
        // surface reads through), independent of edgeStyles.hidden. Only the pure
        // hidden-EDGE treatment (dash vs drop of the structural edge pass below)
        // moves to edgeStyles.hidden. So this stays exactly as pre-fold.
        const hiddenTreatment = record.visibility === 'xray' ? 'dash' : 'remove';
        // Object-scope x-ray settings (drive the see-through back-face FILL loop +
        // the hidden-only crease-over-fill). Per-fill details re-read the style below.
        const xrayOn = record.visibility === 'xray';
        const recXray = xrayOn ? xrayCfg((resolveStyle(record.id, null).params) || {}) : null;
        const styleOf = (face) => resolveStyle(record.id, face.faceId);
        // Flat/faceted primitives (box, plane, polyhedra) hatch per face so each
        // planar face fills in its own orientation. Curved primitives are a fine
        // tessellation whose faces are too small to hatch individually — they
        // hatch as ONE continuous surface region (see the union-hatch pass
        // after the face loop).
        const faceted = record.primitive === 'box'
          || record.primitive === 'plane'
          || record.primitive === 'solid'
          || record.id === 'ground';
        // NOTE: a CSG carve is deliberately NOT faceted. Its BSP output splits
        // every coplanar face into many small T-junctioned triangles, so per-face
        // in-plane hatch would phase-fragment across the seam (each fragment
        // hatched independently → broken-looking fill). CSG units therefore route
        // through the continuous front-region path below (the same clean path the
        // curved cut uses), which merges all coplanar front faces into one region
        // and hatches it continuously. `record.csgFaceted` is retained as metadata
        // but no longer steers the hatch path.

        // Edge classification (silhouette | crease | boundary | interior),
        // computed ONCE per record. Round 10 removed its second consumer: the
        // face-outline pass used to re-derive "is this face segment part of the
        // object outline?" from the same table the structural edge pass consults,
        // which is exactly why the two drew the same segments (§5.7). The
        // structural edge pass (further down) is now the sole reader.
        const classified = Edges.classifyEdges(record, {});
        // MERGE NOTE (shadow-anatomy R8-10 × p4). Both branches edited this block
        // and they are complementary, not rival, answers to "who owns the object
        // outline". shadow-anatomy retired the per-face outline pass; p4 made the
        // surviving structural edge pass CONTIGUOUS. Composed, the outline has
        // exactly one owner and that owner is unbroken:
        //   • shadow-anatomy deleted the face-outline pass and with it the ONLY
        //     consumer of the `edgeClsById` / `edgeKey3` / `isOutlineFaceEdge`
        //     lookup, so those three are dropped here as dead code.
        //   • p4's `borderEdges` / `edgePlan` never read that lookup. They key on
        //     the RAW `entry.cls` inside the `classified.forEach` edge loop below,
        //     so they are wholly independent of the deletion and are kept verbatim.
        // Net: a faceted 'none' prim no longer double-plots its outline (the face
        // pass and the edge pass used to emit byte-identical coordinates), and the
        // single remaining pass is the chained/welded one, so the silhouette it
        // draws is contiguous at every Fidelity.

        // Border emphasis buffer: the object's silhouette/boundary edges plus
        // their HLR runs, chained + emitted once after the edge loop below.
        const borderWanted = Boolean(borderCfg(record));
        const borderEdges = [];
        // Structural edge buffer: every edge's HLR runs plus the emission
        // decisions already taken for it. Emitted once after the edge loop, so
        // the emission floor can be applied to WELDED CHAINS instead of to each
        // 2-point stick (`chainedFloorSurvivors`). Buffering does not reorder
        // anything — the entries emit in edge order, still ahead of the border
        // pass — so `out` keeps the order it always had.
        const edgePlan = [];

        // ── X-ray back-face fills (faceted prims, Phase 6): the FAR planar
        // faces, hatched at reduced density and dashed so the near surface is
        // seen through. Emitted via forceHidden (the object never occludes its
        // own fill, so these read as dashed "seen-through" lines). Gated strictly
        // on x-ray + fastPreview-off so solid output is byte-identical and live
        // drags stay cheap.
        //
        // PAINT-ORDER FIX (fs-b2): this block runs BEFORE the front-face fill
        // loop below, not after. `out` is array-order paint order for the
        // canvas (Renderer.drawLayers has no z-sort) AND determines the SVG
        // export's first-seen pen-group order (UI.getExportSnapshot buckets
        // by effective pen in the order each pen key is first encountered
        // walking this same array). Emitting back-face fills first makes them
        // BEHIND the front fill on canvas and puts a distinct back pen's <g>
        // ahead of the front pen's <g> in the export — the far/see-through
        // surface no longer paints or plots on top of the near one. Nothing
        // here reads state the front-face loop builds (clipper occlusion is a
        // static precomputed structure, independent of emission order), so
        // the move changes only ordering, not geometry.
        if (faceted && xrayOn && recXray.backFaces && !draft) {
          // Depth-cue reference (interpretation A): the object's screen-depth
          // extent and the frontmost FRONT support plane covering a screen point.
          const bounds = objDepthBounds(record);
          const frontPlanes = [];
          record.faces.forEach((f) => {
            if (!f.front) return;
            const pl = HLR.fitSupportPlane(f.polygon);
            if (pl) frontPlanes.push({ poly: f.polygon, plane: pl });
          });
          const frontDepthAt = (x, y) => {
            let best = -Infinity;
            for (let i = 0; i < frontPlanes.length; i++) {
              const fp = frontPlanes[i];
              if (!pipXY(x, y, fp.poly)) continue;
              const d = fp.plane.A * x + fp.plane.B * y + fp.plane.C;
              if (d > best) best = d; // frontmost = largest depth (nearest)
            }
            return best === -Infinity ? bounds.zMax : best; // fallback: object near bound
          };
          record.faces.forEach((face) => {
            if (face.front) return; // back faces only
            const style = styleOf(face);
            if (!SURFACE_FILL.has(style.mapper)) return;
            const plane = HLR.fitSupportPlane(face.polygon);
            if (!plane) return;
            const sp = style.params || {};
            const xr = xrayCfg(sp);
            if (!xr.backFaces) return;
            const cue = xr.depthCue;
            const cueDensity = cue === 'density' || cue === 'both';
            const cueWeight = cue === 'weight' || cue === 'both';
            // Density-cued fills are generated at FULL density and thinned per-line
            // by depth (deep keeps more); off/weight keep today's uniform reduced
            // density = a scaled-down Density slider (lower ⇒ wider spacing).
            const genDensity = cueDensity
              ? finite(sp.fillDensity, 50)
              : finite(sp.fillDensity, 50) * xr.backDensity;
            const backParams = { ...sp, fillDensity: genDensity };
            const lines = REGION_MAPPERS.has(style.mapper)
              ? faceRegionLines(face, style.mapper, face.normalWorld, backParams)
              : faceHatchLines(face, backParams, face.normalWorld, style.mapper === 'crosshatch');
            const backTreat = strokeTreatment({ ...sp, lineType: xr.backLineType, wobble: 0, overstroke: false });
            const target = sceneTargetMeta(record.id, face, null, face.centroidZ, false);
            const backMeta = {
              algorithm: 'scene3d',
              kind: 'sceneFill',
              sceneTarget: { ...target, xrayBack: true },
              ...(xr.backPenId ? { penId: xr.backPenId } : (style.penId ? { penId: style.penId } : {})),
            };
            // F7: a non-convex object's own far/hidden faces can still hide
            // BEHIND further faces of itself (record.convex gates this —
            // see scene.js's isConvexObject); a convex one keeps the
            // byte-identical "never self-occlude" fast path.
            const backCtx = { objectId: record.id, selfObject: true, selfOcclude: !record.convex, analyticOccluder: torusAnalyticHidden };
            let backLineIdx = 0;
            lines.forEach((line) => {
              const pts = line.map((pt) => ({
                x: pt.x, y: pt.y, z: plane.A * pt.x + plane.B * pt.y + plane.C,
              }));
              if (cue === 'off') {
                const fillClip = clipper.clipPath(pts, backCtx);
                emitRuns(fillClip.runs, backMeta, 'dash', null, backTreat, { forceHidden: true });
                return;
              }
              // Depth gap at the line midpoint: how far this back sample sits
              // BEHIND the nearest front surface, normalized over the object depth.
              const mid = pts[(pts.length / 2) | 0] || pts[0];
              const norm = clamp((frontDepthAt(mid.x, mid.y) - mid.z) / bounds.extent, 0, 1);
              const idx = backLineIdx++;
              if (cueDensity && !cueDitherKeep(idx, cueKeepFraction(norm))) return; // thinned (shallow)
              const lineMeta = {
                ...backMeta,
                sceneTarget: { ...backMeta.sceneTarget, xrayDepth: round3(norm) },
                ...(cueWeight ? { weightScale: round3(cueWeightScale(norm)) } : {}),
              };
              const fillClip = clipper.clipPath(pts, backCtx);
              emitRuns(fillClip.runs, lineMeta, 'dash', null, backTreat, { forceHidden: true });
            });
          });
        }

        // ── Faces: outlines (closed when fully visible) + hatch fills.
        record.faces.forEach((face) => {
          if (!face.front) return;
          const style = styleOf(face);
          if (style.mapper === 'wireframe') return; // edges only for this face
          // contourSlice REPLACES per-face outlines/fills with depth-slice
          // cross-sections (emitted once per record, after this loop). Suppress
          // the normal face pass so the slices read as the surface. The object's
          // silhouette still draws via the structural-edge pass below.
          if (style.mapper === 'contourSlice') return;
          // A surface fill (hatch, and later spiral/contour/…) REPLACES the
          // per-face wireframe: the face outline and its crease edges are
          // suppressed so the treatment reads as the surface, not confetti over
          // a mesh. The shape's real outline still comes from silhouette +
          // boundary edges below. Face picking survives via the hatch lines,
          // which carry the full face outline as pickPolygon.
          const surfaceFill = SURFACE_FILL.has(style.mapper);
          const faceTreat = strokeTreatment(style.params);
          const segCtx = { ownerKeys: [face.key], objectId: record.id };
          const target = sceneTargetMeta(record.id, face, null, face.centroidZ, false);
          const pickPolygon = face.polygon.map((pt) => ({ x: pt.x, y: pt.y }));
          // NO per-face outline pass. "None" shows just the object OUTLINE, and
          // the structural edge pass below is its sole owner — for curved
          // (tessellated) prims it always was, and as of Round 10 for faceted
          // prims (box, plane, polyhedra, ground) too.
          //
          // THE GROUND DOUBLE-PLOT (Round 9 scorecard §5.7, Round 10 P0).
          // This used to be `!faceted && !surfaceFill`, so a FACETED prim under a
          // non-surface-fill mapper ran a face-outline pass that walked each front
          // face's edges and drew the ones that are neither `crease` nor
          // `interior` — that is, exactly the silhouette + boundary set. The
          // structural edge pass drops `interior` and (for a non-wireframe)
          // `crease` and draws exactly the same set. The two therefore emitted
          // byte-identical coordinates, and the old comment here said so out loud
          // ("documented double-draw"). Documenting a defect does not discharge
          // it: on the shadow-anatomy fixture's `mapper: 'none'` ground that is 4
          // paths / 1520.96 mm of pen retracing the same four long lines, doubling
          // ink and pen wear for no visual gain. Every D-based measurement was
          // blind to it (a raster counts a pixel inked twice as one dark pixel),
          // which is why it survived nine rounds.
          //
          // WHY THE EDGE PASS IS THE ONE THAT SURVIVES. It is strictly richer: it
          // owns per-edge-class EdgeStyles, border emphasis, the per-object hidden
          // treatment, the x-ray hidden-only crease, and `kind: 'sceneEdge'`, which
          // is what edge-mode picking keys on. The face pass owned none of that.
          //
          // WHY PICKING SURVIVES. `pickPolygon` is only consulted by the renderer
          // for `sceneFace`/`sceneFill` point-in-poly, and a faceted 'none' face is
          // covered without it by the renderer's real projected-face pass
          // (`_scenePickFaces` → `_scenePolyDepthAt`), which re-derives front faces
          // from the scene assembly and needs the object merely to be PRESENT in
          // the emitted paths — the structural edges keep it present. That pass
          // exists precisely for "a 'none'-mapper box (no emitted face) and the
          // ground plane", and it supplies a truer per-pixel depth than the face
          // centroid this pass stamped. `pickPolygon` is still built and attached
          // to the surface-FILL metas below, which do rely on it.

          // coreBlank (emissive self-render): leave the emitter's own surface
          // fill blank so the core reads as bright/glowing. Outlines + edges still
          // draw (the shape stays legible); only the interior fill is dropped.
          if (faceted && surfaceFill && !emissiveCoreBlank) {
            const plane = HLR.fitSupportPlane(face.polygon);
            if (plane) {
              const styleParams = style.params || {};
              // Highlight treatment (Phase 4) on a FACETED prim is per-FACE band:
              // a face in the top tone band(s) renders with the object's chosen
              // treatment. 'blank'/'keep' = the normal hatch (byte-identical);
              // burst/altFill blank the face (the region pass fills it); dashed/
              // dotted dash it on the highlight pen; sparse/stippleOut thin it by
              // scaling the Density down.
              const faceHL = highlightCfg(styleParams);
              // I8 — LIGHT-DRIVEN faceted fill: the highlight is placed by the
              // per-sample specular term (a localized glint spanning faces near a
              // point light), not the per-face tone band. Engaged for LINE mappers
              // (hatch/crosshatch) with tone on and not a draft frame; region
              // mappers fall through to the perFace path. burst/altFill keep using
              // the region pass (the base fill is suppressed as before).
              // `none` is a total bypass — not even lightDriven may re-route this
              // face's ink (Jay, 2026-08-09).
              const faceLD = toneOn && !draft && faceHL.mode === 'lightDriven'
                && faceHL.treatment !== 'none'
                && !REGION_MAPPERS.has(style.mapper)
                && faceHL.treatment !== 'burst' && faceHL.treatment !== 'altFill';
              if (faceLD) {
                const ld = faceLightDrivenLines(face, styleParams, face.normalWorld,
                  style.mapper === 'crosshatch', faceHL);
                if (ld) {
                  const dashLD = faceHL.treatment === 'dashed' || faceHL.treatment === 'dotted';
                  const zAt = (pt) => plane.A * pt.x + plane.B * pt.y + plane.C;
                  const baseMetaLD = {
                    algorithm: 'scene3d', kind: 'sceneFill',
                    sceneTarget: { ...target, pickPolygon },
                    ...(style.penId ? { penId: style.penId } : {}),
                  };
                  ld.base.forEach((line) => {
                    const pts = line.map((pt) => ({ x: pt.x, y: pt.y, z: zAt(pt) }));
                    const clip = clipper.clipPath(pts, segCtx);
                    emitRuns(clip.runs, baseMetaLD, hiddenTreatment, null, faceTreat);
                  });
                  const hlTreatLD = dashLD
                    ? strokeTreatment({ ...styleParams, lineType: hlLineType(faceHL.treatment), wobble: 0, overstroke: false })
                    : faceTreat;
                  const hlMetaLD = {
                    algorithm: 'scene3d', kind: 'sceneFill',
                    sceneTarget: { ...target, pickPolygon, highlight: true },
                    ...(faceHL.penId ? { penId: faceHL.penId } : (style.penId ? { penId: style.penId } : {})),
                  };
                  ld.hl.forEach((line) => {
                    const pts = line.map((pt) => ({ x: pt.x, y: pt.y, z: zAt(pt) }));
                    const clip = clipper.clipPath(pts, segCtx);
                    emitRuns(clip.runs, hlMetaLD, hiddenTreatment, null, hlTreatLD);
                  });
                  return; // lightDriven handled this face
                }
              }
              // O14 — the H zone is the SPECULAR GLINT FACET SET (§5.5.2), not
              // "is this face in the top tone band". Under an ordinary sun no
              // face of a cube ever reached the top band, so this predicate was
              // false for every face and every treatment fell through to the
              // same untreated hatch.
              const faceIsHL = toneOn && faceHL.treatment !== 'blank' && faceHL.treatment !== 'none'
                && faceIsGlint(face.normalWorld, faceWorldCentroid(face), record, styleParams);
              const suppressFill = faceIsHL && (faceHL.treatment === 'burst' || faceHL.treatment === 'altFill');
              if (!suppressFill) {
                const fillParams = styleParams;
                // Draft (live drag) always renders the cheap screen-space hatch so
                // a coalesced frame stays responsive; full quality dispatches the
                // real mapper. Line fills (hatch/crosshatch) hatch IN-PLANE for the
                // 3D read; region fills (contour/spiral/stipple) fill the projected
                // face polygon and are mapped back onto the plane below.
                let lines;
                if (draft || !REGION_MAPPERS.has(style.mapper)) {
                  // The former `keep` branch (render the highlight face at FULL
                  // density instead of the ladder's cap) is gone with the
                  // treatment: `none` must leave the fill exactly as the ladder
                  // made it, which means not overriding the spacing either.
                  // THE TONE LAW GETS FAMILY A FIRST. A mono law owns the whole
                  // of this facet's fill — the same contract it has on the
                  // curved path, where `monoMapper` short-circuits the family /
                  // terminator-cross / shadow-infill schedule outright, because
                  // its spacing IS the complete tone statement and a second
                  // family would put marks at a clearance the law did not
                  // choose. `null` ⇒ the law is not one this path can run, and
                  // the ordinary faceted hatch below is untouched.
                  lines = faceMonoLines(face, fillParams, face.normalWorld, style.mapper, record)
                    || faceHatchLines(face, fillParams, face.normalWorld, style.mapper === 'crosshatch', record, null);
                } else {
                  lines = faceRegionLines(face, style.mapper, face.normalWorld, fillParams);
                }
                // The glint facet's own treatment. `blank` needs nothing here —
                // spacingBand already capped its coverage to the H step.
                if (faceIsHL && faceHL.treatment === 'sparse') {
                  const step = sparseStepFor(faceHL.density);
                  lines = lines.filter((_, i) => i % step === 0);
                } else if (faceIsHL && faceHL.treatment === 'stippleOut') {
                  const shade = clamp(1 - finite(intensityFn
                    ? intensityFn(face.normalWorld, faceWorldCentroid(face)) : 0, 0), 0, 1);
                  lines = stippleOutLines(lines, faceHL.density, shade);
                }
                const dashHL = faceIsHL && (faceHL.treatment === 'dashed' || faceHL.treatment === 'dotted');
                const emitTreat = dashHL
                  ? strokeTreatment({ ...styleParams, lineType: hlLineType(faceHL.treatment), wobble: 0, overstroke: false })
                  : faceTreat;
                const fillMeta = {
                  algorithm: 'scene3d',
                  kind: 'sceneFill',
                  // Face pick surface: with the outline suppressed, the hatch
                  // lines carry the face outline so a click still resolves.
                  sceneTarget: { ...target, pickPolygon, ...(faceIsHL ? { highlight: true } : {}) },
                  // O11 — the highlight pen used to be gated on dashed/dotted only,
                  // so `keep` / `sparse` / `stippleOut` ink came out in the object
                  // pen and read as ordinary (slightly thinner) fill. Any treated
                  // highlight face now carries the highlight pen.
                  ...(faceIsHL && faceHL.penId ? { penId: faceHL.penId } : (style.penId ? { penId: style.penId } : {})),
                };
                lines.forEach((line) => {
                  const pts = line.map((pt) => ({
                    x: pt.x,
                    y: pt.y,
                    z: plane.A * pt.x + plane.B * pt.y + plane.C,
                  }));
                  const fillClip = clipper.clipPath(pts, segCtx);
                  emitRuns(fillClip.runs, fillMeta, hiddenTreatment, null, emitTreat);
                });
              }
            }
          }
        });

        // ── Curved-surface hatch: one continuous fill over the visible
        // front-face region (the silhouette boundary), grouped by hatch style.
        // Per-face hatch fails here — the tessellation faces are smaller than
        // the line spacing — so the fill reads as the whole surface.
        if (!faceted && !emissiveCoreBlank) {
          // Depth-cue reference (interpretation A) for curved prims: the object's
          // screen-depth extent; the front surface reference is the near bound
          // (no per-point front support plane on a wrapped surface — design v1).
          const curveBounds = objDepthBounds(record);
          const groups = new Map();
          record.faces.forEach((face, idx) => {
            if (!face.front) return;
            // A face whose SCREEN-SPACE projection is edge-on (zero width —
            // e.g. a CSG carve's bore side-wall viewed exactly along its own
            // plane, as in the straight-down-axis box-minus-box fixture) has
            // no usable 2D footprint. It can still read `front === true` on
            // floating-point sign noise around an exactly-perpendicular
            // normal (normalCam.z landing at ~1e-16 instead of an exact 0),
            // but folding it into this record's front-region GROUP corrupts
            // frontRegionBoundary's even-odd edge count (a bogus interior
            // sliver) and drags the group's `nearZ` down to this degenerate
            // face's own centroidZ — which then reads as "behind" the
            // object's real near faces once self-occlusion is armed (F7,
            // record.convex === false), hiding the WHOLE region. HLR's own
            // occluder builder already discards exactly this shape
            // (buildOccluders: "edge-on: zero-width footprint, skip" —
            // fitSupportPlane returns null); mirror that same test here so a
            // face with no real screen footprint never joins the fill group
            // either. Every ordinary (non-degenerate) face keeps its usable
            // plane and is unaffected — byte-identical for every existing
            // torus/sphere/box/CSG fixture that doesn't hit this knife-edge.
            if (!HLR.fitSupportPlane(face.polygon)) return;
            const st = styleOf(face);
            if (!SURFACE_FILL.has(st.mapper)) return;
            const sp = st.params || {};
            // Faces only share a continuous fill region when every parameter
            // that STEERS that fill matches. The crosshatch family-B controls
            // now do, so they join the key — for any other mapper they are
            // absent and contribute a constant suffix (same partition, same
            // output), and two crosshatch faces only split when they genuinely
            // disagree (which used to render one of them with the other's
            // crossing family).
            const crossKey = st.mapper === 'crosshatch'
              ? `|${finite(sp.crossAngleDelta, 90)}|${finite(sp.crossDensityRatio, 1)}|${sp.tripleHatch === true}` : '';
            const key = `${st.penId || ''}|${st.mapper}|${finite(sp.fillAngle, 45)}|${finite(sp.fillDensity, 50)}${crossKey}`;
            let g = groups.get(key);
            if (!g) { g = { style: st, faces: [] }; groups.set(key, g); }
            g.faces.push(idx);
          });
          groups.forEach((g) => {
            const boundary = frontRegionBoundary(record, g.faces);
            if (!boundary.length) return;
            const sp = g.style.params || {};
            const angleDeg = finite(sp.fillAngle, 45);
            // Curved surface (v1): sample intensity from the GROUP's mean world
            // normal — one spacing for the whole continuous region, deterministic.
            let spacing = hatchSpacing(sp.fillDensity);
            let darkBand = false;
            if (toneOn) {
              let mx = 0; let my = 0; let mz = 0; let cnt = 0;
              // Per-sample point/spot sampling: sample the light at EACH face's
              // own world centroid (not one region centroid) and take the region's
              // brightest reading. A large curved object partly within a near
              // point/spot light no longer collapses to a dark averaged-centroid
              // band — its lit side sets the fallback spacing, matching the
              // per-sample gradient SurfaceFill already wraps onto the surface.
              // Directional lights ignore the world point, so every per-face
              // reading equals intensity(meanN) ⇒ this max is byte-identical to
              // the old single sample (position-independent regression safety).
              let bestI = 0;
              g.faces.forEach((fi) => {
                const face = record.faces[fi];
                const n = face && face.normalWorld;
                if (n) { mx += n.x; my += n.y; mz += n.z; cnt += 1; }
              });
              const meanN = cnt ? { x: mx / cnt, y: my / cnt, z: mz / cnt } : { x: 0, y: 0, z: 1 };
              g.faces.forEach((fi) => {
                const I = intensityFn(meanN, faceWorldCentroid(record.faces[fi]));
                if (I > bestI) bestI = I;
              });
              const bandIdx = Regions.band(bestI, p.tone);
              // Density authoritative, tone a multiplier (Phase-1 density fix) —
              // same law as spacingBand so faceted + curved fills respond alike.
              spacing = Math.max(penWidth, hatchSpacing(sp.fillDensity) / coverageGain(bandIdx));
              darkBand = bandIdx === 0;
            }
            // FULL QUALITY: wrap the fill around the parametric surface so it
            // reads as a 3D form, with per-sample tone (dark→dense, brightest
            // band left blank = the highlight). Falls back to the flat
            // silhouette fill on draft frames or an unsupported primitive.
            let lines = null;
            // spiralMode 'flatClip' opts out of the wrapped surface helix and
            // fills the projected silhouette with the SAME clipped Archimedean
            // spiral the faceted path uses; 'surfaceHelix' (default curved) wraps
            // the parametric form. Non-spiral mappers are unaffected.
            const spiralFlatClip = g.style.mapper === 'spiral' && sp.spiralMode === 'flatClip';
            // contourStyle 'region' opts a curved prim OUT of the parametric
            // parallels (SurfaceFill) into the flat silhouette inset rings — a
            // structurally different, topographic contour. 'surface' (default)
            // keeps the wrapped parallels. Non-contour mappers are unaffected.
            const contourRegion = g.style.mapper === 'contour' && sp.contourStyle === 'region';
            const chartParams = !draft && SurfaceFill && !spiralFlatClip && !contourRegion
              ? curvedChartParams(objById.get(record.id) || {}) : null;
            // X-ray: ask SurfaceFill for the far surface too (a tagged, sparser
            // back family) so a hatched sphere shows through (Phase 6, THE FIX).
            const grpXray = xrayOn ? xrayCfg(sp) : null;
            // Depth cue (interpretation A): density mode asks SurfaceFill for the
            // FULL back family (backDensity 1) and thins it per-line by depth at
            // emit; weight/off keep the flat reduced family. 'off' ⇒ byte-identical.
            const grpCue = grpXray ? grpXray.depthCue : 'off';
            const grpCueDensity = grpCue === 'density' || grpCue === 'both';
            const grpCueWeight = grpCue === 'weight' || grpCue === 'both';
            // Highlight (Phase 4): a non-'blank' treatment engages the per-sample
            // band classifier inside SurfaceFill (keep/dashed/dotted/sparse/
            // stippleOut). altFill/burst drop here and are drawn by the region
            // pass below. Only meaningful with tone on.
            const grpHL = highlightCfg(sp);
            // I8 — lightDriven engages the highlight path even with the 'blank'
            // treatment (blank in lightDriven = a graded blank glint), and adds
            // per-sample shadow grading. perFace + blank stays the no-op.
            // `none` — the total highlight bypass (Jay, 2026-08-09): no ink may
            // be removed, thinned, re-spaced, dashed, re-penned or re-tagged on a
            // highlight's account, and the glint cap must not fire. It outranks
            // lightDriven, which is a highlight PLACEMENT mode, not a treatment.
            const grpHLOff = grpHL.treatment === 'none';
            const grpLD = toneOn && !grpHLOff && grpHL.mode === 'lightDriven';
            const hlActive = toneOn && !grpHLOff && (grpHL.treatment !== 'blank' || grpLD);
            // Shadow sensitivity applies in BOTH modes (default 1 = no-op).
            const grpShadowSens = toneOn ? grpHL.shadowSensitivity : 1;
            if (chartParams) {
              lines = SurfaceFill.buildObject({
                mode: chartParams.mode,
                sizes: chartParams.sizes,
                detail: chartParams.detail,
                // F7 — let ribbonize (surface-fill.js) pre-split a ruling's
                // centreline at the visible/self-occluded boundary BEFORE it
                // builds outline/wall/PenFill geometry for it, using the SAME
                // clipper.hiddenAt oracle the post-hoc clip below uses. `null`
                // for a convex object (record.convex — see scene.js's
                // isConvexObject): its own front surface can never occlude
                // itself, so this is skipped outright, zero added cost.
                selfOcclusionTest: record.convex ? null : (x, y, z) => clipper.hiddenAt(
                  x, y, z, { objectId: record.id, selfOcclude: true, analyticOccluder: torusAnalyticHidden }),
                // Style-tab Fidelity — SAMPLING DENSITY along each fill line
                // (points), not mesh tessellation (facets, still `detail`).
                // Default 1 ⇒ byte-identical.
                fillFidelity: finite(sp.fillFidelity, 1),
                transform: (objById.get(record.id) || {}).transform,
                applyTransform: Scene.applyObjectTransform,
                projectWorld: scene.projectWorld,
                camAngles: scene.camera,
                mapper: g.style.mapper,
                fillAngle: angleDeg,
                fillDensity: finite(sp.fillDensity, 50),
                // The surface-fill TONE LAW, per style group. `undefined` (an old
                // document, or a face override that predates the control) leaves
                // buildObject on its committed default — see surface-fill.js's
                // per-call TONE_ALGO resolution. Not clamped here on purpose:
                // buildObject owns validation against Vectura.SCENE3D_TONE_LAWS.
                toneLaw: sp.toneLaw,
                toneQuantLevels: sp.toneQuantLevels,
                toneFlowMode: sp.toneFlowMode,
                // C4 — how a RIBBON LAW fills its ribbon's interior once the
                // outline is drawn ('spiral' | 'concentric' | 'serpentine' |
                // 'contourParallel'). Forwarded verbatim, for exactly the
                // reason toneLaw is: buildObject owns validation against its
                // own roster, so an old document or an unknown id degrades in
                // ONE place instead of two. Inert under every non-ribbon law.
                // ...and it is read off the LAYER (`p`), not the style cascade
                // (`sp`). W4 writes it to ALGO_DEFAULTS.scene3d.strokeFillStyle
                // — the context bar and the scene3d panel both say so in as many
                // words — so `sp.strokeFillStyle` is a key nothing ever sets and
                // every ribbon filled itself at the default. Measured in the app
                // before this line changed: spiral and concentric produced
                // byte-identical frames and identical ink (19294.0 mm). `sp`
                // stays as an override for a future per-style reading; the
                // layer's value is the one that exists today.
                strokeFillStyle: sp.strokeFillStyle || p.strokeFillStyle,
                // Crosshatch family-B controls. They were already live on faceted
                // geometry and on the flat silhouette fallback below, but were
                // never handed to the curved fill — so on every chart-wrapped
                // primitive the crossing family was hard-wired at +90, at family
                // A's density, with no triple pass. Same clamps, same meaning as
                // crossFamilies(): +delta, spacing × ratio, and the third pass
                // only in the DARKEST tone band (the gate lives here, exactly as
                // it does for the faceted path).
                cross: g.style.mapper === 'crosshatch' ? {
                  angleDelta: clamp(finite(sp.crossAngleDelta, 90), 10, 170),
                  densityRatio: clamp(finite(sp.crossDensityRatio, 1), 0.25, 2),
                  triple: sp.tripleHatch === true && darkBand,
                } : null,
                // Spiral controls (I14): wire angleOffset / eccentricity / centre /
                // axis-snap into the wrapped surfaceHelix so each visibly changes the
                // spiral on curved primitives (they were previously only read by the
                // faceted flat-clip path). Every default is a strict no-op.
                spiral: g.style.mapper === 'spiral' ? {
                  offset: finite(sp.spiralAngleOffset, 0),
                  eccentricity: Number.isFinite(sp.spiralEccentricity) ? clamp(sp.spiralEccentricity, 0.3, 3) : undefined,
                  center: sp.spiralCenter === 'bboxCenter' ? 'bboxCenter' : 'centroid',
                  axisSnap: sp.axisSnap === true,
                } : null,
                // Stipple mark controls (Phase 2) — absent ⇒ legacy dot (no-op).
                dotShape: sp.dotShape,
                dotAngle: finite(sp.dotAngle, 0),
                dotSize: Number.isFinite(sp.dotSize) ? clamp(sp.dotSize, 0.1, 3) : undefined,
                toneOn,
                intensityFn,
                // Pass the tone LADDER so SurfaceFill quantizes each sample into
                // band → coverage (not a purely geometric (i+0.5)/count dither):
                // band count, thresholds, coverage ladder, and the specular glint
                // cap all steer the curved fill (items 1+2). Directionally the
                // fill stays dark→dense / bright→sparse (blank cap = highlight).
                tone: p.tone,
                // The FORM-ZONE context (§5.1–§5.3). Handing the curved fill the
                // lights and the object's own footing lets it classify H/L/M/T/F/R
                // through the SAME Regions.formZone the faceted path uses — which
                // is the only reason a cube, a low-poly sphere and a capsule under
                // one light now agree (the I27 parity contract).
                formZone: toneOn ? { lights: activeLights, ground: recordGround(record) } : null,
                // The line budget is floored off the pen so the ladder has a grid
                // to stand on (§5.4 #1); without a pen width it stays exactly
                // `lineCountFor(density)`.
                penWidth,
                // Density, in the SAME law the faceted path uses, so the dial
                // means the same thing on both (the O27 parity contract).
                tonePitch: hatchSpacing(finite(sp.fillDensity, 50)),
                // Density > 100 (I5 follow-up): relax SurfaceFill's own
                // master-grid line-count floor in step, so the curved fill
                // keeps getting denser past ~d=100 instead of going flat (the
                // sphere fixture measured 61/61/61). `undefined` for d<=100,
                // so those documents render byte-identical — see the helper's
                // own comment above.
                masterFloorPen: curvedMasterFloorPen(finite(sp.fillDensity, 50)),
                // I8 — shadow sensitivity (stage count) graded darkening on the
                // dark end; default 1 = no-op. Per-sample specular fn drives the
                // lightDriven highlight region.
                shadowSensitivity: grpShadowSens,
                // The blank highlight is placed by the specular term in BOTH
                // modes now — under perFace it was previously placed by "the top
                // tone band", which is why it covered a quarter of the silhouette
                // and ignored `tone.specular` entirely (O4/O5/O24).
                specularFn: grpHLOff ? null : specularFn,
                specShininess,
                noHighlight: grpHLOff,
                xray: (grpXray && grpXray.backFaces)
                  ? { backFaces: true, backDensity: grpCueDensity ? 1 : grpXray.backDensity } : null,
                highlight: hlActive ? {
                  treatment: grpHL.treatment,
                  isHL: (I) => isHighlightBand(I, grpHL.bands),
                  density: grpHL.density,
                  // lightDriven: per-sample specular region + sensitivity stages.
                  lightDriven: grpLD,
                  sensitivity: grpHL.sensitivity,
                } : null,
              });
            }
            if (!lines) {
              // Fallback: flat silhouette fill. Draft (live drag) or a primitive
              // SurfaceFill can't chart. Region mappers link the boundary loops;
              // line mappers scanline-fill. Plain hatch is NOT auto-crossed in
              // the dark band any more (that made hatch look like crosshatch).
              if (draft || !REGION_MAPPERS.has(g.style.mapper)) {
                // Family A only gets the lower floor — see hatchSegments'
                // header. Family B below (× crossDensityRatio) keeps the old
                // floor of 1 unconditionally: an existing document at density
                // 100 with ratio 0.25 already relied on being clamped to 1mm.
                lines = hatchSegments(boundary, angleDeg, spacing, hatchFloorFor(sp.fillDensity));
                if (g.style.mapper === 'crosshatch') {
                  // Independent family-B (Phase 1.3): +crossAngleDelta, ×ratio.
                  const delta = clamp(finite(sp.crossAngleDelta, 90), 10, 170);
                  const ratio = clamp(finite(sp.crossDensityRatio, 1), 0.25, 2);
                  hatchSegments(boundary, angleDeg + delta, spacing * ratio).forEach((l) => lines.push(l));
                  if (sp.tripleHatch === true && darkBand) {
                    hatchSegments(boundary, angleDeg + 45, spacing * ratio).forEach((l) => lines.push(l));
                  }
                }
              } else {
                const loops = (linkSegments ? linkSegments(boundary) : [])
                  .filter((lp) => Array.isArray(lp) && lp.length >= 3);
                const regionSpacing = regionSpacingFor(g.style.mapper, sp);
                const regionOpts = g.style.mapper === 'spiral'
                  ? { spacing: regionSpacing, ...spiralOptsFrom(sp) }
                  : g.style.mapper === 'stipple'
                    ? { spacing: regionSpacing, ...stippleOptsFrom(sp) }
                    : { spacing: regionSpacing };
                lines = Mappers && typeof Mappers.regionFill === 'function'
                  ? (Mappers.regionFill(g.style.mapper, loops, regionOpts) || [])
                  : [];
              }
            }
            // Nearest front-face depth for the group: hatch draws over farther
            // objects and is hidden behind nearer ones; a CONVEX object never
            // occludes its own fill (selfObject) — a non-convex one (F7:
            // record.convex, see scene.js's isConvexObject) genuinely can,
            // e.g. the torus's near tube wall hiding its own far wall through
            // the hole, and that applies to every path this line's clip
            // reaches: hatch/region fill AND the ribbon/wall/PenFill paths
            // `SurfaceFill.buildObject` emits as plain entries in `lines`.
            let nearZ = Infinity;
            g.faces.forEach((fi) => {
              const z = record.faces[fi] && record.faces[fi].centroidZ;
              if (Number.isFinite(z) && z < nearZ) nearZ = z;
            });
            if (!Number.isFinite(nearZ)) nearZ = 0;
            const fillMeta = {
              algorithm: 'scene3d',
              kind: 'sceneFill',
              sceneTarget: sceneTargetMeta(record.id, null, null, nearZ, false),
              ...(g.style.penId ? { penId: g.style.penId } : {}),
            };
            const segCtx = { objectId: record.id, selfObject: true, selfOcclude: !record.convex, analyticOccluder: torusAnalyticHidden };
            const groupTreat = strokeTreatment(g.style.params);
            // X-ray front 'faded' reads the near surface as dotted (lighter); the
            // back family is dashed at the back line type, on the back pen.
            const frontTreat = (grpXray && grpXray.front === 'faded')
              ? strokeTreatment({ ...sp, lineType: 'dotted' }) : groupTreat;
            const backTreat = grpXray
              ? strokeTreatment({ ...sp, lineType: grpXray.backLineType, wobble: 0, overstroke: false })
              : NO_STROKE_TREATMENT;
            const backMeta = grpXray ? {
              algorithm: 'scene3d',
              kind: 'sceneFill',
              sceneTarget: { ...sceneTargetMeta(record.id, null, null, nearZ, false), xrayBack: true },
              ...(grpXray.backPenId ? { penId: grpXray.backPenId } : (g.style.penId ? { penId: g.style.penId } : {})),
            } : fillMeta;
            // Highlight-band runs (dashed/dotted treatments) carry their own
            // dash line type + optional highlight pen and are tagged so the
            // renderer/tests can find them.
            // dashed/dotted stamp their dash line type; 'keep' stays SOLID (it
            // keeps the lines, just on the highlight channel/pen). Others (sparse/
            // stippleOut) keep the group's line type too.
            const hlDash = grpHL.treatment === 'dashed' || grpHL.treatment === 'dotted';
            const hlTreat = hlActive
              ? strokeTreatment({ ...sp, ...(hlDash ? { lineType: hlLineType(grpHL.treatment) } : {}), wobble: 0, overstroke: false })
              : NO_STROKE_TREATMENT;
            const hlMeta = {
              algorithm: 'scene3d',
              kind: 'sceneFill',
              sceneTarget: { ...sceneTargetMeta(record.id, null, null, nearZ, false), highlight: true },
              ...(grpHL.penId ? { penId: grpHL.penId } : (g.style.penId ? { penId: g.style.penId } : {})),
            };
            let backLineIdx = 0;
            // PAINT-ORDER FIX (fs-b2): TWO passes over `lines`, back family
            // first, front/highlight second — `lines` interleaves back/front
            // samples in whatever order SurfaceFill (or the flat fallback)
            // produced them, but `out` IS paint order (canvas has no z-sort)
            // and drives the export's first-seen pen-group order, so the back
            // family must land in `out` before the front family regardless of
            // `lines`' own order. `backLineIdx` still only increments while
            // walking back lines, so the depth-cue dither is byte-identical.
            lines.forEach((line) => {
              // SurfaceFill lines carry per-sample camera-depth (they wrap the
              // form); flat-fill lines don't → fall back to the group's nearZ.
              if (line.back !== true) return;
              const pts = line.map((pt) => ({ x: pt.x, y: pt.y, z: Number.isFinite(pt.z) ? pt.z : nearZ }));
              const clip = clipper.clipPath(pts, segCtx);
              // Far surface: force the dashed/occluded treatment so it reads as
              // "seen through" even where self-occlusion is skipped (selfObject).
              if (grpCue !== 'off') {
                // Depth cue (interpretation A): gap = how far this back sample
                // sits behind the object's near bound, normalized over its depth.
                const mid = pts[(pts.length / 2) | 0] || pts[0];
                const midZ = mid ? mid.z : curveBounds.zMax;
                const norm = clamp((curveBounds.zMax - midZ) / curveBounds.extent, 0, 1);
                const idx = backLineIdx++;
                if (grpCueDensity && !cueDitherKeep(idx, cueKeepFraction(norm))) return; // thinned (shallow)
                const backMetaCued = {
                  ...backMeta,
                  sceneTarget: { ...backMeta.sceneTarget, xrayDepth: round3(norm) },
                  ...(grpCueWeight ? { weightScale: round3(cueWeightScale(norm)) } : {}),
                };
                emitRuns(clip.runs, backMetaCued, 'dash', null, backTreat, { forceHidden: true });
              } else {
                emitRuns(clip.runs, backMeta, 'dash', null, backTreat, { forceHidden: true });
              }
            });
            lines.forEach((line) => {
              if (line.back === true) return;
              const isHL = line.highlight === true;
              const pts = line.map((pt) => ({ x: pt.x, y: pt.y, z: Number.isFinite(pt.z) ? pt.z : nearZ }));
              const clip = clipper.clipPath(pts, segCtx);
              if (isHL) {
                emitRuns(clip.runs, hlMeta, hiddenTreatment, null, hlTreat);
              } else {
                // A curved-fill line may carry its OWN pen weight — the
                // 'weightModulated' tone law in surface-fill.js holds the ruling
                // geometry uniform and states the tone as stroke width instead.
                // Absent (every other law), the meta is untouched and the output
                // is byte-identical.
                const rawW = Number(line.weightScale);
                const lineMeta = (Number.isFinite(rawW) && rawW !== 1)
                  ? { ...fillMeta, weightScale: round3(clamp(rawW, 0.1, 6)) }
                  : fillMeta;
                emitRuns(clip.runs, lineMeta, hiddenTreatment, null, frontTreat);
              }
            });
          });
        }

        // ── contourSlice (CtS I5): depth-plane cross-sections through the mesh.
        // The mesh is cut by EXACTLY `sliceCount` parallel planes (world +z
        // rotated by sliceRotate/sliceTilt); each cut segment is projected and
        // run through the SAME clipper the surface fills use, so the slices are
        // occluded by other objects AND self-occluded (a far-side slice hides
        // behind the near hemisphere) and shadowed by the compositor.
        //
        // INVARIANT: the plane count is a pure function of sliceCount — it does
        // NOT depend on the occluder count, camera pose, other scene objects, or
        // draft-vs-full. Every plane's per-triangle cuts are LINKED into
        // continuous contour polylines (per plane, front + back separately) so a
        // dense mesh draws long rings — not thousands of sub-MIN_RUN chords that
        // the emission floor would silently drop (that inversion is what made a
        // detail-100 convert render ~8 fragments). Perf is bounded by a FIXED
        // clip-work budget (sampled length × occluders) that degrades gracefully
        // WITHOUT dropping planes: once the budget is spent, the remaining front
        // rings emit RAW (un-occluded) so every plane still draws — only
        // occlusion fidelity degrades on a pathological (detail > 100) density.
        // Draft frames differ from full ONLY by skipping HLR (raw), at the SAME
        // plane count.
        {
          const sliceStyle = resolveStyle(record.id, null);
          if (sliceStyle.mapper === 'contourSlice' && record.id !== 'ground'
            && !emissiveCoreBlank && Array.isArray(record.world)
            && Array.isArray(record.faceIndexArrays) && record.faceIndexArrays.length) {
            const sp = sliceStyle.params || {};
            const visibleOnly = (sp.sliceVisibility || 'visibleOnly') !== 'fullContour';
            const frontFlags = record.faces.map((f) => !!(f && f.front));
            // Plane count depends ONLY on sliceCount (clamped to its param range).
            const planes = clamp(Math.round(finite(sp.sliceCount, 26)), 2, 120);
            const occluderCount = (clipper.occluders && clipper.occluders.length) || 0;
            const sliced = buildSliceSegments({
              world: record.world,
              faces: record.faceIndexArrays,
              front: frontFlags,
              sliceCount: planes,
              sliceRotate: finite(sp.sliceRotate, 0),
              sliceTilt: finite(sp.sliceTilt, 0),
            });
            const sliceTreat = strokeTreatment(sp);
            // NOT selfObject: a through-body slice SHOULD self-occlude (the far
            // side hides behind the near surface) — only on-surface fills opt out.
            const segCtx = { objectId: record.id };
            // Group the flat cut list by (plane, front|back). Insertion order is
            // plane-ascending (buildSliceSegments emits level 1..N), so Map order
            // is deterministic. The 2D link key is unique WITHIN a plane, so
            // linking never fuses two different planes' rings.
            const byPlane = new Map();
            sliced.segments.forEach((s) => {
              let g = byPlane.get(s.plane);
              if (!g) { g = { front: [], back: [] }; byPlane.set(s.plane, g); }
              (s.front ? g.front : g.back).push([s.a, s.b]);
            });
            const linkPlane = (segs) => (linkSegments ? linkSegments(segs)
              : segs.map((e) => [e[0], e[1]]));
            const projectPath = (worldPts) => {
              const proj = [];
              for (let i = 0; i < worldPts.length; i++) {
                const P = scene.projectWorld(worldPts[i]);
                if (P && Number.isFinite(P.x) && Number.isFinite(P.y)) {
                  proj.push({ x: P.x, y: P.y, z: P.z });
                }
              }
              return proj;
            };
            const metaFor = (proj) => {
              let zsum = 0;
              for (let i = 0; i < proj.length; i++) zsum += proj[i].z;
              return {
                algorithm: 'scene3d',
                kind: 'sceneFill',
                sceneTarget: sceneTargetMeta(record.id, null, null, zsum / proj.length, false),
                ...(sliceStyle.penId ? { penId: sliceStyle.penId } : {}),
              };
            };
            // FIXED work budget as occluder-tests (clipPath samples every
            // SLICE_SAMPLE_STEP mm and tests each sample against every occluder).
            // Bounding sampled-length × occluders keeps the work fixed regardless
            // of detail / camera / occluder count; overflow front rings emit raw.
            let workUsed = 0;
            byPlane.forEach((g) => {
              // Front rings: HLR-clipped (occluded/self-occluded) until the fixed
              // budget is spent, then raw — never dropped.
              linkPlane(g.front).forEach((worldPts) => {
                const proj = projectPath(worldPts);
                if (proj.length < 2) return;
                const meta = metaFor(proj);
                if (draft || workUsed >= SLICE_CLIP_WORK) {
                  emitRuns([{ visible: true, pts: proj }], meta, hiddenTreatment, null, sliceTreat);
                  return;
                }
                let len = 0;
                for (let i = 1; i < proj.length; i++) {
                  len += Math.hypot(proj[i].x - proj[i - 1].x, proj[i].y - proj[i - 1].y);
                }
                workUsed += Math.max(2, Math.ceil(len / SLICE_SAMPLE_STEP)) * (occluderCount + 1);
                const clip = clipper.clipPath(proj, segCtx);
                emitRuns(clip.runs, meta, hiddenTreatment, null, sliceTreat);
              });
              // Far-side rings (fullContour only): raw see-through DASHES —
              // forceHidden routes them through the occluded/dashed branch even
              // on a solid object (whose 'remove' would otherwise drop them,
              // making Full ≡ visibleOnly). They never consume the clip budget.
              if (visibleOnly) return;
              linkPlane(g.back).forEach((worldPts) => {
                const proj = projectPath(worldPts);
                if (proj.length < 2) return;
                emitRuns([{ visible: true, pts: proj }], metaFor(proj), 'dash', null, sliceTreat, { forceHidden: true });
              });
            });
          }
        }

        // ── Highlight region pass (Phase 4): altFill / burst fill the specular
        // sub-region on the blank highlight band. altFill runs the alternate
        // mapper clipped to the hotspot disc; burst emits radial rays from the
        // glint (an engraved specular sparkle). Both work for faceted AND curved
        // records — Regions.specularHotspot finds the lit front face on either.
        // The base fill already left this zone blank (curved: SurfaceFill drop;
        // faceted: the highlight-band face was suppressed). Gated on tone +
        // fastPreview-off + a burst|altFill treatment, so 'blank' is untouched.
        if (toneOn && !draft && Regions && typeof Regions.specularHotspot === 'function'
          && record.id !== 'ground') {
          const hcfg = highlightCfg((resolveStyle(record.id, null).params) || {});
          if (hcfg.treatment === 'burst' || hcfg.treatment === 'altFill') {
            const light0 = (p.lights && p.lights[0]) || {};
            const hs = Regions.specularHotspot(record, scene.camera, p.tone && p.tone.specular, light0);
            if (hs) {
              let cx = hs.cx; let cy = hs.cy;
              if (hcfg.burstCenter === 'centroid' && hs.projBounds) {
                cx = (hs.projBounds.minX + hs.projBounds.maxX) / 2;
                cy = (hs.projBounds.minY + hs.projBounds.maxY) / 2;
              }
              const hlMeta = {
                algorithm: 'scene3d',
                kind: 'sceneFill',
                sceneTarget: { ...sceneTargetMeta(record.id, hs.face, null, hs.depth, false), highlight: true },
                ...(hcfg.penId ? { penId: hcfg.penId } : {}),
              };
              const hlCtx = { objectId: record.id, selfObject: true };
              if (hcfg.treatment === 'burst') {
                const N = hcfg.burstCount;
                const inner = hs.radius * 0.12;
                for (let k = 0; k < N; k++) {
                  const ang = (k / N) * Math.PI * 2;
                  const p0 = { x: cx + Math.cos(ang) * inner, y: cy + Math.sin(ang) * inner, z: hs.depth };
                  const p1 = { x: cx + Math.cos(ang) * hs.radius, y: cy + Math.sin(ang) * hs.radius, z: hs.depth };
                  const clip = clipper.clipPath([p0, p1], hlCtx);
                  emitRuns(clip.runs, hlMeta, hiddenTreatment, null, NO_STROKE_TREATMENT);
                }
              } else {
                // altFill: fill the hotspot disc with the alternate mapper.
                const SEG = 40;
                const circle = [];
                for (let k = 0; k < SEG; k++) {
                  const a = (k / SEG) * Math.PI * 2;
                  circle.push({ x: cx + Math.cos(a) * hs.radius, y: cy + Math.sin(a) * hs.radius });
                }
                // The hotspot disc is SMALL (a few mm), and hatchSpacing(density)
                // is a whole-object pitch — at the default density it came out
                // wider than the disc's diameter, so the alternate mapper landed
                // ZERO marks and altFill silently degenerated into "blank, but
                // with the whole facet removed". Cap the pitch at the disc so the
                // treatment always draws the mark it promises.
                const spacing = Math.max(penWidth, Math.min(hatchSpacing(hcfg.density), hs.radius / 2));
                let alines = [];
                if (REGION_MAPPERS.has(hcfg.altFillMapper) && Mappers && typeof Mappers.regionFill === 'function') {
                  alines = Mappers.regionFill(hcfg.altFillMapper, [circle], { spacing }) || [];
                } else {
                  const edges = [];
                  for (let k = 0; k < SEG; k++) edges.push([circle[k], circle[(k + 1) % SEG]]);
                  alines = hatchSegments(edges, 45, spacing);
                  if (hcfg.altFillMapper === 'crosshatch') {
                    hatchSegments(edges, 135, spacing).forEach((l) => alines.push(l));
                  }
                }
                alines.forEach((line) => {
                  const pts = line.map((pt) => ({ x: pt.x, y: pt.y, z: hs.depth }));
                  const clip = clipper.clipPath(pts, hlCtx);
                  emitRuns(clip.runs, hlMeta, hiddenTreatment, null, NO_STROKE_TREATMENT);
                });
              }
            }
          }
        }

        // ── Emissive self-render (Phase 7): an enabled emissive object draws its
        // OWN glow — an outward radial BURST (sun rays) or concentric halo RINGS
        // around the projected silhouette, reusing the Phase-4 burst emitter shape
        // (radial rays from a center). Deterministic (no RNG). Independent of tone
        // (a glow reads even with light-made tone off). Scaled by intensity; drawn
        // on emissive.penId if set. Rays sit at the object's near depth (+ a small
        // camera-ward bias) so the object never occludes its own glow, while a
        // NEARER object still can. Skipped only on the ground.
        if (emCfg && emCfg.halo !== 'none') {
          // Projected bounds → glow center + base radius (half the diagonal).
          let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
          (record.projected || []).forEach((pt) => {
            if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
            if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
          });
          if (Number.isFinite(minX)) {
            const cx = (minX + maxX) / 2;
            const cy = (minY + maxY) / 2;
            const radius = Math.max(2, Math.hypot(maxX - minX, maxY - minY) / 2);
            // Near depth = the front-most face (bigger camera z = nearer); + a 1mm
            // camera-ward bias so own faces (at nearZ) never clip the glow.
            let nearZ = -Infinity;
            record.faces.forEach((face) => {
              if (face && face.front && Number.isFinite(face.centroidZ) && face.centroidZ > nearZ) nearZ = face.centroidZ;
            });
            if (!Number.isFinite(nearZ)) nearZ = 0;
            const glowZ = nearZ + 1;
            const norm = clamp(finite(emCfg.intensity, 1), 0, 4) / 4; // 0..1 glow scale
            const emMeta = {
              algorithm: 'scene3d',
              kind: 'sceneFill',
              sceneTarget: {
                objectId: record.id,
                faceId: null,
                edgeClass: null,
                regionClass: 'emissive',
                depth: -glowZ,
                normal: { x: 0, y: 0, z: 1 },
                facingUp: false,
                occluded: false,
                emissive: true,
              },
              ...(emCfg.penId ? { penId: emCfg.penId } : {}),
            };
            const emCtx = { objectId: record.id, selfObject: false };
            if (emCfg.halo === 'burst') {
              const N = clamp(Math.round(finite(emCfg.haloCount, 16)), 4, 48);
              const inner = radius * 0.9;
              const outer = radius * (1.2 + 0.5 * norm);
              for (let k = 0; k < N; k++) {
                const ang = (k / N) * Math.PI * 2;
                const c = Math.cos(ang); const s = Math.sin(ang);
                const p0 = { x: cx + c * inner, y: cy + s * inner, z: glowZ };
                const p1 = { x: cx + c * outer, y: cy + s * outer, z: glowZ };
                const clip = clipper.clipPath([p0, p1], emCtx);
                emitRuns(clip.runs, emMeta, hiddenTreatment, null, NO_STROKE_TREATMENT);
              }
            } else {
              // ring: concentric circles expanding outward from the silhouette.
              const rings = clamp(Math.round(finite(emCfg.haloRings, 3)), 1, 6);
              const SEG = 48;
              const step = radius * (0.16 + 0.12 * norm);
              for (let ri = 0; ri < rings; ri++) {
                const rr = radius * 1.02 + ri * step;
                const ring = [];
                for (let k = 0; k <= SEG; k++) {
                  const a = (k / SEG) * Math.PI * 2;
                  ring.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, z: glowZ });
                }
                const clip = clipper.clipPath(ring, emCtx);
                emitRuns(clip.runs, emMeta, hiddenTreatment, null, NO_STROKE_TREATMENT);
              }
            }
          }
        }

        // ── Specular highlight: the brightest tone band of the wrap fill is left
        // UN-hatched (SurfaceFill's per-sample ordered dither drops every line
        // toward high intensity), so blank paper reads as the highlight — the
        // line-art-correct treatment. The old solid-white filled disc
        // (Regions.specularRegion) is retired: it obscured the form and read as a
        // pasted-on sphere, not a highlight. (The function stays for reference.)

        // ── Edges: silhouette / crease / boundary (+ every edge of a
        // wireframe-mapped face); hidden runs drop (solid) or dash (x-ray).
        // `classified` was computed once above (shared with the face-outline pass).
        classified.forEach((entry) => {
          const adjacentFaces = entry.faceIndices.map((idx) => record.faces[idx]).filter(Boolean);
          const wireframeFace = adjacentFaces.find((face) => styleOf(face).mapper === 'wireframe');
          const wireframeDemand = Boolean(wireframeFace);
          const structural = entry.cls !== 'interior';
          if (!structural && !wireframeDemand) return;
          // CSG seam suppression: a boolean RESULT is a closed manifold, so every
          // genuine edge is shared by exactly two faces (silhouette + crease
          // survive, classified separately). The count-1 'boundary' edges on a csg
          // mesh are fan-triangulation T-junction artifacts along the cut seam —
          // drawing them paints spurious solid lines radiating across the carved
          // flat faces (and a confetti of rim whiskers on curved cuts). Skip
          // DRAWING them; HLR occlusion rides on FACES (occluderFaces), not these
          // edges, so hidden-line removal is unaffected. The real carve rim (a
          // wall meeting a face at ~90°) is a count-2 CREASE edge and still draws.
          if (record.primitive === 'csg' && entry.cls === 'boundary') return;
          // CSG triangulation-fan suppression (I32): a boolean RESULT mesh is
          // fan-triangulated, so every flat face is split into many COPLANAR
          // triangles whose shared diagonals classify as 'interior'. On an
          // ordinary primitive those diagonals don't exist (quad faces), so a
          // wireframe mapper surfaces interior edges harmlessly — but on a CSG
          // result a wireframe would paint that whole triangulation fan across
          // the carved faces (Box−Cylinder "stray diagonal edges" defect). Only
          // the FUSED solid's genuine features (silhouette/crease/boundary)
          // read as real geometry; the coplanar diagonals never do — suppress
          // them even under wireframe. Real carve rims are ~90° count-2 CREASE
          // edges (structural) and still draw; this drops ONLY 'interior'.
          if (record.primitive === 'csg' && !structural) return;
          // Wireframe edge classes (Phase 2): a wireframe face publishes which
          // edge classes it draws (default all four = the current all-edges look)
          // and whether occluded edges dash (showHidden). Filter this edge's class
          // and pick its hidden treatment. entry.cls is the RAW class
          // (silhouette|boundary|crease|interior); the edgeClasses keys match it.
          let wfShowHidden = false;
          if (wireframeDemand) {
            const wfParams = styleOf(wireframeFace).params || {};
            const ec = wfParams.edgeClasses;
            if (ec && ec[entry.cls] === false) return; // this class hidden for the wireframe
            wfShowHidden = wfParams.showHidden === true;
          }
          // A crease/interior edge is part of the WIREFRAME look, NOT the object
          // OUTLINE: it is drawn ONLY when an adjacent face is wireframe-mapped.
          // For 'none' (outline only) and for surface fills (the fill replaces the
          // mesh), the crease is suppressed — so a 'none' cube shows just its outer
          // hexagon, not the near-corner Y (I5). Silhouette and boundary edges (the
          // shape's real outline) always survive. UNDER X-RAY (hidden edges on) a
          // crease that borders only SURFACE-FILLED faces still passes as
          // HIDDEN-ONLY: its visible portion drops (no confetti over the fill) but
          // its occluded portion dashes, so the far-side edges of a hatched box read
          // through (Phase 6). A bare 'none' object has no fill to read through, so
          // it drops the crease outright.
          const bordersSurfaceFill = adjacentFaces.length
            && adjacentFaces.every((face) => SURFACE_FILL.has(styleOf(face).mapper));
          // A CSG carve rim (a wall meeting a face at ~90°) is a genuine cut
          // boundary that reads as part of the object outline, not mesh confetti —
          // so on a CSG result a crease is suppressed ONLY when a surface fill
          // would otherwise bury it (legacy). On ordinary primitives 'none' drops
          // every crease (outline only).
          const creaseSuppressed = entry.cls === 'crease' && !wireframeDemand
            && (record.primitive === 'csg' ? bordersSurfaceFill : true);
          // A suppressed crease over a surface-filled face survives as HIDDEN-ONLY
          // (its visible portion drops, its occluded portion reads through the
          // shown fill) ONLY when the x-ray see-through FILL is active. This is a
          // FILLS concern (gated on visibility, NOT edgeStyles.hidden) so a
          // NON-x-ray surface-filled box with a scene hidden=dash class is
          // unaffected — its creases are not see-through creases.
          const hiddenOnlyEdge = creaseSuppressed && bordersSurfaceFill && xrayOn && recXray.hiddenEdges;
          if (creaseSuppressed && !hiddenOnlyEdge) return;
          // Interior edges surfaced by a wireframe mapper report as creases —
          // the closest CONTRACT B class (the enum has no 'interior').
          const cls = structural ? entry.cls : 'crease';
          const a = record.projected[entry.a];
          const b = record.projected[entry.b];
          if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) return;
          const metaFace = entry.frontFace || entry.metaFace;
          const style = metaFace ? resolveStyle(record.id, metaFace.faceId) : FALLBACK_STYLE;
          const midZ = (finite(a.z, 0) + finite(b.z, 0)) / 2;
          const target = sceneTargetMeta(record.id, entry.frontFace, cls, midZ, false);
          const baseMeta = {
            algorithm: 'scene3d',
            kind: 'sceneEdge',
            straight: true,
            sceneTarget: target,
            ...(style.penId ? { penId: style.penId } : {}),
          };
          const ownerKeys = adjacentFaces.map((face) => face.key);
          const clipped = clipper.clipPath([a, b], { ownerKeys, objectId: record.id });
          // Per-edge-class EdgeStyle (C-06). VISIBLE runs take the edge's own class
          // style (raw entry.cls, so a wireframe interior edge gets the 'interior'
          // style); HIDDEN runs take the 'hidden' class style. Default table ⇒ both
          // overlays null ⇒ byte-identical.
          const visOverlay = edgeStyleMeta(edgeStyleFor(entry.cls, record.id));
          const hidOverlay = edgeStyleMeta(edgeStyleFor('hidden', record.id));
          // Structural edge: line-type dash only (double-drawn with the face
          // outline, so wobble is fill-scoped — see dashOnly). X-RAY FOLD: x-ray
          // no longer forces hidden edges to dash — the per-object/scene
          // edgeStyles.hidden.hiddenTreatment is the SOLE owner (default 'drop' ⇒
          // 'remove' ⇒ today's non-x-ray look; a migrated x-ray object carries
          // 'dash'). A wireframe face's showHidden stays an orthogonal override.
          // Polish P-B — the hidden treatment resolves per-object too (an object
          // may override Drop→Dash for its OWN occluded edges); a non-overriding
          // object falls through to the scene-wide hidden class.
          const hiddenStyle = edgeStyleFor('hidden', record.id);
          const sceneHidden = (hiddenStyle && hiddenStyle.hiddenTreatment === 'dash') ? 'dash' : 'remove';
          const thisEdgeHidden = wfShowHidden ? 'dash' : sceneHidden;
          const emitOpts = {};
          if (hiddenOnlyEdge) emitOpts.hiddenOnly = true;
          if (visOverlay) emitOpts.visibleMeta = visOverlay;
          if (hidOverlay) emitOpts.hiddenMeta = hidOverlay;
          // BUFFERED, not emitted: the emission floor has to see whole welded
          // chains, so nothing can be culled until every edge has been clipped.
          edgePlan.push({
            a: entry.a,
            b: entry.b,
            runs: clipped.runs,
            baseMeta,
            hidden: thisEdgeHidden,
            hiddenOnly: Boolean(emitOpts.hiddenOnly),
            treat: dashOnly(strokeTreatment(style.params)),
            opts: emitOpts,
          });
          // Border emphasis: silhouette + boundary edges only (the shape's real
          // outline), never creases/interior. Gated on record.border.enabled.
          // COLLECTED here, EMITTED after the loop — the outline has to be
          // chained across edges before it can be offset without gapping.
          if (borderWanted && structural && (cls === 'silhouette' || cls === 'boundary')) {
            borderEdges.push({ a: entry.a, b: entry.b, runs: clipped.runs, baseMeta });
          }
        });
        // Structural edges emit here, in edge order, with the floor already
        // applied per welded chain (so `chained: true` suppresses the per-run
        // floor inside emitRuns — see chainedFloorSurvivors).
        const edgeKeep = chainedFloorSurvivors(edgePlan);
        edgePlan.forEach((item) => {
          const runs = item.runs.filter((run) => edgeKeep.has(run));
          if (!runs.length) return;
          emitRuns(runs, item.baseMeta, item.hidden, { edgeClass: 'hidden' }, item.treat,
            { ...item.opts, chained: true });
        });
        emitBorderChains(record, borderEdges);
      });

      // ── Cast shadows on the ground (stream 2A). Orthogonal to tone: driven by
      // light.castShadows, degrades on grazing light / degenerate geometry.
      // Shadows render on EVERY frame, including live drags: objects and their
      // shadows must not vanish while orbiting or dragging (user contract). A
      // draft frame routes through shadows.js's boolean-free per-caster path
      // (CONTRACT L4) — cheap ground projection, no FillBoolean union — while a
      // full frame does the clean class union. Both are y≥0-clipped so a caster
      // straddling the receiver still projects a correct footprint.
      if (Shadows && typeof Shadows.build === 'function' && Lighting) {
        const shadowStyleOf = (objectId) => {
          const st = resolveStyle(objectId, null);
          return { penId: st && st.penId ? st.penId : null };
        };
        // Scene-scope stroke treatment (line type / wobble) for every shadow line.
        const shadowStyleParams = (p.styleTable && p.styleTable.scene && p.styleTable.scene.params) || {};
        // Phase 5 — scene-level shadow controls (angle / density / pen / line
        // type / penumbra layers). Absent ⇒ the legacy hardcoded shadow look.
        const shadowBag = p.shadow || {};
        // I26 inverse mode reaches the ground's OWN fill lines (already emitted
        // into `out` above) to THIN them inside the footprint instead of adding
        // hatch. Passed on every build; only consumed when shadowMode==='inverse'.
        const shadowGroundSink = out;
        // Multi-light: every shadow-casting light drops its own footprint
        // (ambient lights don't cast). Directional lights project PARALLEL along
        // their travel dir; point/spot lights project in PERSPECTIVE from their
        // world position (rays diverge → an enlarged umbra). A lone sun → one
        // shadow set, exactly as before.
        (p.lights || []).forEach((lt) => {
          if (!lt || lt.type === 'ambient' || lt.castShadows === false) return;
          if (lt.type === 'point' || lt.type === 'spot' || lt.type === 'area') {
            if (!lt.position) return;
            // Pass the full record so a spot clips its shadow to the cone and a
            // ranged light drops casters it never reaches (point stays omni).
            Shadows.build(scene, p, bounds, clipper, null, { styleOf: shadowStyleOf, styleParams: shadowStyleParams, shadow: shadowBag, lightPosition: lt.position, light: lt, groundFillPaths: shadowGroundSink })
              .forEach((path) => out.push(path));
            return;
          }
          const dir = Lighting.lightWorldDir(lt);
          if (!dir) return;
          Shadows.build(scene, p, bounds, clipper, dir, { styleOf: shadowStyleOf, styleParams: shadowStyleParams, shadow: shadowBag, groundFillPaths: shadowGroundSink })
            .forEach((path) => out.push(path));
        });
      }

      return out;
    },
    formula: (p = {}) => {
      const count = Array.isArray(p.objects) && p.objects.length ? p.objects.length : 1;
      const projection = (p.camera && p.camera.projection) === 'perspective' ? 'perspective' : 'orthographic';
      return `3D scene: ${count} object${count === 1 ? '' : 's'} assembled, projected (${projection}) and hidden-line resolved into styled face, edge, and fill targets.`;
    },
    // Test seam (§4.2). The object plot floor is a claim about every legal
    // configuration, not about any one drawing — composed coverage is not
    // observable from the emitted paths (see `scene3d-plot-safety.test.js` on
    // why measuring drawn spacing reports the clipping, not the ladder). This
    // publishes the floor the emitter ACTUALLY uses so the criterion can be
    // asserted where the implementation cannot re-bless its own arithmetic.
    __plotFloorForTest: () => ({
      mult: PLOT_FLOOR_MULT_OBJ,
      coverage: singleFamilyCoverage(PLOT_FLOOR_MULT_OBJ),
    }),
    // Test seam (§4.2). Publishes the fillDensity -> hatch-spacing mapping so
    // the 0-100 backward-compat contract and the 100-200 rescale can be
    // asserted exactly, without the float noise of measuring spacing off
    // projected geometry.
    __hatchSpacingForTest: (density) => hatchSpacing(density),
    // Test seam (I5 follow-up). Publishes the density -> curved master-grid
    // floor mapping (`curvedMasterFloorPen`) that fixes SurfaceFill going
    // flat above ~Density 100 on curved primitives, mirroring the seam above.
    __curvedMasterFloorPenForTest: (density) => curvedMasterFloorPen(density),
    // Test seam (fs-v2-facetedangle). Publishes the density -> automatic
    // tone-zone cross-family floor gate (`crossFloorFor`) that stops the
    // faceted hatch's aggregate bearing drifting with Density above 100,
    // mirroring the two seams above.
    __crossFloorForTest: (density) => crossFloorFor(density),
  };
})();
