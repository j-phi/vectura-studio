const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { mkdtempSync, readFileSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const supervisor = path.resolve(__dirname, '../../scripts/vitest-supervisor.js');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function until(predicate) {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await delay(25); }
  assert.fail('condition did not become true within 5 seconds');
}

for (const scenario of ['success', 'failure', 'timeout', 'SIGINT', 'SIGTERM', 'SIGHUP', 'SIGKILL', 'queued-SIGTERM']) {
  const mode = scenario.replace('queued-', '');
  test(`cleans stubborn descendants after ${scenario}`, { timeout: 15000 }, async (t) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'vectura-cleanup-'));
    const marker = path.join(dir, 'pids.json');
    const worker = `process.on('SIGTERM', () => {}); process.send('ready'); setInterval(() => {}, 1000);`;
    const fixture = `
      const { spawn } = require('node:child_process');
      const child = spawn(process.execPath, ['-e', ${JSON.stringify(worker)}], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      child.on('message', () => {
        require('node:fs').writeFileSync(${JSON.stringify(marker)}, JSON.stringify([process.pid, child.pid]));
        ${mode === 'success' || mode === 'failure' ? `process.exit(${mode === 'success' ? 0 : 7});` : ''}
      });
      setInterval(() => {}, 1000);
    `;
    const launcher = `
      require(${JSON.stringify(supervisor)}).runManaged(process.execPath, ['-e', ${JSON.stringify(fixture)}], {
        timeoutMs: ${mode === 'timeout' ? 1200 : 10000}, graceMs: 100
      }).then(result => { console.log(JSON.stringify(result)); process.exitCode = result.status; });
    `;
    const env = { ...process.env };
    const queued = scenario.startsWith('queued-');
    if (queued) {
      delete env.CI;
      for (const key of Object.keys(env)) if (key.startsWith('VECTURA_TEST_QUEUE_')) delete env[key];
      env.VECTURA_TEST_QUEUE_DIR = path.join(dir, 'queue');
      env.VECTURA_TEST_QUEUE_POLL_MS = '40';
      env.VECTURA_TEST_QUEUE_TRACK_MS = '40';
      env.VECTURA_TEST_QUEUE_LINGER_MS = '100';
    }
    const args = queued
      ? [path.resolve(__dirname, '../../scripts/test-queue.js'), process.execPath, '-e', launcher]
      : ['-e', launcher];
    const parent = spawn(process.execPath, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const exited = once(parent, 'exit');
    let output = '';
    parent.stdout.on('data', (d) => { output += d; });
    parent.stderr.on('data', (d) => { output += d; });
    let pids = [];
    t.after(() => {
      for (const pid of [...pids, parent.pid]) { try { process.kill(pid, 'SIGKILL'); } catch {} }
      rmSync(dir, { recursive: true, force: true });
    });
    await until(() => existsSync(marker) || parent.exitCode !== null);
    assert.ok(existsSync(marker), output);
    pids = JSON.parse(readFileSync(marker, 'utf8'));
    if (mode.startsWith('SIG')) parent.kill(mode);
    const [code, signal] = await exited;
    await until(() => pids.every((pid) => !alive(pid)));
    if (queued) assert.equal(existsSync(path.join(dir, 'queue/lock.json')), false);
    if (mode === 'SIGKILL') assert.equal(signal, mode);
    else assert.equal(code, { success: 0, failure: 7, timeout: 124, SIGINT: 130, SIGTERM: 143, SIGHUP: 129 }[mode], output);
  });
}

test('spawn errors fail without hanging', { timeout: 5000 }, async () => {
  const { runManaged } = require(supervisor);
  const result = await runManaged('/no/such/vectura-executable', [], { timeoutMs: 1000, graceMs: 100 });
  assert.equal(result.status, 1);
  assert.match(result.error, /ENOENT/);
});

test('cleanup leaves unrelated processes alone and removes signal listeners', { timeout: 5000 }, async (t) => {
  const { runManaged } = require(supervisor);
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
  t.after(() => unrelated.kill('SIGKILL'));
  const before = ['SIGINT', 'SIGTERM', 'SIGHUP'].map((signal) => process.listenerCount(signal));
  const result = await runManaged(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 100, graceMs: 100 });
  assert.equal(result.status, 124);
  assert.ok(alive(unrelated.pid));
  assert.deepEqual(['SIGINT', 'SIGTERM', 'SIGHUP'].map((signal) => process.listenerCount(signal)), before);
});

test('rejects disabled, malformed, or overflowing deadlines before spawning', async () => {
  const { runManaged } = require(supervisor);
  for (const timeoutMs of [0, -1, NaN, Infinity, 0.5, 2147483648]) {
    const result = await runManaged(process.execPath, ['-e', 'process.exit(0)'], { timeoutMs });
    assert.equal(result.status, 1);
    assert.match(result.error, /positive integer/);
  }
});

for (const mode of ['retry', 'deadline', 'cancel']) {
  test(`wrapper preserves retry policy on ${mode}`, { timeout: 15000 }, async (t) => {
    const { mkdirSync, copyFileSync, writeFileSync } = require('node:fs');
    const dir = mkdtempSync(path.join(tmpdir(), 'vectura-wrapper-'));
    mkdirSync(path.join(dir, 'scripts'));
    mkdirSync(path.join(dir, 'node_modules/vitest'), { recursive: true });
    for (const file of ['run-vitest.js', 'vitest-supervisor.js']) {
      copyFileSync(path.resolve(__dirname, '../../scripts', file), path.join(dir, 'scripts', file));
    }
    writeFileSync(path.join(dir, 'node_modules/vitest/package.json'), '{"name":"vitest","version":"0.0.0"}');
    const marker = path.join(dir, 'attempts');
    writeFileSync(path.join(dir, 'node_modules/vitest/vitest.mjs'), `
      import fs from 'node:fs';
      const marker = ${JSON.stringify(marker)};
      fs.appendFileSync(marker, 'attempt\\n');
      if (${JSON.stringify(mode)} === 'retry' && fs.readFileSync(marker, 'utf8').split('\\n').length > 2) {
        console.log(' Test Files  1 passed (1)');
        process.exit(0);
      }
      console.log('Vitest caught 1 unhandled error during the test run.');
      console.log('⎯⎯ Unhandled Error ⎯⎯');
      console.log('[vitest-worker]: Timeout calling "onTaskUpdate"');
      console.log(' Test Files  1 passed (1)');
      ${mode === 'retry' ? 'process.exit(1);' : 'setInterval(() => {}, 1000);'}
    `);
    const parent = spawn(process.execPath, [path.join(dir, 'scripts/run-vitest.js'), 'run'], {
      cwd: dir, env: { ...process.env, VECTURA_TEST_TIMEOUT_MS: mode === 'deadline' ? '1200' : '10000' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const exited = once(parent, 'close');
    let output = '';
    parent.stdout.on('data', (d) => { output += d; });
    parent.stderr.on('data', (d) => { output += d; });
    t.after(() => { parent.kill('SIGKILL'); rmSync(dir, { recursive: true, force: true }); });
    await until(() => output.includes('Test Files'));
    if (mode === 'cancel') parent.kill('SIGTERM');
    const [code] = await exited;
    assert.equal(code, { retry: 0, deadline: 124, cancel: 143 }[mode], output);
    assert.equal(readFileSync(marker, 'utf8').trim().split('\n').length, mode === 'retry' ? 2 : 1, output);
  });
}

test('transient group permission races are retried; persistent denials fail closed', async () => {
  const { signalGroup } = require(supervisor);
  let calls = 0;
  assert.equal(await signalGroup(123, 0, () => {
    throw Object.assign(new Error('group exited'), { code: calls++ === 0 ? 'EPERM' : 'ESRCH' });
  }), false);
  assert.equal(calls, 2);
  await assert.rejects(signalGroup(123, 'SIGTERM', () => {
    throw Object.assign(new Error('permission denied'), { code: 'EPERM' });
  }), /permission denied/);
});


test('CI has room for measured coverage runs; explicit deadlines override defaults', () => {
  const { getRunTimeoutMs } = require('../../scripts/run-vitest');
  assert.equal(getRunTimeoutMs({}), 30 * 60 * 1000);
  assert.equal(getRunTimeoutMs({ CI: 'true' }), 3 * 60 * 60 * 1000);
  assert.equal(getRunTimeoutMs({ CI: 'true', VECTURA_TEST_TIMEOUT_MS: '5000' }), 5000);
  assert.equal(getRunTimeoutMs({ VECTURA_TEST_TIMEOUT_MS: '6000' }), 6000);
  assert.equal(getRunTimeoutMs({ VECTURA_TEST_TIMEOUT_MS: '0' }), 0);
});

test('full local aggregates (test:ci, test:audit) run every Vitest step under the CI deadline', () => {
  // Local full-scope coverage runs in one worker and takes 35-40 min, so the 30-min local
  // default can never fit it. The aggregate exports the CI default (overridable) to every step.
  const { execFileSync } = require('node:child_process');
  const root = require('node:path').resolve(__dirname, '../..');
  const { scripts } = require('../../package.json');
  const probe = "node -e \"process.stdout.write(String(require('./scripts/run-vitest').getRunTimeoutMs()))\"";
  for (const name of ['test:ci', 'test:audit']) {
    const line = scripts[name].match(/--shell '(.*)'$/)[1];
    const prefix = line.slice(0, line.indexOf('npm run test:runner'));
    const env = { ...process.env };
    delete env.VECTURA_TEST_TIMEOUT_MS;
    delete env.CI;
    assert.equal(execFileSync('sh', ['-c', prefix + probe], { cwd: root, env, encoding: 'utf8' }), '10800000', name);
    env.VECTURA_TEST_TIMEOUT_MS = '7000';
    assert.equal(execFileSync('sh', ['-c', prefix + probe], { cwd: root, env, encoding: 'utf8' }), '7000', `${name} keeps an explicit override`);
  }
});
