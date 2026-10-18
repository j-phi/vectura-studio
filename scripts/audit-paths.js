#!/usr/bin/env node
/**
 * Path filter for the Scene3D proof audits in tests/audit/ (judgment R-17).
 *
 * The audits are too slow for every PR. A PR runs them only when its diff touches a path that
 * can change their result. Push-to-main and the nightly always run them (scripts/ci-plan.js).
 *
 * The filter is sound by construction:
 * - every source file the audits execute is in the Scene3D runtime manifest
 *   (tests/helpers/runtime-profiles.js SCENE3D_FILES), which the audits load through
 *   tests/helpers/scene3d-audit-runtime.js, and every manifest file is in this filter;
 * - the audits, their helpers and fixtures, and the test infrastructure match by directory;
 * - index.html is not a path match (the version hook rewrites its `?v=` badge on every src
 *   commit), but the audit runtime evaluates the manifest in index.html script order and throws
 *   when a manifest file is missing there. So a change to the ordered list of manifest
 *   `<script src>` entries counts as an audit change (manifestScriptsChanged).
 * tests/unit/audit-paths.test.js fails when an audit test loads or reads a file outside it.
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { SCENE3D_FILES } = require('../tests/helpers/runtime-profiles');

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Scene3D and the shared geometry it builds on (wider than the manifest, on purpose: a new
// file in these folders is Scene3D code before anyone adds it to the manifest).
const SCENE3D_PATTERNS = [
  /^src\/core\/scene3d\//,
  /^src\/config\/scene3d-/,
  /^src\/core\/algorithms\/(scene3d|object3d|booleanGroup3d|sceneLight3d|sceneGround3d|geometry3d)\.js$/,
  /^src\/core\/(path-boolean|geometry-utils|fill-boolean|pen-fill)\.js$/,
];
// The audits themselves, their helpers and fixtures, and the golden values an audit reads
// (tests/unit/audit-paths.test.js checks every golden-values file an audit names).
const TEST_PATTERNS = [/^tests\/(audit|helpers|fixtures)\//, /^tests\/baselines\/golden-values\/scene3d-golden-corpus\.json$/];
// Test infrastructure that decides how (or whether) the audits run.
const INFRA_PATTERNS = [
  /^vitest(\.[a-z0-9-]+)?\.config\.mjs$/,
  /^scripts\/(run-vitest|vitest-supervisor|test-queue|audit-paths|ci-plan|test-profile)\.js$/,
  // The audit job's strict results check (test-profile's inspector) and the inventory it loads.
  /^scripts\/test-lanes\.json$/,
  /^scripts\/test-shard-[a-z0-9-]+\.(js|mjs|json)$/,
  /^scripts\/test-duration-sequencer\.mjs$/,
  /^package(-lock)?\.json$/,
  /^\.github\/(workflows|actions)\//,
];
// Every other file the audit runtime evaluates (engine, layer, defaults, rng, noise, ...).
const MANIFEST_PATTERNS = SCENE3D_FILES.map((file) => new RegExp(`^${escape(file)}$`));

const PATTERNS = [...SCENE3D_PATTERNS, ...TEST_PATTERNS, ...INFRA_PATTERNS, ...MANIFEST_PATTERNS];

const matches = (file) => PATTERNS.some((pattern) => pattern.test(String(file).replace(/^\.\//, '')));

// The manifest files in index.html script order, as the audit runtime reads them
// (the generic runtime loader's parseLocalScripts + normalizedScriptPath, in tests/helpers).
const MANIFEST_SET = new Set(SCENE3D_FILES);
function manifestScriptOrder(html) {
  return [...String(html).matchAll(/<script\b[^>]*?\bsrc="([^"]+)"/gi)]
    .map((match) => match[1].replace(/^\.\//, '').replace(/\?.*$/, ''))
    .filter((file) => MANIFEST_SET.has(file));
}

// True when the ordered manifest script list differs between two commits' index.html, or when
// either side cannot be read (doubt runs the audits).
function manifestScriptsChanged(base, head, { cwd = process.cwd(), exec = execFileSync } = {}) {
  const read = (rev) => String(exec('git', ['show', `${rev}:index.html`], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 }));
  try {
    return JSON.stringify(manifestScriptOrder(read(base))) !== JSON.stringify(manifestScriptOrder(read(head)));
  } catch {
    return true;
  }
}

/**
 * Decide whether the audits must run for a list of changed files.
 * `files === null` means the diff is unknown: run them. `indexScriptsChanged` (called only when
 * index.html is in the diff) says whether its manifest script list changed.
 */
function decide(files, { indexScriptsChanged = () => true } = {}) {
  if (!Array.isArray(files)) return { run: true, reason: 'unknown diff' };
  const hits = files.filter(matches);
  if (hits.length) return { run: true, reason: `${hits.length} audit path(s) changed, first: ${hits[0]}` };
  if (files.some((file) => String(file).replace(/^\.\//, '') === 'index.html') && indexScriptsChanged()) {
    return { run: true, reason: 'index.html changed the Scene3D manifest script list or order' };
  }
  return { run: false, reason: `none of ${files.length} changed file(s) can affect the audits` };
}

// Changed files between two commits (two-point diff: on a PR merge ref, base..HEAD is exactly
// the PR's change), or null when git cannot tell.
function changedFiles(base, head, { cwd = process.cwd(), exec = execFileSync } = {}) {
  if (!base || !/^[0-9a-f]{7,40}$/i.test(base) || /^0+$/.test(base) || !head) return null;
  try {
    const out = exec('git', ['diff', '--name-only', '--no-renames', base, head], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return String(out).split('\n').map((line) => line.trim()).filter(Boolean);
  } catch {
    return null;
  }
}

// The audit files, split into `count` groups of about equal weight (greedy, heaviest first).
// Weights come from scripts/test-shard-weights.json; an unmeasured file counts as the median.
function shardFiles(index, count, { files = auditFiles(), weights = require('./test-shard-weights.json').weightsSeconds } = {}) {
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(index) || index < 1 || index > count) {
    throw new Error(`invalid audit shard ${index}/${count}`);
  }
  const known = files.map((file) => weights[file]).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  const fallback = known.length ? known[Math.floor(known.length / 2)] : 1;
  const rows = files.map((file) => ({ file, seconds: Number.isFinite(weights[file]) && weights[file] > 0 ? weights[file] : fallback }))
    .sort((a, b) => b.seconds - a.seconds || (a.file < b.file ? -1 : 1));
  const groups = Array.from({ length: count }, (_, i) => ({ i, seconds: 0, files: [] }));
  for (const row of rows) {
    groups.sort((a, b) => a.seconds - b.seconds || a.i - b.i);
    groups[0].files.push(row.file);
    groups[0].seconds += row.seconds;
  }
  return groups.find((g) => g.i === index - 1).files.sort();
}

// Strict check of one audit group's Vitest JSON (test-profile's inspector): every file of the
// group reported once, passed, and ran at least one test; no audit test is skipped.
function verifyShardResults(results, files, { root = path.resolve(__dirname, '..') } = {}) {
  const { inspectJsonResults } = require('./test-profile');
  return inspectJsonResults(results, { root, inventory: files, testInventory: { expectedSkippedAssertions: 0, fullySkippedFiles: {} } });
}

function auditFiles(root = path.resolve(__dirname, '..')) {
  const dir = path.join(root, 'tests', 'audit');
  return fs.readdirSync(dir).filter((name) => name.endsWith('.test.js')).map((name) => `tests/audit/${name}`).sort();
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === '--shard') {
    // Usage: node scripts/audit-paths.js --shard <i>/<n>   (prints the shard's files, one per line)
    const [index, count] = String(args[1]).split('/').map(Number);
    process.stdout.write(`${shardFiles(index, count).join('\n')}\n`);
  } else if (args[0] === '--verify-results') {
    // Usage: node scripts/audit-paths.js --verify-results <vitest-json> <i>/<n>
    const [index, count] = String(args[2]).split('/').map(Number);
    const verdict = verifyShardResults(JSON.parse(fs.readFileSync(args[1], 'utf8')), shardFiles(index, count));
    if (!verdict.passed) {
      process.stderr.write(`[audit-paths] audit group ${args[2]} results failed the strict check: ${verdict.failures.join('; ')}\n`);
      process.exit(1);
    }
    process.stdout.write(`[audit-paths] audit group ${args[2]}: ${verdict.reported.length} file(s) passed the strict check\n`);
  } else {
    // Usage: node scripts/audit-paths.js <base> <head>   (prints run=true|false)
    const [base, head] = args;
    const verdict = decide(changedFiles(base, head), { indexScriptsChanged: () => manifestScriptsChanged(base, head) });
    process.stdout.write(`run=${verdict.run}\n`);
    process.stderr.write(`[audit-paths] ${verdict.reason}\n`);
  }
}

module.exports = { PATTERNS, SCENE3D_PATTERNS, TEST_PATTERNS, INFRA_PATTERNS, MANIFEST_PATTERNS, matches, decide, changedFiles, manifestScriptOrder, manifestScriptsChanged, verifyShardResults, shardFiles, auditFiles };
