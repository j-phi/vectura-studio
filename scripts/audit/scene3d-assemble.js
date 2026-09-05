#!/usr/bin/env node
/**
 * Scene3D fill-style audit — gallery assembler.
 *
 * Merges every manifest.*.jsonl produced by scene3d-capture.js under --out
 * into one reviewable index.html: grouped by primitive -> mapper -> style,
 * each row showing the 6 images (3 densities x 2 angles) with stats, a
 * filter box, and a summary table. Images are referenced by relative path
 * (not inlined) and load lazily so ~2000 <img> tags stay cheap to open.
 *
 *   node scripts/audit/scene3d-assemble.js --out docs/3d-audit/fill-audit
 */
'use strict';

const path = require('path');
const fs = require('fs');

function parseArgs(argv) {
  const out = { out: 'docs/3d-audit/fill-audit' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') out.out = argv[++i];
  }
  return out;
}

const DENSITIES = ['low', 'med', 'max'];
const ANGLES = ['a', 'b'];

function loadManifests(outDir) {
  const files = fs.readdirSync(outDir).filter((f) => /^manifest\..*\.jsonl$/.test(f));
  // Last-write-wins per (tier,primitive,mapper,style,density,angle) key, but a
  // shard's own file is internally append-only (a re-run of the SAME shard
  // resumes past existing files and only appends new lines), so within one
  // file later lines for the same key still legitimately override earlier
  // ones (a re-run after fixing a bug, say). Sort files for determinism.
  const byKey = new Map();
  const unreachable = [];
  files.sort().forEach((f) => {
    const text = fs.readFileSync(path.join(outDir, f), 'utf8');
    text.split('\n').forEach((line) => {
      const t = line.trim();
      if (!t) return;
      let rec;
      try { rec = JSON.parse(t); } catch (_) { return; }
      if (rec.status === 'unreachable') { unreachable.push(rec); return; }
      const key = [rec.tier, rec.primitive, rec.mapper, rec.style, rec.density, rec.angle].join('|');
      byKey.set(key, rec);
    });
  });
  return { records: [...byKey.values()], unreachable };
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildSummary(records, unreachable) {
  const total = records.length;
  const ok = records.filter((r) => r.status === 'ok').length;
  const timeouts = records.filter((r) => r.status === 'timeout').length;
  const errors = records.filter((r) => r.status === 'error').length;
  const empty = records.filter((r) => r.status === 'empty-canvas').length;
  const bare = records.filter((r) => r.bareCentrelinesOnly === true).length;
  const byTier = {};
  records.forEach((r) => { byTier[r.tier] = (byTier[r.tier] || 0) + 1; });
  return { total, ok, timeouts, errors, empty, bare, unreachable: unreachable.length, byTier };
}

// Group records into primitive -> mapper -> style -> { density -> { angle -> record } }
function groupRecords(records) {
  const root = {};
  records.forEach((r) => {
    root[r.primitive] = root[r.primitive] || {};
    const byMapper = root[r.primitive];
    byMapper[r.mapper] = byMapper[r.mapper] || {};
    const byStyle = byMapper[r.mapper];
    byStyle[r.style] = byStyle[r.style] || {};
    byStyle[r.style][r.density] = byStyle[r.style][r.density] || {};
    byStyle[r.style][r.density][r.angle] = r;
  });
  return root;
}

function cellHtml(rec) {
  if (!rec) return '<div class="cell missing"><span class="tag">no shot</span></div>';
  if (rec.status !== 'ok') {
    return `<div class="cell ${esc(rec.status)}"><span class="tag">${esc(rec.status)}</span></div>`;
  }
  const warn = rec.bareCentrelinesOnly ? '<span class="tag warn">bare centrelines</span>' : '';
  return `<div class="cell ok">
    <img loading="lazy" src="${esc(rec.path)}" alt="${esc(rec.primitive)} ${esc(rec.mapper)} ${esc(rec.style)} ${esc(rec.density)} ${esc(rec.angle)}" width="140">
    <div class="stats">
      <div>paths ${rec.pathCount} · pts ${rec.totalPoints}</div>
      <div>ink ${rec.inkMm}mm · ${rec.genMs}ms</div>
      ${warn}
    </div>
  </div>`;
}

function rowHtml(primitive, mapper, style, byDensity) {
  const cells = [];
  DENSITIES.forEach((density) => {
    ANGLES.forEach((angle) => {
      cells.push(cellHtml((byDensity[density] || {})[angle]));
    });
  });
  const anyBare = DENSITIES.some((d) => ANGLES.some((a) => (byDensity[d] || {})[a] && (byDensity[d] || {})[a].bareCentrelinesOnly));
  return `<div class="row" data-primitive="${esc(primitive)}" data-mapper="${esc(mapper)}" data-style="${esc(style)}">
    <div class="row-head">
      <span class="chip primitive">${esc(primitive)}</span>
      <span class="chip mapper">${esc(mapper)}</span>
      <span class="chip style">${esc(style)}</span>
      ${anyBare ? '<span class="chip bare">bare-centrelines</span>' : ''}
    </div>
    <div class="row-cells">${cells.join('')}</div>
  </div>`;
}

function buildHtml(outDir) {
  const { records, unreachable } = loadManifests(outDir);
  const summary = buildSummary(records, unreachable);
  const grouped = groupRecords(records);

  const rows = [];
  Object.keys(grouped).sort().forEach((primitive) => {
    Object.keys(grouped[primitive]).sort().forEach((mapper) => {
      Object.keys(grouped[primitive][mapper]).sort().forEach((style) => {
        rows.push(rowHtml(primitive, mapper, style, grouped[primitive][mapper][style]));
      });
    });
  });

  const unreachableRows = unreachable
    .slice(0, 500)
    .map((u) => `<tr><td>${esc(u.primitive)}</td><td>${esc(u.mapper)}</td><td>${esc(u.style)}</td></tr>`)
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Scene3D Fill-Style Audit</title>
<style>
  :root { color-scheme: light dark; --bg:#0b0d10; --panel:#15181d; --line:#2a2f37; --text:#e8ebef; --muted:#9aa4b2; --accent:#5eb1ff; --warn:#ff6b6b; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; }
  header { position: sticky; top:0; z-index:5; background:var(--panel); border-bottom:1px solid var(--line); padding:12px 16px; }
  h1 { font-size:16px; margin:0 0 8px; }
  #findings, #before-after { padding:12px 16px; border-bottom:1px solid var(--line); min-height: 8px; }
  #summary-table { border-collapse:collapse; margin-top:6px; }
  #summary-table td, #summary-table th { border:1px solid var(--line); padding:4px 10px; text-align:left; }
  #filter { width:100%; max-width:420px; padding:6px 10px; margin-top:8px; background:#0f1216; color:var(--text); border:1px solid var(--line); border-radius:6px; }
  main { padding: 8px 16px 60px; }
  .row { border:1px solid var(--line); border-radius:8px; margin:10px 0; padding:8px; background:var(--panel); }
  .row-head { display:flex; gap:6px; align-items:center; margin-bottom:6px; flex-wrap:wrap; }
  .chip { font-size:11px; padding:2px 8px; border-radius:999px; background:#22262d; color:var(--muted); }
  .chip.primitive { color:var(--accent); }
  .chip.bare { background:#3a1f22; color:var(--warn); }
  .row-cells { display:flex; gap:8px; flex-wrap:wrap; }
  .cell { width:150px; background:#0f1216; border:1px solid var(--line); border-radius:6px; padding:4px; text-align:center; }
  .cell img { max-width:140px; display:block; margin:0 auto; background:#000; border-radius:4px; }
  .cell .stats { font-size:10px; color:var(--muted); margin-top:4px; line-height:1.3; }
  .cell .tag { font-size:10px; color:var(--warn); }
  .cell.missing, .cell.timeout, .cell.error, .cell.empty-canvas { display:flex; align-items:center; justify-content:center; min-height:100px; }
  [hidden] { display:none !important; }
</style>
</head>
<body>
<section id="findings"></section>
<header>
  <h1>Scene3D Fill-Style Audit</h1>
  <table id="summary-table">
    <tr><th>Total shots recorded</th><td>${summary.total}</td>
        <th>OK</th><td>${summary.ok}</td>
        <th>Timeouts</th><td>${summary.timeouts}</td>
        <th>Errors</th><td>${summary.errors}</td>
        <th>Empty canvas</th><td>${summary.empty}</td>
        <th>Bare-centrelines failures</th><td>${summary.bare}</td>
        <th>Unreachable pairs (not shot)</th><td>${summary.unreachable}</td></tr>
  </table>
  <input id="filter" type="text" placeholder="Filter by primitive / mapper / style…">
</header>
<main id="rows">
${rows.join('\n')}
</main>
<section>
  <details><summary>Unreachable (mapper, style) pairs (${unreachable.length}${unreachable.length > 500 ? ', first 500 shown' : ''})</summary>
    <table id="summary-table"><tr><th>primitive</th><th>mapper</th><th>style</th></tr>${unreachableRows}</table>
  </details>
</section>
<section id="before-after"></section>
<script>
  var filter = document.getElementById('filter');
  var rows = Array.prototype.slice.call(document.querySelectorAll('.row'));
  filter.addEventListener('input', function () {
    var q = filter.value.trim().toLowerCase();
    rows.forEach(function (row) {
      if (!q) { row.hidden = false; return; }
      var hay = (row.dataset.primitive + ' ' + row.dataset.mapper + ' ' + row.dataset.style).toLowerCase();
      row.hidden = hay.indexOf(q) === -1;
    });
  });
</script>
</body>
</html>`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(process.cwd(), args.out);
  const html = buildHtml(outDir);
  const dest = path.join(outDir, 'index.html');
  fs.writeFileSync(dest, html);
  console.log('wrote', dest);
}

if (require.main === module) main();

module.exports = { loadManifests, buildSummary, groupRecords, buildHtml };
