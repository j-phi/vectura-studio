/**
 * PlotJob: pure geometry -> plot job -> G-code (no DOM, no engine dependency).
 *
 *   buildJob(penGroups, { settings, profile, docSize, firmware }) -> job
 *   toGcode(job, profile, opts) -> { lines, penChangeIndices, pathStartIndices, pathCount, bounds, bbox }
 *   frameJob(bbox, profile, opts)      pen-up rectangle trace
 *   testSwatchJob(spec, profile)       speed x pen-down-height patch grid
 *   scaleCheckJob(profile, opts)       100 mm square + 50 mm cross
 *   airPlot(job)                       copy of the job that never lowers the pen
 *   estimate(job, profile)             stats
 *
 * Units are mm. Input polylines are document mm (origin top-left, y down); job paths are
 * machine coordinates relative to the work origin. See docs/plotter-send-spec.md section 4.2 and 10.
 */
(() => {
  const loadSafety = () => {
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      return require('./plot-safety.js');
    }
    return (typeof window !== 'undefined' && window.Vectura && window.Vectura.PlotSafety) || null;
  };
  const loadDefaults = () => {
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      return require('../../config/plotters.js').PLOTTER_DEFAULTS;
    }
    return (typeof window !== 'undefined' && window.Vectura && window.Vectura.PLOTTER_DEFAULTS) || null;
  };
  const safety = () => {
    const s = loadSafety();
    if (!s) throw new Error('PlotJob requires PlotSafety (src/core/plotter/plot-safety.js).');
    return s;
  };

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const num = (v, fallback) => (isNum(v) ? v : fallback);
  const nonNeg = (v, fallback) => (isNum(v) && v >= 0 ? v : fallback);

  const clone = (v) => {
    if (Array.isArray(v)) return v.map(clone);
    if (v && typeof v === 'object') {
      const out = {};
      Object.keys(v).forEach((k) => { out[k] = clone(v[k]); });
      return out;
    }
    return v;
  };
  const merge = (base, over) => {
    const out = clone(base);
    if (!over || typeof over !== 'object') return out;
    Object.keys(over).forEach((k) => {
      const v = over[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
        out[k] = merge(out[k], v);
      } else if (v !== undefined) {
        out[k] = clone(v);
      }
    });
    return out;
  };

  // ---- Number formatting ----
  const fmt = (n, decimals) => {
    const d = Math.max(0, Math.min(6, decimals === undefined ? 3 : decimals));
    let s = Number(n).toFixed(d);
    if (s.indexOf('.') >= 0) s = s.replace(/\.?0+$/, '');
    if (s === '-0' || s === '') s = '0';
    return s;
  };

  // ---- Seeded PRNG ----
  const mulberry32 = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // Runs a generator to completion (the synchronous form of every sliced step below).
  const drive = (it) => { for (;;) { const r = it.next(); if (r.done) return r.value; } };

  // ---- Polyline helpers ----
  const cleanPolyline = (poly) => {
    const out = [];
    if (!Array.isArray(poly)) return out;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      if (!p || !isNum(p.x) || !isNum(p.y)) continue;
      const last = out[out.length - 1];
      if (last && last.x === p.x && last.y === p.y) continue;
      out.push({ x: p.x, y: p.y });
    }
    return out;
  };

  const polyLength = (poly) => {
    let len = 0;
    for (let i = 1; i < poly.length; i++) len += Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y);
    return len;
  };

  // Iterative Ramer-Douglas-Peucker (no recursion: 50k-point paths are fine).
  const rdp = (pts, tol) => {
    const n = pts.length;
    if (n < 3 || !(tol > 0)) return pts;
    const keep = new Uint8Array(n);
    keep[0] = 1;
    keep[n - 1] = 1;
    const stack = [0, n - 1];
    const tol2 = tol * tol;
    while (stack.length) {
      const hi = stack.pop();
      const lo = stack.pop();
      if (hi <= lo + 1) continue;
      const ax = pts[lo].x; const ay = pts[lo].y;
      const dx = pts[hi].x - ax; const dy = pts[hi].y - ay;
      const l2 = dx * dx + dy * dy;
      let maxD = -1; let idx = -1;
      for (let i = lo + 1; i < hi; i++) {
        const px = pts[i].x - ax; const py = pts[i].y - ay;
        let d2;
        if (l2 === 0) {
          d2 = px * px + py * py;
        } else {
          let t = (px * dx + py * dy) / l2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = px - t * dx; const qy = py - t * dy;
          d2 = qx * qx + qy * qy;
        }
        if (d2 > maxD) { maxD = d2; idx = i; }
      }
      if (maxD > tol2) {
        keep[idx] = 1;
        stack.push(lo, idx, idx, hi);
      }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
    return out;
  };

  const q3 = (v) => Math.round(v * 1000);
  const pathKey = (path) => {
    const f = new Array(path.length);
    for (let i = 0; i < path.length; i++) f[i] = q3(path[i].x) + ',' + q3(path[i].y);
    const fwd = f.join('|');
    const rev = f.slice().reverse().join('|');
    return fwd <= rev ? fwd : rev;
  };

  // Greedy nearest-neighbour ordering with reversal, grid-indexed on path endpoints.
  function* nearestNeighbourSortSteps(paths, start) {
    const n = paths.length;
    if (n < 2) return paths.slice();
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const p = paths[i];
      const a = p[0]; const b = p[p.length - 1];
      minX = Math.min(minX, a.x, b.x); maxX = Math.max(maxX, a.x, b.x);
      minY = Math.min(minY, a.y, b.y); maxY = Math.max(maxY, a.y, b.y);
    }
    const w = Math.max(maxX - minX, 1e-6); const h = Math.max(maxY - minY, 1e-6);
    const target = Math.max(1, Math.ceil(Math.sqrt(2 * n)));
    const cell = Math.max(w, h) / target;
    const cols = Math.floor(w / cell) + 1;
    const rows = Math.floor(h / cell) + 1;
    const cells = new Array(cols * rows);
    const cellOf = (x, y) => {
      let cx = Math.floor((x - minX) / cell); let cy = Math.floor((y - minY) / cell);
      cx = cx < 0 ? 0 : cx >= cols ? cols - 1 : cx;
      cy = cy < 0 ? 0 : cy >= rows ? rows - 1 : cy;
      return { cx, cy };
    };
    for (let i = 0; i < n; i++) {
      const p = paths[i];
      for (let e = 0; e < 2; e++) {
        const pt = e === 0 ? p[0] : p[p.length - 1];
        const c = cellOf(pt.x, pt.y);
        const k = c.cy * cols + c.cx;
        (cells[k] || (cells[k] = [])).push(i * 2 + e);
      }
    }
    const used = new Uint8Array(n);
    const maxRing = Math.max(cols, rows);
    const out = [];
    let cur = { x: start.x, y: start.y };
    for (let step = 0; step < n; step++) {
      if (step % 1500 === 1499) yield step;
      const c0 = cellOf(cur.x, cur.y);
      let best = -1; let bestD = Infinity;
      const scan = (cx, cy) => {
        if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return;
        const list = cells[cy * cols + cx];
        if (!list) return;
        for (let j = 0; j < list.length; j++) {
          const entry = list[j];
          const pi = entry >> 1;
          if (used[pi]) continue;
          const p = paths[pi];
          const pt = (entry & 1) === 0 ? p[0] : p[p.length - 1];
          const dx = pt.x - cur.x; const dy = pt.y - cur.y;
          const d = dx * dx + dy * dy;
          if (d < bestD || (d === bestD && entry < best)) { bestD = d; best = entry; }
        }
      };
      for (let r = 0; r <= maxRing; r++) {
        if (r === 0) {
          scan(c0.cx, c0.cy);
        } else {
          for (let dx = -r; dx <= r; dx++) { scan(c0.cx + dx, c0.cy - r); scan(c0.cx + dx, c0.cy + r); }
          for (let dy = -r + 1; dy <= r - 1; dy++) { scan(c0.cx - r, c0.cy + dy); scan(c0.cx + r, c0.cy + dy); }
        }
        if (best >= 0) {
          const reach = r * cell;
          if (bestD <= reach * reach) break;
        }
      }
      const pi = best >> 1;
      used[pi] = 1;
      const p = paths[pi];
      const rev = (best & 1) === 1;
      const oriented = rev ? p.slice().reverse() : p;
      out.push(oriented);
      cur = oriented[oriented.length - 1];
    }
    return out;
  }

  const mergePaths = (paths, tol) => {
    if (!paths.length) return paths;
    const out = [];
    let cur = paths[0].slice();
    const tol2 = tol * tol;
    for (let i = 1; i < paths.length; i++) {
      const next = paths[i];
      const e = cur[cur.length - 1];
      const dx = next[0].x - e.x; const dy = next[0].y - e.y;
      if (dx * dx + dy * dy <= tol2) {
        for (let k = (dx === 0 && dy === 0 ? 1 : 0); k < next.length; k++) cur.push(next[k]);
      } else {
        out.push(cur);
        cur = next.slice();
      }
    }
    out.push(cur);
    return out;
  };

  const shuffle = (arr, seed) => {
    const rnd = mulberry32(seed);
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  };

  const ORDER_MODES = ['optimized', 'document', 'reverse', 'random'];

  // Optimize one pen's polylines (document mm). Deterministic.
  function* optimizeSteps(polylines, optimize, order, seed) {
    const opt = optimize || {};
    const on = opt.enabled !== false;
    let paths = [];
    for (let i = 0; i < polylines.length; i++) {
      const c = cleanPolyline(polylines[i]);
      if (c.length >= 2) paths.push(c);
      if (i % 2000 === 1999) yield i;
    }
    if (on) {
      const simp = nonNeg(opt.simplify, 0);
      if (simp > 0) {
        const simplified = [];
        for (let i = 0; i < paths.length; i++) {
          simplified.push(rdp(paths[i], simp));
          if (i % 400 === 399) yield i;
        }
        paths = simplified.filter((p) => p.length >= 2);
      }
      const minLen = nonNeg(opt.minLength, 0);
      if (minLen > 0) paths = paths.filter((p) => polyLength(p) >= minLen);
      if (opt.dedupe !== false) {
        const seen = new Set();
        const uniq = [];
        for (let i = 0; i < paths.length; i++) {
          const k = pathKey(paths[i]);
          if (!seen.has(k)) { seen.add(k); uniq.push(paths[i]); }
          if (i % 1000 === 999) yield i;
        }
        paths = uniq;
      }
    }
    const mode = ORDER_MODES.includes(order) ? order : 'optimized';
    if (mode === 'reverse') {
      paths = paths.slice().reverse();
    } else if (mode === 'random') {
      paths = shuffle(paths, seed);
    } else {
      if (mode === 'optimized' && on && opt.sort !== false) paths = yield* nearestNeighbourSortSteps(paths, { x: 0, y: 0 });
      yield 'merge';
      if (on && opt.merge !== false) paths = mergePaths(paths, nonNeg(opt.mergeTol, 0.1));
    }
    return paths;
  }
  const optimizePolylines = (polylines, optimize, order, seed) => drive(optimizeSteps(polylines, optimize, order, seed));

  // ---- Placement ----
  // Rotation is clockwise about the document centre, re-anchored to the top-left.
  const rotateDoc = (x, y, w, h, rot) => {
    if (rot === 90) return { x: h - y, y: x };
    if (rot === 180) return { x: w - x, y: h - y };
    if (rot === 270) return { x: y, y: w - x };
    return { x, y };
  };

  const normRotation = (r) => {
    const v = ((Math.round(num(r, 0) / 90) * 90) % 360 + 360) % 360;
    return v;
  };

  // Axis inversion is a sign flip about the work origin (G92 X0 Y0 = sheet top-left), then optional swap.
  const applyAxes = (pt, axes) => {
    const ax = axes || {};
    let x = ax.invertX ? -pt.x : pt.x;
    let y = ax.invertY ? -pt.y : pt.y;
    if (ax.swapXY) { const t = x; x = y; y = t; }
    return { x: x + 0, y: y + 0 };
  };

  /**
   * Build the sheet -> machine transform.
   * area: effective work area {width,height}. axes: {invertX,invertY,swapXY}.
   * Returns { apply(pt) -> pt, scale, rotate, rotatedSize, sheetArea }.
   */
  const makePlacement = (docSize, area, placement, axes) => {
    const p = placement || {};
    const ax = axes || {};
    const w = Math.max(num(docSize && docSize.width, 0), 0);
    const h = Math.max(num(docSize && docSize.height, 0), 0);
    const rot = normRotation(p.rotate);
    const rw = rot === 90 || rot === 270 ? h : w;
    const rh = rot === 90 || rot === 270 ? w : h;
    const sheet = ax.swapXY ? { width: area.height, height: area.width } : { width: area.width, height: area.height };
    const mode = p.mode === 'fit' || p.mode === 'center' ? p.mode : 'document';
    let scale = num(p.scale, 1) > 0 ? num(p.scale, 1) : 1;
    if (mode === 'fit') scale = rw > 0 && rh > 0 ? Math.min(sheet.width / rw, sheet.height / rh) : 1;
    const ox = num(p.offsetX, 0); const oy = num(p.offsetY, 0);
    let tx = ox; let ty = oy;
    if (mode !== 'document') {
      tx += (sheet.width - rw * scale) / 2;
      ty += (sheet.height - rh * scale) / 2;
    }
    const apply = (pt) => {
      const r = rotateDoc(pt.x, pt.y, w, h, rot);
      let x = r.x * scale + tx;
      let y = r.y * scale + ty;
      return applyAxes({ x, y }, ax);
    };
    return { apply, scale, rotate: rot, mode, rotatedSize: { width: rw, height: rh }, sheetArea: sheet, offset: { x: tx, y: ty } };
  };

  // ---- Reload / dip splitting (machine coords) ----
  const splitForReload = (paths, everyMm) => {
    const every = Math.max(1, everyMm);
    const out = [];
    const reloadBefore = [];
    let acc = 0;
    let pending = true;
    const emit = (piece) => {
      if (piece.length < 2) return;
      if (pending) { reloadBefore.push(out.length); pending = false; }
      out.push(piece);
    };
    for (let pi = 0; pi < paths.length; pi++) {
      const path = paths[pi];
      let cur = [path[0]];
      for (let k = 1; k < path.length; k++) {
        let ax = path[k - 1].x; let ay = path[k - 1].y;
        const bx = path[k].x; const by = path[k].y;
        let remain = Math.hypot(bx - ax, by - ay);
        while (acc + remain > every + 1e-9) {
          const d = every - acc;
          const ux = (bx - ax) / remain; const uy = (by - ay) / remain;
          const q = { x: ax + ux * d, y: ay + uy * d };
          cur.push(q);
          emit(cur);
          pending = true;
          cur = [q];
          ax = q.x; ay = q.y;
          remain -= d;
          acc = 0;
        }
        acc += remain;
        cur.push({ x: bx, y: by });
      }
      emit(cur);
    }
    return { paths: out, reloadBefore };
  };

  // ---- Settings resolution ----
  const resolveProfile = (profile, settings) => {
    const S = safety();
    const withOverrides = settings && settings.profileOverrides && Object.keys(settings.profileOverrides).length
      ? merge(profile, settings.profileOverrides)
      : profile;
    return S.normalizeProfile(withOverrides);
  };

  const resolveSettings = (settings) => {
    const defaults = loadDefaults();
    return merge((defaults && defaults.settings) || {}, settings || {});
  };

  const resolvePenSettings = (penCfg, prof, firmware) => {
    const S = safety();
    const cfg = penCfg || {};
    const motion = prof.motion || {};
    const pen = prof.pen || {};
    const up = S.clampZ(pen.up, prof, firmware);
    const down = S.clampZ(isNum(cfg.down) ? cfg.down : pen.down, prof, firmware);
    const rl = cfg.reload || {};
    const everyMm = isNum(rl.everyMm) && rl.everyMm > 0 ? Math.max(1, rl.everyMm) : 0;
    const settings = {
      drawFeed: S.clampFeedXY(isNum(cfg.drawFeed) ? cfg.drawFeed : motion.drawFeed, prof, firmware),
      travelFeed: S.clampFeedXY(isNum(cfg.travelFeed) ? cfg.travelFeed : motion.travelFeed, prof, firmware),
      zFeed: S.clampFeedZ(pen.zFeed, prof, firmware),
      down,
      up,
      downDelay: nonNeg(cfg.downDelay, nonNeg(pen.downDelay, 0)),
      upDelay: nonNeg(cfg.upDelay, nonNeg(pen.upDelay, 0)),
    };
    const reload = everyMm
      ? {
        everyMm,
        position: { x: num(rl.position && rl.position.x, 0), y: num(rl.position && rl.position.y, 0) },
        dips: Math.max(1, Math.min(20, Math.round(num(rl.dips, 1)))),
        dipDepth: S.clampZ(isNum(rl.dipDepth) ? rl.dipDepth : down, prof, firmware),
        dwell: nonNeg(rl.dwell, 0),
      }
      : null;
    return { settings, reload };
  };

  // ---- Stats ----
  const estimate = (job, profile) => {
    const prof = profile || {};
    const fallbackFeed = num(prof.motion && prof.motion.travelFeed, 6000);
    let pos = { x: 0, y: 0 };
    let drawLength = 0; let travelLength = 0; let lifts = 0; let pathCount = 0;
    let drawSec = 0; let travelSec = 0; let zSec = 0;
    const travelTo = (pt, feed) => {
      const d = Math.hypot(pt.x - pos.x, pt.y - pos.y);
      travelLength += d;
      travelSec += (d / Math.max(1, feed)) * 60;
      pos = { x: pt.x, y: pt.y };
    };
    (job.pens || []).forEach((pen) => {
      const s = pen.settings || {};
      const tf = num(s.travelFeed, fallbackFeed);
      const df = num(s.drawFeed, 3000);
      const zf = Math.max(1, num(s.zFeed, num(prof.pen && prof.pen.zFeed, 5000)));
      const zTime = (Math.abs(num(s.down, 0) - num(s.up, 0)) / zf) * 60 * 2 + nonNeg(s.downDelay, 0) + nonNeg(s.upDelay, 0);
      const reloadSet = new Set(pen.reloadBefore || []);
      (pen.paths || []).forEach((path, i) => {
        if (!path || path.length < 2) return;
        if (pen.reload && reloadSet.has(i)) {
          travelTo(pen.reload.position, tf);
          const dz = (Math.abs(num(pen.reload.dipDepth, 0) - num(s.up, 0)) / zf) * 60 * 2 + nonNeg(s.downDelay, 0) + nonNeg(s.upDelay, 0) + nonNeg(pen.reload.dwell, 0);
          zSec += dz * pen.reload.dips;
          lifts += pen.reload.dips;
        }
        travelTo(path[0], tf);
        const len = polyLength(path);
        drawLength += len;
        drawSec += (len / Math.max(1, df)) * 60;
        pos = { x: path[path.length - 1].x, y: path[path.length - 1].y };
        lifts += 1;
        zSec += zTime;
        pathCount += 1;
      });
    });
    if (job.returnToOrigin !== false && pathCount) travelTo({ x: 0, y: 0 }, fallbackFeed);
    return {
      drawLength,
      travelLength,
      penLifts: lifts,
      estSeconds: (drawSec + travelSec) * 1.15 + zSec,
      pathCount,
    };
  };

  const jobBBox = (pens) => {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    pens.forEach((pen) => (pen.paths || []).forEach((path) => path.forEach((pt) => {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    })));
    return minX === Infinity ? null : { minX, minY, maxX, maxY };
  };

  const checkBounds = (pens, area, originOffset) => {
    const S = safety();
    const extra = [];
    pens.forEach((pen) => { if (pen.reload && pen.reload.everyMm > 0) extra.push([pen.reload.position]); });
    const r = S.checkJobBounds({ pens: extra.length ? pens.concat([{ paths: extra }]) : pens }, area, { originOffset: originOffset || { x: 0, y: 0 } });
    return { ok: r.ok, overflow: r.overflow, bbox: r.bbox, ...(r.reason ? { reason: r.reason } : {}) };
  };

  // Assemble the final job object (bbox, stats, bounds) from finished pen entries.
  const finishJob = (pens, ctx) => {
    const job = {
      units: 'mm',
      profileId: ctx.prof.id,
      pens,
      bbox: jobBBox(pens),
      stats: null,
      bounds: null,
      area: ctx.area,
      airPlot: Boolean(ctx.airPlot),
      returnToOrigin: ctx.returnToOrigin !== false,
      penChange: ctx.penChange === 'continue' ? 'continue' : 'pause',
      placement: ctx.placement || null,
      warnings: ctx.warnings || [],
    };
    job.stats = estimate(job, ctx.prof);
    job.originOffset = ctx.originOffset || { x: 0, y: 0 };
    job.bounds = checkBounds(pens, ctx.area, job.originOffset);
    return job;
  };

  const registrationPaths = (bbox, size) => {
    const s = Math.max(1, num(size, 10));
    const cx = bbox.minX + s / 2; const cy = bbox.minY + s / 2;
    return [
      [{ x: cx - s / 2, y: cy }, { x: cx + s / 2, y: cy }],
      [{ x: cx, y: cy - s / 2 }, { x: cx, y: cy + s / 2 }],
    ];
  };

  // ---- buildJob ----
  // Generator form: yields after each pen's optimize/place stage so a caller can slice the work.
  function* buildJobSteps(penGroups, ctx) {
    const S = safety();
    const c = ctx || {};
    const settings = resolveSettings(c.settings);
    const prof = resolveProfile(c.profile || {}, settings);
    const firmware = c.firmware || null;
    const area = S.effectiveWorkArea(prof, firmware);
    const docSize = c.docSize || { width: 0, height: 0 };
    const place = makePlacement(docSize, area, settings.placement, prof.axes);
    const seed = isNum(settings.seed) ? settings.seed : 1;
    const warnings = [];

    let groups = (Array.isArray(penGroups) ? penGroups : []).filter((g) => g && Array.isArray(g.polylines));
    if (Array.isArray(settings.enabledPens)) {
      const en = new Set(settings.enabledPens);
      groups = groups.filter((g) => en.has(g.penId));
    }
    groups = groups.filter((g) => !(settings.pens && settings.pens[g.penId] && settings.pens[g.penId].enabled === false));
    if (Array.isArray(settings.penOrder)) {
      const rank = new Map(settings.penOrder.map((id, i) => [id, i]));
      groups = groups
        .map((g, i) => ({ g, i }))
        .sort((a, b) => {
          const ra = rank.has(a.g.penId) ? rank.get(a.g.penId) : Infinity;
          const rb = rank.has(b.g.penId) ? rank.get(b.g.penId) : Infinity;
          if (ra !== rb) return ra === Infinity ? 1 : rb === Infinity ? -1 : ra - rb;
          return a.i - b.i;
        })
        .map((x) => x.g);
    }

    const regCfg = settings.registrationMark;
    const regOn = regCfg === true || (regCfg && typeof regCfg === 'object' && regCfg.enabled !== false);
    const regSize = regCfg && typeof regCfg === 'object' ? regCfg.size : 10;

    // First pass: optimize + place + passes. The mark needs the combined bbox.
    const stagedAll = [];
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      const penCfg = (settings.pens && settings.pens[g.penId]) || {};
      const order = ORDER_MODES.includes(penCfg.order) ? penCfg.order : 'optimized';
      const optimized = yield* optimizeSteps(g.polylines, settings.optimize, order, (seed ^ Math.imul(gi + 1, 0x9e3779b1)) >>> 0);
      let paths = [];
      for (let i = 0; i < optimized.length; i++) {
        paths.push(optimized[i].map((pt) => place.apply(pt)));
        if (i % 400 === 399) yield i;
      }
      const passes = Math.max(1, Math.min(10, Math.round(num(penCfg.passes, 1))));
      if (passes > 1 && paths.length) {
        const rep = [];
        paths.forEach((p) => {
          for (let k = 0; k < passes; k++) rep.push(penCfg.alternate && k % 2 === 1 ? p.slice().reverse() : p);
        });
        paths = rep;
      }
      stagedAll.push({ g, penCfg, paths, passes });
      yield gi;
    }
    const staged = stagedAll.filter((s) => s.paths.length);

    let markBox = null;
    if (regOn && staged.length) {
      markBox = jobBBox(staged.map((s) => ({ paths: s.paths })));
    }

    const pens = staged.map((s) => {
      let paths = s.paths;
      if (markBox) paths = registrationPaths(markBox, regSize).concat(paths);
      const resolved = resolvePenSettings(s.penCfg, prof, firmware);
      let reloadBefore = [];
      if (resolved.reload) {
        const sp = splitForReload(paths, resolved.reload.everyMm);
        paths = sp.paths;
        reloadBefore = sp.reloadBefore;
      }
      return {
        penId: s.g.penId,
        pen: s.g.pen || { id: s.g.penId },
        settings: resolved.settings,
        passes: s.passes,
        reload: resolved.reload,
        reloadBefore,
        paths,
      };
    });

    const job = finishJob(pens, {
      prof,
      area,
      airPlot: false,
      returnToOrigin: settings.returnToOrigin !== false,
      penChange: settings.penChange === 'continue' ? 'continue' : 'pause',
      originOffset: c.originOffset,
      placement: { mode: place.mode, scale: place.scale, rotate: place.rotate, offsetX: place.offset.x, offsetY: place.offset.y },
      warnings,
    });
    if (settings.airPlot) return airPlot(job);
    return job;
  }

  const buildJob = (penGroups, ctx) => drive(buildJobSteps(penGroups, ctx));

  /**
   * Same result as buildJob, computed in slices so the main thread stays responsive.
   * opts: { isCancelled(): boolean, sliceMs = 8, yieldFn(cb) }. Resolves to the job, or to null when
   * cancelled (a cancelled computation never returns a job). yieldFn defaults to setTimeout 0.
   */
  const buildJobAsync = (penGroups, ctx, opts) => {
    const o = opts || {};
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const sliceMs = isNum(o.sliceMs) ? o.sliceMs : 8;
    const yieldFn = typeof o.yieldFn === 'function' ? o.yieldFn : (cb) => setTimeout(cb, 0);
    const cancelled = () => !!(o.isCancelled && o.isCancelled());
    return new Promise((resolve, reject) => {
      let it;
      try { it = buildJobSteps(penGroups, ctx); } catch (e) { reject(e); return; }
      const pump = () => {
        if (cancelled()) { resolve(null); return; }
        const t0 = now();
        try {
          for (;;) {
            const r = it.next();
            if (r.done) { resolve(cancelled() ? null : r.value); return; }
            if (now() - t0 >= sliceMs) break;
          }
        } catch (e) { reject(e); return; }
        yieldFn(pump);
      };
      pump();
    });
  };

  // ---- airPlot ----
  const airPlot = (job) => {
    const pens = (job.pens || []).map((pen) => {
      const s = Object.assign({}, pen.settings, { down: pen.settings.up });
      const reload = pen.reload ? Object.assign({}, pen.reload, { dipDepth: pen.settings.up }) : pen.reload;
      return Object.assign({}, pen, { settings: s, reload });
    });
    return Object.assign({}, job, { pens, airPlot: true });
  };

  // ---- G-code ----
  const toGcode = (job, profile, opts) => {
    const S = safety();
    const o = opts || {};
    const prof = S.normalizeProfile(profile || {});
    const dec = isNum(prof.gcode && prof.gcode.decimals) ? prof.gcode.decimals : 3;
    const compact = Boolean(prof.gcode && prof.gcode.compact);
    const src = o.airPlot && !job.airPlot ? airPlot(job) : job;
    const mech = prof.pen.mechanism;
    const useTemplates = mech === 'servo' || mech === 'custom';
    const lines = [];
    const penChangeIndices = [];
    const pathStartIndices = [];

    const word = (l, v, d) => l + fmt(v, d === undefined ? dec : d);
    const join = (parts) => parts.join(compact ? '' : ' ');
    const add = (line) => {
      const r = S.classifyCommand(line);
      if (!r.ok) throw new Error('Refusing to emit blocked G-code line "' + line + '": ' + r.reason);
      lines.push(line);
      return lines.length - 1;
    };
    const feedStr = (f) => word('F', f, 2);
    const dwell = (sec) => { if (sec > 0) add(join(['G4', word('P', sec, 3)])); };
    const template = (tpl, z) => String(tpl).replace(/\{z\}/g, fmt(z, dec)).split(/\r?\n/).filter((l) => l.trim());

    let penIsDown = false;
    const penUp = (s) => {
      if (useTemplates) template(prof.pen.servoUp, s.up).forEach(add);
      else add(join(['G1', word('Z', s.up), feedStr(s.zFeed)]));
      dwell(s.upDelay);
      penIsDown = false;
    };
    const penDownTo = (s, z, extraDwell) => {
      if (useTemplates) template(src.airPlot ? prof.pen.servoUp : prof.pen.servoDown, z).forEach(add);
      else add(join(['G1', word('Z', src.airPlot ? s.up : z), feedStr(s.zFeed)]));
      dwell(s.downDelay);
      dwell(extraDwell || 0);
      penIsDown = true;
    };
    const travel = (pt, s) => add(join(['G1', word('X', pt.x), word('Y', pt.y), feedStr(s.travelFeed)]));

    (prof.gcode.preamble || []).forEach(add);
    const first = (src.pens || []).find((p) => p.paths && p.paths.length);
    penUp(first ? first.settings : { up: prof.pen.up, zFeed: prof.pen.zFeed, upDelay: prof.pen.upDelay });

    let lastSettings = first ? first.settings : null;
    let emittedPens = 0;
    (src.pens || []).forEach((pen) => {
      const paths = (pen.paths || []).filter((p) => p && p.length >= 2);
      if (!paths.length) return;
      const s = pen.settings;
      lastSettings = s;
      if (emittedPens > 0 && src.penChange !== 'continue' && o.penChange !== 'continue') penChangeIndices.push(lines.length);
      emittedPens += 1;
      const reloadSet = new Set(pen.reloadBefore || []);
      let rawIndex = 0;
      (pen.paths || []).forEach((path) => {
        const idx = rawIndex++;
        if (!path || path.length < 2) return;
        let startLine = -1;
        if (pen.reload && reloadSet.has(idx)) {
          startLine = travel(pen.reload.position, s);
          for (let d = 0; d < pen.reload.dips; d++) {
            penDownTo(s, pen.reload.dipDepth, pen.reload.dwell);
            penUp(s);
          }
        }
        const t = travel(path[0], s);
        if (startLine < 0) startLine = t;
        pathStartIndices.push(startLine);
        penDownTo(s, s.down, 0);
        for (let i = 1; i < path.length; i++) {
          const parts = ['G1', word('X', path[i].x), word('Y', path[i].y)];
          if (i === 1) parts.push(feedStr(s.drawFeed));
          add(join(parts));
        }
        penUp(s);
      });
    });

    if (penIsDown && lastSettings) penUp(lastSettings);
    (prof.gcode.postamble || []).forEach(add);
    const ret = o.returnToOrigin !== undefined ? o.returnToOrigin : src.returnToOrigin !== false;
    if (ret && pathStartIndices.length) {
      const tf = lastSettings ? lastSettings.travelFeed : S.clampFeedXY(prof.motion.travelFeed, prof, null);
      add(join(['G1', word('X', 0), word('Y', 0), feedStr(tf)]));
    }
    const bounds = o.originOffset ? checkBounds(job.pens || [], job.area || S.effectiveWorkArea(prof, null), o.originOffset) : (job.bounds || null);
    return {
      lines,
      penChangeIndices,
      pathStartIndices,
      pathCount: pathStartIndices.length,
      bounds,
      bbox: job.bbox || null,
    };
  };

  // ---- Machine-coordinate helper jobs ----
  const helperPenSettings = (prof, firmware, cfg) => resolvePenSettings(cfg || {}, prof, firmware).settings;

  const helperCtx = (profile, extra) => {
    const S = safety();
    const prof = S.normalizeProfile(profile || {});
    const area = S.effectiveWorkArea(prof, (extra && extra.firmware) || null);
    return { prof, area };
  };

  const frameJob = (bbox, profile, opts) => {
    const o = opts || {};
    const { prof, area } = helperCtx(profile, o);
    const m = nonNeg(o.margin, 0);
    const b = bbox || { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const x0 = b.minX - m; const y0 = b.minY - m; const x1 = b.maxX + m; const y1 = b.maxY + m;
    const settings = helperPenSettings(prof, o.firmware, { drawFeed: o.feed, travelFeed: o.feed });
    settings.down = settings.up;
    const pens = [{
      penId: 'frame',
      pen: { id: 'frame', name: 'Frame', color: '#888888' },
      settings,
      passes: 1,
      reload: null,
      reloadBefore: [],
      paths: [[{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }]],
    }];
    return finishJob(pens, { prof, area, airPlot: true, returnToOrigin: o.returnToOrigin === true, penChange: 'continue', originOffset: o.originOffset });
  };

  const swatchPaths = (pattern, x, y, size) => {
    const out = [];
    const step = Math.max(0.5, size / 10);
    if (pattern === 'circle') {
      const cx = x + size / 2; const cy = y + size / 2;
      for (let r = size / 2; r > 0.2; r -= step) {
        const n = Math.max(24, Math.ceil(r * 8));
        const ring = [];
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * Math.PI * 2;
          ring.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
        }
        ring[n] = { x: ring[0].x, y: ring[0].y };
        out.push(ring);
      }
    } else if (pattern === 'zigzag') {
      const z = [];
      let k = 0;
      for (let yy = 0; yy <= size + 1e-9; yy += step, k++) {
        const ya = Math.min(y + yy, y + size);
        if (k % 2 === 0) { z.push({ x, y: ya }); z.push({ x: x + size, y: ya }); } else { z.push({ x: x + size, y: ya }); z.push({ x, y: ya }); }
      }
      out.push(z);
    } else {
      for (let yy = 0; yy <= size + 1e-9; yy += step) {
        const ya = Math.min(y + yy, y + size);
        out.push([{ x, y: ya }, { x: x + size, y: ya }]);
      }
    }
    return out;
  };

  const testSwatchJob = (spec, profile) => {
    const sp = spec || {};
    const { prof, area } = helperCtx(profile, sp);
    const speeds = (Array.isArray(sp.rows) && sp.rows.length ? sp.rows : [prof.motion.drawFeed]).filter(isNum).slice(0, 12);
    const heights = (Array.isArray(sp.cols) && sp.cols.length ? sp.cols : [prof.pen.down]).filter(isNum).slice(0, 12);
    const size = Math.max(2, num(sp.size, 15));
    const gap = nonNeg(sp.gap, 5);
    const ox = num(sp.offsetX, 0); const oy = num(sp.offsetY, 0);
    const pattern = ['hatch', 'zigzag', 'circle'].includes(sp.pattern) ? sp.pattern : 'hatch';
    const pens = [];
    speeds.forEach((speed, r) => {
      heights.forEach((h, c) => {
        const settings = helperPenSettings(prof, sp.firmware, { drawFeed: speed, down: h });
        const id = 'swatch-r' + r + '-c' + c;
        pens.push({
          penId: id,
          pen: { id, name: 'F' + settings.drawFeed + ' / Z' + settings.down, color: '#000000' },
          settings,
          passes: 1,
          reload: null,
          reloadBefore: [],
          paths: swatchPaths(pattern, ox + c * (size + gap), oy + r * (size + gap), size)
            .map((path) => path.map((q) => applyAxes(q, prof.axes))),
        });
      });
    });
    return finishJob(pens, { prof, area, airPlot: Boolean(sp.airPlot), returnToOrigin: sp.returnToOrigin !== false, penChange: 'continue', originOffset: sp.originOffset });
  };

  const scaleCheckJob = (profile, opts) => {
    const o = opts || {};
    const { prof, area } = helperCtx(profile, o);
    const x = num(o.offsetX, 0); const y = num(o.offsetY, 0);
    const settings = helperPenSettings(prof, o.firmware, {});
    const pens = [{
      penId: 'scale-check',
      pen: { id: 'scale-check', name: 'Scale check', color: '#000000' },
      settings,
      passes: 1,
      reload: null,
      reloadBefore: [],
      paths: [
        [{ x, y }, { x: x + 100, y }, { x: x + 100, y: y + 100 }, { x, y: y + 100 }, { x, y }],
        [{ x: x + 25, y: y + 50 }, { x: x + 75, y: y + 50 }],
        [{ x: x + 50, y: y + 25 }, { x: x + 50, y: y + 75 }],
      ].map((path) => path.map((q) => applyAxes(q, prof.axes))),
    }];
    return finishJob(pens, { prof, area, returnToOrigin: o.returnToOrigin !== false, penChange: 'continue', originOffset: o.originOffset });
  };

  const placePolylines = (polylines, docSize, area, placement, axes) => {
    const pl = makePlacement(docSize, area, placement, axes);
    return polylines.map((p) => p.map((pt) => pl.apply(pt)));
  };

  const api = {
    buildJob,
    buildJobAsync,
    toGcode,
    frameJob,
    testSwatchJob,
    scaleCheckJob,
    airPlot,
    estimate,
    optimizePolylines,
    placePolylines,
    makePlacement,
    applyAxes,
    mulberry32,
    formatNumber: fmt,
  };

  if (typeof window !== 'undefined') {
    const Vectura = (window.Vectura = window.Vectura || {});
    Vectura.PlotJob = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
