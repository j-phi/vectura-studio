import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildPlan, planHash, validateReport } = require('../../scripts/test-shard-plan.js');
const weights = require('../../scripts/test-shard-weights.json');
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('deterministic coverage shard plan', () => {
  it('balances known durations and gives unprofiled files a conservative nonzero weight', () => {
    const files = ['tests/unit/a.test.js', 'tests/unit/b.test.js', 'tests/unit/c.test.js', 'tests/unit/d.test.js', 'tests/unit/new.test.js'];
    const fakeWeights = {
      source: { description: 'fixture', unknownFileWeightSeconds: 51.72 },
      weightsSeconds: {
        'tests/unit/a.test.js': 12,
        'tests/unit/b.test.js': 10,
        'tests/unit/c.test.js': 8,
        'tests/unit/d.test.js': 6,
      },
    };
    const first = buildPlan({ files, weights: fakeWeights, sha: 'a'.repeat(40) });
    const second = buildPlan({ files: [...files].reverse(), weights: fakeWeights, sha: 'a'.repeat(40) });
    expect(first.hash).toBe(second.hash);
    expect(first.hash).toBe(planHash(first));
    expect(first.weightsSeconds['tests/unit/new.test.js']).toBe(51.72);
    expect(first.shards.map((shard) => shard.files.length).reduce((sum, count) => sum + count, 0)).toBe(files.length);
    expect(Math.abs(first.shards[0].estimatedSeconds - first.shards[1].estimatedSeconds)).toBeLessThanOrEqual(51.72);
    expect(first.shards[0].index).toBe(1);
    expect(first.shards[1].index).toBe(2);
    expect(weights.source.fileCount).toBeGreaterThan(700);
  });

  it('accepts only the approved fully-skipped file with its exact assertion count', () => {
    const approved = 'tests/unit/scene3d-cross-frame.test.js';
    const unapproved = 'tests/unit/unapproved-skips.test.js';
    const planFor = (files) => buildPlan({
      files,
      weights: { source: { description: 'fixture', unknownFileWeightSeconds: 1 }, weightsSeconds: {} },
      sha: 'c'.repeat(40),
    });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vectura-shard-skips-'));
    roots.push(root);
    const check = (plan, testResults) => {
      const file = path.join(root, 'report.json');
      fs.writeFileSync(file, JSON.stringify({ success: true, testResults }));
      return () => validateReport(file, plan, 1);
    };
    const passed = (name) => ({ name: path.resolve(name), status: 'passed', assertionResults: [{ status: 'passed' }] });
    const skipped = (name, count) => ({ name: path.resolve(name), status: 'skipped', assertionResults: Array.from({ length: count }, () => ({ status: 'skipped' })) });
    const approvedPlan = planFor([approved]);
    expect(check(approvedPlan, [skipped(approved, 5)])).not.toThrow();
    expect(check(approvedPlan, [{ ...skipped(approved, 5), status: 'passed' }])).not.toThrow();
    expect(check(approvedPlan, [{ ...passed(approved), status: 'skipped' }])).toThrow(/does not contain only skipped assertions/);
    expect(check(approvedPlan, [skipped(approved, 4)])).toThrow(/unexpected assertion count/);
    expect(check(approvedPlan, [skipped(approved, 6)])).toThrow(/unexpected assertion count/);
    const unapprovedPlan = planFor([unapproved]);
    expect(check(unapprovedPlan, [skipped(unapproved, 5)])).toThrow(/unapproved fully-skipped/);
  });

  it('fails closed when a shard report omits, duplicates, or adds files', () => {
    const plan = buildPlan({
      files: ['tests/unit/a.test.js', 'tests/unit/b.test.js'],
      weights: { source: { description: 'fixture', unknownFileWeightSeconds: 1 }, weightsSeconds: {} },
      sha: 'b'.repeat(40),
    });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vectura-shard-plan-'));
    roots.push(root);
    const report = (testResults) => {
      const file = path.join(root, 'report.json');
      fs.writeFileSync(file, JSON.stringify({ success: true, testResults }));
      return () => validateReport(file, plan, 1);
    };
    const assigned = plan.shards[0].files;
    const passing = (name) => ({ name: path.resolve(name), status: 'passed', assertionResults: [{ status: 'passed' }] });
    expect(() => report(assigned.map(passing))()).not.toThrow();
    expect(report([])).toThrow(/roster mismatch/);
    expect(report([...assigned.map(passing), passing(assigned[0])])).toThrow(/roster mismatch/);
    expect(report([...assigned.map(passing), passing('tests/unit/extra.test.js')])).toThrow(/roster mismatch/);
  });
});
