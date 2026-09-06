/**
 * Scene3D.TorusOcclusion — analytic (closed-form) self-occlusion source for a
 * torus.
 *
 * WHY THIS EXISTS (F7). `hlr.js`'s mesh-based self-occlusion test
 * (`SELF_OCCLUDE_BIAS`, 6mm) compares a sample's depth against the
 * TESSELLATED occluder mesh's own faces. That margin has to be wide enough to
 * absorb the mesh's own chording error against the true analytic surface (a
 * long chained ruling — 'onePenDown' — measured up to ~5mm of spurious
 * same-surface "self-occlusion" at a 1.5mm bias), which makes it blind to a
 * genuine but SHALLOW self-occlusion crossing near the torus's inner-hole
 * cusp, where the true near/far depth gap can be under 1mm right at the
 * boundary. No single mesh-margin can serve both needs — this module sidesteps
 * the conflict by testing against the EXACT analytic torus surface (zero
 * chording error), so a much smaller margin is safe.
 *
 * TWO GENERATIONS. The original approach (`buildDepthSource`, kept below,
 * built on `Scene3D.RayTorus`'s closed-form ray/torus intersection — see that
 * module's own header) cast a single exact ray per sample plus several more
 * dilated a few mm away in screen space, and flagged occlusion when ANY ray
 * found a nearer surface point. That dilation is exactly what let the F1B
 * cross-run streaks (`interlockWeave`/`onePenDown`/`trochoidLoop`/
 * `ampSpacing`/`weaveDepth` — see `docs/3d-audit/handoff/unit-a2-notes.md`)
 * through: right at the torus's near-tangent inner-hole cusp, a lateral
 * shift of a fraction of a millimetre can jump which (u, v) patch a ray
 * grazes, so a dilated ray from a genuinely near-sheet sample could land on
 * an unrelated, much-nearer patch and manufacture a false "self-occlusion" —
 * independent of which centreline RUN produced the sample, which is why
 * tuning the margin/radius knobs (see `scene3d.js`'s
 * `TORUS_SELF_OCCLUDE_ANALYTIC_MARGIN_MM`/`_DILATE_RADIUS_MM`, both now
 * retired) could shrink but never eliminate it.
 *
 * `buildSelfOcclusionTest` (current) instead builds a dense analytic FIELD —
 * a screen-cell bucketed near/far depth map from a fresh (u, v) sampling of
 * the torus's own exact surface, exactly `tests/helpers/
 * scene3d-torus-hole-oracle.js`'s independent F7 ground truth method — ONCE
 * per object per frame, and classifies each sample against its OWN cell's
 * near/far midpoint. No per-sample ray, so no per-sample lateral jump: a
 * cell's near/far depths come from whichever surface actually projects
 * there, never from a neighbour a perturbed ray happened to wander into.
 *
 * COORDINATE FRAMES. Both generations share `buildProjector`'s forward
 * chain, exactly matching `scene.js` (`applyObjectTransform`) and
 * `geometry3d.js` (`rotatePoint`, `projectPoint`) — duplicated, not
 * imported, so this module has zero load-order dependency on either:
 *
 *   OBJECT (chart) frame, i.e. the frame `charts.js`'s `topoTorus` builds in
 *     → apply `transform` (non-uniform scale, rotate, translate) → WORLD
 *     → apply `camAngles` rotation → CAMERA frame
 *     → forward-project (orthographic or pinhole-perspective) → SCREEN (x, y)
 *       + camera-space z.
 *
 * `buildDepthSource` additionally walks the chain in REVERSE (screen point +
 * z → a camera-frame ray → world → object/chart frame → axis-permuted into
 * `RayTorus`'s +z-hole-axis convention) to hand `RayTorus.intersect` a ray to
 * solve; `buildOverlapField` only ever needs the forward direction.
 */
(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});

  const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
  const degToRad = (deg) => (finite(deg) * Math.PI) / 180;

  // Forward rotation — byte-identical to `Vectura.Geometry3D.rotatePoint`
  // (duplicated, not imported, so this module has zero load-order
  // dependency on `geometry3d.js`; kept in exact lockstep by the shared unit
  // test that cross-checks both against random points).
  const rotatePoint = (point, angles = {}) => {
    let { x, y, z } = point;
    const yaw = degToRad(angles.yaw ?? angles.rotate ?? 0);
    const pitch = degToRad(angles.pitch ?? angles.tilt ?? 0);
    const roll = degToRad(angles.roll ?? 0);
    let c = Math.cos(yaw);
    let s = Math.sin(yaw);
    [x, z] = [(x * c) + (z * s), (-x * s) + (z * c)];
    c = Math.cos(pitch);
    s = Math.sin(pitch);
    [y, z] = [(y * c) - (z * s), (y * s) + (z * c)];
    c = Math.cos(roll);
    s = Math.sin(roll);
    [x, y] = [(x * c) - (y * s), (x * s) + (y * c)];
    return { x, y, z };
  };

  // Exact inverse of `rotatePoint` — same yaw/pitch/roll angles, applied as
  // the reverse composition (undo roll, then pitch, then yaw), each step the
  // transpose (== inverse, both are orthogonal 2D rotations) of its forward
  // counterpart. Verified by round-trip in this module's own unit test.
  const invRotatePoint = (point, angles = {}) => {
    let { x, y, z } = point;
    const yaw = degToRad(angles.yaw ?? angles.rotate ?? 0);
    const pitch = degToRad(angles.pitch ?? angles.tilt ?? 0);
    const roll = degToRad(angles.roll ?? 0);
    let c = Math.cos(roll);
    let s = Math.sin(roll);
    [x, y] = [(x * c) + (y * s), (-x * s) + (y * c)];
    c = Math.cos(pitch);
    s = Math.sin(pitch);
    [y, z] = [(y * c) + (z * s), (-y * s) + (z * c)];
    c = Math.cos(yaw);
    s = Math.sin(yaw);
    [x, z] = [(x * c) - (z * s), (x * s) + (z * c)];
    return { x, y, z };
  };

  // Perf: `rotatePoint`/`invRotatePoint` above are the PUBLIC, general-angle
  // API (kept byte-identical, still exported, still used by `chartToRT`-
  // adjacent one-off call sites) — but `buildDepthSource` below calls them
  // with only TWO distinct, FIXED angle triples (`objAngles`, `camAngles`)
  // for the entire lifetime of one built depth source, re-deriving the same
  // six `degToRad`+`Math.cos`/`Math.sin` values from scratch on every single
  // call. Profiling the F7 self-occlusion analytic path (torus fixture,
  // `taperedEnds`/`weightSmoothstep` ribbon laws) showed `rotatePoint` +
  // `invRotatePoint` alone at ~39% of the added self-test time — almost
  // entirely this redundant trig, amplified by `chartToCameraZ` calling
  // `rotatePoint(scaled, objAngles)` THREE separate times (once per .x/.y/.z
  // field it read) where one call already returns all three.
  // `makeRotator` precomputes cos/sin ONCE per angle triple and returns
  // closures that only do the remaining arithmetic — the exact same
  // formulas as `rotatePoint`/`invRotatePoint` above, so output is
  // bit-identical (same `Math.cos`/`Math.sin` inputs, evaluated once and
  // reused instead of recomputed) for every camera/transform this module
  // has ever produced.
  const makeRotator = (angles = {}) => {
    const yaw = degToRad(angles.yaw ?? angles.rotate ?? 0);
    const pitch = degToRad(angles.pitch ?? angles.tilt ?? 0);
    const roll = degToRad(angles.roll ?? 0);
    const cosYaw = Math.cos(yaw); const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch); const sinPitch = Math.sin(pitch);
    const cosRoll = Math.cos(roll); const sinRoll = Math.sin(roll);
    return {
      rotate: (point) => {
        let { x, y, z } = point;
        [x, z] = [(x * cosYaw) + (z * sinYaw), (-x * sinYaw) + (z * cosYaw)];
        [y, z] = [(y * cosPitch) - (z * sinPitch), (y * sinPitch) + (z * cosPitch)];
        [x, y] = [(x * cosRoll) - (y * sinRoll), (x * sinRoll) + (y * cosRoll)];
        return { x, y, z };
      },
      invRotate: (point) => {
        let { x, y, z } = point;
        [x, y] = [(x * cosRoll) + (y * sinRoll), (-x * sinRoll) + (y * cosRoll)];
        [y, z] = [(y * cosPitch) + (z * sinPitch), (-y * sinPitch) + (z * cosPitch)];
        [x, z] = [(x * cosYaw) - (z * sinYaw), (x * sinYaw) + (z * cosYaw)];
        return { x, y, z };
      },
    };
  };

  const sub3 = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

  // Same torus definition `charts.js`'s `topoTorus` and the F7 oracle both
  // use — a torus is a torus regardless of which code draws it.
  const torusMajorMinor = (sizes) => ({
    major: Math.max(2, finite(sizes && sizes.sx, 0) * 0.75),
    minor: Math.max(1, Math.min(finite(sizes && sizes.sy, 0), finite(sizes && sizes.sz, 0)) * 0.28),
  });

  /**
   * Build a self-occlusion depth source for ONE torus object at its current
   * camera/transform. Returns `nearestAnalyticDepth(x, y, z)`, which answers:
   * "along the camera ray through screen point (x, y) that ALSO passes
   * through camera-space depth `z`, what is the NEAREST (largest-z) real
   * point where the torus's own analytic surface exists?" — or `null` if the
   * ray misses the torus surface entirely (nothing to occlude with).
   *
   * `transform`: the object's `{x,y,z,yaw,pitch,roll,scale,sx,sy,sz}` (the
   * non-uniform per-axis scale keys, `applyObjectTransform`'s own contract —
   * absent ⇒ inherits `scale`). `camera`: `{yaw,pitch,roll,projection,
   * focalLength,cameraDistance}`. `projOpts`: `scene.js`'s `buildProjOpts`
   * result (`{centerX,centerY,scale,focal?,cameraDist?}`). `sizes`: the
   * torus's own `{sx,sy,sz}` SIZE params (distinct from `transform.sx/sy/sz`
   * — the chart's shape inputs, not the object's scale).
   */
  // Shared setup for every analytic torus projection below (the ray-based
  // `buildDepthSource` AND the field-based `buildOverlapField`): resolves
  // the object's per-axis scale/translate/rotation and the camera's
  // rotation + (orthographic|perspective) projection parameters ONCE, and
  // returns the forward chart(object)-frame -> screen/camera-space
  // projections both callers need. Kept as one function so the two
  // occlusion strategies can never silently drift onto different
  // transform/camera math.
  const buildProjector = (transform, camera, projOpts) => {
    const t = transform || {};
    const s = finite(t.scale, 1);
    const scaleX = finite(t.sx, s);
    const scaleY = finite(t.sy, s);
    const scaleZ = finite(t.sz, s);
    const objAngles = { yaw: finite(t.yaw, 0), pitch: finite(t.pitch, 0), roll: finite(t.roll, 0) };
    const translate = { x: finite(t.x, 0), y: finite(t.y, 0), z: finite(t.z, 0) };
    const camAngles = { yaw: finite(camera && camera.yaw, 0), pitch: finite(camera && camera.pitch, 0), roll: finite(camera && camera.roll, 0) };
    // Precomputed ONCE per built projector — see `makeRotator`'s header.
    const objRot = makeRotator(objAngles);
    const camRot = makeRotator(camAngles);
    const perspective = camera && camera.projection === 'perspective';
    const focal = perspective ? Math.max(1, finite(camera.focalLength, 520)) : null;
    const camDist = perspective ? Math.max(0, finite(camera.cameraDistance, 620)) : null;
    // Pinhole eye position, CAMERA frame — mirrors `scene.js`'s own
    // `camPos` (assembleScene): the point where `projectPoint`'s denominator
    // (focal + cameraDist - z) hits zero.
    const eyeCam = perspective ? { x: 0, y: 0, z: focal + camDist } : null;
    const po = projOpts || {};
    const centerX = finite(po.centerX, 0);
    const centerY = finite(po.centerY, 0);
    const projScale = Math.max(1e-6, finite(po.scale, 1));

    // world → object(chart) frame, POINT (translate applies) and VECTOR
    // (translate does not) variants.
    const worldToChartPoint = (w) => {
      const scaled = objRot.invRotate(sub3(w, translate));
      return { x: scaled.x / scaleX, y: scaled.y / scaleY, z: scaled.z / scaleZ };
    };
    const worldToChartVector = (w) => {
      const scaled = objRot.invRotate(w);
      return { x: scaled.x / scaleX, y: scaled.y / scaleY, z: scaled.z / scaleZ };
    };

    // chart(object) → world → camera, POINT variant, for walking a candidate
    // root back to a comparable camera-space z.
    const chartToCameraZ = (c) => {
      const scaled = { x: c.x * scaleX, y: c.y * scaleY, z: c.z * scaleZ };
      const rotated = objRot.rotate(scaled); // ONE call — was 3 (one per field read)
      const world = {
        x: translate.x + rotated.x,
        y: translate.y + rotated.y,
        z: translate.z + rotated.z,
      };
      return camRot.rotate(world).z;
    };

    // chart(object) → world → camera → SCREEN, full forward projection —
    // byte-identical arithmetic to `Geometry3D.projectPoint` (duplicated,
    // not imported — see this module's header), fed the camera-space point
    // this same chain produces. Returns `null` for a point at/behind the
    // near plane (nothing useful to project). `front`: true when the
    // chart-frame NORMAL (rotated the same way, translate excluded) faces
    // the camera — the same plain-rotation approximation
    // `scene3d-torus-hole-oracle.js`'s independent ground truth uses, so
    // this field and that oracle classify "front-facing" identically.
    const chartToScreen = (pos, normal) => {
      const scaled = { x: pos.x * scaleX, y: pos.y * scaleY, z: pos.z * scaleZ };
      const rotated = objRot.rotate(scaled);
      const world = {
        x: translate.x + rotated.x, y: translate.y + rotated.y, z: translate.z + rotated.z,
      };
      const camPt = camRot.rotate(world);
      const camNormal = camRot.rotate(objRot.rotate(normal));
      if (camNormal.z <= 0) return null; // back-facing — never occludes
      let sx;
      let sy;
      if (perspective) {
        const denom = (focal + camDist) - camPt.z;
        if (!(denom > focal * 0.05)) return null;
        const sp = (focal / denom) * projScale;
        sx = centerX + (camPt.x * sp);
        sy = centerY - (camPt.y * sp);
      } else {
        sx = centerX + (camPt.x * projScale);
        sy = centerY - (camPt.y * projScale);
      }
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;
      return { x: sx, y: sy, z: camPt.z };
    };

    return {
      worldToChartPoint, worldToChartVector, chartToCameraZ, chartToScreen,
      perspective, focal, camDist, eyeCam, objRot, camRot,
    };
  };

  const buildDepthSource = (transform, camera, projOpts, sizes) => {
    const {
      worldToChartPoint, worldToChartVector, chartToCameraZ, perspective, focal, camDist, eyeCam, camRot,
    } = buildProjector(transform, camera, projOpts);
    const { major, minor } = torusMajorMinor(sizes);
    const po = projOpts || {};
    const centerX = finite(po.centerX, 0);
    const centerY = finite(po.centerY, 0);
    const projScale = Math.max(1e-6, finite(po.scale, 1));

    // chart(object) → ray-torus frame: hole axis is chart's +y; RayTorus
    // expects +z. (x, y, z)_chart -> (x, z, y)_rayTorus.
    const chartToRT = (c) => ({ x: c.x, y: c.z, z: c.y });
    const rtToChart = (c) => ({ x: c.x, y: c.z, z: c.y });

    return (x, y, z) => {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
      // Recover the CAMERA-frame point for this exact sample: invert
      // `projectPoint` given its own z (both orthographic and perspective
      // branches are affine in (X, Y) at fixed Z, so this is exact, not an
      // approximation).
      let camX;
      let camY;
      if (perspective) {
        const denom = (focal + camDist) - z;
        if (!(denom > 1e-6)) return null; // at/behind the eye — not a valid sample
        const sPersp = (focal / denom) * projScale;
        if (!(sPersp > 1e-9)) return null;
        camX = (x - centerX) / sPersp;
        camY = -(y - centerY) / sPersp;
      } else {
        camX = (x - centerX) / projScale;
        camY = -(y - centerY) / projScale;
      }
      const sampleCam = { x: camX, y: camY, z };
      // Ray origin/direction in CAMERA frame: perspective casts from the
      // pinhole eye through the sample; orthographic casts parallel to +z
      // through the sample's own (X, Y).
      const rayOriginCam = perspective ? eyeCam : { x: camX, y: camY, z: 0 };
      const rayDirCam = perspective ? sub3(sampleCam, eyeCam) : { x: 0, y: 0, z: 1 };
      // CAMERA -> WORLD (undo camAngles) -> OBJECT/chart frame.
      const originWorld = camRot.invRotate(rayOriginCam);
      const dirWorld = camRot.invRotate(rayDirCam);
      const originChart = worldToChartPoint(originWorld);
      const dirChart = worldToChartVector(dirWorld);
      const originRT = chartToRT(originChart);
      const dirRT = chartToRT(dirChart);
      let roots;
      try {
        roots = Vectura.Scene3D.RayTorus.intersect(originRT, dirRT, major, minor);
      } catch (err) {
        return null;
      }
      if (!Array.isArray(roots) || !roots.length) return null;
      let nearest = -Infinity;
      for (let i = 0; i < roots.length; i++) {
        const t = roots[i];
        if (!Number.isFinite(t)) continue;
        const ptRT = Vectura.Scene3D.RayTorus.pointAt(originRT, dirRT, t);
        const ptChart = rtToChart(ptRT);
        const camZ = chartToCameraZ(ptChart);
        if (!Number.isFinite(camZ)) continue;
        if (perspective && !(camZ < (focal + camDist))) continue; // behind the eye
        if (camZ > nearest) nearest = camZ;
      }
      return Number.isFinite(nearest) && nearest > -Infinity ? nearest : null;
    };
  };

  const TAU = Math.PI * 2;

  // Analytic torus surface point + outward unit normal at (u, v) in [0, 1),
  // CHART frame. Same geometric definition `torusMajorMinor` (above) and
  // `charts.js`'s `topoTorus` both build from, and — deliberately —
  // byte-identical to `tests/helpers/scene3d-torus-hole-oracle.js`'s own
  // `torusSurface`: this field and that test's independent ground truth
  // must classify "front-facing" and "near/far" the same way, or a real fix
  // here could never actually clear the F7 0-survivors bar.
  const torusChartPoint = (major, minor, u, vv) => {
    const a = u * TAU;
    const b = vv * TAU;
    const ringR = major + (Math.cos(b) * minor);
    return {
      pos: { x: Math.cos(a) * ringR, y: Math.sin(b) * minor, z: Math.sin(a) * ringR },
      normal: { x: Math.cos(a) * Math.cos(b), y: Math.sin(b), z: Math.sin(a) * Math.cos(b) },
    };
  };

  // Genuine near/far SHEET gap (mm) a screen cell must show before it counts
  // as real self-occlusion territory at all — see `buildSelfOcclusionTest`'s
  // header. Identical to the F7 oracle's own `OVERLAP_GAP_MM`.
  const DEFAULT_GAP_MM = 8;
  // 2D screen cell width (mm) the field buckets samples into, and the dense
  // (u, v) sampling density — identical to the F7 oracle's own defaults, so
  // production classifies every screen position exactly as that independent
  // ground truth does.
  const DEFAULT_CELL_MM = 0.5;
  const DEFAULT_STEPS_U = 480;
  const DEFAULT_STEPS_V = 240;
  // Safety margin (mm) subtracted below a genuine cell's midpoint before a
  // sample counts as "on the far side" — absorbs a ribbon outline/wall/fill
  // vertex's own legitimate depth drift off its originating centreline (up
  // to roughly the ribbon's own half-width; see `docs/stroke-fill-handoff.md`
  // finding 1). `DEFAULT_GAP_MM`'s own floor already keeps a genuine cell's
  // half-gap (>= 4mm) comfortably above the largest such drift measured
  // (2.3mm), so this is deliberately small — insurance, not the main defence.
  const DEFAULT_MARGIN_MM = 1;

  /**
   * Dense-samples the torus's own EXACT analytic surface (zero tessellation
   * error, zero per-ray steep-foreshortening jump) and buckets every
   * front-facing sample by screen cell. Returns `{ cells, cellMm }` — one
   * entry per cell a front-facing sample landed in, `{ near: {x,y,z}, far:
   * {x,y,z} }` (coincide unless the cell genuinely received two depths).
   *
   * WHY A FIELD, NOT A PER-SAMPLE RAY (the prior approach). A single ray
   * cast through (x, y) is exact FOR THAT RAY, but right at the torus's
   * inner-hole cusp the near/far sheets are almost tangent: a lateral shift
   * of a fraction of a millimetre in screen space can jump which (u, v)
   * patch a ray grazes, so nudging the test point by 1-2mm (the previous
   * fix's own dilation) can land on an unrelated, much-nearer patch of
   * surface and manufacture a spurious "occlusion" — this is exactly the
   * false-positive class the cross-run F1B streaks (`interlockWeave`,
   * `onePenDown`, `trochoidLoop`, `ampSpacing`, `weaveDepth` — see
   * `docs/3d-audit/handoff/unit-a2-notes.md`) turned out to be: two SEPARATE
   * centreline runs crossing in screen space near a foreshortened patch,
   * both genuinely on the NEAR sheet, one wrongly clipped because a
   * dilated ray from its own sample happened to graze a nearer patch a
   * couple of millimetres away. A dense FIELD sidesteps this: every cell's
   * near/far depth comes from the surface that ACTUALLY projects there
   * (built once, independent of any particular ribbon sample or run), so
   * classifying a sample against its own cell never depends on where a
   * perturbed ray happens to wander.
   */
  const buildOverlapField = (transform, camera, projOpts, sizes, opts = {}) => {
    const { chartToScreen } = buildProjector(transform, camera, projOpts);
    const { major, minor } = torusMajorMinor(sizes);
    const stepsU = opts.stepsU || DEFAULT_STEPS_U;
    const stepsV = opts.stepsV || DEFAULT_STEPS_V;
    const cellMm = opts.cellMm || DEFAULT_CELL_MM;
    const cells = new Map();
    for (let iu = 0; iu < stepsU; iu++) {
      const u = iu / stepsU;
      for (let iv = 0; iv < stepsV; iv++) {
        const vv = iv / stepsV;
        const { pos, normal } = torusChartPoint(major, minor, u, vv);
        const p = chartToScreen(pos, normal);
        if (!p) continue; // back-facing or behind the near plane
        const cx = Math.round(p.x / cellMm);
        const cy = Math.round(p.y / cellMm);
        const key = `${cx},${cy}`;
        const cell = cells.get(key);
        if (!cell) { cells.set(key, { near: p, far: p }); continue; }
        if (p.z > cell.near.z) cell.near = p;
        if (p.z < cell.far.z) cell.far = p;
      }
    }
    return { cells, cellMm };
  };

  // Look up the field cell nearest (x, y) that carries a GENUINE near/far
  // sheet overlap (gap > gapMm) — a 3x3 neighbour search absorbs the field's
  // own quantisation, exactly like the F7 oracle's `overlapCellAt`. Returns
  // `null` when no such cell exists (nothing to occlude with here at all).
  const overlapCellAt = (field, x, y, gapMm) => {
    const cx = Math.round(x / field.cellMm);
    const cy = Math.round(y / field.cellMm);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cell = field.cells.get(`${cx + dx},${cy + dy}`);
        if (cell && (cell.near.z - cell.far.z) > gapMm) return cell;
      }
    }
    return null;
  };

  /**
   * Self-occlusion test built on the dense analytic field above, replacing
   * the earlier per-sample-ray + 2D-dilation approach (kept as
   * `buildDepthSource`/the old `buildSelfOcclusionTest` shape only in spirit
   * — this is a full rewrite, not a tuning pass).
   *
   * A sample is self-occluded when (a) its screen position falls in a cell
   * that genuinely shows two separated sheets (`gapMm`, default matching
   * the F7 oracle's own `OVERLAP_GAP_MM`) — filtering ordinary local-
   * curvature depth variation and near-tangent cusp noise, which never
   * exceeds a few mm — AND (b) the sample's own z reads below that cell's
   * NEAR/FAR midpoint by at least `marginMm`. This is a BOUNDARY/sheet
   * classification (which side of the two real sheets does this sample sit
   * on), not a depth epsilon compared against a perturbed neighbour — see
   * `docs/stroke-fill-handoff.md` finding 1.
   */
  const buildSelfOcclusionTest = (transform, camera, projOpts, sizes, opts = {}) => {
    const gapMm = Number.isFinite(opts.gapMm) ? opts.gapMm : DEFAULT_GAP_MM;
    const marginMm = Number.isFinite(opts.marginMm) ? opts.marginMm : DEFAULT_MARGIN_MM;
    const field = buildOverlapField(transform, camera, projOpts, sizes, opts);
    return (x, y, z) => {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
      const cell = overlapCellAt(field, x, y, gapMm);
      if (!cell) return false;
      const mid = (cell.near.z + cell.far.z) / 2;
      return z < (mid - marginMm);
    };
  };

  const api = {
    rotatePoint,
    invRotatePoint,
    torusMajorMinor,
    buildDepthSource,
    buildOverlapField,
    overlapCellAt,
    buildSelfOcclusionTest,
  };

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, { TorusOcclusion: api });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
