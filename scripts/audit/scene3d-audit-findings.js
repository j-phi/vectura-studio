#!/usr/bin/env node
/**
 * Scene3D fill-style audit — findings injector.
 *
 * `scene3d-assemble.js` rebuilds index.html with an EMPTY
 * `<section id="findings"></section>` every time it runs, so the evaluator's
 * verdict lives in two data files beside the gallery and is rendered back
 * into that section by this script:
 *
 *   docs/3d-audit/fill-audit/findings.json   — summary, defects, clusters
 *   docs/3d-audit/fill-audit/worklist.json   — the implementer work list
 *
 *   node scripts/audit/scene3d-audit-findings.js --out docs/3d-audit/fill-audit
 *
 * Re-run it after every re-assemble. Image links are relative to the gallery
 * so they open in place.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const out = { out: 'docs/3d-audit/fill-audit' };
  for (let i = 0; i < argv.length; i += 1) if (argv[i] === '--out') out.out = argv[++i];
  return out;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Minimal inline markup: **bold**, `code` spans and [text](href) links; everything else escaped.
function rich(s) {
  let t = esc(s);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return t;
}

function imgLinks(paths) {
  if (!paths || !paths.length) return '';
  return paths.map((p) => {
    const name = p.replace(/^shots\/[AB]\//, '').replace(/\.webp$/, '');
    return `<a class="shot" href="${esc(p)}" target="_blank" title="${esc(p)}">${esc(name)}</a>`;
  }).join(' ');
}

function table(cols, rows) {
  const head = `<thead><tr>${cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>`;
  const body = rows.map((r) => `<tr class="${esc(r.severity || '')}">${cols.map((c) => `<td>${c.render(r)}</td>`).join('')}</tr>`).join('\n');
  return `<div class="tbl-wrap"><table class="findings-table">${head}<tbody>${body}</tbody></table></div>`;
}

function render(findings, worklist) {
  const parts = [];
  parts.push(`<style>
  #findings { line-height: 1.45; }
  #findings h2 { font-size: 15px; margin: 14px 0 6px; }
  #findings h3 { font-size: 13px; margin: 12px 0 4px; color: var(--accent); }
  #findings p, #findings li { max-width: 110ch; }
  #findings .summary { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px; }
  #findings .summary ol { margin: 6px 0 0 18px; padding: 0; }
  #findings .tbl-wrap { overflow-x: auto; max-width: 100%; }
  #findings table.findings-table { border-collapse: collapse; font-size: 12px; margin: 6px 0 10px; min-width: 900px; }
  #findings table.findings-table th, #findings table.findings-table td { border: 1px solid var(--line); padding: 4px 8px; vertical-align: top; text-align: left; }
  #findings table.findings-table th { background: var(--panel); position: sticky; top: 0; }
  #findings tr.P0 td:first-child { border-left: 4px solid var(--warn); }
  #findings tr.P1 td:first-child { border-left: 4px solid #ffb347; }
  #findings tr.P2 td:first-child { border-left: 4px solid var(--accent); }
  #findings code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; background: #0f1216; padding: 0 4px; border-radius: 3px; }
  #findings a.shot { display: inline-block; font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; color: var(--accent); margin: 1px 4px 1px 0; white-space: nowrap; }
  #findings .counts span { display: inline-block; margin-right: 14px; }
  #findings details { margin: 6px 0; }
  #findings summary { cursor: pointer; color: var(--muted); }
</style>`);
  parts.push(`<h2>Evaluator findings — ${esc(findings.meta.title)}</h2>`);
  parts.push(`<p class="counts">${['P0', 'P1', 'P2'].map((s) => `<span><b>${s}</b>: ${findings.defects.filter((d) => d.severity === s).length}</span>`).join('')}<span><b>clusters</b>: ${findings.clusters.length}</span><span><b>work items</b>: ${worklist.length}</span><span>${esc(findings.meta.basis)}</span></p>`);

  parts.push('<div class="summary"><h3>Executive summary</h3><ol>');
  findings.summary.forEach((line) => parts.push(`<li>${rich(line)}</li>`));
  parts.push('</ol></div>');

  parts.push('<h3>Defects</h3>');
  parts.push(table([
    { label: 'id', render: (r) => `<b>${esc(r.id)}</b>` },
    { label: 'sev', render: (r) => esc(r.severity) },
    { label: 'scope (primitive / mapper / style / density / angle)', render: (r) => esc(r.scope) },
    { label: 'what is wrong', render: (r) => rich(r.wrong) },
    { label: 'fixed looks like', render: (r) => rich(r.fixed) },
    { label: 'images', render: (r) => imgLinks(r.images) },
    { label: 'work', render: (r) => esc((r.work || []).join(', ')) },
  ], findings.defects));

  parts.push('<h3>Variation / duplication clusters</h3>');
  parts.push(`<p>${rich(findings.clusterNote || '')}</p>`);
  parts.push(table([
    { label: 'cluster', render: (r) => `<b>${esc(r.id)}</b>` },
    { label: 'mapper(s)', render: (r) => esc(r.mappers) },
    { label: 'members', render: (r) => esc(r.members.join(', ')) },
    { label: 'evidence', render: (r) => rich(r.evidence) },
    { label: 'proposal', render: (r) => `<b>(${esc(r.proposal)})</b> ${rich(r.why)}` },
    { label: 'parameter if (a)', render: (r) => (r.param ? `<code>${esc(r.param.key)}</code> ${esc(r.param.range)} default ${esc(r.param.default)} — ${rich(r.param.sweep)}` : '—') },
    { label: 'images', render: (r) => imgLinks(r.images) },
  ], findings.clusters));

  parts.push('<h3>Prioritized work list (one coherent change each; Sonnet-sized)</h3>');
  parts.push(table([
    { label: 'id', render: (r) => `<b>${esc(r.id)}</b>` },
    { label: 'sev', render: (r) => esc(r.severity) },
    { label: 'title', render: (r) => rich(r.title) },
    { label: 'change', render: (r) => rich(r.change) },
    { label: 'files', render: (r) => r.files.map((f) => `<code>${esc(f)}</code>`).join('<br>') },
    { label: 'RGR test', render: (r) => rich(r.test) },
    { label: 'done when', render: (r) => rich(r.done_when) },
    { label: 'scope', render: (r) => esc(`${r.primitives.join('/')} · ${r.mappers.join('/')} · ${r.styles.length > 6 ? r.styles.length + ' styles' : r.styles.join('/')} · ${r.densities.join('/')}`) },
    { label: 're-shoot (before images)', render: (r) => imgLinks(r.before_images) },
  ], worklist));

  parts.push(`<details><summary>Method</summary><p>${rich(findings.meta.method)}</p></details>`);
  return parts.join('\n');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(opts.out);
  const findings = JSON.parse(fs.readFileSync(path.join(outDir, 'findings.json'), 'utf8'));
  const worklist = JSON.parse(fs.readFileSync(path.join(outDir, 'worklist.json'), 'utf8'));
  const indexPath = path.join(outDir, 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  const re = /<section id="findings">[\s\S]*?<\/section>/;
  if (!re.test(html)) throw new Error('index.html has no <section id="findings">');
  const next = html.replace(re, () => `<section id="findings">\n${render(findings, worklist)}\n</section>`);
  fs.writeFileSync(indexPath, next);
  console.log(`injected ${findings.defects.length} defects, ${findings.clusters.length} clusters, ${worklist.length} work items into ${indexPath}`);
}

main();
