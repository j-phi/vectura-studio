/* ============================================================================
 * Vectura Studio — Text Panel Specimen Renderer
 * ----------------------------------------------------------------------------
 * Draws the live preview inside the bespoke Text panel: styles the editable
 * specimen text and paints the guide / outline-node / fill-line SVG overlays,
 * faithfully mirroring the main-canvas geometry. Ported from the specimen half
 * of design-explorations/text-panel-synthesis.html (renderSpecimen +
 * renderFillLines + renderGuides + renderOutlineView + the opentype trace
 * helpers), adapted to read from layer.params and reuse the engine's fonts.
 *
 * ── CONTRACT (ui-text-panel.js builds the DOM and calls this) ───────────────
 *   window.Vectura.UI.TextSpecimen.create(refs) -> controller
 *     refs = { stage, specText, guideSvg, fillSvg, outlineSvg }  // vtp- DOM els
 *            owned/created by the panel.
 *     controller = {
 *       render(layer, view),  // redraw from layer.params + view prefs
 *       destroy(),            // detach any listeners/observers it added
 *     }
 *     view = {
 *       guides: 'frame'|'center'|'baseline'|'ruled'|'hand'|'dots'|'none',
 *       showOutlines: boolean,   // node/handle inspection overlay
 *       showFillLines: boolean,  // reveal fill toolpaths
 *       editing: boolean,        // specimen is being edited (use CSS text, no jitter)
 *     }
 *
 * Fonts: reuse Vectura.GoogleFonts.getParsed(id) / .ensureFont(id) / .keyToId()
 *   and Vectura.StrokeFont for built-ins. polygon-clipping is on window
 *   (polygonClipping) for Merge Overlaps welding. Never re-fetch TTFs — when a
 *   parsed face isn't ready yet we ask ensureFont/loadWeight for it once and
 *   re-render when it lands; until then we fall back to the CSS text preview.
 *
 * The specimen is a preview APPROXIMATION of the main-canvas geometry, not a
 * second renderer of record: it never throws while a font is loading and never
 * touches engine state.
 * ========================================================================== */
(function () {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  Vectura.UI = Vectura.UI || {};

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Web faces map Regular/Medium/Semibold/Bold to the same OS/2 weights the
  // engine's GoogleFonts.loadWeight uses, so a weighted parsed face can be read
  // back through getParsed() under the engine's composite "<id>::w<weight>" key.
  const WMAP = { Regular: 400, Medium: 500, Semibold: 600, Bold: 700 };
  const weightNum = (label) => WMAP[label] || Number(label) || 400;
  // The engine caches weighted faces under this key (google-fonts.js weightKey).
  // Reconstructed here as a best-effort upgrade; degrades to the base face if the
  // internal key scheme ever changes.
  const weightedKey = (id, w) => `${id}::w${w}`;

  // ── small numeric helpers ───────────────────────────────────────────────────
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const bool = (v) => !!v;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const f1 = (n) => Math.round(n * 10) / 10;
  const xmlEsc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const GF = () => Vectura.GoogleFonts || null;
  const isWeb = (font) => {
    const gf = GF();
    return !!(gf && typeof gf.isWebFontKey === 'function' && gf.isWebFontKey(font));
  };

  // Resolve the CSS font-family for the specimen text element. Web faces are
  // registered by the engine as `Vectura WF <family>`; built-ins have no CSS face
  // so we stand in with the panel's UI sans (an honest approximation — stroke
  // faces aren't a CSS font).
  const cssFamily = (font) => {
    const gf = GF();
    if (isWeb(font) && gf) {
      const id = gf.keyToId(font);
      let fam = id;
      try {
        const entry = typeof gf.findFamily === 'function' ? gf.findFamily(id) : null;
        if (entry && entry.family) fam = entry.family;
      } catch (_) {
        /* catalog not ready — fall back to the slug */
      }
      return "'Vectura WF " + fam + "', sans-serif";
    }
    return "'Space Grotesk', system-ui, sans-serif";
  };

  const baseAlign = (a) => {
    const s = String(a || 'center');
    if (s.indexOf('right') >= 0) return 'right';
    if (s.indexOf('center') >= 0 || s === 'justify-all') return 'center';
    return 'left';
  };

  // deterministic per-letter jitter (mirrors the engine's seeded wobble)
  const jrand = (i) => {
    const x = Math.sin(i * 12.9898 + 4.1414) * 43758.5453;
    return x - Math.floor(x);
  };

  // ── opentype command list → flattened polylines (one per closed contour) ─────
  function flattenCmds(cmds) {
    const out = [];
    let cur = null;
    let sx = 0;
    let sy = 0;
    let cx = 0;
    let cy = 0;
    const P = (x, y) => cur.push({ x, y });
    function cube(c1x, c1y, c2x, c2y, ex, ey) {
      const n = 14;
      const x0 = cx;
      const y0 = cy;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const m = 1 - t;
        P(
          m * m * m * x0 + 3 * m * m * t * c1x + 3 * m * t * t * c2x + t * t * t * ex,
          m * m * m * y0 + 3 * m * m * t * c1y + 3 * m * t * t * c2y + t * t * t * ey
        );
      }
    }
    function quad(cpx, cpy, ex, ey) {
      const n = 10;
      const x0 = cx;
      const y0 = cy;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const m = 1 - t;
        P(m * m * x0 + 2 * m * t * cpx + t * t * ex, m * m * y0 + 2 * m * t * cpy + t * t * ey);
      }
    }
    cmds.forEach((c) => {
      if (c.type === 'M') {
        if (cur && cur.length > 1) out.push(cur);
        cur = [];
        sx = cx = c.x;
        sy = cy = c.y;
        P(c.x, c.y);
      } else if (c.type === 'L') {
        P(c.x, c.y);
        cx = c.x;
        cy = c.y;
      } else if (c.type === 'C') {
        cube(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
        cx = c.x;
        cy = c.y;
      } else if (c.type === 'Q') {
        quad(c.x1, c.y1, c.x, c.y);
        cx = c.x;
        cy = c.y;
      } else if (c.type === 'Z') {
        if (cur) P(sx, sy);
        cx = sx;
        cy = sy;
      }
    });
    if (cur && cur.length > 1) out.push(cur);
    return out;
  }

  // Real on-curve nodes + their incoming/outgoing Bézier handles, read straight
  // from the positioned glyph commands (not bbox extrema).
  function collectNodes(cmds, nodes) {
    let prev = null;
    let start = null;
    const atStart = (c) =>
      start && Math.abs(c.x - start.x) < 0.4 && Math.abs(c.y - start.y) < 0.4;
    cmds.forEach((c) => {
      if (c.type === 'M') {
        start = { x: c.x, y: c.y, in: null, out: null };
        nodes.push(start);
        prev = start;
      } else if (c.type === 'L') {
        if (atStart(c)) {
          prev = start;
        } else {
          const n2 = { x: c.x, y: c.y, in: null, out: null };
          nodes.push(n2);
          prev = n2;
        }
      } else if (c.type === 'C') {
        if (prev) prev.out = { x: c.x1, y: c.y1 };
        if (atStart(c)) {
          start.in = { x: c.x2, y: c.y2 };
          prev = start;
        } else {
          const n3 = { x: c.x, y: c.y, in: { x: c.x2, y: c.y2 }, out: null };
          nodes.push(n3);
          prev = n3;
        }
      } else if (c.type === 'Q') {
        if (prev) prev.out = { x: c.x1, y: c.y1 };
        if (atStart(c)) {
          start.in = { x: c.x1, y: c.y1 };
          prev = start;
        } else {
          const n4 = { x: c.x, y: c.y, in: { x: c.x1, y: c.y1 }, out: null };
          nodes.push(n4);
          prev = n4;
        }
      } else if (c.type === 'Z') {
        prev = start;
      }
    });
  }

  // Lay the string out in stage-pixel space, mirroring the CSS specimen metrics
  // (font-size px == em, kerning + tracking, centred block, fill baseline) so the
  // traced outline lands exactly where the CSS text used to.
  function traceContours(font, text, px, trackingPx, leading, align, W, H) {
    const fu = px / font.unitsPerEm;
    const lines = String(text).split('\n');
    const lineGlyphs = lines.map((ln) => font.stringToGlyphs(ln));
    const kern = (a, b) =>
      typeof font.getKerningValue === 'function' ? font.getKerningValue(a, b) || 0 : 0;
    function lineW(gs) {
      let w = 0;
      for (let i = 0; i < gs.length; i++) {
        w += (gs[i].advanceWidth || 0) * fu;
        if (i < gs.length - 1) w += kern(gs[i], gs[i + 1]) * fu + trackingPx;
      }
      return Math.max(0, w);
    }
    const widths = lineGlyphs.map(lineW);
    const maxW = widths.reduce((m, w) => Math.max(m, w), 0);
    const lineH = px * leading;
    const totalH = lineH * lines.length;
    const baseline0 = (H - totalH) / 2 + (lineH - px) / 2 + px * 0.8; // == fill baseline
    const blockLeft = W / 2 - maxW / 2;
    const contours = [];
    const nodes = [];
    lineGlyphs.forEach((gs, li) => {
      const lw = widths[li];
      let penX =
        align === 'left' ? blockLeft : align === 'right' ? blockLeft + maxW - lw : W / 2 - lw / 2;
      const by = baseline0 + li * lineH;
      gs.forEach((g, i) => {
        if (typeof g.getPath === 'function' && (g.advanceWidth || g.path)) {
          const gp = g.getPath(penX, by, px);
          if (gp && gp.commands && gp.commands.length) {
            flattenCmds(gp.commands).forEach((c) => {
              if (c.length >= 2) contours.push(c);
            });
            collectNodes(gp.commands, nodes);
          }
        }
        let adv = (g.advanceWidth || 0) * fu;
        if (i < gs.length - 1) adv += kern(g, gs[i + 1]) * fu + trackingPx;
        penX += adv;
      });
    });
    return { contours, nodes };
  }

  // Orientation-robust nonzero union (depth-parity shells/holes) — same contract
  // as the engine's FillBoolean.nonZeroUnionByContainment. Returns rings of {x,y}.
  function weldContours(contours) {
    const pc = window.polygonClipping;
    if (!pc || !pc.union) return null;
    function close(r) {
      const a = [];
      for (let i = 0; i < r.length; i++) a.push([r[i].x, r[i].y]);
      if (a.length < 3) return null;
      const fst = a[0];
      const lst = a[a.length - 1];
      if (Math.hypot(fst[0] - lst[0], fst[1] - lst[1]) > 1e-6) a.push([fst[0], fst[1]]);
      return a.length >= 4 ? a : null;
    }
    function inRing(p, ring) {
      const x = p[0];
      const y = p[1];
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0];
        const yi = ring[i][1];
        const xj = ring[j][0];
        const yj = ring[j][1];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi)
          inside = !inside;
      }
      return inside;
    }
    const rings = contours.map(close).filter(Boolean);
    if (!rings.length) return null;
    const depth = rings.map((r, i) => {
      const p = r[0];
      let d = 0;
      for (let j = 0; j < rings.length; j++) if (j !== i && inRing(p, rings[j])) d++;
      return d;
    });
    const shells = [];
    const holes = [];
    rings.forEach((r, i) => {
      (depth[i] % 2 === 0 ? shells : holes).push([[r]]);
    });
    if (!shells.length) return null;
    let res;
    try {
      const subj = pc.union.apply(pc, shells);
      res = holes.length ? pc.difference(subj, pc.union.apply(pc, holes)) : subj;
    } catch (_) {
      return null;
    }
    const out = [];
    (res || []).forEach((poly) => {
      (poly || []).forEach((ring) => {
        const pts = ring.map((p) => ({ x: p[0], y: p[1] }));
        if (pts.length >= 2) out.push(pts);
      });
    });
    return out.length ? out : null;
  }

  function ringsToD(rings) {
    let d = '';
    rings.forEach((r) => {
      if (r.length < 2) return;
      d += 'M' + f1(r[0].x) + ' ' + f1(r[0].y);
      for (let i = 1; i < r.length; i++) d += 'L' + f1(r[i].x) + ' ' + f1(r[i].y);
      d += 'Z';
    });
    return d;
  }
  function ringsToDOff(rings, dx, dy) {
    let d = '';
    rings.forEach((r) => {
      if (r.length < 2) return;
      d += 'M' + f1(r[0].x + dx) + ' ' + f1(r[0].y + dy);
      for (let i = 1; i < r.length; i++) d += 'L' + f1(r[i].x + dx) + ' ' + f1(r[i].y + dy);
      d += 'Z';
    });
    return d;
  }
  function ringsBBox(rings) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    rings.forEach((r) => {
      for (let i = 0; i < r.length; i++) {
        const p = r[i];
        if (p.x < x0) x0 = p.x;
        if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y;
        if (p.y > y1) y1 = p.y;
      }
    });
    return isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 0, h: 0 };
  }

  // ── fill toolpath geometry (hatch / cross / stripe / spiral / dots) ──────────
  function hatchLines(W, H, spacing, angleDeg) {
    const out = [];
    const th = (angleDeg * Math.PI) / 180;
    const dx = Math.cos(th);
    const dy = Math.sin(th);
    const nx = -dy;
    const ny = dx;
    let min = Infinity;
    let max = -Infinity;
    [
      [0, 0],
      [W, 0],
      [0, H],
      [W, H],
    ].forEach((c) => {
      const p = c[0] * nx + c[1] * ny;
      if (p < min) min = p;
      if (p > max) max = p;
    });
    const L = Math.sqrt(W * W + H * H);
    for (let t = Math.floor(min / spacing) * spacing; t <= max; t += spacing) {
      const bx = nx * t;
      const by = ny * t;
      out.push({ type: 'line', x1: bx - dx * L, y1: by - dy * L, x2: bx + dx * L, y2: by + dy * L });
    }
    return out;
  }
  function spiralPath(W, H, spacing) {
    const cx = W / 2;
    const cy = H / 2;
    const b = spacing / (2 * Math.PI);
    const maxR = Math.sqrt(W * W + H * H) / 2;
    let d = 'M' + f1(cx) + ' ' + f1(cy);
    for (let a = 0.15; b * a <= maxR; a += 0.18) {
      const r = b * a;
      d += ' L' + f1(cx + r * Math.cos(a)) + ' ' + f1(cy + r * Math.sin(a));
    }
    return [{ type: 'path', d }];
  }
  function dotGrid(W, H, spacing) {
    const out = [];
    const r = Math.max(0.7, spacing * 0.34);
    for (let y = spacing * 0.5; y < H + spacing; y += spacing)
      for (let x = spacing * 0.5; x < W + spacing; x += spacing)
        out.push({ type: 'circle', cx: x, cy: y, r });
    return out;
  }
  function buildFillGeometry(type, W, H, spacing, angle) {
    switch (type) {
      case 'cross':
        return hatchLines(W, H, spacing, angle).concat(hatchLines(W, H, spacing, angle + 90));
      case 'stripe':
        return hatchLines(W, H, spacing, 0);
      case 'spiral':
        return spiralPath(W, H, spacing);
      case 'dots':
        return dotGrid(W, H, spacing);
      default:
        return hatchLines(W, H, spacing, angle); // hatch
    }
  }
  function fillEl(seg, color, w) {
    if (seg.type === 'line')
      return (
        '<line x1="' +
        f1(seg.x1) +
        '" y1="' +
        f1(seg.y1) +
        '" x2="' +
        f1(seg.x2) +
        '" y2="' +
        f1(seg.y2) +
        '" stroke="' +
        color +
        '" stroke-width="' +
        w +
        '" stroke-linecap="round"/>'
      );
    if (seg.type === 'path')
      return (
        '<path d="' +
        seg.d +
        '" fill="none" stroke="' +
        color +
        '" stroke-width="' +
        w +
        '" stroke-linecap="round" stroke-linejoin="round"/>'
      );
    if (seg.type === 'circle')
      return (
        '<circle cx="' + f1(seg.cx) + '" cy="' + f1(seg.cy) + '" r="' + f1(seg.r) + '" fill="' + color + '"/>'
      );
    return '';
  }

  // baseline of line `i` for a vertically-centred block of `n` lines.
  function specBaselines(px, n, H, leading) {
    const lineH = px * leading;
    const totalH = lineH * n;
    const top = (H - totalH) / 2;
    const out = [];
    for (let i = 0; i < n; i++) out.push(top + i * lineH + (lineH - px) / 2 + px * 0.8);
    return out;
  }

  // outline-view node markers
  function anchorSq(x, y) {
    const s = 1.9;
    return (
      '<rect x="' +
      f1(x - s) +
      '" y="' +
      f1(y - s) +
      '" width="' +
      2 * s +
      '" height="' +
      2 * s +
      '" fill="#101418" stroke="#cfe6ff" stroke-width="0.9"/>'
    );
  }
  function handle(x, y, hx, hy) {
    return (
      '<line x1="' +
      f1(x) +
      '" y1="' +
      f1(y) +
      '" x2="' +
      f1(hx) +
      '" y2="' +
      f1(hy) +
      '" stroke="rgba(120,180,235,.6)" stroke-width="0.7"/>' +
      '<circle cx="' + f1(hx) + '" cy="' + f1(hy) + '" r="1.3" fill="#7fd4ff"/>'
    );
  }

  // ── controller ───────────────────────────────────────────────────────────────
  function create(refs) {
    refs = refs || {};
    const stage = refs.stage || null;
    const specText = refs.specText || null;
    const guideSvg = refs.guideSvg || null;
    const fillSvg = refs.fillSvg || null;
    const outlineSvg = refs.outlineSvg || null;

    let destroyed = false;
    let lastLayer = null;
    let lastView = null;
    let resizeObs = null;
    const requested = {}; // key → in-flight, so async loads attach a re-render once

    // px-per-mm for the live preview (1 em == size mm in absolute mode; 38mm in fit).
    function mmToPx(px, fitToFrame, size) {
      return px / (fitToFrame ? 38 : Math.max(size, 1));
    }

    // Stage pixel box. Falls back to a sensible default when the panel hasn't been
    // laid out yet (clientWidth 0); a ResizeObserver re-renders once it has.
    function dims() {
      let W = (stage && stage.clientWidth) || 0;
      let H = (stage && stage.clientHeight) || 0;
      if ((!W || !H) && stage && typeof stage.getBoundingClientRect === 'function') {
        const r = stage.getBoundingClientRect();
        W = W || Math.round(r.width);
        H = H || Math.round(r.height);
      }
      if (!W) W = 266;
      if (!H) H = 78;
      return { W, H };
    }

    function rerender() {
      if (destroyed || !lastLayer) return;
      try {
        render(lastLayer, lastView);
      } catch (_) {
        /* a preview must never surface an error to the host */
      }
    }

    // Ask the engine for a face exactly once; re-render when it lands. ensureFont /
    // loadWeight are idempotent (engine-cached); we just gate the re-render.
    function kick(key, promiseFn) {
      if (requested[key]) return;
      requested[key] = true;
      let p;
      try {
        p = promiseFn();
      } catch (_) {
        requested[key] = false;
        return;
      }
      if (!p || typeof p.then !== 'function') {
        requested[key] = false;
        return;
      }
      p.then(
        () => {
          requested[key] = false;
          rerender();
        },
        () => {
          requested[key] = false;
        }
      );
    }

    // Best-available parsed opentype face for the current font + weight, or null
    // for built-ins / while a TTF downloads (kicks the load + a later re-render).
    function parsedFace(font, label) {
      const gf = GF();
      if (!gf || !isWeb(font)) return null;
      const id = gf.keyToId(font);
      const wn = weightNum(label);
      const weighted = gf.getParsed(weightedKey(id, wn));
      const base = gf.getParsed(id);
      if (!weighted && !base) {
        if (typeof gf.ensureFont === 'function') kick('f:' + id, () => gf.ensureFont(id));
        return null;
      }
      // Opportunistically upgrade to the requested weight (Regular already == base).
      if (wn !== 400 && !weighted && typeof gf.loadWeight === 'function') {
        kick('w:' + id + ':' + wn, () => gf.loadWeight(id, label));
      }
      return weighted || base;
    }

    // Trace + weld the live glyph contours into stage-space rings, SHARED by the
    // fill clip and the outline view so both agree on the geometry. null for
    // built-ins / loading faces.
    function glyphRings(p, font, px, W, H) {
      const face = parsedFace(p.font, p.fontWeight);
      if (!face) return null;
      let txt = p.text || ' ';
      if (p.allCaps) txt = txt.toUpperCase();
      let rings;
      try {
        const laid = traceContours(
          face,
          txt,
          px,
          num(p.tracking, 0) * 0.9,
          num(p.lineHeight, 1.15),
          baseAlign(p.align),
          W,
          H
        );
        rings = laid.contours;
        if (p.mergeOverlaps) {
          const w = weldContours(laid.contours);
          if (w && w.length) rings = w;
        }
      } catch (_) {
        return null;
      }
      return rings && rings.length ? rings : null;
    }

    function emptyAll() {
      if (guideSvg) guideSvg.innerHTML = '';
      if (fillSvg) fillSvg.innerHTML = '';
      if (outlineSvg) outlineSvg.innerHTML = '';
    }

    // ── specimen text styling ──────────────────────────────────────────────────
    function setSpecText(st, txt, jitter) {
      st.textContent = '';
      if (!(jitter > 0.05)) {
        st.textContent = txt;
        return;
      }
      const K = 1.8; // px offset per unit of jitter
      const RD = 2.2; // deg rotation per unit of jitter
      for (let i = 0; i < txt.length; i++) {
        const ch = txt[i];
        if (ch === '\n' || ch === ' ') {
          st.appendChild(document.createTextNode(ch));
          continue;
        }
        const dx = (jrand(3 * i) - 0.5) * 2 * jitter * K;
        const dy = (jrand(3 * i + 1) - 0.5) * 2 * jitter * K;
        const rot = (jrand(3 * i + 2) - 0.5) * 2 * jitter * RD;
        const sp = document.createElement('span');
        sp.textContent = ch;
        sp.style.display = 'inline-block';
        sp.style.transform =
          'translate(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px) rotate(' + rot.toFixed(2) + 'deg)';
        st.appendChild(sp);
      }
    }

    function specStroke(show, p) {
      if (!specText) return;
      const sw = show && p.outlineStroke ? Math.min(0.7 + (num(p.outlineThickness, 1) - 1) * 0.13, 14) : 0;
      specText.style.webkitTextStrokeWidth = sw.toFixed(2) + 'px';
    }

    // ── fill-line overlay ───────────────────────────────────────────────────────
    let fcSeq = 0;
    function renderFillLines(p, view, filled, px, W, H) {
      if (!fillSvg) return;
      if (!filled) {
        fillSvg.innerHTML = '';
        return;
      }
      fillSvg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      if (specText) fillSvg.style.transform = specText.style.transform;

      const reveal = !!(view && view.showFillLines);
      const d = clamp(num(p.fillDensity, 14), 1, 40);
      const strokeW = reveal ? 1.05 : 1.7;
      const spacing = strokeW + (1 - (d - 1) / 39) * 15;
      const geo = buildFillGeometry(p.fillType || 'hatch', W, H, spacing, num(p.fillAngle, 45));

      const maskId = 'vtpfm' + fcSeq++;
      let regionDef;
      let regionRef;
      let guide = '';

      const rings = glyphRings(p, p.font, px, W, H);
      if (rings) {
        const sc = mmToPx(px, !!p.fitToFrame, num(p.fontSize, 38));
        const bb = ringsBBox(rings);
        const offX = num(p.fillOffsetX, 0) * bb.w;
        const offY = num(p.fillOffsetY, 0) * bb.h;
        const dPath = ringsToDOff(rings, offX, offY);
        const erode =
          p.fillInsetEnabled && num(p.fillInset, 0) > 0
            ? '<path d="' +
              dPath +
              '" fill="none" stroke="#000" stroke-width="' +
              f1(2 * num(p.fillInset, 0) * sc) +
              '" stroke-linejoin="round" stroke-linecap="round"/>'
            : '';
        regionDef =
          '<mask id="' +
          maskId +
          '" maskUnits="userSpaceOnUse" x="0" y="0" width="' +
          W +
          '" height="' +
          H +
          '">' +
          '<path d="' +
          dPath +
          '" fill="#fff" fill-rule="evenodd"/>' +
          erode +
          '</mask>';
        regionRef = ' mask="url(#' + maskId + ')"';
        if (reveal)
          guide =
            '<path d="' +
            ringsToD(rings) +
            '" fill="none" stroke="rgba(255,255,255,.20)" stroke-width="0.8" stroke-linejoin="round"/>';
      } else {
        // built-in / still-loading fallback: clip to an SVG <text> (legacy path).
        let txt = p.text || ' ';
        if (p.allCaps) txt = txt.toUpperCase();
        const lines = txt.split('\n');
        const fam = cssFamily(p.font).replace(/"/g, "'");
        const fw = weightNum(p.fontWeight);
        const lh = px * num(p.lineHeight, 1.15);
        const bls = specBaselines(px, lines.length, H, num(p.lineHeight, 1.15));
        let tspans = '';
        for (let i = 0; i < lines.length; i++)
          tspans +=
            '<tspan x="' + f1(W / 2) + '" y="' + f1(bls[i]) + '">' + xmlEsc(lines[i] || ' ') + '</tspan>';
        const tAttr =
          'text-anchor="middle" font-family="' +
          fam +
          '" font-size="' +
          f1(px) +
          '" font-weight="' +
          fw +
          '" letter-spacing="' +
          num(p.tracking, 0) * 0.9 +
          'px"';
        regionDef = '<clipPath id="' + maskId + '"><text ' + tAttr + '>' + tspans + '</text></clipPath>';
        regionRef = ' clip-path="url(#' + maskId + ')"';
        if (reveal)
          guide =
            '<text ' + tAttr + ' fill="none" stroke="rgba(255,255,255,.20)" stroke-width="0.8">' + tspans + '</text>';
      }

      const color = reveal ? 'rgba(86,150,222,.5)' : '#f1f1f1';
      const blend = reveal ? ' style="mix-blend-mode:screen"' : '';
      const body =
        '<g' +
        regionRef +
        blend +
        '>' +
        geo.map((s) => fillEl(s, color, strokeW)).join('') +
        '</g>' +
        guide;
      fillSvg.innerHTML = '<defs>' + regionDef + '</defs>' + body;
    }

    // ── guide overlay ─────────────────────────────────────────────────────────
    let _measCanvas = null;
    function measureCtx(px, fam, fw) {
      if (typeof document === 'undefined' || !document.createElement) return null;
      _measCanvas = _measCanvas || document.createElement('canvas');
      const c = _measCanvas.getContext && _measCanvas.getContext('2d');
      if (!c) return null;
      c.font = fw + ' ' + px + 'px ' + fam;
      return c;
    }
    // cap / x-height / ascender / descender offsets (stage px), resolved from the
    // real font: opentype metrics first, canvas measureText fallback, then fixed
    // ratios while a face downloads.
    function specFontMetrics(p, px) {
      const fin = (v) => typeof v === 'number' && isFinite(v) && v > 0;
      const face = parsedFace(p.font, p.fontWeight);
      let mt = null;
      function meas() {
        if (mt) return mt;
        const fam = cssFamily(p.font).replace(/"/g, "'");
        const ctx = measureCtx(px, fam, weightNum(p.fontWeight));
        if (!ctx) {
          mt = {};
          return mt;
        }
        const H = ctx.measureText('H');
        const x = ctx.measureText('x');
        mt = {
          cap: H.actualBoundingBoxAscent,
          x: x.actualBoundingBoxAscent,
          asc: H.fontBoundingBoxAscent,
          desc: H.fontBoundingBoxDescent,
        };
        return mt;
      }
      if (face) {
        const fu = px / face.unitsPerEm;
        const os2 = face.tables && face.tables.os2;
        const asc = face.ascender * fu;
        const desc = -face.descender * fu;
        const cap = os2 && fin(os2.sCapHeight) ? os2.sCapHeight * fu : meas().cap;
        const xh = os2 && fin(os2.sxHeight) ? os2.sxHeight * fu : meas().x;
        if (fin(asc) && fin(desc) && fin(cap) && fin(xh)) return { cap, x: xh, asc, desc };
      }
      const m = meas();
      if (fin(m.cap) && fin(m.x) && fin(m.asc) && fin(m.desc)) return m;
      return { cap: px * 0.72, x: px * 0.5, asc: px * 0.95, desc: px * 0.22 }; // loading fallback
    }

    function renderGuides(p, view, px, W, H) {
      if (!guideSvg) return;
      const g = (view && view.guides) || 'frame';
      if (g === 'none') {
        guideSvg.innerHTML = '';
        return;
      }
      guideSvg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      const parts = [];
      const ax = 12;
      const ay = 9;
      const accent = 'rgba(78,158,225,.30)';
      const mid = 'rgba(78,158,225,.40)';
      const faint = 'rgba(255,255,255,.11)';
      const lines = (p.text || ' ').split('\n');
      const leading = num(p.lineHeight, 1.15);
      const bls = specBaselines(px, lines.length, H, leading);
      const frame = () =>
        parts.push(
          '<rect x="' +
            ax +
            '" y="' +
            ay +
            '" width="' +
            f1(W - 2 * ax) +
            '" height="' +
            f1(H - 2 * ay) +
            '" rx="3" fill="none" stroke="' +
            accent +
            '" stroke-width="1" stroke-dasharray="4 3"/>'
        );
      const hline = (y, color, dash) =>
        parts.push(
          '<line x1="' +
            ax +
            '" y1="' +
            f1(y) +
            '" x2="' +
            f1(W - ax) +
            '" y2="' +
            f1(y) +
            '" stroke="' +
            color +
            '" stroke-width="1"' +
            (dash ? ' stroke-dasharray="' + dash + '"' : '') +
            '/>'
        );
      switch (g) {
        case 'frame':
          frame();
          break;
        case 'center':
          frame();
          parts.push(
            '<line x1="' +
              f1(W / 2) +
              '" y1="' +
              ay +
              '" x2="' +
              f1(W / 2) +
              '" y2="' +
              f1(H - ay) +
              '" stroke="' +
              faint +
              '" stroke-width="1" stroke-dasharray="3 4"/>'
          );
          parts.push(
            '<line x1="' +
              ax +
              '" y1="' +
              f1(H / 2) +
              '" x2="' +
              f1(W - ax) +
              '" y2="' +
              f1(H / 2) +
              '" stroke="' +
              faint +
              '" stroke-width="1" stroke-dasharray="3 4"/>'
          );
          break;
        case 'baseline':
          bls.forEach((b) => hline(b, accent, ''));
          break;
        case 'ruled': {
          const fmR = specFontMetrics(p, px);
          bls.forEach((b) => {
            hline(b - fmR.cap, faint, '4 3');
            hline(b, accent, '');
          });
          break;
        }
        case 'hand': {
          const fmH = specFontMetrics(p, px);
          bls.forEach((b) => {
            hline(b - fmH.asc, faint, '4 4');
            hline(b - fmH.cap, faint, '2 3');
            hline(b - fmH.x, mid, '6 4');
            hline(b, accent, '');
            hline(b + fmH.desc, faint, '4 4');
          });
          break;
        }
        case 'dots': {
          const sp = 12;
          const dp = [];
          for (let y = ay + sp / 2; y < H - ay + 0.5; y += sp)
            for (let x = ax + sp / 2; x < W - ax + 0.5; x += sp)
              dp.push('<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="0.9" fill="' + faint + '"/>');
          parts.push(dp.join(''));
          break;
        }
        default:
          break;
      }
      guideSvg.innerHTML = parts.join('');
    }

    // ── outline / node inspection overlay ───────────────────────────────────────
    function renderOutlineView(p, view, px, W, H) {
      if (!outlineSvg) return;
      outlineSvg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      if (specText) outlineSvg.style.transform = specText.style.transform;

      let txt = p.text || ' ';
      if (p.allCaps) txt = txt.toUpperCase();
      const filled = !!p.fillEnabled && isWeb(p.font);
      const hollow = !!p.outlineStroke && !filled;
      const editing = !!(view && view.editing);
      const showNodes = !!(view && view.showOutlines);

      // FAITHFUL — the real renderer's geometry. Trace the glyph outlines, weld
      // overlaps when Merge Overlaps is on, stroke thin centrelines. Falls back to
      // the CSS stroke for built-ins, while a TTF downloads, when filled, or under
      // jitter (CSS owns the wobble + caret).
      const faithful = (hollow || filled) && !editing && num(p.jitter, 0) <= 0.05 && isWeb(p.font);
      const face = faithful ? parsedFace(p.font, p.fontWeight) : null;

      if (face) {
        let laid;
        try {
          laid = traceContours(
            face,
            txt,
            px,
            num(p.tracking, 0) * 0.9,
            num(p.lineHeight, 1.15),
            baseAlign(p.align),
            W,
            H
          );
        } catch (_) {
          specStroke(true, p);
          outlineSvg.innerHTML = '';
          return;
        }
        let rings = laid.contours;
        if (p.mergeOverlaps) {
          const welded = weldContours(laid.contours);
          if (welded && welded.length) rings = welded;
        }
        const sw = Math.min(0.7 + (num(p.outlineThickness, 1) - 1) * 0.13, 14);
        let body = p.outlineStroke
          ? '<path d="' +
            ringsToD(rings) +
            '" fill="none" stroke="#f1f1f1" stroke-width="' +
            f1(sw) +
            '" stroke-linejoin="round" stroke-linecap="round"/>'
          : '';
        if (showNodes) {
          let hLines = '';
          let anchors = '';
          laid.nodes.forEach((n) => {
            if (n.in) hLines += handle(n.x, n.y, n.in.x, n.in.y);
            if (n.out) hLines += handle(n.x, n.y, n.out.x, n.out.y);
            anchors += anchorSq(n.x, n.y);
          });
          body += hLines + anchors;
        }
        outlineSvg.innerHTML = body;
        specStroke(false, p); // the traced contour IS the specimen; hide CSS stroke
        return;
      }

      // FALLBACK — built-ins / filled / loading / jitter: keep the CSS stroke; only
      // overlay an SVG-text contour when the node toggle is on.
      specStroke(true, p);
      if (!showNodes) {
        outlineSvg.innerHTML = '';
        return;
      }
      const fam = cssFamily(p.font).replace(/"/g, "'");
      const fw = weightNum(p.fontWeight);
      const lines = txt.split('\n');
      const bls = specBaselines(px, lines.length, H, num(p.lineHeight, 1.15));
      const tAttr =
        'text-anchor="middle" font-family="' +
        fam +
        '" font-size="' +
        f1(px) +
        '" font-weight="' +
        fw +
        '" letter-spacing="' +
        num(p.tracking, 0) * 0.9 +
        'px"';
      let tspans = '';
      for (let li = 0; li < lines.length; li++)
        tspans += '<tspan x="' + f1(W / 2) + '" y="' + f1(bls[li]) + '">' + xmlEsc(lines[li] || ' ') + '</tspan>';
      outlineSvg.innerHTML =
        '<text ' + tAttr + ' fill="none" stroke="rgba(120,180,235,.9)" stroke-width="0.9">' + tspans + '</text>';
    }

    // ── main render ──────────────────────────────────────────────────────────
    function render(layer, view) {
      if (destroyed) return;
      lastLayer = layer || lastLayer;
      lastView = view || lastView || {};
      view = lastView;
      const p = (layer && layer.params) || (lastLayer && lastLayer.params) || {};

      const { W, H } = dims();
      if (!W || !H) {
        emptyAll();
        return;
      }

      const editing = !!view.editing;

      // ── specimen text element styling ──
      if (specText) {
        const raw = p.text;
        const txt = raw && raw.length ? raw : ' ';
        specText.style.textTransform = p.allCaps ? 'uppercase' : 'none';
        if (!editing) setSpecText(specText, txt, num(p.jitter, 0));

        specText.style.fontFamily = cssFamily(p.font);

        const px = p.fitToFrame ? 16 + num(p.fillRatio, 0.85) * 34 : clamp(num(p.fontSize, 38) * 0.9, 10, 58);
        specText.style.fontSize = px.toFixed(1) + 'px';
        specText.style.fontWeight = String(weightNum(p.fontWeight));

        const filled = !!p.fillEnabled && isWeb(p.font);
        const strokeW = p.outlineStroke ? Math.min(0.7 + (num(p.outlineThickness, 1) - 1) * 0.13, 14) : 0;
        const hollow = !!p.outlineStroke && !filled;
        const weld = hollow && !!p.mergeOverlaps;
        specText.style.color = filled || p.outlineStroke ? 'transparent' : 'rgba(241,241,241,.14)';
        specText.style.webkitTextStrokeWidth = strokeW.toFixed(2) + 'px';
        specText.style.webkitTextStrokeColor = '#f1f1f1';
        specText.style.fontKerning = weld ? 'none' : 'normal';
        specText.style.fontFeatureSettings = weld ? '"kern" 0, "liga" 0, "calt" 0' : 'normal';
        specText.style.letterSpacing = num(p.tracking, 0) * 0.9 + 'px';
        specText.style.lineHeight = String(num(p.lineHeight, 1.15));

        const hs = num(p.hScale, 100) / 100;
        const vs = num(p.vScale, 100) / 100;
        const tf =
          'scale(' +
          hs +
          ',' +
          vs +
          ') rotate(' +
          num(p.charRotation, 0) * 0.15 +
          'deg) translate(' +
          num(p.offsetX, 0) * 0.06 +
          'px,' +
          (-num(p.baselineShift, 0) * 0.4 - num(p.offsetY, 0) * 0.06) +
          'px)';
        specText.style.transform = tf;
        specText.style.textAlign = baseAlign(p.align);
        specText.style.textShadow = 'none';
      }

      const px = p.fitToFrame ? 16 + num(p.fillRatio, 0.85) * 34 : clamp(num(p.fontSize, 38) * 0.9, 10, 58);
      const filled = !!p.fillEnabled && isWeb(p.font);

      renderFillLines(p, view, filled, px, W, H);
      renderGuides(p, view, px, W, H);
      renderOutlineView(p, view, px, W, H);
    }

    // Re-render when the stage is resized / first laid out.
    try {
      if (stage && typeof window !== 'undefined' && typeof window.ResizeObserver === 'function') {
        resizeObs = new window.ResizeObserver(() => rerender());
        resizeObs.observe(stage);
      }
    } catch (_) {
      resizeObs = null;
    }

    function destroy() {
      destroyed = true;
      lastLayer = null;
      lastView = null;
      if (resizeObs) {
        try {
          resizeObs.disconnect();
        } catch (_) {
          /* best-effort */
        }
        resizeObs = null;
      }
    }

    return {
      render: (layer, view) => {
        try {
          render(layer, view);
        } catch (_) {
          /* a preview must never surface an error to the host */
        }
      },
      destroy,
    };
  }

  Vectura.UI.TextSpecimen = { create };
})();
