import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { COVERAGE_EXCLUDED_DIRS, buildPlan, inventoryTests, planHash, unweightedFallback, validateReport } = require('../../scripts/test-shard-plan.js');
const weights = require('../../scripts/test-shard-weights.json');
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('deterministic coverage shard plan', () => {
  it('keeps the full-coverage check as a fail-closed N-shard merge gate with no plan hop', () => {
    const workflow = fs.readFileSync(path.resolve('.github/workflows/test.yml'), 'utf8');
    const job = (name) => workflow.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z0-9-]+:\\n|(?![\\s\\S]))`, 'm'))?.[1] || '';
    const coverage = job('coverage');
    const shard = job('coverage-shard');

    // ci-plan decides whether the heavy graph runs (PR, main push, nightly; R-19, R-20).
    const heavy = "needs.ci-plan.outputs.heavy == 'true'";
    for (const name of ['e2e-smoke', 'perf', 'coverage-shard']) {
      expect(job(name)).toContain(`if: ${heavy}`);
    }
    // R-8: no coverage-plan job. The static matrix lists exactly 1..COVERAGE_SHARD_COUNT.
    expect(job('coverage-plan')).toBe('');
    const count = Number(workflow.match(/^  COVERAGE_SHARD_COUNT: '?(\d+)'?$/m)?.[1]);
    // D-9: 12 shards after tests/audit left the roster (R-17).
    expect(count).toBe(12);
    const matrix = JSON.parse(shard.match(/^        shard: (\[[\d, ]+\])$/m)?.[1] || 'null');
    expect(matrix).toEqual(Array.from({ length: count }, (_, i) => i + 1));
    expect(shard).toContain('needs: [ci-plan]');
    expect(shard).toContain('--plan-out "$RUNNER_TEMP/coverage-shard-plan.json" --sha "$GITHUB_SHA" --shards "$COVERAGE_SHARD_COUNT"');
    expect(shard).toContain('--started-ms "$SHARD_STARTED_MS"');
    expect(shard).toContain('--shard="$SHARD_INDEX/$COVERAGE_SHARD_COUNT"');
    expect(shard).toContain('--config vitest.coverage-shard.config.mjs');
    expect(shard).toContain('--workers "$VECTURA_VITEST_MAX_WORKERS"');
    expect(coverage).toContain('pattern: coverage-shard-[0-9]*');
    expect(workflow).not.toMatch(/\$SHARD_INDEX\/2|shard: \[1, 2\]|coverage-shard-\[12\]|--shards 2|--workers 2/);
    expect(coverage).toContain(`if: always() && ${heavy}`);
    expect(coverage).toContain('needs: [ci-plan, coverage-shard]');
    expect(coverage).toContain('test "$SHARDS_RESULT" = success');
    // The merge job rebuilds the plan from the same inputs; stage-blobs rejects any other hash.
    const merge = coverage.slice(coverage.indexOf('- name: Rebuild the shard plan'));
    expect(merge.indexOf('--plan-out')).toBeLessThan(merge.indexOf('--stage-blobs'));
    expect(coverage).toContain('--env-out "$GITHUB_ENV"');
    expect(coverage).toContain('npm run test:coverage:merge');
    expect(coverage).toContain('--coverage.reporter=lcov');
    expect(coverage).toContain('--coverage.reporter=json');
    expect(coverage).toContain('--strict --log');
    expect(coverage).toContain('--execution-start-ms "$COVERAGE_CHAIN_STARTED_MS"');

    // R-19: the nightly reuses this graph; the single 85-108 min scheduled-audit job is gone.
    expect(job('scheduled-audit')).toBe('');
  });

  it('stages shard artifacts when the merge YAML block runs in bash, and rejects a foreign plan hash', () => {
    const workflow = fs.readFileSync(path.resolve('.github/workflows/test.yml'), 'utf8');
    const runBlock = workflow.match(/      - name: Rebuild the shard plan, verify each shard used it, and stage every Vitest blob file\n        run: \|\n((?:          .*\n?)+)/);
    expect(runBlock).not.toBeNull();
    const mergeScript = runBlock[1].replace(/^ {10}/gm, '').trimEnd();

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vectura-shard-workflow-'));
    roots.push(root);
    const sha = 'd'.repeat(40);
    const runId = 'fixture-run';
    const shardCount = 12;
    // The merge block rebuilds the real plan, so the fixture shards carry that same plan.
    const plan = buildPlan({ files: inventoryTests(), weights, sha, shardCount });
    const artifacts = path.join(root, 'coverage-shard-artifacts');
    const writeShards = (planHashValue) => {
      fs.rmSync(artifacts, { recursive: true, force: true });
      for (const shard of plan.shards) {
        const directory = path.join(artifacts, `coverage-shard-${shard.index}`);
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(path.join(directory, 'metadata.json'), JSON.stringify({
          schemaVersion: 1, sha, runId, attempt: 1, shard: shard.index, shardCount, planHash: planHashValue, expectedFiles: shard.files, startedMs: 1000 + shard.index,
        }));
        fs.writeFileSync(path.join(directory, 'blob.json'), '{}');
      }
      // The workflow download pattern excludes these; stage-blobs must tolerate them anyway.
      fs.mkdirSync(path.join(artifacts, 'coverage-shard-profile-1'), { recursive: true });
    };
    const githubEnv = path.join(root, 'github-env');
    const env = { ...process.env, RUNNER_TEMP: root, GITHUB_SHA: sha, GITHUB_RUN_ID: runId, GITHUB_RUN_ATTEMPT: '1', GITHUB_ENV: githubEnv, COVERAGE_SHARD_COUNT: String(shardCount) };
    const runMerge = () => spawnSync('bash', ['-c', mergeScript], { cwd: process.cwd(), encoding: 'utf8', env });

    writeShards(plan.hash);
    const result = runMerge();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`staged ${shardCount} provenance-verified blob reports`);
    expect(fs.readdirSync(path.join(root, 'vitest-blobs')).sort()).toEqual(plan.shards.map((shard) => `shard-${shard.index}.json`).sort());
    expect(fs.readFileSync(githubEnv, 'utf8')).toContain('COVERAGE_CHAIN_STARTED_MS=1001');

    writeShards('f'.repeat(64));
    expect(runMerge().status).not.toBe(0);

    writeShards(plan.hash);
    fs.rmSync(path.join(artifacts, 'coverage-shard-7'), { recursive: true });
    expect(runMerge().status).not.toBe(0);
  });

  it('keeps tests/perf, tests/audit and tests/e2e out of the coverage roster, in the plan and in Vitest', () => {
    const inventory = inventoryTests();
    expect(COVERAGE_EXCLUDED_DIRS).toEqual(['tests/e2e', 'tests/perf', 'tests/audit']);
    expect(inventory.some((f) => f.startsWith('tests/perf/'))).toBe(false);
    expect(inventory.some((f) => f.startsWith('tests/audit/'))).toBe(false);
    expect(fs.readdirSync(path.resolve('tests/audit')).some((f) => f.endsWith('.test.js'))).toBe(true);
    // The weights refresh keeps every Vitest file (the audit job splits by audit weights).
    const all = inventoryTests(undefined, [], ['tests/e2e']);
    expect(all.some((f) => f.startsWith('tests/audit/'))).toBe(true);
    expect(fs.readFileSync(path.resolve('scripts/test-shard-weights-refresh.js'), 'utf8')).toContain("inventoryTests(undefined, [], ['tests/e2e'])");
    expect(inventory.some((f) => f.startsWith('tests/e2e/'))).toBe(false);
    expect(fs.readdirSync(path.resolve('tests/perf')).some((f) => f.endsWith('.test.js'))).toBe(true);
    expect(inventory.some((f) => f.startsWith('tests/unit/'))).toBe(true);
    const config = fs.readFileSync(path.resolve('vitest.config.mjs'), 'utf8');
    expect(config).toContain("process.env.VECTURA_TEST_COVERAGE === '1' ? ['tests/perf/**', 'tests/audit/**'] : []");
    // Local full runs still run the audits, uninstrumented.
    const scripts = require('../../package.json').scripts;
    expect(scripts['test:audit:proofs']).toContain('run-vitest.js run tests/audit');
    for (const name of ['test:ci', 'test:audit']) expect(scripts[name], name).toContain('npm run test:audit:proofs');
  });

  it('balances known durations and gives an unweighted file its directory median', () => {
    const files = ['tests/unit/a.test.js', 'tests/unit/b.test.js', 'tests/unit/c.test.js', 'tests/unit/d.test.js', 'tests/unit/new.test.js', 'tests/audit/new.test.js', 'tests/visual/new.test.js'];
    const fakeWeights = {
      source: { description: 'fixture' },
      weightsSeconds: {
        'tests/unit/a.test.js': 12,
        'tests/unit/b.test.js': 10,
        'tests/unit/c.test.js': 8,
        'tests/unit/d.test.js': 6,
        'tests/audit/x.test.js': 100,
        'tests/audit/y.test.js': 60,
        'tests/audit/z.test.js': 80,
      },
    };
    const first = buildPlan({ files, weights: fakeWeights, sha: 'a'.repeat(40) });
    const second = buildPlan({ files: [...files].reverse(), weights: fakeWeights, sha: 'a'.repeat(40) });
    expect(first.hash).toBe(second.hash);
    expect(first.hash).toBe(planHash(first));
    // Median of tests/unit (6, 8, 10, 12) = 9; of tests/audit (60, 80, 100) = 80.
    expect(first.weightsSeconds['tests/unit/new.test.js']).toBe(9);
    expect(first.weightsSeconds['tests/audit/new.test.js']).toBe(80);
    // No measured file in tests/visual: the global median of all 7 weights.
    expect(first.weightsSeconds['tests/visual/new.test.js']).toBe(12);
    expect(first.unknownFileWeightSeconds).toBe(12);
    expect(first.unweightedFiles).toEqual(['tests/audit/new.test.js', 'tests/unit/new.test.js', 'tests/visual/new.test.js']);
    expect(first.shards.map((shard) => shard.files.length).reduce((sum, count) => sum + count, 0)).toBe(files.length);
    expect(first.shards[0].index).toBe(1);
    expect(first.shards[1].index).toBe(2);
    expect(unweightedFallback({}).global).toBe(1);
  });

  it('keeps the committed weights fresh: every roster file but a handful has a measured weight', () => {
    expect(weights.source.fileCount).toBeGreaterThan(700);
    expect(weights.source.unknownFileWeightSeconds).toBeUndefined();
    const unweighted = inventoryTests().filter((file) => !(weights.weightsSeconds[file] > 0));
    // A new file is fine until the next refresh (scripts/test-shard-weights-refresh.js); a
    // large gap means the weights are stale and the shards drift out of balance.
    expect(unweighted.length, unweighted.join('\n')).toBeLessThanOrEqual(25);
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

  it('plans 1..32 timing-balanced shards, rejects other counts, and covers every file exactly once', () => {
    const files = Array.from({ length: 40 }, (_, i) => `tests/unit/t${i}.test.js`);
    const fake = { source: { description: 'fixture', unknownFileWeightSeconds: 5 }, weightsSeconds: Object.fromEntries(files.map((f, i) => [f, 100 - i])) };
    const plan = buildPlan({ files, weights: fake, sha: 'e'.repeat(40), shardCount: 10 });
    expect(plan.shardCount).toBe(10);
    expect(plan.shards.map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(plan.shards.flatMap((s) => s.files).sort()).toEqual([...files].sort());
    const sums = plan.shards.map((s) => s.estimatedSeconds);
    expect(Math.max(...sums) - Math.min(...sums)).toBeLessThanOrEqual(100);
    expect(plan.hash).toBe(planHash(plan));
    expect(buildPlan({ files, weights: fake, sha: 'e'.repeat(40), shardCount: 32 }).shardCount).toBe(32);
    expect(buildPlan({ files, weights: fake, sha: 'e'.repeat(40), shardCount: 1 }).shards).toHaveLength(1);
    for (const bad of [0, 33, 2.5, NaN]) expect(() => buildPlan({ files, weights: fake, sha: 'e'.repeat(40), shardCount: bad })).toThrow(/between 1 and 32/);
  });

  it('keeps the vitest worker cap overridable by VECTURA_VITEST_MAX_WORKERS', () => {
    const config = fs.readFileSync(path.resolve('vitest.config.mjs'), 'utf8');
    expect(config).toContain('VECTURA_VITEST_MAX_WORKERS');
  });
});
