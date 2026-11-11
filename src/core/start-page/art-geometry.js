/**
 * Start Page art geometry — pure math for the art runtime (src/ui/start-page/ink.js).
 *
 * No DOM access except inside `rasterLib`, which receives its canvas factory as an
 * argument so the same source runs on the main thread (document canvas) and inside
 * an OffscreenCanvas worker (ink.js builds the worker from `rasterLibSource`).
 * `rasterLib` must therefore stay self-contained: no closure references.
 *
 * Pieces are exported plotter SVGs (strokes only): paths made of M/L/H/V/Q/C/Z,
 * circles, polylines and polygons. Everything here works on the parsed form:
 *   { vb:[x,y,w,h], polys:Float32Array[], widths:Float32Array, lens, total, strokes }
 */
(() => {
  /* Self-contained raster library (parse + static raster). See header note. */
  function rasterLib(mk) {
    function parseD(d, polys) {
      const tk = d.match(/[MLCZHVQmlczhvq]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
      let i = 0; let cmd = 'M'; let cur = null; let x = 0; let y = 0; let sx = 0; let sy = 0;
      const flush = () => { if (cur && cur.length >= 4) polys.push(new Float32Array(cur)); cur = null; };
      while (i < tk.length) {
        const t = tk[i];
        if (/^[A-Za-z]$/.test(t)) {
          cmd = t.toUpperCase(); i++;
          if (cmd === 'Z') { if (cur) cur.push(sx, sy); flush(); }
          continue;
        }
        if (cmd === 'M') { flush(); x = +tk[i]; y = +tk[i + 1]; i += 2; cur = [x, y]; sx = x; sy = y; cmd = 'L'; }
        else if (cmd === 'L') { x = +tk[i]; y = +tk[i + 1]; i += 2; (cur = cur || [x, y]).push(x, y); }
        else if (cmd === 'H') { x = +tk[i]; i += 1; (cur = cur || [x, y]).push(x, y); }
        else if (cmd === 'V') { y = +tk[i]; i += 1; (cur = cur || [x, y]).push(x, y); }
        else if (cmd === 'Q') {
          const x1 = +tk[i], y1 = +tk[i + 1], x2 = +tk[i + 2], y2 = +tk[i + 3]; i += 4; cur = cur || [x, y];
          const n = Math.max(1, Math.min(24, Math.ceil((Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1)) / 0.7)));
          for (let k = 1; k <= n; k++) { const s = k / n, u = 1 - s; cur.push(u * u * x + 2 * u * s * x1 + s * s * x2, u * u * y + 2 * u * s * y1 + s * s * y2); }
          x = x2; y = y2;
        } else if (cmd === 'C') {
          const x1 = +tk[i], y1 = +tk[i + 1], x2 = +tk[i + 2], y2 = +tk[i + 3], x3 = +tk[i + 4], y3 = +tk[i + 5]; i += 6; cur = cur || [x, y];
          const est = Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
          const n = Math.max(1, Math.min(32, Math.ceil(est / 0.7)));
          for (let k = 1; k <= n; k++) {
            const s = k / n, u = 1 - s;
            cur.push(u * u * u * x + 3 * u * u * s * x1 + 3 * u * s * s * x2 + s * s * s * x3, u * u * u * y + 3 * u * u * s * y1 + 3 * u * s * s * y2 + s * s * s * y3);
          }
          x = x3; y = y3;
        } else i++;
      }
      flush();
    }
    function parse(txt) {
      const vbm = txt.match(/viewBox="([^"]+)"/);
      const vb = vbm ? vbm[1].trim().split(/[\s,]+/).map(Number) : [0, 0, 100, 100];
      const polys = []; const widths = [];
      const re = /<g[^>]*stroke-width="([\d.]+)"[^>]*>|<path[^>]*?\sd="([^"]+)"|<circle[^>]*?cx="([-\d.]+)"[^>]*?cy="([-\d.]+)"[^>]*?r="([-\d.]+)"|<poly(?:line|gon)[^>]*?points="([^"]+)"/g;
      let m; let w = 0.3;
      while ((m = re.exec(txt))) {
        if (m[1]) { w = +m[1]; continue; }
        if (m[2]) { const n0 = polys.length; parseD(m[2], polys); for (let i = n0; i < polys.length; i++) widths.push(w); continue; }
        if (m[6]) { const a = m[6].trim().split(/[\s,]+/).map(Number); if (a.length >= 4) { polys.push(new Float32Array(a)); widths.push(w); } continue; }
        const cx = +m[3], cy = +m[4], r = +m[5], n = Math.max(14, Math.min(72, Math.round(r * 5)));
        const a = new Float32Array((n + 1) * 2);
        for (let i = 0; i <= n; i++) { const t = i / n * Math.PI * 2; a[i * 2] = cx + r * Math.cos(t); a[i * 2 + 1] = cy + r * Math.sin(t); }
        polys.push(a); widths.push(w);
      }
      const lens = new Float32Array(polys.length); let total = 0;
      polys.forEach((p, k) => { let L = 0; for (let i = 2; i < p.length; i += 2) L += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]); lens[k] = L; total += L; });
      return { vb, polys, widths: Float32Array.from(widths), lens, total, strokes: polys.length };
    }
    /* Static raster of a piece. m: { w, h, dpr, lw, alpha, color, color2, win }. */
    function raster(a, m) {
      const cv = mk(Math.max(1, Math.round(m.w * m.dpr)), Math.max(1, Math.round(m.h * m.dpr))); const c = cv.getContext('2d');
      const [vx, vy, vw, vh] = m.win || a.vb;
      const s = Math.min(m.w / vw, m.h / vh); const ox = (m.w - vw * s) / 2 - vx * s; const oy = (m.h - vh * s) / 2 - vy * s;
      c.setTransform(m.dpr, 0, 0, m.dpr, 0, 0); c.lineCap = 'round'; c.lineJoin = 'round'; c.globalAlpha = m.alpha;
      if (m.color2) {
        const g = c.createLinearGradient(vx * s + ox, vy * s + oy, (vx + vw) * s + ox, (vy + vh) * s + oy);
        g.addColorStop(0, m.color); g.addColorStop(1, m.color2); c.strokeStyle = g;
      } else c.strokeStyle = m.color;
      let curW = -1; c.beginPath();
      for (let j = 0; j < a.polys.length; j++) {
        const P = a.polys[j]; const w = m.lw * Math.max(0.5, a.widths[j] / 0.3);
        if (w !== curW) { c.stroke(); c.beginPath(); c.lineWidth = w; curW = w; }
        c.moveTo(P[0] * s + ox, P[1] * s + oy);
        for (let i = 2; i < P.length; i += 2) c.lineTo(P[i] * s + ox, P[i + 1] * s + oy);
      }
      c.stroke();
      return cv;
    }
    return { parse, raster };
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const num = (v, d) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : d);

  let mainLib = null;
  const parseArtSvg = (text) => {
    if (!mainLib) mainLib = rasterLib(() => { throw new Error('parse-only'); });
    return mainLib.parse(String(text || ''));
  };

  const luminance = (hex) => {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return 0;
    const h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
    const ch = [0, 2, 4].map((i) => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };

  /* Ink extent of a piece plus a coarse 32x32 stroke-length grid (for the smart crop). */
  const inkInfo = (a) => {
    if (a._ink) return a._ink;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const P of a.polys) {
      for (let i = 0; i < P.length; i += 2) {
        const x = P[i], y = P[i + 1];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (!(x1 > x0) || !(y1 > y0)) { x0 = a.vb[0]; y0 = a.vb[1]; x1 = x0 + a.vb[2]; y1 = y0 + a.vb[3]; }
    const G = 32; const grid = new Float32Array(G * G); const bw = x1 - x0; const bh = y1 - y0;
    for (const P of a.polys) {
      for (let i = 2; i < P.length; i += 2) {
        const gx = Math.min(G - 1, Math.max(0, ((P[i] - x0) / bw * G) | 0));
        const gy = Math.min(G - 1, Math.max(0, ((P[i + 1] - y0) / bh * G) | 0));
        grid[gy * G + gx] += Math.abs(P[i] - P[i - 2]) + Math.abs(P[i + 1] - P[i - 1]);
      }
    }
    a._ink = { box: [x0, y0, bw, bh], G, grid };
    return a._ink;
  };
  /* The ink box of the piece's BODY: the box of the grid cells that hold real ink, leaving out long sparse strokes (a ground
     plane's edges, a light marker) that stretch the plain ink box until the object itself reads tiny. Ink is sampled along each
     stroke (never by segment midpoint, so a long line cannot pile into one cell) on a 64x64 grid; a cell counts when it holds at
     least `cut` x the cell mass below which 75 % of all the ink lies (a mass-weighted quartile: the busy cells set the bar). The result is dilated by one cell and
     never smaller than 12 % of the ink box on a side. Falls back to the plain ink box (a piece with no dense body). */
  const focusInfo = (a, cut) => {
    const k = cut == null ? 0.5 : cut;
    if (a._focus && a._focus.cut === k) return a._focus.box;
    const [x0, y0, bw, bh] = inkInfo(a).box;
    const G = 64; const cw = bw / G; const ch = bh / G; const grid = new Float32Array(G * G);
    const cell = Math.max(1e-6, Math.min(cw, ch));
    for (const P of a.polys) {
      for (let i = 2; i < P.length; i += 2) {
        const ax = P[i - 2], ay = P[i - 1], bx = P[i], by = P[i + 1]; const L = Math.hypot(bx - ax, by - ay);
        if (!(L > 0)) continue;
        const n = Math.max(1, Math.ceil(L / cell)); const w = L / n;
        for (let j = 0; j < n; j++) {
          const t = (j + 0.5) / n; const gx = Math.min(G - 1, Math.max(0, ((ax + (bx - ax) * t - x0) / bw * G) | 0)); const gy = Math.min(G - 1, Math.max(0, ((ay + (by - ay) * t - y0) / bh * G) | 0));
          grid[gy * G + gx] += w;
        }
      }
    }
    const live = Array.from(grid).filter((v) => v > 0).sort((p, q) => p - q);
    const total = live.reduce((t, v) => t + v, 0);
    let acc = 0; let med = 0;
    for (const v of live) { acc += v; if (acc >= total * 0.75) { med = v; break; } }
    const thr = med * k; let gx0 = G, gy0 = G, gx1 = -1, gy1 = -1;
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) if (grid[y * G + x] >= thr && grid[y * G + x] > 0) { if (x < gx0) gx0 = x; if (x > gx1) gx1 = x; if (y < gy0) gy0 = y; if (y > gy1) gy1 = y; }
    let box = [x0, y0, bw, bh];
    if (gx1 >= gx0 && gy1 >= gy0) {
      gx0 = Math.max(0, gx0 - 1); gy0 = Math.max(0, gy0 - 1); gx1 = Math.min(G - 1, gx1 + 1); gy1 = Math.min(G - 1, gy1 + 1);
      let fw = (gx1 - gx0 + 1) * cw; let fh = (gy1 - gy0 + 1) * ch; let fx = x0 + gx0 * cw; let fy = y0 + gy0 * ch;
      if (fw < bw * 0.12) { fx -= (bw * 0.12 - fw) / 2; fw = bw * 0.12; }
      if (fh < bh * 0.12) { fy -= (bh * 0.12 - fh) / 2; fh = bh * 0.12; }
      box = [fx, fy, fw, fh];
    }
    a._focus = { cut: k, box };
    return box;
  };
  /* A 3D piece framed on its body (fit 'focus') must not show strokes that are mostly outside that frame: a ground plane's edge
     cut by the plate edge reads as a partial line poking in. focusSvg(text) returns the SVG text without every <path>, <polyline>,
     <polygon> or <circle> whose ink lies mostly (> 60 % of its length) outside the focus box grown by 25 % of its size each side;
     the text itself when nothing is dropped. */
  const focusSvg = (text) => {
    const src = String(text || '');
    let a; try { a = parseArtSvg(src); } catch (_) { return src; }
    if (!a || !a.polys.length) return src;
    const [fx, fy, fw, fh] = focusInfo(a);
    const gx = fw * 0.25, gy = fh * 0.25; const x0 = fx - gx, x1 = fx + fw + gx, y0 = fy - gy, y1 = fy + fh + gy;
    const wrap = (tag) => `<svg viewBox="${a.vb.join(' ')}"><g stroke-width="0.3">${tag}</g></svg>`;
    let dropped = 0;
    const out = src.replace(/<(?:path|polyline|polygon|circle)\b[^>]*>/g, (tag) => {
      const e = parseArtSvg(wrap(tag)); let L = 0; let outL = 0;
      for (const P of e.polys) for (let i = 2; i < P.length; i += 2) {
        const l = Math.hypot(P[i] - P[i - 2], P[i + 1] - P[i - 1]); const mx = (P[i] + P[i - 2]) / 2; const my = (P[i + 1] + P[i - 1]) / 2;
        L += l; if (mx < x0 || mx > x1 || my < y0 || my > y1) outL += l;
      }
      if (L > 0 && outL / L > 0.6) { dropped += 1; return ''; }
      return tag;
    });
    return dropped ? out : src;
  };
  const inkArea = (a) => { const b = inkInfo(a).box; return Math.max(1e-6, b[2] * b[3]); };

  /* Densest window of size (ww, wh) art units inside the ink box, with a gentle pull to the
     center. Returns the window center as fractions of the ink box. */
  const denseCenter = (a, ww, wh) => {
    const I = inkInfo(a); const [, , bw, bh] = I.box; const G = I.G;
    const gw = Math.max(1, Math.round(ww / bw * G)); const gh = Math.max(1, Math.round(wh / bh * G));
    if (gw >= G && gh >= G) return [0.5, 0.5];
    const S = new Float32Array((G + 1) * (G + 1)); const O = new Float32Array((G + 1) * (G + 1));
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const k = (y + 1) * (G + 1) + x + 1;
        S[k] = I.grid[y * G + x] + S[y * (G + 1) + x + 1] + S[(y + 1) * (G + 1) + x] - S[y * (G + 1) + x];
        O[k] = (I.grid[y * G + x] > 0 ? 1 : 0) + O[y * (G + 1) + x + 1] + O[(y + 1) * (G + 1) + x] - O[y * (G + 1) + x];
      }
    }
    const W2 = Math.min(G, gw), H2 = Math.min(G, gh); let best = -1, bx = 0, by = 0;
    for (let y = 0; y + H2 <= G; y++) {
      for (let x = 0; x + W2 <= G; x++) {
        const v = S[(y + H2) * (G + 1) + x + W2] - S[y * (G + 1) + x + W2] - S[(y + H2) * (G + 1) + x] + S[y * (G + 1) + x];
        const occ = (O[(y + H2) * (G + 1) + x + W2] - O[y * (G + 1) + x + W2] - O[(y + H2) * (G + 1) + x] + O[y * (G + 1) + x]) / (W2 * H2);
        // ink length, weighted by how much of the window actually holds ink (no empty stretches), pulled gently to center
        const cx = (x + W2 / 2) / G - 0.5, cy = (y + H2 / 2) / G - 0.5; const sc = v * (0.4 + 0.6 * occ) * (1 - 0.35 * Math.hypot(cx, cy));
        if (sc > best) { best = sc; bx = x; by = y; }
      }
    }
    return [(bx + W2 / 2) / G, (by + H2 / 2) / G];
  };

  /* The art window [x, y, w, h] (viewBox units) shown in a box of bw x bh px, for fit
     'contain' | 'cover' | 'object' and a frame override { z, cx, cy }. Cover crops the INK extent (so a
     small contained object scales up to fill) and centers on the densest region. 'object' is the
     whole-piece view: the INK box (not the paper) fills the box at its own aspect, centered, so a small
     object on a big sheet is scaled up with nothing cut off (the caller supplies the small pad). */
  const artWindow = (a, bw, bh, fit, frame) => {
    const fr = frame || {}; const z = clamp(num(fr.z, 1) || 1, 0.2, 8); const ar = bw / Math.max(1, bh);
    const hasC = fr.cx !== null && fr.cx !== undefined && fr.cy !== null && fr.cy !== undefined;
    if (fit === 'cover') {
      const [x0, y0, iw, ih] = inkInfo(a).box; let ww, wh;
      if (iw / ih > ar) { wh = ih; ww = ih * ar; } else { ww = iw; wh = iw / ar; }
      ww /= z; wh /= z;
      const c = hasC ? [+fr.cx, +fr.cy] : denseCenter(a, ww, wh);
      let cx = x0 + c[0] * iw; let cy = y0 + c[1] * ih;
      if (ww <= iw) cx = Math.max(x0 + ww / 2, Math.min(x0 + iw - ww / 2, cx)); else if (!hasC) cx = x0 + iw / 2;
      if (wh <= ih) cy = Math.max(y0 + wh / 2, Math.min(y0 + ih - wh / 2, cy)); else if (!hasC) cy = y0 + ih / 2;
      return [cx - ww / 2, cy - wh / 2, ww, wh];
    }
    if (fit === 'object' || fit === 'focus') {
      const [x0, y0, iw, ih] = fit === 'focus' ? focusInfo(a, fr.cut) : inkInfo(a).box; let ww = iw, wh = ih;
      if (iw / ih > ar) wh = iw / ar; else ww = ih * ar;
      ww /= z; wh /= z;
      const cx = x0 + (hasC ? +fr.cx : 0.5) * iw; const cy = y0 + (hasC ? +fr.cy : 0.5) * ih;
      return [cx - ww / 2, cy - wh / 2, ww, wh];
    }
    const [vx, vy, vw, vh] = a.vb; let ww = vw, wh = vh;
    if (vw / vh > ar) wh = vw / ar; else ww = vh * ar;
    ww /= z; wh /= z;
    const cx = vx + (hasC ? +fr.cx : 0.5) * vw; const cy = vy + (hasC ? +fr.cy : 0.5) * vh;
    return [cx - ww / 2, cy - wh / 2, ww, wh];
  };

  /* Raster size policy: layout box x devicePixelRatio x pinch zoom, scale capped at 4,
     longest side capped at 4096 px. The box is the LAYOUT size (clientWidth), never a
     transformed rect, so a tile measured mid-animation is not rasterized small. */
  const rasterPolicy = (o) => {
    const cssWidth = Math.max(1, num(o && o.cssWidth, 1)); const cssHeight = Math.max(1, num(o && o.cssHeight, 1));
    const cap = num(o && o.cap, 4); const maxPx = num(o && o.maxPx, 4096);
    const dpr = num(o && o.dpr, 1) || 1; const zoom = num(o && o.zoom, 1) || 1;
    let scale = clamp(dpr * zoom, 1, cap);
    scale = Math.min(scale, maxPx / Math.max(cssWidth, cssHeight));
    return { scale, width: Math.max(1, Math.round(cssWidth * scale)), height: Math.max(1, Math.round(cssHeight * scale)) };
  };

  /* Stroke length (art units) inside window [x, y, w, h]. Segments are counted by midpoint. */
  const lengthInWindow = (a, win) => {
    const [wx, wy, ww, wh] = win; let L = 0;
    for (const P of a.polys) {
      for (let i = 2; i < P.length; i += 2) {
        const mx = (P[i] + P[i - 2]) / 2, my = (P[i + 1] + P[i - 1]) / 2;
        if (mx >= wx && mx <= wx + ww && my >= wy && my <= wy + wh) L += Math.hypot(P[i] - P[i - 2], P[i + 1] - P[i - 1]);
      }
    }
    return L;
  };

  /* Line weight and opacity tuned to on-screen density. `scale` = CSS px per art unit
     (pass 0 to derive it from a contained fit). With `win`, density is the stroke length
     actually inside the shown window per on-screen area, so a tight crop of a big piece is
     not thinned by ink that is out of frame. */
  const lineLook = (a, w, h, light, scale, win) => {
    const [, , vw, vh] = a.vb;
    const s = scale || Math.min(w / vw, h / vh);
    let dens;
    if (win) dens = lengthInWindow(a, win) * s / Math.max(1, w * h);
    else dens = scale ? a.total / Math.max(1e-6, inkArea(a) * s) : a.total * s / Math.max(1, w * h);
    const lw = Math.max(0.34, Math.min(1.15, 0.46 / Math.sqrt(dens || 1e-6))) * (light ? 1 : 0.92);
    const alpha = Math.max(0.62, Math.min(1, (light ? 1.15 : 1.3) / Math.sqrt(dens || 1e-6)));
    return { lw: Math.round(lw * 1000) / 1000, alpha: Math.round(alpha * 1000) / 1000, s, dens };
  };

  /* The word's REAL ink box from canvas TextMetrics (actualBoundingBox*), padded, so
     descenders and overshoots are never clipped. `baseline` is in the host element's
     coordinates; the result's `left/top` place the canvas in the same coordinates and
     `tx/ty` are the fillText origin inside it. */
  const wordInkBox = (m, o) => {
    const fs = num(o && o.fontSize, 16); const baseline = num(o && o.baseline, fs);
    const pad = num(o && o.pad, 6); const padLeft = num(o && o.padLeft, 4);
    const asc = num(m.actualBoundingBoxAscent, num(m.fontBoundingBoxAscent, fs * 0.92));
    const desc = num(m.actualBoundingBoxDescent, num(m.fontBoundingBoxDescent, fs * 0.24));
    const abl = num(m.actualBoundingBoxLeft, 0); const abr = num(m.actualBoundingBoxRight, 0); const width = num(m.width, 0);
    const left = Math.floor(Math.min(0, -abl) - padLeft);
    const right = Math.ceil(Math.max(width, abr) + pad);
    const top = Math.floor(baseline - asc - pad);
    const bottom = Math.ceil(baseline + desc + pad);
    return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top), tx: -left, ty: baseline - top, glyphHeight: asc + desc };
  };

  /* Pen-plot pacing: 35 % linear + 65 % ease-in-out. */
  const inOut = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const plotEase = (k) => k * 0.35 + inOut(k) * 0.65;

  const api = {
    rasterLib, rasterLibSource: rasterLib.toString(), parseArtSvg, luminance, inkInfo, focusInfo, focusSvg, denseCenter, artWindow,
    rasterPolicy, lineLook, lengthInWindow, wordInkBox, plotEase, inOut,
  };

  if (typeof window !== 'undefined') {
    const Vectura = (window.Vectura = window.Vectura || {});
    Vectura.StartPageArtGeometry = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
