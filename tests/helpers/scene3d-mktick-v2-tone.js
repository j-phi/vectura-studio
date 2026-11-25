/**
 * Tone-model-v2 measurement domain for the mkTick spacing-tone audits (U8).
 *
 * Under tone model v2 (the default for a new scene) the pose ladder gates every ruling sample by its
 * v2 density `v2Dens = rel(I) * specularKeep(S)` (surface-fill.js, `V2_PAPER_DENS_POSE` = 0.12): a sample
 * under that floor is BARE PAPER by contract (the lightest ~15-18 % of the tone range and the specular
 * glint, contract A16/A22). The legacy audits measure the whole [0,1) intensity range and every bare pixel,
 * which is the wrong domain for v2. This module gives the v2 domain:
 *   - `inkCut`   the largest diffuse intensity I whose v2 tone is still inked (rel(I) >= floor);
 *                tone is split / binned over [0, inkCut), not [0, 1).
 *   - `samples`  every on-surface front sample [x, y, I, S, v2Dens] the sampler visited (before the paper
 *                gate), in the same mm frame as the emitted paths, so a bare pixel can be classed as
 *                "target coverage > 0" (inked domain) or "paper / glint" by its nearest sample.
 * Needle-patch hooks only (every needle asserts count === 1); nothing is written to disk.
 */
const { patchOne } = require('./scene3d-mktick-spacing-tone-shared');

const V2_CAPTURE_NEEDLE = 'const V2_PAPER_DENS_POSE = 0.12;';
const V2_CAPTURE_REPL = `${V2_CAPTURE_NEEDLE}
    if (typeof globalThis.__U8_V2__ === 'function') globalThis.__U8_V2__({ on: v2On, floor: V2_PAPER_DENS_POSE, rel: (x) => v2Curve().rel(x) });`;
const V2_SAMPLE_NEEDLE = 'if (v2On && on && v2Dens(smp) < V2_PAPER_DENS_POSE) smps[s] = null;';
const V2_SAMPLE_REPL = `${V2_SAMPLE_NEEDLE}
        if (v2On && on && typeof globalThis.__U8_SMP__ === 'function') globalThis.__U8_SMP__([smp.x, smp.y, smp.I, smp.S, v2Dens(smp)]);`;

/** Add the v2 capture + sample hooks to an already-built (hooked) surface-fill source. */
const withV2Hooks = (src) => patchOne(patchOne(src, V2_CAPTURE_NEEDLE, V2_CAPTURE_REPL, 'U8_V2_CAPTURE'), V2_SAMPLE_NEEDLE, V2_SAMPLE_REPL, 'U8_V2_SAMPLE');

/** Largest I in [0,1] with rel(I) >= floor (rel is monotone non-increasing in I). */
const inkCutOf = (rel, floor) => {
  if (!(rel(0) >= floor)) return 0;
  let lo = 0; let hi = 1;
  for (let i = 0; i < 40; i += 1) { const mid = (lo + hi) / 2; if (rel(mid) >= floor) lo = mid; else hi = mid; }
  return lo;
};

/** Run `fn` (which renders) with the hooks armed; returns { out, inkCut, samples }. */
const withV2Capture = (runtime, fn) => {
  const samples = []; let cap = null;
  runtime.window.__U8_V2__ = (c) => { cap = c; };
  runtime.window.__U8_SMP__ = (s) => { samples.push(s); };
  let out;
  try { out = fn(); } finally { delete runtime.window.__U8_V2__; delete runtime.window.__U8_SMP__; }
  if (!cap || !cap.on) throw new Error('v2 capture hook did not fire: the scene did not render under tone model v2');
  return { out, inkCut: inkCutOf(cap.rel, cap.floor), rel: cap.rel, samples, floor: cap.floor };
};

/** covByIBins over the v2 inked range: `nBins` equal bins of I over [0, inkCut). */
const covByInkBins = (sites, penWidth, inkCut, nBins = 9) => {
  const num = Array(nBins).fill(0); const den = Array(nBins).fill(0);
  sites.forEach((s) => {
    if (s[0] >= inkCut) return;
    const b = Math.min(nBins - 1, Math.floor((s[0] / inkCut) * nBins));
    num[b] += s[4] > 0 ? s[3] * penWidth : 0;
    den[b] += s[1] * s[2];
  });
  const cov = num.map((v, i) => (den[i] > 0 ? v / den[i] : null));
  const cc = cov.filter((v) => v != null);
  let nonMono = 0;
  for (let i = 1; i < cc.length; i += 1) if (cc[i] > cc[i - 1] + 1e-9) nonMono += 1;
  return { cov, nonMono };
};

/**
 * Bare area (mm^2) of interior pixels at chamfer distance >= T from any ink, restricted to the v2 INKED domain:
 * a pixel counts only when its nearest sampler sample (within `reach` mm) has v2Dens >= densMin. Pixels with no
 * sample in reach, or whose nearest sample is paper / glint (v2Dens < densMin), are not counted. `win` as bareArea.
 */
const bareAreaInked = (r, T, samples, { densMin = 0.12, reach = 2.0, win } = {}) => {
  const grid = new Map();
  samples.forEach((q) => { const k = `${Math.floor(q[0])},${Math.floor(q[1])}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(q); });
  const tPx = T / r.res;
  let ixA = 0; let iyA = 0; let ixB = r.W - 1; let iyB = r.H - 1;
  if (win) {
    ixA = Math.max(0, Math.floor((win[0] - r.x0) / r.res)); iyA = Math.max(0, Math.floor((win[1] - r.y0) / r.res));
    ixB = Math.min(r.W - 1, Math.ceil((win[2] - r.x0) / r.res)); iyB = Math.min(r.H - 1, Math.ceil((win[3] - r.y0) / r.res));
  }
  const rc = Math.ceil(reach);
  let n = 0;
  for (let iy = iyA; iy <= iyB; iy += 1) {
    for (let ix = ixA; ix <= ixB; ix += 1) {
      const id = iy * r.W + ix;
      if (r.outside[id] || r.dist[id] < tPx) continue;
      const x = r.x0 + ix * r.res; const y = r.y0 + iy * r.res;
      let best = null; let bd = reach;
      for (let dx = -rc; dx <= rc; dx += 1) {
        for (let dy = -rc; dy <= rc; dy += 1) {
          const cell = grid.get(`${Math.floor(x) + dx},${Math.floor(y) + dy}`);
          if (!cell) continue;
          for (let k = 0; k < cell.length; k += 1) { const d = Math.hypot(cell[k][0] - x, cell[k][1] - y); if (d < bd) { bd = d; best = cell[k]; } }
        }
      }
      if (best && best[4] >= densMin) n += 1;
    }
  }
  return n * r.res * r.res;
};

/** Mean v2Dens (target tone) of the samples inside window [xA,yA,xB,yB]; null when empty. */
const meanDensIn = (samples, win) => {
  const s = samples.filter((q) => q[0] >= win[0] && q[0] <= win[2] && q[1] >= win[1] && q[1] <= win[3]);
  return s.length ? s.reduce((a, q) => a + q[4], 0) / s.length : null;
};

/**
 * SP5 over the v2 TONE: a site's v2 tone is t = rel(I) in [floor, 1] (1 = full dark, floor = the paper threshold);
 * the inked range [floor, 1] is split into thirds by t. SP5 = mean period of the lightest third / the darkest.
 * Same shape as thirdsSplit (drawn sites only), different axis and range.
 */
const thirdsSplitTone = (sites, rel, floor) => {
  const Ps = [0, 0, 0]; const ns = [0, 0, 0];
  sites.forEach((s) => {
    if (!(s[4] > 0)) return;
    const t = rel(Math.max(0, Math.min(1, s[0])));
    if (!(t >= floor)) return;
    const b = Math.min(2, Math.floor(((1 - t) / (1 - floor)) * 3)); // 0 = darkest third, 2 = lightest
    Ps[b] += s[2]; ns[b] += 1;
  });
  const mP = Ps.map((v, i) => (ns[i] ? v / ns[i] : null));
  return {
    SP5: (mP[0] && mP[2]) ? mP[2] / mP[0] : null,
    SP5mono: mP[0] != null && mP[1] != null && mP[2] != null && mP[0] <= mP[1] && mP[1] <= mP[2],
    n: ns,
  };
};

/** covByIBins over the v2 tone: `nBins` equal bins of t = rel(I) over [floor, 1], ordered dark (t = 1) -> light. All sites
 * (drawn or not) with t >= floor. nonMono counts adjacent bins where delivered coverage RISES toward the light; `maxRise` is the largest such rise. */
const covByToneBins = (sites, penWidth, rel, floor, nBins = 9) => {
  const num = Array(nBins).fill(0); const den = Array(nBins).fill(0);
  sites.forEach((s) => {
    const t = rel(Math.max(0, Math.min(1, s[0])));
    if (!(t >= floor)) return;
    const b = Math.min(nBins - 1, Math.floor(((1 - t) / (1 - floor)) * nBins));
    num[b] += s[4] > 0 ? s[3] * penWidth : 0;
    den[b] += s[1] * s[2];
  });
  const cov = num.map((v, i) => (den[i] > 0 ? v / den[i] : null));
  const cc = cov.filter((v) => v != null);
  let nonMono = 0; let maxRise = 0;
  for (let i = 1; i < cc.length; i += 1) if (cc[i] > cc[i - 1] + 1e-9) { nonMono += 1; maxRise = Math.max(maxRise, cc[i] - cc[i - 1]); }
  return { cov, nonMono, maxRise };
};

/** Measured-value log: console.log plus, when U8_DUMP names a file, an append there (passing tests hide stdout under the queue runner). */
const u8log = (...a) => {
  // eslint-disable-next-line no-console
  console.log(...a);
  if (process.env.U8_DUMP) require('fs').appendFileSync(process.env.U8_DUMP, `${a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}\n`);
};

module.exports = {
  u8log, thirdsSplitTone, covByToneBins, withV2Hooks, withV2Capture, inkCutOf, covByInkBins, bareAreaInked, meanDensIn };
