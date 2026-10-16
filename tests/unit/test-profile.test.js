import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildProfile, inspectJsonResults, ownerOf, parseDurationLog } = require('../../scripts/test-profile.js');
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('saved Vitest timing profile', () => {
  it('parses ANSI output, seconds, milliseconds, and Vitest test counts', () => {
    const entries = parseDurationLog([
      '\u001b[32m✓\u001b[39m tests/unit/slow.test.js (8 tests) 1.25s',
      ' ✓ tests/integration/panel.test.js (2 tests) 85ms',
      'Test Files 2 passed (2)',
    ].join('\n'));

    expect(entries.map(({ file, durationMs }) => [file, durationMs])).toEqual([
      ['tests/unit/slow.test.js', 1250],
      ['tests/integration/panel.test.js', 85],
    ]);
  });

  it('compares logged ownership with the checked-out Vitest file inventory and ranks duration shares', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vectura-test-profile-'));
    roots.push(root);
    for (const file of ['unit/a.test.js', 'unit/b.test.js', 'integration/c.test.js', 'e2e/direct.test.js', 'e2e/nested/also.test.js', 'process/lifecycle.test.cjs']) {
      const fullPath = path.join(root, 'tests', file);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, '');
    }

    const profile = buildProfile({
      root,
      sha: 'a'.repeat(40),
      logText: '✓ tests/unit/a.test.js (1 test) 2s\n✓ tests/integration/c.test.js (1 test) 1s\n',
    });

    expect(profile.sha).toBe('a'.repeat(40));
    expect(profile.inventory.total).toBe(3);
    expect(profile.inventory.ownership).toEqual({ unit: 2, integration: 1 });
    expect(profile.inventory.missing).toEqual(['tests/unit/b.test.js']);
    expect(profile.inventory.duplicateTimingRecords).toBe(0);
    expect(profile.timings.topFiles[0]).toMatchObject({ file: 'tests/unit/a.test.js', durationMs: 2000, sharePercent: 66.67 });
    expect(profile.timings.fileTimings.map(({ file }) => file)).not.toContain('tests/e2e/direct.test.js');
    expect(profile.timings.fileTimings.map(({ file }) => file)).not.toContain('tests/e2e/nested/also.test.js');
    expect(ownerOf('tests/process/lifecycle.test.cjs')).toBe('other');
  });

  it('retains per-file timing weights from JSON reports when merge output has no console timings', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vectura-profile-json-'));
    roots.push(root);
    const files = ['tests/unit/a.test.js', 'tests/unit/b.test.js'];
    for (const file of files) {
      const fullPath = path.join(root, file);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, '');
    }
    const profile = buildProfile({
      root,
      logText: '',
      results: { testResults: files.map((file, index) => ({ name: path.join(root, file), startTime: 1000, endTime: 1000 + (index + 1) * 1250 })) },
    });
    expect(profile.timings.fileTimings).toEqual([
      { file: 'tests/unit/a.test.js', owner: 'unit', durationMs: 1250 },
      { file: 'tests/unit/b.test.js', owner: 'unit', durationMs: 2500 },
    ]);
  });

  it('records an explicit end-to-end workflow timing scope from an external start marker', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vectura-profile-workflow-time-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'tests', 'unit'), { recursive: true });
    fs.writeFileSync(path.join(root, 'tests', 'unit', 'a.test.js'), '');
    const profile = buildProfile({
      root,
      logText: '✓ tests/unit/a.test.js (1 test) 2ms',
      executionStartMs: 1_000,
      executionScope: 'coverage-orchestration-critical-path',
      nowMs: 5_250,
    });

    expect(profile.runtime).toMatchObject({
      executionMs: 4_250,
      executionScope: 'coverage-orchestration-critical-path',
    });
  });

  it('fails strict inventory on missing, duplicate, unexpected, failed, or changed skip results', () => {
    const inventory = ['tests/unit/a.test.js', 'tests/unit/b.test.js'];
    const testInventory = { expectedSkippedAssertions: 1, fullySkippedFiles: { 'tests/unit/b.test.js': 1 } };
    const passing = (name, status = 'passed') => ({ name, status, assertionResults: [{ status: status === 'passed' ? 'passed' : 'skipped' }] });
    const report = (testResults) => inspectJsonResults({ success: true, testResults }, { root: '/repo', inventory, testInventory });
    expect(report([passing('/repo/tests/unit/a.test.js'), passing('/repo/tests/unit/b.test.js', 'skipped')]).passed).toBe(true);
    expect(report([passing('/repo/tests/unit/a.test.js')]).failures.join(' ')).toContain('missing inventoried');
    expect(report([passing('/repo/tests/unit/a.test.js'), passing('/repo/tests/unit/a.test.js'), passing('/repo/tests/unit/b.test.js', 'skipped')]).failures.join(' ')).toContain('duplicate file results');
    expect(report([passing('/repo/tests/unit/a.test.js'), passing('/repo/tests/unit/b.test.js', 'skipped'), passing('/repo/tests/other.test.js')]).failures.join(' ')).toContain('outside checked-out inventory');
    expect(report([passing('/repo/tests/unit/a.test.js'), { ...passing('/repo/tests/unit/b.test.js'), status: 'failed' }]).passed).toBe(false);
    const changedSkipBaseline = report([passing('/repo/tests/unit/a.test.js'), passing('/repo/tests/unit/b.test.js')]);
    expect(changedSkipBaseline.failures).toContain('expected 1 skipped assertions, received 0');
    expect(changedSkipBaseline.failures).toContain('fully skipped test files/counts differ from the approved inventory');
  });

  it('pins the current 57-skip baseline and the known five-test full skip', () => {
    const policy = JSON.parse(fs.readFileSync(path.resolve('scripts/test-lanes.json'), 'utf8')).ciRoster.testInventory;
    const inventory = ['tests/unit/other.test.js', 'tests/unit/scene3d-cross-frame.test.js'];
    const skipped = (count) => Array.from({ length: count }, () => ({ status: 'skipped' }));
    const results = {
      success: true,
      testResults: [
        { name: '/repo/tests/unit/other.test.js', status: 'passed', assertionResults: [...skipped(52), { status: 'passed' }] },
        { name: '/repo/tests/unit/scene3d-cross-frame.test.js', status: 'skipped', assertionResults: skipped(5) },
      ],
    };
    expect(policy.expectedSkippedAssertions).toBe(57);
    expect(inspectJsonResults(results, { root: '/repo', inventory, testInventory: policy }).passed).toBe(true);
    // Removing the only passed assertion makes this an unapproved fully skipped file.
    results.testResults[0].assertionResults.pop();
    expect(inspectJsonResults(results, { root: '/repo', inventory, testInventory: policy }).failures).toContain('fully skipped test files/counts differ from the approved inventory');
  });

  it('supports strict JSON-only profiling and rejects invocation with neither input', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vectura-profile-cli-'));
    roots.push(root);
    const files = ['tests/unit/other.test.js', 'tests/unit/scene3d-cross-frame.test.js'];
    for (const file of files) {
      const target = path.join(root, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, '');
    }
    const skipped = (count) => Array.from({ length: count }, () => ({ status: 'skipped' }));
    const results = {
      success: true,
      testResults: [
        { name: path.join(root, files[0]), status: 'passed', startTime: 10, endTime: 210, assertionResults: [...skipped(52), { status: 'passed' }] },
        { name: path.join(root, files[1]), status: 'passed', startTime: 20, endTime: 320, assertionResults: skipped(5) },
      ],
    };
    const resultsPath = path.join(root, 'results.json');
    const outputPath = path.join(root, 'profile.json');
    fs.writeFileSync(resultsPath, JSON.stringify(results));
    const script = path.resolve('scripts/test-profile.js');
    const jsonOnly = spawnSync(process.execPath, [script, '--results', resultsPath, '--root', root, '--strict', '--output', outputPath], { encoding: 'utf8' });
    expect(jsonOnly.status, jsonOnly.stderr).toBe(0);
    const profile = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(profile.inventory.strict.passed).toBe(true);
    expect(profile.timings.fileTimings.map(({ durationMs }) => durationMs)).toEqual([200, 300]);

    const missingInputs = spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' });
    expect(missingInputs.status).toBe(2);
    expect(missingInputs.stderr).toContain('Usage:');
  });
});
