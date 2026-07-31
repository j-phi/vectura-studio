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
 *   - meta.parentKey = stable deterministic key of the parent path
 *     (quantized, direction-agnostic — same idea as the export pathKey).
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
  const KEY_QUANT = 0.001;

  /** Normalizer — analogue of STROKE_STYLE.sanitizeDash for division configs. */
  const sanitizeDivisions = (cfg) => {
    const src = cfg && typeof cfg === 'object' ? cfg : {};
    const phase = Number(src.phaseMm);
    const classes = (Array.isArray(src.classes) ? src.classes : [])
      .map((cls) => {
        if (!cls || typeof cls !== 'object') return null;
        const lenMm = Number(cls.lenMm);
        if (!Number.isFinite(lenMm)) return null;
        return {
          lenMm: Math.max(0, lenMm),
          penId: typeof cls.penId === 'string' && cls.penId ? cls.penId : null,
          gap: Boolean(cls.gap),
        };
      })
      .filter(Boolean);
    return {
      enabled: Boolean(src.enabled),
      phaseMm: Number.isFinite(phase) ? phase : 0,
      classes,
    };
  };

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

  const quantKey = (v) => {
    const q = Math.round(v / KEY_QUANT) * KEY_QUANT;
    return String(q === 0 ? 0 : q);
  };

  /**
   * Stable deterministic key of a parent path: quantized coordinates hashed in
   * both directions, lexicographically-smaller string wins (direction-agnostic).
   * Circles key on their center/radius.
   *
   * The 'pk:' prefix namespaces parent keys away from the consumers' plain
   * pathKey strings (which quantize at the plotter tolerance and could
   * otherwise collide byte-for-byte at tol 0.001). Deliberate consequence: a
   * divided stroke and an identical UNDIVIDED stroke both plot (explicit
   * overplot, matching the canvas) instead of order-dependently deduping; the
   * fixed 0.001 quant intentionally does not track the plotter tolerance.
   */
  const parentKeyOf = (path, pts) => {
    if (isCircleMeta(path)) {
      const meta = path.meta || {};
      const cx = meta.cx ?? meta.x ?? 0;
      const cy = meta.cy ?? meta.y ?? 0;
      const r = meta.r ?? meta.rx ?? 0;
      return `pk:c:${quantKey(cx)},${quantKey(cy)},${quantKey(r)}`;
    }
    const tokens = (pts || []).map((pt) => `${quantKey(pt.x)},${quantKey(pt.y)}`);
    const fwd = tokens.join('|');
    const rev = tokens.slice().reverse().join('|');
    return 'pk:' + (fwd <= rev ? fwd : rev);
  };

  const buildFragmentMeta = (parentMeta, cls, parentKey, flattened) => {
    const meta = parentMeta ? { ...parentMeta } : {};
    delete meta.anchors;
    delete meta.forceCurves;
    // A fragment is an open span; a surviving closed flag would seam-close it.
    delete meta.closed;
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
    meta.parentKey = parentKey;
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

    // Cursor into the cycle: class index + remaining mm in that class.
    // Phase (normalized into [0, cycleLen), negatives included) advances it.
    let phase = divisions.phaseMm % cycleLen;
    if (phase < 0) phase += cycleLen;
    let idx = 0;
    while (phase >= classes[idx].lenMm - EPS) {
      phase -= classes[idx].lenMm;
      idx = (idx + 1) % classes.length;
      if (phase < EPS) break;
    }
    let rem = classes[idx].lenMm - Math.max(0, phase);

    const out = [];
    let cuts = 0;
    const capped = () => cuts >= maxFragments;

    list.forEach((path) => {
      const { pts, flattened } = flattenForMeasure(path, opts);
      if (!Array.isArray(pts) || pts.length < 2) {
        // Degenerate (or unflattenable) source: pass through, zero arc length.
        out.push(path);
        return;
      }
      const parentMeta = path.meta || null;
      const parentKey = parentKeyOf(path, pts);

      let frag = [{ x: pts[0].x, y: pts[0].y }];
      let fragLen = 0;
      let fragClass = classes[idx];

      const emitFrag = () => {
        // Gap classes emit nothing — unless the fragment cap tripped, where
        // dropping the remainder would silently lose geometry.
        if (frag.length < 2 || fragLen <= EPS) return;
        if (fragClass.gap && !capped()) return;
        frag.meta = buildFragmentMeta(parentMeta, fragClass, parentKey, flattened);
        out.push(frag);
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
