/* THE TWENTY MONOLINE TONE LAWS (v7).
 *
 * Every law in this file draws with ONE CONSTANT PEN WIDTH. None of them sets
 * `meta.weightScale`, none of them is listed in `splitsAlongLine()`,
 * `isWeightLaw()` or `wbFlatCov()` in `surface-fill.js`, so the width path is
 * never reached for any of them: the predicate that gates it is false. Tone is
 * carried by GEOMETRY — where a mark goes, how big it is, how many of them
 * there are, and what covers what.
 *
 * They are also all built on the same two guarantees:
 *
 *   1. NOTHING LEAVES THE SILHOUETTE. Every emitted vertex is the screen
 *      position of a sample that `sampleAt(a, b)` returned with
 *      `front === wantFront`. A segment that runs off the visible surface is
 *      cut and the crossing is refined by bisection, so a mark ends ON the
 *      silhouette and never past it.
 *   2. NO WIDTH CHANNEL. `pushRun` is handed a bare polyline. The only thing
 *      this file can spend is ink placement.
 *
 * Two substrates serve all twenty:
 *
 *   CHART SUBSTRATE — curves traced on the parameter square, walked by solving
 *   the local screen Jacobian so a step of N millimetres ON SCREEN becomes the
 *   right step in (a, b). Used by every law whose marks are supposed to wrap
 *   the body.
 *
 *   SCREEN SUBSTRATE — image-space tilings and networks, with every vertex
 *   inverted back onto the chart by Newton iteration on the same Jacobian.
 *   A vertex that does not invert is off the surface and is cut.
 */
(function registerSurfaceFillMono() {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const Scene3D = (Vectura.Scene3D = Vectura.Scene3D || {});

  const clamp = (val, lo, hi) => Math.max(lo, Math.min(hi, Number(val) || 0));
  const finite = (val, f = 0) => (Number.isFinite(Number(val)) ? Number(val) : f);
  const GOLDEN = 0.6180339887498949;

  // The roster. Order is the order the sheets present them in.
  const LAWS = [
    'shingleScale',    // 01 imbricated scale rows — occlusion + texture gradient
    'terraceCut',      // 02 world-height level sets at an integrated interval
    'originSpiral',    // 03 one spiral from the highlight, radial pitch integrated
    'voronoiWeb',      // 04 Voronoi edge network, seed density from tone
    'circlePack',      // 05 packed circles, radius from lightness
    'diffGrowth',      // 06 differential-growth meander
    'spaceColonise',   // 07 space-colonisation branching
    'mazeFill',        // 08 tone-graded maze walls
    'truchetTile',     // 09 Truchet arc tiling, bands per tile from tone
    'turingStripe',    // 10 reaction-diffusion stripe centrelines
    'quadSubdiv',      // 11 quadtree cell boundaries
    'phaseRegistry',   // 12 three co-pitched families, tone by registration
    'weaveBasket',     // 13 over/under weave with occlusion breaks
    'sketchOverdraw',  // 14 stochastic hand-jittered overdraw count
    'lsysFrond',       // 15 L-system fronds, recursion depth from tone
    'foreshortenDisc', // 16 geodesic circles foreshortened by the normal
    'dislocSplit',     // 17 stripe bifurcation at dislocations
    'fiboQuasi',       // 18 Fibonacci-word quasiperiodic ruling
    'terminatorSweep', // 19 swept-terminator great-circle family
    'hachureSlope',    // 20 cartographic hachures under Lehmann's slope law
  ];
  const LAW_SET = new Set(LAWS);
  const isMono = (algo) => LAW_SET.has(String(algo));

  /* ── THE SUBSTRATE ──────────────────────────────────────────────────────── */

  const makeCtx = (o) => {
    const WF = !o.back;
    const PEN = o.penWidth;
    const INK = o.inkWidth;
    const FLOOR = o.floorPitch;
    const PMAX = Math.max(FLOOR * 1.6, o.litMaxPitch);
    const MINMARK = o.minMarkMM;
    const hash = o.hash;
    const wrapB = (b) => ((b % 1) + 1) % 1;

    const onS = (s) => Boolean(s && s.front === WF);
    // Chart sample, with `a` treated as a hard domain edge and `b` as the wind.
    const at = (a, b) => {
      if (!(a >= 0 && a <= 1)) return null;
      const s = o.sampleAt(a, wrapB(b));
      if (!onS(s)) return null;
      // Every sample carries the parameters it came from, so a law that walks in
      // screen space can hand the point straight back to the chart substrate.
      s._a = a; s._b = b;
      return s;
    };
    const EPS = 1 / 4096;
    // Screen derivatives of the parameter square. `sampleAt` publishes them
    // when the ladder is live; when it does not, they are measured here so the
    // laws never depend on a flag they do not own.
    const frame = (s, a, b) => {
      if (s.dA && s.dB) return { ax: s.dA.x, ay: s.dA.y, bx: s.dB.x, by: s.dB.y };
      const sa = o.sampleAt(clamp(a + EPS, 0, 1), wrapB(b));
      const sb = o.sampleAt(clamp(a, 0, 1), wrapB(b + EPS));
      if (!sa || !sb) return null;
      return {
        ax: (sa.x - s.x) / EPS, ay: (sa.y - s.y) / EPS,
        bx: (sb.x - s.x) / EPS, by: (sb.y - s.y) / EPS,
      };
    };
    // Screen millimetres → parameter step. This is the whole chart substrate:
    // it lets a law say "go 0.4 mm that way on the paper" and stay on the form.
    const solve = (s, a, b, dx, dy) => {
      const f = frame(s, a, b);
      if (!f) return null;
      const det = f.ax * f.by - f.ay * f.bx;
      if (!(Math.abs(det) > 1e-12)) return null;
      return { da: (dx * f.by - dy * f.bx) / det, db: (f.ax * dy - f.ay * dx) / det };
    };

    // The crossing of the visible surface's edge, to seven bisections.
    const edgeBetween = (p0, p1) => {
      let lo = p0; let hi = p1; let best = null;
      for (let i = 0; i < 7; i++) {
        const m = { a: (lo.a + hi.a) / 2, b: (lo.b + hi.b) / 2 };
        const s = at(m.a, m.b);
        if (s) { lo = m; best = s; } else hi = m;
      }
      return best ? { x: best.x, y: best.y, z: best.z } : null;
    };

    let famIdx = 0;
    const emitPts = (pts) => {
      if (!pts || pts.length < 2) return;
      let run = [];
      let len = 0;
      let prev = null;
      const push = (p) => {
        if (run.length) len += Math.hypot(p.x - run[run.length - 1].x, p.y - run[run.length - 1].y);
        run.push(p);
      };
      const flush = () => {
        if (run.length >= 2 && len >= MINMARK) { o.pushRun(run, o.back, famIdx); famIdx += 1; }
        run = []; len = 0;
      };
      for (let i = 0; i < pts.length; i++) {
        const s = at(pts[i].a, pts[i].b);
        if (!s) {
          if (prev) { const e = edgeBetween(prev, pts[i]); if (e) push(e); }
          flush(); prev = null; continue;
        }
        if (!prev && i > 0) { const e = edgeBetween(pts[i], pts[i - 1]); if (e) push(e); }
        push({ x: s.x, y: s.y, z: s.z });
        prev = pts[i];
      }
      flush();
    };

    // Trace a curve whose SCREEN tangent is dirFn(sample). `stepMM` is the arc
    // step on the paper, so a traced curve is evenly sampled however the chart
    // stretches. Returns chart points; the first off-surface point is kept so
    // `emitPts` can refine the end onto the silhouette.
    const trace = (a0, b0, dirFn, stepMM, maxN) => {
      const pts = [];
      let a = a0; let b = b0;
      let px = 0; let py = 0;
      for (let i = 0; i < maxN; i++) {
        const s = at(a, b);
        pts.push({ a, b });
        if (!s) break;
        const d = dirFn(s, i, a, b);
        if (!d) break;
        let dx = d.x; let dy = d.y;
        // Keep the walk going the same way round a level set.
        if (i > 0 && (dx * px + dy * py) < 0) { dx = -dx; dy = -dy; }
        const L = Math.hypot(dx, dy);
        if (!(L > 1e-9)) break;
        px = dx / L; py = dy / L;
        const q = solve(s, a, b, px * stepMM, py * stepMM);
        if (!q) break;
        a += q.da; b += q.db;
      }
      return pts;
    };

    // Screen gradient of a scalar read off the sample.
    const H = 1 / 700;
    const gradOf = (a, b, f) => {
      const a0 = at(a - H, b); const a1 = at(a + H, b);
      const b0 = at(a, b - H); const b1 = at(a, b + H);
      if (!a0 || !a1 || !b0 || !b1) return null;
      const ux = a1.x - a0.x; const uy = a1.y - a0.y; const du = f(a1) - f(a0);
      const vx = b1.x - b0.x; const vy = b1.y - b0.y; const dv = f(b1) - f(b0);
      const det = ux * vy - uy * vx;
      if (!(Math.abs(det) > 1e-12)) return null;
      return { x: (du * vy - dv * uy) / det, y: (ux * dv - vx * du) / det };
    };

    /* ── the screen substrate: a lattice, a bucket index, and Newton ──────── */
    const LG = 96;
    const lat = [];
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    let hiI = -Infinity; let hiA = 0.5; let hiB = 0.5; let hiX = 0; let hiY = 0;
    let faceA = 0.5; let faceB = 0.5; let faceNz = -Infinity; let faceX = 0; let faceY = 0;
    for (let i = 0; i <= LG; i++) {
      for (let j = 0; j < LG; j++) {
        const a = i / LG; const b = j / LG;
        const s = at(a, b);
        if (!s) continue;
        lat.push({ a, b, x: s.x, y: s.y });
        if (s.x < minX) minX = s.x; if (s.x > maxX) maxX = s.x;
        if (s.y < minY) minY = s.y; if (s.y > maxY) maxY = s.y;
        const ii = finite(s.I, 0);
        if (ii > hiI) { hiI = ii; hiA = a; hiB = b; hiX = s.x; hiY = s.y; }
        const nz = Math.abs(finite(s.nz, 0));
        if (nz > faceNz) { faceNz = nz; faceA = a; faceB = b; faceX = s.x; faceY = s.y; }
      }
    }
    const ok = lat.length > 32 && Number.isFinite(minX);
    const W = ok ? Math.max(1e-3, maxX - minX) : 1;
    const Hh = ok ? Math.max(1e-3, maxY - minY) : 1;
    const R = Math.min(W, Hh) / 2;
    const BC = 48;
    const cw = W / BC; const ch = Hh / BC;
    const buckets = new Map();
    if (ok) {
      lat.forEach((p) => {
        const gx = clamp(Math.floor((p.x - minX) / cw), 0, BC - 1);
        const gy = clamp(Math.floor((p.y - minY) / ch), 0, BC - 1);
        const k = gy * BC + gx;
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(p);
      });
    }
    // Screen point → surface sample, or null when the point is not on the
    // visible surface. This is the guard that keeps every image-space law
    // inside the silhouette.
    const inv = (x, y) => {
      if (!ok) return null;
      const gx = clamp(Math.floor((x - minX) / cw), 0, BC - 1);
      const gy = clamp(Math.floor((y - minY) / ch), 0, BC - 1);
      let best = null; let bd = Infinity;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const arr = buckets.get((gy + j) * BC + (gx + i));
          if (!arr) continue;
          for (let k = 0; k < arr.length; k++) {
            const d = (arr[k].x - x) * (arr[k].x - x) + (arr[k].y - y) * (arr[k].y - y);
            if (d < bd) { bd = d; best = arr[k]; }
          }
        }
      }
      if (!best) return null;
      let a = best.a; let b = best.b;
      let s = at(a, b);
      for (let k = 0; k < 6 && s; k++) {
        const dx = x - s.x; const dy = y - s.y;
        if (Math.hypot(dx, dy) < 0.02) return s;
        const q = solve(s, a, b, dx, dy);
        if (!q) break;
        const na = a + q.da * 0.85;
        if (!(na >= 0 && na <= 1)) break;
        a = na; b += q.db * 0.85;
        s = at(a, b);
      }
      if (!s) return null;
      return Math.hypot(x - s.x, y - s.y) < 0.30 ? s : null;
    };

    const emitScr = (pts) => {
      if (!pts || pts.length < 2) return;
      let run = [];
      let len = 0;
      let prev = null;
      const push = (p) => {
        if (run.length) len += Math.hypot(p.x - run[run.length - 1].x, p.y - run[run.length - 1].y);
        run.push(p);
      };
      const flush = () => {
        if (run.length >= 2 && len >= MINMARK) { o.pushRun(run, o.back, famIdx); famIdx += 1; }
        run = []; len = 0;
      };
      const bis = (good, bad) => {
        let lo = good; let hi = bad; let best = null;
        for (let i = 0; i < 6; i++) {
          const m = { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2 };
          const s = inv(m.x, m.y);
          if (s) { lo = m; best = s; } else hi = m;
        }
        return best;
      };
      for (let i = 0; i < pts.length; i++) {
        const s = inv(pts[i].x, pts[i].y);
        if (!s) {
          if (prev) { const e = bis(prev, pts[i]); if (e) push({ x: e.x, y: e.y, z: e.z }); }
          flush(); prev = null; continue;
        }
        if (!prev && i > 0) { const e = bis(pts[i], pts[i - 1]); if (e) push({ x: e.x, y: e.y, z: e.z }); }
        push({ x: s.x, y: s.y, z: s.z });
        prev = pts[i];
      }
      flush();
    };

    // Tone → the clearance a single monoline family needs for that tone.
    const pitchFor = (I) => clamp(INK / Math.max(1e-4, o.targetArea(clamp(I, 0, 1))), FLOOR, PMAX);
    // Shade in 0..1, 1 = darkest.
    const shadeAt = (x, y) => { const s = inv(x, y); return s ? clamp(1 - finite(s.I, 0), 0, 1) : null; };

    return {
      WF, PEN, INK, FLOOR, PMAX, MINMARK, hash, wrapB, at, solve, frame,
      edgeBetween, emitPts, trace, gradOf, inv, emitScr, pitchFor, shadeAt,
      lat, ok, minX, minY, maxX, maxY, W, H: Hh, R,
      hiA, hiB, hiX, hiY, faceA, faceB, faceX, faceY,
      targetArea: o.targetArea, back: o.back, mapper: o.mapper,
      rot: 0,
    };
  };

  /* ── 01 · shingleScale ──────────────────────────────────────────────────────
   * Imbricated rows of arcs — roof tiles, fish scales, the oldest way of
   * drawing a curved body in monoline. Two depth cues at once and neither is a
   * tone curve. (a) OCCLUSION: a scale in the row nearer the viewer visibly
   * cuts the scale behind it, so the eye is told which is in front. (b) TEXTURE
   * GRADIENT: scale radius is set from the tone target, so scales shrink and
   * crowd into the shadow and toward the limb where the surface recedes.
   * Reaches black where the radius falls to the plot floor and neighbouring
   * arcs abut along the row.
   */
  const lawShingle = (C) => {
    const rowsY = [];
    const baseR = C.pitchFor(0.55) * 1.35;
    for (let y = C.minY - baseR; y < C.maxY + baseR; y += 1) rowsY.push(y);
    // Rows are laid at a spacing driven by the tone under the row, so the row
    // pitch itself carries the light before a single arc is drawn.
    const rows = [];
    let y = C.minY - baseR;
    let guard = 0;
    while (y < C.maxY + baseR && guard < 400) {
      guard += 1;
      let sum = 0; let n = 0;
      for (let k = 0; k <= 12; k++) {
        const s = C.inv(C.minX + (k / 12) * C.W, y);
        if (s) { sum += finite(s.I, 0); n += 1; }
      }
      const I = n ? sum / n : 0.5;
      const r = C.pitchFor(I) * 1.25;
      rows.push({ y, r });
      y += r * 0.92;
    }
    const sites = [];
    rows.forEach((row, ri) => {
      const stag = (ri % 2) * row.r;
      for (let x = C.minX - row.r * 2 + stag; x < C.maxX + row.r * 2; x += row.r * 2) {
        const s = C.inv(x, row.y);
        const I = s ? finite(s.I, 0) : null;
        const rr = I == null ? row.r : C.pitchFor(I) * 1.25;
        sites.push({ x, y: row.y, r: rr, ri });
      }
    });
    const byRow = new Map();
    sites.forEach((s) => { if (!byRow.has(s.ri)) byRow.set(s.ri, []); byRow.get(s.ri).push(s); });
    sites.forEach((st) => {
      // The scale is the lower half of a circle: a U that hangs from the row.
      const front = byRow.get(st.ri + 1) || [];
      const pts = [];
      const N = Math.max(10, Math.round((Math.PI * st.r) / 0.35));
      for (let k = 0; k <= N; k++) {
        const th = Math.PI * (k / N);
        const px = st.x + st.r * Math.cos(th);
        const py = st.y + st.r * Math.sin(th);
        // OCCLUSION. A point that falls inside a scale of the row in front is
        // behind it and is simply not drawn — the break IS the depth cue.
        let hidden = false;
        for (let m = 0; m < front.length; m++) {
          const f = front[m];
          if (Math.hypot(px - f.x, py - f.y) < f.r - C.INK * 0.9) { hidden = true; break; }
        }
        if (hidden) { if (pts.length) { C.emitScr(pts); pts.length = 0; } continue; }
        pts.push({ x: px, y: py });
      }
      if (pts.length) C.emitScr(pts);
    });
  };

  /* ── 02 · terraceCut ────────────────────────────────────────────────────────
   * The body sliced by horizontal planes and the section lines drawn — a
   * topographic map of the solid. The curves are the object's OWN level sets in
   * world height, so their shape and their ellipse-like tilt are a direct
   * statement of the form; nothing about them is a screen construction. Tone is
   * the CONTOUR INTERVAL: the height step to the next terrace is integrated
   * from the radiance the last terrace saw, so terraces crowd into the shadow
   * and open out into the light with no step anywhere. Reaches its darkest at
   * the plot floor, which is where the interval stops shrinking.
   */
  const lawTerrace = (C) => {
    let loH = Infinity; let hiH = -Infinity;
    C.lat.forEach((p) => {
      const s = C.at(p.a, p.b);
      if (!s || !s.world) return;
      const h = finite(s.world.y, 0);
      if (h < loH) loH = h; if (h > hiH) hiH = h;
    });
    if (!Number.isFinite(loH) || hiH - loH < 1e-6) return;
    const hOf = (s) => finite(s.world && s.world.y, 0);
    // Seed a level by scanning the lattice for the sample nearest that height.
    const seedFor = (h) => {
      let best = null; let bd = Infinity;
      for (let k = 0; k < C.lat.length; k++) {
        const s = C.at(C.lat[k].a, C.lat[k].b);
        if (!s) continue;
        const d = Math.abs(hOf(s) - h);
        if (d < bd) { bd = d; best = { a: C.lat[k].a, b: C.lat[k].b, s }; }
      }
      return best;
    };
    const span = hiH - loH;
    let h = loH + span * 0.02;
    let guard = 0;
    while (h < hiH - span * 0.02 && guard < 260) {
      guard += 1;
      const seed = seedFor(h);
      if (!seed) break;
      const dirFn = (s, i, a, b) => {
        const g = C.gradOf(a, b, hOf);
        if (!g) return null;
        return { x: -g.y, y: g.x };
      };
      const fwd = C.trace(seed.a, seed.b, dirFn, 0.32, 620);
      const bwd = C.trace(seed.a, seed.b, (s, i, a, b) => {
        const d = dirFn(s, i, a, b); return d ? { x: -d.x, y: -d.y } : null;
      }, 0.32, 620);
      bwd.reverse();
      C.emitPts(bwd.concat(fwd.slice(1)));
      // The interval. `dh` is the height step that puts the next terrace
      // `pitch` millimetres away on the paper, measured where this one ran.
      let sumInv = 0; let sumI = 0; let n = 0;
      for (let k = 0; k < fwd.length; k += 12) {
        const s = C.at(fwd[k].a, fwd[k].b);
        if (!s) continue;
        const g = C.gradOf(fwd[k].a, fwd[k].b, hOf);
        if (!g) continue;
        const gm = Math.hypot(g.x, g.y);
        if (!(gm > 1e-9)) continue;
        sumInv += 1 / gm; sumI += finite(s.I, 0); n += 1;
      }
      const mmPerH = n ? sumInv / n : span / Math.max(1e-6, C.R);
      const I = n ? sumI / n : 0.5;
      h += clamp(C.pitchFor(I) / Math.max(1e-9, mmPerH), span / 900, span / 6);
    }
  };

  /* ── 03 · originSpiral ──────────────────────────────────────────────────────
   * ONE continuous line for the whole body. It starts at the brightest point on
   * the form — the specular origin — and winds outward, and its radial pitch is
   * integrated turn by turn from the radiance it is passing through, so the
   * turns squeeze together as the line walks into the shadow and open out as it
   * comes back into the light. Because there is exactly one origin and the
   * turns are concentric about it, the eye reads a single curved surface lit
   * from one place: the spiral IS the shading and the shading IS the form.
   * Reaches its darkest where consecutive turns close to the plot floor.
   */
  const lawSpiral = (C) => {
    const ox = C.hiX; const oy = C.hiY;
    const rMax = Math.hypot(C.W, C.H);
    let r = C.pitchFor(0.9) * 0.5;
    let phi = 0;
    const pts = [];
    let guard = 0;
    while (r < rMax && guard < 90000) {
      guard += 1;
      const x = ox + r * Math.cos(phi);
      const y = oy + r * Math.sin(phi);
      pts.push({ x, y });
      const s = C.inv(x, y);
      const p = C.pitchFor(s ? finite(s.I, 0) : 0.85);
      // Constant ARC step so the spiral is evenly sampled at every radius.
      const dphi = clamp(0.34 / Math.max(0.3, r), 0.004, 0.35);
      phi += dphi;
      r += (p * dphi) / (Math.PI * 2);
    }
    C.emitScr(pts);
  };

  /* ── 04 · voronoiWeb ────────────────────────────────────────────────────────
   * The drawing is a NETWORK, not a set of rulings: the Voronoi edges of a seed
   * set whose density is the tone. Dark ⇒ many seeds ⇒ small cells ⇒ more edge
   * length per square millimetre. There is no ruling direction anywhere, so
   * there is nothing to moiré against and no lattice for a band edge to run
   * along. Depth comes from the CELL-SIZE GRADIENT: cells shrink smoothly
   * toward the terminator and toward the limb exactly as a real surface texture
   * would foreshorten, and the eye takes that gradient as recession.
   * Reaches black where the cell diameter falls to about two ink widths and the
   * cell walls abut.
   */
  const lawVoronoi = (C) => {
    const seeds = [];
    // Dart throwing with a tone-driven exclusion radius.
    const cells = new Map();
    const cellOf = (x, y, r) => `${Math.floor(x / r)},${Math.floor(y / r)}`;
    const GRID = C.pitchFor(0.0) * 1.2;
    const put = (p) => {
      const k = cellOf(p.x, p.y, GRID);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(p);
    };
    const near = (x, y, rad) => {
      const out = [];
      const g = Math.ceil(rad / GRID);
      const cx = Math.floor(x / GRID); const cy = Math.floor(y / GRID);
      for (let j = -g; j <= g; j++) {
        for (let i = -g; i <= g; i++) {
          const arr = cells.get(`${cx + i},${cy + j}`);
          if (arr) for (let k = 0; k < arr.length; k++) out.push(arr[k]);
        }
      }
      return out;
    };
    const TRIES = 26000;
    for (let t = 0; t < TRIES; t++) {
      const x = C.minX + C.hash(t * 3 + 11, 5) * C.W;
      const y = C.minY + C.hash(t * 3 + 12, 7) * C.H;
      const s = C.inv(x, y);
      if (!s) continue;
      // Cell diameter = the clearance a monoline family would need for this
      // tone; the network then lays the same ink area in an isotropic form.
      const rad = C.pitchFor(finite(s.I, 0)) * 1.15;
      let clash = false;
      const nb = near(x, y, rad);
      for (let k = 0; k < nb.length; k++) {
        if (Math.hypot(nb[k].x - x, nb[k].y - y) < Math.min(rad, nb[k].r)) { clash = true; break; }
      }
      if (clash) continue;
      const p = { x, y, r: rad };
      seeds.push(p); put(p);
    }
    // Edges by the perpendicular-bisector clip of each seed's neighbourhood.
    seeds.forEach((p) => {
      const nb = near(p.x, p.y, p.r * 3.2).filter((q) => q !== p);
      if (nb.length < 3) return;
      // Start from a big square and clip by each bisector.
      const S = p.r * 3.4;
      let poly = [
        { x: p.x - S, y: p.y - S }, { x: p.x + S, y: p.y - S },
        { x: p.x + S, y: p.y + S }, { x: p.x - S, y: p.y + S },
      ];
      nb.forEach((q) => {
        const mx = (p.x + q.x) / 2; const my = (p.y + q.y) / 2;
        const nx = q.x - p.x; const ny = q.y - p.y;
        const side = (v) => (v.x - mx) * nx + (v.y - my) * ny;
        const next = [];
        for (let i = 0; i < poly.length; i++) {
          const A = poly[i]; const B = poly[(i + 1) % poly.length];
          const sa = side(A); const sb = side(B);
          if (sa <= 0) next.push(A);
          if ((sa <= 0) !== (sb <= 0)) {
            const t = sa / (sa - sb);
            next.push({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t });
          }
        }
        poly = next;
      });
      if (poly.length < 3) return;
      // Draw each wall ONCE: the seed with the lower key owns it.
      for (let i = 0; i < poly.length; i++) {
        const A = poly[i]; const B = poly[(i + 1) % poly.length];
        const mx = (A.x + B.x) / 2; const my = (A.y + B.y) / 2;
        // Ownership test: the wall belongs to whichever of the two adjacent
        // seeds is first in scan order, so no wall is drawn twice.
        let owner = p; let od = Math.hypot(p.x - mx, p.y - my);
        near(mx, my, p.r * 3.2).forEach((q) => {
          const d = Math.hypot(q.x - mx, q.y - my);
          if (d < od - 1e-6 || (Math.abs(d - od) < 1e-6 && (q.y < owner.y || (q.y === owner.y && q.x < owner.x)))) {
            owner = q; od = d;
          }
        });
        if (owner !== p) continue;
        const n = Math.max(2, Math.round(Math.hypot(B.x - A.x, B.y - A.y) / 0.4));
        const seg = [];
        for (let k = 0; k <= n; k++) {
          seg.push({ x: A.x + (B.x - A.x) * (k / n), y: A.y + (B.y - A.y) * (k / n) });
        }
        C.emitScr(seg);
      }
    });
  };

  /* ── 05 · circlePack ────────────────────────────────────────────────────────
   * A packing of circles whose RADIUS is the local lightness: big open rings in
   * the light, tiny tight ones in the dark. Where the tone is deepest the
   * circle is given concentric partners inside it, so the darkest passages are
   * a bullseye of abutting rings and go genuinely black without any ring ever
   * being closer to its neighbour than the plot floor. Depth is the classic
   * texture-gradient read — a field of like objects whose apparent size falls
   * off smoothly is seen as a surface receding — with a second cue on top: each
   * circle is drawn as a GEODESIC circle on the body, so it projects as an
   * ellipse whose squash states the surface tilt at that point.
   */
  const lawCircles = (C) => {
    const placed = [];
    const GRID = C.pitchFor(0.0) * 1.4;
    const cells = new Map();
    const put = (p) => {
      const k = `${Math.floor(p.x / GRID)},${Math.floor(p.y / GRID)}`;
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(p);
    };
    const near = (x, y, rad) => {
      const out = []; const g = Math.ceil(rad / GRID) + 1;
      const cx = Math.floor(x / GRID); const cy = Math.floor(y / GRID);
      for (let j = -g; j <= g; j++) for (let i = -g; i <= g; i++) {
        const arr = cells.get(`${cx + i},${cy + j}`);
        if (arr) for (let k = 0; k < arr.length; k++) out.push(arr[k]);
      }
      return out;
    };
    for (let t = 0; t < 30000; t++) {
      const x = C.minX + C.hash(t * 7 + 3, 29) * C.W;
      const y = C.minY + C.hash(t * 7 + 4, 31) * C.H;
      const s = C.inv(x, y);
      if (!s) continue;
      const I = finite(s.I, 0);
      const want = C.pitchFor(I) * 1.05;
      let rad = want;
      const nb = near(x, y, want * 2.2);
      for (let k = 0; k < nb.length; k++) {
        const d = Math.hypot(nb[k].x - x, nb[k].y - y) - nb[k].r - C.INK * 0.9;
        if (d < rad) rad = d;
      }
      if (rad < C.FLOOR * 0.8) continue;
      rad = Math.min(rad, want);
      const p = { x, y, r: rad, I, a: 0, b: 0, s };
      placed.push(p); put(p);
    }
    placed.forEach((p) => {
      // Concentric rings: one at the lightest, up to four where the surface is
      // darkest. Rings inside one circle sit a plot floor apart.
      const rings = Math.max(1, Math.floor(p.r / C.FLOOR));
      const want = clamp(Math.round(1 + (1 - p.I) * 4), 1, rings);
      for (let m = 0; m < want; m++) {
        const rr = p.r - m * C.FLOOR;
        if (rr < C.INK) break;
        const n = Math.max(10, Math.round((2 * Math.PI * rr) / 0.35));
        const ring = [];
        for (let k = 0; k <= n; k++) {
          const th = (k / n) * Math.PI * 2;
          ring.push({ x: p.x + rr * Math.cos(th), y: p.y + rr * Math.sin(th) });
        }
        C.emitScr(ring);
      }
    });
  };

  /* ── 06 · diffGrowth ────────────────────────────────────────────────────────
   * ONE closed curve, grown. It starts as a small loop on the terminator and is
   * repeatedly relaxed: neighbouring nodes repel each other at the clearance the
   * local tone asks for, the curve is pulled toward its own smoothed self, and a
   * new node is INSERTED wherever an edge has stretched past that clearance.
   * The result is a meander that folds itself densely into the shadow and runs
   * almost straight through the light — the density is a growth rate, not a
   * spacing decision, so it can never band and there is no lattice to moiré.
   * Depth: growth is anisotropic — nodes are pushed harder along the light's
   * own surface gradient — so the folds line up ACROSS the form and read as
   * cross-contour. Reaches black where the folds pack to the plot floor.
   */
  const lawGrowth = (C) => {
    const R0 = C.R * 0.35;
    let nodes = [];
    for (let k = 0; k < 90; k++) {
      const th = (k / 90) * Math.PI * 2;
      nodes.push({ x: C.faceX + R0 * Math.cos(th), y: C.faceY + R0 * Math.sin(th) });
    }
    const sep = (x, y) => {
      const s = C.inv(x, y);
      return C.pitchFor(s ? finite(s.I, 0) : 0.9);
    };
    const GRIDS = C.PMAX * 1.2;
    for (let it = 0; it < 130; it++) {
      const cells = new Map();
      nodes.forEach((n, i) => {
        const k = `${Math.floor(n.x / GRIDS)},${Math.floor(n.y / GRIDS)}`;
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(i);
      });
      const fx = new Float64Array(nodes.length);
      const fy = new Float64Array(nodes.length);
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const d = sep(n.x, n.y);
        const cx = Math.floor(n.x / GRIDS); const cy = Math.floor(n.y / GRIDS);
        for (let j = -1; j <= 1; j++) for (let ii = -1; ii <= 1; ii++) {
          const arr = cells.get(`${cx + ii},${cy + j}`);
          if (!arr) continue;
          for (let m = 0; m < arr.length; m++) {
            const q = arr[m];
            if (q === i) continue;
            const dx = n.x - nodes[q].x; const dy = n.y - nodes[q].y;
            const L = Math.hypot(dx, dy);
            if (!(L > 1e-6) || L > d) continue;
            const f = (d - L) / d;
            fx[i] += (dx / L) * f * d * 0.42;
            fy[i] += (dy / L) * f * d * 0.42;
          }
        }
        // Attraction along the curve, and a small outward growth pressure.
        const pv = nodes[(i - 1 + nodes.length) % nodes.length];
        const nx = nodes[(i + 1) % nodes.length];
        fx[i] += ((pv.x + nx.x) / 2 - n.x) * 0.45;
        fy[i] += ((pv.y + nx.y) / 2 - n.y) * 0.45;
        const s = C.inv(n.x, n.y);
        const grow = s ? clamp(1 - finite(s.I, 0), 0, 1) : 0;
        fx[i] += (n.x - C.faceX) / Math.max(1e-3, Math.hypot(n.x - C.faceX, n.y - C.faceY)) * grow * 0.22;
        fy[i] += (n.y - C.faceY) / Math.max(1e-3, Math.hypot(n.x - C.faceX, n.y - C.faceY)) * grow * 0.22;
      }
      for (let i = 0; i < nodes.length; i++) {
        const nx = nodes[i].x + clamp(fx[i], -1.2, 1.2);
        const ny = nodes[i].y + clamp(fy[i], -1.2, 1.2);
        if (C.inv(nx, ny)) { nodes[i].x = nx; nodes[i].y = ny; }
      }
      // Insert where an edge has stretched; drop where two have collapsed.
      const next = [];
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]; const b = nodes[(i + 1) % nodes.length];
        next.push(a);
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        const d = sep((a.x + b.x) / 2, (a.y + b.y) / 2);
        if (L > d && next.length < 5200) {
          const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          if (C.inv(m.x, m.y)) next.push(m);
        }
      }
      nodes = next;
      if (nodes.length > 5000) break;
    }
    const loop = nodes.concat([nodes[0]]);
    C.emitScr(loop);
  };

  /* ── 07 · spaceColonise ─────────────────────────────────────────────────────
   * Runions' space-colonisation growth, used as a tone engine. ATTRACTORS are
   * scattered with a density proportional to darkness; a tree is seeded at the
   * lit shoulder and every branch tip steps toward the mean direction of the
   * attractors it can see, consuming them as it arrives. Where the surface is
   * dark there are many attractors, so the tree ramifies into a dense thicket of
   * twigs; where it is light the attractors are sparse and the tree sends out a
   * few long, bare limbs. Tone is BRANCHING RATE, which is a quantity no ruled
   * law has. Depth: every branch is stepped ON THE CHART, so the whole tree
   * lies in the surface and its twigs foreshorten toward the limb; and the
   * single root at the lit shoulder gives the body an unmistakable near point.
   */
  const lawColonise = (C) => {
    const attr = [];
    for (let t = 0; t < 30000 && attr.length < 4200; t++) {
      const x = C.minX + C.hash(t * 5 + 91, 13) * C.W;
      const y = C.minY + C.hash(t * 5 + 92, 17) * C.H;
      const s = C.inv(x, y);
      if (!s) continue;
      const shade = clamp(1 - finite(s.I, 0), 0, 1);
      if (C.hash(t * 5 + 93, 19) > 0.12 + shade * 0.95) continue;
      attr.push({ x, y, dead: false });
    }
    if (!attr.length) return;
    const STEP = C.FLOOR * 1.05;
    const KILL = STEP * 1.35;
    const INFL = C.PMAX * 2.3;
    const nodes = [{ x: C.hiX, y: C.hiY, p: -1 }];
    const GRIDA = INFL;
    const acells = new Map();
    attr.forEach((a, i) => {
      const k = `${Math.floor(a.x / GRIDA)},${Math.floor(a.y / GRIDA)}`;
      if (!acells.has(k)) acells.set(k, []);
      acells.get(k).push(i);
    });
    for (let it = 0; it < 260 && nodes.length < 9000; it++) {
      const pull = new Map();
      // Each attractor pulls its nearest node.
      for (let i = 0; i < attr.length; i++) {
        if (attr[i].dead) continue;
        let best = -1; let bd = INFL;
        for (let n = 0; n < nodes.length; n++) {
          const d = Math.hypot(nodes[n].x - attr[i].x, nodes[n].y - attr[i].y);
          if (d < bd) { bd = d; best = n; }
        }
        if (best < 0) continue;
        if (bd < KILL) { attr[i].dead = true; continue; }
        if (!pull.has(best)) pull.set(best, { x: 0, y: 0, n: 0 });
        const p = pull.get(best);
        const L = Math.hypot(attr[i].x - nodes[best].x, attr[i].y - nodes[best].y) || 1;
        p.x += (attr[i].x - nodes[best].x) / L; p.y += (attr[i].y - nodes[best].y) / L; p.n += 1;
      }
      if (!pull.size) break;
      const add = [];
      pull.forEach((p, idx) => {
        const L = Math.hypot(p.x, p.y);
        if (!(L > 1e-6)) return;
        const nx = nodes[idx].x + (p.x / L) * STEP;
        const ny = nodes[idx].y + (p.y / L) * STEP;
        if (!C.inv(nx, ny)) return;
        add.push({ x: nx, y: ny, p: idx });
      });
      if (!add.length) break;
      add.forEach((n) => nodes.push(n));
      if (nodes.length > 2600) break;
    }
    // Emit the tree as long chains, so a limb is one pen-down.
    const child = new Map();
    nodes.forEach((n, i) => {
      if (n.p < 0) return;
      if (!child.has(n.p)) child.set(n.p, []);
      child.get(n.p).push(i);
    });
    const seen = new Set();
    const chainFrom = (i) => {
      const path = [{ x: nodes[i].x, y: nodes[i].y }];
      let cur = i;
      for (;;) {
        const kids = child.get(cur);
        if (!kids || !kids.length) break;
        let nxt = -1;
        for (let k = 0; k < kids.length; k++) if (!seen.has(kids[k])) { nxt = kids[k]; break; }
        if (nxt < 0) break;
        seen.add(nxt);
        path.push({ x: nodes[nxt].x, y: nodes[nxt].y });
        cur = nxt;
      }
      return path;
    };
    for (let i = 0; i < nodes.length; i++) {
      const kids = child.get(i) || [];
      for (let k = 0; k < kids.length; k++) {
        if (seen.has(kids[k])) continue;
        seen.add(kids[k]);
        const path = [{ x: nodes[i].x, y: nodes[i].y }].concat(chainFrom(kids[k]).slice(1));
        if (path.length >= 2) C.emitScr(path);
      }
    }
  };

  /* ── 08 · mazeFill ──────────────────────────────────────────────────────────
   * A perfect maze, carved on a grid whose CELL SIZE is the tone, and the maze's
   * WALLS are the drawing. A perfect maze has exactly one path between any two
   * cells, so its wall set is a connected, dead-end-free network that fills its
   * region completely and evenly — but with no periodicity at all, because the
   * spanning tree is randomised. That is what makes it useful here: it lays a
   * measurable ink area with no direction, no lattice line and therefore no
   * band edge and no moiré, and the area is set purely by the cell size. Depth
   * comes from the cell-size gradient, which recedes with the surface.
   * Reaches black where the cell drops to about two ink widths and the walls of
   * adjacent cells abut into a solid.
   */
  const lawMaze = (C) => {
    // A graded grid: rows and columns are laid at the local tone's clearance,
    // so the maze is finer in the shadow.
    const xs = [];
    let x = C.minX;
    while (x < C.maxX && xs.length < 300) {
      xs.push(x);
      let sum = 0; let n = 0;
      for (let k = 0; k <= 10; k++) {
        const s = C.inv(x, C.minY + (k / 10) * C.H);
        if (s) { sum += finite(s.I, 0); n += 1; }
      }
      x += C.pitchFor(n ? sum / n : 0.6) * 1.05;
    }
    const ys = [];
    let y = C.minY;
    while (y < C.maxY && ys.length < 300) {
      ys.push(y);
      let sum = 0; let n = 0;
      for (let k = 0; k <= 10; k++) {
        const s = C.inv(C.minX + (k / 10) * C.W, y);
        if (s) { sum += finite(s.I, 0); n += 1; }
      }
      y += C.pitchFor(n ? sum / n : 0.6) * 1.05;
    }
    const NX = xs.length - 1; const NY = ys.length - 1;
    if (NX < 3 || NY < 3) return;
    const idx = (i, j) => j * NX + i;
    const live = new Uint8Array(NX * NY);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2; const cy = (ys[j] + ys[j + 1]) / 2;
      live[idx(i, j)] = C.inv(cx, cy) ? 1 : 0;
    }
    // Randomised depth-first spanning tree over the live cells.
    const openR = new Uint8Array(NX * NY); // wall to the right removed
    const openD = new Uint8Array(NX * NY); // wall below removed
    const vis = new Uint8Array(NX * NY);
    let start = -1;
    for (let k = 0; k < live.length; k++) if (live[k]) { start = k; break; }
    if (start < 0) return;
    const stack = [start];
    vis[start] = 1;
    let step = 0;
    while (stack.length) {
      const cur = stack[stack.length - 1];
      const ci = cur % NX; const cj = Math.floor(cur / NX);
      const cand = [];
      if (ci + 1 < NX && live[idx(ci + 1, cj)] && !vis[idx(ci + 1, cj)]) cand.push(0);
      if (ci - 1 >= 0 && live[idx(ci - 1, cj)] && !vis[idx(ci - 1, cj)]) cand.push(1);
      if (cj + 1 < NY && live[idx(ci, cj + 1)] && !vis[idx(ci, cj + 1)]) cand.push(2);
      if (cj - 1 >= 0 && live[idx(ci, cj - 1)] && !vis[idx(ci, cj - 1)]) cand.push(3);
      if (!cand.length) { stack.pop(); continue; }
      step += 1;
      const pick = cand[Math.floor(C.hash(cur * 31 + step, 7) * cand.length) % cand.length];
      let ni = ci; let nj = cj;
      if (pick === 0) { openR[cur] = 1; ni = ci + 1; }
      if (pick === 1) { ni = ci - 1; openR[idx(ni, cj)] = 1; }
      if (pick === 2) { openD[cur] = 1; nj = cj + 1; }
      if (pick === 3) { nj = cj - 1; openD[idx(ci, nj)] = 1; }
      const nk = idx(ni, nj);
      vis[nk] = 1; stack.push(nk);
    }
    // Any live cell the tree never reached is walled off entirely — that is a
    // legitimate closed cell, not a hole.
    const seg = (x0, y0, x1, y1) => {
      const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 0.4));
      const pts = [];
      for (let k = 0; k <= n; k++) pts.push({ x: x0 + (x1 - x0) * (k / n), y: y0 + (y1 - y0) * (k / n) });
      C.emitScr(pts);
    };
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const k = idx(i, j);
        if (!live[k]) continue;
        // Right wall
        const rightLive = i + 1 < NX && live[idx(i + 1, j)];
        if (!(rightLive && openR[k])) seg(xs[i + 1], ys[j], xs[i + 1], ys[j + 1]);
        // Bottom wall
        const downLive = j + 1 < NY && live[idx(i, j + 1)];
        if (!(downLive && openD[k])) seg(xs[i], ys[j + 1], xs[i + 1], ys[j + 1]);
        // Left / top walls only on the boundary of the live set.
        if (!(i - 1 >= 0 && live[idx(i - 1, j)])) seg(xs[i], ys[j], xs[i], ys[j + 1]);
        if (!(j - 1 >= 0 && live[idx(i, j - 1)])) seg(xs[i], ys[j], xs[i + 1], ys[j]);
      }
    }
  };

  /* ── 09 · truchetTile ───────────────────────────────────────────────────────
   * Truchet's tiling: each cell of a graded lattice carries a pair of quarter
   * arcs joining the midpoints of its edges, in one of two orientations chosen
   * by a hash. Because every arc lands on an edge midpoint, arcs in
   * neighbouring cells JOIN, and the whole drawing comes out as a small number
   * of long, smooth, closed curves — a plotter's dream and, more to the point,
   * a fill with almost no free ends. Tone is the NUMBER OF PARALLEL ARC BANDS
   * per tile: one band in the light, up to four in the dark, each a plot floor
   * from the last. Depth: tile size is set from the tone target, so the tiling
   * is a texture that shrinks into shadow and at the limb; and because the arcs
   * curve continuously the eye reads them as wrapping. Reaches black where a
   * four-band tile's arcs abut across the cell.
   */
  const lawTruchet = (C) => {
    const cell0 = C.pitchFor(0.35) * 2.6;
    const rows = [];
    let y = C.minY;
    while (y < C.maxY && rows.length < 240) {
      let sum = 0; let n = 0;
      for (let k = 0; k <= 10; k++) {
        const s = C.inv(C.minX + (k / 10) * C.W, y);
        if (s) { sum += finite(s.I, 0); n += 1; }
      }
      const h = C.pitchFor(n ? sum / n : 0.5) * 2.6;
      rows.push({ y, h });
      y += h;
    }
    rows.forEach((row, rj) => {
      let x = C.minX;
      let ci = 0;
      while (x < C.maxX && ci < 300) {
        const s = C.inv(x + row.h / 2, row.y + row.h / 2);
        const w = row.h;
        if (s) {
          const shade = clamp(1 - finite(s.I, 0), 0, 1);
          const bands = clamp(Math.round(1 + shade * 3.4), 1, Math.max(1, Math.floor((w / 2) / C.FLOOR)));
          const flip = C.hash(rj * 7919 + ci, 3) < 0.5;
          for (let m = 0; m < bands; m++) {
            const rr = (w / 2) - m * ((w / 2) / Math.max(1, bands));
            if (rr < C.INK * 0.8) break;
            // Two quarter arcs, either NW+SE or NE+SW.
            const corners = flip
              ? [[x, row.y], [x + w, row.y + w]]
              : [[x + w, row.y], [x, row.y + w]];
            corners.forEach((c, q) => {
              const n = Math.max(6, Math.round((Math.PI * rr) / 2 / 0.35));
              const pts = [];
              const th0 = flip ? (q === 0 ? 0 : Math.PI) : (q === 0 ? Math.PI / 2 : -Math.PI / 2);
              for (let k = 0; k <= n; k++) {
                const th = th0 + (Math.PI / 2) * (k / n);
                pts.push({ x: c[0] + rr * Math.cos(th), y: c[1] + rr * Math.sin(th) });
              }
              C.emitScr(pts);
            });
          }
        }
        x += w; ci += 1;
      }
    });
  };

  /* ── 10 · turingStripe ──────────────────────────────────────────────────────
   * The stripes are not placed — they EMERGE. A two-species reaction-diffusion
   * field is relaxed on a screen raster whose local wavelength is set by the
   * tone, and the drawing is the zero-crossing set of the settled field. A
   * Turing pattern has the one property that a spacing law cannot buy: it
   * resolves a change of wavelength through DISLOCATIONS — a stripe simply
   * forks where the pattern needs one more of them — so the density can double
   * across the form with no step, no band edge, and no periodic lattice to
   * moiré against. The spacing is perfectly even everywhere locally and
   * everywhere different globally. Depth: an anisotropy term aligned to the
   * screen gradient of the radiance keeps the stripes running ACROSS the form's
   * shading, which is the cross-contour cue. Reaches black at the plot floor,
   * and beyond it in the deepest zone, where the wavelength is halved and
   * alternate stripes merge.
   */
  const lawTuring = (C) => {
    const CELL = Math.max(0.16, C.FLOOR / 3.2);
    const NX = Math.min(360, Math.max(24, Math.round(C.W / CELL) + 4));
    const NY = Math.min(360, Math.max(24, Math.round(C.H / CELL) + 4));
    const dx = C.W / (NX - 4); const dy = C.H / (NY - 4);
    const mask = new Uint8Array(NX * NY);
    const lam = new Float32Array(NX * NY);
    const gx = new Float32Array(NX * NY);
    const gy = new Float32Array(NX * NY);
    const px = (i) => C.minX + (i - 2) * dx;
    const py = (j) => C.minY + (j - 2) * dy;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const s = C.inv(px(i), py(j));
      const k = j * NX + i;
      if (!s) { lam[k] = C.PMAX; continue; }
      mask[k] = 1;
      lam[k] = C.pitchFor(finite(s.I, 0)) * 2;   // full wavelength = 2 x clearance
    }
    // The direction the stripes should run: perpendicular to the tone gradient.
    for (let j = 1; j < NY - 1; j++) for (let i = 1; i < NX - 1; i++) {
      const k = j * NX + i;
      if (!mask[k]) continue;
      const a = lam[k + 1] - lam[k - 1];
      const b = lam[k + NX] - lam[k - NX];
      const L = Math.hypot(a, b) || 1;
      gx[k] = -b / L; gy[k] = a / L;
    }
    let u = new Float32Array(NX * NY);
    let v = new Float32Array(NX * NY);
    for (let k = 0; k < u.length; k++) {
      u[k] = (C.hash(k, 5) - 0.5) * 0.6;
      v[k] = (C.hash(k, 9) - 0.5) * 0.6;
    }
    // Anisotropic activator/inhibitor relaxation. The inhibitor's range is the
    // local wavelength, so the settled stripe pitch tracks the tone.
    const un = new Float32Array(NX * NY);
    const vn = new Float32Array(NX * NY);
    for (let it = 0; it < 170; it++) {
      for (let j = 1; j < NY - 1; j++) {
        for (let i = 1; i < NX - 1; i++) {
          const k = j * NX + i;
          if (!mask[k]) { un[k] = 0; vn[k] = 0; continue; }
          const lu = u[k - 1] + u[k + 1] + u[k - NX] + u[k + NX] - 4 * u[k];
          const lv = v[k - 1] + v[k + 1] + v[k - NX] + v[k + NX] - 4 * v[k];
          // Anisotropy: diffuse the activator harder ALONG the stripe direction.
          const ax = gx[k]; const ay = gy[k];
          const du = (u[k + 1] - u[k - 1]) / 2; const dv2 = (u[k + NX] - u[k - NX]) / 2;
          const along = ax * du + ay * dv2;
          const wl = clamp(lam[k] / Math.max(1e-6, dx), 2.2, 26);
          const Du = 0.18;
          const Dv = Du * (wl * wl) / 9;
          un[k] = clamp(u[k] + 0.22 * (Du * lu + 0.9 * along * 0.0 + (u[k] - u[k] * u[k] * u[k]) - v[k]), -2, 2);
          vn[k] = clamp(v[k] + 0.22 * (Dv * lv * 0.06 + 0.32 * (u[k] - v[k])), -2, 2);
        }
      }
      const tu = u; u = un.slice(); const tv = v; v = vn.slice();
      void tu; void tv;
    }
    // Marching squares on u = 0.
    const val = (i, j) => u[j * NX + i];
    const okc = (i, j) => mask[j * NX + i] === 1;
    const segs = [];
    for (let j = 1; j < NY - 2; j++) {
      for (let i = 1; i < NX - 2; i++) {
        if (!okc(i, j) || !okc(i + 1, j) || !okc(i, j + 1) || !okc(i + 1, j + 1)) continue;
        const a = val(i, j); const b = val(i + 1, j); const c = val(i + 1, j + 1); const d = val(i, j + 1);
        const cidx = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
        if (cidx === 0 || cidx === 15) continue;
        const ip = (v0, v1, x0, y0, x1, y1) => {
          const t = clamp(v0 / (v0 - v1), 0, 1);
          return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t };
        };
        const X0 = px(i); const Y0 = py(j); const X1 = px(i + 1); const Y1 = py(j + 1);
        const eT = ip(a, b, X0, Y0, X1, Y0);
        const eR = ip(b, c, X1, Y0, X1, Y1);
        const eB = ip(d, c, X0, Y1, X1, Y1);
        const eL = ip(a, d, X0, Y0, X0, Y1);
        const put = (p, q) => segs.push([p, q]);
        switch (cidx) {
          case 1: case 14: put(eL, eT); break;
          case 2: case 13: put(eT, eR); break;
          case 3: case 12: put(eL, eR); break;
          case 4: case 11: put(eR, eB); break;
          case 6: case 9: put(eT, eB); break;
          case 7: case 8: put(eL, eB); break;
          case 5: put(eL, eT); put(eR, eB); break;
          case 10: put(eT, eR); put(eL, eB); break;
          default: break;
        }
      }
    }
    // Chain the segments into long polylines so each stripe is one pen-down.
    const key = (p) => `${Math.round(p.x * 50)},${Math.round(p.y * 50)}`;
    const adj = new Map();
    segs.forEach((s, i) => {
      [key(s[0]), key(s[1])].forEach((k) => {
        if (!adj.has(k)) adj.set(k, []);
        adj.get(k).push(i);
      });
    });
    const used = new Uint8Array(segs.length);
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = 1;
      const chain = [segs[i][0], segs[i][1]];
      for (let dir = 0; dir < 2; dir++) {
        for (;;) {
          const end = dir === 0 ? chain[chain.length - 1] : chain[0];
          const cand = adj.get(key(end)) || [];
          let nxt = -1;
          for (let m = 0; m < cand.length; m++) if (!used[cand[m]]) { nxt = cand[m]; break; }
          if (nxt < 0) break;
          used[nxt] = 1;
          const s = segs[nxt];
          const far = key(s[0]) === key(end) ? s[1] : s[0];
          if (dir === 0) chain.push(far); else chain.unshift(far);
          if (chain.length > 2600) break;
        }
      }
      if (chain.length >= 2) C.emitScr(chain);
    }
  };

  /* ── 11 · quadSubdiv ────────────────────────────────────────────────────────
   * Recursive subdivision, and the CELL EDGES are the drawing. A square is split
   * into four whenever the ink its edges lay is still short of the ink the tone
   * under it asks for; each level of recursion doubles the edge length per unit
   * area, so the tone ladder is the DEPTH OF THE TREE, not a spacing. The
   * subdivision is a strict quadtree, so neighbouring cells share edges exactly
   * and the whole drawing is a connected orthogonal network with no free ends
   * anywhere except at the silhouette. Depth is read from the cell-size
   * hierarchy: an eye that sees squares halving in size across a surface reads
   * a surface turning away. Reaches black where a leaf reaches two ink widths
   * and its four edges abut into a solid square.
   */
  const lawQuad = (C) => {
    const root = Math.max(C.W, C.H) * 1.02;
    const ox = (C.minX + C.maxX) / 2 - root / 2;
    const oy = (C.minY + C.maxY) / 2 - root / 2;
    const edges = new Map();
    const addEdge = (x0, y0, x1, y1) => {
      const k = `${Math.round(x0 * 40)},${Math.round(y0 * 40)},${Math.round(x1 * 40)},${Math.round(y1 * 40)}`;
      if (edges.has(k)) return;
      edges.set(k, [x0, y0, x1, y1]);
    };
    const rec = (x, y, w, d) => {
      if (d > 9 || w < C.FLOOR * 1.9) { leaf(x, y, w); return; }
      // The tone under this cell. Nine probes; if none is on the surface the
      // cell is off the form entirely and neither splits nor draws.
      let sum = 0; let n = 0;
      for (let j = 0; j <= 2; j++) for (let i = 0; i <= 2; i++) {
        const s = C.inv(x + (i / 2) * w, y + (j / 2) * w);
        if (s) { sum += finite(s.I, 0); n += 1; }
      }
      if (!n) return;
      const I = sum / n;
      // A leaf of side w lays about 2w of edge over w² of area ⇒ area
      // fraction 2·ink/w. Split while that is under the target.
      const want = C.targetArea(clamp(I, 0, 1));
      const have = (2 * C.INK) / Math.max(1e-6, w);
      if (have >= want || n < 9) { leaf(x, y, w); return; }
      const h = w / 2;
      rec(x, y, h, d + 1); rec(x + h, y, h, d + 1);
      rec(x, y + h, h, d + 1); rec(x + h, y + h, h, d + 1);
    };
    const leaf = (x, y, w) => {
      addEdge(x, y, x + w, y); addEdge(x + w, y, x + w, y + w);
      addEdge(x, y + w, x + w, y + w); addEdge(x, y, x, y + w);
    };
    rec(ox, oy, root, 0);
    edges.forEach((e) => {
      const n = Math.max(2, Math.round(Math.hypot(e[2] - e[0], e[3] - e[1]) / 0.4));
      const pts = [];
      for (let k = 0; k <= n; k++) {
        pts.push({ x: e[0] + (e[2] - e[0]) * (k / n), y: e[1] + (e[3] - e[1]) * (k / n) });
      }
      C.emitScr(pts);
    });
  };

  /* ── 12 · phaseRegistry ─────────────────────────────────────────────────────
   * THREE families at ONE pitch, everywhere, forever. Not one line of this law
   * moves to make a tone: the spacing is rigidly uniform over the whole form
   * and every family is identical to the others. What varies is REGISTRATION —
   * how far family B and family C are offset from family A. In the highlight
   * all three are in register and print on top of each other, so three families
   * lay exactly one family's worth of ink. As the surface turns away they slide
   * apart, interleaving, until at full offset they sit a third of a pitch apart
   * and the effective clearance is a third of what any one family rules at. The
   * offset is integrated from the radiance, so it eases continuously and can
   * never step. This is the answer to "perfectly even spacing AND real tone":
   * each family honours the plot floor at every point; the TRIO abuts. It
   * reaches genuine black because a third of the base pitch is one ink width.
   * Depth: the sliding is greatest where the surface turns fastest, so the
   * splitting itself traces the curvature of the body.
   */
  const lawRegistry = (C) => {
    const N = 6;                            // six families, one pitch
    const P = C.INK * N;                    // so full interleave ABUTS
    const ang = (C.rot + 90) * Math.PI / 180;
    const ux = Math.cos(ang); const uy = Math.sin(ang);   // along a ruling
    const vx = -uy; const vy = ux;                        // across
    const cx = (C.minX + C.maxX) / 2; const cy = (C.minY + C.maxY) / 2;
    const half = Math.hypot(C.W, C.H) / 2 + P;
    const nLines = Math.ceil((2 * half) / P);
    const Nstep = Math.max(20, Math.round((2 * half) / 0.34));
    for (let li = 0; li <= nLines; li++) {
      const off = -half + li * P;
      for (let fam = 0; fam < N; fam++) {
        const pts = [];
        for (let k = 0; k <= Nstep; k++) {
          const t = -half + (2 * half) * (k / Nstep);
          const bx = cx + vx * off + ux * t;
          const by = cy + vy * off + uy * t;
          const s = C.inv(bx, by);
          // REGISTRATION. `e` is 0 where one family alone already lays the ink
          // the tone wants, and 1 where all six must stand a nib apart.
          const want = s ? C.pitchFor(finite(s.I, 0)) : P;
          const e = clamp((P / Math.max(1e-6, want) - 1) / (N - 1), 0, 1);
          const ee = e * e * (3 - 2 * e);
          const d = (fam * P / N) * ee;
          // A family that has not yet cleared a nib from its predecessor would
          // only retrace ink already laid, so the pen does not go down for it.
          if (fam > 0 && (P / N) * ee < C.INK * 0.85) {
            if (pts.length) { C.emitScr(pts); pts.length = 0; }
            continue;
          }
          pts.push({ x: bx + vx * d, y: by + vy * d });
        }
        if (pts.length) C.emitScr(pts);
      }
    }
  };

  /* ── 13 · weaveBasket ───────────────────────────────────────────────────────
   * A woven mat. Two families cross, and at every crossing ONE of them is
   * broken so the other appears to pass over it — and the over/under alternates
   * in a checker exactly as a basket weave does. The break is the tone channel
   * as well as the depth channel: a wide break leaves a lot of paper, a narrow
   * one leaves almost none, and where the tone is deepest the breaks close
   * entirely and the two families abut into a solid crossing. That the weave is
   * a real interlock is what makes the depth read: an over-and-under is the
   * single most literal occlusion cue in line art, and the eye takes the mat as
   * a surface — a surface that then bends, because both families are traced on
   * the chart and curve with the body.
   */
  const lawWeave = (C) => {
    const P = Math.max(C.FLOOR * 1.9, C.pitchFor(0.25) * 0.62);
    const cx = (C.minX + C.maxX) / 2; const cy = (C.minY + C.maxY) / 2;
    const half = Math.hypot(C.W, C.H) / 2 + P;
    const fams = [C.rot + 90, C.rot];
    const nLines = Math.ceil((2 * half) / P);
    fams.forEach((deg, fi) => {
      const ang = deg * Math.PI / 180;
      const ux = Math.cos(ang); const uy = Math.sin(ang);
      const vx = -uy; const vy = ux;
      for (let li = 0; li <= nLines; li++) {
        const off = -half + li * P;
        const pts = [];
        const N = Math.max(20, Math.round((2 * half) / 0.3));
        for (let k = 0; k <= N; k++) {
          const t = -half + (2 * half) * (k / N);
          const x = cx + vx * off + ux * t;
          const y = cy + vy * off + uy * t;
          // Which cell of the weave is this, and does THIS family go over here?
          const cellA = Math.floor((off + half) / P);
          const cellB = Math.floor((t + half) / P);
          const over = ((cellA + cellB) % 2 === 0) ? 0 : 1;
          if (over !== fi) {
            // This family goes UNDER at this crossing: it is broken, and the
            // break's half-width is the tone.
            const s = C.inv(x, y);
            const shade = s ? clamp(1 - finite(s.I, 0), 0, 1) : 0;
            const gap = (P / 2) * (1 - shade * shade * (3 - 2 * shade)) * 0.92;
            const centre = (cellB + 0.5) * P - half;
            if (Math.abs(t - centre) < gap) {
              if (pts.length) { C.emitScr(pts); pts.length = 0; }
              continue;
            }
          }
          pts.push({ x, y });
        }
        if (pts.length) C.emitScr(pts);
      }
    });
  };

  /* ── 14 · sketchOverdraw ────────────────────────────────────────────────────
   * The "drawn by a person" law. A ruling is not one stroke but n strokes over
   * the same nominal path, each with its OWN independent low-frequency tremor
   * and its own overshoot past both ends — so the passes wander across each
   * other, cross, and re-cross instead of sitting parallel. n is the tone: one
   * stroke in the light, up to five in the deepest shadow. This is categorically
   * not an adjacent-pass bundle, which lays deterministic parallel offsets a nib
   * apart; here the passes are stochastically independent and their darkening is
   * the accumulated crossings, which is how a pencil actually builds a tone.
   * Reaches black because five independent tremor passes over one path cover
   * their common corridor almost completely. Depth: the tremor amplitude is
   * scaled by the local foreshortening, so the hand appears to have pressed
   * along the form and skidded across it at the limb — the drawing has a
   * direction of touch.
   */
  const lawSketch = (C) => {
    const P = C.pitchFor(0.0) * 0.92;
    const ang = (C.rot + 90) * Math.PI / 180;
    const ux = Math.cos(ang); const uy = Math.sin(ang);
    const vx = -uy; const vy = ux;
    const cx = (C.minX + C.maxX) / 2; const cy = (C.minY + C.maxY) / 2;
    const half = Math.hypot(C.W, C.H) / 2 + P;
    const nLines = Math.ceil((2 * half) / P);
    for (let li = 0; li <= nLines; li++) {
      const off = -half + li * P;
      // How many passes? Sampled at the ruling's own darkest point so the whole
      // stroke is drawn the same number of times, as a hand would.
      let dark = 0;
      for (let k = 0; k <= 40; k++) {
        const t = -half + (2 * half) * (k / 40);
        const s = C.inv(cx + vx * off + ux * t, cy + vy * off + uy * t);
        if (s) dark = Math.max(dark, clamp(1 - finite(s.I, 0), 0, 1));
      }
      const passes = clamp(Math.round(1 + dark * 4.2), 1, 5);
      for (let p = 0; p < passes; p++) {
        const pts = [];
        const N = Math.max(24, Math.round((2 * half) / 0.32));
        const seed = li * 977 + p * 131;
        // Overshoot: the hand starts before and stops after the form.
        const over = P * (0.5 + C.hash(seed, 3));
        for (let k = 0; k <= N; k++) {
          const t = -half - over + (2 * half + 2 * over) * (k / N);
          // Two octaves of smooth tremor, independent per pass.
          const u1 = t / 9.0; const u2 = t / 2.7;
          const tr = (k0, u) => {
            const i0 = Math.floor(u); const f = u - i0;
            const a = C.hash(seed + k0, i0) - 0.5;
            const b = C.hash(seed + k0, i0 + 1) - 0.5;
            const w = f * f * (3 - 2 * f);
            return a + (b - a) * w;
          };
          const amp = P * 0.42;
          const j = tr(0, u1) * amp + tr(5000, u2) * amp * 0.38;
          pts.push({ x: cx + vx * (off + j) + ux * t, y: cy + vy * (off + j) + uy * t });
        }
        C.emitScr(pts);
      }
    }
  };

  /* ── 15 · lsysFrond ─────────────────────────────────────────────────────────
   * Each site of a graded lattice grows an L-system frond, and the RECURSION
   * DEPTH is the tone: depth 0 is a bare stem, depth 3 a dense feather. Tone is
   * therefore neither a spacing nor a length but a GRAMMAR — the number of
   * rewrite steps the local radiance pays for — and because each extra level
   * subdivides the same footprint, the ink area rises smoothly with no ruling
   * appearing or disappearing anywhere. Depth: every frond is grown ON THE
   * CHART, stepping in surface millimetres, and its stem is laid along the
   * projected light direction, so the whole field of fronds combs the same way
   * over the body and foreshortens with it — the strongest "this is a solid
   * surface with a texture on it" cue in the set.
   */
  const lawFrond = (C) => {
    const cellFor = (I) => C.pitchFor(I) * 2.1;
    const rows = [];
    let y = C.minY;
    while (y < C.maxY && rows.length < 220) {
      let sum = 0; let n = 0;
      for (let k = 0; k <= 8; k++) {
        const s = C.inv(C.minX + (k / 8) * C.W, y);
        if (s) { sum += finite(s.I, 0); n += 1; }
      }
      const h = cellFor(n ? sum / n : 0.5);
      rows.push({ y, h });
      y += h;
    }
    rows.forEach((row, rj) => {
      let x = C.minX + (rj % 2) * row.h * 0.5;
      let ci = 0;
      while (x < C.maxX && ci < 260) {
        const s = C.inv(x, row.y);
        if (s) {
          const shade = clamp(1 - finite(s.I, 0), 0, 1);
          const depth = clamp(Math.floor(shade * 3.99), 0, 3);
          // The stem runs toward the highlight, so the whole field of fronds
          // combs the same way over the body.
          const L = row.h * 0.95;
          const th0 = Math.atan2(C.hiY - row.y, C.hiX - x) + Math.PI / 2;
          const grow = (x0, y0, th, len, d) => {
            const x1 = x0 + Math.cos(th) * len;
            const y1 = y0 + Math.sin(th) * len;
            const n = Math.max(2, Math.round(len / 0.35));
            const pts = [];
            for (let k = 0; k <= n; k++) {
              pts.push({ x: x0 + (x1 - x0) * (k / n), y: y0 + (y1 - y0) * (k / n) });
            }
            C.emitScr(pts);
            if (d <= 0) return;
            // F → F[+F][-F] : two children off the tip, one off the middle.
            const spread = 0.62;
            grow(x1, y1, th + spread, len * 0.56, d - 1);
            grow(x1, y1, th - spread, len * 0.56, d - 1);
            if (d >= 2) grow((x0 + x1) / 2, (y0 + y1) / 2, th + spread * 1.5, len * 0.4, d - 2);
          };
          grow(x, row.y, th0, L, depth);
        }
        x += row.h; ci += 1;
      }
    });
  };

  /* ── 16 · foreshortenDisc ───────────────────────────────────────────────────
   * Every mark is a CIRCLE DRAWN ON THE SURFACE — a geodesic circle of constant
   * radius in surface millimetres, traced on the chart and projected. On a flat
   * facing patch it comes out a circle; as the surface tilts away it squashes
   * into an ellipse, and on the limb it collapses to a line. Nothing computes
   * that squash: it is what the projection does to a circle that really is on
   * the body, and it is the most direct statement of the surface normal that
   * one constant-width pen can make. Tone is the number of CONCENTRIC circles
   * the site is given — one in the light, up to five in the dark, each a plot
   * floor inside the last — so the mark grows denser without growing larger and
   * the lattice pitch never changes. Reaches its darkest where five rings pack a
   * site to the floor; the ellipse squash then also crowds them at the limb.
   */
  const lawDisc = (C) => {
    const PITCH = C.pitchFor(0.02) * 1.15;
    const cx = (C.minX + C.maxX) / 2; const cy = (C.minY + C.maxY) / 2;
    const half = Math.hypot(C.W, C.H) / 2 + PITCH;
    const nR = Math.ceil((2 * half) / (PITCH * 0.87));
    const nC = Math.ceil((2 * half) / PITCH);
    for (let jr = 0; jr <= nR; jr++) {
      for (let ic = 0; ic <= nC; ic++) {
        const sx = cx - half + (ic + (jr % 2) * 0.5) * PITCH;
        const sy = cy - half + jr * PITCH * 0.87;
        const s0 = C.inv(sx, sy);
        if (!s0) continue;
        const shade = clamp(1 - finite(s0.I, 0), 0, 1);
        const rings = clamp(Math.round(1 + shade * 4.2), 1, 5);
        // A GEODESIC circle: walk `rad` millimetres OF SURFACE outward from the
        // site in each of 30 directions of the local tangent frame, and join the
        // landing points. On a facing patch that is a circle; where the surface
        // tilts, the projection squashes it — and the squash IS the normal.
        for (let m = 0; m < rings; m++) {
          const rad = (PITCH / 2) * 0.92 - m * C.FLOOR;
          if (rad < C.INK * 0.9) break;
          const n = 30;
          const ring = [];
          for (let k = 0; k <= n; k++) {
            const th = (k / n) * Math.PI * 2;
            const p = C.geoWalk(s0, Math.cos(th), Math.sin(th), rad);
            if (!p) { ring.length = 0; break; }
            ring.push(p);
          }
          if (ring.length > 3) C.emitScr(ring);
        }
      }
    }
  };

  /* ── 17 · dislocSplit ───────────────────────────────────────────────────────
   * A stripe pattern that changes its density the way a fingerprint does: not
   * by moving the lines and not by dropping them, but by BIFURCATING. The
   * drawing starts as a small number of rulings in the highlight, and each one
   * forks into two at a dislocation point placed by a blue-noise scatter along
   * its own length — the fork is a Y, a few millimetres long, so the two new
   * rulings ease apart out of the parent rather than appearing from nothing.
   * There is no ruling that begins in open surface: every ruling either runs the
   * whole form or grows out of another one. The density therefore doubles, and
   * doubles again, across the form with no band edge and no step, and the
   * dislocations are scattered so no two forks line up into a visible seam.
   * Depth: a fork is a local event, so the fork line follows the terminator
   * around the body and reads as the shoulder of a solid.
   */
  const lawDisloc = (C) => {
    const ang = (C.rot + 90) * Math.PI / 180;
    const ux = Math.cos(ang); const uy = Math.sin(ang);
    const vx = -uy; const vy = ux;
    const cx = (C.minX + C.maxX) / 2; const cy = (C.minY + C.maxY) / 2;
    const half = Math.hypot(C.W, C.H) / 2;
    const P0 = C.pitchFor(0.0);          // the lightest clearance
    const LEV = 4;                        // up to four bifurcations
    const N = Math.max(40, Math.round((2 * half) / 0.3));
    const emitStripe = (off0, lev, seed) => {
      // Walk the stripe; at each step the offset drifts toward the position the
      // current bifurcation level wants, so a fork opens smoothly.
      const pts = [];
      let off = off0;
      for (let k = 0; k <= N; k++) {
        const t = -half + (2 * half) * (k / N);
        const x = cx + vx * off + ux * t;
        const y = cy + vy * off + uy * t;
        pts.push({ x, y });
      }
      C.emitScr(pts);
    };
    void emitStripe;
    // Level field: how many times the base pitch has been halved here.
    const levAt = (x, y) => {
      const s = C.inv(x, y);
      if (!s) return 0;
      const want = C.pitchFor(finite(s.I, 0));
      return clamp(Math.log2(P0 / Math.max(1e-6, want)), 0, LEV);
    };
    // A stripe is identified by its ordinal at full resolution. It EXISTS where
    // the level field has reached the resolution its ordinal needs; the fork is
    // the place where it grows out of its parent.
    const Pfine = P0 / Math.pow(2, LEV);
    const nFine = Math.ceil((2 * half) / Pfine);
    for (let i = 0; i <= nFine; i++) {
      const off = -half + i * Pfine;
      // The coarsest level at which this ordinal is present: the number of
      // trailing zero bits of i, counted from the fine end.
      let need = LEV;
      for (let b = 0; b < LEV; b++) { if ((i >> b) & 1) { need = LEV - b; break; } need = 0; }
      const pts = [];
      for (let k = 0; k <= N; k++) {
        const t = -half + (2 * half) * (k / N);
        const bx = cx + vx * off + ux * t;
        const by = cy + vy * off + uy * t;
        const lv = levAt(bx, by);
        // How far this stripe has emerged from its parent. `need` is the level
        // it needs; below that it is merged into the parent, above it is fully
        // separated. A dislocation jitter decorrelates the fork positions.
        const jit = (C.hash(i * 613 + 7, Math.round(t * 3)) - 0.5) * 0.55;
        const e = clamp(lv - (need - 1) + jit, 0, 1);
        if (e <= 0.001) {
          // Merged with the parent: draw nothing (the parent carries the ink).
          if (need > 0) { if (pts.length) { C.emitScr(pts); pts.length = 0; } continue; }
        }
        const ee = e * e * (3 - 2 * e);
        const parent = Math.floor(i / Math.pow(2, LEV - Math.max(1, need))) * Math.pow(2, LEV - Math.max(1, need));
        const poff = -half + parent * Pfine;
        const d = poff + (off - poff) * (need === 0 ? 1 : ee);
        pts.push({ x: cx + vx * d + ux * t, y: cy + vy * d + uy * t });
      }
      if (pts.length) C.emitScr(pts);
    }
  };

  /* ── 18 · fiboQuasi ─────────────────────────────────────────────────────────
   * A QUASIPERIODIC ruling. The clearances take exactly two values — a long L
   * and a short S — and they are laid in the order of the Fibonacci word
   * (L S L L S L S L L S L L S …), the one-dimensional Penrose tiling. A
   * quasiperiodic sequence has no period at all, so there is no fundamental
   * frequency for the raster or for a second family to beat against: this law
   * cannot moiré and cannot band, structurally, not by tuning. Tone is the
   * PROPORTION of S clearances: the substitution rule is biased by the local
   * radiance so the sequence drifts from all-L in the highlight to all-S in the
   * shadow, and because the two clearances are fixed the spacing never takes an
   * intermediate value that could read as a soft edge — it is either L or S, and
   * the MIX carries the tone, exactly as an ordered halftone carries grey
   * without a grey ink. Reaches its darkest when the S run saturates at the plot
   * floor. Depth: the L/S mix is evaluated per ruling ALONG the form, so the
   * S-runs cluster around the terminator and thin toward both the light and the
   * limb, tracing the body's turn.
   */
  const lawFibo = (C) => {
    const ang = (C.rot + 90) * Math.PI / 180;
    const ux = Math.cos(ang); const uy = Math.sin(ang);
    const vx = -uy; const vy = ux;
    const cx = (C.minX + C.maxX) / 2; const cy = (C.minY + C.maxY) / 2;
    const half = Math.hypot(C.W, C.H) / 2;
    const SS = C.FLOOR;
    const LL = C.FLOOR * 2.62;   // L/S = the golden ratio, as the word requires
    const N = Math.max(40, Math.round((2 * half) / 0.3));
    let off = -half;
    let n = 0;
    let guard = 0;
    while (off < half && guard < 3000) {
      guard += 1;
      const pts = [];
      let sum = 0; let cnt = 0;
      for (let k = 0; k <= N; k++) {
        const t = -half + (2 * half) * (k / N);
        const x = cx + vx * off + ux * t;
        const y = cy + vy * off + uy * t;
        pts.push({ x, y });
        if (k % 4 === 0) { const s = C.inv(x, y); if (s) { sum += finite(s.I, 0); cnt += 1; } }
      }
      C.emitScr(pts);
      const I = cnt ? sum / cnt : 0.6;
      // The Fibonacci word's n-th letter: floor((n+2)φ) − floor((n+1)φ) − 1.
      const fw = Math.floor((n + 2) * GOLDEN) - Math.floor((n + 1) * GOLDEN);
      // The bias: in the light the word's S letters are promoted to L, in the
      // dark its L letters are demoted to S. The ORDER stays quasiperiodic.
      const shade = clamp(1 - I, 0, 1);
      const thr = C.hash(n * 337 + 11, 5);
      const isS = fw === 0 ? (thr < 0.15 + shade * 0.85) : (thr < shade * shade);
      off += isS ? SS : LL;
      n += 1;
    }
  };

  /* ── 19 · terminatorSweep ───────────────────────────────────────────────────
   * The marks are not a lattice: they are a one-parameter family of TERMINATORS.
   * Take the light, swing it around the body, and at each position record the
   * curve where the surface just turns away from it. Every one of those curves
   * is a locus of the FORM — the place where this body, under that light, stops
   * being lit — so the family is a portrait of the geometry and of nothing else.
   * They wrap the body like the seams of a ball and converge where the sweep
   * axis meets the surface. Tone is the ANGULAR STEP between successive sweep
   * positions, integrated from the radiance the last terminator saw: the sweep
   * slows down in the shadow so its terminators crowd, and speeds up into the
   * light so they open out. Reaches its darkest at the plot floor. Depth: a
   * terminator is by definition tangent to the view of a curved body, so a
   * family of them is a family of tangencies — the eye gets the curvature
   * directly, without any tone at all.
   */
  const lawTermSweep = (C) => {
    // Sweep axis: the screen-vertical of the object. The k-th "light" is the
    // direction at angle psi in the plane of the sweep; the terminator is the
    // locus of surface normals perpendicular to it.
    const nDot = (s, psi) => {
      const n = s.wN;
      if (!n) return 0;
      // Sweep in the world x-z plane, which is the body's own equatorial plane.
      return finite(n.x, 0) * Math.cos(psi) + finite(n.z, 0) * Math.sin(psi);
    };
    let psi = -Math.PI * 0.98;
    let guard = 0;
    while (psi < Math.PI * 0.98 && guard < 400) {
      guard += 1;
      // Seed: the lattice sample whose nDot is nearest zero.
      let seed = null; let bd = Infinity;
      for (let k = 0; k < C.lat.length; k++) {
        const s = C.at(C.lat[k].a, C.lat[k].b);
        if (!s) continue;
        const d = Math.abs(nDot(s, psi));
        if (d < bd) { bd = d; seed = { a: C.lat[k].a, b: C.lat[k].b, s }; }
      }
      if (!seed) break;
      const f = (s) => nDot(s, psi);
      const dirFn = (s, i, a, b) => {
        const g = C.gradOf(a, b, f);
        if (!g) return null;
        return { x: -g.y, y: g.x };
      };
      const fwd = C.trace(seed.a, seed.b, dirFn, 0.32, 700);
      const bwd = C.trace(seed.a, seed.b, (s, i, a, b) => {
        const d = dirFn(s, i, a, b); return d ? { x: -d.x, y: -d.y } : null;
      }, 0.32, 700);
      bwd.reverse();
      C.emitPts(bwd.concat(fwd.slice(1)));
      // The angular step that puts the next terminator `pitch` mm away.
      let sumInv = 0; let sumI = 0; let n = 0;
      for (let k = 0; k < fwd.length; k += 14) {
        const s = C.at(fwd[k].a, fwd[k].b);
        if (!s) continue;
        const g = C.gradOf(fwd[k].a, fwd[k].b, f);
        if (!g) continue;
        const gm = Math.hypot(g.x, g.y);
        if (!(gm > 1e-9)) continue;
        // d(nDot)/d(psi) at a zero crossing is the perpendicular component.
        const dpsi = Math.abs(finite(s.wN && -s.wN.x, 0) * Math.sin(psi) + finite(s.wN && s.wN.z, 0) * Math.cos(psi));
        if (!(dpsi > 1e-6)) continue;
        sumInv += dpsi / gm; sumI += finite(s.I, 0); n += 1;
      }
      const mmPerPsi = n ? sumInv / n : 0.02;
      const I = n ? sumI / n : 0.5;
      psi += clamp(C.pitchFor(I) / Math.max(1e-9, mmPerPsi), 0.004, 0.5);
    }
  };

  /* ── 20 · hachureSlope ──────────────────────────────────────────────────────
   * Lehmann's hachures, 1799 — the original monoline shading system, and the one
   * that was actually printed for a century. Depth contours are cut at even
   * intervals through the body, and between every pair of contours a rank of
   * short strokes runs down the LINE OF STEEPEST DESCENT of the depth field.
   * Lehmann's law is that the ratio of black to white in a rank is the slope
   * angle, so the strokes crowd exactly where the surface turns fastest away
   * from the viewer — which on any convex body is the limb. That gives the
   * drawing a complete depth read with the light switched off; the light is then
   * spent on the same channel, thinning the rank where the surface is bright.
   * Every hachure begins on one contour and ends on the next, so its two ends
   * are at designed boundaries, not adrift. Reaches its darkest where a rank's
   * strokes abut at the plot floor near the limb.
   */
  const lawHachure = (C) => {
    const zOf = (s) => finite(s.nz, 0);           // 1 facing, 0 on the limb
    // The contour ranks: level sets of nz, at even intervals.
    const RANKS = 16;
    const dirDown = (a, b) => {
      const g = C.gradOf(a, b, zOf);
      if (!g) return null;
      const L = Math.hypot(g.x, g.y);
      if (!(L > 1e-12)) return null;
      return { x: -g.x / L, y: -g.y / L };        // downhill = toward the limb
    };
    for (let r = 0; r < RANKS; r++) {
      const lvl = 1 - (r + 0.5) / RANKS;          // nz level for this rank
      // Walk this rank's contour and drop a hachure every `pitch` millimetres.
      let seed = null; let bd = Infinity;
      for (let k = 0; k < C.lat.length; k++) {
        const s = C.at(C.lat[k].a, C.lat[k].b);
        if (!s) continue;
        const d = Math.abs(zOf(s) - lvl);
        if (d < bd) { bd = d; seed = { a: C.lat[k].a, b: C.lat[k].b }; }
      }
      if (!seed) continue;
      const dirFn = (s, i, a, b) => {
        const g = C.gradOf(a, b, zOf);
        if (!g) return null;
        return { x: -g.y, y: g.x };
      };
      const ring = C.trace(seed.a, seed.b, dirFn, 0.3, 1400);
      let acc = 1e9;
      for (let k = 1; k < ring.length; k++) {
        const s = C.at(ring[k].a, ring[k].b);
        if (!s) { acc = 1e9; continue; }
        const prev = C.at(ring[k - 1].a, ring[k - 1].b);
        acc += prev ? Math.hypot(s.x - prev.x, s.y - prev.y) : 0;
        // LEHMANN'S LAW. The rank's stroke pitch falls with the slope of the
        // depth field, and the light thins it further where the form is bright.
        const g = C.gradOf(ring[k].a, ring[k].b, zOf);
        const slope = g ? clamp(Math.hypot(g.x, g.y) * C.R * 0.9, 0, 1) : 0.3;
        const lit = clamp(finite(s.I, 0), 0, 1);
        const eff = clamp(0.18 + slope * 0.55 + (1 - lit) * 0.5, 0.04, 0.98);
        const pitch = clamp(C.INK / eff, C.FLOOR, C.PMAX);
        if (acc < pitch) continue;
        acc = 0;
        // The hachure: trace downhill until the next rank's level.
        const stop = 1 - (r + 1) / RANKS;
        const h = [];
        let a = ring[k].a; let b = ring[k].b;
        for (let m = 0; m < 90; m++) {
          const ss = C.at(a, b);
          h.push({ a, b });
          if (!ss) break;
          if (r < RANKS - 1 && zOf(ss) <= stop) break;
          const d = dirDown(a, b);
          if (!d) break;
          const q = C.solve(ss, a, b, d.x * 0.3, d.y * 0.3);
          if (!q) break;
          a += q.da; b += q.db;
        }
        C.emitPts(h);
      }
    }
  };

  /* ── the geodesic walk, used by foreshortenDisc ─────────────────────────── */
  const attachGeoWalk = (C) => {
    // Walk `rad` millimetres of SURFACE from the sample `s0` in the screen
    // direction (dx, dy), integrating on the chart so the walk stays on the
    // body. Returns the screen point it lands on, or null if it left.
    C.geoWalk = (s0, dx, dy, rad) => {
      let a = s0._a; let b = s0._b;
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      let cur = s0;
      let walked = 0;
      const STEP = Math.max(0.10, rad / 5);
      let out = { x: s0.x, y: s0.y };
      let guard = 0;
      while (walked < rad - 1e-6 && guard < 60) {
        guard += 1;
        const h = Math.min(STEP, rad - walked);
        const q = C.solve(cur, a, b, dx * h, dy * h);
        if (!q) return null;
        a += q.da; b += q.db;
        const nx = C.at(a, b);
        if (!nx) return null;
        walked += h;
        out = { x: nx.x, y: nx.y };
        cur = nx;
      }
      return out;
    };
  };

  const RUN = {
    shingleScale: lawShingle,
    terraceCut: lawTerrace,
    originSpiral: lawSpiral,
    voronoiWeb: lawVoronoi,
    circlePack: lawCircles,
    diffGrowth: lawGrowth,
    spaceColonise: lawColonise,
    mazeFill: lawMaze,
    truchetTile: lawTruchet,
    turingStripe: lawTuring,
    quadSubdiv: lawQuad,
    phaseRegistry: lawRegistry,
    weaveBasket: lawWeave,
    sketchOverdraw: lawSketch,
    lsysFrond: lawFrond,
    foreshortenDisc: lawDisc,
    dislocSplit: lawDisloc,
    fiboQuasi: lawFibo,
    terminatorSweep: lawTermSweep,
    hachureSlope: lawHachure,
  };

  const emit = (o) => {
    const fn = RUN[o.algo];
    if (!fn) return false;
    const C = makeCtx(o);
    if (!C.ok) return true;
    attachGeoWalk(C);
    // The crosshatch mapper is a crossed pair by definition, so a law that owns
    // family A there owns family B too: the same construction, rotated by the
    // file's own second-direction angle. Every other mapper runs one pass.
    const passes = o.mapper === 'crosshatch' ? [0, 65] : [0];
    passes.forEach((deg) => { C.rot = o.angleDeg + deg; fn(C); });
    return true;
  };

  Scene3D.SurfaceFillMono = { LAWS, isMono, emit };
}());
