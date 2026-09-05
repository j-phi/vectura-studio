#!/usr/bin/env node
/**
 * Scene3D fill-style audit — numeric + perceptual stats over the capture.
 *
 * Reads every manifest.*.jsonl under --out (written by scene3d-capture.js) and
 * produces a Markdown report with:
 *   (a) per (primitive, mapper, style, angle) the density response — ink ratio
 *       max/low, path-count progression low -> med -> max — flagging flat and
 *       non-monotone rows, plus angle instability (a vs b ink divergence);
 *   (b) a perceptual fingerprint of every shot (16x16 dHash + 8x8 block means +
 *       ink coverage + 3x3 tone grid), decoded in headless Chromium because
 *       Node has no WebP decoder, and per (primitive, mapper) clusters of
 *       styles whose med/angle-a shots are near-identical (Hamming distance on
 *       the dHash, confirmed against the med/b and max/a shots) — the
 *       candidate duplicate clusters a human then verifies by eye.
 *
 *   node scripts/audit/scene3d-audit-stats.js \
 *     --out docs/3d-audit/fill-audit \
 *     --report docs/3d-audit/fill-audit/stats-report.md \
 *     [--cache <path>/hashes.json] [--no-hash] [--hamming 18]
 *
 * Fingerprints are cached (keyed by file path + mtime + size) so a re-run
 * after re-shooting a handful of images only re-decodes those.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function parseArgs(argv) {
  const out = {
    out: 'docs/3d-audit/fill-audit',
    report: null,
    cache: null,
    hash: true,
    hamming: 60, // of 1024 bits (~6%) — strict; dHash on line art is sensitive
    blockTol: 5, // mean |delta| over the 32x32 block means, 0-255
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--out') out.out = argv[++i];
    else if (a === '--report') out.report = argv[++i];
    else if (a === '--cache') out.cache = argv[++i];
    else if (a === '--no-hash') out.hash = false;
    else if (a === '--hamming') out.hamming = Number(argv[++i]);
    else if (a === '--block-tol') out.blockTol = Number(argv[++i]);
  }
  if (!out.report) out.report = path.join(out.out, 'stats-report.md');
  if (!out.cache) out.cache = path.join(out.out, '.hash-cache.json');
  return out;
}

const DENSITIES = ['low', 'med', 'max'];
const ANGLES = ['a', 'b'];

// ── Manifests ───────────────────────────────────────────────────────────
function loadManifests(outDir) {
  const files = fs.readdirSync(outDir).filter((f) => /^manifest\..*\.jsonl$/.test(f));
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
      byKey.set([rec.tier, rec.primitive, rec.mapper, rec.style, rec.density, rec.angle].join('|'), rec);
    });
  });
  return { records: [...byKey.values()], unreachable };
}

function rowKey(r) { return [r.primitive, r.mapper, r.style].join('|'); }

function groupRows(records) {
  const rows = new Map();
  records.forEach((r) => {
    if (r.status !== 'ok') return;
    const k = rowKey(r);
    if (!rows.has(k)) rows.set(k, { primitive: r.primitive, mapper: r.mapper, style: r.style, tier: r.tier, cells: {} });
    rows.get(k).cells[`${r.density}${r.angle}`] = r;
  });
  return rows;
}

// ── (a) density response ────────────────────────────────────────────────
function densityFindings(rows) {
  const flat = [];
  const nonMono = [];
  const angleUnstable = [];
  const bare = [];
  const zeroInk = [];
  rows.forEach((row) => {
    ANGLES.forEach((ang) => {
      const c = DENSITIES.map((d) => row.cells[`${d}${ang}`]);
      if (c.some((x) => !x)) return;
      const ink = c.map((x) => Number(x.inkMm) || 0);
      const pc = c.map((x) => Number(x.pathCount) || 0);
      const ratio = ink[0] > 0 ? ink[2] / ink[0] : (ink[2] > 0 ? Infinity : 1);
      const base = { ...row, angle: ang, ink, paths: pc, ratio: Number(ratio.toFixed(2)) };
      if (ink.some((v) => v === 0) || pc.some((v) => v === 0)) zeroInk.push(base);
      // 'none' carries no fill; only edges, so density legitimately does nothing.
      const inert = ink[0] === ink[1] && ink[1] === ink[2] && pc[0] === pc[1] && pc[1] === pc[2];
      if (row.mapper !== 'none' && ratio < 1.2 && ratio > 1 / 1.2) flat.push({ ...base, inert });
      const dec = (a, b) => b < a * 0.98;
      if (dec(ink[0], ink[1]) || dec(ink[1], ink[2]) || dec(pc[0], pc[1]) || dec(pc[1], pc[2])) nonMono.push(base);
    });
    DENSITIES.forEach((d) => {
      const a = row.cells[`${d}a`];
      const b = row.cells[`${d}b`];
      if (!a || !b) return;
      const ia = Number(a.inkMm) || 0; const ib = Number(b.inkMm) || 0;
      const m = (ia + ib) / 2;
      const div = m > 0 ? Math.abs(ia - ib) / m : 0;
      if (div > 0.45) angleUnstable.push({ ...row, density: d, inkA: ia, inkB: ib, div: Number(div.toFixed(2)) });
    });
    Object.values(row.cells).forEach((r) => { if (r.bareCentrelinesOnly) bare.push(r); });
  });
  return { flat, nonMono, angleUnstable, bare, zeroInk };
}

// ── (b) perceptual fingerprints (Chromium decode) ───────────────────────
function fileSig(p) {
  const st = fs.statSync(p);
  return `${st.size}:${Math.round(st.mtimeMs)}`;
}

// Runs in the page. Returns per-image metrics from a decoded <img>.
const PAGE_FINGERPRINT = async (items) => {
  const out = [];
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const small = document.createElement('canvas');
  const sctx = small.getContext('2d', { willReadFrequently: true });
  for (const it of items) {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('decode ' + it.key)); img.src = it.dataUrl; });
    const W = img.naturalWidth, H = img.naturalHeight;
    cv.width = W; cv.height = H; ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, W, H).data;
    // Ink = light pixels on the dark app theme. Threshold on luminance.
    let ink = 0; const grid = new Array(9).fill(0); const gridN = new Array(9).fill(0);
    for (let y = 0; y < H; y += 1) {
      const gy = Math.min(2, Math.floor(y * 3 / H));
      for (let x = 0; x < W; x += 1) {
        const i = (y * W + x) * 4;
        const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        const gi = gy * 3 + Math.min(2, Math.floor(x * 3 / W));
        gridN[gi] += 1;
        if (l > 110) { ink += 1; grid[gi] += 1; }
      }
    }
    const inkFrac = ink / (W * H);
    const tone = grid.map((g, i) => gridN[i] ? g / gridN[i] : 0);
    // dHash 32x32 (33x32 grey) and 32x32 block means. The silhouette is shared
    // by every style in a (primitive, mapper, angle) group, so only a hash fine
    // enough to see the line texture can separate styles.
    const N = 32;
    small.width = N + 1; small.height = N; sctx.drawImage(img, 0, 0, N + 1, N);
    const s = sctx.getImageData(0, 0, N + 1, N).data;
    const grey = (i) => 0.299 * s[i] + 0.587 * s[i + 1] + 0.114 * s[i + 2];
    let bits = '';
    for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) {
      bits += grey((y * (N + 1) + x) * 4) < grey((y * (N + 1) + x + 1) * 4) ? '1' : '0';
    }
    const dhash = bits.match(/.{1,4}/g).map((n) => parseInt(n, 2).toString(16)).join('');
    small.width = N; small.height = N; sctx.drawImage(img, 0, 0, N, N);
    const b = sctx.getImageData(0, 0, N, N).data;
    const blocks = [];
    for (let i = 0; i < N * N; i += 1) blocks.push(Math.round(0.299 * b[i * 4] + 0.587 * b[i * 4 + 1] + 0.114 * b[i * 4 + 2]));
    out.push({ key: it.key, w: W, h: H, inkFrac: Number(inkFrac.toFixed(4)), tone: tone.map((t) => Number(t.toFixed(3))), dhash, blocks });
  }
  return out;
};

async function fingerprintAll(records, outDir, cachePath) {
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch (_) { cache = {}; }
  const todo = [];
  records.forEach((r) => {
    if (r.status !== 'ok' || !r.path) return;
    const abs = path.join(outDir, r.path);
    if (!fs.existsSync(abs)) return;
    const sig = fileSig(abs);
    const md5 = crypto.createHash('md5').update(fs.readFileSync(abs)).digest('hex');
    const c = cache[r.path];
    if (c && c.sig === sig && c.md5 === md5 && c.blocks && c.blocks.length === 1024) return;
    todo.push({ rec: r, abs, sig, md5 });
  });
  if (todo.length) {
    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    const BATCH = 40;
    for (let i = 0; i < todo.length; i += BATCH) {
      const slice = todo.slice(i, i + BATCH);
      const items = slice.map((t) => ({ key: t.rec.path, dataUrl: 'data:image/webp;base64,' + fs.readFileSync(t.abs).toString('base64') }));
      // eslint-disable-next-line no-await-in-loop
      const res = await page.evaluate(PAGE_FINGERPRINT, items);
      res.forEach((m) => {
        const t = slice.find((x) => x.rec.path === m.key);
        cache[m.key] = { sig: t.sig, md5: t.md5, ...m };
      });
      process.stderr.write(`fingerprint ${Math.min(i + BATCH, todo.length)}/${todo.length}\r`);
    }
    process.stderr.write('\n');
    await browser.close();
    fs.writeFileSync(cachePath, JSON.stringify(cache));
  }
  return cache;
}

function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i += 1) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}
function blockDist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

// Union-find clustering of styles within one (primitive, mapper) on the
// med/a shot; a link is "confirmed" when the same two styles are also within
// tolerance on med/b and max/a (a duplicate must be a duplicate everywhere).
function clusterStyles(rows, cache, opts) {
  const groups = new Map();
  rows.forEach((row) => {
    if (row.tier !== 'B') return;
    const k = `${row.primitive}|${row.mapper}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(row);
  });
  const clusters = [];
  const pairs = [];
  groups.forEach((list, k) => {
    const [primitive, mapper] = k.split('|');
    const fp = (row, cell) => { const r = row.cells[cell]; return r && cache[r.path]; };
    const parent = list.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const close = (x, y) => x && y && hamming(x.dhash, y.dhash) <= opts.hamming && blockDist(x.blocks, y.blocks) <= opts.blockTol;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const A = fp(list[i], 'meda'); const B = fp(list[j], 'meda');
        if (!A || !B) continue;
        const exact = A.md5 === B.md5;
        const hd = hamming(A.dhash, B.dhash);
        const bd = blockDist(A.blocks, B.blocks);
        if (!(exact || (hd <= opts.hamming && bd <= opts.blockTol))) continue;
        const confB = close(fp(list[i], 'medb'), fp(list[j], 'medb'));
        const confMax = close(fp(list[i], 'maxa'), fp(list[j], 'maxa'));
        const exactAll = ['lowa', 'lowb', 'meda', 'medb', 'maxa', 'maxb'].every((c) => { const a = fp(list[i], c); const b = fp(list[j], c); return a && b && a.md5 === b.md5; });
        pairs.push({ primitive, mapper, a: list[i].style, b: list[j].style, hd, bd: Number(bd.toFixed(1)), exact, exactAll, confB, confMax });
        if (exact || (confB && confMax)) parent[find(i)] = find(j);
      }
    }
    const members = new Map();
    list.forEach((row, i) => { const r = find(i); if (!members.has(r)) members.set(r, []); members.get(r).push(row.style); });
    members.forEach((m) => {
      if (m.length < 2) return;
      const allExact = m.every((s) => m.every((t) => {
        const a = fp(list.find((r) => r.style === s), 'meda'); const b = fp(list.find((r) => r.style === t), 'meda');
        return a && b && a.md5 === b.md5;
      }));
      clusters.push({ primitive, mapper, members: m, allExact });
    });
  });
  return { clusters, pairs };
}

// Cross-primitive consistency: a style pair that is a duplicate on BOTH the
// sphere and the torus is a roster-level duplicate, not a geometry accident.
function rosterClusters(clusters) {
  const byMapper = new Map();
  clusters.forEach((c) => {
    const k = c.mapper;
    if (!byMapper.has(k)) byMapper.set(k, []);
    byMapper.get(k).push(c);
  });
  return byMapper;
}

// ── report ──────────────────────────────────────────────────────────────
function md(rowsArr, cols) {
  const head = `| ${cols.map((c) => c[0]).join(' | ')} |\n| ${cols.map(() => '---').join(' | ')} |\n`;
  return head + rowsArr.map((r) => `| ${cols.map((c) => c[1](r)).join(' | ')} |`).join('\n') + '\n';
}
const num = (v) => (Number.isFinite(v) ? String(v) : '—');

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(opts.out);
  const { records, unreachable } = loadManifests(outDir);
  const rows = groupRows(records);
  const d = densityFindings(rows);
  const lines = [];
  lines.push('# Scene3D fill-style audit — stats report');
  lines.push('');
  lines.push(`Generated ${new Date().toISOString()} from ${records.length} shots / ${rows.size} rows (${unreachable.length} unreachable pairs). Script: scripts/audit/scene3d-audit-stats.js`);
  lines.push('');
  lines.push('## (a) Density response');
  lines.push('');
  lines.push(`Ink ratio = inkMm[max]/inkMm[low]. Flat: 0.83 < ratio < 1.2 on a mapper that owns the density slider (mapper 'none' excluded). Non-monotone: ink or path count drops >2% from low→med or med→max. Angle-unstable: |ink(a)-ink(b)|/mean > 0.45 at one density.`);
  lines.push('');
  const rowCols = [
    ['primitive', (r) => r.primitive], ['mapper', (r) => r.mapper], ['style', (r) => r.style], ['angle', (r) => r.angle],
    ['ink low/med/max', (r) => r.ink.join(' / ')], ['paths low/med/max', (r) => r.paths.join(' / ')], ['ratio', (r) => num(r.ratio)],
  ];
  const inertRows = d.flat.filter((r) => r.inert);
  const weakRows = d.flat.filter((r) => !r.inert);
  const inertBy = new Map();
  inertRows.forEach((r) => { const k = `${r.primitive}|${r.mapper}`; if (!inertBy.has(k)) inertBy.set(k, new Set()); inertBy.get(k).add(r.style); });
  lines.push(`### Density-INERT rows (ink and path count byte-identical across low/med/max) — ${inertRows.length} rows`);
  lines.push('');
  lines.push(md([...inertBy.entries()].map(([k, v]) => ({ k, n: v.size, styles: [...v].sort().join(', ') })), [['primitive|mapper', (r) => r.k], ['styles', (r) => r.n], ['which', (r) => r.styles]]));
  lines.push(`### Weak density response (0.83 < ratio < 1.2 but not inert) — ${weakRows.length} rows`);
  lines.push('');
  lines.push(md(weakRows, rowCols));
  lines.push(`### Non-monotone density response (${d.nonMono.length} rows)`);
  lines.push('');
  lines.push(md(d.nonMono, rowCols));
  lines.push(`### Angle-unstable ink (${d.angleUnstable.length} rows)`);
  lines.push('');
  lines.push(md(d.angleUnstable, [
    ['primitive', (r) => r.primitive], ['mapper', (r) => r.mapper], ['style', (r) => r.style], ['density', (r) => r.density],
    ['ink a', (r) => r.inkA], ['ink b', (r) => r.inkB], ['divergence', (r) => r.div],
  ]));
  lines.push(`### Zero ink / zero paths (${d.zeroInk.length} rows)`);
  lines.push('');
  lines.push(md(d.zeroInk, rowCols));
  // Bare centrelines summary
  const bareBy = new Map();
  d.bare.forEach((r) => { const k = `${r.primitive}|${r.mapper}`; if (!bareBy.has(k)) bareBy.set(k, new Set()); bareBy.get(k).add(r.style); });
  lines.push(`### bareCentrelinesOnly (${d.bare.length} shots)`);
  lines.push('');
  lines.push(md([...bareBy.entries()].map(([k, s]) => ({ k, styles: [...s].sort().join(', '), n: s.size })), [
    ['primitive|mapper', (r) => r.k], ['styles', (r) => r.styles], ['count', (r) => r.n],
  ]));

  // Per-mapper span summary (median ratio) to judge whether the slider span is useful.
  const spanBy = new Map();
  rows.forEach((row) => {
    const lo = row.cells.lowa; const hi = row.cells.maxa;
    if (!lo || !hi || !lo.inkMm) return;
    const k = `${row.tier}|${row.mapper}`;
    if (!spanBy.has(k)) spanBy.set(k, []);
    spanBy.get(k).push({ r: hi.inkMm / lo.inkMm, p: hi.pathCount / Math.max(1, lo.pathCount), maxInk: hi.inkMm, maxPaths: hi.pathCount, maxMs: hi.genMs });
  });
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
  lines.push('### Per-mapper density span (angle a, Tier B + A)');
  lines.push('');
  lines.push(md([...spanBy.entries()].map(([k, v]) => ({
    k, n: v.length, r: median(v.map((x) => x.r)).toFixed(2), p: median(v.map((x) => x.p)).toFixed(2),
    ink: Math.round(median(v.map((x) => x.maxInk))), paths: Math.round(median(v.map((x) => x.maxPaths))), ms: Math.round(median(v.map((x) => x.maxMs))),
    worstMs: Math.max(...v.map((x) => x.maxMs)),
  })), [
    ['tier|mapper', (r) => r.k], ['rows', (r) => r.n], ['median ink ratio', (r) => r.r], ['median path ratio', (r) => r.p],
    ['median ink @max', (r) => r.ink], ['median paths @max', (r) => r.paths], ['median genMs @max', (r) => r.ms], ['worst genMs @max', (r) => r.worstMs],
  ]));

  if (opts.hash) {
    const cache = await fingerprintAll(records, outDir, opts.cache);
    // Attach measured tone metrics.
    lines.push('## (b) Perceptual fingerprints');
    lines.push('');
    lines.push(`dHash 16x16 on the decoded WebP (Chromium), Hamming threshold ${opts.hamming}/256, 8x8 block-mean tolerance ${opts.blockTol}/255. A pair is a cluster link only when it also matches on med/b AND max/a (or the files are byte-identical).`);
    lines.push('');
    // Blob saturation & tone gradient at max.
    const blob = [];
    const flatTone = [];
    rows.forEach((row) => {
      const mx = row.cells.maxa && cache[row.cells.maxa.path];
      const me = row.cells.meda && cache[row.cells.meda.path];
      if (mx && mx.inkFrac > 0.62 && row.mapper !== 'none') blob.push({ ...row, inkFrac: mx.inkFrac });
      if (me && row.mapper !== 'none' && row.mapper !== 'wireframe' && row.style !== 'none') {
        const t = me.tone.filter((v) => v > 0.02);
        const span = t.length ? Math.max(...t) - Math.min(...t) : 0;
        if (span < 0.08 && me.inkFrac > 0.05) flatTone.push({ ...row, inkFrac: me.inkFrac, span: Number(span.toFixed(3)) });
      }
    });
    lines.push(`### Max-density saturation (ink coverage of the frame > 0.62 at max/a) — ${blob.length} rows`);
    lines.push('');
    lines.push(md(blob, [['primitive', (r) => r.primitive], ['mapper', (r) => r.mapper], ['style', (r) => r.style], ['inkFrac@max', (r) => r.inkFrac]]));
    lines.push(`### Flat tone grid at med/a (3x3 cell coverage span < 0.08) — ${flatTone.length} rows`);
    lines.push('');
    lines.push(md(flatTone, [['primitive', (r) => r.primitive], ['mapper', (r) => r.mapper], ['style', (r) => r.style], ['inkFrac', (r) => r.inkFrac], ['span', (r) => r.span]]));

    const { clusters, pairs } = clusterStyles(rows, cache, opts);
    // Byte-identical style groups: every one of the 6 shots identical. The
    // strict, unarguable duplicate list.
    const exactGroups = [];
    const byPM = new Map();
    rows.forEach((row) => { if (row.tier !== 'B') return; const k = `${row.primitive}|${row.mapper}`; if (!byPM.has(k)) byPM.set(k, []); byPM.get(k).push(row); });
    byPM.forEach((list, k) => {
      const sigOf = (row) => ['lowa', 'lowb', 'meda', 'medb', 'maxa', 'maxb'].map((c) => (row.cells[c] && cache[row.cells[c].path] ? cache[row.cells[c].path].md5 : '?')).join('+');
      const g = new Map();
      list.forEach((row) => { const sg = sigOf(row); if (!g.has(sg)) g.set(sg, []); g.get(sg).push(row.style); });
      const [primitive, mapper] = k.split('|');
      g.forEach((members) => { if (members.length > 1) exactGroups.push({ primitive, mapper, members: members.sort(), distinct: g.size, total: list.length }); });
    });
    lines.push(`### Byte-identical style groups (all 6 shots identical) — ${exactGroups.length} groups`);
    lines.push('');
    lines.push(md(exactGroups.sort((x, y) => x.mapper.localeCompare(y.mapper) || x.primitive.localeCompare(y.primitive) || y.members.length - x.members.length), [
      ['primitive', (r) => r.primitive], ['mapper', (r) => r.mapper], ['distinct/total', (r) => `${r.distinct}/${r.total}`], ['n', (r) => r.members.length], ['members', (r) => r.members.join(', ')],
    ]));
    lines.push(`### Candidate duplicate clusters (${clusters.length})`);
    lines.push('');
    const byMapper = rosterClusters(clusters);
    [...byMapper.keys()].sort().forEach((mapper) => {
      lines.push(`#### mapper: ${mapper}`);
      lines.push('');
      byMapper.get(mapper).sort((a, b) => a.primitive.localeCompare(b.primitive)).forEach((c) => {
        lines.push(`- **${c.primitive}** ${c.allExact ? '(byte-identical at med/a)' : ''}: ${c.members.join(', ')}`);
      });
      lines.push('');
    });
    const nearPairs = pairs.filter((p) => !p.exactAll && p.confB && p.confMax);
    lines.push(`### Near-duplicate (not byte-identical) pairs confirmed on med/b and max/a — ${nearPairs.length} of ${pairs.length} candidate pairs`);
    lines.push('');
    lines.push(md(nearPairs.sort((x, y) => x.hd - y.hd), [
      ['primitive', (r) => r.primitive], ['mapper', (r) => r.mapper], ['a', (r) => r.a], ['b', (r) => r.b], ['hamming', (r) => r.hd], ['blockΔ', (r) => r.bd],
      ['byte-identical', (r) => (r.exactAll ? 'all 6' : r.exact ? 'med/a' : '')], ['confirmed med/b', (r) => (r.confB ? 'y' : '')], ['confirmed max/a', (r) => (r.confMax ? 'y' : '')],
    ]));
    // Style-level identity across ALL Tier-B primitives: which pairs are
    // byte-identical on every primitive (roster-level duplicates).
    const pairKey = (p) => `${p.mapper}|${[p.a, p.b].sort().join('~')}`;
    const agg = new Map();
    pairs.forEach((p) => {
      const k = pairKey(p);
      if (!agg.has(k)) agg.set(k, { mapper: p.mapper, pair: [p.a, p.b].sort().join(' ~ '), prims: [], exactPrims: [] });
      agg.get(k).prims.push(p.primitive);
      if (p.exactAll) agg.get(k).exactPrims.push(p.primitive);
    });
    // Only pairs that are byte-identical somewhere or confirmed near-duplicates
    // on >= 2 primitives; the raw candidate list is thousands of rows of noise.
    const confirmedKeys = new Set(pairs.filter((p) => p.exactAll || (p.confB && p.confMax)).map(pairKey));
    const roster = [...agg.values()].filter((v) => v.prims.length >= 2 && confirmedKeys.has(`${v.mapper}|${v.pair.replace(' ~ ', '~')}`)).sort((x, y) => y.exactPrims.length - x.exactPrims.length || x.mapper.localeCompare(y.mapper));
    lines.push(`### Roster-level duplicate pairs (near-identical on >= 2 primitives) — ${roster.length}`);
    lines.push('');
    lines.push(md(roster, [['mapper', (r) => r.mapper], ['pair', (r) => r.pair], ['primitives', (r) => r.prims.join(', ')], ['byte-identical (all 6 shots) on', (r) => r.exactPrims.join(', ') || '—']]));

    // Per-image metric dump for the reviewer (med/a only, Tier B).
    lines.push('### Measured coverage at med/a (Tier B, ink fraction of frame; 3x3 tone grid span)');
    lines.push('');
    const cov = [];
    rows.forEach((row) => {
      if (row.tier !== 'B') return;
      const me = row.cells.meda && cache[row.cells.meda.path];
      const mx = row.cells.maxa && cache[row.cells.maxa.path];
      const lo = row.cells.lowa && cache[row.cells.lowa.path];
      if (!me) return;
      const t = me.tone.filter((v) => v > 0.02);
      cov.push({ ...row, lo: lo ? lo.inkFrac : NaN, me: me.inkFrac, mx: mx ? mx.inkFrac : NaN, span: t.length ? Number((Math.max(...t) - Math.min(...t)).toFixed(2)) : 0 });
    });
    lines.push(md(cov.sort((x, y) => x.primitive.localeCompare(y.primitive) || x.mapper.localeCompare(y.mapper) || x.style.localeCompare(y.style)), [
      ['primitive', (r) => r.primitive], ['mapper', (r) => r.mapper], ['style', (r) => r.style], ['cov low', (r) => num(r.lo)], ['cov med', (r) => num(r.me)], ['cov max', (r) => num(r.mx)], ['tone span', (r) => r.span],
    ]));
  }
  fs.writeFileSync(opts.report, lines.join('\n'));
  console.log(`wrote ${opts.report}`);
  console.log(`flat ${d.flat.length}, non-monotone ${d.nonMono.length}, angle-unstable ${d.angleUnstable.length}, bare ${d.bare.length}, zero ${d.zeroInk.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
