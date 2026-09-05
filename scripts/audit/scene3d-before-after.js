#!/usr/bin/env node
/**
 * Scene3D fill-style audit — before/after tab injector.
 *
 * Pipeline order (every step is idempotent — re-run any or all of them,
 * any number of times, in this order):
 *
 *   1. node scripts/audit/scene3d-assemble.js       --out docs/3d-audit/fill-audit
 *   2. node scripts/audit/scene3d-audit-findings.js --out docs/3d-audit/fill-audit
 *   3. node scripts/audit/scene3d-before-after.js   --out docs/3d-audit/fill-audit
 *
 * Step 1 (scene3d-assemble.js) unconditionally rebuilds index.html from the
 * capture manifests: plain gallery markup, an EMPTY <section id="findings">
 * and an EMPTY <section id="before-after">, no tabs. Step 2
 * (scene3d-audit-findings.js) regex-replaces the <section id="findings">
 * block's contents from findings.json/worklist.json. This script (step 3):
 *
 *   - walks docs/3d-audit/fill-audit/after/<W-id>/report.json for landed-fix
 *     evidence, plus docs/3d-audit/handoff/unit-{c,d,e,f}/ for handoff-unit
 *     evidence (skipped silently if that directory doesn't exist in this
 *     worktree — it currently only exists on the unmerged handoff-b/-c
 *     branches)
 *   - regex-replaces the <section id="before-after"> block's contents with
 *     one card per report/unit: before|after image pairs matched by
 *     basename, an md5 byte-identity badge per pair, the notes/tests, and a
 *     summary line — the SAME technique scene3d-audit-findings.js uses for
 *     <section id="findings">, so it is safe to re-run after every
 *     re-assemble
 *   - wraps the page's existing top-level markup into a 3-tab strip
 *     (Gallery / Findings / Before-After), ONLY if it hasn't been wrapped
 *     yet (detected by the presence of id="ba-tabbar") — so re-running this
 *     script alone, without re-running steps 1-2, just refreshes the
 *     before-after content in place and never double-wraps
 *
 *   node scripts/audit/scene3d-before-after.js --out docs/3d-audit/fill-audit
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function parseArgs(argv) {
  const out = { out: 'docs/3d-audit/fill-audit' };
  for (let i = 0; i < argv.length; i += 1) if (argv[i] === '--out') out.out = argv[++i];
  return out;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Minimal inline markup, matching scene3d-audit-findings.js's convention.
function rich(s) {
  let t = esc(s);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return t;
}

const IMAGE_RE = /\.(png|webp|jpe?g|gif)$/i;

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function relFromGallery(outDir, absPath) {
  return toPosix(path.relative(outDir, absPath));
}

function basename(p) {
  return path.posix.basename(String(p).split(path.sep).join('/'));
}

// ---------------------------------------------------------------------------
// Evidence collection
// ---------------------------------------------------------------------------

function loadReports(outDir) {
  const afterDir = path.join(outDir, 'after');
  if (!fs.existsSync(afterDir)) return [];
  const entries = fs.readdirSync(afterDir).filter((f) => {
    try { return fs.statSync(path.join(afterDir, f)).isDirectory(); } catch (_) { return false; }
  });
  const reports = [];
  entries.sort().forEach((dirName) => {
    const dirRel = `after/${dirName}`;
    const rf = path.join(afterDir, dirName, 'report.json');
    if (!fs.existsSync(rf)) {
      reports.push({ malformed: true, id: dirName, dir: dirRel, error: 'no report.json found' });
      return;
    }
    let data;
    try {
      data = JSON.parse(fs.readFileSync(rf, 'utf8'));
    } catch (e) {
      reports.push({ malformed: true, id: dirName, dir: dirRel, error: 'invalid JSON: ' + e.message });
      return;
    }
    reports.push(normalizeReport(data, dirName, dirRel, outDir));
  });
  return reports;
}

function normalizeReport(data, dirName, dirRel, outDir) {
  const warnings = [];
  const id = data.id || dirName;
  if (!data.id) warnings.push(`report.json has no "id" field; used directory name "${dirName}"`);
  if (!data.title) warnings.push('report.json has no "title" field');
  const before = Array.isArray(data.before) ? data.before : [];
  const afterRaw = Array.isArray(data.after) ? data.after : [];
  // Hygiene guard (2026-09-05): an "after" entry that resolves into the BEFORE gallery
  // (shots/...) would compare before with before and badge it byte-identical. Refuse it.
  const after = afterRaw.filter((p) => {
    const bad = typeof p === 'string' && /^shots\//.test(p);
    if (bad) warnings.push(`after entry points at the before gallery, ignored: ${p}`);
    return !bad;
  });
  if (!Array.isArray(data.before)) warnings.push('report.json "before" is missing or not an array');
  if (!Array.isArray(data.after)) warnings.push('report.json "after" is missing or not an array');
  [...before, ...after].forEach((p) => {
    if (!fs.existsSync(path.join(outDir, p))) warnings.push(`referenced file does not exist: ${p}`);
  });
  return {
    kind: 'report',
    id,
    title: data.title || '(untitled)',
    branch: data.branch || '',
    commit: data.commit || '',
    status: data.status || 'landed',
    notes: data.notes || '',
    tests: data.tests || null,
    before,
    after,
    byte_identical_pairs: Array.isArray(data.byte_identical_pairs) ? data.byte_identical_pairs : [],
    warnings,
    sourceDir: dirRel,
  };
}

function walkFiles(dir) {
  let out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach((ent) => {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out = out.concat(walkFiles(p));
    else out.push(p);
  });
  return out;
}

// Try to split a flat file list into before/after (or on/off, pre/post)
// pairs by a filename token, matched after stripping the token.
function pairByToken(relFiles) {
  const tokenSets = [['before', 'after'], ['on', 'off'], ['pre', 'post']];
  for (const [a, b] of tokenSets) {
    const A = new Map();
    const B = new Map();
    const reA = new RegExp('(^|[_.\\-])' + a + '([_.\\-]|$)', 'i');
    const reB = new RegExp('(^|[_.\\-])' + b + '([_.\\-]|$)', 'i');
    relFiles.forEach((rel) => {
      const base = basename(rel).toLowerCase();
      if (reA.test(base)) A.set(base.replace(reA, '$1$2'), rel);
      else if (reB.test(base)) B.set(base.replace(reB, '$1$2'), rel);
    });
    const keys = [...A.keys()].filter((k) => B.has(k)).sort();
    if (keys.length) {
      const matched = new Set();
      const pairs = keys.map((k) => {
        matched.add(A.get(k));
        matched.add(B.get(k));
        return { before: A.get(k), after: B.get(k) };
      });
      const unmatched = relFiles.filter((f) => !matched.has(f));
      return { pairs, unmatched, tokenLabel: `${a}/${b}` };
    }
  }
  return null;
}

function collectHandoffUnits(outDir) {
  const handoffRoot = path.resolve(outDir, '..', 'handoff');
  const units = [];
  if (!fs.existsSync(handoffRoot)) return units;
  ['c', 'd', 'e', 'f'].forEach((letter) => {
    const dirName = `unit-${letter}`;
    const dirPath = path.join(handoffRoot, dirName);
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return;
    units.push(buildHandoffCard(outDir, dirPath, dirName));
  });
  return units;
}

function buildHandoffCard(outDir, dirPath, dirName) {
  const warnings = [];
  const allFiles = walkFiles(dirPath);
  const imageFiles = allFiles.filter((f) => IMAGE_RE.test(f));
  const relImages = imageFiles.map((f) => relFromGallery(outDir, f)).sort();

  let stats = null;
  const statsPath = path.join(dirPath, 'stats.json');
  if (fs.existsSync(statsPath)) {
    try { stats = JSON.parse(fs.readFileSync(statsPath, 'utf8')); }
    catch (e) { warnings.push('stats.json is not valid JSON: ' + e.message); }
  }

  let notes = (stats && (stats.notes || stats.summary)) || '';
  if (!notes) {
    const noteFile = allFiles.find((f) => /notes?\.(md|txt)$/i.test(path.basename(f)));
    if (noteFile) { try { notes = fs.readFileSync(noteFile, 'utf8').trim(); } catch (_) { /* ignore */ } }
  }

  const paired = pairByToken(relImages);

  return {
    kind: 'handoff',
    id: `handoff-${dirName}`,
    title: (stats && (stats.title || stats.name)) || `Handoff ${dirName.replace('unit-', 'Unit ').toUpperCase()}`,
    branch: (stats && stats.branch) || '',
    commit: (stats && stats.commit) || '',
    status: (stats && stats.status) || 'landed',
    notes,
    tests: (stats && stats.tests) || null,
    images: relImages,
    pairs: paired ? paired.pairs : null,
    pairTokenLabel: paired ? paired.tokenLabel : null,
    unpaired: paired ? paired.unmatched : relImages,
    warnings,
    sourceDir: relFromGallery(outDir, dirPath),
  };
}

// ---------------------------------------------------------------------------
// md5 / byte-identity
// ---------------------------------------------------------------------------

function fileMd5Cached(cache, absPath) {
  if (cache.has(absPath)) return cache.get(absPath);
  let hash = null;
  try { hash = crypto.createHash('md5').update(fs.readFileSync(absPath)).digest('hex'); }
  catch (_) { hash = null; }
  cache.set(absPath, hash);
  return hash;
}

function pairByBasename(beforeList, afterList) {
  const beforeImgs = beforeList.filter((p) => IMAGE_RE.test(p));
  const afterImgs = afterList.filter((p) => IMAGE_RE.test(p));
  const beforeMap = new Map();
  beforeImgs.forEach((p) => beforeMap.set(basename(p), p));
  const afterMap = new Map();
  afterImgs.forEach((p) => afterMap.set(basename(p), p));
  const pairs = [];
  const unmatchedBefore = [];
  const unmatchedAfter = [];
  const seen = new Set();
  beforeMap.forEach((p, base) => {
    if (afterMap.has(base)) { pairs.push({ base, before: p, after: afterMap.get(base) }); seen.add(base); }
    else unmatchedBefore.push(p);
  });
  afterMap.forEach((p, base) => { if (!seen.has(base)) unmatchedAfter.push(p); });
  pairs.sort((a, b) => a.base.localeCompare(b.base));
  return { pairs, unmatchedBefore, unmatchedAfter };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const BA_STYLE = `<style>
  #before-after { line-height: 1.45; }
  #before-after .ba-summary { color: var(--muted); margin: 0 0 14px; font-size: 12.5px; }
  #before-after .ba-card { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 12px 16px; margin: 0 0 18px; }
  #before-after .ba-card-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  #before-after .ba-card-head h3 { font-size: 14px; margin: 0; }
  #before-after .ba-meta { font-size: 11.5px; color: var(--muted); margin: 4px 0 8px; display: flex; gap: 10px; flex-wrap: wrap; }
  #before-after .ba-meta code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #0f1216; padding: 0 4px; border-radius: 3px; }
  #before-after .pill { font-size: 10.5px; padding: 2px 9px; border-radius: 999px; background: #22262d; color: var(--muted); white-space: nowrap; }
  #before-after .pill.landed { color: #7bd88f; }
  #before-after .pill.pending { color: #ffb347; }
  #before-after .pill.identical { color: var(--accent); margin-top: 4px; display: inline-block; }
  #before-after .pill.malformed { color: var(--warn); }
  #before-after .ba-notes { max-width: 110ch; }
  #before-after .ba-warn { color: var(--warn); font-size: 12px; margin: 4px 0; }
  #before-after pre.ba-tests { background: #0f1216; border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; font-size: 11px; white-space: pre-wrap; overflow-x: auto; }
  #before-after table.ba-pairs { border-collapse: collapse; margin: 8px 0; width: 100%; }
  #before-after table.ba-pairs th, #before-after table.ba-pairs td { border: 1px solid var(--line); padding: 6px 8px; text-align: left; vertical-align: top; width: 50%; }
  #before-after table.ba-pairs img { max-width: 380px; max-height: 380px; display: block; background: #000; border-radius: 4px; }
  #before-after .ba-cap { font-size: 10px; color: var(--muted); margin-top: 4px; word-break: break-all; }
  #before-after .ba-byte-note { font-size: 11.5px; color: var(--muted); margin-top: 6px; }
  #before-after .ba-byte-note ul { margin: 4px 0 0 18px; padding: 0; }
  #before-after .ba-unmatched { margin-top: 8px; font-size: 12px; }
  #before-after .ba-unmatched summary { cursor: pointer; color: var(--muted); }
  #before-after .ba-unmatched-item { margin: 6px 0; }
  #before-after .ba-grid { display: flex; gap: 10px; flex-wrap: wrap; }
  #before-after .ba-grid-item img { max-width: 220px; display: block; background: #000; border-radius: 4px; }
  #before-after .ba-empty { color: var(--muted); }
</style>`;

function statusPill(status) {
  const cls = /pending/i.test(status) ? 'pending' : (status === 'landed' ? 'landed' : '');
  return `<span class="pill ${cls}">${esc(status)}</span>`;
}

function renderTestsBlock(tests) {
  if (!tests) return '';
  const lines = [];
  if (tests.red) lines.push('RED    ' + tests.red);
  if (tests.green) lines.push('GREEN  ' + tests.green);
  if (tests.suites) lines.push('SUITES ' + tests.suites);
  if (!lines.length) return '';
  return `<pre class="ba-tests">${esc(lines.join('\n\n'))}</pre>`;
}

function imgCell(rel) {
  return `<a href="${esc(rel)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(rel)}" alt="${esc(basename(rel))}"></a>`;
}

function renderPairsTable(pairs, outDir, hashCache, onPairCounted) {
  if (!pairs.length) return '<p class="ba-empty">No matched before/after pairs.</p>';
  const rows = pairs.map((pr) => {
    const bHash = fileMd5Cached(hashCache, path.join(outDir, pr.before));
    const aHash = fileMd5Cached(hashCache, path.join(outDir, pr.after));
    const identical = !!bHash && !!aHash && bHash === aHash;
    if (onPairCounted) onPairCounted(identical);
    return `<tr>
      <td>${imgCell(pr.before)}<div class="ba-cap">${esc(pr.before)}</div></td>
      <td>${imgCell(pr.after)}<div class="ba-cap">${esc(pr.after)}</div>${identical ? '<span class="pill identical">byte-identical</span>' : ''}</td>
    </tr>`;
  });
  return `<table class="ba-pairs"><thead><tr><th>before</th><th>after</th></tr></thead><tbody>${rows.join('\n')}</tbody></table>`;
}

function renderReportCard(r, outDir, hashCache) {
  const { pairs, unmatchedBefore, unmatchedAfter } = pairByBasename(r.before, r.after);
  let identicalCount = 0;
  const pairsHtml = renderPairsTable(pairs, outDir, hashCache, (identical) => { if (identical) identicalCount += 1; });

  const unmatchedHtml = (unmatchedBefore.length || unmatchedAfter.length)
    ? `<details class="ba-unmatched"><summary>Unmatched images (${unmatchedBefore.length} before-only, ${unmatchedAfter.length} after-only)</summary>
        ${unmatchedBefore.map((p) => `<div class="ba-unmatched-item">before only — ${imgCell(p)}</div>`).join('')}
        ${unmatchedAfter.map((p) => `<div class="ba-unmatched-item">after only — ${imgCell(p)}</div>`).join('')}
      </details>`
    : '';

  const byteNote = r.byte_identical_pairs.length
    ? `<div class="ba-byte-note"><b>byte_identical_pairs (from report.json):</b><ul>${r.byte_identical_pairs.map((s) => `<li>${rich(s)}</li>`).join('')}</ul></div>`
    : '';

  const warn = r.warnings.length ? `<div class="ba-warn">⚠ ${r.warnings.map((w) => esc(w)).join(' · ')}</div>` : '';

  const html = `<article class="ba-card" id="card-${esc(r.id)}">
    <header class="ba-card-head"><h3>${esc(r.id)} — ${esc(r.title)}</h3>${statusPill(r.status)}</header>
    <div class="ba-meta">${r.commit ? `<code>${esc(r.commit)}</code>` : ''}${r.branch ? `<span>${esc(r.branch)}</span>` : ''}</div>
    ${warn}
    ${r.notes ? `<p class="ba-notes">${rich(r.notes)}</p>` : ''}
    ${renderTestsBlock(r.tests)}
    ${pairsHtml}
    ${byteNote}
    ${unmatchedHtml}
  </article>`;
  return { html, pairCount: pairs.length, identicalCount };
}

function renderHandoffCard(u, outDir, hashCache) {
  let pairsHtml;
  let pairCount = 0;
  let identicalCount = 0;
  if (u.pairs && u.pairs.length) {
    pairsHtml = renderPairsTable(u.pairs, outDir, hashCache, (identical) => { if (identical) identicalCount += 1; });
    pairCount = u.pairs.length;
  } else if (u.images.length) {
    pairsHtml = `<div class="ba-grid">${u.images.map((rel) => `<div class="ba-grid-item">${imgCell(rel)}<div class="ba-cap">${esc(rel)}</div></div>`).join('')}</div>`;
  } else {
    pairsHtml = '<p class="ba-empty">No images found for this unit.</p>';
  }

  const warn = u.warnings.length ? `<div class="ba-warn">⚠ ${u.warnings.map((w) => esc(w)).join(' · ')}</div>` : '';

  const html = `<article class="ba-card" id="card-${esc(u.id)}">
    <header class="ba-card-head"><h3>${esc(u.id)} — ${esc(u.title)}</h3>${statusPill(u.status)}</header>
    <div class="ba-meta">${u.commit ? `<code>${esc(u.commit)}</code>` : ''}${u.branch ? `<span>${esc(u.branch)}</span>` : ''}<span>${esc(u.sourceDir)}</span></div>
    ${warn}
    ${u.notes ? `<p class="ba-notes">${rich(u.notes)}</p>` : ''}
    ${renderTestsBlock(u.tests)}
    ${pairsHtml}
  </article>`;
  return { html, pairCount, identicalCount };
}

function renderBeforeAfter(outDir) {
  const reports = loadReports(outDir);
  const handoffUnits = collectHandoffUnits(outDir);
  const hashCache = new Map();

  const items = [...reports, ...handoffUnits].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));

  let totalPairs = 0;
  let totalIdentical = 0;
  let itemCount = 0;
  const cards = items.map((item) => {
    if (item.malformed) {
      return `<article class="ba-card ba-malformed" id="card-${esc(item.id)}">
        <header class="ba-card-head"><h3>${esc(item.id)}</h3><span class="pill malformed">malformed</span></header>
        <div class="ba-warn">⚠ ${esc(item.error)} (${esc(item.dir)}/report.json)</div>
      </article>`;
    }
    itemCount += 1;
    const built = item.kind === 'handoff' ? renderHandoffCard(item, outDir, hashCache) : renderReportCard(item, outDir, hashCache);
    totalPairs += built.pairCount;
    totalIdentical += built.identicalCount;
    return built.html;
  });

  const malformedCount = items.filter((i) => i.malformed).length;
  const handoffNote = handoffUnits.length === 0
    ? ' · handoff units: none found under docs/3d-audit/handoff/ in this worktree (evidence exists on unmerged 3d-scene/handoff-b / -c branches)'
    : '';
  const summary = `<p class="ba-summary">${itemCount} item${itemCount === 1 ? '' : 's'} · ${totalPairs} image pair${totalPairs === 1 ? '' : 's'} · ${totalIdentical} byte-identical pair${totalIdentical === 1 ? '' : 's'}${malformedCount ? ` · ${malformedCount} malformed report${malformedCount === 1 ? '' : 's'}` : ''}${handoffNote}</p>`;

  const body = cards.length ? cards.join('\n') : '<p class="ba-empty">No before/after evidence found.</p>';
  return {
    html: `${BA_STYLE}\n<h2>Before / After</h2>\n${summary}\n${body}`,
    itemCount,
    totalPairs,
    totalIdentical,
    malformedCount,
    handoffCount: handoffUnits.length,
  };
}

// ---------------------------------------------------------------------------
// Tab wrapping
// ---------------------------------------------------------------------------

const TAB_STYLE = `<style id="ba-tabstyle">
  #ba-tabbar { position: sticky; top: 0; z-index: 20; display: flex; align-items: stretch; gap: 2px; height: 44px; background: var(--panel); border-bottom: 1px solid var(--line); padding: 0 16px; }
  #ba-tabbar button { appearance: none; border: none; background: transparent; color: var(--muted); font: inherit; font-size: 13px; padding: 0 16px; cursor: pointer; border-bottom: 2px solid transparent; display: flex; align-items: center; }
  #ba-tabbar button[aria-selected="true"] { color: var(--text); border-bottom-color: var(--accent); }
  #ba-tabbar button:hover { color: var(--text); }
  #ba-tabbar button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  #pane-gallery header { top: 44px; }
</style>`;

const TAB_SCRIPT = `<script id="ba-tabscript">
(function () {
  var tabs = Array.prototype.slice.call(document.querySelectorAll('#ba-tabbar [role="tab"]'));
  var panes = {
    'gallery': document.getElementById('pane-gallery'),
    'findings': document.getElementById('pane-findings'),
    'before-after': document.getElementById('pane-before-after')
  };
  function keyOf(tabId) { return tabId.replace(/^tab-/, ''); }
  function activate(key, opts) {
    opts = opts || {};
    if (!panes[key]) key = 'gallery';
    Object.keys(panes).forEach(function (k) { panes[k].hidden = (k !== key); });
    tabs.forEach(function (t) {
      var isSel = keyOf(t.id) === key;
      t.setAttribute('aria-selected', isSel ? 'true' : 'false');
      t.tabIndex = isSel ? 0 : -1;
      if (isSel && opts.focus) t.focus();
    });
    if (opts.updateHash !== false) history.replaceState(null, '', '#' + key);
  }
  tabs.forEach(function (t) {
    t.addEventListener('click', function () { activate(keyOf(t.id)); });
    t.addEventListener('keydown', function (e) {
      var idx = tabs.indexOf(t);
      var next = null;
      if (e.key === 'ArrowRight') next = tabs[(idx + 1) % tabs.length];
      else if (e.key === 'ArrowLeft') next = tabs[(idx - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') next = tabs[0];
      else if (e.key === 'End') next = tabs[tabs.length - 1];
      if (next) { e.preventDefault(); activate(keyOf(next.id), { focus: true }); }
    });
  });
  var initial = (location.hash || '').replace('#', '');
  activate(initial || 'gallery', { updateHash: false });
  window.addEventListener('hashchange', function () {
    activate((location.hash || '').replace('#', ''), { updateHash: false });
  });
})();
</script>`;

function wrapWithTabs(html) {
  if (html.indexOf('id="ba-tabbar"') !== -1) return html; // already wrapped — no-op

  if (html.indexOf('</head>') === -1) throw new Error('index.html has no </head>');
  const htmlWithHeadStyle = html.replace('</head>', `${TAB_STYLE}\n</head>`);

  const bodyOpen = '<body>';
  const bodyIdx = htmlWithHeadStyle.indexOf(bodyOpen);
  if (bodyIdx === -1) throw new Error('index.html has no <body> tag');
  const afterBodyIdx = bodyIdx + bodyOpen.length;

  const findingsRe = /<section id="findings">[\s\S]*?<\/section>/;
  const findingsMatch = findingsRe.exec(htmlWithHeadStyle);
  if (!findingsMatch) throw new Error('index.html has no <section id="findings">...</section>');
  const findingsBlock = findingsMatch[0];
  const findingsEnd = findingsMatch.index + findingsBlock.length;

  const baIdx = htmlWithHeadStyle.indexOf('<section id="before-after">');
  if (baIdx === -1) throw new Error('index.html has no <section id="before-after">');
  const baRe = /<section id="before-after">[\s\S]*?<\/section>/;
  const baMatch = baRe.exec(htmlWithHeadStyle.slice(baIdx));
  if (!baMatch) throw new Error('malformed <section id="before-after"> block');
  const beforeAfterBlock = baMatch[0];
  const baEnd = baIdx + baMatch.index + beforeAfterBlock.length;

  const headPart = htmlWithHeadStyle.slice(0, afterBodyIdx);
  const galleryContent = htmlWithHeadStyle.slice(findingsEnd, baIdx);
  const tailPart = htmlWithHeadStyle.slice(baEnd);

  const tabbar = `<div id="ba-tabbar" role="tablist" aria-label="Audit views">
  <button type="button" role="tab" id="tab-gallery" aria-controls="pane-gallery" aria-selected="true" tabindex="0">Gallery</button>
  <button type="button" role="tab" id="tab-findings" aria-controls="pane-findings" aria-selected="false" tabindex="-1">Findings</button>
  <button type="button" role="tab" id="tab-before-after" aria-controls="pane-before-after" aria-selected="false" tabindex="-1">Before / After</button>
</div>`;

  const wrappedBody = `${tabbar}
<div id="pane-gallery" class="ba-pane" role="tabpanel" aria-labelledby="tab-gallery">
${galleryContent}
</div>
<div id="pane-findings" class="ba-pane" role="tabpanel" aria-labelledby="tab-findings" hidden>
${findingsBlock}
</div>
<div id="pane-before-after" class="ba-pane" role="tabpanel" aria-labelledby="tab-before-after" hidden>
${beforeAfterBlock}
</div>
`;

  if (tailPart.indexOf('</body>') === -1) throw new Error('index.html has no </body>');
  const tailWithScript = tailPart.replace('</body>', `${TAB_SCRIPT}\n</body>`);

  return headPart + wrappedBody + tailWithScript;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(opts.out);
  const indexPath = path.join(outDir, 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');

  const stats = renderBeforeAfter(outDir);
  const baSectionRe = /<section id="before-after">[\s\S]*?<\/section>/;
  if (!baSectionRe.test(html)) throw new Error('index.html has no <section id="before-after">');
  const withContent = html.replace(baSectionRe, () => `<section id="before-after">\n${stats.html}\n</section>`);

  const finalHtml = wrapWithTabs(withContent);
  fs.writeFileSync(indexPath, finalHtml);

  console.log(`injected ${stats.itemCount} before/after item(s) (${stats.malformedCount} malformed), ${stats.totalPairs} image pair(s), ${stats.totalIdentical} byte-identical pair(s), ${stats.handoffCount} handoff unit(s) into ${indexPath}`);
  console.log('Pipeline order (re-run in this order any time; all three are idempotent):');
  console.log(`  1. node scripts/audit/scene3d-assemble.js       --out ${opts.out}`);
  console.log(`  2. node scripts/audit/scene3d-audit-findings.js --out ${opts.out}`);
  console.log(`  3. node scripts/audit/scene3d-before-after.js   --out ${opts.out}`);
}

if (require.main === module) main();

module.exports = { loadReports, collectHandoffUnits, pairByBasename, pairByToken, renderBeforeAfter, wrapWithTabs };
