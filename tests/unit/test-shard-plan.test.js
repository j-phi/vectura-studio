import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { COVERAGE_EXCLUDED_DIRS, buildPlan, inventoryTests, planHash, provenanceProblem, unweightedFallback, validateReport } = require('../../scripts/test-shard-plan.js');
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

    // ci-plan decides whether the heavy graph runs (PR, main push, nightly; R-19, R-20), and
    // which Vitest graph: uninstrumented on a PR, coverage on main and nightly (R-21).
    const heavy = "needs.ci-plan.outputs.heavy == 'true'";
    for (const name of ['e2e-smoke', 'perf']) {
      expect(job(name)).toContain(`if: ${heavy}`);
    }
    const covered = "needs.ci-plan.outputs.coverage == 'true'";
    expect(shard).toContain(`if: ${covered}`);
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
    expect(coverage).toContain(`if: always() && ${covered}`);
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

    // Coverage maps merge from one attempt only (R-21 keeps this rule where coverage merges):
    // attempt-1 shards in an attempt-2 merge are rejected, unlike the uninstrumented PR merge.
    writeShards(plan.hash);
    const retried = spawnSync('bash', ['-c', mergeScript], { cwd: process.cwd(), encoding: 'utf8', env: { ...env, GITHUB_RUN_ATTEMPT: '2' } });
    expect(retried.status).not.toBe(0);
    expect(retried.stderr).toContain('coverage merges one attempt only');
  });

  it('runs the PR gate uninstrumented on the same roster, merged and checked by test-profile --strict (R-21)', () => {
    const workflow = fs.readFileSync(path.resolve('.github/workflows/test.yml'), 'utf8');
    const job = (name) => workflow.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z0-9-]+:\\n|(?![\\s\\S]))`, 'm'))?.[1] || '';
    const shard = job('vitest-shard');
    const merge = job('vitest');
    expect(shard).toContain("if: needs.ci-plan.outputs.vitest == 'true'");
    expect(merge).toContain("if: always() && needs.ci-plan.outputs.vitest == 'true'");
    expect(merge).toContain('needs: [ci-plan, vitest-shard]');
    expect(merge).toContain('test "$SHARDS_RESULT" = success');
    const count = Number(workflow.match(/^  VITEST_SHARD_COUNT: '?(\d+)'?$/m)?.[1]);
    // Fewer shards than the instrumented graph (uninstrumented files run faster), never more.
    const coverageCount = Number(workflow.match(/^  COVERAGE_SHARD_COUNT: '?(\d+)'?$/m)?.[1]);
    // R-21: 8 = the 12-shard coverage plan's file-seconds / the measured ~1.33x overhead, with
    // one shard's worth of headroom given back as free runner slots.
    expect(count).toBe(8);
    expect(count).toBeLessThan(coverageCount);
    const matrix = JSON.parse(shard.match(/^        shard: (\[[\d, ]+\])$/m)?.[1] || 'null');
    expect(matrix).toEqual(Array.from({ length: count }, (_, i) => i + 1));
    // Same plan builder, roster config and sequencer as the coverage shards, without V8.
    expect(shard).toContain('--plan-out "$RUNNER_TEMP/vitest-shard-plan.json" --sha "$GITHUB_SHA" --shards "$VITEST_SHARD_COUNT"');
    expect(shard).toContain('npm run test:vitest -- run --config vitest.coverage-shard.config.mjs --shard="$SHARD_INDEX/$VITEST_SHARD_COUNT"');
    expect(shard).not.toMatch(/--coverage|test:coverage|VECTURA_TEST_COVERAGE/);
    expect(shard).toContain('--verify-report');
    expect(shard).toContain('--attempt "$GITHUB_RUN_ATTEMPT"');
    // A re-run of a failed shard replaces its artifact (upload-artifact names are per run).
    for (const upload of shard.split('- name: Upload').slice(1)) expect(upload).toContain('overwrite: true');
    expect(merge).toContain('pattern: vitest-shard-[0-9]*');
    expect(merge.indexOf('--plan-out')).toBeLessThan(merge.indexOf('--merge-results'));
    expect(merge).toContain('node scripts/test-profile.js --strict --results "$RUNNER_TEMP/merged-results.json"');
    // The merge needs no install and a sparse checkout: the two scripts it runs may load only
    // Node built-ins and files under scripts/ (test-profile's tool-version lookup is optional).
    expect(merge).not.toContain('npm ci');
    expect(merge).toMatch(/sparse-checkout: \|\n\s+scripts\n\s+tests\n/);
    for (const script of ['scripts/test-shard-plan.js', 'scripts/test-profile.js']) {
      const requires = [...fs.readFileSync(path.resolve(script), 'utf8').matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
      expect(requires.filter((r) => !r.startsWith('node:') && !r.startsWith('./')), script).toEqual([]);
    }
    // The coverage graph keeps its own count (D-9: 12) and thresholds; only it reads coverage.
    expect(job('coverage')).toContain('npm run test:coverage:merge');
    expect(merge).not.toMatch(/--coverage|test:coverage|VECTURA_TEST_COVERAGE/);
  });

  it('merges PR shard results across attempts of one run, and rejects any other provenance', () => {
    const workflow = fs.readFileSync(path.resolve('.github/workflows/test.yml'), 'utf8');
    const block = (name) => {
      const m = workflow.match(new RegExp(`      - name: ${name}\\n        run: \\|\\n((?:          .*\\n?)+)`));
      expect(m, name).not.toBeNull();
      return m[1].replace(/^ {10}/gm, '').trimEnd();
    };
    const mergeScript = block('Rebuild the shard plan, verify each shard used it, and merge the shard results');
    const strictScript = block('Enforce merged full-scope inventory, skip baseline, and profile all file timings');
    expect(strictScript).toContain('--strict');

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vectura-vitest-merge-'));
    roots.push(root);
    const sha = 'a'.repeat(40);
    const runId = 'fixture-run';
    const shardCount = Number(workflow.match(/^  VITEST_SHARD_COUNT: '?(\d+)'?$/m)[1]);
    const plan = buildPlan({ files: inventoryTests(), weights, sha, shardCount });
    const { testInventory } = require('../../scripts/test-lanes.json');
    // Spread the approved partial skips over one ordinary file so the strict baseline matches.
    const fullySkipped = testInventory.fullySkippedFiles;
    const partialSkips = testInventory.expectedSkippedAssertions - Object.values(fullySkipped).reduce((a, b) => a + b, 0);
    const carrier = plan.inventory.find((file) => !Object.hasOwn(fullySkipped, file));
    const fileResult = (file) => {
      const n = fullySkipped[file];
      if (n) return { name: path.resolve(file), status: 'skipped', startTime: 1, endTime: 2, assertionResults: Array.from({ length: n }, () => ({ status: 'skipped' })) };
      const skips = file === carrier ? Array.from({ length: partialSkips }, () => ({ status: 'skipped' })) : [];
      return { name: path.resolve(file), status: 'passed', startTime: 1, endTime: 5, assertionResults: [{ status: 'passed' }, ...skips] };
    };
    const artifacts = path.join(root, 'vitest-shard-artifacts');
    const writeShards = ({ attempts = {}, planHashValue = plan.hash, mutate = () => {} } = {}) => {
      fs.rmSync(artifacts, { recursive: true, force: true });
      for (const shard of plan.shards) {
        const directory = path.join(artifacts, `vitest-shard-${shard.index}`);
        fs.mkdirSync(directory, { recursive: true });
        const metadata = { schemaVersion: 1, sha, runId, attempt: attempts[shard.index] || 1, shard: shard.index, shardCount, planHash: planHashValue, expectedFiles: shard.files, startedMs: 5000 + shard.index };
        const results = { success: true, startTime: 1, numTotalTests: shard.files.length, testResults: shard.files.map(fileResult) };
        mutate(shard, metadata, results);
        fs.writeFileSync(path.join(directory, 'metadata.json'), JSON.stringify(metadata));
        fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results));
      }
      // Timing-profile artifacts sit beside the results; the merge must ignore them.
      fs.mkdirSync(path.join(artifacts, 'vitest-shard-profile-1'), { recursive: true });
    };
    const githubEnv = path.join(root, 'github-env');
    const env = (attempt) => ({ ...process.env, RUNNER_TEMP: root, GITHUB_SHA: sha, GITHUB_RUN_ID: runId, GITHUB_RUN_ATTEMPT: String(attempt), GITHUB_ENV: githubEnv, VITEST_SHARD_COUNT: String(shardCount), VECTURA_VITEST_MAX_WORKERS: '2' });
    const runMerge = (attempt = 1) => spawnSync('bash', ['-c', mergeScript], { cwd: process.cwd(), encoding: 'utf8', env: env(attempt) });

    // Green: every shard, attempt 1; the strict profile accepts the merged result.
    writeShards();
    let result = runMerge();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`merged ${shardCount} provenance-verified shard results (${plan.inventory.length} files, attempts 1)`);
    expect(fs.readFileSync(githubEnv, 'utf8')).toContain('VITEST_CHAIN_STARTED_MS=5001');
    // The YAML block, run from the repo root (test-profile walks tests/), output to the fixture.
    const strictBash = strictScript.replaceAll('vitest-profile', `${root}/vitest-profile`).replace('${{ runner.os }}-${{ runner.arch }}', 'fixture');
    const strictHere = () => spawnSync('bash', ['-c', strictBash], { cwd: process.cwd(), encoding: 'utf8', env: { ...env(1), VITEST_CHAIN_STARTED_MS: '5001' } });
    result = strictHere();
    expect(result.status, result.stderr).toBe(0);

    // A failed shard re-run alone (attempt 2) merges with the other shards' attempt-1 results.
    writeShards({ attempts: { 3: 2 } });
    result = runMerge(2);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('attempts 1,2');

    // Fail closed: foreign plan hash, a later attempt, another run, a missing shard, a dropped
    // file, a zero-test file, a failed assertion.
    writeShards({ planHashValue: 'f'.repeat(64) });
    expect(runMerge().stderr).toContain('plan hash or shard index');
    writeShards({ attempts: { 2: 3 } });
    expect(runMerge(2).stderr).toContain('later than this one');
    writeShards({ mutate: (shard, metadata) => { if (shard.index === 1) metadata.runId = 'other-run'; } });
    expect(runMerge().stderr).toContain('SHA or run id');
    writeShards();
    fs.rmSync(path.join(artifacts, `vitest-shard-${shardCount}`), { recursive: true });
    expect(runMerge().stderr).toContain(`shard ${shardCount} artifact is absent`);
    writeShards({ mutate: (shard, metadata, results) => { if (shard.index === 2) results.testResults.pop(); } });
    expect(runMerge().stderr).toContain('roster mismatch');
    writeShards({ mutate: (shard, metadata, results) => { if (shard.index === 2) results.testResults[0].assertionResults = []; } });
    expect(runMerge().stderr).toContain('has no assertions');
    writeShards({ mutate: (shard, metadata, results) => { if (shard.index === 2) results.testResults[0].assertionResults[0].status = 'failed'; } });
    expect(runMerge().status).not.toBe(0);

    // The strict profile still owns the global facts the shards cannot see: the skip baseline.
    writeShards({ mutate: (shard, metadata, results) => {
      const r = results.testResults.find((f) => f.status === 'passed' && f.assertionResults.length === 1);
      if (shard.index === 1 && r) r.assertionResults.push({ status: 'skipped' });
    } });
    expect(runMerge().status).toBe(0);
    result = strictHere();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`expected ${testInventory.expectedSkippedAssertions} skipped assertions`);
  });

  it('keeps coverage merges to one attempt: a cross-attempt coverage blob is rejected', () => {
    const plan = buildPlan({ files: ['tests/unit/a.test.js'], weights: { source: { description: 'fixture' }, weightsSeconds: {} }, sha: 'b'.repeat(40), shardCount: 1 });
    const metadata = { schemaVersion: 1, sha: plan.sha, runId: 'r', attempt: 1, shard: 1, shardCount: 1, planHash: plan.hash, expectedFiles: plan.shards[0].files };
    const ctx = (attempt, sameAttempt) => ({ sha: plan.sha, runId: 'r', attempt, sameAttempt });
    expect(provenanceProblem(metadata, plan.shards[0], plan, ctx(1, true))).toBeNull();
    expect(provenanceProblem(metadata, plan.shards[0], plan, ctx(2, true))).toMatch(/coverage merges one attempt only/);
    expect(provenanceProblem(metadata, plan.shards[0], plan, ctx(2, false))).toBeNull();
    expect(provenanceProblem({ ...metadata, attempt: 0 }, plan.shards[0], plan, ctx(2, false))).toBe('attempt');
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
    // The shard config excludes them with or without coverage: the uninstrumented PR shards
    // (R-21) collect the same inventory as the plan.
    const shardConfig = fs.readFileSync(path.resolve('vitest.coverage-shard.config.mjs'), 'utf8');
    expect(shardConfig).toContain("exclude: ['tests/perf/**', 'tests/audit/**']");
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
