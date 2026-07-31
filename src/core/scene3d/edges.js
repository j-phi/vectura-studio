/**
 * Scene3D.Edges — S3 edge classification (Blender Line Art taxonomy, Phase 1
 * subset): silhouette · crease · boundary. 'hidden' is a VISIBILITY outcome
 * (stamped after HLR), not a topology class, so it is not produced here.
 *
 * - boundary   edge bounded by exactly one face (open surfaces: plane, tube rims)
 * - silhouette edge shared by one front-facing + one back-facing face
 * - crease     edge whose two faces' WORLD normals disagree by more than the
 *              crease angle (dihedral is intrinsic, so world space, not camera)
 * - interior   everything else — emitted only for wireframe-mapped faces
 *
 * Edge identity (A-08): the canonical sorted vertex-pair key from
 * Geometry3D.edgeKey, carried on each record as `edgeId`.
 */
(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const G3 = Vectura.Geometry3D || {};

  const { clamp, finite, dot, normalize, degToRad, edgeKey } = G3;

  const DEFAULT_CREASE_ANGLE = 28; // degrees

  // `record` is a Scene3D.Scene object record ({ faces, edges }); returns one
  // classification entry per mesh edge (classes: silhouette | crease |
  // boundary | interior). `frontFaceIdx` picks the adjacent face whose id and
  // normal ride on the emitted path meta (CONTRACT B): the front face, the
  // nearer one when both are front, the lone face for boundaries.
  const classifyEdges = (record, opts = {}) => {
    const creaseAngle = clamp(finite(opts.creaseAngle, DEFAULT_CREASE_ANGLE), 0, 180);
    const cosThreshold = Math.cos(degToRad(creaseAngle));
    const faces = record.faces || [];
    return (record.edges || []).map((edge) => {
      const adjacent = edge.faces.map((idx) => faces[idx]).filter(Boolean);
      let cls = 'interior';
      if (adjacent.length === 1) {
        cls = 'boundary';
      } else if (adjacent.length === 2) {
        const [f0, f1] = adjacent;
        if (f0.front !== f1.front) {
          cls = 'silhouette';
        } else {
          const d = clamp(dot(normalize(f0.normalWorld), normalize(f1.normalWorld)), -1, 1);
          if (d < cosThreshold) cls = 'crease';
        }
      }
      // Meta face: front wins; among two fronts (or two backs) the nearer one.
      let metaFace = null;
      const fronts = adjacent.filter((f) => f.front);
      const pool = fronts.length ? fronts : adjacent;
      pool.forEach((f) => {
        if (!metaFace || f.centroidZ > metaFace.centroidZ) metaFace = f;
      });
      return {
        a: edge.a,
        b: edge.b,
        edgeId: edgeKey(edge.a, edge.b),
        faceIndices: edge.faces.slice(),
        cls,
        frontFace: fronts.length ? metaFace : null,
        metaFace,
      };
    });
  };

  const api = {
    DEFAULT_CREASE_ANGLE,
    classifyEdges,
  };

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, { Edges: api });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
