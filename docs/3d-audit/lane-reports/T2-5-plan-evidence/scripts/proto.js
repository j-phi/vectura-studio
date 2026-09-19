/* T2-5 Rank-1 prototype patcher (scratch-only, scriptOverrides). */
const fs = require('fs');
const { patch1 } = require('/private/tmp/claude-501/scratch-T25/_t25/lib.js');
const SRC = '/private/tmp/claude-501/scratch-T25/src/core/scene3d/surface-fill.js';

const STAGGER_BLOCK = `          if (law.shape === 'tick') {
            const room = 0.5 * Math.max(0, sv.R - sv.L);
            if (room > 1e-6) {
              const idx = a / Math.max(1e-6, sv.P);
              const uu = ((idx * 0.6180339887498949) % 1 + 1) % 1;
              const cOff = room * (2 * uu - 1);
              polys = polys.map((pl) => pl.map((pt) => [pt[0], pt[1] + cOff]));
            }
          }`;

function build({ anchor = 'stagger', KR = null, L0 = null, subdiv = false, spill = false } = {}) {
  let s = fs.readFileSync(SRC, 'utf8');
  s = patch1(s,
    "        const R = clamp(((Number.isFinite(lp) && lp > 1e-6) ? lp : masterPitch) / markRowCoverage(), 0.25, 40);",
    "        const R = clamp(((Number.isFinite(lp) && lp > 1e-6) ? lp : masterPitch) / markRowCoverage(), 0.25, 40);\n        const RnomT25 = masterPitch / markRowCoverage();",
    'Rnom');
  s = s.split("        return { P, L, R, I, g, truePitch, bandPitch };").join("        return { P, L, R, I, g, truePitch, bandPitch, Rnom: RnomT25 };");
  // ── 1. nominal-pitch length cap (Rl) ─────────────────────────────────────
  if (KR != null) {
    s = patch1(s,
      "        const RnomT25 = masterPitch / markRowCoverage();",
      `        const RnomT25 = masterPitch / markRowCoverage();\n        const Rl = Math.min(R, ${KR} * RnomT25);`,
      'Rl');
    s = patch1(s,
      "          L = Math.min(law.L0 * R, Math.pow(Math.pow(Lease, 4) + Math.pow(Lfloor, 4), 1 / 4));",
      "          L = Math.min(law.L0 * Rl, Math.pow(Math.pow(Lease, 4) + Math.pow(Lfloor, 4), 1 / 4));",
      'Lcap');
    s = patch1(s, "        return { P, L, R, I, g, truePitch, bandPitch, Rnom: RnomT25 };",
      "        return { P, L, R, I, g, truePitch, bandPitch, Rnom: RnomT25, Rl };", 'svRl');
  } else {
    s = patch1(s, "        return { P, L, R, I, g, truePitch, bandPitch, Rnom: RnomT25 };",
      "        return { P, L, R, I, g, truePitch, bandPitch, Rnom: RnomT25, Rl: R };", 'svRl0');
  }
  // ── 2. L0 override ───────────────────────────────────────────────────────
  if (L0 != null) {
    s = patch1(s,
      "      mkTick:        { shape: 'tick',     chan: 'len',   lat: 'brick',   or: 'none',   L0: 1.16, LMIN: 0.18, P0: 1.02 },",
      `      mkTick:        { shape: 'tick',     chan: 'len',   lat: 'brick',   or: 'none',   L0: ${L0}, LMIN: 0.18, P0: 1.02 },`,
      'L0');
  }
  // ── 3b. SUB-TICK RE-TILING (T2-5 Rank 1) ─────────────────────────────────
  if (subdiv) {
    const offExpr = anchor === 'fixed'
      ? 'room'
      : (anchor === 'grad' ? 'room * sgn' : 'room * (2 * (((( (a / Math.max(1e-6, sv.P)) + j) * 0.6180339887498949) % 1 + 1) % 1) - 1)');
    const gradPre = anchor === 'grad' ? `
              const probe = (dv) => {
                const pp = fr.toParam(0, dv);
                if (!(pp.a >= 0 && pp.a <= 1)) return null;
                let bb = pp.b;
                if (bb < 0 || bb > 1) { if (bb < -0.25 || bb > 1.25) return null; bb = ((bb % 1) + 1) % 1; }
                const sm = sampleAt(pp.a, bb);
                return (sm && sm.front === wantFront && Number.isFinite(sm.I)) ? sm.I : null;
              };
              const ipT = probe(0.5 * sv.R); const imT = probe(-0.5 * sv.R);
              let sgn = 1;
              if (ipT != null && imT != null) sgn = (ipT <= imT) ? 1 : -1;
              else if (ipT != null && imT == null) sgn = -1;
` : '';
    const body = spill ? `          if (law.shape === 'tick') {
            const nSub = Math.max(1, Math.min(6, Math.round(sv.R / Math.max(1e-6, sv.Rnom))));
            const sub = sv.R / nSub;
            const each = sv.L / nSub;
            const room = 0.5 * Math.max(0, sub - each);
            mkStat.t25band = sub;
${gradPre}            polys = [];
            for (let j = 0; j < nSub; j += 1) {
              const base = (j - (nSub - 1) / 2) * sub;
              const cOff = room > 1e-6 ? (${offExpr}) : 0;
              // FILL-THEN-SPILL: no pass may exceed its own sub-band. Whole
              // band-widths are laid as full passes an ink width apart along
              // the ruling (abutment, then a band); the remainder is one
              // shorter pass placed by the anchor.
              let rem = each;
              let q = 0;
              while (rem > sub * 1.0000001 && q < 6) {
                const offU = q * w;
                polys.push([[offU, base - sub / 2], [offU, base + sub / 2]]);
                rem -= sub; q += 1;
              }
              if (rem > 1e-6) {
                const offU = q * w;
                const r2 = 0.5 * Math.max(0, sub - rem);
                const c2 = r2 > 1e-6 ? (${offExpr.split('room').join('r2')}) : 0;
                polys.push([[offU, base + c2 - rem / 2], [offU, base + c2 + rem / 2]]);
              }
            }
          }` : `          if (law.shape === 'tick') {
            const nSub = Math.max(1, Math.min(6, Math.round(sv.R / Math.max(1e-6, sv.Rnom))));
            const sub = sv.R / nSub;
            const each = sv.L / nSub;
            const room = 0.5 * Math.max(0, sub - each);
            mkStat.t25band = sub;
${gradPre}            polys = [];
            for (let j = 0; j < nSub; j += 1) {
              const base = (j - (nSub - 1) / 2) * sub;
              const cOff = room > 1e-6 ? (${offExpr}) : 0;
              polys.push([[0, base + cOff - each / 2], [0, base + cOff + each / 2]]);
            }
          }`;
    s = patch1(s, STAGGER_BLOCK, body, 'subdiv');
  } else if (anchor !== 'stagger') {
    let blk;
    if (anchor === 'fixed') {
      blk = `          if (law.shape === 'tick') {
            const room = 0.5 * Math.max(0, sv.Rl - sv.L);
            if (room > 1e-6) {
              const cOff = room;
              polys = polys.map((pl) => pl.map((pt) => [pt[0], pt[1] + cOff]));
            }
          }`;
    } else if (anchor === 'grad') {
      blk = `          if (law.shape === 'tick') {
            const room = 0.5 * Math.max(0, sv.Rl - sv.L);
            if (room > 1e-6) {
              const probe = (dv) => {
                const pp = fr.toParam(0, dv);
                if (!(pp.a >= 0 && pp.a <= 1)) return null;
                let bb = pp.b;
                if (bb < 0 || bb > 1) { if (bb < -0.25 || bb > 1.25) return null; bb = ((bb % 1) + 1) % 1; }
                const sm = sampleAt(pp.a, bb);
                return (sm && sm.front === wantFront && Number.isFinite(sm.I)) ? sm.I : null;
              };
              const dv = 0.5 * sv.Rl;
              const ip = probe(dv); const im = probe(-dv);
              let sgn = 1;
              if (ip != null && im != null) sgn = (ip <= im) ? 1 : -1;
              else if (ip != null && im == null) sgn = -1;
              else if (im != null && ip == null) sgn = 1;
              const cOff = room * sgn;
              polys = polys.map((pl) => pl.map((pt) => [pt[0], pt[1] + cOff]));
            }
          }`;
    } else throw new Error('anchor?');
    s = patch1(s, STAGGER_BLOCK, blk, 'anchor');
  } else if (KR != null) {
    s = patch1(s, "            const room = 0.5 * Math.max(0, sv.R - sv.L);",
      "            const room = 0.5 * Math.max(0, sv.Rl - sv.L);", 'roomRl');
  }
  return s;
}
module.exports = { build };
