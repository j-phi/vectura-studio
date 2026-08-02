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

  // Build a child's WORLD-space mesh (camera-independent): primitive mesh, then
  // applyObjectTransform per vertex. Faces stay n-gon; CSG fan-triangulates.
  const worldMesh = (Scene, obj) => {
    const mesh = Scene.buildPrimitiveMesh(capObjForCsg(obj), 1);
    const t = obj.transform;
    const vertices = mesh.vertices.map((pt) => Scene.applyObjectTransform(pt, t));
    return { vertices, faces: mesh.faces };
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
        parts.push({ mesh, role: roleOf(obj), faceted: FACETED.has(obj.primitive) });
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

  const combineGroup = (group, objIndex, groupIndex, draft, Scene, CSG) => {
    if (draft) return null;                 // CONTRACT L4 — no booleans on draft frames
    if (!CSG || !Scene) return null;
    const ctx = { objIndex, groupIndex, Scene, CSG, seen: new Set(), tris: 0, overrun: false };
    const result = combineMesh(group, ctx);
    if (ctx.overrun || !result || !Array.isArray(result.faces) || !result.faces.length) return null;

    const primary = primaryObject(group, objIndex, groupIndex);
    if (!primary) return null;
    const meshData = {
      vertices: result.vertices,
      faces: result.faces,
      faceIds: result.faces.map((_, i) => `face:csg:${i}`),
      pretransformed: true,
      // All-faceted carve (box−box…) hatches per-face; any curved child (a
      // box−cylinder bore) routes through the continuous-region path.
      csgFaceted: !!result.faceted,
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
      const combined = combineGroup(g, objIndex, groupIndex, draft, Scene, CSG);
      if (combined) { units.push(combined); return; }
      // Fallback: uncarved leaf objects in child order.
      leafObjectsOf(g).forEach((cid) => {
        const c = objIndex.get(cid);
        if (c) units.push(plainUnit(c));
      });
    });
    return units;
  };

  const api = {
    resolveAssembly,
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
