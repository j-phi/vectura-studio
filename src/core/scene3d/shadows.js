/**
 * Scene3D.Shadows — Phase 2 cast shadows on the ground plane (spec §3.2, §7
 * group E). Pure/deterministic; degrades (never throws) on pathological input.
 *
 * A shadow is the sun's silhouette of a caster on the y = 0 receiver. For each
 * world vertex P of a caster face we project along the travel direction d
 * (d.y < 0) to the ground:  G = P − (P.y / d.y)·d  (G.y = 0). The ground point
 * is camera-projected exactly like the mesh, so the shadow lands under the
 * object in screen space. Casters are grouped into shadow style-equivalence
 * classes; FillBoolean.union merges overlapping footprints within a class (no
 * internal seam); a higher-precedence class subtracts from a lower one; the
 * casters' own screen silhouettes are subtracted (caster-bound). The resulting
 * regions are hatched at the ground support-plane depth and routed through the
 * HLR clipper as 'ground' fills, so object faces occlude them for free (an
 * object standing in its own shadow drops the runs beneath it).
 *
 * Robustness (CONTRACT L4 + spec guardrails):
 *   - grazing light (elevation ≲ 2°) is skipped — projections blow up there;
 *   - every boolean routes through FillBoolean (safeOp → [] on the AUD-05
 *     "Unable to complete output ring" throw), so a self-intersecting caster
 *     degrades to an empty region rather than crashing generate();
 *   - draft preview (bounds.fastPreview) SKIPS all booleans and emits flat
 *     per-caster ground-projection tints — cheap and crash-proof under drag.
 */
(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const G3 = Vectura.Geometry3D || {};

  const finite = G3.finite || ((value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback));
  const rotatePoint = G3.rotatePoint;
  const projectPoint = G3.projectPoint;
  const pathWithMeta = G3.pathWithMeta || ((pts) => pts);

  // Skip shadows below this elevation (|d.y| < sin) — grazing light stretches
  // the ground projection toward infinity and reads as garbage on a plotter.
  const MIN_ELEVATION_DEG = 2;
  const MIN_ABS_DY = Math.sin(MIN_ELEVATION_DEG * Math.PI / 180);
  const MIN_RUN_MM = 0.6;
  const SHADOW_ANGLE = 45;
  const SHADOW_COVERAGE = 0.5; // shadow tone: moderately dense hatch

  const runLength = (pts) => {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return len;
  };

  const isFinitePt = (pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y);

  // Even-odd scanline hatch of a polygon-with-holes (rings = [outer, hole…],
  // each ring an array of {x,y}). Holes stay empty — the shadow of a ring-shaped
  // region, or a footprint carved by caster-bound subtraction, reads correctly.
  const hatchRingsEvenOdd = (rings, angleDeg, spacing) => {
    const segs = [];
    rings.forEach((ring) => {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        if (isFinitePt(ring[j]) && isFinitePt(ring[i])) segs.push([ring[j], ring[i]]);
      }
    });
    if (segs.length < 2) return [];
    const ang = finite(angleDeg, 45) * Math.PI / 180;
    const dirX = Math.cos(ang); const dirY = Math.sin(ang);
    const perpX = -dirY; const perpY = dirX;
    let pMin = Infinity; let pMax = -Infinity;
    segs.forEach(([a, b]) => {
      [a, b].forEach((pt) => {
        const pr = pt.x * perpX + pt.y * perpY;
        if (pr < pMin) pMin = pr;
        if (pr > pMax) pMax = pr;
      });
    });
    if (!Number.isFinite(pMin)) return [];
    const sp = Math.max(0.05, spacing);
    const count = Math.min(4000, Math.floor((pMax - pMin) / sp));
    const out = [];
    for (let i = 1; i <= count; i++) {
      const offset = pMin + i * sp;
      const hits = [];
      segs.forEach(([a, b]) => {
        const pa = a.x * perpX + a.y * perpY;
        const pb = b.x * perpX + b.y * perpY;
        if ((pa > offset) === (pb > offset)) return;
        const t = (offset - pa) / ((pb - pa) || 1e-9);
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        hits.push({ s: x * dirX + y * dirY, x, y });
      });
      hits.sort((p, q) => p.s - q.s);
      for (let k = 0; k + 1 < hits.length; k += 2) {
        out.push([{ x: hits[k].x, y: hits[k].y }, { x: hits[k + 1].x, y: hits[k + 1].y }]);
      }
    }
    return out;
  };

  // Project a world vertex onto the y = 0 ground along the light travel dir,
  // then camera-project. Returns a screen {x,y,z} or null when non-finite.
  const projectShadowVertex = (P, d, camAngles, projOpts) => {
    if (!P || !Number.isFinite(P.x) || !Number.isFinite(P.y) || !Number.isFinite(P.z)) return null;
    if (Math.abs(d.y) < MIN_ABS_DY) return null;
    const t = P.y / d.y; // ≤ 0 for a caster above ground
    const gx = P.x - t * d.x;
    const gz = P.z - t * d.z;
    if (!Number.isFinite(gx) || !Number.isFinite(gz)) return null;
    const cam = rotatePoint({ x: gx, y: 0, z: gz }, camAngles);
    const proj = projectPoint(cam, projOpts);
    if (!proj || !Number.isFinite(proj.x) || !Number.isFinite(proj.y)) return null;
    return proj;
  };

  // 2D convex hull (Andrew's monotone chain). Screen points → CCW hull ring.
  const convexHull = (input) => {
    const pts = (input || [])
      .filter((pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y))
      .map((pt) => ({ x: pt.x, y: pt.y }));
    if (pts.length < 3) return pts;
    pts.sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (let i = 0; i < pts.length; i++) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) lower.pop();
      lower.push(pts[i]);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) upper.pop();
      upper.push(pts[i]);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  };

  // One clean shadow footprint for a caster: project EVERY above-ground world
  // vertex to the ground (y = 0) along the light, then take the 2D convex hull —
  // the light-lab model (proposal §Prototypes, shadowHulls). Robust where the old
  // per-face-ring union was fragile: no mixed-winding ring soup, no FillBoolean
  // needed to merge a single object's faces, and a below-ground vertex (a caster
  // straddling the receiver) is simply dropped rather than projected the wrong
  // way into a mirrored bow-tie. Trade-off: the hull fills a concave/torus hole —
  // an accepted v1 approximation that matches the reference. Returns a screen-
  // space ring (≥3 pts) or null.
  const casterHull = (record, d, camAngles, projOpts) => {
    const world = record.world || [];
    const pts = [];
    for (let i = 0; i < world.length; i++) {
      const P = world[i];
      if (!P || !Number.isFinite(P.y) || P.y < -1e-6) continue; // below ground casts nothing onto y=0
      const q = projectShadowVertex(P, d, camAngles, projOpts);
      if (q) pts.push({ x: q.x, y: q.y });
    }
    const hull = convexHull(pts);
    return hull.length >= 3 ? hull : null;
  };

  const shadowSpacing = (penWidth) => {
    const Regions = Vectura.Scene3D && Vectura.Scene3D.Regions;
    if (Regions && typeof Regions.coverageToSpacing === 'function') {
      return Regions.coverageToSpacing(SHADOW_COVERAGE, penWidth);
    }
    return Math.max(Math.max(0.05, finite(penWidth, 0.3)) * 2, 1.5);
  };

  // Hatch a shadow polygon (rings = [outer, hole…]) at the ground support-plane
  // depth, clip against the occluders (ground never occludes; object faces do),
  // and emit visible runs.
  const emitShadowRegion = (rings, groundPlane, clipper, spacing, out, meta) => {
    if (!Array.isArray(rings) || !rings.length || !Array.isArray(rings[0]) || rings[0].length < 3) return;
    const lines = hatchRingsEvenOdd(rings, SHADOW_ANGLE, spacing);
    lines.forEach((line) => {
      const pts = line.map((pt) => ({
        x: pt.x,
        y: pt.y,
        z: groundPlane ? groundPlane.A * pt.x + groundPlane.B * pt.y + groundPlane.C : 0,
      }));
      const clip = clipper.clipPath(pts, { objectId: 'ground' });
      clip.runs.forEach((run) => {
        if (!run.visible) return; // ground shadow: hidden runs simply drop
        if (runLength(run.pts) < MIN_RUN_MM) return;
        const path = pathWithMeta(run.pts, meta);
        if (path.length >= 2) out.push(path);
      });
    });
  };

  const shadowMeta = (rings, casterId, penId, depth) => ({
    algorithm: 'scene3d',
    kind: 'sceneFill',
    sceneTarget: {
      objectId: 'ground',
      faceId: 'face:ground',
      regionClass: 'castShadow',
      casterId: casterId || null,
      pickPolygon: rings[0].map((pt) => ({ x: pt.x, y: pt.y })),
      edgeClass: null,
      depth: finite(depth, 0),
      normal: { x: 0, y: 1, z: 0 },
      facingUp: true,
      occluded: false,
    },
    ...(penId ? { penId } : {}),
  });

  // build(scene, params, bounds, clipper, lightDir, opts)
  //   opts.styleOf(objectId) -> { penId } (optional shadow style key source)
  // Returns an array of emitted shadow fill paths (sceneFill / regionClass
  // 'castShadow'). Empty when there is no ground, no caster, or grazing light.
  const build = (scene, params, bounds = {}, clipper, lightDir, opts = {}) => {
    const out = [];
    if (!scene || !scene.ground || !clipper) return out;
    const HLR = Vectura.Scene3D && Vectura.Scene3D.HLR;
    const FillBoolean = Vectura.FillBoolean;
    const light = (params && Array.isArray(params.lights) && params.lights[0]) || {};
    if (light.castShadows === false) return out;
    const d = lightDir;
    if (!d || !Number.isFinite(d.y) || Math.abs(d.y) < MIN_ABS_DY) return out; // grazing/absent

    const cam = scene.camera || {};
    const camAngles = { yaw: finite(cam.yaw, 0), pitch: finite(cam.pitch, 0), roll: finite(cam.roll, 0) };
    const projOpts = scene.projOpts || {};
    const groundFace = scene.ground.faces && scene.ground.faces[0];
    const groundPlane = groundFace && HLR ? HLR.fitSupportPlane(groundFace.polygon) : null;
    const groundDepth = groundFace ? -finite(groundFace.centroidZ, 0) : 0;
    const penWidth = finite(bounds.penWidth, 0.3);
    const spacing = shadowSpacing(penWidth);
    const styleOf = typeof opts.styleOf === 'function' ? opts.styleOf : null;

    // One convex-hull footprint per caster (the light-lab model), plus its
    // shadow style class. `rings: [hull]` keeps the downstream union/precedence
    // path unchanged — it now unions clean convex hulls instead of a per-face
    // ring soup.
    const casters = [];
    (scene.objects || []).forEach((record) => {
      if (!record || record.isGround) return;
      const hull = casterHull(record, d, camAngles, projOpts);
      if (!hull) return;
      const style = styleOf ? (styleOf(record.id) || {}) : {};
      casters.push({ id: record.id, rings: [hull], penId: style.penId || null, classKey: style.penId || '' });
    });
    if (!casters.length) return out;

    // ── Draft (CONTRACT L4): NO booleans. Flat per-caster face tints. ──────────
    if (bounds && bounds.fastPreview) {
      casters.forEach((caster) => {
        caster.rings.forEach((ring) => {
          emitShadowRegion([ring], groundPlane, clipper, spacing, out,
            shadowMeta([ring], caster.id, caster.penId, groundDepth));
        });
      });
      return out;
    }

    // ── Full quality: class union + precedence + caster-bound subtract. ────────
    // Union each ring as its OWN polygon (not a single nonzero multipolygon):
    // the mesh's faces project with mixed windings, so a nonzero fill would read
    // clockwise faces as holes and cancel the footprint. Independent union of
    // shells merges overlaps and is winding-agnostic.
    const unionRings = (rings) => {
      const geoms = rings
        .map((ring) => FillBoolean.ringToMultiPolygon(ring))
        .filter((geom) => geom.length);
      return geoms.length ? FillBoolean.union(...geoms) : [];
    };
    if (!FillBoolean || typeof FillBoolean.union !== 'function') {
      // No boolean surface available: degrade to the flat per-face tint.
      casters.forEach((caster) => caster.rings.forEach((ring) => emitShadowRegion(
        [ring], groundPlane, clipper, spacing, out, shadowMeta([ring], caster.id, caster.penId, groundDepth))));
      return out;
    }

    // Ground extent (clip every shadow to the receiver quad before unioning).
    const groundGeom = groundFace ? FillBoolean.ringToMultiPolygon(
      groundFace.polygon.map((pt) => ({ x: pt.x, y: pt.y }))) : [];
    const clipToGround = (geom) => (groundGeom.length && geom.length
      ? FillBoolean.intersection(geom, groundGeom) : geom);

    // Per-object front-face SCREEN silhouette (the caster-bound region). A
    // caster subtracts its OWN silhouette from its OWN shadow so no hatch draws
    // over its body — but NOT other objects' bodies (those are the HLR
    // clipper's job, depth-correct: an object standing over another's shadow
    // occludes it). Per-caster (not blanket) keeps the two mechanisms distinct.
    const ownSilhouette = (objectId) => {
      const record = (scene.objects || []).find((r) => r && r.id === objectId);
      if (!record) return [];
      const rings = [];
      (record.faces || []).forEach((face) => {
        if (!face || !face.front || !Array.isArray(face.polygon)) return;
        const ring = face.polygon.filter(isFinitePt).map((pt) => ({ x: pt.x, y: pt.y }));
        if (ring.length >= 3) rings.push(ring);
      });
      return rings.length ? unionRings(rings) : [];
    };

    // Per-caster shadow footprint: ground-clipped union of its face projections,
    // minus its own silhouette (caster-bound).
    casters.forEach((caster) => {
      let geom = clipToGround(unionRings(caster.rings));
      const own = ownSilhouette(caster.id);
      if (own.length && geom.length) geom = FillBoolean.difference(geom, own);
      caster.geom = geom;
    });

    // Group casters into style-equivalence classes; union member footprints.
    const classes = new Map();
    casters.forEach((caster) => {
      let cls = classes.get(caster.classKey);
      if (!cls) { cls = { key: caster.classKey, penId: caster.penId, geoms: [], casterIds: new Set() }; classes.set(caster.classKey, cls); }
      if (caster.geom && caster.geom.length) cls.geoms.push(caster.geom);
      cls.casterIds.add(caster.id);
    });

    // Precedence: '' (unstyled) sorts first = lowest precedence. A class
    // subtracts the union of every higher-precedence (later) class's geom, so
    // a styled shadow wins the overlap against an unstyled one.
    const classList = [...classes.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    classList.forEach((cls) => { cls.geom = cls.geoms.length ? FillBoolean.union(...cls.geoms) : []; });

    classList.forEach((cls, i) => {
      let geom = cls.geom;
      if (!geom || !geom.length) return;
      // Subtract higher-precedence classes.
      for (let j = i + 1; j < classList.length; j++) {
        const higher = classList[j].geom;
        if (higher && higher.length) geom = FillBoolean.difference(geom, higher);
      }
      if (!geom || !geom.length) return;
      const casterId = cls.casterIds.size === 1 ? [...cls.casterIds][0] : null;
      // One region per polygon (outer + holes) so even-odd keeps holes empty.
      geom.forEach((polygon) => {
        const rings = (polygon || [])
          .map((ring) => (ring || []).map((pt) => ({ x: pt[0], y: pt[1] })))
          .filter((ring) => ring.length >= 3);
        if (!rings.length) return;
        emitShadowRegion(rings, groundPlane, clipper, spacing, out,
          shadowMeta(rings, casterId, cls.penId, groundDepth));
      });
    });

    return out;
  };

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, { Shadows: { build } });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { build };
  }
})();
