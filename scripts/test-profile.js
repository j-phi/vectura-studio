#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const FILE_DURATION = /(?:^|[\s✓✗❯])((?:\.\/)?tests\/[^\s]+\.test\.js)(?:\s+\([^\r\n)]*\))?\s+(\d+(?:\.\d+)?)\s*(ms|s)\s*$/;

function parseDurationLog(logText) {
  const entries = [];
  for (const [lineNumber, rawLine] of String(logText).split(/\r?\n/).entries()) {
    const line = rawLine.replace(ANSI, '').trim();
    const match = line.match(FILE_DURATION);
    if (!match) continue;
    const duration = Number(match[2]);
    if (!Number.isFinite(duration)) continue;
    entries.push({
      file: match[1].replace(/^\.\//, ''),
      durationMs: Math.round(duration * (match[3] === 's' ? 1000 : 1)),
      line: lineNumber + 1,
    });
  }
  return entries;
}

function walkTests(directory, root, files = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    const relative = path.relative(root, fullPath);
    if (entry.isDirectory() && relative !== path.join('tests', 'e2e') && !relative.startsWith(path.join('tests', 'e2e') + path.sep)) walkTests(fullPath, root, files);
    else if (entry.isFile() && entry.name.endsWith('.test.js')) files.push(path.relative(root, fullPath).split(path.sep).join('/'));
  }
  return files;
}

function ownerOf(file) {
  const folder = file.split('/')[1];
  return ['unit', 'integration', 'visual', 'perf', 'audit'].includes(folder) ? folder : 'other';
}

function normalizeResultPath(file, root) {
  const resolved = path.isAbsolute(file) ? path.relative(root, file) : file;
  return resolved.split(path.sep).join('/').replace(/^\.\//, '');
}

function inspectJsonResults(results, { root = process.cwd(), inventory, testInventory }) {
  const failures = [];
  if (!results || !Array.isArray(results.testResults)) {
    return { passed: false, failures: ['JSON reporter output has no testResults array'], reported: [], skippedAssertions: 0, fullySkippedFiles: {} };
  }
  const expected = new Set(inventory);
  const reported = [];
  let skippedAssertions = 0;
  const fullySkippedFiles = {};
  for (const fileResult of results.testResults) {
    if (!fileResult || typeof fileResult.name !== 'string') {
      failures.push('JSON reporter contains a test result without a file name');
      continue;
    }
    const file = normalizeResultPath(fileResult.name, root);
    reported.push(file);
    const assertions = Array.isArray(fileResult.assertionResults) ? fileResult.assertionResults : [];
    if (!assertions.length) failures.push(`no assertions reported for ${file}`);
    const skipped = assertions.filter((assertion) => assertion.status === 'skipped').length;
    skippedAssertions += skipped;
    if (skipped === assertions.length && skipped > 0) fullySkippedFiles[file] = skipped;
    if (!expected.has(file)) failures.push(`result outside checked-out inventory: ${file}`);
    const allowedFullySkipped = Object.hasOwn(testInventory.fullySkippedFiles || {}, file) && skipped === testInventory.fullySkippedFiles[file];
    if (fileResult.status !== 'passed' && !(fileResult.status === 'skipped' && allowedFullySkipped)) failures.push(`test file did not pass: ${file} (${fileResult.status || 'unknown'})`);
    const unexpected = assertions.filter((assertion) => !['passed', 'skipped'].includes(assertion.status));
    if (unexpected.length) failures.push(`non-pass/non-skip assertion status in ${file}`);
  }
  const counts = new Map();
  for (const file of reported) counts.set(file, (counts.get(file) || 0) + 1);
  const duplicates = [...counts].filter(([, count]) => count !== 1).map(([file]) => file);
  if (duplicates.length) failures.push(`duplicate file results: ${duplicates.join(', ')}`);
  const missing = inventory.filter((file) => !counts.has(file));
  if (missing.length) failures.push(`missing inventoried test files: ${missing.join(', ')}`);
  if (skippedAssertions !== testInventory.expectedSkippedAssertions) {
    failures.push(`expected ${testInventory.expectedSkippedAssertions} skipped assertions, received ${skippedAssertions}`);
  }
  const expectedFullSkips = testInventory.fullySkippedFiles || {};
  if (JSON.stringify(Object.fromEntries(Object.entries(fullySkippedFiles).sort())) !== JSON.stringify(Object.fromEntries(Object.entries(expectedFullSkips).sort()))) {
    failures.push('fully skipped test files/counts differ from the approved inventory');
  }
  if (results.success !== true) failures.push('JSON reporter marks the run unsuccessful');
  return { passed: failures.length === 0, failures, reported, skippedAssertions, fullySkippedFiles };
}

function buildProfile({ logText, results = null, strict = false, root = process.cwd(), sha = process.env.GITHUB_SHA || null, runner = null, workers = null, setupMs = null, executionMs = null }) {
  const inventory = walkTests(path.join(root, 'tests'), root).sort();
  const entries = parseDurationLog(logText);
  if (!entries.length && results && Array.isArray(results.testResults)) {
    for (const result of results.testResults) {
      if (typeof result.name !== 'string' || !Number.isFinite(result.startTime) || !Number.isFinite(result.endTime)) continue;
      entries.push({ file: normalizeResultPath(result.name, root), durationMs: Math.max(0, Math.round(result.endTime - result.startTime)), line: null });
    }
  }
  const expected = new Set(inventory);
  const reported = new Set(entries.map((entry) => entry.file));
  const ownership = {};
  for (const file of inventory) ownership[ownerOf(file)] = (ownership[ownerOf(file)] || 0) + 1;

  const totals = new Map();
  for (const entry of entries) totals.set(entry.file, (totals.get(entry.file) || 0) + entry.durationMs);
  const totalFileMs = entries.reduce((sum, entry) => sum + entry.durationMs, 0);
  const readVersion = (name) => {
    try { return require(require.resolve(`${name}/package.json`, { paths: [root] })).version; }
    catch { return null; }
  };
  let projectVersion = null;
  try { projectVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version || null; }
  catch {}
  const topFiles = [...totals].map(([file, durationMs]) => ({
    file,
    owner: ownerOf(file),
    durationMs,
    sharePercent: totalFileMs ? Number((durationMs / totalFileMs * 100).toFixed(2)) : 0,
  })).sort((a, b) => b.durationMs - a.durationMs || a.file.localeCompare(b.file)).slice(0, 20);
  const strictInventory = strict ? inspectJsonResults(results, { root, inventory, testInventory: require('./test-lanes.json').ciRoster.testInventory }) : null;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sha,
    runtime: {
      node: process.version,
      project: projectVersion,
      vitest: readVersion('vitest'),
      coverageV8: readVersion('@vitest/coverage-v8'),
      runner,
      workers: workers == null ? null : Number(workers),
      setupMs: setupMs == null ? null : Number(setupMs),
      executionMs: executionMs == null ? null : Number(executionMs),
    },
    source: 'Vitest ANSI per-file timings or JSON reporter file durations; file wall times overlap across workers',
    inventory: {
      total: inventory.length,
      ownership,
      reportedUnique: reported.size,
      missing: inventory.filter((file) => !reported.has(file)),
      outsideInventory: [...reported].filter((file) => !expected.has(file)).sort(),
      duplicateTimingRecords: entries.length - reported.size,
      strict: strictInventory,
    },
    timings: {
      records: entries.length,
      totalFileMs,
      topFiles,
      fileTimings: inventory.map((file) => ({ file, owner: ownerOf(file), durationMs: totals.has(file) ? totals.get(file) : null })),
    },
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function main() {
  const logPath = argument('--log');
  const resultsPath = argument('--results');
  if (!logPath && !resultsPath) {
    process.stderr.write('Usage: node scripts/test-profile.js [--log <saved-vitest-log>] [--results <vitest-json>] [--strict] [--root <repo>] [--output <json-path>]\n');
    process.exitCode = 2;
    return;
  }
  let profile;
  try {
    profile = buildProfile({
      logText: logPath ? fs.readFileSync(logPath, 'utf8') : '',
      results: resultsPath ? JSON.parse(fs.readFileSync(resultsPath, 'utf8')) : null,
      strict: process.argv.includes('--strict'),
      root: argument('--root') || process.cwd(),
      runner: argument('--runner') || null,
      workers: argument('--workers') || null,
      setupMs: argument('--setup-ms') || null,
      executionMs: argument('--execution-ms') || null,
    });
  } catch (error) {
    process.stderr.write(`[test-profile] Could not read profile inputs: ${error.message}\n`);
    process.exitCode = 2;
    return;
  }
  if (!profile.timings.records) {
    process.stderr.write('[test-profile] No per-file Vitest durations were recognized in the saved log.\n');
    process.exitCode = 2;
    return;
  }
  if (profile.inventory.strict && !profile.inventory.strict.passed) {
    process.stderr.write(`[test-profile] Strict CI inventory failed: ${profile.inventory.strict.failures.join('; ')}.\n`);
    process.exitCode = 1;
  }
  const json = `${JSON.stringify(profile, null, 2)}\n`;
  const outputPath = argument('--output');
  if (outputPath) {
    fs.writeFileSync(outputPath, json);
    process.stdout.write(`[test-profile] wrote ${outputPath}; ${profile.timings.records} timing record(s), ${profile.inventory.missing.length} inventoried file(s) missing from the log\n`);
  } else process.stdout.write(json);
}

if (require.main === module) main();

module.exports = { buildProfile, inspectJsonResults, ownerOf, parseDurationLog };
