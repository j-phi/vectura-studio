#!/usr/bin/env node
'use strict';

// Bounded Vitest 4 shard-feasibility experiment. This intentionally exercises
// only three fixed test files and two source files; it does not certify the
// full-suite threshold or change vitest.config.mjs.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TESTS = [
  'tests/unit/rng-noise.test.js',
  'tests/unit/bezier-adaptive-sampling.test.js',
  'tests/unit/runtime-loader-contract.test.js',
];
const SOURCES = ['src/core/rng.js', 'src/core/noise.js'];
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
};
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function validateResults(reportPath, label, { exactInventory = true } = {}) {
  const report = readJson(reportPath);
  if (report.success !== true || !Array.isArray(report.testResults)) throw new Error(`${label}: Vitest JSON result is missing or unsuccessful`);
  const seen = new Map();
  for (const result of report.testResults) {
    const relative = path.relative(ROOT, result.name).split(path.sep).join('/');
    seen.set(relative, (seen.get(relative) || 0) + 1);
    if (result.status !== 'passed') throw new Error(`${label}: ${relative} did not pass (${result.status || 'unknown'})`);
    if (!Array.isArray(result.assertionResults) || !result.assertionResults.length || result.assertionResults.some((assertion) => assertion.status !== 'passed')) throw new Error(`${label}: ${relative} has no assertions or contains a non-passing assertion`);
  }
  const missing = exactInventory ? TESTS.filter((file) => seen.get(file) !== 1) : [];
  const extra = [...seen.keys()].filter((file) => !TESTS.includes(file));
  const duplicate = [...seen].filter(([, count]) => count !== 1).map(([file]) => file);
  if (missing.length || extra.length || duplicate.length) throw new Error(`${label}: test inventory mismatch; mismatches ${[...missing, ...extra, ...duplicate].join(', ')}`);
  return [...seen.keys()];
}

function runVitest(label, args, env = {}) {
  process.stdout.write(`[coverage-probe] ${label}\n`);
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/run-vitest.js'), ...args], {
    cwd: ROOT,
    env: { ...process.env, VECTURA_TEST_COVERAGE: '1', VECTURA_TEST_TIMEOUT_MS: '120000', ...env },
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const tail = `${result.stdout || ''}${result.stderr || ''}`.slice(-2500);
    throw new Error(`${label} exited ${result.status ?? result.signal}: ${tail}`);
  }
}

function coverageArgs(directory, { zeroThresholds = false } = {}) {
  const args = ['--coverage'];
  for (const source of SOURCES) args.push(`--coverage.include=${source}`);
  args.push(`--coverage.reportsDirectory=${directory}`, '--coverage.reporter=json');
  if (zeroThresholds) for (const metric of ['statements', 'branches', 'functions', 'lines']) args.push(`--coverage.thresholds.${metric}=0`);
  return args;
}

function coverageMap(directory, label) {
  const file = path.join(directory, 'coverage-final.json');
  if (!fs.existsSync(file)) throw new Error(`${label}: coverage-final.json was not produced`);
  const raw = readJson(file);
  const normalized = {};
  for (const [source, coverage] of Object.entries(raw)) {
    const relative = path.relative(ROOT, source).split(path.sep).join('/');
    normalized[relative] = canonical({
      statementMap: coverage.statementMap,
      fnMap: coverage.fnMap,
      branchMap: coverage.branchMap,
      s: coverage.s,
      f: coverage.f,
      b: coverage.b,
    });
  }
  const got = Object.keys(normalized).sort();
  if (JSON.stringify(got) !== JSON.stringify([...SOURCES].sort())) throw new Error(`${label}: source attribution mismatch; got ${got.join(', ')}`);
  return normalized;
}

function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vectura-coverage-shard-probe-'));
  try {
    const unshardedJson = path.join(temp, 'unsharded-results.json');
    const unshardedCoverage = path.join(temp, 'unsharded-coverage');
    runVitest('unsharded baseline', [
      'run', ...TESTS, ...coverageArgs(unshardedCoverage), '--reporter=json', `--outputFile.json=${unshardedJson}`,
    ]);
    const unshardedFiles = validateResults(unshardedJson, 'unsharded baseline');
    const unshardedMap = coverageMap(unshardedCoverage, 'unsharded baseline');

    const blobDirectory = path.join(temp, 'blobs');
    fs.mkdirSync(blobDirectory);
    const shardReports = [];
    const shardInventory = [];
    for (const shard of ['1/2', '2/2']) {
      const [index] = shard.split('/');
      const blob = path.join(blobDirectory, `shard-${index}.json`);
      const json = path.join(temp, `shard-${index}-results.json`);
      const coverage = path.join(temp, `shard-${index}-coverage`);
      runVitest(`shard ${shard}`, [
        'run', ...TESTS, ...coverageArgs(coverage, { zeroThresholds: true }), `--shard=${shard}`,
        '--reporter=blob', '--reporter=json', `--outputFile.blob=${blob}`, `--outputFile.json=${json}`,
      ]);
      const shardFiles = validateResults(json, `shard ${shard}`, { exactInventory: false });
      if (!shardFiles.length) throw new Error(`shard ${shard} received no test files`);
      shardInventory.push(...shardFiles);
      shardReports.push(blob);
    }
    if (shardInventory.length !== TESTS.length || new Set(shardInventory).size !== TESTS.length || TESTS.some((file) => !shardInventory.includes(file))) {
      throw new Error(`two-shard partition mismatch; received ${shardInventory.join(', ')}`);
    }
    if (shardReports.some((file) => !fs.existsSync(file))) throw new Error('one or more shard blob reports were not produced');

    const mergedJson = path.join(temp, 'merged-results.json');
    const mergedCoverage = path.join(temp, 'merged-coverage');
    // No threshold overrides here: Vitest applies the repository's configured
    // global thresholds only after merging both shard blobs.
    runVitest('merged shard reports', [
      `--merge-reports=${blobDirectory}`, '--reporter=json', `--outputFile.json=${mergedJson}`,
      ...coverageArgs(mergedCoverage),
    ]);
    const mergedFiles = validateResults(mergedJson, 'merged reports');
    const mergedMap = coverageMap(mergedCoverage, 'merged reports');
    if (JSON.stringify(canonical(unshardedMap)) !== JSON.stringify(canonical(mergedMap))) {
      throw new Error('merged coverage attribution/count maps differ from the unsharded baseline');
    }
    if (JSON.stringify([...mergedFiles].sort()) !== JSON.stringify([...unshardedFiles].sort())) throw new Error('merged test file inventory differs from unsharded baseline');
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, testFiles: TESTS, sourceFiles: SOURCES, unshardedFiles: unshardedFiles.length, mergedFiles: mergedFiles.length, shardPartition: shardInventory.length, sourceAttributionAndCountsMatch: true, thresholdPolicy: 'shards use zero thresholds; merged run uses unchanged repository thresholds', tempDirectory: temp }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`[coverage-probe] ${error.message}\n[coverage-probe] Diagnostic files retained at ${temp}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { coverageArgs, coverageMap, validateResults };
