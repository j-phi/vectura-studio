/* T2-6 planner harness — READ-ONLY instrumentation via scriptOverrides.
   Adapted from T2-5-plan-evidence/scripts/lib.js. Nothing is written into any
   worktree or into MAIN's src/ or tests/. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOTS = {
  'v1.4.1': '/private/tmp/claude-501/scratch-T26-v141',   // 426cc5e4
  'T2-3c':  '/private/tmp/claude-501/scratch-T26-t23c',   // 7375918c
  'HEAD':   '/private/tmp/claude-501/scratch-T26',        // 75777240
};
const LOADER = '/private/tmp/claude-501/scratch-T26/tests/helpers/load-vectura-runtime';

const patchN = (src, needle, repl, label, want) => {
  const n = src.split(needle).length - 1;
  if (want != null && n !== want) throw new Error(`${label}: needle count ${n} != ${want}`);
  if (n === 0) throw new Error(`${label}: needle missing`);
  return src.split(needle).join(repl);
};
const patch1 = (s, n, r, l) => patchN(s, n, r, l, 1);

const STACK_SRC = "try { const __ls=(new Error()).stack.split('\\n').slice(2); let __t='x'; for (const __l of __ls) { const __m=__l.match(/surface-fill\\.js[^:]*:(\\d+)/); if (__m) { __t='sf:'+__m[1]; break; } } run.t26src = __t; } catch (e) {} ";

const instrumentSurfaceFill = (src) => {
  let s = src;
  const needsBackport = s.indexOf('tickField: { pts: [], rowPitch: null },') < 0;
  s = patch1(s, '    const mkStat = {\n',
    '    const mkStat = { t26marks: [], t26cur: null, t26cOff: 0, t26band: null,'
    + (needsBackport ? ' tickField: { pts: [], rowPitch: null }, tickSites: [], lenByThird: [0,0,0], cntByThird: [0,0,0],' : '')
    + '\n', 'mkStat');
  if (needsBackport) {
    s = patch1(s,
      '      if (toneOn && isMarkLaw() && arcMM) {\n        emitMarks({',
      '      if (toneOn && isMarkLaw() && arcMM) {\n'
      + '        if (wantFront && MK[TONE_ALGO] && MK[TONE_ALGO].shape === \'tick\') {\n'
      + '          if (mkStat.tickField.rowPitch == null) mkStat.tickField.rowPitch = masterPitch / MK_ROW_COV;\n'
      + '          const __pts = mkStat.tickField.pts;\n'
      + '          for (let __s = 0; __s <= nSteps; __s += 1) { const __m = smps[__s]; if (__m && Number.isFinite(__m.x) && Number.isFinite(__m.I)) __pts.push(__m.x, __m.y, __m.I); }\n'
      + '        }\n        emitMarks({',
      'backport-tickField');
  }
  s = patch1(s,
    '    const pushRun = (run, back, lineIndex) => {\n      if (run.length < 2) return;\n',
    '    const pushRun = (run, back, lineIndex) => {\n      if (run.length < 2) return;\n      ' + STACK_SRC
      + 'if (T26.runs) T26.runs.push({ src: run.t26src, back: !!back, lineIndex, pts: run.map((q) => ({ x: q.x, y: q.y })) });\n',
    'pushRun');
  // one record per EMITTED sub-poly (a sub-tick is its own record)
  s = patch1(s,
    '        runs.forEach((r) => {\n          if (r.length < 2) return;\n          r.fam = fam; r.loz = true;\n          pushRun(r, back, lineIndex);',
    '        runs.forEach((r, __i) => {\n          if (r.length < 2) return;\n          r.fam = fam; r.loz = true;\n'
    + '          if (mkStat.t26cur) { const __pl = polys[__i]; mkStat.t26marks.push({ ...mkStat.t26cur, sub: __i, lineIndex, nPoly: polys.length, band: mkStat.t26band,'
    + ' v0: __pl ? __pl[0][1] : null, v1: __pl ? __pl[__pl.length - 1][1] : null,'
    + ' pts: r.map((q) => ({ x: q.x, y: q.y })) }); }\n'
    + '          pushRun(r, back, lineIndex);',
    'markRec');
  const REC = '        mkStat.t26cur = { shape: law.shape, k, a, I: sv.I, R: sv.R, P: sv.P, L: sv.L, cOff: mkStat.t26cOff, parity };\n';
  if (s.indexOf('        const drawnLen = place(fr, polys, a - arcMM[k], thetaAt(k, fr));') >= 0) {
    s = patch1(s,
      '        const drawnLen = place(fr, polys, a - arcMM[k], thetaAt(k, fr));',
      REC + '        const drawnLen = place(fr, polys, a - arcMM[k], thetaAt(k, fr));\n        mkStat.t26cur = null; mkStat.t26cOff = 0; mkStat.t26band = null;',
      'layMarkRec');
  } else {
    s = patch1(s,
      '        if (place(fr, polys, a - arcMM[k], thetaAt(k, fr))) {',
      REC + '        const __ok = place(fr, polys, a - arcMM[k], thetaAt(k, fr));\n'
      + '        mkStat.t26cur = null; mkStat.t26cOff = 0; mkStat.t26band = null;\n'
      + '        if (law.shape === \'tick\') mkStat.tickSites.push(sv.I, sv.R, sv.P, __ok ? 1 : 0);\n'
      + '        if (__ok) { const __t3 = Math.min(2, Math.floor(Math.max(0, Math.min(1, sv.I)) * 3)); mkStat.lenByThird[__t3] += (typeof __ok === \'number\' ? __ok : 0); mkStat.cntByThird[__t3] += 1; }\n'
      + '        if (__ok) {',
      'layMarkRec-old');
  }
  // cOff sink: 1 occurrence at v1.4.1(0)/T2-3c(1), 1 at HEAD (the single branch) —
  // tolerate any count >= 1
  if (s.indexOf('const cOff = room * (2 * uu - 1);') >= 0) {
    s = patchN(s, 'const cOff = room * (2 * uu - 1);', 'const cOff = room * (2 * uu - 1); mkStat.t26cOff = cOff;', 'cOff');
  }
  s = 'var T26 = (function(){ var g = (typeof window !== "undefined" ? window : globalThis); g.__T26 = g.__T26 || { runs: [] }; return g.__T26; })();\n' + s;
  return s;
};

const BOUNDS = { width: 1200, height: 1000, m: 20, dW: 1160, dH: 960, penWidth: 0.3 };
const SUN = { id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false };
const clone = (v) => JSON.parse(JSON.stringify(v));
const CELLS = [['sphere','hatch'],['sphere','contour'],['torus','hatch'],['torus','contour'],['cone','hatch'],['cone','contour']];

async function makeRuntime(tag, { instrument = false, extraOverrides = null } = {}) {
  const root = ROOTS[tag] || tag;
  const { loadVecturaRuntime } = require(LOADER);
  const overrides = {};
  if (instrument) {
    overrides['src/core/scene3d/surface-fill.js'] = instrumentSurfaceFill(
      (extraOverrides && extraOverrides['src/core/scene3d/surface-fill.js'])
        || fs.readFileSync(path.join(root, 'src/core/scene3d/surface-fill.js'), 'utf8'));
    if (extraOverrides) { const e = { ...extraOverrides }; delete e['src/core/scene3d/surface-fill.js']; Object.assign(overrides, e); }
  } else if (extraOverrides) Object.assign(overrides, extraOverrides);
  const rt = await loadVecturaRuntime({ rootDir: root, scriptOverrides: overrides });
  rt.window.Vectura.__win = rt.window;
  return rt.window.Vectura;
}

function buildParams(V, { primitive, mapper, rig, density = 50, toneLaw = 'mkTick' }) {
  const Params = V.Scene3D.Params;
  const defaults = V.ALGO_DEFAULTS.scene3d;
  const p = clone(defaults);
  const bag = rig === 'create'
    ? { ...clone(Params.PRIMITIVE_PARAM_DEFAULTS[primitive] || {}), ...clone(Params.PRIMITIVE_CREATE_DEFAULTS[primitive] || {}) }
    : clone(Params.PRIMITIVE_PARAM_DEFAULTS[primitive] || {});
  p.objects = [{ id: 'obj', name: 'Obj', primitive, params: bag,
    transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' }];
  p.ground = { enabled: false };
  p.backdrop = { enabled: false };
  p.camera = clone(Params.DEFAULT_CAMERA);
  p.tone = { ...clone(defaults).tone, enabled: true };
  p.lights = [SUN];
  p.styleTable = { scene: { penId: null, mapper, params: { fillAngle: 45, fillDensity: density, toneLaw } }, byObject: {}, byFace: {} };
  return p;
}

function render(V, cfg) {
  const W = V.__win || {};
  if (W.__T26) W.__T26.runs = [];
  const params = buildParams(V, cfg);
  const paths = V.AlgorithmRegistry.scene3d.generate(params, null, null, BOUNDS);
  const stat = V.Scene3D.SurfaceFill.lastMarkStats;
  const runs = W.__T26 ? W.__T26.runs.slice() : [];
  return { paths, stat, runs };
}

const pathPts = (p) => { const o = []; for (let i = 0; i < p.length; i += 1) o.push({ x: p[i].x, y: p[i].y }); return o; };
const plen = (pts) => { let t = 0; for (let i = 1; i < pts.length; i += 1) t += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y); return t; };
const md5 = (paths) => crypto.createHash('md5').update(paths.map((p) => pathPts(p).map((q) => `${q.x.toFixed(4)},${q.y.toFixed(4)}`).join(';')).join('|')).digest('hex');

module.exports = { ROOTS, CELLS, BOUNDS, makeRuntime, render, buildParams, pathPts, plen, md5, instrumentSurfaceFill, patch1, patchN };
