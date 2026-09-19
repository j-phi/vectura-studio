/* T2-6 prototype patcher — scratch-only, scriptOverrides, nothing written to disk. */
const fs = require('fs');
const { patch1 } = require('/private/tmp/claude-501/scratch-T26/_t26/lib.js');
const SRC = '/private/tmp/claude-501/scratch-T26/src/core/scene3d/surface-fill.js';

// the whole shipped T2-5 tick block, verbatim, from `if (law.shape === 'tick') {` to its close
const HEAD_BLOCK = `          if (law.shape === 'tick') {
            const nominalRP = masterPitch / MK_ROW_COV;
            // \`nSub\` is the MINIMUM split that clears the over2RP bar itself
            // (\`law.L0*R > 2*nominalRP\`), not a blanket round-to-nearest —
            // touching only the sites that actually need it keeps the
            // longest-third chord population (\`scene3d-mark-laws-draw.test.js\`'s
            // own O1 sagitta oracle, a file outside this unit's scope) as
            // close to untouched as clause (c) allows.
            const nSub = clamp(Math.ceil((law.L0 * sv.R) / Math.max(1e-6, 2 * nominalRP)), 1, 6);
            if (nSub > 1) {
              const sub = sv.R / nSub;
              const each = sv.L / nSub;
              const tiled = [];
              for (let j = 0; j < nSub; j++) {
                const vCenter = (j - (nSub - 1) / 2) * sub;
                const room = 0.5 * Math.max(0, sub - each);
                let cOff = 0;
                if (room > 1e-6) {
                  const idx = (a / Math.max(1e-6, sv.P)) + j * 0.6180339887498949;
                  const uu = ((idx * 0.6180339887498949) % 1 + 1) % 1;
                  cOff = room * (2 * uu - 1);
                }
                tiled.push([[0, vCenter - each / 2 + cOff], [0, vCenter + each / 2 + cOff]]);
              }
              polys = tiled;
            } else {
              const room = 0.5 * Math.max(0, sv.R - sv.L);
              if (room > 1e-6) {
                const idx = a / Math.max(1e-6, sv.P);
                const uu = ((idx * 0.6180339887498949) % 1 + 1) % 1;
                const cOff = room * (2 * uu - 1);
                polys = polys.map((pl) => pl.map((pt) => [pt[0], pt[1] + cOff]));
              }
            }
          }`;

/* opts:
   subMinPen  min sub-tick length in pen widths (0 => never split on this rule)
   subMax     max sub-ticks per band
   rho        0.5..1 geometric length ratio between consecutive sub-ticks (1 = flat comb)
   anchor     0..1 how far each sub-tick is pushed to the DARK edge of its own sub-band
   single     'stagger' | 'grad'  — what a non-split band does
   L0         optional MK.mkTick.L0 override                                       */
function build(o = {}) {
  const subMax = o.subMax != null ? o.subMax : 4;
  const rho = o.rho != null ? o.rho : 0.62;
  const minKeepPen = o.minKeepPen != null ? o.minKeepPen : 1.0;
  const splitMinR = o.splitMinR != null ? o.splitMinR : 0.30;
  const splitMaxR = o.splitMaxR != null ? o.splitMaxR : 0.98;
  const dropSub = !!o.dropSub;
  const bandOnly = o.bandOnly != null ? o.bandOnly : 1;   // only comb where BOTH band edges are on-chart
  const env = o.env != null ? o.env : 1.0;                // comb envelope as a fraction of R
  const anchor = o.anchor != null ? o.anchor : 1;
  const single = o.single || 'grad';
  let s = fs.readFileSync(SRC, 'utf8');

  const GRADPROBE = `
            const probeI = (dv) => {
              const pp = fr.toParam(0, dv);
              if (!(pp.a >= 0 && pp.a <= 1)) return null;
              let bb = pp.b;
              if (bb < 0 || bb > 1) { if (bb < -0.25 || bb > 1.25) return null; bb = ((bb % 1) + 1) % 1; }
              const sm = sampleAt(pp.a, bb);
              return (sm && sm.front === wantFront && Number.isFinite(sm.I)) ? sm.I : null;
            };
            const iP = probeI(0.5 * sv.R); const iM = probeI(-0.5 * sv.R);
            // sgnDark = +1 when the +v side of the band is the DARKER side
            let sgnDark = 0;
            if (iP != null && iM != null) sgnDark = (iP < iM) ? 1 : ((iP > iM) ? -1 : 0);
            else if (iP != null) sgnDark = -1;
            else if (iM != null) sgnDark = 1;
`;

  const BLOCK = `          if (law.shape === 'tick') {
            const nominalRP = masterPitch / MK_ROW_COV;
            // clause (c), T2-5: the MINIMUM split that keeps a tick inside two
            // nominal row pitches. Never reduced by this unit.
            const nOver = clamp(Math.ceil((law.L0 * sv.R) / Math.max(1e-6, 2 * nominalRP)), 1, 6);
${GRADPROBE}
            // ---- T2-6: the GRADED BAND COMB -------------------------------
            // A geometric run each_j = e0 * RHO^j (sum EXACTLY sv.L, so the
            // delivered ink area is bit-identical) laid across the band's own
            // nSub sub-bands, longest at the DARK edge. Every consecutive pair
            // has ratio exactly RHO, so "no tick under half its neighbour"
            // holds by construction at RHO >= 0.5. nSub is the LARGEST count
            // for which that run actually fits: no sub-tick may exceed its own
            // sub-band (R/nSub) and none may fall under minKeep.
            const RHO = ${rho};
            const minKeep = ${minKeepPen} * penWidth;
            let nComb = 1; let e0 = 0;
            const bandOn = (${bandOnly} === 0) || (iP != null && iM != null);
            if (bandOn && sv.L >= ${splitMinR} * sv.R && sv.L < ${splitMaxR} * sv.R) {
              for (let n = ${subMax}; n >= 2; n -= 1) {
                const den = (1 - Math.pow(RHO, n)) / (1 - RHO);
                const a0 = sv.L / den;
                if (a0 <= (${env} * sv.R) / n && a0 * Math.pow(RHO, n - 1) >= minKeep) { nComb = n; e0 = a0; break; }
              }
            }
            const nSub = Math.max(nOver, nComb);
            const uniformPre = (nComb < 2 || nSub !== nComb || sv.L >= sv.R);
            if (nSub > 1) {
              const sub = (uniformPre ? sv.R : ${env} * sv.R) / nSub;
              const dir = sgnDark >= 0 ? 1 : -1;   // +1 => the +v side is DARKER
              const uniform = uniformPre;

              const tiled = [];
              for (let j = 0; j < nSub; j++) {
                // j = 0 is the DARKEST sub-band; lengths fall toward the light
                const each = uniform ? (sv.L / nSub) : (e0 * Math.pow(RHO, j));
                const slot = dir > 0 ? (nSub - 1 - j) : j;    // slot index in +v order
                const vC = (slot - (nSub - 1) / 2) * sub;
                const room = Math.max(0, sub - each);
                // anchor: 0 = centred in its sub-band, 1 = flush to its DARK edge
                const off = ${anchor} * dir * (room / 2);
                tiled.push([[0, vC + off - each / 2], [0, vC + off + each / 2]]);
              }
              polys = tiled;
            } else {
              const room = 0.5 * Math.max(0, sv.R - sv.L);
              if (room > 1e-6) {
                ${single === 'grad'
                  ? `const cOff = ${anchor} * (sgnDark >= 0 ? room : -room);`
                  : `const idx = a / Math.max(1e-6, sv.P);
                const uu = ((idx * 0.6180339887498949) % 1 + 1) % 1;
                const cOff = room * (2 * uu - 1);`}
                polys = polys.map((pl) => pl.map((pt) => [pt[0], pt[1] + cOff]));
              }
            }
          }`;
  s = patch1(s, HEAD_BLOCK, BLOCK, 'T26block');
  if (dropSub) {
    // TICK-ONLY: when ONE sub-tick of a multi-poly tick comb leaves the chart,
    // drop that sub-tick instead of the whole mark. Every other law, and a
    // single-poly tick, keep the shipped `return false` exactly.
    s = patch1(s,
      "            if (!wk.pts) { mkStat.offSurface += 1; return false; }",
      "            if (!wk.pts) { mkStat.offSurface += 1; if (law.shape === 'tick' && polys.length > 1) continue; return false; }",
      'dropSub');
  }
  if (o.L0 != null) {
    s = patch1(s,
      "      mkTick:        { shape: 'tick',     chan: 'len',   lat: 'brick',   or: 'none',   L0: 1.16, LMIN: 0.18, P0: 1.02 },",
      `      mkTick:        { shape: 'tick',     chan: 'len',   lat: 'brick',   or: 'none',   L0: ${o.L0}, LMIN: 0.18, P0: 1.02 },`,
      'L0');
  }
  return s;
}
module.exports = { build, HEAD_BLOCK };
