/*
 * scripts/test-queue.js serializes heavy local test runs across every worktree
 * and Claude session on the machine. These tests drive the real CLI as separate
 * processes against a throwaway queue dir (VECTURA_TEST_QUEUE_DIR), with short
 * poll/grace intervals, and pin the contract:
 *   - contention: a second run waits, says who holds the lock, and starts only
 *     after the first run ends; simultaneous runs never overlap; waiters are FIFO
 *   - cancellation: a cancelled holder terminates its whole subprocess tree
 *     (including a detached child and a SIGTERM-ignoring one) before release; a
 *     cancelled waiter leaves the queue
 *   - stale recovery: a dead PID or a reused PID (start time mismatch) is
 *     reclaimed; a live owner is never stolen from; a SIGKILLed holder's orphans
 *     are terminated before the next run starts
 *   - nesting: aggregate commands that call queued commands do not deadlock,
 *     with or without the inherited token
 *   - CI bypass, exit-code propagation, ps parsing.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { parsePsLine, parseArgs, processStart, ownerState } = require('../../scripts/test-queue');

const SCRIPT = path.resolve(__dirname, '../../scripts/test-queue.js');
const NODE = process.execPath;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isAlive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
};

const waitFor = async (predicate, label, ms = 15000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(20);
  }
  throw new Error(`timed out waiting for ${label}`);
};

let tmp;
let spawned;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vectura-test-queue-'));
  spawned = [];
});

afterEach(() => {
  for (const pid of spawned) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});

const queueDir = () => path.join(tmp, 'q');
const lockPath = () => path.join(queueDir(), 'lock.json');

// The suite itself runs under the real queue, so strip every inherited queue
// variable (and CI) before pointing the child at the throwaway dir.
const queueEnv = (extra = {}) => {
  const env = { ...process.env };
  delete env.CI;
  for (const key of Object.keys(env)) if (key.startsWith('VECTURA_TEST_QUEUE_')) delete env[key];
  return {
    ...env,
    VECTURA_TEST_QUEUE_DIR: queueDir(),
    VECTURA_TEST_QUEUE_POLL_MS: '40',
    VECTURA_TEST_QUEUE_STATUS_MS: '250',
    VECTURA_TEST_QUEUE_TRACK_MS: '40',
    VECTURA_TEST_QUEUE_KILL_GRACE_MS: '1500',
    VECTURA_TEST_QUEUE_LINGER_MS: '200',
    VECTURA_TEST_QUEUE_TERM_GRACE_MS: '700',
    ...extra,
  };
};

const runQueue = (args, extraEnv) => {
  const child = spawn(NODE, [SCRIPT, ...args], { env: queueEnv(extraEnv), stdio: ['ignore', 'pipe', 'pipe'] });
  spawned.push(child.pid);
  const run = { child, stdout: '', stderr: '' };
  child.stdout.on('data', (d) => { run.stdout += d; });
  child.stderr.on('data', (d) => { run.stderr += d; });
  // 'exit', not 'close': orphans of a SIGKILLed holder keep its stderr pipe open.
  run.exited = new Promise((resolve) => child.on('exit', resolve));
  run.done = new Promise((resolve) => {
    child.on('close', (code, signal) => resolve({ code, signal, stdout: run.stdout, stderr: run.stderr }));
  });
  return run;
};

// A queued command that logs "<name> start|end <ms>" lines around a sleep.
const writeScript = (name, body) => {
  const file = path.join(tmp, name);
  fs.writeFileSync(file, body);
  return file;
};
const loggerScript = () => writeScript('logger.js', `
const fs = require('fs');
const [file, name, ms] = process.argv.slice(2);
fs.appendFileSync(file, name + ' start ' + Date.now() + '\\n');
setTimeout(() => fs.appendFileSync(file, name + ' end ' + Date.now() + '\\n'), Number(ms));
`);
const readEvents = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '')
  .trim().split('\n').filter(Boolean)
  .map((line) => { const [name, kind, at] = line.split(' '); return { name, kind, at: Number(at) }; });

// Holds the lock and spawns a subprocess tree: a plain child, a detached child
// (own session — not reachable through the process group) and a child that
// ignores SIGTERM. Writes their PIDs, then idles until killed.
const treeScript = () => writeScript('tree.js', `
const { spawn } = require('child_process');
const fs = require('fs');
const idle = 'setInterval(() => {}, 1000)';
const plain = spawn(process.execPath, ['-e', idle], { stdio: 'ignore' });
const detached = spawn(process.execPath, ['-e', idle], { stdio: 'ignore', detached: true });
detached.unref();
const stubborn = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); " + idle], { stdio: 'ignore' });
fs.writeFileSync(process.argv[2], JSON.stringify([process.pid, plain.pid, detached.pid, stubborn.pid]));
setInterval(() => {}, 1000);
`);
// Records whether each PID in the given file is alive at the moment it runs.
const probeScript = () => writeScript('probe.js', `
const fs = require('fs');
const pids = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const alive = pids.filter((pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; } });
fs.writeFileSync(process.argv[3], JSON.stringify(alive));
`);

const spawnSleeper = () => {
  const child = spawn(NODE, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  spawned.push(child.pid);
  return child;
};

const writeLock = (record) => {
  fs.mkdirSync(queueDir(), { recursive: true });
  fs.writeFileSync(lockPath(), JSON.stringify(record));
};

describe('test-queue: helpers', () => {
  it('parses ps rows with a five-token lstart and a command containing spaces', () => {
    const row = parsePsLine('  4242   1 4242 S+   Sun Oct  4 10:00:00 2026 node scripts/run-vitest.js run tests/unit');
    expect(row).toEqual({
      pid: 4242, ppid: 1, pgid: 4242, stat: 'S+',
      start: 'Sun Oct 4 10:00:00 2026',
      command: 'node scripts/run-vitest.js run tests/unit',
    });
    expect(parsePsLine('garbage')).toBeNull();
  });

  it('parses argv, --shell and --status forms', () => {
    expect(parseArgs(['--', 'vitest', 'run'])).toEqual({ shell: false, argv: ['vitest', 'run'], command: 'vitest run' });
    expect(parseArgs(['--shell', 'a && b'])).toEqual({ shell: true, command: 'a && b' });
    // Args npm appends after `--` stay literal words: no re-splitting, no pipes.
    expect(parseArgs(['--shell', 'playwright test x', '--grep', "two words|it's"]).command)
      .toBe("playwright test x '--grep' 'two words|it'\\''s'");
    expect(parseArgs(['--status'])).toEqual({ status: true });
    expect(parseArgs([])).toEqual({ help: true });
  });

  it('identifies an owner by PID AND start time, not PID alone', async () => {
    const start = processStart(process.pid);
    expect(start).toMatch(/\d{4}$/);
    expect(ownerState({ pid: process.pid, start, host: os.hostname() })).toBe('alive');
    // Same PID, different start time = the PID was reused by another process.
    expect(ownerState({ pid: process.pid, start: 'Thu Jan 1 00:00:00 1970', host: os.hostname() })).toBe('dead');
    // The recorded host is display-only: a macOS hostname follows the network.
    expect(ownerState({ pid: process.pid, start, host: 'renamed-host' })).toBe('alive');
    const gone = spawn(NODE, ['-e', '']);
    await new Promise((resolve) => gone.on('exit', resolve));
    await waitFor(() => !isAlive(gone.pid), 'short-lived process to be reaped');
    expect(ownerState({ pid: gone.pid, start, host: os.hostname() })).toBe('dead');
  });
});

describe('test-queue: contention', () => {
  it('makes a second run wait for the first, and reports who holds the lock', async () => {
    const logger = loggerScript();
    const events = path.join(tmp, 'events.log');
    const a = runQueue([NODE, logger, events, 'A', '700']);
    await waitFor(() => readEvents(events).some((e) => e.name === 'A'), 'A to start');
    const b = runQueue([NODE, logger, events, 'B', '10'], { VECTURA_TEST_QUEUE_STATUS_MS: '60000' });
    const [ra, rb] = await Promise.all([a.done, b.done]);
    expect(ra.code).toBe(0);
    expect(rb.code).toBe(0);
    const ev = readEvents(events);
    expect(ev.map((e) => `${e.name} ${e.kind}`)).toEqual(['A start', 'A end', 'B start', 'B end']);
    expect(rb.stderr).toContain(`Waiting for the test lock held by PID ${a.child.pid}`);
    expect(rb.stderr).toContain(process.cwd());
    expect(rb.stderr).toContain(`logger.js ${events} A 700`);
    expect(rb.stderr).toContain('Test lock acquired after');
    // One status line per holder, not one per poll (the line's age text ticks).
    expect(rb.stderr.match(/Waiting for the test lock/g)).toHaveLength(1);
    expect(fs.existsSync(lockPath())).toBe(false);
  }, 30000);

  it('never overlaps simultaneous runs (atomic acquisition)', async () => {
    const logger = loggerScript();
    const events = path.join(tmp, 'events.log');
    const runs = ['A', 'B', 'C', 'D'].map((name) => runQueue([NODE, logger, events, name, '150']));
    const results = await Promise.all(runs.map((r) => r.done));
    expect(results.map((r) => r.code)).toEqual([0, 0, 0, 0]);
    const ev = readEvents(events);
    expect(ev).toHaveLength(8);
    // Strict alternation: every start is immediately followed by its own end.
    for (let i = 0; i < ev.length; i += 2) {
      expect(ev[i].kind).toBe('start');
      expect(ev[i + 1]).toMatchObject({ name: ev[i].name, kind: 'end' });
    }
  }, 30000);

  it('serves waiters in arrival order', async () => {
    const logger = loggerScript();
    const events = path.join(tmp, 'events.log');
    const a = runQueue([NODE, logger, events, 'A', '900']);
    await waitFor(() => readEvents(events).length > 0, 'A to start');
    const b = runQueue([NODE, logger, events, 'B', '10']);
    await waitFor(() => b.stderr.includes('Waiting'), 'B to queue');
    const c = runQueue([NODE, logger, events, 'C', '10']);
    await waitFor(() => c.stderr.includes('Waiting'), 'C to queue');
    await Promise.all([a.done, b.done, c.done]);
    expect(readEvents(events).filter((e) => e.kind === 'start').map((e) => e.name)).toEqual(['A', 'B', 'C']);
  }, 30000);

  it('propagates the command exit code', async () => {
    const r = await runQueue([NODE, '-e', 'process.exit(3)']).done;
    expect(r.code).toBe(3);
    expect(fs.existsSync(lockPath())).toBe(false);
  }, 30000);
});

describe('test-queue: cancellation', () => {
  it('terminates the whole subprocess tree before the next run starts', async () => {
    const pidsFile = path.join(tmp, 'pids.json');
    const probeOut = path.join(tmp, 'probe.json');
    const a = runQueue([NODE, treeScript(), pidsFile]);
    await waitFor(() => fs.existsSync(pidsFile), 'tree to start');
    const pids = JSON.parse(fs.readFileSync(pidsFile, 'utf8'));
    spawned.push(...pids);
    const b = runQueue([NODE, probeScript(), pidsFile, probeOut]);
    await waitFor(() => b.stderr.includes('Waiting'), 'B to queue');
    await sleep(200); // let the holder's tracker record the whole tree
    a.child.kill('SIGTERM');
    const ra = await a.done;
    expect(ra.code).toBe(143);
    expect(ra.stderr).toContain('SIGTERM received; stopping the test command');
    expect(ra.stderr).toMatch(/Terminating \d+ leftover test subprocess/);
    expect(ra.stderr).toContain('ignored SIGTERM'); // the stubborn child needed SIGKILL
    const rb = await b.done;
    expect(rb.code).toBe(0);
    // Every process in A's tree was dead when B's command started.
    expect(JSON.parse(fs.readFileSync(probeOut, 'utf8'))).toEqual([]);
    expect(fs.existsSync(lockPath())).toBe(false);
  }, 30000);

  it('lets a cancelled waiter leave the queue without running', async () => {
    const marker = path.join(tmp, 'b-ran');
    const a = runQueue([NODE, '-e', 'setTimeout(() => {}, 60000)']);
    await waitFor(() => fs.existsSync(lockPath()), 'A to hold the lock');
    const b = runQueue([NODE, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x')`]);
    await waitFor(() => b.stderr.includes('Waiting'), 'B to queue');
    expect(fs.readdirSync(path.join(queueDir(), 'queue'))).toHaveLength(1);
    b.child.kill('SIGINT');
    const rb = await b.done;
    expect(rb.code).toBe(130);
    expect(rb.stderr).toContain('SIGINT received while waiting; left the queue.');
    expect(fs.existsSync(marker)).toBe(false);
    expect(fs.readdirSync(path.join(queueDir(), 'queue'))).toHaveLength(0);
    // A still holds the lock and is unaffected.
    expect(JSON.parse(fs.readFileSync(lockPath(), 'utf8')).pid).toBe(a.child.pid);
    a.child.kill('SIGTERM');
    expect((await a.done).code).toBe(143);
  }, 30000);
});

describe('test-queue: stale-lock recovery', () => {
  it('recovers a lock whose owner PID is gone', async () => {
    const gone = spawn(NODE, ['-e', '']);
    await new Promise((resolve) => gone.on('exit', resolve));
    await waitFor(() => !isAlive(gone.pid), 'dead owner to be reaped');
    writeLock({ token: 'deadowner', pid: gone.pid, start: 'Sun Oct 4 10:00:00 2026', host: os.hostname(), cwd: '/gone', command: 'ghost' });
    const r = await runQueue([NODE, '-e', '']).done;
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('Recovering stale lock (process is gone)');
    expect(fs.existsSync(lockPath())).toBe(false);
  }, 30000);

  it('recovers a lock whose PID was reused by an unrelated process', async () => {
    // This vitest worker is alive, but it is not the process that took the lock.
    writeLock({ token: 'reused', pid: process.pid, start: 'Thu Jan 1 00:00:00 1970', host: os.hostname(), cwd: '/old', command: 'old run' });
    const r = await runQueue([NODE, '-e', '']).done;
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('Recovering stale lock (PID now belongs to a different process)');
    expect(isAlive(process.pid)).toBe(true);
  }, 30000);

  it('never steals a live lock, and ignores a forged inherited token', async () => {
    const owner = spawnSleeper();
    await waitFor(() => processStart(owner.pid), 'sleeper to appear in ps');
    writeLock({
      token: 'liveowner', pid: owner.pid, start: processStart(owner.pid), host: os.hostname(),
      cwd: '/elsewhere/worktree', command: 'npm run test:e2e', startedAt: new Date().toISOString(),
    });
    const marker = path.join(tmp, 'ran');
    const b = runQueue([NODE, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x')`], { VECTURA_TEST_QUEUE_TOKEN: 'forged' });
    await waitFor(() => b.stderr.includes('Waiting'), 'B to wait');
    await sleep(300);
    expect(fs.existsSync(marker)).toBe(false);
    expect(b.stderr).toContain('Ignoring inherited VECTURA_TEST_QUEUE_TOKEN');
    expect(b.stderr).toContain(`held by PID ${owner.pid}`);
    expect(b.stderr).toContain('/elsewhere/worktree: npm run test:e2e');
    owner.kill('SIGKILL');
    const rb = await b.done;
    expect(rb.code).toBe(0);
    expect(fs.existsSync(marker)).toBe(true);
  }, 30000);

  it('terminates a SIGKILLed holder\'s orphaned subprocesses before the next run', async () => {
    const pidsFile = path.join(tmp, 'pids.json');
    const probeOut = path.join(tmp, 'probe.json');
    const a = runQueue([NODE, treeScript(), pidsFile]);
    await waitFor(() => fs.existsSync(pidsFile), 'tree to start');
    const pids = JSON.parse(fs.readFileSync(pidsFile, 'utf8'));
    spawned.push(...pids);
    // Wait until the holder has mirrored the whole tree to its procs sidecar.
    const procsDir = path.join(queueDir(), 'procs');
    await waitFor(() => {
      const files = fs.readdirSync(procsDir);
      if (files.length !== 1) return false;
      try {
        const listed = JSON.parse(fs.readFileSync(path.join(procsDir, files[0]), 'utf8')).processes.map((p) => p.pid);
        return pids.every((pid) => listed.includes(pid));
      } catch { return false; }
    }, 'procs sidecar to list the tree');
    a.child.kill('SIGKILL'); // no cleanup possible: the tree is orphaned
    await a.exited;
    expect(pids.every(isAlive)).toBe(true);
    const r = await runQueue([NODE, probeScript(), pidsFile, probeOut]).done;
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('Recovering stale lock (process is gone)');
    expect(r.stderr).toMatch(/Terminating 4 orphaned test subprocess/);
    expect(JSON.parse(fs.readFileSync(probeOut, 'utf8'))).toEqual([]);
    expect(fs.readdirSync(procsDir)).toEqual([]);
  }, 30000);
});

describe('test-queue: nested commands', () => {
  const innerScript = () => writeScript('inner.js', `
require('fs').appendFileSync(process.argv[2], process.argv[3] + '\\n');
`);

  it('runs queued commands inside a queued aggregate without deadlock', async () => {
    const inner = innerScript();
    const out = path.join(tmp, 'out.txt');
    const q = (tag) => `"${NODE}" "${SCRIPT}" "${NODE}" "${inner}" "${out}" ${tag}`;
    const r = await runQueue(['--shell', `${q('unit')} && ${q('integration')} && ${q('perf')}`]).done;
    expect(r.code).toBe(0);
    expect(fs.readFileSync(out, 'utf8')).toBe('unit\nintegration\nperf\n');
    expect(r.stderr).not.toContain('Waiting');
    // The inherited token, not the ancestor fallback, let the nested calls through.
    expect(r.stderr).not.toContain('held by an ancestor');
  }, 30000);

  it('refuses to start a nested step whose parent run is gone', async () => {
    const gone = spawn(NODE, ['-e', '']);
    await new Promise((resolve) => gone.on('exit', resolve));
    await waitFor(() => !isAlive(gone.pid), 'dead parent to be reaped');
    writeLock({ token: 'parentrun', pid: gone.pid, start: 'Sun Oct 4 10:00:00 2026', host: os.hostname(), cwd: '/wt', command: 'npm run test:ci' });
    const marker = path.join(tmp, 'ran');
    const r = await runQueue([NODE, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x')`], { VECTURA_TEST_QUEUE_TOKEN: 'parentrun' }).done;
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('The parent test run');
    expect(fs.existsSync(marker)).toBe(false);
  }, 30000);

  it('does not deadlock when a nested call lost the inherited token', async () => {
    const inner = innerScript();
    const out = path.join(tmp, 'out.txt');
    const lost = writeScript('lost-token.js', `
const { spawnSync } = require('child_process');
const env = { ...process.env };
delete env.VECTURA_TEST_QUEUE_TOKEN;
const r = spawnSync(process.execPath, [${JSON.stringify(SCRIPT)}, process.execPath, ${JSON.stringify(inner)}, ${JSON.stringify(out)}, 'nested'], { env, stdio: 'inherit' });
process.exit(r.status);
`);
    const r = await runQueue([NODE, lost]).done;
    expect(r.code).toBe(0);
    expect(fs.readFileSync(out, 'utf8')).toBe('nested\n');
    expect(r.stderr).toContain('Lock is held by an ancestor process');
  }, 30000);
});

describe('test-queue: shell argument passthrough', () => {
  it('passes args appended to a --shell aggregate through as literal words', async () => {
    const out = path.join(tmp, 'args.json');
    const dump = writeScript('dump.js', `require('fs').writeFileSync(${JSON.stringify(out)}, JSON.stringify(process.argv.slice(2)))`);
    const r = await runQueue(['--shell', `"${NODE}" "${dump}"`, '--grep', 'two words|wc -c', "it's"]).done;
    expect(r.code).toBe(0);
    expect(JSON.parse(fs.readFileSync(out, 'utf8'))).toEqual(['--grep', 'two words|wc -c', "it's"]);
  }, 30000);
});

describe('test-queue: CI', () => {
  it('runs immediately with no lock when CI is set', async () => {
    const owner = spawnSleeper();
    await waitFor(() => processStart(owner.pid), 'sleeper to appear in ps');
    writeLock({ token: 'liveowner', pid: owner.pid, start: processStart(owner.pid), host: os.hostname(), cwd: '/x', command: 'busy' });
    const r = await runQueue([NODE, '-e', 'process.exit(0)'], { CI: 'true' }).done;
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(JSON.parse(fs.readFileSync(lockPath(), 'utf8')).token).toBe('liveowner');
  }, 30000);
});
