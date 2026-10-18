import { execFileSync, spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { executionExpired, parseQueueWait } = require('../../scripts/test-lane-timing.js');

// Local test lanes (scripts/test-lane.js + scripts/test-lanes.json): the bounded `feedback`
// lane run by the pre-push hook, and the long local lanes. CI does not use them (R-24 deleted
// the risk router, aggregate and promotion ledger); this file keeps the lane runner honest.
let repo;
const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });

beforeAll(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'vectura-lane-'));
  git('init', '-q');
});

afterAll(() => fs.rmSync(repo, { recursive: true, force: true }));

describe('lane manifest', () => {
  it('keeps only local lanes: no router rules, CI roster or promotion state', () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve('scripts/test-lanes.json'), 'utf8'));
    expect(Object.keys(manifest).sort()).toEqual(['lanes', 'testInventory', 'version']);
    expect(Object.keys(manifest.lanes).sort()).toEqual(['audit', 'browser', 'core', 'feedback']);
    for (const lane of Object.values(manifest.lanes)) {
      expect(typeof lane.command).toBe('string');
      expect(lane.maxSeconds).toBeGreaterThan(0);
    }
    const scripts = require('../../package.json').scripts;
    expect(scripts['test:feedback:run']).toContain('test:runner');
    for (const gone of ['test:route', 'test:aggregate', 'test:lane:measure', 'test:lane:promote']) expect(scripts[gone], gone).toBeUndefined();
    for (const gone of ['test-lane-router.js', 'test-lane-measure.js', 'test-lane-aggregate.js']) expect(fs.existsSync(path.resolve('scripts', gone)), gone).toBe(false);
  });
});

describe('lane timing', () => {
  it('starts execution expiry after acquisition, independent of queue wait', () => {
    const queueWaitMs = parseQueueWait('[test-queue] event=lock-acquired queue_wait_ms=65000');
    expect(queueWaitMs).toBe(65_000);
    const acquiredAt = queueWaitMs;
    expect(executionExpired(acquiredAt, acquiredAt + 59_999, 60)).toBe(false);
    expect(executionExpired(acquiredAt, acquiredAt + 60_001, 60)).toBe(true);
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
