#!/usr/bin/env node
'use strict';

// Bounded Vitest 4 shard-feasibility experiment. This intentionally exercises
// only three fixed test files and two source files; it does not certify the
// full-suite threshold or change vitest.config.mjs.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildPlan, validateReport } = require('./test-shard-plan');

const ROOT = path.resolve(__dirname, '..');
const TESTS = [
  'tests/unit/rng-noise.test.js',
  'tests/unit/bezier-adaptive-sampling.test.js',
  'tests/unit/runtime-loader-contract.test.js',
];
// The probe roster has three files, so the shard count must stay <= 3 (an empty shard fails closed).
const SHARD_COUNT = 2;
const SOURCES = ['src/core/rng.js', 'src/core/noise.js'];
const CONFIG = 'vitest.coverage-shard.config.mjs';
const PLAN_BUILDER = path.join(ROOT, 'scripts/test-shard-plan.js');
const WEIGHTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-shard-weights.json'), 'utf8'));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
};
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function validateResults(reportPath, label, expectedFiles = TESTS) {
  const report = readJson(reportPath);
  if (report.success !== true || !Array.isArray(report.testResults)) throw new Error(`${label}: Vitest JSON result is missing or unsuccessful`);
  const seen = new Map();
  for (const result of report.testResults) {
    const relative = path.relative(ROOT, result.name).split(path.sep).join('/');
    seen.set(relative, (seen.get(relative) || 0) + 1);
    if (result.status !== 'passed') throw new Error(`${label}: ${relative} did not pass (${result.status || 'unknown'})`);
    if (!Array.isArray(result.assertionResults) || !result.assertionResults.length || result.assertionResults.some((assertion) => assertion.status !== 'passed')) throw new Error(`${label}: ${relative} has no assertions or contains a non-passing assertion`);
  }
  const missing = expectedFiles.filter((file) => seen.get(file) !== 1);
  const extra = [...seen.keys()].filter((file) => !expectedFiles.includes(file));
  const duplicate = [...seen].filter(([, count]) => count !== 1).map(([file]) => file);
  if (missing.length || extra.length || duplicate.length) throw new Error(`${label}: test inventory mismatch; mismatches ${[...missing, ...extra, ...duplicate].join(', ')}`);
  return [...seen.keys()];
}

function runNpm(label, script, args, env = {}) {
  process.stdout.write(`[coverage-probe] ${label}\n`);
  const result = spawnSync(npmCommand, ['run', script, '--', ...args], {
    cwd: ROOT,
    env: { ...process.env, VECTURA_TEST_TIMEOUT_MS: '120000', ...env },
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const tail = `${result.stdout || ''}${result.stderr || ''}`.slice(-3000);
    throw new Error(`${label} exited ${result.status ?? result.signal}: ${tail}`);
  }
  return `${result.stdout || ''}${result.stderr || ''}`;
}

function runNode(args, label) {
  const result = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} exited ${result.status ?? result.signal}: ${(result.stdout || '') + (result.stderr || '')}`);
  return `${result.stdout || ''}${result.stderr || ''}`;
}

function coverageArgs(directory, { zeroThresholds = false } = {}) {
  const args = [];
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
    const sha = process.env.GITHUB_SHA || runNode(['-e', "process.stdout.write(require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim())"], 'read current SHA').trim();
    if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error('probe requires a 40-character GITHUB_SHA or Git HEAD');
    const runId = `local-probe-${process.pid}`;
    const attempt = '1';
    const plan = buildPlan({ files: TESTS, weights: WEIGHTS, sha, shardCount: SHARD_COUNT });
    const planFile = path.join(temp, 'coverage-shard-plan.json');
    fs.writeFileSync(planFile, `${JSON.stringify(plan, null, 2)}\n`);
    const env = { VECTURA_SHARD_PLAN_FILE: planFile, GITHUB_SHA: sha, GITHUB_RUN_ID: runId, GITHUB_RUN_ATTEMPT: attempt };

    const unshardedJson = path.join(temp, 'unsharded-results.json');
    const unshardedCoverage = path.join(temp, 'unsharded-coverage');
    runNpm('unsharded baseline through configured pilot sequencer', 'test:coverage', [
      '--config', CONFIG, ...TESTS, ...coverageArgs(unshardedCoverage, { zeroThresholds: true }),
      '--reporter=json', `--outputFile.json=${unshardedJson}`,
    ], env);
    const unshardedFiles = validateResults(unshardedJson, 'unsharded baseline');
    const unshardedMap = coverageMap(unshardedCoverage, 'unsharded baseline');

    const artifacts = path.join(temp, 'artifacts');
    const blobDirectory = path.join(temp, 'blobs');
    fs.mkdirSync(artifacts);
    fs.mkdirSync(blobDirectory);
    const shardInventory = [];
    for (const shard of plan.shards) {
      const index = String(shard.index);
      const artifact = path.join(artifacts, `coverage-shard-${index}`);
      fs.mkdirSync(artifact);
      const blob = path.join(artifact, 'blob.json');
      const json = path.join(temp, `shard-${index}-results.json`);
      const coverage = path.join(temp, `shard-${index}-coverage`);
      const metadata = path.join(artifact, 'metadata.json');
      runNode([PLAN_BUILDER, '--plan', planFile, '--metadata-out', metadata, '--shard', index, '--sha', sha, '--run-id', runId, '--attempt', attempt], `write shard ${index} provenance`);
      runNpm(`actual queued shard entrypoint ${index}/${SHARD_COUNT}`, 'test:coverage', [
        ...TESTS, '--config', CONFIG, `--shard=${index}/${SHARD_COUNT}`, ...coverageArgs(coverage, { zeroThresholds: true }),
        '--reporter=blob', '--reporter=json', `--outputFile.blob=${blob}`, `--outputFile.json=${json}`,
      ], env);
      shardInventory.push(...validateReport(json, plan, shard.index));
      if (!fs.existsSync(blob)) throw new Error(`shard ${index} did not produce a blob report`);
    }
    if (shardInventory.length !== TESTS.length || new Set(shardInventory).size !== TESTS.length || TESTS.some((file) => !shardInventory.includes(file))) {
      throw new Error(`shard partition mismatch; received ${shardInventory.join(', ')}`);
    }

    runNode([PLAN_BUILDER, '--plan', planFile, '--stage-blobs', '--artifacts', artifacts, '--blob-dir', blobDirectory, '--sha', sha, '--run-id', runId, '--attempt', attempt], 'stage same-run provenance-verified blobs');
    const mergedJson = path.join(temp, 'merged-results.json');
    const mergedCoverage = path.join(temp, 'merged-coverage');
    runNpm('actual queued merge entrypoint with the pilot config', 'test:coverage:merge', [
      '--config', CONFIG, `--merge-reports=${blobDirectory}`, '--coverage', ...coverageArgs(mergedCoverage, { zeroThresholds: true }),
      '--reporter=json', `--outputFile.json=${mergedJson}`,
    ], env);
    const mergedFiles = validateResults(mergedJson, 'merged reports');
    const mergedMap = coverageMap(mergedCoverage, 'merged reports');
    if (JSON.stringify(canonical(unshardedMap)) !== JSON.stringify(canonical(mergedMap))) {
      throw new Error('merged coverage attribution/count maps differ from the unsharded baseline');
    }
    if (JSON.stringify([...mergedFiles].sort()) !== JSON.stringify([...unshardedFiles].sort())) throw new Error('merged test file inventory differs from unsharded baseline');
    process.stdout.write(`${JSON.stringify({ schemaVersion: 2, mode: 'bounded-real-pilot-config-probe', sha, testFiles: TESTS, sourceFiles: SOURCES, unshardedFiles: unshardedFiles.length, mergedFiles: mergedFiles.length, shardPartition: shardInventory.length, provenanceVerified: true, sourceAttributionAndCountsMatch: true, productionInventoryAndThresholdsChanged: false }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`[coverage-probe] ${error.message}\n[coverage-probe] Diagnostic files retained at ${temp}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { coverageArgs, coverageMap, validateResults };
