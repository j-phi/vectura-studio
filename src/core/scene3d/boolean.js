/**
 * Scene3D.Boolean — group resolver / assembly planner for the scene3d layer.
 *
 * `resolveAssembly(p, detailScale, { draft })` turns the normalized scene into
 * an ordered list of assembly UNITS, each `{ obj, meshData }` ready for
 * Scene.buildRecord:
 *   • an ungrouped object (or a member of an op:'none' group) → a plain unit
 *     whose meshData is the usual Scene.buildPrimitiveMesh (byte-identical to
 *     the legacy per-object path — the Increment-0 regression pin);
 *   • a boolean group → ONE combined pseudo-object whose meshData is a carved,
 *     WORLD-space, welded index mesh (pretransformed:true, primitive:'csg').
 *
 * Increment 1 handled `op:'subtract'`; Increment 3 adds `op:'union'` and
 * `op:'intersect'`, multi-solid / multi-hole groups, and NESTED groups (a group
 * listed as another group's child, resolved depth-first). A role:'hole' object
 * that is not inside a handled boolean group is INERT — it renders as a solid.
 * An `op:'none'` group leaves its children independent (the Increment-0 pin).
 *
 * Composition: the combined pseudo-object borrows the PRIMARY solid's identity
 * (id / name / visibility / border) so style, occlusion, per-object shadow and
 * sceneTarget all resolve against the primary with ZERO downstream change — the
 * primary object still exists in p.objects, so its byObject style + shadow
 * lookups hit. Hole objects contribute geometry only.
 *
 * Graceful degradation (CONTRACT L4): a draft frame, a missing CSG module, a
 * triangle-budget overrun, or ANY CSG failure/empty result → the group's
 * children are emitted UNCARVED, so the frame never throws and live drags stay
 * responsive.
 *
 * Dependency chain: Geometry3D → Scene3D.Mesh → Scene3D.CSG → Scene3D.Boolean →
 * Scene3D.Scene. Scene / CSG are read lazily at call time (Boolean registers
 * before Scene in index.html, but resolveAssembly only runs at render time when
 * every module is present).
 */
(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});

  // Primitives whose faces are large flat planes (per-face in-plane hatch). A
  // combined mesh is `csgFaceted` iff every child is one of these.
  const FACETED = new Set(['box', 'plane', 'solid']);
  // Hard cap on the carved input complexity. box−box is a few dozen triangles;
  // this only fires on dense curved−curved (Increment 2), where an overrun
  // falls back to uncarved children rather than stalling the frame. Held on a
  // mutable CONFIG so a test (or a future perf tier) can retune it at runtime.
  const CONFIG = { maxTriangles: 60000 };

  const roleOf = (obj) => (obj && obj.role === 'hole' ? 'hole' : 'solid');
  const triCount = (mesh) => (mesh.faces || []).reduce((n, f) => n + Math.max(0, (f.length || 0) - 2), 0);

  // Clamp a curved child's tessellation before carving so the BSP stays cheap
  // and the seam slivers stay few (box/plane/solid pass through untouched).
  const capObjForCsg = (obj) => {
    if (FACETED.has(obj.primitive)) return obj;
    const raw = (obj.params && Number.isFinite(obj.params.detail)) ? obj.params.detail : 24;
    const detail = Math.min(16, Math.max(4, Math.round(raw)));
    return { ...obj, params: { ...(obj.params || {}), detail } };
  };

  // ── B4: group transform ──────────────────────────────────────────────────────────────────────────────────────────────
  // A boolean group may carry an optional `transform` ({x,y,z,yaw,pitch,roll,scale,sx,sy,sz}; absent = identity, so every
  // existing scene is byte-identical). It is applied AFTER each operand's own transform, about the group PIVOT = the mean of
  // the operands' own positions (stable while only the group transform changes). x/y/z move the whole group; yaw/pitch/roll
  // turn it and scale/sx/sy/sz stretch it about the pivot, in world space. For the carved result it is applied to the world
  // mesh, so non-uniform scale on rotated operands stays exact; the uncarved fallback (draft frames, over-budget carves)
  // composes it into each operand's transform (exact except non-uniform scale on a rotated operand, which loses its shear).
  const groupTransformOf = (g) => (g && g.transform && typeof g.transform === 'object' ? g.transform : null);

  const groupPivot = (operandTransforms) => {
    const list = (operandTransforms || []).filter((t) => t && typeof t === 'object');
    if (!list.length) return { x: 0, y: 0, z: 0 };
    let x = 0; let y = 0; let z = 0;
    list.forEach((t) => { x += Number(t.x) || 0; y += Number(t.y) || 0; z += Number(t.z) || 0; });
    return { x: x / list.length, y: y / list.length, z: z / list.length };
  };

  // p' = pivot + T + R·S·(p − pivot)
  const applyGroupToPoint = (Scene, pt, gt, pivot) => {
    const q = Scene.applyObjectTransform({ x: pt.x - pivot.x, y: pt.y - pivot.y, z: pt.z - pivot.z }, gt);
    return { x: q.x + pivot.x, y: q.y + pivot.y, z: q.z + pivot.z };
  };

  const rad = (d) => (Number(d) || 0) * Math.PI / 180;
  // Rotation matrix (columns = images of the basis vectors) of an object's yaw/pitch/roll, via the engine's own rotator.
  const rotMatrix = (Scene, t) => {
    const col = (e) => Scene.applyObjectTransform(e, { x: 0, y: 0, z: 0, yaw: t.yaw, pitch: t.pitch, roll: t.roll, scale: 1 });
    const cx = col({ x: 1, y: 0, z: 0 }); const cy = col({ x: 0, y: 1, z: 0 }); const cz = col({ x: 0, y: 0, z: 1 });
    return [[cx.x, cy.x, cz.x], [cx.y, cy.y, cz.y], [cx.z, cy.z, cz.z]];
  };
  const matMul = (a, b) => a.map((row, i) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
  // Inverse of Scene.rotatePoint's yaw → pitch → roll order (M = Rz(roll)·Rx(pitch)·Ry(yaw)).
  const eulerOf = (m) => {
    const sp = Math.max(-1, Math.min(1, m[2][1]));
    const pitch = Math.asin(sp);
    let yaw; let roll;
    if (Math.abs(sp) < 0.999999) {
      yaw = Math.atan2(-m[2][0], m[2][2]);
      roll = Math.atan2(-m[0][1], m[1][1]);
    } else { yaw = 0; roll = Math.atan2(m[1][0], m[0][0]); }
    const deg = (r) => Math.round((r * 180 / Math.PI) * 1e6) / 1e6;
    return { yaw: deg(yaw), pitch: deg(pitch), roll: deg(roll) };
  };

  // An operand's transform with the group transform composed on top (uncarved fallback only).
  const composeOperandTransform = (Scene, own, gt, pivot) => {
    const o = own || {};
    const pos = applyGroupToPoint(Scene, { x: Number(o.x) || 0, y: Number(o.y) || 0, z: Number(o.z) || 0 }, gt, pivot);
    const so = Number.isFinite(o.scale) ? o.scale : 1;
    const sg = Number.isFinite(gt.scale) ? gt.scale : 1;
    const axis = (ov, gv) => (Number.isFinite(ov) ? ov : so) * (Number.isFinite(gv) ? gv : sg);
    const sx = axis(o.sx, gt.sx); const sy = axis(o.sy, gt.sy); const sz = axis(o.sz, gt.sz);
    const rot = eulerOf(matMul(rotMatrix(Scene, gt), rotMatrix(Scene, o)));
    const out = { ...o, x: pos.x, y: pos.y, z: pos.z, yaw: rot.yaw, pitch: rot.pitch, roll: rot.roll, scale: so * sg };
    if (!(sx === so * sg && sy === so * sg && sz === so * sg)) { out.sx = sx; out.sy = sy; out.sz = sz; } else { delete out.sx; delete out.sy; delete out.sz; }
    return out;
  };

  // Build a child's WORLD-space mesh (camera-independent): primitive mesh, then
  // applyObjectTransform per vertex. Faces stay n-gon; CSG fan-triangulates.
  // Carries the primitive's per-face ids through for source attribution.
  const worldMesh = (Scene, obj) => {
    const mesh = Scene.buildPrimitiveMesh(capObjForCsg(obj), 1);
    const t = obj.transform;
    const vertices = mesh.vertices.map((pt) => Scene.applyObjectTransform(pt, t));
    return { vertices, faces: mesh.faces, faceIds: mesh.faceIds };
  };

  // Resolve ONE group to a raw carved mesh `{ vertices, faces, faceted }` (or
  // null). Children may be objects (→ world mesh) or nested groups (→ recurse,
  // depth-first). `ctx` carries the shared triangle budget + a `seen` set that
  // breaks any residual A⊂B⊂A cycle. A part's `role` (solid/hole) governs its
  // side of the op; a nested group always contributes as a SOLID part.
  const combineMesh = (group, ctx) => {
    if (!group || group.op === 'none') return null;
    if (ctx.seen.has(group.id)) return null;          // cycle guard
    ctx.seen.add(group.id);
    const parts = [];
    (group.children || []).forEach((cid) => {
      if (ctx.overrun) return;
      const obj = ctx.objIndex.get(cid);
      if (obj) {
        const mesh = worldMesh(ctx.Scene, obj);
        ctx.tris += triCount(mesh);
        if (ctx.tris > CONFIG.maxTriangles) { ctx.overrun = true; return; }
        const role = roleOf(obj);
        // Source-attribution tag per input face (threaded through the BSP's
        // `shared` slot): a solid's faces keep their own object+face identity;
        // a hole's faces are attributed to the SOLID being carved (its cut walls
        // read as the solid's interior — the group's primary), never the hole.
        mesh.faceTags = mesh.faces.map((_, i) => (role === 'hole'
          ? { objectId: ctx.primaryId, faceId: null }
          : { objectId: obj.id, faceId: (mesh.faceIds && mesh.faceIds[i]) || null }));
        parts.push({ mesh, role, faceted: FACETED.has(obj.primitive) });
        return;
      }
      const nested = ctx.groupIndex.get(cid);
      if (nested) {
        const sub = combineMesh(nested, ctx);
        if (sub) parts.push({ mesh: sub, role: 'solid', faceted: sub.faceted });
      }
    });
    ctx.seen.delete(group.id);
    if (ctx.overrun) return null;
    if (parts.length < 2) return null;                // a boolean needs ≥2 parts

    const solids = parts.filter((p) => p.role !== 'hole');
    const holes = parts.filter((p) => p.role === 'hole');
    const meshesOf = (list) => list.map((p) => p.mesh).filter(Boolean);
    const foldUnion = (list) => (list.length === 1 ? list[0] : ctx.CSG.combine('union', list));

    let result = null;
    if (group.op === 'union') {
      const base = foldUnion(meshesOf(solids.length ? solids : parts));
      if (!base) return null;
      result = holes.length ? ctx.CSG.subtract(base, foldUnion(meshesOf(holes))) : base;
    } else if (group.op === 'intersect') {
      const solidMeshes = meshesOf(solids.length ? solids : parts);
      const base = solidMeshes.length === 1 ? solidMeshes[0] : ctx.CSG.combine('intersect', solidMeshes);
      if (!base) return null;
      result = holes.length ? ctx.CSG.subtract(base, foldUnion(meshesOf(holes))) : base;
    } else { // subtract
      if (holes.length) {
        const base = foldUnion(meshesOf(solids.length ? solids : [parts[0]]));
        if (!base) return null;
        result = ctx.CSG.subtract(base, foldUnion(meshesOf(holes)));
      } else {
        // No explicit holes: positional subtract parts[0] − parts[1..].
        result = ctx.CSG.combine('subtract', meshesOf(parts));
      }
    }
    if (!result || !Array.isArray(result.faces) || !result.faces.length) return null;
    result.faceted = parts.every((p) => p.faceted);
    return result;
  };

  // Depth-first: the PRIMARY solid whose identity/style the combined unit
  // borrows — the first role:'solid' object found, else the first object.
  const primaryObject = (group, objIndex, groupIndex, seen = new Set()) => {
    if (!group || seen.has(group.id)) return null;
    seen.add(group.id);
    let firstAny = null;
    const kids = group.children || [];
    for (let i = 0; i < kids.length; i++) {
      const o = objIndex.get(kids[i]);
      if (o) { if (!firstAny) firstAny = o; if (roleOf(o) !== 'hole') return o; }
    }
    for (let i = 0; i < kids.length; i++) {
      const g = groupIndex.get(kids[i]);
      if (g) { const r = primaryObject(g, objIndex, groupIndex, seen); if (r) return r; }
    }
    return firstAny;
  };

  // Whole-style equality (byFace > byObject > scene resolution returns a normalized
  // { penId, mapper, params }); provenance is ignored.
  const styleEq = (a, b) => a && b && a.penId === b.penId && a.mapper === b.mapper
    && JSON.stringify(a.params || {}) === JSON.stringify(b.params || {});

  // Re-attribute each output fragment to its SOURCE object+face style where that
  // DIFFERS from the primary baseline. The combined unit borrows the primary's
  // id, so downstream `resolveStyle(primaryId, 'face:csg:<i>')` already yields
  // the baseline; only the differing fragments need an override entry, which the
  // generator merges into a non-persistent byFace clone. Gate = byte-identical
  // when a unit carries one uniform style (the common single-style case): no
  // fragment differs from baseline, so this returns null (no key added).
  const buildFaceStyleOverrides = (faceTags, primaryId, styleTable) => {
    const SC = Vectura.Scene3D && Vectura.Scene3D.StyleCascade;
    if (!SC || typeof SC.resolve !== 'function' || !Array.isArray(faceTags)) return null;
    let baseline;
    try {
      baseline = SC.resolve(styleTable, { objectId: primaryId, faceId: null });
    } catch (_) { return null; }
    const out = {};
    let any = false;
    faceTags.forEach((tag, i) => {
      if (!tag) return;
      let src;
      try { src = SC.resolve(styleTable, { objectId: tag.objectId, faceId: tag.faceId }); } catch (_) { return; }
      if (!src || styleEq(src, baseline)) return;
      out[`face:csg:${i}`] = { penId: src.penId, mapper: src.mapper, params: src.params };
      any = true;
    });
    return any ? out : null;
  };

  // Every leaf operand OBJECT under a group (depth-first, cycle-safe).
  const leafOperandsOf = (group, objIndex, groupIndex, acc = [], seen = new Set()) => {
    if (!group || seen.has(group.id)) return acc;
    seen.add(group.id);
    (group.children || []).forEach((cid) => {
      if (objIndex.has(cid)) acc.push(objIndex.get(cid));
      else if (groupIndex.has(cid)) leafOperandsOf(groupIndex.get(cid), objIndex, groupIndex, acc, seen);
    });
    return acc;
  };

  const combineGroup = (group, objIndex, groupIndex, draft, Scene, CSG, styleTable) => {
    if (draft) return null;                 // CONTRACT L4 — no booleans on draft frames
    if (!CSG || !Scene) return null;
    const primary = primaryObject(group, objIndex, groupIndex);
    if (!primary) return null;
    // primaryId is needed DURING the carve so a hole's cut walls attribute to the
    // solid; compute the primary first and thread it through ctx.
    const ctx = { objIndex, groupIndex, Scene, CSG, seen: new Set(), tris: 0, overrun: false, primaryId: primary.id };
    const result = combineMesh(group, ctx);
    if (ctx.overrun || !result || !Array.isArray(result.faces) || !result.faces.length) return null;
    const gt = groupTransformOf(group);
    if (gt) {
      const pivot = groupPivot(leafOperandsOf(group, objIndex, groupIndex).map((o) => o.transform));
      result.vertices = result.vertices.map((pt) => applyGroupToPoint(Scene, pt, gt, pivot));
    }

    const faceStyleOverrides = buildFaceStyleOverrides(result.faceTags, primary.id, styleTable);
    const meshData = {
      vertices: result.vertices,
      faces: result.faces,
      faceIds: result.faces.map((_, i) => `face:csg:${i}`),
      pretransformed: true,
      // All-faceted carve (box−box…) hatches per-face; any curved child (a
      // box−cylinder bore) routes through the continuous-region path.
      csgFaceted: !!result.faceted,
      // Per-fragment source-attributed styles (omitted entirely when the unit is
      // uniform — the byte-identical single-style path).
      ...(faceStyleOverrides ? { faceStyleOverrides } : {}),
    };
    const pseudo = {
      id: primary.id,
      name: primary.name,
      primitive: 'csg',
      visibility: primary.visibility || 'solid',
      border: primary.border || null,
      transform: null,
    };
    return { obj: pseudo, meshData };
  };

  // p must already be normalized (Scene3D.Params.normalizeParams).
  const resolveAssembly = (p, detailScale = 1, opts = {}) => {
    const draft = !!(opts && opts.draft);
    const Scene = Vectura.Scene3D && Vectura.Scene3D.Scene;
    const CSG = Vectura.Scene3D && Vectura.Scene3D.CSG;
    const objects = Array.isArray(p.objects) ? p.objects : [];
    const plainUnit = (obj) => ({ obj, meshData: Scene.buildPrimitiveMesh(obj, detailScale) });

    // Every boolean op (subtract/union/intersect) carves; op:'none' and
    // ungrouped objects stay independent (byte-identical to the legacy path —
    // the Increment-0 regression pin). A nested group is resolved by its parent,
    // not as its own assembly unit.
    const groups = Array.isArray(p.groups) ? p.groups : [];
    const objIndex = new Map(objects.map((o) => [o.id, o]));
    const groupIndex = new Map(groups.map((g) => [g.id, g]));
    const isBoolean = (g) => g && g.op && g.op !== 'none' && Array.isArray(g.children);

    // A group referenced as another group's child is NESTED — its parent owns it.
    const nestedGroupIds = new Set();
    groups.forEach((g) => (g.children || []).forEach((cid) => {
      if (groupIndex.has(cid)) nestedGroupIds.add(cid);
    }));
    const topGroups = groups.filter((g) => isBoolean(g) && !nestedGroupIds.has(g.id) && g.children.length);

    // Every leaf OBJECT under a top group (depth-first), for emission ordering +
    // uncarved fallback.
    const leafObjectsOf = (g, acc = [], seen = new Set()) => {
      if (!g || seen.has(g.id)) return acc;
      seen.add(g.id);
      (g.children || []).forEach((cid) => {
        if (objIndex.has(cid)) acc.push(cid);
        else if (groupIndex.has(cid)) leafObjectsOf(groupIndex.get(cid), acc, seen);
      });
      return acc;
    };
    const groupByObj = new Map();
    topGroups.forEach((g) => leafObjectsOf(g).forEach((oid) => {
      if (!groupByObj.has(oid)) groupByObj.set(oid, g);
    }));

    const units = [];
    const emitted = new Set();
    objects.forEach((obj) => {
      const g = groupByObj.get(obj.id);
      if (!g) { units.push(plainUnit(obj)); return; }
      if (emitted.has(g)) return; // already emitted at the first-seen child's slot
      emitted.add(g);
      const combined = combineGroup(g, objIndex, groupIndex, draft, Scene, CSG, p.styleTable);
      if (combined) { units.push(combined); return; }
      // Fallback: uncarved leaf objects in child order.
      const gt = groupTransformOf(g);
      const pivot = gt ? groupPivot(leafOperandsOf(g, objIndex, groupIndex).map((o) => o.transform)) : null;
      leafObjectsOf(g).forEach((cid) => {
        const c = objIndex.get(cid);
        if (!c) return;
        units.push(plainUnit(gt ? { ...c, transform: composeOperandTransform(Scene, c.transform, gt, pivot) } : c));
      });
    });
    return units;
  };

  const api = {
    resolveAssembly,
    groupPivot,
    applyGroupToPoint,
    FACETED,
    CONFIG,
    // Back-compat alias (read-only snapshot); the live cap lives on CONFIG.
    MAX_CSG_TRIANGLES: CONFIG.maxTriangles,
  };

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, { Boolean: api });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
