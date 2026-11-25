/**
 * Scene3D.SurfaceLockMarkSet — the MarkSet data layout (docs/surface-lock-contract.md §2).
 *
 * A MarkSet is the pose-independent output of one bake: every mark a fill could ever draw on one
 * object, in the object's SCALED LOCAL frame (mm; object scale applied, rotation and translation not),
 * nested by level and ranked inside each level, with an object-space unit normal per vertex.
 *
 *   createBuilder(meta) -> builder
 *     builder.beginRun(level, rank, family, flags, capRank?, pen?, weight?)   rank in [0, 1); capRank (optional, [0, 1)) keys the plot-floor cap (contract §2, A13)
 *     builder.vertex(x, y, z, nx, ny, nz)            normal need not be unit (it is normalised)
 *     builder.endRun()                               runs with < 1 vertex are dropped; non-dot runs need >= 2
 *     builder.finish() -> MarkSet
 *   octEncode(nx, ny, nz, out, i) / octDecode(oct, i, out) — octahedral Int16 normals
 *   validate(ms) -> [] | [problem strings]
 *   byteSize(ms), transferList(ms) (the ArrayBuffers a worker may transfer), rankOf(ms, r)
 *
 * Everything is deterministic: the same calls in the same order give identical typed arrays.
 */
(function registerSurfaceLockMarkSet() {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const Scene3D = (Vectura.Scene3D = Vectura.Scene3D || {});
  const CFG = Vectura.SCENE3D_SURFACE_LOCK || {};
  // Local aliases: a hot-loop `Math.x` / `Number.isFinite` is a global lookup, which a window-backed global (jsdom, a vm context) answers through an interceptor.
  const Mth = Math;
  const isFin = Number.isFinite;
  const OCT = CFG.OCT_SCALE || 32767;
  const MAX_LEVELS = CFG.MAX_LEVELS || 6;

  const LAYOUT_VERSION = 1;
  // runFlags bits.
  const FLAG = Object.freeze({ CLOSED: 1, DOT: 2, BACK: 4 });
  // D0 (contract A26): optional per-run channels. runPen (Uint8): 0 = the object's pen, k = meta.penIds[k - 1]. runWeight (Uint8):
  // 0 = default width, else the line-weight scale in 1/WEIGHT_UNIT steps (64 = x1). Absent on every legacy MarkSet.
  const WEIGHT_UNIT = 64;
  const RANK_SCALE = 65536; // rank r is stored as round(r * 65536) clamped to 65535

  const signNZ = (v) => (v < 0 ? -1 : 1);
  const octEncode = (nx, ny, nz, out, i) => {
    const L = Mth.abs(nx) + Mth.abs(ny) + Mth.abs(nz) || 1;
    let u = nx / L; let v = ny / L;
    if (nz < 0) {
      const ou = u;
      u = (1 - Mth.abs(v)) * signNZ(ou);
      v = (1 - Mth.abs(ou)) * signNZ(v);
    }
    out[i] = Mth.round(Mth.max(-1, Mth.min(1, u)) * OCT);
    out[i + 1] = Mth.round(Mth.max(-1, Mth.min(1, v)) * OCT);
  };
  // Writes the decoded UNIT normal into out[0..2] and returns out.
  const octDecode = (oct, i, out) => {
    const u = oct[i] / OCT; const v = oct[i + 1] / OCT;
    let z = 1 - Mth.abs(u) - Mth.abs(v);
    let x = u; let y = v;
    if (z < 0) {
      x = (1 - Mth.abs(v)) * signNZ(u);
      y = (1 - Mth.abs(u)) * signNZ(v);
    }
    const L = Mth.hypot(x, y, z) || 1;
    out[0] = x / L; out[1] = y / L; out[2] = z / L;
    return out;
  };

  const grow = (arr, need) => {
    if (need <= arr.length) return arr;
    let n = Mth.max(16, arr.length * 2);
    while (n < need) n *= 2;
    const next = new arr.constructor(n);
    next.set(arr);
    return next;
  };

  const createBuilder = (meta) => {
    let pos = new Float32Array(3 * 1024); let nrm = new Int16Array(2 * 1024); let nv = 0;
    let start = new Uint32Array(256); let level = new Uint8Array(256); let rank = new Uint16Array(256);
    let family = new Uint8Array(256); let flags = new Uint8Array(256); let nr = 0;
    let runBand = null; // WD-D2 (contract A28): optional per-run tone band (2 x Uint8: lo, hi in 1/255 of the tone I), allocated on the first run that has one
    let runPen = null; let runWeight = null; // allocated on the first run that carries a pen / weight (contract A26)
    let capRank = null; // allocated on the first run that carries a capRank; absent otherwise (contract A13)
    let open = null;
    const levelCounts = new Uint32Array(MAX_LEVELS);
    const b = {
      beginRun(lv, r, fam, fl, cap, pen, weight, bandLo, bandHi) {
        if (open) throw new Error('SurfaceLockMarkSet: beginRun inside an open run');
        const L = lv | 0;
        if (L < 0 || L >= MAX_LEVELS) throw new Error(`SurfaceLockMarkSet: level ${lv} outside 0..${MAX_LEVELS - 1}`);
        const rr = Number(r);
        if (!(rr >= 0 && rr < 1)) throw new Error(`SurfaceLockMarkSet: rank ${r} outside [0, 1)`);
        open = { v0: nv, level: L, rank: Mth.min(RANK_SCALE - 1, Mth.round(rr * RANK_SCALE)), family: fam | 0, flags: fl | 0, cap: null, pen: 0, weight: 0, band: null };
        if (bandLo !== undefined || bandHi !== undefined) {
          const lo = Mth.max(0, Mth.min(255, Mth.round(255 * (isFin(bandLo) ? bandLo : 0))));
          const hi = Mth.max(0, Mth.min(255, Mth.round(255 * (isFin(bandHi) ? bandHi : 1))));
          if (lo > 0 || hi < 255) open.band = [lo, hi];
        }
        if (pen) open.pen = Mth.max(0, Mth.min(255, pen | 0));
        if (weight) open.weight = Mth.max(0, Mth.min(255, Mth.round(Number(weight)) || 0));
        if (cap !== undefined && cap !== null) {
          const cc = Number(cap);
          if (!(cc >= 0 && cc < 1)) throw new Error(`SurfaceLockMarkSet: capRank ${cap} outside [0, 1)`);
          open.cap = Mth.min(RANK_SCALE - 1, Mth.round(cc * RANK_SCALE));
        }
      },
      vertex(x, y, z, nx, ny, nz) {
        if (!open) throw new Error('SurfaceLockMarkSet: vertex outside a run');
        pos = grow(pos, 3 * (nv + 1)); nrm = grow(nrm, 2 * (nv + 1));
        pos[3 * nv] = x; pos[3 * nv + 1] = y; pos[3 * nv + 2] = z;
        octEncode(nx, ny, nz, nrm, 2 * nv);
        nv += 1;
      },
      endRun() {
        if (!open) throw new Error('SurfaceLockMarkSet: endRun without beginRun');
        const n = nv - open.v0;
        const dot = (open.flags & FLAG.DOT) !== 0;
        if (n < 1 || (!dot && n < 2)) { nv = open.v0; open = null; return false; }
        start = grow(start, nr + 2); level = grow(level, nr + 1); rank = grow(rank, nr + 1);
        family = grow(family, nr + 1); flags = grow(flags, nr + 1);
        if (open.cap !== null && !capRank) capRank = new Uint16Array(Mth.max(256, level.length));
        if (capRank) { capRank = grow(capRank, nr + 1); capRank[nr] = open.cap === null ? 0 : open.cap; }
        if (open.pen && !runPen) runPen = new Uint8Array(Mth.max(256, level.length));
        if (runPen) { runPen = grow(runPen, nr + 1); runPen[nr] = open.pen; }
        if (open.band && !runBand) { runBand = new Uint8Array(2 * Mth.max(256, level.length)); for (let q = 0; q < nr; q++) runBand[2 * q + 1] = 255; }
        if (runBand) { runBand = grow(runBand, 2 * (nr + 1)); runBand[2 * nr] = open.band ? open.band[0] : 0; runBand[2 * nr + 1] = open.band ? open.band[1] : 255; }
        if (open.weight && !runWeight) runWeight = new Uint8Array(Mth.max(256, level.length));
        if (runWeight) { runWeight = grow(runWeight, nr + 1); runWeight[nr] = open.weight; }
        start[nr] = open.v0; level[nr] = open.level; rank[nr] = open.rank; family[nr] = open.family; flags[nr] = open.flags;
        levelCounts[open.level] += 1;
        nr += 1; start[nr] = nv; open = null;
        return true;
      },
      finish() {
        if (open) throw new Error('SurfaceLockMarkSet: finish with an open run');
        let levels = 0;
        for (let i = 0; i < MAX_LEVELS; i++) if (levelCounts[i]) levels = i + 1;
        const m = meta || {};
        const out = {
          layout: LAYOUT_VERSION,
          bakerId: String(m.bakerId || ''),
          key: String(m.key || ''),
          objectId: String(m.objectId || ''),
          vertexCount: nv,
          runCount: nr,
          levels,
          positions: pos.slice(0, 3 * nv),
          normals: nrm.slice(0, 2 * nv),
          runStart: start.slice(0, nr + 1),
          runLevel: level.slice(0, nr),
          runRank: rank.slice(0, nr),
          runFamily: family.slice(0, nr),
          runFlags: flags.slice(0, nr),
          meta: Object.assign({}, m.meta || {}),
        };
        // A run that lacks a capRank while its siblings carry one reads 0 (never capped): only laws that stamp every run use it.
        if (capRank) out.runCapRank = capRank.slice(0, nr);
        if (runPen) out.runPen = runPen.slice(0, nr);
        if (runWeight) out.runWeight = runWeight.slice(0, nr);
        if (runBand) out.runBand = runBand.slice(0, 2 * nr);
        return out;
      },
    };
    return b;
  };

  const rankOf = (ms, r) => ms.runRank[r] / RANK_SCALE;

  const validate = (ms) => {
    const bad = [];
    if (!ms || ms.layout !== LAYOUT_VERSION) return ['layout'];
    const { vertexCount: nv, runCount: nr } = ms;
    if (ms.positions.length !== 3 * nv) bad.push('positions length');
    if (ms.normals.length !== 2 * nv) bad.push('normals length');
    if (ms.runStart.length !== nr + 1) bad.push('runStart length');
    ['runLevel', 'runRank', 'runFamily', 'runFlags'].forEach((k) => { if (ms[k].length !== nr) bad.push(`${k} length`); });
    if (ms.runCapRank && ms.runCapRank.length !== nr) bad.push('runCapRank length');
    if (ms.runPen && ms.runPen.length !== nr) bad.push('runPen length');
    if (ms.runWeight && ms.runWeight.length !== nr) bad.push('runWeight length');
    if (ms.runBand && ms.runBand.length !== 2 * nr) bad.push('runBand length');
    if (ms.runStart[0] !== 0 && nr) bad.push('runStart[0]');
    if (ms.runStart[nr] !== nv) bad.push('runStart[last]');
    for (let r = 0; r < nr; r++) {
      if (ms.runStart[r + 1] <= ms.runStart[r]) { bad.push(`run ${r} empty`); break; }
      if (ms.runLevel[r] >= MAX_LEVELS) { bad.push(`run ${r} level`); break; }
    }
    for (let i = 0; i < ms.positions.length; i++) if (!isFin(ms.positions[i])) { bad.push('non-finite position'); break; }
    if (!ms.meta || !(ms.meta.p0 > 0)) bad.push('meta.p0');
    return bad;
  };

  const ARRAYS = ['positions', 'normals', 'runStart', 'runLevel', 'runRank', 'runFamily', 'runFlags'];
  const OPTIONAL = ['runCapRank', 'runPen', 'runWeight', 'runBand'];
  const byteSize = (ms) => ARRAYS.concat(OPTIONAL).reduce((s, k) => s + (ms && ms[k] ? ms[k].byteLength : 0), 0);
  const transferList = (ms) => ARRAYS.concat(OPTIONAL.filter((k) => ms[k])).map((k) => ms[k].buffer);

  Scene3D.SurfaceLockMarkSet = {
    LAYOUT_VERSION, FLAG, RANK_SCALE, WEIGHT_UNIT, createBuilder, octEncode, octDecode, validate, byteSize, transferList, rankOf,
  };
})();
