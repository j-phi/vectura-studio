import { execFileSync, spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { executionExpired, parseQueueWait } = require('../../scripts/test-lane-timing.js');

const router = path.resolve('scripts/test-lane-router.js');
let repo;
let base;
const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
const write = (file, text = 'fixture\n') => {
  const target = path.join(repo, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
};
const route = (...args) => {
  const result = spawnSync(process.execPath, [router, '--json', ...args], { cwd: repo, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
};
const aggregate = (args, env) => spawnSync(process.execPath, [path.resolve('scripts/test-lane-aggregate.js'), ...args], { cwd: repo, encoding: 'utf8', env });

beforeAll(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'vectura-lane-route-'));
  git('init', '-q');
  git('config', 'user.email', 'lane-tests@example.invalid');
  git('config', 'user.name', 'Lane routing test');
  write('src/core/engine.js');
  write('src/ui/panel.js');
  write('src/render/renderer.js');
  write('tests/unit/example.test.js');
  git('add', '.');
  git('commit', '-qm', 'base');
  base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
});

afterAll(() => fs.rmSync(repo, { recursive: true, force: true }));

describe('versioned risk routing', () => {
  it('keeps shadow routing and assigns every CI guarantee to one recorded owner', () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve('scripts/test-lanes.json'), 'utf8'));
    const workflow = fs.readFileSync(path.resolve('.github/workflows/test.yml'), 'utf8');
    const scripts = require('../../package.json').scripts;
    expect(manifest.selection).toBe('shadow');
    expect(Object.keys(manifest.ciRoster.owners).sort()).toEqual([...manifest.ciRoster.expectedJobs].sort());
    expect(manifest.ciRoster.owners.feedback).toContain('lifecycle');
    expect(scripts['test:feedback:run']).toContain('test:runner');
    for (const command of ['test:runner', 'test:coverage', 'test:e2e', 'test:perf']) {
      expect(scripts['test:ci']).toContain(command);
    }
    expect(scripts['test:ci']).not.toContain('test:unit');
    expect(scripts['test:ci']).not.toContain('test:integration');
    expect(scripts['test:ci']).not.toContain('test:visual');
    expect(workflow).toContain('npm run test:coverage');
    expect(workflow).toContain('npm run test:perf');
    expect(workflow).toContain('npm run test:e2e');
    expect(workflow).toContain('needs: [coverage-shard]');
  });

  it('selects core and browser for core changes and resolves a merge base', () => {
    write('src/core/engine.js', 'changed\n');
    git('add', '.');
    git('commit', '-qm', 'core change');
    const plan = route('--base', base, '--head', 'HEAD');
    expect(plan.base).toBe(base);
    expect(plan.risk).toBe('high');
    expect(plan.lanes).toEqual(['browser', 'core', 'feedback']);
    expect(plan.matchedRules).toContain('core-algorithms');
    const manifest = JSON.parse(fs.readFileSync(path.resolve('scripts/test-lanes.json'), 'utf8'));
    expect(manifest.promotion.requireRepresentatives).toContain('core-algorithms');
    expect(manifest.promotion.requireRepresentatives).not.toContain('core');
  });

  it('routes Scene3D implementation, tone-law, renderer and proof changes into audit', () => {
    write('src/core/algorithms/scene3d.js', 'changed\n');
    write('src/config/scene3d-tone-laws.js', 'changed\n');
    write('src/render/renderer.js', 'changed\n');
    write('tests/audit/scene3d-tone-law-dispatch.test.js', 'changed\n');
    write('tests/helpers/scene3d-tone-law-fixture.js', 'changed\n');
    git('add', '.'); git('commit', '-qm', 'Scene3D algorithm and proof changes');
    const plan = route('--base', base, '--head', 'HEAD');
    expect(plan.matchedRules).toContain('scene3d');
    expect(plan.lanes).toContain('audit');
  });

  it('routes shared harness and preset changes into the full audit', () => {
    write('user-presets/demo/default.vectura', '{}\n');
    write('scripts/test-lanes.json', '{}\n');
    git('add', '.');
    git('commit', '-qm', 'shared config change');
    const plan = route('--base', base, '--head', 'HEAD');
    expect(plan.risk).toBe('shared');
    expect(plan.lanes).toEqual(['audit', 'browser', 'core', 'feedback']);
    expect(plan.matchedRules).toContain('shared-test-contract');
    expect(plan.matchedRules).toContain('defaults-and-config');
  });

  it('fails closed for unclassified paths and missing comparison refs', () => {
    write('mystery/new-tool.py');
    git('add', '.');
    git('commit', '-qm', 'unknown path');
    const unknown = route('--base', base, '--head', 'HEAD');
    expect(unknown.risk).toBe('unknown');
    expect(unknown.lanes).toContain('audit');
    const unavailable = route('--base', 'not-a-real-ref', '--head', 'HEAD');
    expect(unavailable.risk).toBe('unknown');
    expect(unavailable.fallback).toContain('no base revision');
    const beforeRename = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    git('mv', 'src/core/engine.js', 'src/core/engine-renamed.js');
    git('commit', '-qm', 'rename into unclassified path');
    const renamed = route('--base', beforeRename, '--head', 'HEAD');
    expect(renamed.risk).toBe('unknown');
    expect(renamed.files).toContain('src/core/engine-renamed.js');
    expect(renamed.lanes).toContain('audit');
  });

  it('keeps every retained full job required even for docs-only plans', () => {
    const plan = JSON.stringify({ head: 'expected-sha', lanes: ['feedback'] });
    const baseJobs = [['feedback', 'success']];
    const run = (jobs) => aggregate(['--sha', 'expected-sha', ...jobs.map(([name, result]) => `--job=${name}=${result}`)], { ...process.env, VECTURA_LANE_PLAN: plan });
    expect(run(baseJobs).status).toBe(1);
    expect(run([...baseJobs, ...['unit', 'integration', 'e2e-smoke', 'visual', 'perf', 'coverage'].map((job) => [job, 'success'])]).status).toBe(0);
    expect(run([...baseJobs, ...['unit', 'integration', 'e2e-smoke', 'visual', 'perf', 'coverage'].map((job) => [job, 'success']), ['coverage', 'failure']]).status).toBe(1);
  });

  it('blocks incomplete expected rosters and stale SHA evidence', () => {
    const plan = JSON.stringify({ head: 'expected-sha', lanes: ['feedback', 'core', 'browser', 'audit'] });
    const run = (sha, jobs) => aggregate(['--sha', sha, ...jobs.map(([name, result]) => `--job=${name}=${result}`)], { ...process.env, VECTURA_LANE_PLAN: plan });
    expect(run('expected-sha', [['feedback', 'success'], ['unit', 'success'], ['integration', 'success'], ['e2e-smoke', 'success'], ['visual', 'success'], ['perf', 'success'], ['coverage', 'success']]).status).toBe(0);
    expect(run('expected-sha', [['feedback', 'success'], ['unit', 'success'], ['integration', 'success'], ['e2e-smoke', 'success']]).status).toBe(1);
    expect(run('stale-sha', [['feedback', 'success'], ['unit', 'success'], ['integration', 'success'], ['e2e-smoke', 'success'], ['visual', 'success'], ['perf', 'success'], ['coverage', 'success']]).status).toBe(1);
  });
});


describe('lane timing and promotion evidence', () => {
  it('starts execution expiry after acquisition, independent of queue wait', () => {
    const queueWaitMs = parseQueueWait('[test-queue] event=lock-acquired queue_wait_ms=65000');
    expect(queueWaitMs).toBe(65_000);
    const acquiredAt = queueWaitMs;
    expect(executionExpired(acquiredAt, acquiredAt + 59_999, 60)).toBe(false);
    expect(executionExpired(acquiredAt, acquiredAt + 60_001, 60)).toBe(true);
  });

  it('suppresses empirical p95 below 30 comparable lane/class samples', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vectura-p95-'));
    const ledger = path.join(dir, 'metrics.jsonl');
    const sample = (i) => ({ schemaVersion: 1, lane: 'core', classes: ['core-algorithms'], coldClass: 'warm', durationMs: 1000 + i, exitCode: 0, timedOut: false });
    const measure = () => JSON.parse(spawnSync(process.execPath, [path.resolve('scripts/test-lane-measure.js'), '--ledger', ledger], { cwd: repo, encoding: 'utf8' }).stdout).telemetry[0];
    fs.writeFileSync(ledger, Array.from({ length: 29 }, (_, i) => JSON.stringify(sample(i))).join('\n') + '\n');
    expect(measure().p95Seconds).toBeNull();
    fs.appendFileSync(ledger, `${JSON.stringify(sample(29))}\n`);
    expect(measure().p95Status).toBe('empirical');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const promotionFixture = () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve('scripts/test-lanes.json'), 'utf8'));
    const jobs = ['unit', 'integration', 'e2e-smoke', 'visual', 'perf', 'coverage', 'feedback'];
    const classes = manifest.promotion.requireRepresentatives;
    const rows = [];
    for (let run = 1; run <= 20; run += 1) {
      const sha = run.toString(16).padStart(40, '0');
      const runClasses = [classes[(run - 1) % classes.length]];
      for (const job of jobs) rows.push({
        schemaVersion: manifest.ciRoster.schemaVersion, source: 'github-actions', sha, job, owner: manifest.ciRoster.owners[job], expectedJobs: jobs, compatibilityJobs: manifest.ciRoster.compatibilityJobs, result: 'success', complete: true,
        latestHead: true, classes: runClasses, runId: `run-${run}`, runNumber: run,
        collectedAt: new Date(Date.UTC(2026, 0, run)).toISOString(),
        provenance: { workflow: 'Tests', event: 'pull_request', attempt: 1 },
      });
    }
    return rows;
  };
  const runPromotion = (rows, head) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vectura-promotion-'));
    const ledger = path.join(dir, 'metrics.jsonl');
    fs.writeFileSync(ledger, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
    const result = spawnSync(process.execPath, [path.resolve('scripts/test-lane-measure.js'), '--promote', '--head', head, '--ledger', ledger], { cwd: repo, encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true });
    return result;
  };

  it('promotes a complete twenty-run green streak ending at the latest head', () => {
    const rows = promotionFixture();
    const head = rows[rows.length - 1].sha;
    const result = runPromotion(rows, head);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Complete promotion evidence');
  });

  it('continues to read complete legacy schema-two ledgers', () => {
    const legacy = promotionFixture().map(({ compatibilityJobs, owner, ...row }) => ({ ...row, schemaVersion: 2 }));
    const result = runPromotion(legacy, legacy[legacy.length - 1].sha);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('consecutive complete green SHAs');
  });

  it('requires twenty consecutive current-schema rows for new-topology promotion', () => {
    const mixed = promotionFixture();
    const firstSha = mixed[0].sha;
    for (const row of mixed.filter((entry) => entry.sha === firstSha)) {
      row.schemaVersion = 2;
      delete row.owner;
      delete row.compatibilityJobs;
    }
    const result = runPromotion(mixed, mixed[mixed.length - 1].sha);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('found 19');
  });

  it('accepts valid schema-three history before twenty complete current-schema green runs', () => {
    const historical = promotionFixture().slice(0, 49).map((row, index) => ({
      ...row,
      sha: `e${Math.floor(index / 7) + 1}`.padEnd(40, '0'),
      schemaVersion: 3,
      expectedJobs: ['unit', 'integration', 'e2e-smoke', 'visual', 'perf', 'coverage', 'feedback'],
      compatibilityJobs: ['unit', 'integration', 'visual'],
      owner: {
        unit: 'coverage (compatibility check name)',
        integration: 'coverage (compatibility check name)',
        'e2e-smoke': 'tests/e2e smoke projects',
        visual: 'coverage (compatibility check name; scheduled visual suite remains independent)',
        perf: 'un-instrumented tests/perf suite',
        coverage: 'all tests/**/*.test.js and global coverage thresholds',
        feedback: 'feedback Vitest/browser journey and Node process lifecycle tests',
      }[row.job],
    }));
    const current = promotionFixture().map((row) => ({ ...row, runId: `current-${row.runId}`, runNumber: row.runNumber + 7 }));
    const combined = [...historical, ...current];
    const result = runPromotion(combined, current[current.length - 1].sha);
    expect(result.status, result.stderr).toBe(0);
  });

  it('does not count valid historical schema-three runs toward the current-schema streak', () => {
    const rows = promotionFixture();
    for (const row of rows.filter((entry) => entry.sha === rows[0].sha)) {
      row.schemaVersion = 3;
      row.expectedJobs = ['unit', 'integration', 'e2e-smoke', 'visual', 'perf', 'coverage', 'feedback'];
      row.compatibilityJobs = ['unit', 'integration', 'visual'];
      row.owner = {
        unit: 'coverage (compatibility check name)',
        integration: 'coverage (compatibility check name)',
        'e2e-smoke': 'tests/e2e smoke projects',
        visual: 'coverage (compatibility check name; scheduled visual suite remains independent)',
        perf: 'un-instrumented tests/perf suite',
        coverage: 'all tests/**/*.test.js and global coverage thresholds',
        feedback: 'feedback Vitest/browser journey and Node process lifecycle tests',
      }[row.job];
    }
    const result = runPromotion(rows, rows[rows.length - 1].sha);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('found 19');
  });

  it('rejects malformed historical schema-three metadata', () => {
    const rows = promotionFixture();
    const historicalSha = rows[0].sha;
    for (const row of rows.filter((entry) => entry.sha === historicalSha)) {
      row.schemaVersion = 3;
      row.expectedJobs = ['unit', 'integration', 'e2e-smoke', 'visual', 'perf', 'coverage', 'feedback'];
      row.compatibilityJobs = ['unit', 'integration', 'visual'];
      row.owner = 'incorrect owner';
    }
    const result = runPromotion(rows, rows[rows.length - 1].sha);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('lack valid GitHub workflow provenance or roster metadata');
  });

  it('rejects stale heads, duplicate or conflicting jobs, and missing or failed jobs', () => {
    const complete = promotionFixture();
    const latest = complete[complete.length - 1].sha;
    const stale = runPromotion(complete, complete[0].sha);
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain('not the latest recorded run');

    const duplicate = [...complete, { ...complete[complete.length - 1] }];
    expect(runPromotion(duplicate, latest).status).toBe(1);

    const invalidAliases = complete.map((row) => row.sha === latest ? { ...row, compatibilityJobs: ['unit'] } : row);
    expect(runPromotion(invalidAliases, latest).status).toBe(1);

    const conflicting = [...complete, { ...complete.find((row) => row.sha === latest && row.job === 'coverage'), result: 'failure' }];
    expect(runPromotion(conflicting, latest).status).toBe(1);

    const missing = complete.filter((row) => !(row.sha === latest && row.job === 'feedback'));
    expect(runPromotion(missing, latest).status).toBe(1);

    const failedNewer = complete.map((row) => row.sha === latest && row.job === 'coverage' ? { ...row, result: 'failure' } : row);
    expect(runPromotion(failedNewer, latest).status).toBe(1);

    // A newer attempt of an older SHA is still newer evidence. It cannot be
    // hidden by grouping each SHA at the run number of its first observation.
    const extraHead = 'f'.repeat(40);
    const extra = complete.filter((row) => row.sha === latest).map((row) => ({ ...row, sha: extraHead, runId: 'run-21', runNumber: 21 }));
    const retry = { ...complete[0], runId: 'run-99', runNumber: 99, result: 'failure' };
    const retriedOldHead = runPromotion([...complete, ...extra, retry], extraHead);
    expect(retriedOldHead.status).toBe(1);
    expect(retriedOldHead.stderr).toContain('not the latest recorded run');
  });

  it('denies promotion from sparse or synthetic expected-roster evidence', () => {
    const sha = 'a'.repeat(40);
    const synthetic = { schemaVersion: 1, sha, source: 'expected-roster', lane: 'audit', classes: ['core'], exitCode: 0, timedOut: false, durationMs: null };
    const result = runPromotion([synthetic], sha);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Promotion denied');
  });
});


describe('pre-push feedback contract', () => {
  it('runs feedback on a first push with an absent remote base', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vectura-hook-'));
    const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
    const log = path.join(dir, 'calls.log');
    fs.writeFileSync(path.join(bin, 'npm'), `#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"${log}\"\nexit 0\n`);
    fs.chmodSync(path.join(bin, 'npm'), 0o755);
    const hook = spawnSync('sh', [path.resolve('scripts/hooks/pre-push')], { cwd: repo, encoding: 'utf8', input: `refs/heads/topic ${'a'.repeat(40)} refs/heads/topic ${'0'.repeat(40)}\n`, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
    expect(hook.status, hook.stderr).toBe(0);
    expect(fs.readFileSync(log, 'utf8')).toContain('run test:feedback');
    expect(fs.readFileSync(log, 'utf8')).not.toContain('test:lane');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // An Intel git on an Apple-silicon Mac runs the hook under Rosetta; the lane's
  // Chromium then starts as x64 and the browser journey hangs past the deadline.
  // uname / sysctl / arch are stubbed on PATH so both branches run on any OS.
  const runHookAs = (translated) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vectura-hook-'));
    const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
    const log = path.join(dir, 'calls.log');
    const stub = (name, body) => { fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`); fs.chmodSync(path.join(bin, name), 0o755); };
    stub('uname', 'echo Darwin');
    stub('sysctl', `echo ${translated}`);
    stub('arch', `printf 'arch %s\\n' "$1" >> "${log}"; shift; exec "$@"`);
    stub('npm', `printf '%s\\n' "$*" >> "${log}"; exit 0`);
    const hook = spawnSync('sh', [path.resolve('scripts/hooks/pre-push')], { cwd: repo, encoding: 'utf8', input: `refs/heads/topic ${'a'.repeat(40)} refs/heads/topic ${'0'.repeat(40)}\n`, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
    const calls = fs.readFileSync(log, 'utf8').trim().split('\n');
    fs.rmSync(dir, { recursive: true, force: true });
    return { hook, calls };
  };

  it('re-enters native arm64 for feedback when git runs the hook under Rosetta', () => {
    const { hook, calls } = runHookAs(1);
    expect(hook.status, hook.stderr).toBe(0);
    expect(calls).toEqual(['arch -arm64', 'run test:feedback']);
  });

  it('runs feedback directly when the hook is not translated', () => {
    const { hook, calls } = runHookAs(0);
    expect(hook.status, hook.stderr).toBe(0);
    expect(calls).toEqual(['run test:feedback']);
  });
});


describe('lane cancellation', () => {
  it('fails cancellation even when the child handles termination with exit zero', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vectura-lane-cancel-'));
    const metrics = path.join(dir, 'metrics.jsonl');
    for (const file of ['test-lane.js', 'test-lane-timing.js']) {
      fs.copyFileSync(path.resolve('scripts', file), path.join(dir, file));
    }
    fs.writeFileSync(path.join(dir, 'child.js'), "process.on('SIGTERM', () => process.exit(0)); process.stdout.write('READY\\n'); setInterval(() => {}, 1000);\n");
    fs.writeFileSync(path.join(dir, 'test-lanes.json'), JSON.stringify({ lanes: { probe: { command: 'exec node child.js', maxSeconds: 5 } } }));
    const child = spawn(process.execPath, [path.join(dir, 'test-lane.js'), 'probe'], {
      cwd: dir, env: { ...process.env, VECTURA_LANE_METRICS_FILE: metrics }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
      const completed = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code) => resolve(code));
      });
      await new Promise((resolve, reject) => {
        child.stdout.once('data', resolve);
        child.once('error', reject);
        child.once('exit', () => reject(new Error('Probe exited before ready')));
      });
      child.kill('SIGTERM');
      expect(await completed).toBe(130);
      const row = JSON.parse(fs.readFileSync(metrics, 'utf8').trim());
      expect(row.exitCode).toBe(130);
      expect(row.signal).toBe('SIGTERM');
    } finally {
      if (child.exitCode == null) child.kill('SIGKILL');
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 10000);
});
