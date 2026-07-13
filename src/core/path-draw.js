/**
 * PathDraw — the single source of truth for "how is this path drawn?".
 *
 * The decision of which curve branch a path takes (native cubic / verbatim
 * polyline / draw-time quadratic) was duplicated by hand in SIX places:
 *
 *   src/render/renderer.js      tracePath              (canvas)
 *   src/ui/ui.js                pathToSvg              (SVG export)
 *   src/ui/modals/export-svg.js buildExportPreviewPath (export preview canvas)
 *   src/core/geometry-utils.js  flattenSmoothedPath    (masking / editing)
 *   src/core/path-edit-ops.js   flattenForEdit         (delegates to the above)
 *   tests/helpers/svg.js        shapeToSvg             (visual baselines)
 *
 * They had already drifted: the two export copies carry a `sharpEdges` /
 * `_tileEdge` per-point branch that the renderer does not, and the test copy
 * ignores the `curves` toggle entirely — which is why the SVG baselines
 * contained no curve commands at all and the whole system was untested.
 *
 * One decision (`classify`), four emitters. Consumers hand in a path and get
 * back canvas calls, an SVG `d` string, or a dense polyline — all from the same
 * branch, so the preview, the plot, and the mask can no longer disagree.
 *
 * Parametric circles (`meta.kind === 'circle'`) are NOT handled here: each
 * consumer renders them in its own idiom (ctx.ellipse vs `<circle>`), so they
 * are special-cased before this module is reached, exactly as before.
 */
(() => {
  const EPS = 1e-6;

  // Resolved lazily, never at load time: in the browser this file loads before
  // its collaborators are all registered, and under Node (the unit tests require
  // core modules directly) geometry-utils <-> path-draw is a require cycle that
  // only resolves once both modules have finished evaluating. Every consumer
  // here is called well after load, so lazy lookup sidesteps both.
  const dep = (name) => {
    if (typeof window !== 'undefined' && window.Vectura && window.Vectura[name]) {
      return window.Vectura[name];
    }
    if (typeof require === 'function') {
      try {
        if (name === 'GeometryUtils') return require('./geometry-utils.js');
        if (name === 'OptimizationUtils') return require('./optimization-utils.js');
      } catch (err) {
        return null;
      }
    }
    return null;
  };

  const isClosedPolyline = (path) => {
    const OU = dep('OptimizationUtils');
    const fn = OU && OU.isClosedPath;
    if (typeof fn === 'function') return Boolean(fn(path));
    if (!Array.isArray(path) || path.length < 3) return false;
    const dx = path[0].x - path[path.length - 1].x;
    const dy = path[0].y - path[path.length - 1].y;
    return dx * dx + dy * dy < EPS;
  };

  /**
   * A path renders verbatim — as the literal segments between its points, never
   * re-curved — when it is either genuinely made of straight lines, or is
   * already the exact display geometry.
   *
   *   meta.straight — true line segments: a DNA rung, a hatch, a crease, a
   *                   polyhedron edge, a 2-point span.
   *   meta.baked    — a point array that IS the curve: flattener output, mask
   *                   fragments, miter-offset rings. Re-fitting it would be
   *                   fitting a curve to a curve.
   *
   * Both were historically spelled `meta.straight`, which is how "this algorithm
   * doesn't do curves" crept in as a third, wrong meaning and made the Curves
   * toggle a dead switch on several algorithms.
   */
  const isVerbatim = (path) => {
    const meta = path && path.meta;
    if (!meta) return false;
    return meta.straight === true || meta.baked === true;
  };

  const anchorsWithHandles = (anchors) =>
    Array.isArray(anchors) && anchors.length >= 2 && anchors.some((a) => a && (a.in || a.out));

  /**
   * The one branch decision.
   *
   * `meta.forceCurves` is a per-path opt-in (the mirror of the verbatim flags):
   * geometry that IS bezier by construction — Geometry3D.smoothToBezier output,
   * morph rings, fitted glyph outlines — renders as native cubics even when the
   * owning layer's Curves toggle is off.
   *
   * Returns:
   *   { mode: 'cubic',     anchors, closed }  native cubics from real handles
   *   { mode: 'verbatim' }                     M/L through the points
   *   { mode: 'quadratic', closed }            the legacy draw-time corner-cut
   */
  const classify = (path, opts = {}) => {
    if (!Array.isArray(path) || path.length < 2) return { mode: 'empty' };

    const meta = path.meta || {};
    const useCurves = Boolean(opts.useCurves);
    const verbatim = isVerbatim(path);
    const forceCurves = meta.forceCurves === true;

    // Native cubics win whenever real handles are present and nothing has
    // declared the point array final.
    const anchors = (useCurves || forceCurves) && !verbatim ? meta.anchors : null;
    if (anchorsWithHandles(anchors)) {
      return { mode: 'cubic', anchors, closed: meta.closed === true };
    }

    // Chord-polyline shapes (an exploded wavetable rebuilt at smoothing 0)
    // populate meta.anchors with null handles; feeding those to bezierCurveTo
    // yields degenerate straight segments, reintroducing kinks. They fall
    // through to the branches below.
    if (!useCurves || verbatim || path.length < 3) return { mode: 'verbatim' };

    // The draw-time midpoint quadratic. This is not a curve fit: it re-anchors
    // the path onto edge MIDPOINTS and uses the sample points as control
    // points, so the drawn curve never passes through the algorithm's own
    // geometry. Retained behind `legacyQuadratic` while the fitted-curve
    // pipeline is rolled out; `legacyQuadratic: false` makes an unfitted
    // polyline simply render as itself.
    if (opts.legacyQuadratic === false) return { mode: 'verbatim' };

    return { mode: 'quadratic', closed: isClosedPolyline(path) };
  };

  /**
   * Path → drawing commands. The shared spine of every emitter below.
   *
   * Commands are arrays: ['M',x,y] ['L',x,y] ['Q',cx,cy,x,y]
   *                      ['C',c1x,c1y,c2x,c2y,x,y] ['Z']
   *
   * `opts.sharpEdges` honours per-point `_tileEdge` (Pattern's tile boundaries):
   * those corners stay sharp instead of being rounded by the quadratic.
   */
  const commands = (path, opts = {}) => {
    const decision = classify(path, opts);
    const out = [];

    if (decision.mode === 'empty') return out;

    if (decision.mode === 'cubic') {
      const { anchors, closed } = decision;
      out.push(['M', anchors[0].x, anchors[0].y]);
      for (let i = 0; i < anchors.length - 1; i++) {
        const a = anchors[i];
        const b = anchors[i + 1];
        const c1 = a.out || a;
        const c2 = b.in || b;
        out.push(['C', c1.x, c1.y, c2.x, c2.y, b.x, b.y]);
      }
      if (closed) {
        const a = anchors[anchors.length - 1];
        const b = anchors[0];
        const c1 = a.out || a;
        const c2 = b.in || b;
        out.push(['C', c1.x, c1.y, c2.x, c2.y, b.x, b.y]);
        out.push(['Z']);
      }
      return out;
    }

    if (decision.mode === 'verbatim') {
      out.push(['M', path[0].x, path[0].y]);
      for (let i = 1; i < path.length; i++) out.push(['L', path[i].x, path[i].y]);
      return out;
    }

    // Quadratic: anchor on each edge midpoint, the vertex acts as the control
    // point. The closed variant wraps, so the seam edge is curved too rather
    // than being drawn as a straight chord.
    const sharp = Boolean(opts.sharpEdges);
    const isTileEdge = (pt) => sharp && pt && pt._tileEdge === true;

    if (decision.closed) {
      const n = path.length - 1;
      const m0x = (path[0].x + path[1].x) / 2;
      const m0y = (path[0].y + path[1].y) / 2;
      out.push(['M', m0x, m0y]);
      for (let i = 1; i < n; i++) {
        if (isTileEdge(path[i])) {
          out.push(['L', path[i].x, path[i].y]);
        } else {
          out.push(['Q', path[i].x, path[i].y, (path[i].x + path[i + 1].x) / 2, (path[i].y + path[i + 1].y) / 2]);
        }
      }
      if (isTileEdge(path[0])) {
        out.push(['L', path[0].x, path[0].y]);
        out.push(['L', m0x, m0y]);
      } else {
        out.push(['Q', path[0].x, path[0].y, m0x, m0y]);
      }
      out.push(['Z']);
      return out;
    }

    out.push(['M', path[0].x, path[0].y]);
    for (let i = 1; i < path.length - 1; i++) {
      if (isTileEdge(path[i])) {
        out.push(['L', path[i].x, path[i].y]);
      } else {
        out.push(['Q', path[i].x, path[i].y, (path[i].x + path[i + 1].x) / 2, (path[i].y + path[i + 1].y) / 2]);
      }
    }
    const last = path[path.length - 1];
    out.push(['L', last.x, last.y]);
    return out;
  };

  // ── Emitters ────────────────────────────────────────────────────────────────

  // Replays onto any duck-typed 2D context — no DOM dependency, so this is
  // headless-testable with a recording stub. Does NOT call beginPath()/stroke():
  // callers batch many paths into one canvas path, as they always have.
  const toCanvas = (ctx, path, opts = {}) => {
    if (!ctx) return;
    commands(path, opts).forEach((cmd) => {
      switch (cmd[0]) {
        case 'M': ctx.moveTo(cmd[1], cmd[2]); break;
        case 'L': ctx.lineTo(cmd[1], cmd[2]); break;
        case 'Q': ctx.quadraticCurveTo(cmd[1], cmd[2], cmd[3], cmd[4]); break;
        case 'C': ctx.bezierCurveTo(cmd[1], cmd[2], cmd[3], cmd[4], cmd[5], cmd[6]); break;
        case 'Z': if (typeof ctx.closePath === 'function') ctx.closePath(); break;
        default: break;
      }
    });
  };

  // SVG `d` string. `precision` is decimal places, matching the exporter.
  const toSvgD = (path, opts = {}, precision = 3) => {
    const cmds = commands(path, opts);
    if (!cmds.length) return '';
    const n = (v) => Number(v).toFixed(precision);
    return cmds
      .map((cmd) => (cmd[0] === 'Z' ? 'Z' : `${cmd[0]} ${cmd.slice(1).map(n).join(' ')}`))
      .join(' ');
  };

  /**
   * The drawn curve, flattened into a dense polyline that traces exactly what
   * toCanvas / toSvgD would draw.
   *
   * The masking pipeline clips THIS, not the raw sparse polyline: algorithm
   * output is a coarse sample whose on-screen smoothness comes entirely from
   * the branch chosen above. Clipping the raw polyline would cut along its
   * chords and discard that interpolation, collapsing curves into straight
   * lines at the mask boundary.
   *
   * Both curve branches route through GeometryUtils.sampleCubicBezier (adaptive,
   * tolerance in world units, depth-bounded) by elevating each quadratic span to
   * its equivalent cubic — no density heuristic, so it is zoom-stable.
   */
  const toPolyline = (path, opts = {}, tolerance = 0.1) => {
    const GU = dep('GeometryUtils');
    const cmds = commands(path, opts);
    if (!cmds.length || typeof GU?.sampleCubicBezier !== 'function') return [];

    const out = [];
    let cursor = null;

    const append = (samples) => {
      // samples[0] repeats the previous span's endpoint; skip it once chained.
      for (let k = out.length ? 1 : 0; k < samples.length; k++) {
        out.push({ x: samples[k].x, y: samples[k].y });
      }
    };

    cmds.forEach((cmd) => {
      switch (cmd[0]) {
        case 'M':
          cursor = { x: cmd[1], y: cmd[2] };
          out.push({ x: cursor.x, y: cursor.y });
          break;
        case 'L':
          cursor = { x: cmd[1], y: cmd[2] };
          out.push({ x: cursor.x, y: cursor.y });
          break;
        case 'Q': {
          // Degree-elevate the quadratic to its exact cubic equivalent.
          const c = { x: cmd[1], y: cmd[2] };
          const e = { x: cmd[3], y: cmd[4] };
          const s = cursor || e;
          append(GU.sampleCubicBezier(
            s,
            { x: s.x + (2 / 3) * (c.x - s.x), y: s.y + (2 / 3) * (c.y - s.y) },
            { x: e.x + (2 / 3) * (c.x - e.x), y: e.y + (2 / 3) * (c.y - e.y) },
            e,
            tolerance,
          ));
          cursor = e;
          break;
        }
        case 'C': {
          const c1 = { x: cmd[1], y: cmd[2] };
          const c2 = { x: cmd[3], y: cmd[4] };
          const e = { x: cmd[5], y: cmd[6] };
          const s = cursor || e;
          append(GU.sampleCubicBezier(s, c1, c2, e, tolerance));
          cursor = e;
          break;
        }
        default:
          break;
      }
    });

    return out;
  };

  // Does this path draw as a curve at all? (Used to decide whether flattening is
  // even worth doing.)
  const isCurved = (path, opts = {}) => {
    const mode = classify(path, opts).mode;
    return mode === 'cubic' || mode === 'quadratic';
  };

  const api = {
    classify,
    commands,
    toCanvas,
    toSvgD,
    toPolyline,
    isCurved,
    isVerbatim,
  };

  if (typeof window !== 'undefined') {
    const Vectura = (window.Vectura = window.Vectura || {});
    Vectura.PathDraw = { ...(Vectura.PathDraw || {}), ...api };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
