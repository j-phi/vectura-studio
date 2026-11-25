/**
 * Start Page plate lines — window.Vectura.StartPagePlateLines.
 *
 * A DISPLAY-ONLY, reduced-fidelity vector copy of a work's drawing. Recents keeps the export SVG as the plate
 * thumbnail only when it is small; a dense piece (an image-driven Wavetable, say) is far over that, and its 512 px PNG
 * is blurry on a plate and cannot be drawn in (draw-in strokes the polylines parsed from SVG; an <image> has none).
 * This builds flattened, simplified polylines at low coordinate precision, small enough to store next to the PNG.
 *
 * It is NEVER an edit or export source: the curves are flattened, simplified and rounded, and the units are rescaled.
 * The saved document copy (the .vectura payload) stays the real file.
 *
 *   build(exportSvg, { budget, paperColor, ladder, longSide }) -> { svg, tolPx, bytes, points, strokes } | null
 *
 * Pipeline: parse the export SVG with StartPageArtGeometry (M L H V Q C Z, circles, polylines; cubics flattened) ->
 * rescale so the long side of the viewBox is `longSide` units (one unit ~ one retina px of a 1300 px plate) ->
 * Ramer-Douglas-Peucker (GeometryUtils.simplifyPath) at the FINEST tolerance of the ladder whose output fits the byte
 * budget -> 1 decimal, consecutive duplicates dropped, ONE <path> per polyline with absolute `M x y x y ...` (the art
 * parser treats every command as absolute; ink.js rejects attribute values over 200,000 chars). Null when even the
 * coarsest tolerance does not fit: the caller then keeps only the PNG.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const LONG_SIDE = 2600; // viewBox units on the long side (a 1300 px plate at 2x)
  const LADDER_PX = Object.freeze([0.25, 0.35, 0.5, 0.75, 1.0]); // RDP tolerance in CSS px (1 px = 2 units), finest first
  const FALLBACK_BUDGET = 600 * 1024;

  const hexOf = (c) => (typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c.trim()) ? c.trim() : '');
  const fmt = (v) => String(Math.round(v * 10) / 10);

  const budgetOf = (o) => {
    if (Number.isFinite(o && o.budget) && o.budget > 0) return o.budget;
    const L = Vectura.START_PAGE && Vectura.START_PAGE.LIMITS;
    return (L && Number.isFinite(L.plateLinesBytes) && L.plateLinesBytes) || FALLBACK_BUDGET;
  };

  // Rescaled {x,y}[] polylines + their relative stroke widths, from the export SVG text (null: nothing parseable).
  const flatten = (text, longSide) => {
    const Geo = Vectura.StartPageArtGeometry;
    if (!Geo || typeof Geo.parseArtSvg !== 'function') return null;
    const a = Geo.parseArtSvg(text);
    const [vx, vy, vw, vh] = a.vb;
    if (!(vw > 0) || !(vh > 0) || !a.polys.length) return null;
    const k = longSide / Math.max(vw, vh);
    const polys = a.polys.map((P) => {
      const out = new Array(P.length / 2);
      for (let i = 0; i < out.length; i += 1) out[i] = { x: (P[i * 2] - vx) * k, y: (P[i * 2 + 1] - vy) * k };
      return out;
    });
    return { polys, widths: Array.from(a.widths), W: Math.max(1, Math.round(vw * k)), H: Math.max(1, Math.round(vh * k)) };
  };

  const encode = (src, tolUnits, simplify) => {
    const groups = []; // consecutive polylines of one stroke width
    let points = 0; let strokes = 0; let cur = null;
    for (let j = 0; j < src.polys.length; j += 1) {
      const pts = simplify(src.polys[j], tolUnits);
      const nums = []; let lx = null; let ly = null;
      for (const p of pts) {
        const x = fmt(p.x); const y = fmt(p.y);
        if (x === lx && y === ly) continue;
        lx = x; ly = y; nums.push(x, y);
      }
      if (nums.length < 4) continue; // a point, not a line
      const w = src.widths[j];
      if (!cur || cur.w !== w) { cur = { w, d: [] }; groups.push(cur); }
      cur.d.push(`<path d="M${nums.join(' ')}"/>`);
      points += nums.length / 2; strokes += 1;
    }
    return { groups, points, strokes };
  };

  const wrap = (src, enc, ground) => {
    const body = enc.groups.map((g) => `<g stroke-width="${Number.isFinite(g.w) && g.w > 0 ? +g.w.toFixed(3) : 0.3}">${g.d.join('')}</g>`).join('');
    const bg = ground ? `<rect x="0" y="0" width="${src.W}" height="${src.H}" fill="${ground}"/>` : '';
    return `<svg viewBox="0 0 ${src.W} ${src.H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${bg}<g fill="none">${body}</g></svg>`;
  };

  const build = (exportSvg, o = {}) => {
    try {
      const GU = Vectura.GeometryUtils;
      if (!GU || typeof GU.simplifyPath !== 'function' || typeof exportSvg !== 'string' || !exportSvg) return null;
      const src = flatten(exportSvg, Number.isFinite(o.longSide) && o.longSide > 0 ? o.longSide : LONG_SIDE);
      if (!src) return null;
      const budget = budgetOf(o);
      const ground = hexOf(o.paperColor);
      const ladder = Array.isArray(o.ladder) && o.ladder.length ? o.ladder : LADDER_PX;
      for (const px of ladder) {
        const enc = encode(src, px * 2, GU.simplifyPath);
        if (!enc.strokes) return null;
        const svg = wrap(src, enc, ground);
        if (svg.length <= budget) return { svg, tolPx: px, bytes: svg.length, points: enc.points, strokes: enc.strokes };
      }
      return null;
    } catch (_e) { return null; }
  };

  Vectura.StartPagePlateLines = { build, LONG_SIDE, LADDER_PX };
})();
