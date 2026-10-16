// Shared fixtures/needle-patch helpers for the split scene3d-mktick-spacing-tone audit files.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REL_PATH = 'src/core/scene3d/surface-fill.js';
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const BOUNDS = {
  width: 1200, height: 1000, m: 20, dW: 1160, dH: 960, penWidth: 0.3,
};
const SUN = {
  id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false,
};
const clone = (v) => JSON.parse(JSON.stringify(v));
const CELLS = [
  ['sphere', 'hatch'], ['sphere', 'contour'],
  ['torus', 'hatch'], ['torus', 'contour'],
  ['cone', 'hatch'], ['cone', 'contour'],
];
const CRUMB_MARK_LAWS = ['mkScribble', 'mkDashRamp', 'mkDotScreen'];
const B7_CELLS = [
  ['sphere', 'hatch'], ['torus', 'hatch'], ['torus', 'contour'], ['cone', 'hatch'],
];

const buildSceneParams = (Params, defaults, {
  mapper, fillDensity, primitive, rig, law = 'mkTick',
}) => {
  const p = clone(defaults);
  const bag = rig === 'create'
    ? { ...clone(Params.PRIMITIVE_PARAM_DEFAULTS[primitive] || {}), ...clone(Params.PRIMITIVE_CREATE_DEFAULTS[primitive] || {}) }
    : clone(Params.PRIMITIVE_PARAM_DEFAULTS[primitive] || {});
  p.objects = [{
    id: 'obj', name: 'Obj', primitive, params: bag,
    transform: {
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1,
    },
    visibility: 'solid',
  }];
  p.ground = { enabled: false };
  p.backdrop = { enabled: false };
  p.camera = clone(Params.DEFAULT_CAMERA);
  p.tone = { ...clone(defaults).tone, enabled: true };
  p.lights = [SUN];
  p.styleTable = {
    scene: {
      penId: null, mapper, params: { fillAngle: 45, fillDensity, toneLaw: law },
    },
    byObject: {},
    byFace: {},
  };
  return p;
};

let headSourceCache = null;
const loadHeadSource = () => {
  if (!headSourceCache) headSourceCache = fs.readFileSync(path.join(ROOT_DIR, REL_PATH), 'utf8');
  return headSourceCache;
};

const patchOne = (src, needle, repl, label) => {
  const count = src.split(needle).length - 1;
  if (count !== 1) throw new Error(`${label}: needle count = ${count}, expected 1 (source drifted?)`);
  return src.split(needle).join(repl);
};

// The hook needle — asserted non-vacuous by count above.
const HOOK_NEEDLE = "if (si === mainIdx) mkStat.tickSites.push(sv.I, sv.R, sv.P, pieceLen ? 1 : 0);";
const HOOK_REPL = `if (si === mainIdx) {
              mkStat.tickSites.push(sv.I, sv.R, sv.P, pieceLen ? 1 : 0);
              if (typeof globalThis.__T27_SITE__ === 'function') globalThis.__T27_SITE__([sv.I, sv.R, sv.P, sv.L, pieceLen || 0]);
            }`;
const buildHookedSource = () => patchOne(loadHeadSource(), HOOK_NEEDLE, HOOK_REPL, 'HOOK_NEEDLE');

const renderCellHooked = (runtime, {
  mapper, primitive, rig = 'test', fillDensity = 50, law = 'mkTick',
}) => {
  const V = runtime.window.Vectura;
  const algo = V.AlgorithmRegistry.scene3d;
  const defaults = V.ALGO_DEFAULTS.scene3d;
  const Params = V.Scene3D.Params;
  const params = buildSceneParams(Params, defaults, {
    mapper, fillDensity, primitive, rig, law,
  });
  const sites = [];
  runtime.window.__T27_SITE__ = (rec) => { sites.push(rec); };
  const paths = algo.generate(params, null, null, BOUNDS);
  delete runtime.window.__T27_SITE__;
  const stat = V.Scene3D.SurfaceFill.lastMarkStats;
  const fills = paths.filter((p) => p.meta && p.meta.kind === 'sceneFill');
  const rowPitch = stat && stat.tickField ? stat.tickField.rowPitch : null;
  return {
    paths, stat, sites, fills, rowPitch,
  };
};

const FLUSH_LINE = 'for (let qi = 0; qi < mkEndQ.length; qi += 1) mkEndQ[qi]();';
const QUEUE_GATE = "if (law.shape === 'tick' && !mkWedgeActive && s1 > s0 && Number.isFinite(firstA)";
const NOADMIT = 'if (ok) for (let i = 0; i < wk.pts.length && ok; i += 1) if (inkWithin(wk.pts[i].x, wk.pts[i].y, admitR, true)) ok = false;';
const CONT_GUARD = `if (perpD > MK_TICK_BC_SEAM * Pc
                || Math.abs(cd.x * pDir.x + cd.y * pDir.y) < Math.cos((MK_TICK_BC_DIR_CUT * Math.PI) / 180)) ok = false;
              else if`;
const CAP = 'if (a1 - a0 > Lprev) {';
const BC_MUT = {
  off: [[FLUSH_LINE, '']],
  inline: [
    ['mkEndQ.push(() => bcSide(firstK, -1, firstA, firstSv.P, firstSv, firstR));', 'bcSide(firstK, -1, firstA, firstSv.P, firstSv, firstR);'],
    ['mkEndQ.push(() => bcSide(endK, 1, endA, endSv.P, endSv, endR));', 'bcSide(endK, 1, endA, endSv.P, endSv, endR);'],
    ['mkEndQ.push(() => bcSide(lastK, 1, lastA, lastSv.P, lastSv, lastR));', 'bcSide(lastK, 1, lastA, lastSv.P, lastSv, lastR);'],
  ],
  thin: [[NOADMIT, ''], ['const MK_TICK_BC_BAND_PEN = 1 + MK_TICK_GAP_PEN;', 'const MK_TICK_BC_BAND_PEN = 0.2;'], ['const MK_TICK_BC_EDGE_PEN = 2.0;', 'const MK_TICK_BC_EDGE_PEN = 0.5;']],
  dense: [
    [NOADMIT, ''], [CONT_GUARD, 'if (false) ok = false;\n              else if'],
    ['let n = at(h.fr, dir * Pc, 0); let dv = 0;', 'let n = at(h.fr, dir * Pc * 0.4, 0); let dv = 0;'],
    ['const c = at(h.fr, dir * Pc, v);', 'const c = at(h.fr, dir * Pc * 0.4, v);'],
  ],
  skip1: [['for (let j = 1; j <= MK_TICK_BC_MAXJ; j += 1) {', 'for (let j = 2; j <= MK_TICK_BC_MAXJ; j += 1) {']],
  rot: [
    [NOADMIT, ''],
    [CONT_GUARD, 'if (false) ok = false;\n              else if'],
    ['const wk = walkPoly(n.fr, 0, 0, poly, MK_TICK_STEP_CAP_MM);', 'const wk = walkPoly(n.fr, 0, 0.2, poly, MK_TICK_STEP_CAP_MM);'],
    ['const placed = place(n.fr, [poly], 0, 0);', 'const placed = place(n.fr, [poly], 0, 0.2);'],
  ],
  wide: [['let h = at(fr0, aB - arcMM[kB], 0); if (!h) return;', 'lo0 -= 1.0; hi0 += 1.0; let h = at(fr0, aB - arcMM[kB], 0); if (!h) return;'], [CAP, 'if (false) {']],
  noprobe: [['const cE = MK_TICK_BC_EDGE_PEN * w;', 'const cE = 0;']],
  nogate: [
    [QUEUE_GATE, 'if (!mkWedgeActive && s1 > s0 && Number.isFinite(firstA)'],
    ['if (!svB || !svB.segs || !svB.segs.length || !(Pc > 0)', 'if (!svB || !(Pc > 0)'],
    ['svB.segs.forEach((q) => { lo0', '(svB.segs || [[-1, 1]]).forEach((q) => { lo0'],
    ['const segs = svB.segs.length === 1 ?', 'const segs = (!svB.segs || svB.segs.length === 1) ?'],
  ],
  nobisect: [['const MK_TICK_BC_BISECT = 6;', 'const MK_TICK_BC_BISECT = 0;']],
  gap: [[CONT_GUARD, 'if (false) ok = false;\n              else if'], ['vRel += dv;\n', 'vRel += dv;\n          if (j === 2) { h = n; continue; }\n']],
  cfat: [['const MK_TICK_BC_EDGE_PEN = 2.0;', 'const MK_TICK_BC_EDGE_PEN = 4.0;'], ['const MK_TICK_BC_BAND_PEN = 1 + MK_TICK_GAP_PEN;', 'const MK_TICK_BC_BAND_PEN = 4.0;']],
  rulingref: [['if (Rb && Rb.length >= 2) {', 'if (false && Rb && Rb.length >= 2) {']],
  nohi: [['const MK_TICK_BC_HI_I = 2 / 3;', 'const MK_TICK_BC_HI_I = 1.01;']],
  noapex: [['if (!closing) break;', 'if (true) break;']],
  apexnorule: [['if (!closing) break;', 'if (!(a1 - a0 >= MK_TICK_BC_APEX_MIN * penWidth)) break;']],
  // T2-8b-5b rim-strip mutants. noext = pre-T2-8b-5 output (extension flush removed).
  noext: [['runExtensions();', '']],
  // nohubstr = the T2-8b-5 prototype state: nominal one-jump hub AND no straightness cut.
  nohubstr: [
    ['const h0 = { fr: hub.fr, sm: hub.sm };', 'const h0 = T.at(fr, uO, 0.5 * (seg[0] + seg[1])); if (!h0) return;'],
    ['if (iHub < 1 || iHub > run.length - 2 || best > 1e-6) return;', 'if (iHub < 1 || iHub > run.length - 2 || best > 0.2) return;'],
    ['const MK_TICK_RIM_STRAIGHT_OFF = false;', 'const MK_TICK_RIM_STRAIGHT_OFF = true;'],
  ],
  nostraight: [['const MK_TICK_RIM_STRAIGHT_OFF = false;', 'const MK_TICK_RIM_STRAIGHT_OFF = true;']],
  nocoh: [['const MK_TICK_RIM_COH_OFF = false;', 'const MK_TICK_RIM_COH_OFF = true;']],
  nocohstrip: [['const MK_TICK_RIM_COH_OFF = false;', 'const MK_TICK_RIM_COH_OFF = true;'], ['const MK_TICK_RIM_STRIP_OFF = false;', 'const MK_TICK_RIM_STRIP_OFF = true;']],
  noiso: [['const MK_TICK_RIM_ISO_OFF = false;', 'const MK_TICK_RIM_ISO_OFF = true;']],
  nohook: [['const MK_TICK_RIM_HOOK_OFF = false;', 'const MK_TICK_RIM_HOOK_OFF = true;']],
  noboth: [['const MK_TICK_RIM_BOTH_OFF = false;', 'const MK_TICK_RIM_BOTH_OFF = true;']],
};
const REC_NEEDLES = [
  ['pushRun(r, back, lineIndex);', "pushRun(r, back, lineIndex); if (typeof globalThis.__T28B_REC__ === 'function') globalThis.__T28B_REC__({ pts: r, li: lineIndex, tag: globalThis.__TAG, apex: r.apex === true });"],
  ['const pieceLen = place(fr, [poly], a - arcMM[k], thetaAt(k, fr));', "globalThis.__TAG = 'reg:' + (si === mainIdx ? 'M' : 's') + ':' + a.toFixed(4) + ':' + k + ':' + sv.I.toFixed(3) + ':' + sv.P.toFixed(4); const pieceLen = place(fr, [poly], a - arcMM[k], thetaAt(k, fr)); globalThis.__TAG = null;"],
  ['const up = arm(n, 1, hi0 - vRel); const dn = arm(n, -1, vRel - lo0);', "const up = arm(n, 1, hi0 - vRel); const dn = arm(n, -1, vRel - lo0); globalThis.__TAG = 'cont|' + dir + '|' + kB + '|' + aB.toFixed(4) + '|' + j + '|' + svB.I.toFixed(3) + '|' + dn.reason + up.reason;"],
];
const buildBcSource = (kind) => {
  let src = loadHeadSource();
  (BC_MUT[kind] || []).forEach(([a, b], i) => { src = patchOne(src, a, b, `BC_${kind}_${i}`); });
  REC_NEEDLES.forEach(([a, b], i) => { src = patchOne(src, a, b, `BC_REC_${i}_${kind}`); });
  return patchOne(src, HOOK_NEEDLE, HOOK_REPL, 'HOOK_NEEDLE');
};
const SCENE3D_REL = 'src/core/algorithms/scene3d.js';
const SCENE3D_MUT = {
  noflag: [['runLength(run.pts) < (apexMin != null ? Math.min(MIN_RUN_MM, apexMin) : MIN_RUN_MM)', 'runLength(run.pts) < 0.3']],
};
const buildScene3dSource = (kind) => {
  let src = fs.readFileSync(path.join(ROOT_DIR, SCENE3D_REL), 'utf8');
  (SCENE3D_MUT[kind] || []).forEach(([a, b], i) => { src = patchOne(src, a, b, `S3D_${kind}_${i}`); });
  return src;
};
const md5 = (v) => crypto.createHash('md5').update(JSON.stringify(v)).digest('hex');
const plain = (paths) => paths.map((p) => Object.assign(p.map((q) => ({ x: q.x, y: q.y })), { meta: p.meta }));
const pathsMd5 = (paths) => md5(paths.map((p) => p.map((q) => [q.x, q.y])));
const siteKey = (r) => md5([r.stat.tickSites, r.sites]);
// The cone base wedges on the create rig, gallery angle "a", output mm space
// (plan 1: W_L / W_R) and the equal-size band strips that abut them.
const WIN_L = [588, 519, 599, 528]; const WIN_R = [603, 518, 614, 528];
const STRIP_L = [588, 510, 599, 519]; const STRIP_R = [603, 509, 614, 518];

module.exports = {
  REL_PATH, ROOT_DIR, BOUNDS, SUN, clone, CELLS, CRUMB_MARK_LAWS, B7_CELLS, buildSceneParams, loadHeadSource, patchOne, HOOK_NEEDLE, HOOK_REPL, buildHookedSource, renderCellHooked, buildBcSource, buildScene3dSource, SCENE3D_REL, md5, plain, pathsMd5, siteKey, WIN_L, WIN_R, STRIP_L, STRIP_R,
};
