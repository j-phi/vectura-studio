/**
 * Scene3D.SurfaceLockFaceted — the surface-locked baker for faceted solids: box, plane and polyhedron ("solid")
 * (docs/surface-lock-contract.md §9 "Faceted (W3-A)").
 *
 *   supports(spec) -> boolean       exactly the FIT rows minus their refuse rules
 *   bake(spec) -> MarkSet           pure and deterministic; reads geometry, style, pen, scaleRef and seed only
 *   toneLUT(spec, toneCtx) -> { lut, scaleFn }
 *
 * One 2D generator per face, in the face plane, in the object's SCALED LOCAL frame:
 *   - the in-plane frame is anchored to OBJECT axes (U = local +X projected onto the face, else +Y; V = n x U), so the
 *     marks turn with the object. (Pose mode anchors to world +X; that is the one deliberate look difference.)
 *   - a family is a lattice of straight rulings t = phase + i * pFine, t = (n x d) . p measured in object mm. The lattice is
 *     absolute (not relative to the face), so every face is on the same dyadic grid and the same bake is identical
 *     whether one face or the whole object is baked;
 *   - ruling i gets level L-1-ctz(i) (level 0 at i == 0 mod 2^(L-1)) and a bit-reversed rank inside its level, so every
 *     threshold subset of a face is evenly spaced (per-face nesting, contract §9);
 *   - rulings are clipped to the face polygon (even-odd, any simple polygon) and sampled every STEP_MM.
 * The pitch law is the FACETED pose law's (Density spacing / gain, gain 0.5 lit .. 1.6 dark), so a locked box carries the ink a
 * pose box does; the tone table reproduces that map (`toneLUT`).
 *
 * A bake of ONE face is selected by `spec.sizes.face` (an integer mesh face index); the Level F per-face dispatch uses it so
 * each face keeps its own pick target and HLR owner. Without it the whole object is baked (Level S). The per-face MarkSets
 * concatenate to the whole one, run for run.
 */
(function registerScene3DSurfaceLockFaceted() {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const Scene3D = (Vectura.Scene3D = Vectura.Scene3D || {});

  // Tuning values. The live ones are Vectura.SCENE3D_SURFACE_LOCK.FACETED; these are only the safe fallback when that table is not
  // loaded. `sync()` refreshes `C` from the config on every bake.
  const DEFAULTS = {
    STEP_MM: 1.0, // vertex spacing along a ruling (a face is flat, so tone and facing are constant along it; a point light varies slowly)
    EDGE_MM: 0.05, // a ruling closer than this to the face's extreme (a ruling ON an edge) is dropped: the outline owns that ink
    MIN_RUN_MM: 0.3, // an interval shorter than this is not a mark
    MAX_VERTS: 120000, // vertex budget guard (contract §2: 200k per object per fill group)
    CROSS_OBJ_DEG: 65, // family 1 sits at fillAngle + CROSS_OBJ_DEG + (crossAngleDelta - 90), as the ladder's cross does
    PLOT_FLOOR_SLACK: 0.8,
    ZOOM_HEADROOM: 1.5,
    PHASE_FAM1: 0.37, // family 1 lattice offset (fraction of the level-0 pitch), so the two families do not start together
    GAIN_LIT: 0.5, // the faceted pose law's spacing gain at coverage 0 (lit): pitch = hatchSpacing / (GAIN_LIT + GAIN_SPAN * coverage)
    DOT_SEGS: 8, // tone model v2 stipple: dot polygon segments
    SPIRAL_MIN_S: 0.03, // tone model v2 spiral: stop when the scale toward the face centre drops under this
    GAIN_SPAN: 1.1, // ... so the pitch runs from 2 x Density spacing (lit) to Density spacing / 1.6 (dark)
  };
  const C = Object.assign({}, DEFAULTS);

  const FIT_MAPPERS = ['hatch', 'crosshatch'];
  // Tone model v2 (light-realism U6) also bakes contour (concentric outlines), spiral (one inward spiral) and stipple (a dot lattice)
  // per face, so these mappers respond to the light on a box instead of the pose fill's light-blind concentric squares. They are
  // gated on spec.toneModel === 'v2' so a saved (legacy) document keeps the pose fill it was made with.
  const V2_MAPPERS = ['contour', 'spiral', 'stipple'];
  const FIT_PRIMITIVES = ['box', 'plane', 'solid'];
  const FIT = Object.freeze([Object.freeze({
    mappers: Object.freeze(FIT_MAPPERS.slice()),
    laws: Object.freeze(['ladder']),
    primitives: Object.freeze(FIT_PRIMITIVES.slice()),
    refuse: Object.freeze({
      tripleHatch: Object.freeze([true]),
      // These three reference the world or the screen, which a surface-locked mark does not follow.
      angleRef: Object.freeze(['worldUp', 'light', 'screen']),
    }),
  })]);

  const finite = (v, d) => (Number.isFinite(v) ? v : d);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const frac = (v) => v - Math.floor(v);
  const cfg = () => Vectura.SCENE3D_SURFACE_LOCK || {};
  const sync = () => {
    const own = cfg().FACETED || {};
    Object.keys(DEFAULTS).forEach((k) => { C[k] = Number.isFinite(own[k]) ? own[k] : DEFAULTS[k]; });
    return C;
  };
  const MS = () => Scene3D.SurfaceLockMarkSet;
  const regions = () => Scene3D.Regions || {};
  const plotFloorPen = () => (Number.isFinite(regions().PLOT_FLOOR_PEN) ? regions().PLOT_FLOOR_PEN : 2.2);
  const ctz = (m) => (m === 0 ? 99 : 31 - Math.clz32(m & -m));
  const vdc2 = (i) => {
    let n = i >>> 0; let r = 0; let f = 0.5;
    while (n) { if (n & 1) r += f; n >>>= 1; f *= 0.5; }
    return r;
  };
  const now = () => (typeof performance !== 'undefined' && performance && typeof performance.now === 'function' ? performance.now() : 0);
  const RANK_CAP = 0.999999;

  const LAD = () => Scene3D.SurfaceLockLadder;
  const isV2 = (spec) => !!spec && spec.toneModel === 'v2' && !!(LAD() && LAD().v2);
  const litMaxPitchPen = () => (Number.isFinite(regions().LIT_MAX_PITCH_PEN) ? regions().LIT_MAX_PITCH_PEN : 12);

  // ---- supports ----------------------------------------------------------------------------------------------
  const supports = (spec) => {
    if (!spec || typeof spec !== 'object') return false;
    if (spec.mode !== undefined && spec.mode !== 'faceted') return false;
    const law = spec.toneLaw;
    const style = spec.style || {};
    const ok = FIT.some((row) => {
      if (row.mappers.indexOf(spec.mapper) === -1 && !(isV2(spec) && V2_MAPPERS.indexOf(spec.mapper) !== -1)) return false;
      if (!(law === undefined || law === null || law === '' || row.laws.indexOf(law) !== -1)) return false;
      if (row.primitives.indexOf(spec.primitive) === -1) return false;
      return !Object.keys(row.refuse || {}).some((k) => row.refuse[k].indexOf(style[k]) !== -1);
    });
    if (!ok) return false;
    const sz = spec.sizes;
    if (spec.primitive === 'solid' && sz && typeof sz === 'object') {
      // An imported mesh is an unbounded face list (and would be hashed into every key); the shard deformer reads the module-global seed.
      if (sz.solidType === 'importedMesh' || sz.importedMesh) return false;
      if (Math.abs(finite(Number(sz.shard), 0)) > 0) return false;
    }
    return true;
  };

  // ---- the pitch law: the ladder's (Density -> screen pitch), see SurfaceLockLadder -----------------------------
  const hatchSpacing = (density) => {
    const d = clamp(finite(density, 50), 0, 500);
    if (d <= 100) return Math.max(1, 14 - 0.13 * d);
    return 1 - Math.min(1, (d - 100) / 100) * 0.55;
  };
  const read = (spec) => {
    const st = (spec && spec.style) || {};
    const pen = Math.max(0.02, finite(spec && spec.penWidth, 0.3));
    const sc = (spec && spec.scale) || {};
    return {
      pen,
      density: clamp(finite(st.fillDensity, 50), 0, 500),
      angle: finite(st.fillAngle, 45),
      dotR: clamp(finite(st.dotSize, 0.7), 0.1, 3),
      crossDelta: clamp(finite(st.crossAngleDelta, 90), 10, 170),
      crossRatio: clamp(finite(st.crossDensityRatio, 1), 0.25, 2),
      scaleRef: finite(spec && spec.scaleRef, 1) > 0 ? spec.scaleRef : 1,
      scale: { sx: finite(sc.sx, 1), sy: finite(sc.sy, 1), sz: finite(sc.sz, 1) },
      seed: (spec && spec.seed && typeof spec.seed === 'object') ? spec.seed : {},
    };
  };
  const floorOf = (r) => plotFloorPen() * r.pen;
  // The FACETED pose law (scene3d.js spacingBand / coverageGain), which is NOT the curved ladder's: Density is authoritative and
  // tone is a multiplier, spacing = Density spacing / gain, gain = GAIN_LIT + GAIN_SPAN * coverage in [0.5, 1.6]. The bake sizes its
  // levels from that full range (so it never reads the tone settings); the LUT reads the real tone ladder.
  const p0Screen = (r) => hatchSpacing(r.density) / C.GAIN_LIT;
  const darkestPitch = (r) => hatchSpacing(r.density) / (C.GAIN_LIT + C.GAIN_SPAN);

  // lut[k] = 1 / screen pitch at I = k / 256 (contract §5). Not reproduced (pose-only, per facet): the rank-spread band grade
  // (O20), the glint facet cap, the dark-side second family and shadowSensitivity; the toned look is single-family here.
  const toneLUT = (spec, toneCtx) => {
    if (isV2(spec)) return LAD().v2.toneLUT(spec, toneCtx); // one continuous L*-linear curve, no lit floor (same as the curved ladder)
    sync();
    const r = read(spec);
    const tone = (toneCtx && toneCtx.tone) || null;
    const R = regions();
    const n = (cfg().TONE_LUT_SIZE || 256) + 1;
    const lut = new Float32Array(n);
    const floor = floorOf(r);
    const s0 = hatchSpacing(r.density);
    const nb = tone && Array.isArray(tone.ladder) ? tone.ladder.length : 0;
    const toneOn = Boolean(tone && tone.enabled && nb >= 1 && typeof R.band === 'function' && typeof R.coverageFor === 'function');
    if (!toneOn) { lut.fill(1 / Math.max(floor, s0)); return { lut, scaleFn: null }; }
    for (let k = 0; k < n; k++) {
      const b = R.band(k / (n - 1), tone);
      const cov = clamp(finite(R.coverageFor(nb - 1 - b, tone), 0), 0, 1);
      lut[k] = 1 / Math.max(floor, s0 / (C.GAIN_LIT + C.GAIN_SPAN * cov));
    }
    return { lut, scaleFn: null };
  };

  // ---- faces -------------------------------------------------------------------------------------------------
  const meshOf = (spec) => {
    const params = Object.assign({}, spec.sizes || {});
    delete params.face;
    return Scene3D.Scene.buildPrimitiveMesh({ primitive: spec.primitive, params }, 1);
  };
  // One planar face in scaled local mm: its corner points, outward unit normal (Newell), area and plane offset.
  const faceGeom = (mesh, fi, sc) => {
    const idx = mesh.faces[fi];
    if (!Array.isArray(idx) || idx.length < 3) return null;
    const pts = [];
    for (let k = 0; k < idx.length; k++) {
      const v = mesh.vertices[idx[k]];
      if (!v) return null;
      pts.push([v.x * sc.sx, v.y * sc.sy, v.z * sc.sz]);
    }
    let nx = 0; let ny = 0; let nz = 0;
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k]; const b = pts[(k + 1) % pts.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const nl = Math.hypot(nx, ny, nz);
    if (!(nl > 1e-9)) return null;
    const n = [nx / nl, ny / nl, nz / nl];
    let h = 0;
    for (let k = 0; k < pts.length; k++) h += n[0] * pts[k][0] + n[1] * pts[k][1] + n[2] * pts[k][2];
    h /= pts.length;
    // In-plane frame anchored to OBJECT axes: +X projected onto the face, else +Y.
    let U = null;
    const cands = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let c = 0; c < cands.length && !U; c++) {
      const a = cands[c]; const d = a[0] * n[0] + a[1] * n[1] + a[2] * n[2];
      const px = a[0] - n[0] * d; const py = a[1] - n[1] * d; const pz = a[2] - n[2] * d;
      const pl = Math.hypot(px, py, pz);
      if (pl > 1e-3) U = [px / pl, py / pl, pz / pl];
    }
    if (!U) return null;
    const V = [n[1] * U[2] - n[2] * U[1], n[2] * U[0] - n[0] * U[2], n[0] * U[1] - n[1] * U[0]];
    return { pts, n, h, U, V, area: nl / 2 };
  };

  // ---- the bake ----------------------------------------------------------------------------------------------
  const bake = (spec) => {
    sync();
    const t0 = now();
    const SM = MS();
    const SC = Scene3D.SurfaceLockChart;
    const r = read(spec);
    const maxLevels = cfg().MAX_LEVELS || 6;
    const salt = finite(r.seed.salt, 0) | 0;
    const phase0 = Number.isFinite(r.seed.phase) ? frac(r.seed.phase) : (SC && SC.hash ? SC.hash(salt, 7, 11) : 0);
    const cross = spec.mapper === 'crosshatch';
    const only = Number.isInteger(spec.sizes && spec.sizes.face) ? spec.sizes.face : -1;

    const mesh = meshOf(spec);
    const geoms = [];
    let totalArea = 0;
    for (let fi = 0; fi < mesh.faces.length; fi++) {
      const g = faceGeom(mesh, fi, r.scale);
      geoms.push(g);
      if (g) totalArea += g.area;
    }

    // Level count (contract §9): p0 is the lit maximum screen pitch / scaleRef; the finest level reaches the darkest pitch the
    // law asks for at ZOOM_HEADROOM x the bake zoom. A vertex-budget guard trims the finest level.
    const floor = floorOf(r);
    const v2 = isV2(spec);
    const dots = v2 && spec.mapper === 'stipple';
    const p0S = v2 ? Math.max(hatchSpacing(r.density), litMaxPitchPen() * r.pen) : p0Screen(r);
    const p0 = p0S / r.scaleRef;
    const minPitch = Math.max(C.PLOT_FLOOR_SLACK * floor, v2 ? LAD().v2.darkPitch(spec) : darkestPitch(r));
    let L = clamp(1 + Math.ceil(Math.log2(Math.max(1, p0S * C.ZOOM_HEADROOM / minPitch))), 1, maxLevels);
    const share = cross ? (1 + 1 / r.crossRatio) : 1;
    const estVerts = (levels) => {
      const pf = p0 / Math.pow(2, levels - 1);
      return dots ? totalArea / (pf * pf) : (totalArea / pf) * share / C.STEP_MM;
    };
    while (L > 1 && estVerts(L) > C.MAX_VERTS) L -= 1;
    const pFine = p0 / Math.pow(2, L - 1);
    const lvl0Step = Math.pow(2, L - 1);

    const meta = { bakerId: 'faceted', key: String(spec.key || ''), objectId: String(spec.objectId || '') };
    const builder = SM.createBuilder(meta);
    const bmin = [Infinity, Infinity, Infinity]; const bmax = [-Infinity, -Infinity, -Infinity]; let rmax2 = 0;
    const emit = (x, y, z, n) => {
      builder.vertex(x, y, z, n[0], n[1], n[2]);
      if (x < bmin[0]) bmin[0] = x; if (x > bmax[0]) bmax[0] = x;
      if (y < bmin[1]) bmin[1] = y; if (y > bmax[1]) bmax[1] = y;
      if (z < bmin[2]) bmin[2] = z; if (z > bmax[2]) bmax[2] = z;
      const r2 = x * x + y * y + z * z; if (r2 > rmax2) rmax2 = r2;
    };

    // One family on one face: a dyadic lattice of rulings clipped to the polygon.
    const ruleFace = (g, famId, deg, pitch, phaseFrac) => {
      const a = deg * Math.PI / 180;
      const ca = Math.cos(a); const sa = Math.sin(a);
      const d = [g.U[0] * ca + g.V[0] * sa, g.U[1] * ca + g.V[1] * sa, g.U[2] * ca + g.V[2] * sa];
      const m = [g.n[1] * d[2] - g.n[2] * d[1], g.n[2] * d[0] - g.n[0] * d[2], g.n[0] * d[1] - g.n[1] * d[0]];
      const np = g.pts.length;
      const S = new Float64Array(np); const T = new Float64Array(np);
      let tmin = Infinity; let tmax = -Infinity;
      for (let k = 0; k < np; k++) {
        const p = g.pts[k];
        S[k] = d[0] * p[0] + d[1] * p[1] + d[2] * p[2];
        T[k] = m[0] * p[0] + m[1] * p[1] + m[2] * p[2];
        if (T[k] < tmin) tmin = T[k]; if (T[k] > tmax) tmax = T[k];
      }
      if (!(tmax - tmin > 2 * C.EDGE_MM)) return;
      const fine = pitch / Math.pow(2, L - 1);
      const tPhase = phaseFrac * pitch;
      const i0 = Math.ceil((tmin + C.EDGE_MM - tPhase) / fine);
      const i1 = Math.floor((tmax - C.EDGE_MM - tPhase) / fine);
      const xs = [];
      for (let i = i0; i <= i1; i++) {
        const t = tPhase + i * fine;
        xs.length = 0;
        for (let k = 0; k < np; k++) {
          const k2 = (k + 1) % np;
          const ta = T[k]; const tb = T[k2];
          if ((ta <= t) === (tb <= t)) continue;
          xs.push(S[k] + (t - ta) / (tb - ta) * (S[k2] - S[k]));
        }
        if (xs.length < 2) continue;
        xs.sort((p, q) => p - q);
        const lv = i === 0 ? 0 : Math.max(0, L - 1 - ctz(i));
        const kk = lv === 0 ? Math.round(i / lvl0Step) : Math.floor(i / Math.pow(2, L - lv));
        const rank = Math.min(RANK_CAP, vdc2((kk + 1048576) >>> 0));
        for (let q = 0; q + 1 < xs.length; q += 2) {
          const sa0 = xs[q]; const sb0 = xs[q + 1];
          const len = sb0 - sa0;
          if (!(len >= C.MIN_RUN_MM)) continue;
          const nSeg = Math.max(1, Math.ceil(len / C.STEP_MM));
          builder.beginRun(lv, rank, famId, 0);
          for (let v = 0; v <= nSeg; v++) {
            const s = sa0 + (len * v) / nSeg;
            emit(d[0] * s + m[0] * t + g.n[0] * g.h, d[1] * s + m[1] * t + g.n[1] * g.h, d[2] * s + m[2] * t + g.n[2] * g.h, g.n);
          }
          builder.endRun();
        }
      }
    };


    // ---- tone model v2: contour / spiral / stipple on a face (in-plane frame, centre-anchored for the rings) ----------
    const polyOf = (g) => {
      let cx = 0; let cy = 0; let cz = 0;
      g.pts.forEach((q) => { cx += q[0]; cy += q[1]; cz += q[2]; });
      const k = 1 / g.pts.length; cx *= k; cy *= k; cz *= k;
      const P2 = g.pts.map((q) => [(q[0] - cx) * g.U[0] + (q[1] - cy) * g.U[1] + (q[2] - cz) * g.U[2], (q[0] - cx) * g.V[0] + (q[1] - cy) * g.V[1] + (q[2] - cz) * g.V[2]]);
      // inradius about the centre (distance to the nearest edge line), a convex face assumed
      let rin = Infinity;
      for (let a = 0; a < P2.length; a++) {
        const b = (a + 1) % P2.length; const ex = P2[b][0] - P2[a][0]; const ey = P2[b][1] - P2[a][1]; const el = Math.hypot(ex, ey);
        if (el < 1e-9) continue;
        rin = Math.min(rin, Math.abs(P2[a][0] * ey - P2[a][1] * ex) / el);
      }
      return { c: [cx, cy, cz], P2, rin };
    };
    const to3 = (g, c, x, y) => [c[0] + g.U[0] * x + g.V[0] * y + 0, c[1] + g.U[1] * x + g.V[1] * y, c[2] + g.U[2] * x + g.V[2] * y];
    const lvlRank = (i, none) => {
      const lv = i === 0 ? 0 : Math.max(0, L - 1 - ctz(i));
      const kk = lv === 0 ? Math.round(i / lvl0Step) : Math.floor(i / Math.pow(2, L - lv));
      return { lv, rank: none ? 0.5 : Math.min(RANK_CAP, vdc2((kk + 1048576) >>> 0)) };
    };
    const contourFace = (g, pitch) => {
      const pl = polyOf(g);
      if (!(pl.rin > 2 * C.EDGE_MM)) return;
      const fine = pitch / Math.pow(2, L - 1);
      const iMax = Math.floor((pl.rin - C.EDGE_MM) / fine);
      for (let i = 1; i <= iMax; i++) {
        const sc = 1 - (i * fine) / pl.rin;
        if (sc <= 0.02) break;
        const { lv, rank } = lvlRank(i, false);
        builder.beginRun(lv, rank, 0, SM.FLAG.CLOSED);
        for (let a = 0; a < pl.P2.length; a++) {
          const b = (a + 1) % pl.P2.length;
          const x0 = pl.P2[a][0] * sc; const y0 = pl.P2[a][1] * sc; const x1 = pl.P2[b][0] * sc; const y1 = pl.P2[b][1] * sc;
          const nSeg = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / C.STEP_MM));
          for (let v = 0; v < nSeg; v++) {
            const p = to3(g, pl.c, x0 + (x1 - x0) * v / nSeg, y0 + (y1 - y0) * v / nSeg);
            emit(p[0], p[1], p[2], g.n);
          }
        }
        builder.endRun();
      }
    };
    // distance from the centre to the boundary along direction (cos, sin)
    const boundaryR = (P2, ca, sa) => {
      let best = Infinity;
      for (let a = 0; a < P2.length; a++) {
        const b = (a + 1) % P2.length;
        const ex = P2[b][0] - P2[a][0]; const ey = P2[b][1] - P2[a][1];
        const den = ca * ey - sa * ex;
        if (Math.abs(den) < 1e-12) continue;
        const t = (P2[a][0] * ey - P2[a][1] * ex) / den;
        const u = (P2[a][0] * sa - P2[a][1] * ca) / den;
        if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9 && t < best) best = t;
      }
      return Number.isFinite(best) ? best : 0;
    };
    const spiralFace = (g, pitch, phaseFrac) => {
      const pl = polyOf(g);
      if (!(pl.rin > 2 * C.EDGE_MM)) return;
      const N = Math.pow(2, L - 1);
      const perTurn = pitch / pl.rin; // scale lost per turn at level 0
      const ph0 = phaseFrac * 2 * Math.PI;
      for (let m = 0; m < N; m++) {
        const s0 = 1 - (m / N) * perTurn;
        if (s0 <= C.SPIRAL_MIN_S) continue;
        const lr = lvlRank(m, false); const lv = lr.lv; const rank = m === 0 ? 0.5 : lr.rank; // the lone level-0 arm needs a real demand, or it never reaches paper
        const pts = [];
        let phi = 0; let guard = 0;
        for (;;) {
          const sc = 1 - (phi / (2 * Math.PI) + m / N) * perTurn;
          if (sc <= C.SPIRAL_MIN_S) break;
          const ca = Math.cos(ph0 + phi); const sa = Math.sin(ph0 + phi);
          const R = boundaryR(pl.P2, ca, sa) * sc;
          if (R > 1e-6) pts.push(to3(g, pl.c, R * ca, R * sa));
          phi += clamp(C.STEP_MM / Math.max(R, 0.5), 0.005, 0.3);
          if (++guard > 200000) break;
        }
        if (pts.length < 2) continue;
        builder.beginRun(lv, rank, 0, 0);
        pts.forEach((q) => emit(q[0], q[1], q[2], g.n));
        builder.endRun();
      }
    };
    const inside2 = (P2, x, y, margin) => {
      let inn = false; let dmin = Infinity;
      for (let a = 0, b = P2.length - 1; a < P2.length; b = a++) {
        const xa = P2[a][0]; const ya = P2[a][1]; const xb = P2[b][0]; const yb = P2[b][1];
        if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inn = !inn;
        const ex = xb - xa; const ey = yb - ya; const l2 = ex * ex + ey * ey || 1;
        const t = clamp(((x - xa) * ex + (y - ya) * ey) / l2, 0, 1);
        dmin = Math.min(dmin, Math.hypot(x - xa - t * ex, y - ya - t * ey));
      }
      return inn && dmin >= margin;
    };
    const stippleFace = (g, pitch, phaseFrac) => {
      const pl = polyOf(g);
      const fine = pitch / Math.pow(2, L - 1);
      let xmin = Infinity; let xmax = -Infinity; let ymin = Infinity; let ymax = -Infinity;
      pl.P2.forEach((q) => { xmin = Math.min(xmin, q[0]); xmax = Math.max(xmax, q[0]); ymin = Math.min(ymin, q[1]); ymax = Math.max(ymax, q[1]); });
      // the lattice is anchored to the face's own centre-frame so the dots turn with the object
      const i0 = Math.ceil((xmin - phaseFrac * pitch) / fine); const i1 = Math.floor((xmax - phaseFrac * pitch) / fine);
      const j0 = Math.ceil((ymin - phaseFrac * pitch) / fine); const j1 = Math.floor((ymax - phaseFrac * pitch) / fine);
      const margin = Math.max(C.EDGE_MM, r.dotR * 0.75);
      const counter = new Array(L).fill(0);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const lv = Math.max(0, L - 1 - Math.min(ctz(i), ctz(j), L - 1));
          const x = phaseFrac * pitch + i * fine; const y = phaseFrac * pitch + j * fine;
          if (!inside2(pl.P2, x, y, margin)) continue;
          const rank = Math.min(RANK_CAP, vdc2(counter[lv]++));
          const p = to3(g, pl.c, x, y);
          builder.beginRun(lv, rank, 0, SM.FLAG.DOT);
          emit(p[0], p[1], p[2], g.n);
          builder.endRun();
        }
      }
    };

    for (let fi = 0; fi < geoms.length; fi++) {
      if (only >= 0 && fi !== only) continue;
      const g = geoms[fi];
      if (!g) continue;
      if (v2 && spec.mapper === 'contour') { contourFace(g, p0); continue; }
      if (v2 && spec.mapper === 'spiral') { spiralFace(g, p0, phase0); continue; }
      if (dots) { stippleFace(g, p0, phase0); continue; }
      ruleFace(g, 0, r.angle, p0, phase0);
      if (cross) ruleFace(g, 1, r.angle + C.CROSS_OBJ_DEG + (r.crossDelta - 90), p0 * r.crossRatio, frac(phase0 + C.PHASE_FAM1));
    }

    const ms = builder.finish();
    const has = Number.isFinite(bmin[0]);
    ms.bakerId = 'faceted';
    ms.meta = {
      p0,
      gain: dots ? 4 : 2,
      toneModel: dots ? 'area' : 'pitch',
      scaleRef: r.scaleRef,
      minMarkMM: 2 * r.pen,
      sepBarFrac: 1, // informational spacing bar only; no minSepFrac, so the frame cap never thins a ruled face
      bounds: has ? { min: bmin.slice(), max: bmax.slice(), radius: Math.sqrt(rmax2) } : { min: [0, 0, 0], max: [0, 0, 0], radius: 0 },
      convex: typeof spec.convex === 'boolean' ? spec.convex : (spec.primitive === 'box' || spec.primitive === 'plane'),
      levelsDesigned: L,
      msBake: now() - t0,
    };
    if (dots) ms.meta.glyph = { kind: 'circle', r: r.dotR, segs: C.DOT_SEGS };
    return ms;
  };

  Scene3D.SurfaceLockFaceted = { id: 'faceted', FIT, supports, bake, toneLUT };
})();
