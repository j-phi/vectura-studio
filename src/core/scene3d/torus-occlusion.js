/**
 * Scene3D.TorusOcclusion — analytic (closed-form) self-occlusion depth source
 * for a torus, built on `Scene3D.RayTorus` (kept from an earlier, reverted
 * attempt — see that module's own header).
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
 * A margin is still required on THIS side too, because the geometry being
 * TESTED (a ribbon's widened outline/fill/wall boundary) is not itself
 * sampled exactly on the analytic surface — it can sit up to roughly one
 * ribbon half-width off it. Too small a margin here reintroduces false
 * positives on ordinary near-sheet ink (a previous attempt applying this test
 * broadly with too tight a margin measured mass misfires on ~1/3 of sampled
 * surface points). `DEFAULT_MARGIN_MM` below is picked to sit above that
 * drift and is still exposed as a parameter so callers (and the RGR test) can
 * tune it down to the smallest value that still clears every real crossing.
 *
 * COORDINATE FRAMES. Three, exactly matching the forward pipeline built by
 * `scene.js` (`applyObjectTransform`) and `geometry3d.js` (`rotatePoint`,
 * `projectPoint`) — this module only walks that SAME chain in reverse:
 *
 *   screen (x, y) + camera-space z  →  CAMERA frame ray
 *     → invert `camAngles` rotation → WORLD frame ray
 *     → invert `transform` (translate, rotate, non-uniform scale) → OBJECT
 *       (chart) frame ray, i.e. the frame `charts.js`'s `topoTorus` builds in
 *     → axis permutation (the chart's hole axis is +y; `RayTorus` assumes
 *       +z) → RAY-TORUS frame, fed to `RayTorus.intersect`.
 *
 * Every real root is walked back through the SAME chain (forward this time)
 * to recover its camera-space z, in the same "larger z = nearer" convention
 * every emitted `sceneFill` path already uses, so it can be compared directly
 * against the sample's own z.
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
  const buildDepthSource = (transform, camera, projOpts, sizes) => {
    const t = transform || {};
    const s = finite(t.scale, 1);
    const scaleX = finite(t.sx, s);
    const scaleY = finite(t.sy, s);
    const scaleZ = finite(t.sz, s);
    const objAngles = { yaw: finite(t.yaw, 0), pitch: finite(t.pitch, 0), roll: finite(t.roll, 0) };
    const translate = { x: finite(t.x, 0), y: finite(t.y, 0), z: finite(t.z, 0) };
    const camAngles = { yaw: finite(camera && camera.yaw, 0), pitch: finite(camera && camera.pitch, 0), roll: finite(camera && camera.roll, 0) };
    // Precomputed ONCE per built depth source — see `makeRotator`'s header.
    const objRot = makeRotator(objAngles);
    const camRot = makeRotator(camAngles);
    const { major, minor } = torusMajorMinor(sizes);
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
    // chart(object) → ray-torus frame: hole axis is chart's +y; RayTorus
    // expects +z. (x, y, z)_chart -> (x, z, y)_rayTorus.
    const chartToRT = (c) => ({ x: c.x, y: c.z, z: c.y });
    const rtToChart = (c) => ({ x: c.x, y: c.z, z: c.y });

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
  // Defaults for `buildSelfOcclusionTest` below — see its own header for why
  // both a Z margin AND an (x, y) dilation radius are needed, and
  // `TORUS_SELF_OCCLUDE_ANALYTIC_MARGIN_MM` in `scene3d.js` for the measured
  // margin/survivors/coverage curve this was tuned against.
  const DEFAULT_MARGIN_MM = 4;
  const DEFAULT_DILATE_RADIUS_MM = 4;
  const DEFAULT_DILATE_DIRECTIONS = 8;

  /**
   * Self-occlusion test wrapping `buildDepthSource` with a 2D (x, y)
   * dilation — the "2D silhouette-footprint exclusion" this module's header
   * promises.
   *
   * WHY A SINGLE EXACT RAY IS NOT ENOUGH. Right at the torus's inner-hole
   * cusp the near and far sheets are almost tangent, so the surface is
   * steeply foreshortened THERE: a lateral shift of a fraction of a
   * millimetre in screen space can correspond to a large jump in which
   * (u, v) chart coordinate a ray actually grazes. Measured on this fixture:
   * a real far-sheet survivor's OWN exact ray misses the near sheet
   * entirely (the closed-form solver correctly reports "nothing nearer" for
   * THAT precise pixel), while a ray cast from a point 1-2mm away, along
   * the exact same local patch of surface, finds it 30+ mm nearer. The
   * single-ray depth source is CORRECT for the ray it is asked about; the
   * bug is upstream, in treating "occludes at this exact pixel" as the same
   * question as "occludes this general screen AREA" when the geometry being
   * tested (a ribbon's widened outline/fill/wall boundary, sampled at
   * SAMPLE_STEP along its own path, never exactly on the analytic surface)
   * only approximately lands in that area to begin with.
   *
   * The fix: cast several rays in a small ring around (x, y) (radius
   * `dilateRadiusMm`) IN ADDITION to the exact one, and call the point
   * self-occluded if ANY of them finds a nearer surface point by more than
   * `marginMm`. This is a real 2D footprint dilation, not merely a looser Z
   * margin — the two are independent knobs for two independent slop
   * sources (surface foreshortening in (x, y); ribbon-width drift in z).
   */
  const buildSelfOcclusionTest = (transform, camera, projOpts, sizes, opts = {}) => {
    const margin = Number.isFinite(opts.marginMm) ? opts.marginMm : DEFAULT_MARGIN_MM;
    const radius = Number.isFinite(opts.dilateRadiusMm) ? opts.dilateRadiusMm : DEFAULT_DILATE_RADIUS_MM;
    const dirs = Math.max(1, Math.round(opts.dilateDirections || DEFAULT_DILATE_DIRECTIONS));
    const depthSource = buildDepthSource(transform, camera, projOpts, sizes);
    const offsets = [{ dx: 0, dy: 0 }];
    if (radius > 0) {
      for (let i = 0; i < dirs; i++) {
        const a = (i / dirs) * TAU;
        offsets.push({ dx: Math.cos(a) * radius, dy: Math.sin(a) * radius });
      }
    }
    return (x, y, z) => {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
      for (let i = 0; i < offsets.length; i++) {
        const d = depthSource(x + offsets[i].dx, y + offsets[i].dy, z);
        if (d !== null && (d - z) > margin) return true;
      }
      return false;
    };
  };

  const api = {
    rotatePoint,
    invRotatePoint,
    torusMajorMinor,
    buildDepthSource,
    buildSelfOcclusionTest,
  };

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, { TorusOcclusion: api });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
