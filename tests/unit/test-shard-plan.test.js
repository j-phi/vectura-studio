import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
  it('keeps the full-coverage check as a fail-closed N-shard merge gate', () => {
    const workflow = fs.readFileSync(path.resolve('.github/workflows/test.yml'), 'utf8');
    const job = (name) => workflow.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z0-9-]+:\\n|(?![\\s\\S]))`, 'm'))?.[1] || '';
    const coverage = job('coverage');
    const shard = job('coverage-shard');

    const prOrMainPush = 'github.event_name == \'pull_request\' || (github.event_name == \'push\' && github.ref == \'refs/heads/main\')';
    const alwaysPrOrMainPush = `always() && (${prOrMainPush})`;
    for (const name of ['lane-plan', 'feedback', 'e2e-smoke', 'perf', 'coverage-plan', 'coverage-shard']) {
      expect(job(name)).toContain(`if: ${prOrMainPush}`);
    }
    expect(job('coverage-plan')).toContain('started_ms=$(date +%s%3N)');
    expect(workflow).toMatch(/^  COVERAGE_SHARD_COUNT: '?14'?$/m);
    expect(job('coverage-plan')).toContain('shards: ${{ steps.count.outputs.shards }}');
    expect(job('coverage-plan')).toContain('--shards "$COVERAGE_SHARD_COUNT"');
    expect(shard).toContain('shard: ${{ fromJSON(needs.coverage-plan.outputs.shards) }}');
    expect(shard).toContain('--shard="$SHARD_INDEX/$SHARD_COUNT"');
    expect(shard).toContain('--workers "$VECTURA_VITEST_MAX_WORKERS"');
    expect(coverage).toContain('pattern: coverage-shard-[0-9]*');
    expect(workflow).not.toMatch(/\$SHARD_INDEX\/2|shard: \[1, 2\]|coverage-shard-\[12\]|--shards 2|--workers 2/);
    expect(coverage).toContain(`if: ${alwaysPrOrMainPush}`);
    expect(coverage).toContain('needs: [coverage-plan, coverage-shard]');
    expect(coverage).toContain('test "$GUARD_RESULT" = success');
    expect(coverage).toContain('test "$SHARDS_RESULT" = success');
    expect(coverage).toContain('npm run test:coverage:merge');
    expect(coverage).toContain('--coverage.reporter=lcov');
    expect(coverage).toContain('--coverage.reporter=json');
    expect(coverage).toContain('--strict --log');
    expect(coverage).toContain('--execution-start-ms "$COVERAGE_CHAIN_STARTED_MS"');

    for (const alias of ['unit', 'integration', 'e2e-smoke', 'visual', 'perf', 'feedback', 'lane-gate']) {
      expect(job(alias), `missing compatibility or required job ${alias}`).not.toBe('');
    }
    for (const alias of ['unit', 'integration']) {
      expect(job(alias)).toContain(`if: ${alwaysPrOrMainPush}`);
      expect(job(alias)).toContain('needs: [coverage]');
      expect(job(alias)).toContain('test "$COVERAGE_RESULT" = success');
    }
    expect(job('visual')).toContain(`if: ${alwaysPrOrMainPush}`);
    expect(job('visual')).toContain('needs: [coverage]');
    expect(job('lane-gate')).toContain('coverage');
    expect(job('lane-gate')).toContain(`if: ${alwaysPrOrMainPush}`);

    const shouldRunRegularGraph = ({ event, ref }) => event === 'pull_request' || (event === 'push' && ref === 'refs/heads/main');
    expect([
      shouldRunRegularGraph({ event: 'pull_request', ref: 'refs/pull/97/merge' }),
      shouldRunRegularGraph({ event: 'push', ref: 'refs/heads/main' }),
      shouldRunRegularGraph({ event: 'push', ref: 'refs/heads/feature' }),
      shouldRunRegularGraph({ event: 'schedule', ref: 'refs/heads/main' }),
    ]).toEqual([true, true, false, false]);
    expect(job('scheduled-audit')).toContain('if: github.event_name == \'schedule\'');
    const scheduledSteps = job('scheduled-audit');
    expect(scheduledSteps.indexOf('run: npm run test:audit')).toBeLessThan(scheduledSteps.indexOf('run: npm run test:visual'));
    expect(scheduledSteps.indexOf('run: npm run test:visual')).toBeLessThan(scheduledSteps.indexOf('run: npm run test:perf'));
    expect(scheduledSteps.match(/if: always\(\) && steps\.dependencies\.outcome == 'success'/g)).toHaveLength(2);
  });

  it('stages pilot artifacts when the YAML literal block runs in bash', () => {
    const workflow = fs.readFileSync(path.resolve('.github/workflows/test-shard-pilot.yml'), 'utf8');
    const runBlock = workflow.match(/      - name: Verify provenance and stage every Vitest blob file\n        run: \|\n((?:          .*\n?)+)/);
    expect(runBlock).not.toBeNull();
    const mergeScript = runBlock[1].replace(/^ {10}/gm, '').trimEnd();

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vectura-shard-workflow-'));
    roots.push(root);
    const sha = 'd'.repeat(40);
    const runId = 'fixture-run';
    const plan = buildPlan({
      files: Array.from({ length: 12 }, (_, i) => `tests/unit/f${i}.test.js`),
      weights: { source: { description: 'fixture', unknownFileWeightSeconds: 1 }, weightsSeconds: {} },
      sha,
      shardCount: 10,
    });
    fs.writeFileSync(path.join(root, 'coverage-shard-plan.json'), JSON.stringify(plan));
    const artifacts = path.join(root, 'coverage-shard-artifacts');
    for (const shard of plan.shards) {
      const directory = path.join(artifacts, `coverage-shard-${shard.index}`);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, 'metadata.json'), JSON.stringify({
        schemaVersion: 1,
        sha,
        runId,
        attempt: 1,
        shard: shard.index,
        shardCount: plan.shardCount,
        planHash: plan.hash,
        expectedFiles: shard.files,
      }));
      fs.writeFileSync(path.join(directory, 'blob.json'), '{}');
    }

    // The workflow download pattern excludes these; stage-blobs must tolerate them anyway.
    fs.mkdirSync(path.join(artifacts, 'coverage-shard-profile-1'), { recursive: true });
    fs.mkdirSync(path.join(artifacts, 'coverage-shard-plan'), { recursive: true });

    const result = spawnSync('bash', ['-c', mergeScript], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        RUNNER_TEMP: root,
        GITHUB_SHA: sha,
        GITHUB_RUN_ID: runId,
        GITHUB_RUN_ATTEMPT: '1',
      },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('staged 10 provenance-verified blob reports');
    expect(fs.readdirSync(path.join(root, 'vitest-blobs')).sort()).toEqual(plan.shards.map((shard) => `shard-${shard.index}.json`).sort());
    fs.rmSync(path.join(artifacts, 'coverage-shard-7'), { recursive: true });
    const missing = spawnSync('bash', ['-c', mergeScript], { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, RUNNER_TEMP: root, GITHUB_SHA: sha, GITHUB_RUN_ID: runId, GITHUB_RUN_ATTEMPT: '1' } });
    expect(missing.status).not.toBe(0);
  });

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
