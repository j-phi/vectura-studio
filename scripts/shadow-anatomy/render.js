/* Shadow-anatomy view harness.
 * Composes scene3d exactly the way Engine._composeSceneGroup does
 * (collectSceneParams -> AlgorithmRegistry.scene3d.generate) and writes one SVG
 * per required designer view, plus a metrics JSON.
 *
 * Run: node render.js [outDir]
 *
 * ROUND 9, instrument repair — THE FIXTURE NO LONGER LIVES HERE.
 * Every camera, sun, object, tone table and view now lives in
 * `tests/fixtures/scene3d-shadow-anatomy.js`, INSIDE THE REPOSITORY, so the
 * unit tests and this harness read one definition instead of two. Round 8's
 * cast-shadow test had to restate the A-view because `tests/` could not import
 * from a scratch directory; that was the fourth restated fixture in this
 * workstream and the review named it the standing risk. It is now impossible.
 *
 * Every other script in this directory (facets.js, r8lad.js, r9pitch.js, ...)
 * MUST `require` this file (or the fixture module directly) for its camera, sun,
 * object list and view builders. There is exactly one definition of each.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');   // repo root, wherever this worktree lives
const { loadVecturaRuntime } = require(path.join(ROOT, 'tests/helpers/load-vectura-runtime'));
const FIX = require(path.join(ROOT, 'tests/fixtures/scene3d-shadow-anatomy'));

const OUT = process.argv[2] || path.join(__dirname, 'views');
const { BOUNDS, SEED, VIEWS, buildParams, buildPaths, objectsOf } = FIX;

// ── SVG emit ────────────────────────────────────────────────────────────────
const PX = 5; // px per mm
const toSvg = (paths, bounds) => {
  const W = bounds.width * PX; const H = bounds.height * PX;
  const body = paths.map((p) => {
    if (!p || p.length < 2) return '';
    const d = p.map((q, i) => `${i ? 'L' : 'M'}${(q.x * PX).toFixed(2)} ${(q.y * PX).toFixed(2)}`).join('');
    const meta = p.meta || {};
    const dash = Array.isArray(meta.strokeDash) && meta.strokeDash.length
      ? ` stroke-dasharray="${meta.strokeDash.map((n) => (n * PX).toFixed(2)).join(' ')}"` : '';
    return `<path d="${d}"${dash}/>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<rect width="${W}" height="${H}" fill="#fff"/>`
    + `<g fill="none" stroke="#111" stroke-width="${(bounds.penWidth * PX).toFixed(2)}" stroke-linecap="round">\n${body}\n</g></svg>`;
};

const segLen = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

const metricsOf = (paths) => {
  const byClass = {};
  let ink = 0;
  paths.forEach((p) => {
    const t = (p.meta && p.meta.sceneTarget) || {};
    const cls = `${t.objectId || '?'}/${t.regionClass || (p.meta && p.meta.kind) || '?'}`
      + (t.shadowLayer != null ? `/z${t.shadowLayer}` : '');
    let L = 0;
    for (let i = 1; i < p.length; i++) L += segLen(p[i - 1], p[i]);
    ink += L;
    const s = byClass[cls] || (byClass[cls] = { paths: 0, ink: 0 });
    s.paths += 1; s.ink += L;
  });
  Object.keys(byClass).forEach((k) => { byClass[k].ink = Math.round(byClass[k].ink * 100) / 100; });
  let hlInk = 0; let hlPaths = 0; const pens = {}; let dashed = 0;
  paths.forEach((p) => {
    const m = p.meta || {}; const t = m.sceneTarget || {};
    let L = 0; for (let i = 1; i < p.length; i++) L += segLen(p[i - 1], p[i]);
    if (t.highlight === true) { hlInk += L; hlPaths += 1; }
    if (Array.isArray(m.strokeDash) && m.strokeDash.length) dashed += 1;
    pens[m.penId || '(inherit)'] = (pens[m.penId || '(inherit)'] || 0) + 1;
  });
  return {
    totalPaths: paths.length, totalInk: Math.round(ink * 100) / 100,
    hlPaths, hlInk: Math.round(hlInk * 100) / 100, dashedPaths: dashed, pens, byClass,
  };
};

// ── THE FIXTURE EXPORT (re-export; the definition is in tests/fixtures) ─────
module.exports = { ...FIX, PX, toSvg, metricsOf };

const main = async () => {
  const runtime = await loadVecturaRuntime();
  const V = runtime.window.Vectura;
  const algo = V.AlgorithmRegistry.scene3d;
  const Params = V.Scene3D.Params;
  fs.mkdirSync(OUT, { recursive: true });
  const report = {};
  for (const view of VIEWS) {
    let paths = [];
    let err = null;
    try {
      const p = Params.normalizeParams(view.build(V));
      paths = algo.generate(Params.collectSceneParams(p, []), new V.SeededRNG(SEED), new V.SimpleNoise(SEED), BOUNDS) || [];
    } catch (e) { err = String(e && e.stack || e); }
    fs.writeFileSync(path.join(OUT, `${view.id}.svg`), toSvg(paths, BOUNDS), 'utf8');
    report[view.id] = err ? { error: err } : metricsOf(paths);
    process.stdout.write(`${view.id}: ${err ? 'ERROR ' + err.split('\n')[0] : `${paths.length} paths, ink ${report[view.id].totalInk}`}\n`);
  }
  fs.writeFileSync(path.join(OUT, 'metrics.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  runtime.cleanup();
  process.exit(0);
};

if (require.main === module) main();
