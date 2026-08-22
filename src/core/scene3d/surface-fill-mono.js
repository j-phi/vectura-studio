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

  /* THE WRAP TERM. `sampleAt` already publishes `nz` — the CAMERA-SPACE
   * normal's z component, 1 dead-on to the camera and exactly 0 ON the
   * silhouette — and `surface-fill.js` already reads it for the identical
   * purpose (`limbCrossTaper`, surface-fill.js:3513-3524: "the taper is
   * stated in the geometry's own terms and needs no radius, no bbox and no
   * projection assumption"). `originSpiral` and `mazeFill` build their
   * geometry in flat screen (x, y) — a ring radius, a grid column — with no
   * awareness of how much surface a given screen millimetre actually
   * represents, so a turn or a cell reads the same size whether it sits
   * dead-centre on the form or is riding the limb where the real surface is
   * foreshortening hard. `wrapPitch` spends the same `nz` signal as a
   * multiplier on the tone-driven pitch: unchanged away from the limb,
   * smoothstepped down toward `WRAP_FLOOR` as `nz` approaches 0, so pattern
   * elements compress toward the silhouette the way a globe's own graticule
   * does, independently of whatever the light is doing. `WRAP_FLOOR` keeps
   * the compression from running away to zero pitch exactly at the limb,
   * where cos/sin(nz) is at its least reliable.
   */
  const WRAP_LO = 0.02; const WRAP_HI = 0.38; const WRAP_FLOOR = 0.28;
  const wrapPitch = (pitch, nz) => {
    const a = Math.abs(finite(nz, 1));
    const u = clamp((a - WRAP_LO) / (WRAP_HI - WRAP_LO), 0, 1);
    const eased = u * u * (3 - 2 * u);
    return pitch * (WRAP_FLOOR + (1 - WRAP_FLOOR) * eased);
  };

  // The roster. Order is the order the sheets present them in.
  const LAWS = [
    // Tier 1 — the direction field and the depth terms. Slots S1-S5, S18:
    // nothing in the ~114-law roster constructs a direction field, and nothing
    // separates occlusion or cast shadow from Lambert.
    'etfKang',          // 01 Kang edge-tangent flow, unsigned, anisotropy-weighted
    'defectSplit',      // 02 the line field's +2 index, designed and relocated
    'mezzoRegion',      // 03 per-region randomised orientation, 30 deg guard
    'creviceAO',        // 04 ambient occlusion as its own tone term
    'contactBloom',     // 05 the light's own horizon — cast shadow as a field
    // Tier 2 — real black out of one pen. Slots S6-S8, S17.
    'transReserveMono', // 06 monoline transverse white reserve (Bewick inverted)
    'jitterOverdraw',   // 07 sub-nib overdraw MAGNITUDE as the channel
    'mergeLadder',      // 08 dot - touch - dash - ruling - touch - solid, one law
    'originSpiral',     // 09 one continuous path, local pitch = tone
    // Tier 3 — the diagnosed holes. Slots S10, S14, S15, S16.
    'shearClear',       // 10 the shear-corrected screen clearance
    'phaseBlue',        // 11 blue-noise PHASE on a continuously integrated field
    'dutyConst',        // 12 constant mark count, duty cycle carries tone
    'endShorten',       // 13 shorten-only ends, at one width
    // Tier 4 — aperiodic, non-lattice structures. The anti-banding family.
    'turingStripe',     // 14 reaction-diffusion stripes, density by dislocation
    'voronoiWeb',       // 15 Voronoi edge network, seed density from tone
    'mazeFill',         // 16 aperiodic maze walls on a graded grid
    'diffGrowth',       // 17 differential-growth meander
    'spaceColonise',    // 18 space-colonisation branching
    'fiboQuasi',        // 19 quasiperiodic (Fibonacci-word) clearances
    'hachureSlope',     // 20 cartographic hachures on the depth-slope field
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

    /* A VERIFIED chart step. `solve` is a LINEARISATION of the chart, and every
     * law that walks the body integrates with it. Where the chart degenerates —
     * a cone's apex, an ellipsoid's umbilic pole, the four face-centre meridians
     * of a superellipsoid, the inner ring of a torus — the determinant is small
     * but not small enough to be rejected, and the solved (da, db) lands
     * somewhere else entirely on the parameter square. `at` then returns a
     * perfectly valid front-facing sample THERE, the walk pushes it, and the
     * polyline draws a straight chord between two legitimate but non-adjacent
     * points. Measured on the gallery build: `defectSplit` laid a 42.3 mm chord
     * across the ellipsoid, ten chords totalling 111 mm on the cone, and thirty
     * on the torus of which six crossed the hole — ink outside the silhouette,
     * which invariant 1 forbids.
     *
     * So a step is not taken on trust. The realised SCREEN distance must be
     * within tolerance of the one asked for; a step that is not is retried at
     * half the size, and a step that cannot be trusted at a sixteenth is not
     * taken at all — the walk ends there, which is a stop the caller already
     * knows how to handle. */
    const STEP_TOL = 2.5;
    const stepTo = (s, a, b, dx, dy) => {
      let fx = dx; let fy = dy;
      for (let k = 0; k < 5; k++) {
        const q = solve(s, a, b, fx, fy);
        if (q && Number.isFinite(q.da) && Number.isFinite(q.db)) {
          const na = a + q.da; const nb = b + q.db;
          const ns = at(na, nb);
          if (ns) {
            const got = Math.hypot(ns.x - s.x, ns.y - s.y);
            if (got <= Math.hypot(fx, fy) * STEP_TOL) return { a: na, b: nb, s: ns };
          }
        }
        fx *= 0.5; fy *= 0.5;
      }
      return null;
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
    /* THE SEGMENT GUARD, and why it is structural rather than per-law.
     * Invariant 1 says no ink leaves the silhouette, and the emitters enforce it
     * one VERTEX at a time: every vertex is a sample that came back front-facing.
     * A vertex test is not a segment test. Two vertices can both be on the form
     * with the straight line between them crossing open paper — the torus's hole
     * is the plain case — and that line is what the plotter draws. So a segment
     * longer than anything a law's own sampling produces is not trusted: its
     * midpoint is asked, and a segment whose midpoint is off the visible surface
     * BREAKS the run instead of being drawn. Every caller samples at 0.5 mm or
     * finer, so the threshold never fires on ordinary geometry. */
    const SEG_MAX = Math.max(1.2, FLOOR * 2);
    let cutSegs = 0;
    const spans = (p, q) => {
      const dx = q.x - p.x; const dy = q.y - p.y;
      if (dx * dx + dy * dy <= SEG_MAX * SEG_MAX) return false;
      // Three probes, not one: a chord can re-enter the form at its midpoint.
      for (let k = 1; k <= 3; k++) {
        const f = k / 4;
        if (!inv(p.x + dx * f, p.y + dy * f)) { cutSegs += 1; return true; }
      }
      return false;
    };
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
        if (run.length && spans(run[run.length - 1], s)) flush();
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
        const q = stepTo(s, a, b, px * stepMM, py * stepMM);
        if (!q) break;
        a = q.a; b = q.b;
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

    /* ── the screen substrate: a SCREEN-UNIFORM lattice, a bucket index, and
     * Newton ───────────────────────────────────────────────────────────────
     * The lattice is what `inv` seeds Newton from and what every law scans for
     * its darkest / brightest point, so its spacing has to be even ON THE PAPER.
     * A uniform (a, b) grid is only the same thing when the chart's parameter
     * speed is uniform, and on two of the twelve primitives it is nowhere near:
     *
     *   superellipsoid  the chart is sgn(cos t)|cos t|^0.4 in both angles. At
     *                   t = 0 the PARTNER coordinate's derivative goes as
     *                   |sin t|^-0.6, i.e. to infinity, so one 1/96 step of the
     *                   parameter at a face centre moves the sample a quarter of
     *                   the body across. A uniform lattice therefore has NO
     *                   point at all over a wide band on the four face-centre
     *                   meridians and on the equator, `inv` answers null there,
     *                   and every screen-space law leaves it bare. Measured on
     *                   the gallery build: nearest-lattice-point distance 3.48 mm
     *                   at the 99th percentile against 0.5-0.85 mm on every
     *                   other primitive, and 17.6 % of the visible front surface
     *                   with `inv` returning null. That is the white cross.
     *   torusKnot       the sweep bunches where the knot doubles back: 14.4 %.
     *
     * So the grid is refined where it is coarse ON SCREEN. Each row and each
     * column of the base grid is walked and any interval whose two ends land
     * further apart than LAT_MM is bisected until they do not. The refinement is
     * anisotropic — only the parameter direction that is actually too long gets
     * cut — and both the depth and the total are budgeted, so a chart with a
     * genuine singularity cannot run the sampler away.
     */
    const LG = 96;
    const LAT_MM = 0.75;
    const LAT_MAX = 90000;
    const lat = [];
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    let hiI = -Infinity; let hiA = 0.5; let hiB = 0.5; let hiX = 0; let hiY = 0;
    let faceA = 0.5; let faceB = 0.5; let faceNz = -Infinity; let faceX = 0; let faceY = 0;
    const addLat = (a, b, s) => {
      lat.push({ a, b, x: s.x, y: s.y });
      if (s.x < minX) minX = s.x; if (s.x > maxX) maxX = s.x;
      if (s.y < minY) minY = s.y; if (s.y > maxY) maxY = s.y;
      const ii = finite(s.I, 0);
      if (ii > hiI) { hiI = ii; hiA = a; hiB = b; hiX = s.x; hiY = s.y; }
      const nz = Math.abs(finite(s.nz, 0));
      if (nz > faceNz) { faceNz = nz; faceA = a; faceB = b; faceX = s.x; faceY = s.y; }
    };
    // The base grid. `b` is the periodic wind, so column LG is column 0 read
    // again — keeping it makes the last interval refinable like every other one
    // without entering the same point twice into the lattice.
    const base = [];
    for (let i = 0; i <= LG; i++) {
      const row = [];
      for (let j = 0; j <= LG; j++) {
        const a = i / LG; const b = j / LG;
        const s = at(a, b);
        row.push(s ? { x: s.x, y: s.y } : null);
        if (s && j < LG) addLat(a, b, s);
      }
      base.push(row);
    }
    // Bisect one interval of the parameter square until its ends are within
    // LAT_MM of each other on the paper. An interval with an end off the visible
    // surface is the silhouette running through it, which is not a coarseness to
    // fix: `inv` is entitled to refuse a point that is half off the form.
    const refineSpan = (a0, b0, p0, a1, b1, p1, depth) => {
      if (depth <= 0 || !p0 || !p1 || lat.length >= LAT_MAX) return;
      const dx = p1.x - p0.x; const dy = p1.y - p0.y;
      if (dx * dx + dy * dy <= LAT_MM * LAT_MM) return;
      const am = (a0 + a1) / 2; const bm = (b0 + b1) / 2;
      const sm = at(am, bm);
      if (!sm) return;
      addLat(am, bm, sm);
      const pm = { x: sm.x, y: sm.y };
      refineSpan(a0, b0, p0, am, bm, pm, depth - 1);
      refineSpan(am, bm, pm, a1, b1, p1, depth - 1);
    };
    const LAT_DEPTH = 9;
    for (let i = 0; i <= LG; i++) {
      for (let j = 0; j < LG; j++) {
        refineSpan(i / LG, j / LG, base[i][j], i / LG, (j + 1) / LG, base[i][j + 1], LAT_DEPTH);
      }
    }
    for (let j = 0; j <= LG; j++) {
      for (let i = 0; i < LG; i++) {
        refineSpan(i / LG, j / LG, base[i][j], (i + 1) / LG, j / LG, base[i + 1][j], LAT_DEPTH);
      }
    }
    const ok = lat.length > 32 && Number.isFinite(minX);
    const W = ok ? Math.max(1e-3, maxX - minX) : 1;
    const Hh = ok ? Math.max(1e-3, maxY - minY) : 1;
    const R = Math.min(W, Hh) / 2;
    // The bucket grid tracks the lattice's size, so the 3x3 seed search costs
    // the same however much the refinement above added. 48 stays the floor: it
    // is the grid every unrefined primitive already indexed at.
    const BC = ok ? clamp(Math.round(Math.sqrt(lat.length / 4)), 48, 128) : 48;
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
      // The ring widens ONLY when the tight one found nothing. The index was
      // also reading across its own row edge (gx + i was never bounds-checked),
      // which could seed Newton from the far side of the shape.
      const scan = (ring) => {
        for (let j = -ring; j <= ring; j++) {
          const yy = gy + j;
          if (yy < 0 || yy >= BC) continue;
          for (let i = -ring; i <= ring; i++) {
            const xx = gx + i;
            if (xx < 0 || xx >= BC) continue;
            const arr = buckets.get(yy * BC + xx);
            if (!arr) continue;
            for (let k = 0; k < arr.length; k++) {
              const d = (arr[k].x - x) * (arr[k].x - x) + (arr[k].y - y) * (arr[k].y - y);
              if (d < bd) { bd = d; best = arr[k]; }
            }
          }
        }
      };
      scan(1);
      if (!best) scan(3);
      if (!best) return null;
      let a = best.a; let b = best.b;
      let s = at(a, b);
      // THE CLOSEST SAMPLE SEEN, not the last one. Newton's last iterate can be
      // worse than its seed where the frame is a bad finite difference, and
      // answering null with a valid surface sample already in hand is what left
      // a further 5.5 % of the superellipsoid bare after the lattice was fixed.
      let bestS = null; let bestD = Infinity;
      const keep = (ss) => {
        if (!ss) return;
        const d = Math.hypot(x - ss.x, y - ss.y);
        if (d < bestD) { bestD = d; bestS = ss; }
      };
      keep(s);
      for (let k = 0; k < 6 && s; k++) {
        const dx = x - s.x; const dy = y - s.y;
        const d0 = Math.hypot(dx, dy);
        if (d0 < 0.02) return s;
        const q = solve(s, a, b, dx, dy);
        if (!q) break;
        // A LINE SEARCH on the Newton step. `frame` is a finite difference and
        // near a chart degeneracy it is a poor one, so a full step can land
        // further from the target than it started. Halve until it does not.
        let f = 0.85; let took = false;
        for (let t = 0; t < 3; t++) {
          const na = a + q.da * f;
          if (na >= 0 && na <= 1) {
            const nb = b + q.db * f;
            const ns = at(na, nb);
            if (ns && Math.hypot(x - ns.x, y - ns.y) < d0) { a = na; b = nb; s = ns; keep(ns); took = true; break; }
          }
          f *= 0.5;
        }
        if (!took) break;
      }
      return bestD < 0.30 ? bestS : null;
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
        if (run.length && spans(run[run.length - 1], s)) flush();
        push({ x: s.x, y: s.y, z: s.z });
        prev = pts[i];
      }
      flush();
    };

    /* THE MONO TONE MAP. Both ends are physical and neither is the app's own
     * envelope. That envelope is derived from the master grid's own coverage
     * range and it spans ink area 0.15 to 0.51 — sixteen L*, which is the
     * ceiling every law measured against it inherits, and it is why the first
     * pass of this round came back with L* spans of 2. Here the darkest end is
     * SOLID (area 1: rulings one ink width apart, abutting) and the lightest is
     * the sparse bar. The interpolation is in L*, the perceptual axis, so the
     * ramp is linear to the eye and not to the ink.
     *
     * A clearance below the plot floor is FLOODING by this repository's own
     * definition, and it is spent deliberately here for the same reason
     * `contFieldTouch` spends it: "lines may touch to make pure black". Every
     * law below that reaches L* 4.5 does it this way and the floor counter
     * reports it. */
    const Lstar = (Y) => (Y > 0.008856 ? 116 * Math.pow(Y, 1 / 3) - 16 : 903.3 * Y);
    const invL = (Lv) => (Lv > 8 ? Math.pow((Lv + 16) / 116, 3) : Lv / 903.3);
    const A_LIGHT = clamp(INK / PMAX, 0.02, 0.5);
    const L_LIGHT = Lstar(1 - A_LIGHT);
    // The dark end is capped at 0.90 rather than at 1.0. At one pen width the
    // apparent-tone curve is brutal — area 0.5 is L* 76 and area 0.9 is L* 33 —
    // so an uncapped map puts the whole shadow side of a sphere at solid and
    // the drawing stops being a drawing. 0.90 is a clearance of 0.37 mm: below
    // the plot floor, deliberately, and still two distinguishable rulings.
    // The laws that go all the way to solid do it in their own bodies and say so.
    const A_DARK = 0.90;
    const L_DARK = Lstar(1 - A_DARK);
    // Interpolate BETWEEN the two ends. Anchoring the dark end at L* 0 and
    // clamping the area afterwards is not the same ramp: it pins everything
    // below radiance 0.39 at the cap, and every field law measured a median
    // paper gap of 0.4 mm — the cap — over most of the form.
    const areaFor = (I) => clamp(
      1 - invL(L_DARK + (L_LIGHT - L_DARK) * clamp(finite(I, 0), 0, 1)), 0.02, A_DARK,
    );
    const pitchFor = (I) => clamp(INK / areaFor(I), INK / A_DARK, PMAX);
    // The same map with the plot floor honoured, for the laws whose identity is
    // that they never crowd past legibility.
    const pitchLegible = (I) => Math.max(FLOOR, pitchFor(I));
    // Shade in 0..1, 1 = darkest.
    const shadeAt = (x, y) => { const s = inv(x, y); return s ? clamp(1 - finite(s.I, 0), 0, 1) : null; };

    return {
      WF, PEN, INK, FLOOR, PMAX, MINMARK, hash, wrapB, at, solve, stepTo, frame,
      edgeBetween, emitPts, trace, gradOf, inv, emitScr, pitchFor, pitchLegible,
      areaFor, shadeAt,
      emittedCount: () => famIdx,
      cutCount: () => cutSegs,
      lat, ok, minX, minY, maxX, maxY, W, H: Hh, R,
      hiA, hiB, hiX, hiY, faceA, faceB, faceX, faceY,
      targetArea: o.targetArea, back: o.back, mapper: o.mapper,
      rot: 0,
    };
  };

  /* ── THE STREAMLINE CHASSIS (direction-field laws) ────────────────────────
   * Jobard & Lefer's evenly-spaced streamline placement, run on a variable
   * separation. It is only the PLACEMENT; what makes each of the field laws a
   * law is the DIRECTION FIELD it is handed, which is the one axis no law in
   * the existing roster touches. Every step is integrated on the chart, so a
   * streamline follows the body and stops on the silhouette.
   */
  const streamFamily = (C, dirAt, clearAt) => {
    const CELLS = new Map();
    const GS = C.PMAX;
    const put = (p) => {
      const k = `${Math.floor(p.x / GS)},${Math.floor(p.y / GS)}`;
      if (!CELLS.has(k)) CELLS.set(k, []);
      CELLS.get(k).push(p);
    };
    const tooClose = (x, y, d) => {
      const g = Math.ceil(d / GS) + 1;
      const cx = Math.floor(x / GS); const cy = Math.floor(y / GS);
      for (let j = -g; j <= g; j++) {
        for (let i = -g; i <= g; i++) {
          const arr = CELLS.get(`${cx + i},${cy + j}`);
          if (!arr) continue;
          for (let k = 0; k < arr.length; k++) {
            const dx = arr[k].x - x; const dy = arr[k].y - y;
            if (dx * dx + dy * dy < d * d) return true;
          }
        }
      }
      return false;
    };
    const STEP = 0.34;
    const walk = (s0, sign) => {
      const pts = [];
      let a = s0._a; let b = s0._b;
      let cur = s0;
      let px = 0; let py = 0;
      for (let i = 0; i < 2600; i++) {
        pts.push({ x: cur.x, y: cur.y, z: cur.z });
        const d = dirAt(cur);
        if (!d) break;
        let dx = d.x * sign; let dy = d.y * sign;
        const L = Math.hypot(dx, dy);
        if (!(L > 1e-9)) break;
        dx /= L; dy /= L;
        // A LINE field, not a vector field: keep the walk going the same way.
        if (i > 0 && (dx * px + dy * py) < 0) { dx = -dx; dy = -dy; }
        px = dx; py = dy;
        // A VERIFIED step. Unverified, the walk jumps the chart wherever the
        // Jacobian degenerates and the line draws as a chord across the body —
        // see `stepTo`. `defectSplit` laid 42 mm of it on the ellipsoid.
        const q = C.stepTo(cur, a, b, dx * STEP, dy * STEP);
        if (!q) break;
        a = q.a; b = q.b;
        const nx = q.s;
        // The separation test. The immediate past of this same line is exempt.
        // A stop is a free end, so a walk must have run at least a few
        // millimetres before it is allowed to take one, and the test radius is
        // tight enough that a line prefers the silhouette to a neighbour.
        // Jobard & Lefer's d_test. It was set to 0.42 to reduce free ends and
        // that DOUBLED the density: a new line could run parallel to an
        // existing one at half a separation for its whole length, and every
        // field law measured a median paper gap of 0.3 mm against a requested
        // 0.9. 0.80 is the value that makes the placed spacing the requested
        // one; the free ends it costs are reported, split out, in the table.
        if (i > 14 && tooClose(nx.x, nx.y, clearAt(nx) * 0.80)) break;
        cur = nx;
      }
      return pts;
    };
    // SEEDING. The natural seed — the darkest point on the form — is on or near
    // the terminator, and on a sphere that is exactly where the chart's frame is
    // most sheared: `solve` fails there and the walk dies on its first step,
    // which measured as a completely empty cell. So the growth seeds (derived
    // from placed lines, LIFO, which is what keeps the family growing outward
    // from one line) are backed by a FALLBACK list — the whole lattice, dark
    // first — and a seed whose walk dies is simply the next one's problem.
    const fallback = [];
    for (let k = 0; k < C.lat.length; k += 2) {
      const s = C.at(C.lat[k].a, C.lat[k].b);
      if (s) fallback.push(s);
    }
    if (!fallback.length) return;
    fallback.sort((p, q) => finite(p.I, 0) - finite(q.I, 0));
    const grown = [];
    let fi = 0;
    let lines = 0;
    while (lines < 900) {
      let s = null;
      if (grown.length) s = grown.pop();
      else if (fi < fallback.length) { s = fallback[fi]; fi += 1; }
      else break;
      if (!s) continue;
      const sep = clearAt(s);
      if (tooClose(s.x, s.y, sep * 0.95)) continue;
      const fwd = walk(s, 1);
      const bwd = walk(s, -1);
      bwd.reverse();
      const line = bwd.concat(fwd.slice(1));
      if (line.length < 3) continue;
      lines += 1;
      line.forEach(put);
      C.emitScr(line);
      // New seeds, a separation either side, every separation along.
      let acc = 1e9;
      for (let i = 1; i < line.length - 1; i++) {
        acc += Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y);
        const sm = C.inv(line[i].x, line[i].y);
        if (!sm) { continue; }
        const d = clearAt(sm);
        if (acc < d) continue;
        acc = 0;
        const tx = line[i + 1].x - line[i - 1].x; const ty = line[i + 1].y - line[i - 1].y;
        const tl = Math.hypot(tx, ty) || 1;
        [-1, 1].forEach((sg) => {
          const nx = line[i].x + (-ty / tl) * d * sg;
          const ny = line[i].y + (tx / tl) * d * sg;
          const ns = C.inv(nx, ny);
          if (ns && !tooClose(nx, ny, d * 0.95)) grown.push(ns);
        });
      }
    }
  };

  /* ── the screen fields every law below reads ───────────────────────────── */
  const attachFields = (C) => {
    // A coarse screen raster of camera depth and radiance, built from the chart
    // so it is exact on the surface and empty off it.
    const N = 132;
    const dx = C.W / N; const dy = C.H / N;
    const Z = new Float32Array((N + 1) * (N + 1));
    const Ii = new Float32Array((N + 1) * (N + 1));
    const M = new Uint8Array((N + 1) * (N + 1));
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const s = C.inv(C.minX + i * dx, C.minY + j * dy);
        const k = j * (N + 1) + i;
        if (!s) continue;
        M[k] = 1; Z[k] = finite(s.z, 0); Ii[k] = finite(s.I, 0);
      }
    }
    const gi = (x) => clamp(Math.round((x - C.minX) / dx), 0, N);
    const gj = (y) => clamp(Math.round((y - C.minY) / dy), 0, N);
    C.depthAt = (x, y) => { const k = gj(y) * (N + 1) + gi(x); return M[k] ? Z[k] : null; };
    // Screen gradient of depth — the steepest-descent direction of the body.
    C.gradZ = (x, y) => {
      const i = gi(x); const j = gj(y);
      if (i < 1 || j < 1 || i >= N || j >= N) return null;
      const k = j * (N + 1) + i;
      if (!M[k] || !M[k - 1] || !M[k + 1] || !M[k - (N + 1)] || !M[k + (N + 1)]) return null;
      return { x: (Z[k + 1] - Z[k - 1]) / (2 * dx), y: (Z[k + (N + 1)] - Z[k - (N + 1)]) / (2 * dy) };
    };
    // AMBIENT OCCLUSION, as its own term. Horizon sampling in twelve screen
    // directions over the depth raster: a direction is occluded when a nearby
    // sample stands NEARER the camera than the tangent plane predicts. On a
    // convex body this darkens the turn into the limb; in a crevice it darkens
    // the crevice, which Lambert does not.
    const AOR = Math.max(2.0, C.R * 0.30);
    C.aoAt = (x, y) => {
      const z0 = C.depthAt(x, y);
      if (z0 == null) return null;
      let occ = 0; let n = 0;
      for (let d = 0; d < 12; d++) {
        const th = (d / 12) * Math.PI * 2;
        const cx = Math.cos(th); const cy = Math.sin(th);
        let best = 0;
        for (let r = AOR * 0.18; r <= AOR; r += AOR * 0.18) {
          const z = C.depthAt(x + cx * r, y + cy * r);
          if (z == null) continue;
          const rise = (z - z0) / r;              // nearer = larger z
          if (rise > best) best = rise;
        }
        occ += clamp(best * 1.5, 0, 1); n += 1;
      }
      return n ? clamp(occ / n, 0, 1) : 0;
    };
    // The LIGHT'S OWN HORIZON — cast/contact shadow density as a field of its
    // own, marched along the light's screen direction over the same raster.
    C.lightDir = (() => {
      // Recover the light's screen direction from the radiance gradient, which
      // is the one thing this file can read without reaching into the lighting.
      let gx = 0; let gy = 0;
      for (let j = 2; j < N - 1; j += 3) {
        for (let i = 2; i < N - 1; i += 3) {
          const k = j * (N + 1) + i;
          if (!M[k] || !M[k - 1] || !M[k + 1] || !M[k - (N + 1)] || !M[k + (N + 1)]) continue;
          gx += (Ii[k + 1] - Ii[k - 1]); gy += (Ii[k + (N + 1)] - Ii[k - (N + 1)]);
        }
      }
      const L = Math.hypot(gx, gy) || 1;
      return { x: gx / L, y: gy / L };
    })();
    C.horizonAt = (x, y) => {
      const z0 = C.depthAt(x, y);
      if (z0 == null) return null;
      const R2 = Math.max(2.0, C.R * 0.9);
      let best = 0;
      for (let r = R2 * 0.05; r <= R2; r += R2 * 0.05) {
        const z = C.depthAt(x + C.lightDir.x * r, y + C.lightDir.y * r);
        if (z == null) break;
        const rise = (z - z0) / r;
        if (rise > best) best = rise;
      }
      return clamp(best * 1.2, 0, 1);
    };
  };

  /* ── 01 · etfKang ───────────────────────────────────────────────────────────
   * The DIRECTION FIELD is the law. Kang, Lee & Chui's edge tangent flow, built
   * here on the body's own depth field rather than on an image: the initial
   * tangent is perpendicular to the screen gradient of camera depth, and it is
   * then smoothed by Kang's UNSIGNED rule — the neighbour's contribution is
   * signed by phi = sign(t·t') and weighted by wd = |t·t'| — which is what stops
   * a plain vector diffusion from manufacturing swirl at a degenerate point.
   * The confidence weight is the field's own anisotropy, so a place where the
   * body has no preferred direction is dominated by its neighbours instead of
   * dominating them. Rulings are then placed at an evenly-spaced separation
   * driven by the tone. Nothing in the existing roster of ~114 laws constructs a
   * direction field at all. Reaches its darkest at the plot floor.
   * DEPTH: the rulings wrap the body as its own depth isocontours, so the
   * curvature is stated by the direction of the ink and not by its density.
   */
  const lawEtf = (C) => {
    const NG = 96;
    const dx = C.W / NG; const dy = C.H / NG;
    let TX = new Float32Array((NG + 1) * (NG + 1));
    let TY = new Float32Array((NG + 1) * (NG + 1));
    const CF = new Float32Array((NG + 1) * (NG + 1));
    const MK = new Uint8Array((NG + 1) * (NG + 1));
    for (let j = 0; j <= NG; j++) {
      for (let i = 0; i <= NG; i++) {
        const x = C.minX + i * dx; const y = C.minY + j * dy;
        const g = C.gradZ(x, y);
        const k = j * (NG + 1) + i;
        if (!g) continue;
        const L = Math.hypot(g.x, g.y);
        if (!(L > 1e-9)) continue;
        MK[k] = 1;
        TX[k] = -g.y / L; TY[k] = g.x / L;
        CF[k] = L;                       // anisotropy = confidence
      }
    }
    let mx = 0;
    for (let k = 0; k < CF.length; k++) if (CF[k] > mx) mx = CF[k];
    for (let k = 0; k < CF.length; k++) CF[k] = mx > 0 ? CF[k] / mx : 0;
    // Kang's iteration.
    for (let it = 0; it < 4; it++) {
      const NX = new Float32Array(TX.length);
      const NY = new Float32Array(TY.length);
      for (let j = 2; j < NG - 1; j++) {
        for (let i = 2; i < NG - 1; i++) {
          const k = j * (NG + 1) + i;
          if (!MK[k]) continue;
          let sx = 0; let sy = 0;
          for (let q = -2; q <= 2; q++) {
            for (let p = -2; p <= 2; p++) {
              const kk = (j + q) * (NG + 1) + (i + p);
              if (!MK[kk]) continue;
              const dot = TX[k] * TX[kk] + TY[k] * TY[kk];
              const phi = dot >= 0 ? 1 : -1;
              const wd = Math.abs(dot);
              // Magnitude weight: the more confident neighbour wins.
              const wm = (1 + Math.tanh(CF[kk] - CF[k])) / 2;
              const w = phi * wd * wm;
              sx += TX[kk] * w; sy += TY[kk] * w;
            }
          }
          const L = Math.hypot(sx, sy);
          if (L > 1e-9) { NX[k] = sx / L; NY[k] = sy / L; } else { NX[k] = TX[k]; NY[k] = TY[k]; }
        }
      }
      TX = NX; TY = NY;
    }
    const gi = (x) => clamp(Math.round((x - C.minX) / dx), 0, NG);
    const gj = (y) => clamp(Math.round((y - C.minY) / dy), 0, NG);
    const dirAt = (s) => {
      const k = gj(s.y) * (NG + 1) + gi(s.x);
      if (!MK[k]) return null;
      return { x: TX[k], y: TY[k] };
    };
    streamFamily(C, dirAt, (s) => C.pitchFor(finite(s.I, 0)));
  };

  /* ── 02 · defectSplit ───────────────────────────────────────────────────────
   * A line field on a closed body must carry a total index of +2 — it cannot be
   * combed flat, and the singularities cannot be removed. Every hatching law in
   * the roster leaves them wherever the parameterisation happened to put them,
   * which on a sphere is the chart's poles: a visible whorl in the middle of the
   * drawing. This law DESIGNS them instead. The +2 is split into four +1/2
   * defects and they are placed where a defect cannot be read as a mistake — two
   * driven out onto the silhouette, two buried in the deepest shadow where the
   * ink is closing up anyway. The field is the argument sum
   * theta(p) = sum k_i * arg(p - d_i), which realises exactly those indices, and
   * the rulings are its integral curves at a tone-driven separation.
   * DEPTH: the ink sweeps around the body's own poles rather than around the
   * chart's, so the swirl reads as the form turning and not as a seam.
   */
  const lawDefect = (C) => {
    const cx = (C.minX + C.maxX) / 2; const cy = (C.minY + C.maxY) / 2;
    // The two dark defects: the darkest place on the form and its neighbour.
    let dk = null; let worst = Infinity;
    C.lat.forEach((p) => {
      const s = C.at(p.a, p.b);
      if (!s) return;
      if (finite(s.I, 0) < worst) { worst = finite(s.I, 0); dk = s; }
    });
    if (!dk) return;
    const ux = dk.x - cx; const uy = dk.y - cy;
    const uL = Math.hypot(ux, uy) || 1;
    const nx = -uy / uL; const ny = ux / uL;
    const defects = [
      // Two on the silhouette, perpendicular to the light's axis.
      { x: cx + nx * C.R * 0.99, y: cy + ny * C.R * 0.99, k: 0.5 },
      { x: cx - nx * C.R * 0.99, y: cy - ny * C.R * 0.99, k: 0.5 },
      // Two buried in the deep shadow, a third of a radius apart.
      { x: dk.x + nx * C.R * 0.16, y: dk.y + ny * C.R * 0.16, k: 0.5 },
      { x: dk.x - nx * C.R * 0.16, y: dk.y - ny * C.R * 0.16, k: 0.5 },
    ];
    const dirAt = (s) => {
      let th = 0;
      for (let i = 0; i < defects.length; i++) {
        const d = defects[i];
        th += d.k * Math.atan2(s.y - d.y, s.x - d.x);
      }
      return { x: Math.cos(th), y: Math.sin(th) };
    };
    streamFamily(C, dirAt, (s) => C.pitchFor(finite(s.I, 0)));
  };

  /* ── 03 · mezzoRegion ───────────────────────────────────────────────────────
   * The mezzotint route. Instead of a scheduled second and third family at fixed
   * angles — which is the move this programme has already refuted twice — the
   * form is partitioned into IRREGULAR regions by a blue-noise scatter, and each
   * region takes its own ruling angle drawn from a set with a 30 degree minimum
   * separation. There is no global direction anywhere, so there is no global
   * period, no beat between families, and no lattice for the eye to lock onto:
   * the whole drawing is one texture at one clearance whose orientation
   * decorrelates every few millimetres. Tone is carried entirely by the
   * clearance inside each region, which is continuous across the boundaries
   * because it is read from the light and not from the region.
   * DEPTH: the regions are laid on the CHART, so their size on the paper
   * shrinks toward the limb by projection alone — a texture gradient the law
   * never computes.
   */
  const lawMezzo = (C) => {
    const seeds = [];
    const REG = Math.max(3.0, C.R * 0.20);
    for (let t = 0; t < 4000 && seeds.length < 200; t++) {
      const x = C.minX + C.hash(t * 11 + 5, 23) * C.W;
      const y = C.minY + C.hash(t * 11 + 6, 29) * C.H;
      if (!C.inv(x, y)) continue;
      let clash = false;
      for (let k = 0; k < seeds.length; k++) {
        if (Math.hypot(seeds[k].x - x, seeds[k].y - y) < REG) { clash = true; break; }
      }
      if (clash) continue;
      // Six angles, 30 degrees apart, so any two neighbouring regions are at
      // least the beat-guard separation apart.
      const ai = Math.floor(C.hash(t * 11 + 7, 31) * 6) % 6;
      seeds.push({ x, y, th: (C.rot + ai * 30) * Math.PI / 180 });
    }
    if (!seeds.length) return;
    const dirAt = (s) => {
      let best = seeds[0]; let bd = Infinity;
      for (let k = 0; k < seeds.length; k++) {
        const d = (seeds[k].x - s.x) * (seeds[k].x - s.x) + (seeds[k].y - s.y) * (seeds[k].y - s.y);
        if (d < bd) { bd = d; best = seeds[k]; }
      }
      return { x: Math.cos(best.th), y: Math.sin(best.th) };
    };
    streamFamily(C, dirAt, (s) => C.pitchFor(finite(s.I, 0)));
  };

  /* ── 04 · creviceAO ─────────────────────────────────────────────────────────
   * Tone from a term that is NOT Lambert. Nothing in the roster distinguishes
   * "dark because it faces away from the light" from "dark because it is down a
   * crevice"; every law reads the same radiance. This one reads AMBIENT
   * OCCLUSION — the fraction of the hemisphere the surface cannot see, sampled
   * as a horizon over the body's own depth field — and spends it as clearance.
   * The result is a drawing that darkens where the body FOLDS, independently of
   * where the lamp is: the turn into the limb, the waist of a capsule, the seat
   * of a contact. Lambert is retained only as a weak second term so the drawing
   * is still lit; the crevice term is what carries the read.
   * DEPTH: occlusion is the one shading cue the eye interprets as geometry
   * rather than as illumination. A drawing shaded by it reads as a solid whether
   * or not the light makes sense.
   */
  const lawCrevice = (C) => {
    const ang = (C.rot + 90) * Math.PI / 180;
    const dirAt = () => ({ x: Math.cos(ang), y: Math.sin(ang) });
    // The occlusion term is stretched over ITS OWN measured range on this form,
    // because ambient occlusion on a convex body occupies a narrow band and an
    // unstretched term delivers an L* span of 3.
    let aoLo = Infinity; let aoHi = -Infinity;
    for (let k = 0; k < C.lat.length; k += 3) {
      const v2 = C.aoAt(C.lat[k].x, C.lat[k].y);
      if (v2 == null) continue;
      if (v2 < aoLo) aoLo = v2;
      if (v2 > aoHi) aoHi = v2;
    }
    const span = (aoHi - aoLo) > 1e-4 ? (aoHi - aoLo) : 1;
    const clearAt = (s) => {
      const raw = C.aoAt(s.x, s.y);
      const ao = raw == null ? 0 : clamp((raw - aoLo) / span, 0, 1);
      const lam = clamp(finite(s.I, 0), 0, 1);
      // Two-thirds occlusion, one-third Lambert.
      const t = clamp(1 - (0.70 * ao + 0.30 * (1 - lam)), 0, 1);
      return C.pitchFor(t);
    };
    streamFamily(C, dirAt, clearAt);
  };

  /* ── 05 · contactBloom ──────────────────────────────────────────────────────
   * Cast shadow as a field of its own. The tone here is the LIGHT'S HORIZON: at
   * every point the depth field is marched toward the lamp, and the darkness is
   * how far the body rises between that point and the light. On a convex form
   * that is not the same function as n·l — it saturates hard just past the
   * terminator and stays saturated, which is exactly how a real cast shadow
   * behaves and exactly what the Lambert term smears out. That is why this law
   * exists: "not enough intensity in the darkest shadow areas" is a complaint
   * about a shading term that has no floor, and a horizon term has one.
   * The clearance is driven from the horizon, and where the horizon saturates the
   * clearance goes to one ink width and the rulings ABUT — genuine black, from a
   * single family, without a crossed partner.
   * DEPTH: a cast shadow has an edge that belongs to the OCCLUDER, not to the
   * surface it falls on. That is the strongest depth statement available.
   */
  const lawContact = (C) => {
    // The rulings run ALONG THE LIGHT'S OWN SCREEN DIRECTION, not at the fill
    // angle. Measured against `contFieldTouch` on a detail crop the two were
    // 90.2 % identical when this family was ruled at the fill angle: the
    // horizon term was doing real work but the DRAWING was the same drawing.
    // Down-light rulings put the umbra's edge across the grain instead of
    // along it, which is both the distinguishing geometry and the correct one —
    // a cast-shadow edge belongs to the occluder and should cut the hatching,
    // not run with it.
    const dirAt = () => ({ x: C.lightDir.x, y: C.lightDir.y });
    // The horizon over the whole form, stretched over its own range, so the
    // penumbra occupies the drawing rather than a corner of it.
    let hLo = Infinity; let hHi = -Infinity;
    for (let k = 0; k < C.lat.length; k += 3) {
      const v2 = C.horizonAt(C.lat[k].x, C.lat[k].y);
      if (v2 == null) continue;
      if (v2 < hLo) hLo = v2;
      if (v2 > hHi) hHi = v2;
    }
    const hSpan = (hHi - hLo) > 1e-4 ? (hHi - hLo) : 1;
    const clearAt = (s) => {
      const raw = C.horizonAt(s.x, s.y);
      const hh = raw == null ? 0 : clamp((raw - hLo) / hSpan, 0, 1);
      const lam = clamp(finite(s.I, 0), 0, 1);
      const t = clamp(lam * (1 - hh * 0.92), 0, 1);
      const p = C.pitchFor(t);
      // THE UMBRA'S OWN FLOOR, entered CONTINUOUSLY. A hard threshold here was
      // measured at 15.0 long-wave moire — the drawing banded on the horizon
      // contour. Smootherstepped from the plot floor to one ink width over the
      // top third of the horizon, the same passage measures a fraction of that.
      const u = clamp((hh - 0.55) / 0.45, 0, 1);
      const uu = u * u * u * (u * (u * 6 - 15) + 10);
      return p * (1 - uu) + Math.max(C.INK * 0.98, C.INK) * uu;
    };
    streamFamily(C, dirAt, clearAt);
  };

  /* ── 06 · transReserveMono ──────────────────────────────────────────────────
   * Bewick's white line, at ONE pen width and in ONE direction — the move the
   * research names as the genuine unexplored direction, and which does not exist
   * anywhere in the roster (`transverseReserve` spends stroke width; `penReserve`
   * is a crosshatch on three nibs). The ground is flooded: rulings at one ink
   * width, abutting, so the paper is SOLID. The tone is then cut back out of it
   * as TRANSVERSE white bars, phase-aligned across the whole family so the
   * reserve reads as a clean cross-grain and not as noise. Ink area is therefore
   * (1 - whiteFraction) and is not capped at the single-family 0.509 at all: this
   * law starts at black and works upward, which is the opposite of every other
   * law here. The bar width eases with the light and the bar PITCH is jittered
   * per band by a blue-noise offset so the reserve cannot band.
   * DEPTH: the white bars run cross-contour, so the reserve itself is a set of
   * form lines wrapping the body — the highlight is not an absence, it is a
   * structure.
   */
  const lawTransReserve = (C) => {
    const ang = (C.rot + 90) * Math.PI / 180;
    const ux = Math.cos(ang); const uy = Math.sin(ang);
    const vx = -uy; const vy = ux;
    const cx = (C.minX + C.maxX) / 2; const cy = (C.minY + C.maxY) / 2;
    const half = Math.hypot(C.W, C.H) / 2;
    const P = C.INK * 0.96;                    // the flooded ground: abutting
    // The reserve PERIOD follows the tone: a wide bar in a wide period reads as
    // a hole (measured: a 12.5 mm bare disc), so the period contracts as the
    // white fraction grows and the highlight comes out as a fine cross-grain.
    const barFor = (want) => clamp((C.INK * 0.92) / Math.max(0.02, want), C.FLOOR * 1.5, C.FLOOR * 4.0);
    const nLines = Math.ceil((2 * half) / P);
    const NS = Math.max(40, Math.round((2 * half) / 0.3));
    for (let li = 0; li <= nLines; li++) {
      const off = -half + li * P;
      let pts = [];
      for (let k = 0; k <= NS; k++) {
        const t = -half + (2 * half) * (k / NS);
        const x = cx + vx * off + ux * t;
        const y = cy + vy * off + uy * t;
        const s = C.inv(x, y);
        if (!s) {
          if (pts.length) { C.emitScr(pts); pts = []; }
          continue;
        }
        // The white fraction the tone wants, cut as ONE bar per period.
        const want = C.areaFor(clamp(finite(s.I, 0), 0, 1));
        const white = clamp(1 - want, 0, 0.94);
        const BAR = barFor(want);
        // Phase-aligned across the family (the bar is a straight cross-grain),
        // with a blue-noise offset PER BAND so the grain cannot band.
        const band = Math.floor((t + half) / BAR);
        const jit = (C.hash(band * 8191 + 17, 3) - 0.5) * BAR * 0.35;
        const centre = (band + 0.5) * BAR - half + jit;
        if (Math.abs(t - centre) < (white * BAR) / 2) {
          if (pts.length) { C.emitScr(pts); pts = []; }
          continue;
        }
        pts.push({ x, y });
      }
      if (pts.length) C.emitScr(pts);
    }
  };

  /* ── 07 · jitterOverdraw ────────────────────────────────────────────────────
   * The ballpoint law. A ruling is drawn more than once, and what carries the
   * tone is not how many passes it gets but HOW FAR APART they wander: the
   * sub-nib offset MAGNITUDE is the channel. In the light the passes lie within
   * a third of a nib of each other and read as one clean line; into the shadow
   * the jitter opens to a nib and a half and the passes cross and re-cross,
   * building a corridor of ink whose darkness rises continuously with no pass
   * ever appearing or disappearing. The existing adjacent-pass family steps by a
   * FIXED 0.55 of a nib and moves the COUNT; this moves the step and holds the
   * count, which is a different quantity eased.
   * Reaches black because at full jitter the corridor is wider than the nib and
   * three passes fill it. DEPTH: the jitter is a smooth two-octave tremor whose
   * phase is anchored to arc length along the ruling, so the wander follows the
   * form rather than the paper — the hand appears to have felt the surface.
   */
  const lawJitter = (C) => {
    const ang = (C.rot + 90) * Math.PI / 180;
    const ux = Math.cos(ang); const uy = Math.sin(ang);
    const vx = -uy; const vy = ux;
    const cx = (C.minX + C.maxX) / 2; const cy = (C.minY + C.maxY) / 2;
    const half = Math.hypot(C.W, C.H) / 2;
    const NS = Math.max(30, Math.round((2 * half) / 0.3));
    const PASSES = 3;
    // The clearance is the ordinary one and is NEVER taken below the plot
    // floor: this law's whole claim is that what goes past 0.509 is the JITTER,
    // not the crowding.
    let off = -half;
    let guard = 0;
    let li = 0;
    while (off < half && guard < 1400) {
      guard += 1;
      // Sample the ruling once for its clearance and for its jitter demand.
      let sumP = 0; let cnt = 0;
      for (let k = 0; k <= NS; k += 3) {
        const t = -half + (2 * half) * (k / NS);
        const s = C.inv(cx + vx * off + ux * t, cy + vy * off + uy * t);
        if (s) { sumP += C.pitchLegible(finite(s.I, 0)); cnt += 1; }
      }
      const pitch = cnt ? sumP / cnt : C.PMAX;
      for (let p = 0; p < PASSES; p++) {
        let pts = [];
        const seed = li * 977 + p * 131;
        let drawn = false;
        for (let k = 0; k <= NS; k++) {
          const t = -half + (2 * half) * (k / NS);
          const bx = cx + vx * off + ux * t;
          const by = cy + vy * off + uy * t;
          const s = C.inv(bx, by);
          if (!s) { if (pts.length) { C.emitScr(pts); pts = []; } continue; }
          // THE CHANNEL. Zero while a single family can still deliver the tone
          // by clearance alone; opening to half the floor once it cannot, which
          // is the only place the extra darkness can come from at one width.
          const want = C.pitchFor(finite(s.I, 0));
          const over = clamp((C.FLOOR - want) / Math.max(1e-6, C.FLOOR - C.INK), 0, 1);
          const amp = (C.FLOOR / 2) * over * over * (3 - 2 * over);
          if (p > 0 && amp < C.INK * 0.42) {
            // The pass would only retrace: the pen does not go down for it.
            if (pts.length) { C.emitScr(pts); pts = []; }
            continue;
          }
          const tr = (k0, u) => {
            const i0 = Math.floor(u); const f = u - i0;
            const a = C.hash(seed + k0, i0) - 0.5;
            const b = C.hash(seed + k0, i0 + 1) - 0.5;
            const w = f * f * (3 - 2 * f);
            return a + (b - a) * w;
          };
          const j = tr(0, t / 5.5) * amp * 2 + tr(4400, t / 1.7) * amp * 0.7;
          pts.push({ x: bx + vx * j, y: by + vy * j });
          drawn = true;
        }
        if (pts.length) C.emitScr(pts);
        void drawn;
      }
      off += clamp(pitch, C.FLOOR, C.PMAX);
      li += 1;
    }
  };

  /* ── 08 · mergeLadder ───────────────────────────────────────────────────────
   * The whole merge ramp as ONE continuous law: a dot, then dots that touch,
   * then a dash, then an unbroken ruling, then rulings that touch, then solid.
   * The existing dash-ramp mark law walks the middle two legs only and stops.
   * Here the entire range from bare paper to solid black is a single monotone
   * parameter m: below m = 1 the ruling is a train of marks whose LENGTH grows
   * and whose gap shrinks at a fixed period; at m = 1 the marks meet and the
   * ruling is continuous; above m = 1 the FAMILY closes up, the clearance
   * falling from the plot floor to one ink width, and at m = 2 the rulings abut
   * and the passage is solid. Nothing appears and nothing disappears anywhere on
   * that ramp — every transition is a length or a gap going continuously to
   * zero. That is what makes it reach real black without a second family and
   * without ever showing a threshold.
   * DEPTH: the mark period is held constant in SCREEN millimetres while the
   * ruling walks the chart, so the marks foreshorten in step with the form.
   */
  const lawMerge = (C) => {
    const ang = (C.rot + 90) * Math.PI / 180;
    const ux = Math.cos(ang); const uy = Math.sin(ang);
    const vx = -uy; const vy = ux;
    const cx = (C.minX + C.maxX) / 2; const cy = (C.minY + C.maxY) / 2;
    const half = Math.hypot(C.W, C.H) / 2;
    const PERIOD = C.FLOOR * 1.8;      // mark period along the ruling
    const NS = Math.max(60, Math.round((2 * half) / 0.28));
    // The family walks with an INTEGRATED clearance so the second half of the
    // ramp (rulings closing) is continuous too.
    const mOf = (s) => {
      // targetArea over the area a full continuous family at the floor lays.
      const want = C.areaFor(clamp(finite(s.I, 0), 0, 1));
      const full = C.INK / C.FLOOR;                  // 0.509
      return clamp(want / full, 0.03, 1) + clamp((want - full) / Math.max(1e-6, 1 - full), 0, 1);
    };
    let off = -half;
    let guard = 0;
    while (off < half && guard < 2200) {
      guard += 1;
      let pts = [];
      let sumM = 0; let cnt = 0;
      for (let k = 0; k <= NS; k++) {
        const t = -half + (2 * half) * (k / NS);
        const x = cx + vx * off + ux * t;
        const y = cy + vy * off + uy * t;
        const s = C.inv(x, y);
        if (!s) { if (pts.length) { C.emitScr(pts); pts = []; } continue; }
        const m = mOf(s);
        sumM += m; cnt += 1;
        // Leg 1: duty cycle. m >= 1 ⇒ unbroken.
        if (m < 1) {
          const ph = ((t + half) / PERIOD) % 1;
          const duty = clamp(m, 0.02, 1);
          // The mark is centred in its period so it GROWS from a dot.
          if (Math.abs(ph - 0.5) > duty / 2) {
            if (pts.length) { C.emitScr(pts); pts = []; }
            continue;
          }
        }
        pts.push({ x, y });
      }
      if (pts.length) C.emitScr(pts);
      const m = cnt ? sumM / cnt : 0.4;
      // Leg 2: the clearance. Floor at m = 1, one ink width at m = 2.
      const p = m <= 1 ? C.FLOOR + (C.PMAX - C.FLOOR) * (1 - m)
        : Math.max(C.INK * 0.98, C.FLOOR - (C.FLOOR - C.INK * 0.98) * (m - 1));
      off += clamp(p, C.INK * 0.9, C.PMAX);
    }
  };

  /* ── 09 · shearClear ────────────────────────────────────────────────────────
   * The clearance metric, done correctly. The continuous-field family measures
   * the on-paper gap as |proj(cross(t, n))| — the projected length of the
   * surface direction that crosses the ruling — and its own documentation names
   * the omission: that is not the screen clearance, because it ignores the SHEAR
   * between the projected cross-direction and the projected ruling. Near a
   * silhouette the two become nearly parallel and the true perpendicular gap is
   * a fraction of the projected offset, so the family crowds where it believes
   * it is even. Here the clearance is the honest one — the component of the
   * projected step PERPENDICULAR to the projected ruling, taken from the same
   * Jacobian the walk itself uses — and the ruling positions are integrated
   * against it. The visible consequence is at the limb: the false limb-darkening
   * that the field family produces is simply not there.
   * DEPTH: with the shear removed, the density that remains at the limb is the
   * body's real foreshortening rather than a metric error, so the turn reads.
   */
  const lawShear = (C) => {
    const ang = (C.rot + 90) * Math.PI / 180;
    const ux = Math.cos(ang); const uy = Math.sin(ang);
    const vx = -uy; const vy = ux;
    const cx = (C.minX + C.maxX) / 2; const cy = (C.minY + C.maxY) / 2;
    const half = Math.hypot(C.W, C.H) / 2;
    const NS = Math.max(50, Math.round((2 * half) / 0.3));
    // The SHEAR-CORRECTED clearance at a sample: take a unit screen step across
    // the nominal ruling, carry it onto the chart, carry it back, and keep only
    // the part perpendicular to the ruling AS DRAWN.
    const clearAt = (s, a, b) => {
      const want = C.pitchFor(finite(s.I, 0));
      const q = C.solve(s, a, b, vx * want, vy * want);
      if (!q) return want;
      const s2 = C.at(a + q.da, b + q.db);
      if (!s2) return want;
      const ox = s2.x - s.x; const oy = s2.y - s.y;
      // The ruling's own screen direction here.
      const lx = ux; const ly = uy;
      const perp = Math.abs(ox * ly - oy * lx);
      if (!(perp > 1e-6)) return want;
      // Scale the step so the PERPENDICULAR part is what the tone asked for.
      // The factor is BOUNDED: at the silhouette the shear diverges, and an
      // unbounded correction there swamps the whole ruling's mean and flattens
      // the drawing (measured: L* span 1.3).
      const f = clamp(want / perp, 1, 2.2);
      return clamp(want * f, C.INK, C.PMAX);
    };
    let off = -half;
    let guard = 0;
    while (off < half && guard < 2000) {
      guard += 1;
      const pts = [];
      const probe = [];
      let sum = 0; let cnt = 0;
      for (let k = 0; k <= NS; k++) {
        const t = -half + (2 * half) * (k / NS);
        const x = cx + vx * off + ux * t;
        const y = cy + vy * off + uy * t;
        const s = C.inv(x, y);
        pts.push({ x, y });
        if (s && k % 3 === 0) { probe.push(clearAt(s, s._a, s._b)); }
      }
      C.emitScr(pts);
      // The MEAN, not the median. A straight ruling across a sphere spends more
      // than half its length below the terminator, so the median sample sits at
      // the dark cap on EVERY ruling and the family comes out at one uniform
      // spacing (measured: L* span 0.1). This is the known cost of a straight
      // ruling chassis on a curved body — the continuous-field family answers
      // it by integrating the position along the sweep, which curves the ruling.
      let sm = 0;
      probe.forEach((v2) => { sm += v2; });
      void sum; void cnt;
      off += clamp(probe.length ? sm / probe.length : C.PMAX, C.INK, C.PMAX);
    }
  };

  /* ── 10 · phaseBlue ─────────────────────────────────────────────────────────
   * A continuously integrated clearance whose PHASE is blue-noise jittered. The
   * field family diffuses the TONE and then places rulings at the exact position
   * the integration lands on, so whatever periodic residual the integration
   * carries is printed straight onto the paper — which is what a long-wave
   * moire is. Here the position is dithered instead: each ruling is displaced
   * from its integrated position by a fraction of the local clearance drawn from
   * a void-and-cluster sequence, which has no low-frequency energy at all. The
   * clearance the eye reads is unchanged in the mean and decorrelated in the
   * detail, so the residual is pushed out of the band the eye integrates over.
   * It is the direct structural answer to banding, applied to the phase rather
   * than to the tone.
   * DEPTH: the jitter is scaled by the local clearance, so it is invisible where
   * the lines are tight and generous where they are open — the drawing gets
   * looser as the surface turns toward the light, which is how a hand works.
   */
  const lawPhaseBlue = (C) => {
    const ang = (C.rot + 90) * Math.PI / 180;
    const ux = Math.cos(ang); const uy = Math.sin(ang);
    const vx = -uy; const vy = ux;
    const cx = (C.minX + C.maxX) / 2; const cy = (C.minY + C.maxY) / 2;
    const half = Math.hypot(C.W, C.H) / 2;
    const NS = Math.max(50, Math.round((2 * half) / 0.3));
    // A void-and-cluster-like sequence: the golden-ratio low-discrepancy walk,
    // centred, which has no low-frequency energy.
    let li = 0;
    let off = -half;
    let guard = 0;
    while (off < half && guard < 2200) {
      guard += 1;
      let sum = 0; let cnt = 0;
      const probe = [];
      for (let k = 0; k <= NS; k++) {
        const t = -half + (2 * half) * (k / NS);
        probe.push({ x: cx + vx * off + ux * t, y: cy + vy * off + uy * t, t });
      }
      probe.forEach((p, k) => {
        if (k % 3) return;
        const s = C.inv(p.x, p.y);
        if (s) { sum += C.pitchFor(finite(s.I, 0)); cnt += 1; }
      });
      const clear = cnt ? sum / cnt : C.PMAX;
      // THE PHASE DITHER. Amplitude is a fifth of the local clearance, so the
      // family's mean spacing is untouched and its spectrum is whitened.
      const u = ((li + 1) * GOLDEN) % 1;
      const jit = (u - 0.5) * clear * 0.40;
      const pts = probe.map((p) => ({ x: p.x + vx * jit, y: p.y + vy * jit }));
      C.emitScr(pts);
      off += clear;
      li += 1;
    }
  };

  /* ── 11 · dutyConst ─────────────────────────────────────────────────────────
   * CONSTANT MARK COUNT. Every ruling carries the same number of marks wherever
   * it runs, and the only thing that moves is the ratio of mark to gap. That is
   * the one property the existing tick and dot-screen laws do not have: their
   * tone is a COUNT, so as the tone changes a mark has to appear from nowhere,
   * and the locus where it appears is a contour the eye can trace. Here no mark
   * is ever born or killed. The period is fixed in screen millimetres and the
   * duty runs from a fifth to unity, so the marks lengthen into the shadow until
   * they meet their neighbours and the ruling becomes continuous, and shorten
   * into the light until they are pen-down dots. The family's clearance is fixed
   * as well, so this law's tone lives entirely on the duty cycle.
   * DEPTH: because the period is fixed on the PAPER and the ruling walks the
   * chart, the marks-per-unit-surface rises toward the limb exactly as a real
   * surface texture would — a foreshortening cue delivered by a constant.
   */
  const lawDuty = (C) => {
    const ang = (C.rot + 90) * Math.PI / 180;
    const ux = Math.cos(ang); const uy = Math.sin(ang);
    const vx = -uy; const vy = ux;
    const cx = (C.minX + C.maxX) / 2; const cy = (C.minY + C.maxY) / 2;
    const half = Math.hypot(C.W, C.H) / 2;
    const P = C.FLOOR * 1.05;             // ONE fixed clearance, everywhere
    const PERIOD = C.FLOOR * 2.0;         // ONE fixed mark period
    const nLines = Math.ceil((2 * half) / P);
    const NS = Math.max(70, Math.round((2 * half) / 0.24));
    for (let li = 0; li <= nLines; li++) {
      const off = -half + li * P;
      let pts = [];
      // The mark phase is offset per ruling by the golden ratio, so the mark
      // ends never line up into a cross-grain.
      const ph0 = ((li * GOLDEN) % 1);
      for (let k = 0; k <= NS; k++) {
        const t = -half + (2 * half) * (k / NS);
        const x = cx + vx * off + ux * t;
        const y = cy + vy * off + uy * t;
        const s = C.inv(x, y);
        if (!s) { if (pts.length) { C.emitScr(pts); pts = []; } continue; }
        const want = C.areaFor(clamp(finite(s.I, 0), 0, 1));
        const full = C.INK / P;
        const duty = clamp(want / Math.max(1e-6, full), 0.18, 1);
        const ph = (((t + half) / PERIOD) + ph0) % 1;
        if (duty < 0.999 && Math.abs(ph - 0.5) > duty / 2) {
          if (pts.length) { C.emitScr(pts); pts = []; }
          continue;
        }
        pts.push({ x, y });
      }
      if (pts.length) C.emitScr(pts);
    }
  };

  /* ── 12 · endShorten ────────────────────────────────────────────────────────
   * SHORTEN-ONLY ENDS, at one width. Every ruling of the family exists over the
   * whole form — none is ever dropped — and the tone is carried by how far each
   * ruling's two ends are PULLED BACK from the silhouette, continuously. In the
   * shadow a ruling runs limb to limb; toward the light it retracts, and the
   * retraction is a smooth function of the tone at the end itself, so the locus
   * of ends is a soft envelope inside the silhouette rather than a row of
   * stops. The existing laws that do this spend stroke WIDTH to make the end
   * vanish; with the width fixed, the end has to be spent as LENGTH, and the
   * cue that keeps it from reading as a broken ruling is that the ends of
   * neighbouring rulings are staggered by a low-discrepancy offset so they never
   * line up into a contour.
   * DEPTH: the envelope of ends is a curve that lies INSIDE the silhouette and
   * follows it. That reads as the body's shoulder rolling away — the same cue a
   * reserved highlight gives, but delivered by the ends of the ink.
   */
  const lawEndShorten = (C) => {
    const ang = (C.rot + 90) * Math.PI / 180;
    const ux = Math.cos(ang); const uy = Math.sin(ang);
    const vx = -uy; const vy = ux;
    const cx = (C.minX + C.maxX) / 2; const cy = (C.minY + C.maxY) / 2;
    const half = Math.hypot(C.W, C.H) / 2;
    const P = C.FLOOR * 1.15;
    const nLines = Math.ceil((2 * half) / P);
    const NS = Math.max(70, Math.round((2 * half) / 0.26));
    for (let li = 0; li <= nLines; li++) {
      const off = -half + li * P;
      // Find the on-surface span of this ruling first, so the retraction is
      // measured from the ruling's OWN ends.
      const on = [];
      for (let k = 0; k <= NS; k++) {
        const t = -half + (2 * half) * (k / NS);
        const x = cx + vx * off + ux * t;
        const y = cy + vy * off + uy * t;
        on.push(C.inv(x, y) ? t : null);
      }
      let i0 = -1; let i1 = -1;
      for (let k = 0; k <= NS; k++) if (on[k] != null) { if (i0 < 0) i0 = k; i1 = k; }
      if (i0 < 0 || i1 - i0 < 4) continue;
      const t0 = on[i0]; const t1 = on[i1];
      const spanMM = t1 - t0;
      const sAt = (t) => C.inv(cx + vx * off + ux * t, cy + vy * off + uy * t);
      const retract = (t) => {
        const s = sAt(t);
        if (!s) return 0;
        const lit = clamp(finite(s.I, 0), 0, 1);
        const e = lit * lit * (3 - 2 * lit);
        // Stagger the ends by a low-discrepancy offset per ruling.
        const st = (((li * GOLDEN) % 1) - 0.5) * P * 2.2;
        return clamp(e * spanMM * 0.42 + st, 0, spanMM * 0.46);
      };
      const a0 = t0 + retract(t0 + spanMM * 0.06);
      const a1 = t1 - retract(t1 - spanMM * 0.06);
      if (!(a1 - a0 > C.MINMARK)) continue;
      const pts = [];
      const M = Math.max(6, Math.round((a1 - a0) / 0.3));
      for (let k = 0; k <= M; k++) {
        const t = a0 + (a1 - a0) * (k / M);
        pts.push({ x: cx + vx * off + ux * t, y: cy + vy * off + uy * t });
      }
      C.emitScr(pts);
    }
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
    // The exclusion radius below was built from `pitchLegible`, the "never
    // crowd past legibility" variant that floors at `FLOOR` (~2 ink widths).
    // That caps how small a shadow cell can get well above what the network
    // is capable of, so the dark end reads only a little busier than the
    // light end (measured edge-density ratio ~1.17 — weak, given the
    // direction is already right). `pitchFor` is the flooring-capable
    // variant this file's other "reaches black" laws use (`lawEtf`,
    // `lawDefect`, `lawMezzo`) and is IDENTICAL to `pitchLegible` for any `I`
    // whose natural pitch already clears `FLOOR` — so the lit end (which the
    // owner asked to keep exactly as-is) is unaffected by this swap. Only
    // the dark end, previously clamped up to `FLOOR`, can now shrink toward
    // `INK / A_DARK`, delivering the "busier/smaller cells near shadow" the
    // owner asked for (tests/unit/scene3d-voronoi-dark-end.test.js).
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
      return C.pitchLegible(s ? finite(s.I, 0) : 0.9);
    };
    const GRIDS = C.PMAX * 1.2;
    for (let it = 0; it < 340; it++) {
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
        const rr = Math.max(1e-3, Math.hypot(n.x - C.faceX, n.y - C.faceY));
        fx[i] += ((n.x - C.faceX) / rr) * (0.25 + grow) * 0.55;
        fy[i] += ((n.y - C.faceY) / rr) * (0.25 + grow) * 0.55;
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
        const mx0 = (a.x + b.x) / 2; const my0 = (a.y + b.y) / 2;
        const d = sep(mx0, my0);
        // GROWTH, not resampling. A node inserted only when an edge has
        // stretched keeps the curve a circle — the loop simply expands. The
        // growth rate is the tone: an edge in the shadow buds far more often
        // than one in the light, and the repulsion then has to buckle the
        // curve to make room for what has been inserted. That buckling is the
        // drawing.
        const sm0 = C.inv(mx0, my0);
        const shade0 = sm0 ? clamp(1 - finite(sm0.I, 0), 0, 1) : 0;
        const bud = C.hash(it * 7919 + i, 11) < (0.012 + shade0 * 0.075);
        if ((L > d || bud) && next.length < 12200) {
          const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          if (C.inv(m.x, m.y)) next.push(m);
        }
      }
      nodes = next;
      if (nodes.length > 12000) break;
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
    for (let t = 0; t < 60000 && attr.length < 9000; t++) {
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
    // The nearest-node search is spatially indexed; the flat scan it replaces
    // was O(attractors x nodes) per step and capped the tree at 2600 nodes.
    const NG2 = INFL;
    const ncells = new Map();
    const nput = (i) => {
      const k = `${Math.floor(nodes[i].x / NG2)},${Math.floor(nodes[i].y / NG2)}`;
      if (!ncells.has(k)) ncells.set(k, []);
      ncells.get(k).push(i);
    };
    nput(0);
    for (let it = 0; it < 400 && nodes.length < 14000; it++) {
      const pull = new Map();
      // Each attractor pulls its nearest node.
      for (let i = 0; i < attr.length; i++) {
        if (attr[i].dead) continue;
        let best = -1; let bd = INFL;
        const cx2 = Math.floor(attr[i].x / NG2); const cy2 = Math.floor(attr[i].y / NG2);
        for (let jj = -1; jj <= 1; jj++) {
          for (let ii = -1; ii <= 1; ii++) {
            const arr = ncells.get(`${cx2 + ii},${cy2 + jj}`);
            if (!arr) continue;
            for (let m = 0; m < arr.length; m++) {
              const n = arr[m];
              const d = Math.hypot(nodes[n].x - attr[i].x, nodes[n].y - attr[i].y);
              if (d < bd) { bd = d; best = n; }
            }
          }
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
      add.forEach((n) => { nodes.push(n); nput(nodes.length - 1); });
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
    //
    // The clearance at a column/row used to come from an 11-point average
    // spanning the WHOLE opposite axis (pole to pole). For a body whose tone
    // varies across BOTH screen axes (any light that is not purely vertical
    // or purely horizontal), integrating all the way across the orthogonal
    // axis mixes bright and dark samples into one number for every column —
    // and for a radially-symmetric body like a sphere that average converges
    // toward roughly the same figure for every column, which is why the law
    // measured flat (lit/shadow ink density ratio 0.987 — see
    // tests/unit/scene3d-maze-tonal-range.test.js). Sampling a narrow LOCAL
    // window instead (centred on the object's own most-front-facing point,
    // `C.faceX`/`C.faceY`) keeps each column's/row's clearance representative
    // of the tone actually near it.
    // On a typical lit sphere the RAW local average sampled below almost
    // never climbs high enough to push `pitchFor` above `FLOOR`: measured,
    // only the brightest ~12% of the visible width crossed that threshold,
    // so ~88% of the grid lines landed at the SAME floor pitch regardless of
    // how dark the tone actually was there — a flat lit/shadow ink-density
    // ratio of ~0.99 (tests/unit/scene3d-maze-tonal-range.test.js). Nor does
    // a plain linear min/max stretch (the way `lawCrevice`'s AO term is
    // stretched elsewhere in this file) fix it: the RAW local average is not
    // uniformly spread over its own range on a sphere — the shading is
    // concentrated near the light direction, so most of the width still sits
    // in a compressed low band even after a linear rescale. The fix instead
    // RANK-normalizes: it pre-samples the local average at 41 evenly-spaced
    // columns/rows, sorts those samples, and maps each column's/row's own
    // average to its PERCENTILE within that sample set rather than its
    // linear position in [min, max]. That guarantees, by construction, an
    // even spread across the full 0..1 `pitchFor` domain regardless of how
    // skewed the underlying radiance curve is — genuinely dark columns/rows
    // still bottom out at `FLOOR` (this law's own header's "reaches
    // black... walls abut" is preserved), and the "more open" half of the
    // form now actually opens up instead of collapsing onto the floor
    // plateau.
    //
    // A FLAT FACE (the faceted box/plane/solid path in scene3d.js, which
    // calls this same law once per front face) has a CONSTANT normal, so
    // every sample the pre-scan takes on it is the identical radiance — the
    // pre-scan's own min and max collapse to the same number. Ranking a
    // degenerate all-equal sample set is undefined (every value ties for
    // rank 0) and would flatten EVERY face to the darkest possible pitch
    // regardless of its real radiance — the exact regression
    // tests/unit/scene3d-faceted-tone-law.test.js caught. So the rank
    // normalization is skipped whenever the pre-scan carries no real spread,
    // and the RAW local average is used unchanged in that case — exactly
    // the pre-existing per-face behaviour (a constant radiance per face
    // legitimately floors at `FLOOR` under a low sun; see that test file's
    // own "declining to flood the paper" comment) is left untouched.
    const LOCAL = Math.max(C.R * 0.22, C.FLOOR * 3);
    const bandAvg = (cx0, cy0, alongX) => {
      let sum = 0; let n = 0;
      for (let k = 0; k <= 10; k++) {
        const s = alongX
          ? C.inv(cx0, cy0 - LOCAL + (k / 10) * (2 * LOCAL))
          : C.inv(cx0 - LOCAL + (k / 10) * (2 * LOCAL), cy0);
        if (s) { sum += finite(s.I, 0); n += 1; }
      }
      return n ? sum / n : null;
    };
    const rankOf = (sorted, v) => {
      if (!sorted.length) return 0.5;
      let lo = 0; let hi = sorted.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (sorted[mid] < v) lo = mid + 1; else hi = mid;
      }
      return sorted.length > 1 ? lo / (sorted.length - 1) : 0.5;
    };
    const xSamples = [];
    for (let k = 0; k <= 40; k++) {
      const v = bandAvg(C.minX + (C.maxX - C.minX) * (k / 40), C.faceY, true);
      if (v != null) xSamples.push(v);
    }
    xSamples.sort((a, b) => a - b);
    const xFlat = xSamples.length < 4 || (xSamples[xSamples.length - 1] - xSamples[0]) < 1e-4;
    const ySamples = [];
    for (let k = 0; k <= 40; k++) {
      const v = bandAvg(C.faceX, C.minY + (C.maxY - C.minY) * (k / 40), false);
      if (v != null) ySamples.push(v);
    }
    ySamples.sort((a, b) => a - b);
    const yFlat = ySamples.length < 4 || (ySamples[ySamples.length - 1] - ySamples[0]) < 1e-4;

    // WRAP: a column/row's own screen position never says how much surface
    // it stands for, so the grid otherwise reads as laid flat on the form
    // rather than following it. The representative point already sampled for
    // `avg` (`C.faceY`/`C.faceX` cross the column/row) carries `nz` for free
    // — fold the local pitch tighter as that point rides the limb (nz -> 0),
    // exactly `originSpiral`'s `wrapPitch`. A flat face has one constant
    // normal, so `nz` is the same at every column/row there and this only
    // ever applies a uniform scale — it cannot reintroduce the spread the
    // flat-face rank-normalization guard exists to keep out.
    const xs = [];
    let x = C.minX;
    while (x < C.maxX && xs.length < 300) {
      xs.push(x);
      const avg = bandAvg(x, C.faceY, true);
      const t = avg == null ? 0.5 : (xFlat ? avg : rankOf(xSamples, avg));
      const here = C.inv(x, C.faceY);
      x += Math.max(C.FLOOR, wrapPitch(C.pitchLegible(t), here ? here.nz : 1)) * 1.05;
    }
    const ys = [];
    let y = C.minY;
    while (y < C.maxY && ys.length < 300) {
      ys.push(y);
      const avg = bandAvg(C.faceX, y, false);
      const t = avg == null ? 0.5 : (yFlat ? avg : rankOf(ySamples, avg));
      const here = C.inv(C.faceX, y);
      y += Math.max(C.FLOOR, wrapPitch(C.pitchLegible(t), here ? here.nz : 1)) * 1.05;
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
      if (!s) { lam[k] = C.PMAX * 2; continue; }
      mask[k] = 1;
      lam[k] = C.pitchLegible(finite(s.I, 0)) * 2;   // full wavelength = 2 x clearance
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
          // `wl` tracks the TONE correctly (small in shadow, large in light —
          // see `lam` above and the shared `pitchLegible` convention every
          // sibling law honours). But this activator/inhibitor pair's own
          // dispersion relation (Murray, critical wavenumber
          // k_c^2 = 1/(2*Du) - reactionRate/(2*Dv)) means a LARGER Dv drives a
          // SHORTER settled wavelength, not a longer one — Dv only ever pulls
          // the pattern toward the short-wave floor set by Du; it is Dv
          // shrinking toward the Turing threshold that stretches the
          // wavelength out. Feeding `wl` straight into `Dv = Du*wl^2/9`
          // therefore inverted the law outright: light cells (large `wl`) got
          // the driven-toward-dense high-Dv end and shadow cells (small `wl`)
          // got the driven-toward-sparse low-Dv end — measured and confirmed
          // both numerically (tests/unit/scene3d-turing-polarity.test.js) and
          // visually (a dense RD cluster sitting on the lit hemisphere).
          // Reflecting `wl` within its own clamp range before squaring hands
          // Dv the value that actually produces the requested wavelength: a
          // light cell now gets the LOW-Dv (long-wavelength, sparse) end and a
          // shadow cell gets the HIGH-Dv (short-wavelength, dense) end.
          const wlDv = 2.2 + 26 - wl;
          const Dv = Du * (wlDv * wlDv) / 9;
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

  /* ── 03 · originSpiral ──────────────────────────────────────────────────────
   * ONE continuous line for the whole body. It starts at the brightest point on
   * the form — the specular origin — and winds outward, ring by ring, and each
   * new ring is the PREVIOUS ring pushed out by the local radial pitch AT THAT
   * ANGLE, so the turns squeeze together as the line passes through the shadow
   * and open out as it passes back through the light. Because there is exactly
   * one origin and the turns are concentric about it, the eye reads a single
   * curved surface lit from one place: the spiral IS the shading and the
   * shading IS the form. Reaches its darkest where consecutive turns close to
   * the plot floor.
   *
   * WHY A RING RECURRENCE AND NOT A PLAIN dr/dphi INTEGRAL. The obvious way to
   * write this law integrates r monotonically against a single, ever-advancing
   * phi: r(phi) = r0 + INTEGRAL(pitch(phi')/(2*pi)) dphi' from 0 to phi. That
   * was this law's original form, and it is mathematically incapable of
   * carrying tone: the spacing between turn K and turn K+1 AT A FIXED ANGLE
   * theta is the integral of pitch over the window [theta, theta + 2*pi] --
   * exactly one full period -- and the integral of a 2*pi-periodic function
   * over any window of EXACTLY one period is the SAME constant regardless of
   * where the window starts. So the ring-to-ring spacing at every angle
   * converges to the same silhouette-wide average pitch no matter how sharply
   * `pitch(theta)` itself varies locally -- confirmed by measurement, not just
   * derivation: shadow/lit ink density ratio 0.975, flat, even though the
   * per-sample target pitch driving the walk measured a real ~2x swing (0.373
   * shadow vs 0.722 lit average) that never showed up as real spacing. Fixing
   * the guard budget instead (an earlier attempt here, since reverted) helped
   * the walk reach the far side but left the ratio at 0.98 -- proof the
   * flatness was structural, not a coverage bug.
   * The fix breaks that degeneracy by defining ring K+1's radius AT ANGLE
   * theta directly from ring K's OWN radius and tone AT THAT SAME theta:
   * r_{k+1}(theta) = r_k(theta) + pitchFor(I(r_k(theta), theta)). Spacing
   * between consecutive rings at a given angle is then exactly the local
   * pitch there, with no averaging across the rest of the form. The rings are
   * walked out together and stitched into one continuous polyline through a
   * seam at theta = 0, so the drawing is still the single wound line the law
   * is named for -- just built as a stack of tone-graded offset contours
   * rather than an integral that could not see past its own period.
   */
  const lawSpiral = (C) => {
    const ox = C.hiX; const oy = C.hiY;
    const rMax = Math.hypot(C.W, C.H);
    const R0 = C.pitchFor(0.9) * 0.5;
    // Angular resolution fine enough that even the OUTERMOST ring's chord
    // stays comfortably under the segment guard's cut threshold; smaller
    // rings are automatically finer still since the same NANG covers less
    // circumference.
    const NANG = clamp(Math.round((2 * Math.PI * rMax) / 1.8), 96, 480);
    let ring = new Float64Array(NANG).fill(R0);
    const pts = [];
    const pushRing = (radii) => {
      for (let i = 0; i <= NANG; i += 1) {
        const th = ((i % NANG) / NANG) * Math.PI * 2;
        const r = radii[i % NANG];
        pts.push({ x: ox + r * Math.cos(th), y: oy + r * Math.sin(th) });
      }
    };
    pushRing(ring);
    let guard = 0;
    let anyGrowing = true;
    // A guard of 400 rings comfortably covers the slowest (densest-shadow)
    // direction on every primitive measured: reaching `rMax` at the plot
    // floor pitch (~2 ink widths) takes on the order of rMax / floor rings,
    // and floor is never smaller than a fraction of a millimetre.
    while (anyGrowing && guard < 400) {
      guard += 1;
      anyGrowing = false;
      const next = new Float64Array(NANG);
      for (let i = 0; i < NANG; i += 1) {
        const r0 = ring[i];
        if (r0 >= rMax) { next[i] = r0; continue; }
        const th = (i / NANG) * Math.PI * 2;
        const x = ox + r0 * Math.cos(th); const y = oy + r0 * Math.sin(th);
        const s = C.inv(x, y);
        const p0 = C.pitchFor(s ? finite(s.I, 0) : 0.85);
        // WRAP: fold the turn tighter as it rides the limb (nz -> 0), so the
        // rings read as following the body's curvature and not as a flat
        // disc of concentric circles laid on top of it. `wrapPitch` is a
        // bounded fraction of `p0` (never below `p0 * WRAP_FLOOR`), so this
        // does not reintroduce a legibility floor `pitchFor` deliberately
        // does not have -- the law still reaches genuine black.
        const p = wrapPitch(p0, s ? s.nz : 1);
        const r1 = r0 + p;
        next[i] = r1;
        if (r1 < rMax) anyGrowing = true;
      }
      ring = next;
      pushRing(ring);
    }
    C.emitScr(pts);
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
    const SS = C.INK * 1.02;          // the short clearance ABUTS — this is the black
    const LL = SS * 6.854;            // four golden steps out — this is the highlight
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
      // The Fibonacci word's n-th letter: floor((n+2)phi) - floor((n+1)phi).
      const fw = Math.floor((n + 2) * GOLDEN) - Math.floor((n + 1) * GOLDEN);
      // THE MIX IS THE TONE, and it is solved, not guessed. A run made of a
      // fraction q of S clearances and (1 - q) of L delivers a mean ink area of
      // ink / (q.S + (1-q).L); inverting that for the area the light asks for
      // gives the q this passage needs. The word then decides WHICH clearances
      // are the short ones, and because the word is quasiperiodic that decision
      // has no period for the raster to beat against.
      const want = C.areaFor(clamp(I, 0, 1));
      const meanP = clamp(C.INK / Math.max(1e-4, want), SS, LL);
      const q = clamp((LL - meanP) / Math.max(1e-6, LL - SS), 0, 1);
      // The word's own letter, dithered into the demanded fraction by a
      // low-discrepancy rank so the two letters interleave rather than block.
      const rank = ((n + 1) * GOLDEN) % 1;
      const isS = fw === 0 ? rank < q * 1.35 : rank < Math.max(0, q - 0.38) * 1.6;
      off += isS ? SS : LL;
      n += 1;
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
          const q = C.stepTo(ss, a, b, d.x * 0.3, d.y * 0.3);
          if (!q) break;
          a = q.a; b = q.b;
        }
        C.emitPts(h);
      }
    }
  };
  const RUN = {
    etfKang: lawEtf,
    defectSplit: lawDefect,
    mezzoRegion: lawMezzo,
    creviceAO: lawCrevice,
    contactBloom: lawContact,
    transReserveMono: lawTransReserve,
    jitterOverdraw: lawJitter,
    mergeLadder: lawMerge,
    originSpiral: lawSpiral,
    shearClear: lawShear,
    phaseBlue: lawPhaseBlue,
    dutyConst: lawDuty,
    endShorten: lawEndShorten,
    turingStripe: lawTuring,
    voronoiWeb: lawVoronoi,
    mazeFill: lawMaze,
    diffGrowth: lawGrowth,
    spaceColonise: lawColonise,
    fiboQuasi: lawFibo,
    hachureSlope: lawHachure,
  };

  const emit = (o) => {
    const fn = RUN[o.algo];
    if (!fn) return false;
    const C = makeCtx(o);
    if (!C.ok) return true;
    attachFields(C);
    // The crosshatch mapper is a crossed pair by definition, so a law that owns
    // family A there owns family B too: the same construction, rotated by the
    // file's own second-direction angle. Every other mapper runs one pass.
    const passes = o.mapper === 'crosshatch' ? [0, 65] : [0];
    // A law that throws must not take the whole fill with it, and the reason
    // has to survive to the harness — a silently empty cell is the one failure
    // mode this rig cannot tell apart from a law that draws nothing.
    const diag = { algo: o.algo, lat: C.lat.length, ok: C.ok, R: C.R, emitted: 0, cut: 0, error: null };
    passes.forEach((deg) => {
      C.rot = o.angleDeg + deg;
      try { fn(C); } catch (e) { diag.error = String(e && e.message ? e.message : e); }
    });
    diag.emitted = C.emittedCount();
    diag.cut = C.cutCount();
    globalScope.__MONO_DIAG = diag;
    // A measuring harness must be able to ask THIS substrate whether a screen
    // point is on the visible surface — a harness that reimplements `inv` is
    // measuring its own copy, and the copy is what went stale while the white
    // cross was being diagnosed. Opt-in, so the shipped app retains nothing:
    // the lattice is up to ninety thousand samples.
    if (globalScope.__MONO_TRACE) globalScope.__MONO_CTX = C;
    return true;
  };

  Scene3D.SurfaceFillMono = { LAWS, isMono, emit };
}());
