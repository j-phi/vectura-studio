/**
 * Scene3D.SurfaceLockMarkSet — the MarkSet data layout (docs/surface-lock-contract.md §2).
 *
 * A MarkSet is the pose-independent output of one bake: every mark a fill could ever draw on one
 * object, in the object's SCALED LOCAL frame (mm; object scale applied, rotation and translation not),
 * nested by level and ranked inside each level, with an object-space unit normal per vertex.
 *
 *   createBuilder(meta) -> builder
 *     builder.beginRun(level, rank, family, flags)   rank in [0, 1)
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
  const OCT = CFG.OCT_SCALE || 32767;
  const MAX_LEVELS = CFG.MAX_LEVELS || 6;

  const LAYOUT_VERSION = 1;
  // runFlags bits.
  const FLAG = Object.freeze({ CLOSED: 1, DOT: 2, BACK: 4 });
  const RANK_SCALE = 65536; // rank r is stored as round(r * 65536) clamped to 65535

  const signNZ = (v) => (v < 0 ? -1 : 1);
  const octEncode = (nx, ny, nz, out, i) => {
    const L = Math.abs(nx) + Math.abs(ny) + Math.abs(nz) || 1;
    let u = nx / L; let v = ny / L;
    if (nz < 0) {
      const ou = u;
      u = (1 - Math.abs(v)) * signNZ(ou);
      v = (1 - Math.abs(ou)) * signNZ(v);
    }
    out[i] = Math.round(Math.max(-1, Math.min(1, u)) * OCT);
    out[i + 1] = Math.round(Math.max(-1, Math.min(1, v)) * OCT);
  };
  // Writes the decoded UNIT normal into out[0..2] and returns out.
  const octDecode = (oct, i, out) => {
    const u = oct[i] / OCT; const v = oct[i + 1] / OCT;
    let z = 1 - Math.abs(u) - Math.abs(v);
    let x = u; let y = v;
    if (z < 0) {
      x = (1 - Math.abs(v)) * signNZ(u);
      y = (1 - Math.abs(u)) * signNZ(v);
    }
    const L = Math.hypot(x, y, z) || 1;
    out[0] = x / L; out[1] = y / L; out[2] = z / L;
    return out;
  };

  const grow = (arr, need) => {
    if (need <= arr.length) return arr;
    let n = Math.max(16, arr.length * 2);
    while (n < need) n *= 2;
    const next = new arr.constructor(n);
    next.set(arr);
    return next;
  };

  const createBuilder = (meta) => {
    let pos = new Float32Array(3 * 1024); let nrm = new Int16Array(2 * 1024); let nv = 0;
    let start = new Uint32Array(256); let level = new Uint8Array(256); let rank = new Uint16Array(256);
    let family = new Uint8Array(256); let flags = new Uint8Array(256); let nr = 0;
    let open = null;
    const levelCounts = new Uint32Array(MAX_LEVELS);
    const b = {
      beginRun(lv, r, fam, fl) {
        if (open) throw new Error('SurfaceLockMarkSet: beginRun inside an open run');
        const L = lv | 0;
        if (L < 0 || L >= MAX_LEVELS) throw new Error(`SurfaceLockMarkSet: level ${lv} outside 0..${MAX_LEVELS - 1}`);
        const rr = Number(r);
        if (!(rr >= 0 && rr < 1)) throw new Error(`SurfaceLockMarkSet: rank ${r} outside [0, 1)`);
        open = { v0: nv, level: L, rank: Math.min(RANK_SCALE - 1, Math.round(rr * RANK_SCALE)), family: fam | 0, flags: fl | 0 };
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
        return {
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
    if (ms.runStart[0] !== 0 && nr) bad.push('runStart[0]');
    if (ms.runStart[nr] !== nv) bad.push('runStart[last]');
    for (let r = 0; r < nr; r++) {
      if (ms.runStart[r + 1] <= ms.runStart[r]) { bad.push(`run ${r} empty`); break; }
      if (ms.runLevel[r] >= MAX_LEVELS) { bad.push(`run ${r} level`); break; }
    }
    for (let i = 0; i < ms.positions.length; i++) if (!Number.isFinite(ms.positions[i])) { bad.push('non-finite position'); break; }
    if (!ms.meta || !(ms.meta.p0 > 0)) bad.push('meta.p0');
    return bad;
  };

  const ARRAYS = ['positions', 'normals', 'runStart', 'runLevel', 'runRank', 'runFamily', 'runFlags'];
  const byteSize = (ms) => ARRAYS.reduce((s, k) => s + (ms && ms[k] ? ms[k].byteLength : 0), 0);
  const transferList = (ms) => ARRAYS.map((k) => ms[k].buffer);

  Scene3D.SurfaceLockMarkSet = {
    LAYOUT_VERSION, FLAG, RANK_SCALE, createBuilder, octEncode, octDecode, validate, byteSize, transferList, rankOf,
  };
})();
