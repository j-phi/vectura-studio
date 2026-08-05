/**
 * Stroke division primitive (P0-B).
 *
 * Divides polylines by arc length into ordered fragments per a repeating
 * class cycle. Document units ARE mm (world coordinates are mm), so no unit
 * conversion happens here.
 *
 *   sanitizeDivisions(cfg) -> { enabled, phaseMm, classes:[{lenMm, penId|null, gap}] }
 *   cycleLengthMm(cycle)   -> number
 *   divideStroke(path, cycle, opts) -> Array<Path>   one polyline
 *   divideChain(paths, cycle, opts) -> Array<Path>   ordered polylines as ONE
 *                                                    continuous arc-length
 *                                                    domain (cycle continues
 *                                                    across joins; fragments
 *                                                    never span a join)
 *
 * Fragment contract:
 *   - plain point array; `.meta` = shallow-copied parent meta MINUS
 *     anchors/forceCurves (and minus `closed` — fragments are open spans;
 *     a surviving closed flag would make renderers seam-close each one).
 *   - meta.penId = class penId when the class names one; a null class penId
 *     means inherit — the divider writes nothing, so the fragment takes the
 *     parent's own meta.penId (if any) or the layer pen downstream.
 *   - meta.fragIndex = stable 0-based index of the fragment within its parent,
 *     so overlapping / self-retracing siblings (an out-and-back parent) never
 *     hash equal and drop one another during dedup.
 *   - meta.parentGeom = the parent path's RAW geometry (a plain point-copy, or
 *     { circle,cx,cy,r } for circle metas), shared by reference across the
 *     claiming fragments of one parent. Present ONLY when the fragments
 *     gaplessly retrace the WHOLE parent on a SINGLE pen (identical ink to a
 *     solid). Consumers key it at THEIR OWN tolerance via parentKeyFromGeom —
 *     same namespace as the plain pathKey — so a coincident undivided duplicate
 *     of the parent dedupes against the fragments. A gapped or multi-pen
 *     division does NOT stamp it: its fragments cover only part of the parent,
 *     so a coincident solid legitimately inks the gaps and must survive.
 *   - Gap classes emit nothing. Adjacent fragments butt-join: they share the
 *     cut endpoint exactly, no overlap.
 *
 * Sources that are not literal polylines are flattened FIRST (project rule:
 * mutations must flatten smoothed curves): anchor-carrying paths go through
 * GeometryUtils.flattenSmoothedPath; circle-meta paths flatten to a
 * CIRCLE_SEGMENTS-gon. Flattened fragments are tagged meta.straight so no
 * downstream pass re-fits them.
 */
(() => {
  const EPS = 1e-6;
  const MAX_FRAGMENTS = 100000; // hardening: pathological cycles cannot hang
  const CIRCLE_SEGMENTS = 128;

  // Deferred grammar (Phase 4A Inc-3) enumerations. Defaults are the FIRST
  // entry and must be a no-op: an old bag with none of these fields sanitizes
  // to 'cycle' + 'fixed' + seed 0 + per-class weight 1, byte-identical to Inc-1.
  const PEN_MODES = ['cycle', 'weighted'];
  const PHASE_MODES = ['fixed', 'perPath', 'jitter'];

  /**
   * Normalizer — analogue of STROKE_STYLE.sanitizeDash for division configs.
   * Inc-3: also accepts penMode / phaseMode / seed (division level) and per-class
   * weight, in lockstep with engine.ensureLayerDivisions. Every new field
   * defaults to a NO-OP so a legacy bag divides exactly as it did in Inc-1.
   */
  const sanitizeDivisions = (cfg) => {
    const src = cfg && typeof cfg === 'object' ? cfg : {};
    const phase = Number(src.phaseMm);
    const seed = Number(src.seed);
    const classes = (Array.isArray(src.classes) ? src.classes : [])
      .map((cls) => {
        if (!cls || typeof cls !== 'object') return null;
        const lenMm = Number(cls.lenMm);
        if (!Number.isFinite(lenMm)) return null;
        const weight = Number(cls.weight);
        return {
          lenMm: Math.max(0, lenMm),
          penId: typeof cls.penId === 'string' && cls.penId ? cls.penId : null,
          gap: Boolean(cls.gap),
          // Weighted-pen selection weight (Inc-3). Non-finite / negative -> 1
          // so an unset or garbage weight never zeroes a pen out of the pool.
          weight: Number.isFinite(weight) && weight >= 0 ? weight : 1,
        };
      })
      .filter(Boolean);
    return {
      enabled: Boolean(src.enabled),
      phaseMm: Number.isFinite(phase) ? phase : 0,
      penMode: PEN_MODES.includes(src.penMode) ? src.penMode : 'cycle',
      phaseMode: PHASE_MODES.includes(src.phaseMode) ? src.phaseMode : 'fixed',
      // Stable, serialized seed for deterministic weighted-pen + jitter hashing.
      // Truncated to an integer (the hash mixes 32-bit ints). No live RNG.
      seed: Number.isFinite(seed) ? Math.trunc(seed) : 0,
      classes,
    };
  };

  /**
   * Deterministic seeded hash -> unit float in [0, 1) (contract A-17).
   * Mixes stable 32-bit integer inputs (seed, pathIndex, fragIndex) through an
   * FNV-1a + finalizer so the SAME document always plots identically — there is
   * NO Math.random / Date.now anywhere in the division grammar.
   */
  const hashUnit = (...ints) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < ints.length; i++) {
      h ^= (ints[i] | 0);
      h = Math.imul(h, 16777619) >>> 0;
      h ^= h >>> 13;
      h = Math.imul(h, 0x5bd1e995) >>> 0;
      h ^= h >>> 15;
    }
    return (h >>> 0) / 4294967296;
  };

  // Distinct salt so a path's jitter offset never collides with its fragments'
  // weighted-pen draws (which hash on fragIndex).
  const JITTER_SALT = 0x9e3779b1 | 0;

  /** Total cycle length in mm. Accepts a divisions bag or a bare class array. */
  const cycleLengthMm = (cycle) => {
    const classes = Array.isArray(cycle) ? cycle : (cycle && cycle.classes) || [];
    return classes.reduce((sum, cls) => {
      const len = Number(cls && cls.lenMm);
      return sum + (Number.isFinite(len) && len > 0 ? len : 0);
    }, 0);
  };

  const segLength = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  const isCircleMeta = (path) => Boolean(path && path.meta && path.meta.kind === 'circle');

  const flattenCircle = (path) => {
    const meta = path.meta || {};
    const cx = meta.cx ?? meta.x ?? 0;
    const cy = meta.cy ?? meta.y ?? 0;
    const r = meta.r ?? meta.rx ?? 0;
    if (!(r > 0)) return null;
    const pts = [];
    for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
      const t = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r });
    }
    return pts;
  };

  const hasCurveAnchors = (path) => {
    const anchors = path && path.meta && path.meta.anchors;
    return Array.isArray(anchors) && anchors.length >= 2
      && anchors.some((a) => a && (a.in || a.out));
  };

  // Project rule: mutations must flatten smoothed curves first — the sparse
  // point array under an anchored path is only a render cache. Three flattened
  // source classes: circle metas, anchor-carrying cubic outlines, and (when
  // the owning layer renders with curves) plain sparse polylines that the
  // renderer smooths at draw time — measuring those along raw chords would
  // shortchange every class length and let fragments re-smooth independently.
  const flattenForMeasure = (path, opts = {}) => {
    if (isCircleMeta(path)) return { pts: flattenCircle(path), flattened: true, circle: true };
    const G = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
    const flatten = G.Vectura && G.Vectura.GeometryUtils && G.Vectura.GeometryUtils.flattenSmoothedPath;
    if (hasCurveAnchors(path) && !path.meta.straight) {
      if (typeof flatten === 'function') {
        const flat = flatten(path);
        if (Array.isArray(flat) && flat.length >= 2) return { pts: flat, flattened: true, circle: false };
      }
    }
    if (opts.useCurves && Array.isArray(path) && path.length >= 3
        && !(path.meta && path.meta.straight) && typeof flatten === 'function') {
      const flat = flatten(path);
      if (Array.isArray(flat) && flat.length >= 2 && flat !== path) {
        return { pts: flat, flattened: true, circle: false };
      }
    }
    return { pts: path, flattened: false, circle: false };
  };

  /**
   * RAW parent-geometry stamp (Fix-A, Phase 4A Inc-0). Instead of a pre-hashed
   * key baked at a fixed 0.001 quant, a fragment carries the parent's raw
   * geometry so each downstream consumer (plotter-optimize dedupe, stats, SVG
   * export) can key it at ITS OWN tolerance — in the SAME namespace as the
   * plain pathKey it computes for undivided paths. That coherence is what lets
   * a coincident UNDIVIDED duplicate of a divided parent dedupe against the
   * fragments (ink once) instead of over-plotting.
   *
   *   - polyline parent -> a plain copy of the parent points (matches the point
   *     array an undivided duplicate layer presents to the same pathKey).
   *   - circle parent   -> { circle:true, cx, cy, r } (matches pathKey's own
   *     circle branch, so a divided circle and an undivided circle collide).
   */
  const buildParentGeom = (path) => {
    if (isCircleMeta(path)) {
      const meta = path.meta || {};
      return {
        circle: true,
        cx: meta.cx ?? meta.x ?? 0,
        cy: meta.cy ?? meta.y ?? 0,
        r: meta.r ?? meta.rx ?? 0,
      };
    }
    if (Array.isArray(path)) return path.map((pt) => ({ x: pt.x, y: pt.y }));
    return null;
  };

  /**
   * Key a raw parent-geometry stamp at a caller-supplied quantizer. Mirrors the
   * consumers' plain pathKey exactly (direction-agnostic point hash; circles on
   * center/radius) so a fragment's parent key and an undivided duplicate's
   * pathKey are byte-for-byte equal at the same tolerance. `quant` defaults to
   * identity (raw coordinates).
   */
  const parentKeyFromGeom = (parentGeom, quant) => {
    if (!parentGeom) return null;
    const q = typeof quant === 'function' ? quant : (v) => v;
    if (parentGeom.circle) {
      return `c:${q(parentGeom.cx)},${q(parentGeom.cy)},${q(parentGeom.r)}`;
    }
    if (Array.isArray(parentGeom)) {
      const tokens = parentGeom.map((pt) => `${q(pt.x)},${q(pt.y)}`);
      const fwd = tokens.join('|');
      const rev = tokens.slice().reverse().join('|');
      return fwd <= rev ? fwd : rev;
    }
    return null;
  };

  /**
   * Shared plotter-dedup engine (Fix-A). ALL three consumers — the engine
   * plotter-optimize pass, computeStats, and SVG export — drive this same
   * two-pass, per-pen deduper so their surviving path sets (and therefore the
   * reported line/point/distance vs the emitted SVG) always agree, regardless
   * of stack order or line-sort interleave.
   *
   * The caller supplies its OWN `quant` and `pathKey` (tolerance stays a
   * per-consumer concern); the RULE lives here once.
   *
   * Usage:
   *   const d = createPlotDeduper(quant, pathKey);
   *   // pass 1 — register every CLAIMING fragment's parent (order-free):
   *   forEachPath((penId, meta) => d.claim(penId, meta));
   *   // pass 2 — keep or drop:
   *   forEachPath((penId, ownerId, meta, path) => d.keep(penId, ownerId, meta, path));
   *
   * Rules:
   *   - A CLAIMING fragment (gapless single-pen retrace, carries parentGeom)
   *     claims its parent key for its layer; sibling fragments survive via a
   *     per-fragment index; a duplicate DIVIDED layer of the same parent drops.
   *   - A plain path drops when a claiming fragment already covers its geometry
   *     on that pen (divided ink wins — order-independent) OR it repeats.
   *   - A NON-claiming fragment (gapped / multi-pen) keys on its OWN geometry
   *     plus its index, so it never suppresses a coincident solid (the solid
   *     legitimately inks the gaps) yet a duplicate divided layer still dedupes.
   */
  const createPlotDeduper = (quant, pathKey) => {
    const claimedByPen = new Map();
    const seenByPen = new Map();
    const getClaimed = (penId) => {
      let s = claimedByPen.get(penId);
      if (!s) { s = new Set(); claimedByPen.set(penId, s); }
      return s;
    };
    const getSeen = (penId) => {
      let m = seenByPen.get(penId);
      if (!m) { m = new Map(); seenByPen.set(penId, m); }
      return m;
    };
    const parentKeyOf = (meta) => (meta && meta.parentGeom)
      ? parentKeyFromGeom(meta.parentGeom, quant)
      : null;
    const fragIndexOf = (meta) => (meta && Number.isFinite(meta.fragIndex)) ? meta.fragIndex : null;
    return {
      claim: (penId, meta) => {
        const pk = parentKeyOf(meta);
        if (pk) getClaimed(penId).add(pk);
      },
      keep: (penId, ownerId, meta, path) => {
        const seen = getSeen(penId);
        const parentKey = parentKeyOf(meta);
        const fragIndex = fragIndexOf(meta);
        if (parentKey) {
          // Claiming fragment: parent-level owner claim + index sibling key.
          const owner = seen.get(parentKey);
          if (owner !== undefined && owner !== ownerId) return false;
          seen.set(parentKey, ownerId);
          const fk = `${parentKey}::${fragIndex}`;
          if (seen.has(fk)) return false;
          seen.set(fk, true);
          return true;
        }
        const gk = pathKey(path);
        if (!gk) return true;
        if (fragIndex != null) {
          // Non-claiming (gapped / multi-pen) fragment: index disambiguates a
          // self-retracing sibling; geometry dedupes a duplicate divided layer.
          const fk = `${gk}::f${fragIndex}`;
          if (seen.has(fk)) return false;
          seen.set(fk, true);
          return true;
        }
        // Plain path: a divided layer that fully covers this geometry already
        // inks it (divided wins, order-independent); otherwise strict repeat.
        if (getClaimed(penId).has(gk)) return false;
        if (seen.has(gk)) return false;
        seen.set(gk, true);
        return true;
      },
    };
  };

  const buildFragmentMeta = (parentMeta, cls, flattened) => {
    const meta = parentMeta ? { ...parentMeta } : {};
    delete meta.anchors;
    delete meta.forceCurves;
    // A fragment is an open span; a surviving closed flag would seam-close it.
    delete meta.closed;
    // Stale keys from a previous division pass must never survive a recut.
    delete meta.parentGeom;
    delete meta.fragIndex;
    if (flattened) {
      // The point array is now the final geometry — nothing may re-fit it.
      meta.straight = true;
      delete meta.kind;
      delete meta.cx;
      delete meta.cy;
      delete meta.r;
      delete meta.rx;
      delete meta.ry;
    }
    if (cls && cls.penId) meta.penId = cls.penId;
    // meta.parentGeom + meta.fragIndex are stamped per parent AFTER the parent
    // finishes (see the gap-aware finalize step in divideChain).
    return meta;
  };

  /**
   * Divide an ordered list of polylines as ONE continuous arc-length domain.
   * The class cycle continues across joins (no reset); fragments butt-join and
   * never span a join. Returns the input array unchanged when division is
   * disabled or the cycle is degenerate.
   */
  const divideChain = (paths, cycle, opts = {}) => {
    const list = Array.isArray(paths) ? paths : [];
    const divisions = sanitizeDivisions(cycle);
    const classes = divisions.classes.filter((cls) => cls.lenMm > EPS);
    const cycleLen = classes.reduce((sum, cls) => sum + cls.lenMm, 0);
    if (!divisions.enabled || cycleLen < EPS || !list.length) return list;

    const maxFragments = Number.isFinite(opts.maxFragments) && opts.maxFragments > 0
      ? opts.maxFragments
      : MAX_FRAGMENTS;

    // Deferred grammar (Inc-3). Seed precedence: an explicit opts.seed (the
    // engine folds the layer seed in) wins, else the division's own seed. Both
    // are stable + serialized, so the hash is fully deterministic.
    const seed = Number.isFinite(opts.seed) ? Math.trunc(opts.seed)
      : (Number.isFinite(divisions.seed) ? divisions.seed : 0);
    const phaseMode = divisions.phaseMode || 'fixed';
    const weighted = divisions.penMode === 'weighted';

    // Weighted-pen pool: the non-gap classes' pens with their weights. A
    // fragment in weighted mode draws its pen from this pool by a deterministic
    // seeded hash — heavier weight -> more fragments over a long stroke.
    const pool = weighted
      ? classes.filter((c) => !c.gap).map((c) => ({ penId: c.penId, weight: c.weight >= 0 ? c.weight : 0 }))
      : [];
    const poolTotal = pool.reduce((s, c) => s + (c.weight > 0 ? c.weight : 0), 0);
    const weightedActive = weighted && pool.length > 0 && poolTotal > EPS;
    const pickPen = (u) => {
      let acc = 0;
      const r = u * poolTotal;
      for (let i = 0; i < pool.length; i++) {
        acc += pool[i].weight > 0 ? pool[i].weight : 0;
        if (r < acc - EPS) return pool[i].penId;
      }
      return pool[pool.length - 1].penId;
    };

    // Cursor into the cycle: class index + remaining mm in that class. Phase
    // (normalized into [0, cycleLen), negatives included) advances it.
    const computeCursor = (phaseMm) => {
      let phase = phaseMm % cycleLen;
      if (phase < 0) phase += cycleLen;
      let ci = 0;
      while (phase >= classes[ci].lenMm - EPS) {
        phase -= classes[ci].lenMm;
        ci = (ci + 1) % classes.length;
        if (phase < EPS) break;
      }
      return { idx: ci, rem: classes[ci].lenMm - Math.max(0, phase) };
    };

    // Fixed mode carries this cursor continuously across every sub-path (one
    // arc-length ruler over the whole chain). perPath / jitter reset it at the
    // start of each path (see the per-path reset below).
    let { idx, rem } = computeCursor(divisions.phaseMm);

    const out = [];
    let cuts = 0;
    const capped = () => cuts >= maxFragments;

    list.forEach((path, pathIndex) => {
      // phaseMode (Inc-3). fixed carries the cursor across the seam; perPath
      // restarts the ruler at the base phase every path; jitter adds a
      // deterministic per-path offset (seeded hash, NOT live RNG).
      if (phaseMode === 'perPath') {
        ({ idx, rem } = computeCursor(divisions.phaseMm));
      } else if (phaseMode === 'jitter') {
        const off = hashUnit(seed, pathIndex, JITTER_SALT) * cycleLen;
        ({ idx, rem } = computeCursor(divisions.phaseMm + off));
      }
      const { pts, flattened } = flattenForMeasure(path, opts);
      if (!Array.isArray(pts) || pts.length < 2) {
        // Degenerate (or unflattenable) source: pass through, zero arc length.
        out.push(path);
        return;
      }
      const parentMeta = path.meta || null;
      const parentGeom = buildParentGeom(path);

      // Full arc length of THIS parent, to decide whether its fragments
      // gaplessly tile it (a gapless single-pen retrace == the solid parent).
      let parentLen = 0;
      for (let i = 1; i < pts.length; i++) parentLen += segLength(pts[i - 1], pts[i]);
      const parentFrags = [];
      let coveredLen = 0;

      let frag = [{ x: pts[0].x, y: pts[0].y }];
      let fragLen = 0;
      let fragClass = classes[idx];

      const emitFrag = () => {
        // Gap classes emit nothing — unless the fragment cap tripped, where
        // dropping the remainder would silently lose geometry.
        if (frag.length < 2 || fragLen <= EPS) return;
        if (fragClass.gap && !capped()) return;
        frag.meta = buildFragmentMeta(parentMeta, fragClass, flattened);
        coveredLen += fragLen;
        parentFrags.push(frag);
      };

      const advanceClass = (at) => {
        emitFrag();
        cuts += 1;
        idx = (idx + 1) % classes.length;
        rem = classes[idx].lenMm;
        fragClass = classes[idx];
        frag = [{ x: at.x, y: at.y }];
        fragLen = 0;
      };

      for (let i = 1; i < pts.length; i++) {
        let ax = pts[i - 1].x;
        let ay = pts[i - 1].y;
        const bx = pts[i].x;
        const by = pts[i].y;
        let seg = segLength({ x: ax, y: ay }, { x: bx, y: by });
        // Cut mid-segment while a class boundary falls inside it.
        while (seg > rem + EPS && !capped()) {
          const t = rem / seg;
          const cut = { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
          frag.push({ x: cut.x, y: cut.y });
          fragLen += rem;
          advanceClass(cut);
          ax = cut.x;
          ay = cut.y;
          seg = segLength(cut, { x: bx, y: by });
        }
        frag.push({ x: bx, y: by });
        fragLen += seg;
        rem -= seg;
        // Boundary landing (within epsilon) on a vertex: cut exactly there.
        if (rem <= EPS && !capped()) {
          advanceClass({ x: bx, y: by });
        }
      }
      emitFrag(); // tail of this path — the cycle continues into the next one

      // Gap-aware claim (Fix-A hardening). A divided layer may only suppress a
      // coincident undivided solid on the SAME pen when its fragments FULLY
      // COVER the parent on ONE pen — i.e. they retrace exactly the same ink.
      // When the division has gaps (covered < parent length) or splits the
      // parent across pens, the fragments do NOT represent the parent's full
      // ink, so they must NOT claim the parent key: a coincident solid then
      // legitimately inks the gap regions and must survive. Only claiming
      // fragments carry meta.parentGeom (the dedup claim). Every fragment gets
      // a stable meta.fragIndex so overlapping / self-retracing siblings (an
      // out-and-back parent) never hash equal and drop each other.
      // Weighted-pen assignment (Inc-3) — deterministic per-fragment override
      // of the class-cycle pen, hashed on (seed, pathIndex, fragIndex). Applied
      // BEFORE the single-pen / claiming test so a weighted (multi-pen) parent
      // is correctly recognised as non-claiming and never suppresses a
      // coincident solid (Inc-0 gap-aware dedup invariant).
      if (weightedActive) {
        parentFrags.forEach((f, i) => {
          const penId = pickPen(hashUnit(seed, pathIndex, i));
          if (penId) f.meta.penId = penId;
          else delete f.meta.penId; // null pool entry -> inherit the layer pen
        });
      }
      const gapless = coveredLen >= parentLen - EPS;
      const singlePen = new Set(parentFrags.map((f) => f.meta.penId)).size <= 1;
      const claiming = gapless && singlePen;
      parentFrags.forEach((f, i) => {
        f.meta.fragIndex = i;
        // Shared reference across every claiming fragment of one parent.
        if (claiming) f.meta.parentGeom = parentGeom;
        out.push(f);
      });
    });

    return out;
  };

  /** Divide ONE polyline. Same contract as divideChain over a single path. */
  const divideStroke = (path, cycle, opts = {}) => divideChain([path], cycle, opts);

  const api = {
    sanitizeDivisions,
    cycleLengthMm,
    divideStroke,
    divideChain,
    parentKeyFromGeom,
    createPlotDeduper,
    MAX_FRAGMENTS,
  };

  if (typeof window !== 'undefined') {
    const Vectura = (window.Vectura = window.Vectura || {});
    Vectura.StrokeDivide = api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
