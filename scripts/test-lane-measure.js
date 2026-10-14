#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const manifest = require('./test-lanes.json');
const args = process.argv.slice(2);
const arg = (name) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const ledger = arg('--ledger') || process.env.VECTURA_LANE_METRICS_FILE || path.join(os.tmpdir(), 'vectura-test-lane-metrics.jsonl');
let rows;
try { rows = fs.readFileSync(ledger, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); }
catch (error) { process.stderr.write(`[test-lane-measure] Cannot read evidence ledger ${ledger}: ${error.message}\n`); process.exit(2); }
const recordedMinutes = (key) => {
  const measured = rows.filter((row) => typeof row[key] === 'number' && Number.isFinite(row[key]));
  return measured.length ? Number((measured.reduce((total, row) => total + row[key], 0) / 60000).toFixed(2)) : null;
};
const groups = new Map();
for (const row of rows) {
  if (!Number.isFinite(Number(row.durationMs)) || Number(row.durationMs) <= 0) continue;
  const classes = Array.isArray(row.classes) && row.classes.length ? row.classes : [row.riskClass || row.risk || 'unclassified'];
  const coldClass = row.coldClass || 'unspecified';
  for (const risk of classes) {
    const key = `${row.lane || 'unknown'}:${risk}:${coldClass}`;
    const list = groups.get(key) || [];
    list.push(Number(row.durationMs)); groups.set(key, list);
  }
}
const telemetry = [...groups].map(([group, values]) => {
  values.sort((a, b) => a - b);
  const enough = values.length >= 30;
  return { group, samples: values.length, p95Seconds: enough ? Math.ceil(values[Math.ceil(values.length * .95) - 1] / 1000) : null, p95Status: enough ? 'empirical' : 'suppressed: requires 30 comparable observations', uncertainty: 'Descriptive sample percentile, not a confidence interval or guarantee of future latency.', exploratorySeconds: values.map((n) => Math.ceil(n / 1000)) };
});
process.stdout.write(`${JSON.stringify({ schemaVersion: 2, ledger, entries: rows.length, passed: rows.filter((row) => row.exitCode === 0 && !row.timedOut).length, totalRecordedLaneMinutes: recordedMinutes('durationMs'), totalQueueWaitMinutes: recordedMinutes('queueWaitMs'), totalSetupMinutes: recordedMinutes('setupMs'), scope: 'Recorded lanes only; complete hosted PR latency and total GitHub runner-minutes require all job timing records', telemetry }, null, 2)}\n`);

if (!args.includes('--promote')) process.exit(0);
const head = arg('--head');
if (!/^[0-9a-f]{40}$/i.test(head || '')) {
  process.stderr.write('[test-lane-measure] Promotion requires --head with the exact 40-character latest SHA.\n'); process.exit(2);
}
const legacyRoster = ['unit', 'integration', 'e2e-smoke', 'visual', 'perf', 'coverage', 'feedback'];
// Schema 3 is historical evidence for the roster before conditional 2-shard CI.
// Keep its contract frozen so old rows remain readable after the current roster changes.
const schemaThreeRoster = {
  expectedJobs: ['unit', 'integration', 'e2e-smoke', 'visual', 'perf', 'coverage', 'feedback'],
  compatibilityJobs: ['unit', 'integration', 'visual'],
  owners: {
    unit: 'coverage (compatibility check name)',
    integration: 'coverage (compatibility check name)',
    'e2e-smoke': 'tests/e2e smoke projects',
    visual: 'coverage (compatibility check name; scheduled visual suite remains independent)',
    perf: 'un-instrumented tests/perf suite',
    coverage: 'all tests/**/*.test.js and global coverage thresholds',
    feedback: 'feedback Vitest/browser journey and Node process lifecycle tests',
  },
};
const rosters = new Map([
  [2, legacyRoster],
  [3, schemaThreeRoster.expectedJobs],
  [manifest.ciRoster.schemaVersion, manifest.ciRoster.expectedJobs],
]);
const knownClasses = new Set([...manifest.rules.map((rule) => rule.id), 'unknown']);
const sameSet = (left, right) => {
  if (!Array.isArray(left) || left.length !== right.length || new Set(left).size !== left.length) return false;
  const expected = [...right].sort();
  return [...left].sort().every((value, index) => value === expected[index]);
};
const valid = (row) => {
  if (!row || !rosters.has(row.schemaVersion) || !/^[0-9a-f]{40}$/i.test(row.sha || '') || row.source !== 'github-actions' ||
      typeof row.runId !== 'string' || !row.runId || !Number.isInteger(row.runNumber) || row.runNumber <= 0 ||
      typeof row.collectedAt !== 'string' || !Number.isFinite(Date.parse(row.collectedAt)) || !row.provenance ||
      row.provenance.workflow !== 'Tests' || typeof row.provenance.event !== 'string' ||
      !Number.isInteger(row.provenance.attempt) || row.provenance.attempt <= 0 ||
      !sameSet(row.expectedJobs, rosters.get(row.schemaVersion)) || !Array.isArray(row.classes) ||
      new Set(row.classes).size !== row.classes.length || !row.classes.every((name) => knownClasses.has(name)) || !rosters.get(row.schemaVersion).includes(row.job) ||
      !['success', 'failure', 'cancelled', 'skipped', 'missing'].includes(row.result) ||
      row.complete !== true || typeof row.latestHead !== 'boolean') return false;
  if (row.schemaVersion === 3 &&
      (!sameSet(row.compatibilityJobs, schemaThreeRoster.compatibilityJobs) || row.owner !== schemaThreeRoster.owners[row.job])) return false;
  if (row.schemaVersion === manifest.ciRoster.schemaVersion &&
      (!sameSet(row.compatibilityJobs, manifest.ciRoster.compatibilityJobs) || row.owner !== manifest.ciRoster.owners[row.job])) return false;
  return true;
};
const promotionRows = rows.filter((row) => row && (row.source === 'github-actions' || row.source === 'expected-roster' || row.job));
const malformed = promotionRows.filter((row) => !valid(row));
const bySha = new Map();
for (const row of rows.filter(valid)) {
  const set = bySha.get(row.sha) || [];
  set.push(row); bySha.set(row.sha, set);
}
const green = (entries) => {
  if (!entries) return false;
  const jobs = new Map();
  const runIds = new Set(entries.map((r) => r.runId));
  const runNumbers = new Set(entries.map((r) => r.runNumber));
  const attempts = new Set(entries.map((r) => r.provenance.attempt));
  const schemas = new Set(entries.map((r) => r.schemaVersion));
  const classSets = new Set(entries.map((r) => JSON.stringify([...r.classes].sort())));
  if (runIds.size !== 1 || runNumbers.size !== 1 || attempts.size !== 1 || schemas.size !== 1 || classSets.size !== 1) return false;
  for (const row of entries) {
    if (jobs.has(row.job) || row.complete !== true) return false;
    jobs.set(row.job, row);
  }
  const expectedJobs = rosters.get(entries[0].schemaVersion);
  return expectedJobs.every((job) => jobs.has(job) && jobs.get(job).result === 'success');
};
const heads = [...bySha].map(([sha, entries]) => ({ sha, entries, green: green(entries), runNumber: Math.max(...entries.map((row) => row.runNumber)), attempt: Math.max(...entries.map((row) => Number(row.provenance.attempt))) })).sort((a, b) => a.runNumber - b.runNumber || a.attempt - b.attempt);
const duplicateRunNumbers = new Set(heads.filter((head, index) => heads.some((other, otherIndex) => otherIndex !== index && other.runNumber === head.runNumber)).map((head) => head.runNumber));
const target = bySha.get(head);
const failures = [];
if (malformed.length) failures.push(`${malformed.length} row(s) lack valid GitHub workflow provenance or roster metadata`);
if (duplicateRunNumbers.size) failures.push(`conflicting SHAs share run number(s): ${[...duplicateRunNumbers].join(', ')}`);
if (!target || !green(target)) failures.push(`no complete, unique, green retained-job roster for exact head ${head}`);
const targetIndex = heads.findIndex((entry) => entry.sha === head);
if (targetIndex < 0 || targetIndex !== heads.length - 1) failures.push(`requested head ${head} is not the latest recorded run`);
else if (!target.every((row) => row.latestHead === true)) failures.push(`head ${head} is not marked as the latest head for its run`);
else if (!target.some((row) => row.job === 'coverage' && row.result === 'success' && row.complete === true)) failures.push(`no successful full-scope coverage component at ${head}`);
const streak = [];
for (let i = targetIndex; i >= 0 && heads[i].green && heads[i].entries.every((row) => row.schemaVersion === manifest.ciRoster.schemaVersion); i -= 1) streak.unshift(heads[i]);
if (streak.length < manifest.promotion.requiredConsecutiveGreenRuns) failures.push(`needs ${manifest.promotion.requiredConsecutiveGreenRuns} consecutive complete green SHAs ending at latest head; found ${streak.length}`);
const representatives = new Set(streak.flatMap((entry) => entry.entries.flatMap((row) => row.classes)));
const missingClasses = manifest.promotion.requireRepresentatives.filter((name) => !representatives.has(name));
if (missingClasses.length) failures.push(`missing representative classes in the terminal green streak: ${missingClasses.join(', ')}`);
if (failures.length) { process.stderr.write(`[test-lane-measure] Promotion denied; default full gates stay active: ${failures.join('; ')}.\n`); process.exitCode = 1; }
else process.stdout.write(`[test-lane-measure] Complete promotion evidence ending at ${head}; reviewer may consider a branch-rule transition.\n`);
