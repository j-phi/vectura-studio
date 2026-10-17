#!/usr/bin/env node
'use strict';
// Refresh scripts/test-shard-weights.json from Vitest blob reports of coverage shards.
// Usage: node scripts/test-shard-weights-refresh.js --blobs <dir> [--blobs <dir2> ...] [--run-ids a,b] [--write]
// Each dir holds coverage-shard-N/blob.json (download: gh run download <id> -p 'coverage-shard-[0-9]*' -D <dir>).
const fs = require('fs');
const path = require('path');

const WEIGHTS_PATH = path.join(__dirname, 'test-shard-weights.json');

// Hook-inclusive per-file cost in seconds. result.duration alone omits beforeAll time.
function fileSeconds(file) {
  const ms = (file.result?.duration || 0) + (file.collectDuration || 0) + (file.setupDuration || 0)
    + (file.environmentLoad || 0) + (file.prepareDuration || 0);
  return Math.round(ms) / 1000;
}

function relativeTestPath(filepath) {
  const parts = String(filepath).replace(/\\/g, '/').split('/tests/');
  return parts.length > 1 ? `tests/${parts.slice(1).join('/tests/')}` : null;
}

// One run directory -> { 'tests/x.test.js': seconds }
function readBlobDir(dir) {
  const { parse } = require('flatted');
  const out = {};
  for (const name of fs.readdirSync(dir).sort()) {
    const blob = path.join(dir, name, 'blob.json');
    if (!/^coverage-shard-\d+$/.test(name) || !fs.existsSync(blob)) continue;
    for (const file of parse(fs.readFileSync(blob, 'utf8'))[1]) {
      const rel = relativeTestPath(file.filepath);
      if (rel) out[rel] = (out[rel] || 0) + fileSeconds(file);
    }
  }
  return out;
}

function round3(value) { return Math.round(value * 1000) / 1000; }

function buildWeights({ runs, inventory, previous, runIds = [] }) {
  const prev = previous || {};
  const prevWeights = prev.weightsSeconds || {};
  const weights = {};
  for (const file of inventory) {
    const samples = runs.map((run) => run[file]).filter((v) => Number.isFinite(v));
    if (samples.length) weights[file] = round3(samples.reduce((a, b) => a + b, 0) / samples.length);
    else if (Number.isFinite(prevWeights[file])) weights[file] = prevWeights[file];
  }
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  const label = runIds.length ? `runs ${runIds.join(', ')}` : `${runs.length} run(s)`;
  return {
    schemaVersion: prev.schemaVersion || 1,
    source: {
      description: `Hosted V8 coverage per-file durations from Vitest blob reports (file result.duration incl. hooks + collect/setup/env/prepare): mean of ${label}`,
      fileCount: Object.keys(weights).length,
      fileDurationSumSeconds: Math.round(sum),
      // scripts/test-shard-plan.js derives the weight of an unmeasured file at plan time.
      unweightedFilePolicy: 'median of measured files in the same tests/<dir>/, else the global median',
    },
    weightsSeconds: weights,
  };
}

function parseArgs(argv) {
  const args = { blobs: [], runIds: [], write: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--blobs') args.blobs.push(argv[++i]);
    else if (argv[i] === '--run-ids') args.runIds.push(...String(argv[++i]).split(',').filter(Boolean));
    else if (argv[i] === '--write') args.write = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!args.blobs.length) throw new Error('At least one --blobs <dir> is required');
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  const { inventoryTests } = require('./test-shard-plan.js');
  const previous = JSON.parse(fs.readFileSync(WEIGHTS_PATH, 'utf8'));
  const runs = args.blobs.map(readBlobDir);
  // Every Vitest file, not just the coverage roster: files that ran outside the coverage shards
  // (tests/audit, tests/perf) keep their previous weight; the audit job splits by those weights.
  const next = buildWeights({ runs, inventory: inventoryTests(undefined, [], ['tests/e2e']), previous, runIds: args.runIds });
  const old = previous.weightsSeconds || {};
  const changed = Object.keys(next.weightsSeconds).filter((f) => old[f] !== next.weightsSeconds[f]).length;
  const top = Object.entries(next.weightsSeconds).sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log(`files: ${next.source.fileCount}  sum: ${next.source.fileDurationSumSeconds}s  changed: ${changed}  runs: ${runs.length}`);
  console.log('top files:');
  for (const [file, sec] of top) console.log(`  ${sec.toFixed(1).padStart(7)}s  ${file}`);
  if (args.write) {
    fs.writeFileSync(WEIGHTS_PATH, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`wrote ${path.relative(process.cwd(), WEIGHTS_PATH)}`);
  } else console.log('dry run (pass --write to update)');
}

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exit(1); }
}

module.exports = { buildWeights, fileSeconds, readBlobDir, relativeTestPath };
