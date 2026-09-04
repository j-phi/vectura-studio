/* ROUND 8 — the PROTECTED LIST, audited at HEAD. Fixture from render.js only.
 *
 * Replaces `r7audit-protected.js`, which reads `p.regionClass` / `p.meta.regionClass`.
 * Neither exists: the class lives at `p.meta.sceneTarget.regionClass` and the layer
 * at `p.meta.sceneTarget.shadowLayer` (see render.js `metricsOf`, m4.js `sourceOf`).
 * The old script therefore printed `cast 0.00mm/0p` for every view — it could not
 * have caught a cast-shadow regression at all.
 *
 * Run: node r8audit-protected.js
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');   // repo root, wherever this worktree lives
const { loadVecturaRuntime } = require(path.join(ROOT, 'tests/helpers/load-vectura-runtime'));
const R7 = require('./render.js');

const len = (p) => {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  return s;
};

// The Round 7 protected values, verbatim from the review's §4.
const EXPECT = {
  'A-off': { cast: 16109.77, castPaths: 535 },
  'A-2': { cast: 7840.20, castPaths: 428, Z: { 0: [1318.44, 211], 2: [6521.76, 217] } },
  'A-3': { cast: 8896.92, castPaths: 835, Z: { 0: [1318.44, 211], 1: [1776.09, 355], 2: [5802.40, 269] } },
  'A-4': { cast: 7448.60, castPaths: 1199, Z: { 0: [1318.44, 211], 1: [1750.32, 348], 2: [3735.33, 239], 3: [644.51, 401] } },
};

(async () => {
  const rt = await loadVecturaRuntime();
  const V = rt.window.Vectura;
  let bad = 0;
  for (const id of Object.keys(EXPECT)) {
    const paths = R7.buildPaths(V, id);
    let castInk = 0; let castPaths = 0;
    const byLayer = new Map();
    paths.forEach((p) => {
      const t = (p.meta && p.meta.sceneTarget) || {};
      if (t.regionClass !== 'castShadow') return;
      const L = len(p);
      castInk += L; castPaths += 1;
      const k = t.shadowLayer != null ? t.shadowLayer : '?';
      const e = byLayer.get(k) || { ink: 0, n: 0 };
      e.ink += L; e.n += 1; byLayer.set(k, e);
    });
    const exp = EXPECT[id];
    const okCast = Math.abs(castInk - exp.cast) < 0.02 && castPaths === exp.castPaths;
    if (!okCast) bad++;
    const rows = [...byLayer.entries()].sort((a, b) => a[0] - b[0])
      .map(([k, e]) => {
        const want = exp.Z && exp.Z[k];
        const ok = want ? (Math.abs(e.ink - want[0]) < 0.02 && e.n === want[1]) : null;
        if (ok === false) bad++;
        return `Z${k} ${e.ink.toFixed(2)}/${e.n}${ok === false ? ' <<MOVED' : ''}`;
      }).join('  ');
    console.log(`${id.padEnd(6)} cast ${castInk.toFixed(2)}mm/${castPaths}p ${okCast ? 'OK' : '<<MOVED (want '
      + `${exp.cast}/${exp.castPaths})`}   ${rows}`);
  }
  // ── MUTATION CHECK (Round 9 rule) ────────────────────────────────────────
  // A probe's output may not be quoted until the probe has been shown to be able
  // to say NO. `r7audit-protected.js` printed `cast 0.00mm/0p` on every view and
  // its output was quoted as a protected-list table for a whole round. So: read
  // the same views through a DELIBERATELY WRONG field name and require that the
  // audit reports zeros. If the wrong field also finds ink, this script is not
  // reading what it claims to read.
  let mutantInk = 0;
  R7.buildPaths(V, 'A-4').forEach((p) => {
    const t = (p.meta && p.meta.regionClass) || (p && p.regionClass);   // the R7 defect, verbatim
    if (t === 'castShadow') mutantInk += len(p);
  });
  const live = R7.buildPaths(V, 'A-4')
    .filter((p) => ((p.meta && p.meta.sceneTarget) || {}).regionClass === 'castShadow').length;
  const mutOk = mutantInk === 0 && live > 0;
  console.log(`\n[mutation check] wrong-field read finds ${mutantInk.toFixed(2)} mm (must be 0); `
    + `correct-field read finds ${live} cast paths (must be > 0) — ${mutOk ? 'PASS' : 'FAIL: DO NOT QUOTE THIS OUTPUT'}`);
  if (!mutOk) { console.log('\nPROTECTED LIST: UNVERIFIABLE.'); rt.cleanup(); process.exit(2); }
  console.log(bad === 0 ? 'PROTECTED LIST: intact.' : `PROTECTED LIST: ${bad} value(s) MOVED.`);
  rt.cleanup();
  process.exit(0);
})();
