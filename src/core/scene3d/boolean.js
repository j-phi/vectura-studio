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
 * Increment 1 handles `op:'subtract'`; union/intersect groups are Increment 3
 * (their children flow through unchanged for now). A role:'hole' object that is
 * not inside a handled boolean group is INERT — it renders as a solid.
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
  // falls back to uncarved children rather than stalling the frame.
  const MAX_CSG_TRIANGLES = 60000;

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

  const combineGroup = (group, objIndex, draft, Scene, CSG) => {
    if (draft) return null;                 // CONTRACT L4 — no booleans on draft frames
    if (!CSG || !Scene) return null;
    const children = (group.children || []).map((cid) => objIndex.get(cid)).filter(Boolean);
    if (children.length < 2) return null;

    const solids = children.filter((o) => roleOf(o) !== 'hole');
    const holes = children.filter((o) => roleOf(o) === 'hole');

    // Build every child's world mesh once, enforcing the triangle budget.
    let tris = 0;
    const meshByObj = new Map();
    for (let i = 0; i < children.length; i++) {
      const m = worldMesh(Scene, children[i]);
      tris += triCount(m);
      if (tris > MAX_CSG_TRIANGLES) return null;
      meshByObj.set(children[i], m);
    }
    const meshOf = (o) => meshByObj.get(o);

    let result = null;
    if (holes.length) {
      const solidMeshes = solids.map(meshOf).filter(Boolean);
      if (!solidMeshes.length) return null;
      const base = solidMeshes.length === 1 ? solidMeshes[0] : CSG.combine('union', solidMeshes);
      if (!base) return null;
      const holeMeshes = holes.map(meshOf).filter(Boolean);
      const holeUnion = holeMeshes.length === 1 ? holeMeshes[0] : CSG.combine('union', holeMeshes);
      if (!holeUnion) return null;
      result = CSG.subtract(base, holeUnion);
    } else {
      // No explicit holes: positional subtract children[0] − children[1..].
      result = CSG.combine('subtract', children.map(meshOf).filter(Boolean));
    }
    if (!result || !Array.isArray(result.faces) || !result.faces.length) return null;

    const primary = solids[0] || children[0];
    const csgFaceted = children.every((o) => FACETED.has(o.primitive));
    const meshData = {
      vertices: result.vertices,
      faces: result.faces,
      faceIds: result.faces.map((_, i) => `face:csg:${i}`),
      pretransformed: true,
      csgFaceted,
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

    // Only op:'subtract' groups are carved in Increment 1. union/intersect and
    // op:'none' groups leave their children as independent objects (byte-
    // identical to the legacy path — the Increment-0 regression pin).
    const groups = Array.isArray(p.groups) ? p.groups : [];
    const objIndex = new Map(objects.map((o) => [o.id, o]));
    const groupByObj = new Map();
    groups.forEach((g) => {
      if (!g || g.op !== 'subtract' || !Array.isArray(g.children)) return;
      g.children.forEach((cid) => { if (!groupByObj.has(cid)) groupByObj.set(cid, g); });
    });

    const units = [];
    const emitted = new Set();
    objects.forEach((obj) => {
      const g = groupByObj.get(obj.id);
      if (!g) { units.push(plainUnit(obj)); return; }
      if (emitted.has(g)) return; // already emitted at the first-seen child's slot
      emitted.add(g);
      const combined = combineGroup(g, objIndex, draft, Scene, CSG);
      if (combined) { units.push(combined); return; }
      // Fallback: uncarved children in child order.
      (g.children || []).forEach((cid) => {
        const c = objIndex.get(cid);
        if (c) units.push(plainUnit(c));
      });
    });
    return units;
  };

  const api = {
    resolveAssembly,
    FACETED,
    MAX_CSG_TRIANGLES,
  };

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, { Boolean: api });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
