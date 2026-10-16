#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WEIGHTS_PATH = path.join(__dirname, 'test-shard-weights.json');
const FULLY_SKIPPED_FILES = require('./test-lanes.json').ciRoster.testInventory.fullySkippedFiles || {};
const MIN_SHARDS = 1;
const MAX_SHARDS = 32;
const DEFAULT_SHARD_COUNT = 2;
const slash = (value) => value.split(path.sep).join('/');

function inventoryTests(directory = path.join(ROOT, 'tests'), files = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    const relative = slash(path.relative(ROOT, full));
    if (entry.isDirectory()) {
      if (relative !== 'tests/e2e' && !relative.startsWith(`tests/e2e${path.sep}`)) inventoryTests(full, files);
    } else if (entry.isFile() && entry.name.endsWith('.test.js')) files.push(relative);
  }
  return files.sort();
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function planHash(plan) {
  const { hash: ignored, ...content } = plan;
  return crypto.createHash('sha256').update(stableJson(content)).digest('hex');
}

function buildPlan({ files, weights, sha, shardCount = DEFAULT_SHARD_COUNT }) {
  if (!/^[0-9a-f]{40}$/i.test(sha || '')) throw new Error('plan requires the exact 40-character workflow SHA');
  if (!Number.isInteger(shardCount) || shardCount < MIN_SHARDS || shardCount > MAX_SHARDS) throw new Error(`shard count must be an integer between ${MIN_SHARDS} and ${MAX_SHARDS}`);
  const normalized = [...new Set(files)].sort();
  if (normalized.length !== files.length || !normalized.length) throw new Error('test inventory must be nonempty and contain no duplicate paths');
  const rows = normalized.map((file) => {
    const raw = weights.weightsSeconds[file];
    const seconds = Number.isFinite(raw) && raw > 0 ? raw : weights.source.unknownFileWeightSeconds;
    return { file, seconds, weightSource: Number.isFinite(raw) && raw > 0 ? 'historical' : 'conservative-p95-default' };
  }).sort((a, b) => b.seconds - a.seconds || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  const shards = Array.from({ length: shardCount }, (_, index) => ({ index: index + 1, estimatedSeconds: 0, files: [] }));
  for (const row of rows) {
    shards.sort((a, b) => a.estimatedSeconds - b.estimatedSeconds || a.files.length - b.files.length || a.index - b.index);
    shards[0].files.push(row.file);
    shards[0].estimatedSeconds = Number((shards[0].estimatedSeconds + row.seconds).toFixed(3));
  }
  shards.sort((a, b) => a.index - b.index);
  for (const shard of shards) shard.files.sort();
  const plan = {
    schemaVersion: 1,
    sha: sha.toLowerCase(),
    shardCount,
    sourceProfile: weights.source.description,
    sourceWeightsSha256: crypto.createHash('sha256').update(fs.readFileSync(WEIGHTS_PATH)).digest('hex'),
    unknownFileWeightSeconds: weights.source.unknownFileWeightSeconds,
    weightsSeconds: Object.fromEntries(rows.map(({ file, seconds }) => [file, seconds])),
    inventory: normalized,
    shards,
  };
  plan.hash = planHash(plan);
  return plan;
}

function readPlan(file) {
  const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (plan.schemaVersion !== 1 || plan.hash !== planHash(plan)) throw new Error('shard plan schema/hash is invalid');
  return plan;
}

function normalizeReportFile(name) {
  const resolved = path.isAbsolute(name) ? path.relative(ROOT, name) : name;
  return slash(resolved).replace(/^\.\//, '');
}

function validateReport(reportPath, plan, shardIndex) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (report.success !== true || !Array.isArray(report.testResults)) throw new Error('Vitest JSON result is absent or unsuccessful');
  const expected = plan.shards[shardIndex - 1]?.files;
  if (!expected) throw new Error(`unknown shard index ${shardIndex}`);
  const actual = [];
  for (const result of report.testResults) {
    if (typeof result.name !== 'string') throw new Error('Vitest JSON result has a file without a name');
    const file = normalizeReportFile(result.name);
    actual.push(file);
    if (!Array.isArray(result.assertionResults) || !result.assertionResults.length || result.assertionResults.some((test) => !['passed', 'skipped'].includes(test.status))) {
      throw new Error(`${file} has no assertions or contains failed/todo assertions`);
    }
    const fullySkipped = result.assertionResults.every((test) => test.status === 'skipped');
    if (fullySkipped && (!Object.hasOwn(FULLY_SKIPPED_FILES, file) || result.assertionResults.length !== FULLY_SKIPPED_FILES[file])) {
      throw new Error(`${file} has an unapproved fully-skipped result or an unexpected assertion count`);
    }
    if (result.status === 'skipped') {
      if (!fullySkipped) throw new Error(`${file} is marked skipped but does not contain only skipped assertions`);
    } else if (result.status !== 'passed') {
      throw new Error(`${file} did not pass (${result.status || 'unknown'})`);
    }
  }
  const sorted = [...actual].sort();
  if (new Set(actual).size !== actual.length || stableJson(sorted) !== stableJson(expected)) {
    const missing = expected.filter((file) => !actual.includes(file));
    const extra = actual.filter((file) => !expected.includes(file));
    throw new Error(`shard ${shardIndex} report roster mismatch; missing=${missing.join(',')} extra=${extra.join(',')} duplicate=${actual.length - new Set(actual).size}`);
  }
  return actual;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const weights = JSON.parse(fs.readFileSync(WEIGHTS_PATH, 'utf8'));
    const planFile = args.plan || args['plan-out'];
    if (args['plan-out']) {
      const sha = args.sha || process.env.GITHUB_SHA;
      const plan = buildPlan({ files: inventoryTests(), weights, sha, shardCount: Number(args.shards || DEFAULT_SHARD_COUNT) });
      fs.writeFileSync(args['plan-out'], `${JSON.stringify(plan, null, 2)}\n`);
      process.stdout.write(JSON.stringify({ planHash: plan.hash, inventory: plan.inventory.length, shards: plan.shards.map(({ index, files, estimatedSeconds }) => ({ index, files: files.length, estimatedSeconds })), unknownWeightSeconds: plan.unknownFileWeightSeconds }) + '\n');
      return;
    }
    const plan = readPlan(planFile);
    if (args['verify-report']) {
      const shard = Number(args.shard);
      validateReport(args.report, plan, shard);
      process.stdout.write(`[shard-plan] shard ${shard} inventory verified (${plan.shards[shard - 1].files.length} files)\n`);
      return;
    }
    if (args['metadata-out']) {
      const shard = Number(args.shard);
      const sha = args.sha || process.env.GITHUB_SHA;
      const runId = args['run-id'] || process.env.GITHUB_RUN_ID;
      const attempt = Number(args.attempt || process.env.GITHUB_RUN_ATTEMPT);
      if (sha !== plan.sha || !runId || !Number.isInteger(attempt) || attempt < 1) throw new Error('metadata requires the plan SHA and exact GitHub run id/attempt');
      const metadata = { schemaVersion: 1, sha, runId, attempt, shard, shardCount: plan.shardCount, planHash: plan.hash, expectedFiles: plan.shards[shard - 1]?.files };
      if (!metadata.expectedFiles) throw new Error(`unknown shard index ${shard}`);
      fs.writeFileSync(args['metadata-out'], `${JSON.stringify(metadata, null, 2)}\n`);
      return;
    }
    if (args['stage-blobs']) {
      const artifacts = args.artifacts;
      const target = args['blob-dir'];
      const sha = args.sha || process.env.GITHUB_SHA;
      const runId = args['run-id'] || process.env.GITHUB_RUN_ID;
      const attempt = Number(args.attempt || process.env.GITHUB_RUN_ATTEMPT);
      if (plan.sha !== sha) throw new Error('generated shard plan SHA does not match this workflow attempt');
      fs.mkdirSync(target, { recursive: true });
      const staged = [];
      for (const shard of plan.shards) {
        const directory = path.join(artifacts, `coverage-shard-${shard.index}`);
        const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'metadata.json'), 'utf8'));
        const blob = path.join(directory, 'blob.json');
        if (metadata.schemaVersion !== 1 || metadata.sha !== sha || metadata.runId !== runId || metadata.attempt !== attempt || metadata.shard !== shard.index || metadata.shardCount !== plan.shardCount || metadata.planHash !== plan.hash || stableJson(metadata.expectedFiles) !== stableJson(shard.files)) {
          throw new Error(`shard ${shard.index} artifact provenance or planned roster does not match this workflow attempt`);
        }
        if (!fs.statSync(blob).isFile()) throw new Error(`shard ${shard.index} blob report is absent`);
        const destination = path.join(target, `shard-${shard.index}.json`);
        fs.copyFileSync(blob, destination);
        staged.push(destination);
      }
      const artifactNames = fs.readdirSync(artifacts).filter((name) => /^coverage-shard-\d+$/.test(name)).sort();
      if (artifactNames.length !== plan.shardCount || staged.length !== plan.shardCount) throw new Error(`expected exactly ${plan.shardCount} same-attempt shard artifacts`);
      process.stdout.write(`[shard-plan] staged ${staged.length} provenance-verified blob reports for ${sha}, run ${runId}, attempt ${attempt}\n`);
      return;
    }
    throw new Error('unsupported command; use --plan-out, --verify-report, --metadata-out, or --stage-blobs');
  } catch (error) {
    process.stderr.write(`[shard-plan] ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { MAX_SHARDS, MIN_SHARDS, buildPlan, inventoryTests, planHash, readPlan, validateReport };
