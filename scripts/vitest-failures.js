#!/usr/bin/env node
'use strict';

// Diagnostic only: print the failed files and assertions of a Vitest JSON result (CI shard
// jobs run it on failure). Never fails: a missing result is reported, not an error.
const fs = require('fs');

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.log('no Vitest JSON result');
  process.exit(0);
}
const report = JSON.parse(fs.readFileSync(file, 'utf8'));
for (const result of report.testResults || []) {
  const assertions = result.assertionResults || [];
  if (result.status === 'failed' && !assertions.some((a) => a.status === 'failed')) console.log(`FILE FAILED ${result.name}: ${(result.message || '').slice(0, 2000)}`);
  for (const a of assertions) if (a.status === 'failed') console.log(`FAILED ${result.name} > ${a.fullName}\n${(a.failureMessages || []).join('\n').slice(0, 2000)}`);
}
