#!/usr/bin/env node

/**
 * Shared local test queue: one heavy test command at a time, machine-wide.
 *
 * Several Claude sessions and worktrees run Vitest and Playwright on this machine
 * at once. Concurrent runs starve each other's CPU (vitest's birpc RPC timeouts,
 * load-flaky perf ratios) and fight over the Playwright web-server port. Every
 * heavy test entrypoint in package.json therefore runs through this wrapper:
 *
 *   node scripts/test-queue.js <command> [args...]
 *   node scripts/test-queue.js --shell '<shell command line>'
 *   node scripts/test-queue.js --status
 *
 * Design:
 *  - ONE lock location, outside every worktree: $VECTURA_TEST_QUEUE_DIR, else
 *    ${XDG_CACHE_HOME:-~/.cache}/vectura-studio/test-queue. All clones and
 *    worktrees on the machine share it.
 *  - Atomic acquisition: the owner record is written to a temp file and then
 *    hard-linked to `lock.json`. link(2) fails with EEXIST if the lock exists, and
 *    a reader never sees a half-written record.
 *  - The owner record holds PID, the process START TIME (from `ps -o lstart`, in
 *    UTC), host, cwd, command and a random token. A lock is stale only when that
 *    PID is gone, is a zombie, or now belongs to a process with a different start
 *    time (PID reuse). When liveness cannot be verified, the lock is NOT stolen.
 *  - Stale recovery is serialized per stale lock with an exclusive claim file
 *    (`reap/<token>`), so two waiters can never both reap — or reap a fresh lock.
 *    A claim whose claimant died is chained (`reap/<token>+<claimant>`).
 *  - FIFO: waiters take a ticket in `queue/`; only the oldest live ticket may
 *    acquire. Tickets of dead waiters are pruned.
 *  - The holder tracks every descendant of the test command (pid + start time)
 *    and mirrors that list to `procs/<token>.json`. On completion or cancellation
 *    it waits for, then terminates, survivors before it releases the lock. If the
 *    holder itself is SIGKILLed, the next waiter terminates the recorded orphans
 *    before it starts.
 *  - Nested calls (an aggregate such as test:ci invoking test:unit) inherit
 *    VECTURA_TEST_QUEUE_TOKEN and pass straight through when it matches the live
 *    lock. A waiter whose ancestor holds the lock also passes through, so a lost
 *    env var cannot deadlock a nested run.
 *  - CI is unchanged: with CI set (or VECTURA_TEST_QUEUE_DISABLE=1) the command
 *    runs directly, with no lock.
 *
 * Status messages go to stderr so reporters on stdout stay clean.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const PREFIX = '[test-queue]';
const LOCK_FILE = 'lock.json';
const TOKEN_ENV = 'VECTURA_TEST_QUEUE_TOKEN';

const envMs = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const settings = () => ({
  pollMs: envMs('VECTURA_TEST_QUEUE_POLL_MS', 1000),
  statusMs: envMs('VECTURA_TEST_QUEUE_STATUS_MS', 30000),
  trackMs: envMs('VECTURA_TEST_QUEUE_TRACK_MS', 1000),
  // After a cancel signal is forwarded: how long the command gets to shut down.
  killGraceMs: envMs('VECTURA_TEST_QUEUE_KILL_GRACE_MS', 10000),
  // After the command exits: how long leftover subprocesses get to exit alone.
  lingerMs: envMs('VECTURA_TEST_QUEUE_LINGER_MS', 3000),
  // Between SIGTERM and SIGKILL when terminating leftover subprocesses.
  termGraceMs: envMs('VECTURA_TEST_QUEUE_TERM_GRACE_MS', 3000),
  // A lock/ticket/claim file that cannot be parsed is treated as live this long.
  corruptGraceMs: envMs('VECTURA_TEST_QUEUE_CORRUPT_GRACE_MS', 10000),
});

const resolveQueueDir = (env = process.env) => (
  env.VECTURA_TEST_QUEUE_DIR
    ? path.resolve(env.VECTURA_TEST_QUEUE_DIR)
    : path.join(env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'vectura-studio', 'test-queue')
);

const queuePaths = (dir) => ({
  dir,
  lock: path.join(dir, LOCK_FILE),
  queue: path.join(dir, 'queue'),
  reap: path.join(dir, 'reap'),
  procs: path.join(dir, 'procs'),
});

const log = (msg) => process.stderr.write(`${PREFIX} ${msg}\n`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomToken = () => crypto.randomBytes(12).toString('hex');

const formatDuration = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

// ---------------------------------------------------------------------------
// Process identity (ps)
// ---------------------------------------------------------------------------

// UTC + C locale: `lstart` must print identically for every caller, whatever its
// TZ, or a live owner would look like a reused PID and lose its lock.
const PS_ENV = { ...process.env, TZ: 'UTC', LC_ALL: 'C', LANG: 'C' };
const PS_FIELDS = 'pid=,ppid=,pgid=,stat=,lstart=,command=';

// One `ps` row. `lstart` is always five whitespace-separated tokens
// ("Sun Oct  4 10:00:00 2026"); they are re-joined with single spaces.
const parsePsLine = (line) => {
  const t = String(line).trim().split(/\s+/);
  if (t.length < 9) return null;
  const [pid, ppid, pgid] = t.slice(0, 3).map(Number);
  if (![pid, ppid, pgid].every(Number.isInteger)) return null;
  return { pid, ppid, pgid, stat: t[3], start: t.slice(4, 9).join(' '), command: t.slice(9).join(' ') };
};

const runPs = (args) => spawnSync('ps', args, { env: PS_ENV, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// Map<pid, row> for every process, or null when ps is unavailable.
const psSnapshot = () => {
  const r = runPs(['-A', '-o', PS_FIELDS]);
  if (r.error || r.status !== 0 || !r.stdout) return null;
  const map = new Map();
  for (const line of r.stdout.split('\n')) {
    const row = parsePsLine(line);
    if (row) map.set(row.pid, row);
  }
  return map;
};

// { ok: false } when ps cannot answer; { ok: true, row } (row null = no process).
const psOne = (pid) => {
  const r = runPs(['-o', PS_FIELDS, '-p', String(pid)]);
  if (r.error) return { ok: false };
  const row = (r.stdout || '').split('\n').map(parsePsLine).find((x) => x && x.pid === pid) || null;
  if (!row && r.status !== 0 && r.status !== 1) return { ok: false };
  return { ok: true, row };
};

const processStart = (pid) => {
  const r = psOne(pid);
  return r.ok && r.row ? r.row.start : null;
};

const isZombie = (row) => typeof row.stat === 'string' && row.stat.startsWith('Z');

// 'alive' | 'dead' for a recorded owner. Anything unverifiable is 'alive': a
// queue that waits too long is recoverable, two concurrent heavy runs are not.
// `host` is recorded for display only: the queue dir is a local cache, and a
// macOS hostname changes with the network, which would pin a dead lock forever.
const ownerState = (rec) => {
  if (!rec || !Number.isInteger(rec.pid) || rec.pid <= 0) return 'dead';
  try {
    process.kill(rec.pid, 0);
  } catch (error) {
    if (error.code === 'ESRCH') return 'dead';
  }
  const r = psOne(rec.pid);
  if (!r.ok) return 'alive';
  if (!r.row || isZombie(r.row)) return 'dead';
  if (rec.start && r.row.start !== rec.start) return 'dead';
  return 'alive';
};

const deadReason = (rec) => {
  if (!rec || !Number.isInteger(rec.pid)) return 'unreadable owner record';
  try {
    process.kill(rec.pid, 0);
  } catch (error) {
    if (error.code === 'ESRCH') return 'process is gone';
  }
  const r = psOne(rec.pid);
  if (r.ok && r.row && isZombie(r.row)) return 'process is a zombie';
  return 'PID now belongs to a different process';
};

// True when `rec` is this process's parent, grandparent, ...
const isAncestor = (rec, snapshot) => {
  if (!rec || !snapshot) return false;
  let cur = snapshot.get(process.pid);
  const seen = new Set();
  while (cur && cur.ppid > 1 && !seen.has(cur.ppid)) {
    seen.add(cur.ppid);
    cur = snapshot.get(cur.ppid);
    if (cur && cur.pid === rec.pid && (!rec.start || cur.start === rec.start)) return true;
  }
  return false;
};

// ---------------------------------------------------------------------------
// Atomic files
// ---------------------------------------------------------------------------

// Create `file` with `data` only if it does not exist. The content is complete
// before the name appears (link(2)); `wx` is a fallback for filesystems without
// hard links, where readers may briefly see an empty file (corruptGraceMs).
const createExclusive = (file, data) => {
  const body = JSON.stringify(data, null, 2);
  const tmp = `${file}.${process.pid}.${randomToken()}.tmp`;
  fs.writeFileSync(tmp, body);
  try {
    fs.linkSync(tmp, file);
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV'].includes(error.code)) throw error;
    try {
      fs.writeFileSync(file, body, { flag: 'wx' });
      return true;
    } catch (fallbackError) {
      if (fallbackError.code === 'EEXIST') return false;
      throw fallbackError;
    }
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
  }
};

const writeAtomic = (file, data) => {
  const tmp = `${file}.${process.pid}.${randomToken()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
};

// null when absent; { data, stat } or { corrupt: true, stat } otherwise.
const readRecord = (file) => {
  let stat;
  let raw;
  try {
    stat = fs.statSync(file);
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  try {
    const data = JSON.parse(raw);
    if (data && typeof data === 'object') return { data, stat };
  } catch { /* fall through */ }
  return { corrupt: true, stat };
};

const unlinkQuiet = (file) => {
  if (!file) return;
  try { fs.unlinkSync(file); } catch { /* already gone */ }
};

const recordState = (record, cfg) => {
  if (record.corrupt) return Date.now() - record.stat.mtimeMs > cfg.corruptGraceMs ? 'dead' : 'alive';
  return ownerState(record.data);
};

const recordKey = (record) => (
  record.corrupt || typeof record.data.token !== 'string' || !/^[A-Za-z0-9_-]+$/.test(record.data.token)
    ? `ino${record.stat.ino}-${Math.round(record.stat.mtimeMs)}`
    : record.data.token
);

const describeOwner = (rec) => {
  if (!rec) return 'an unreadable owner record';
  const since = rec.startedAt ? `, ${formatDuration(Date.now() - Date.parse(rec.startedAt))} ago` : '';
  return `PID ${rec.pid}${since} in ${rec.cwd || '?'}: ${rec.command || '?'}`;
};

// ---------------------------------------------------------------------------
// Subprocess tracking and termination
// ---------------------------------------------------------------------------

// Grow `tracked` (Map<pid, {pid,start,command}>) with every live descendant of
// `roots`, plus every already-tracked process still alive. Tracked processes stay
// roots after their parent dies, so re-parented orphans and their children (for
// example a browser started in its own session) are still found.
const trackDescendants = (tracked, roots, snapshot) => {
  if (!snapshot) return false;
  const children = new Map();
  for (const row of snapshot.values()) {
    if (!children.has(row.ppid)) children.set(row.ppid, []);
    children.get(row.ppid).push(row);
  }
  let changed = false;
  const queue = [];
  for (const pid of roots) if (snapshot.has(pid)) queue.push(snapshot.get(pid));
  for (const t of tracked.values()) {
    const row = snapshot.get(t.pid);
    if (row && row.start === t.start) queue.push(row);
  }
  const seen = new Set();
  while (queue.length) {
    const row = queue.shift();
    if (seen.has(row.pid) || row.pid === process.pid) continue;
    seen.add(row.pid);
    const prev = tracked.get(row.pid);
    if (!prev || prev.start !== row.start) {
      tracked.set(row.pid, { pid: row.pid, start: row.start, command: row.command });
      changed = true;
    }
    for (const child of children.get(row.pid) || []) queue.push(child);
  }
  return changed;
};

// Tracked processes still running with the identity we recorded (zombies count
// as finished: only their parent can reap them). Without ps the identity cannot be
// verified, and a bare PID is never signaled.
const liveTracked = (list, snapshot) => {
  if (!snapshot) return [];
  return list.filter((p) => {
    const row = snapshot.get(p.pid);
    return row && row.start === p.start && !isZombie(row) && p.pid !== process.pid;
  });
};

const signalAll = (list, signal) => {
  for (const p of list) {
    try { process.kill(p.pid, signal); } catch { /* exited meanwhile */ }
  }
};

const waitUntilGone = async (list, ms, step = 50) => {
  const deadline = Date.now() + ms;
  let alive = liveTracked(list, psSnapshot());
  while (alive.length && Date.now() < deadline) {
    await sleep(Math.min(step, Math.max(1, deadline - Date.now())));
    alive = liveTracked(alive, psSnapshot());
  }
  return alive;
};

// Make sure nothing in `list` survives: give it `lingerMs` to exit on its own,
// then SIGTERM, then SIGKILL after `termGraceMs`. Returns how many were signaled.
const terminateAll = async (list, { lingerMs, termGraceMs, label }) => {
  let alive = liveTracked(list, psSnapshot());
  if (!alive.length) return 0;
  if (lingerMs > 0) alive = await waitUntilGone(alive, lingerMs);
  if (!alive.length) return 0;
  const count = alive.length;
  log(`Terminating ${count} ${label}: ${alive.map((p) => `${p.pid} (${p.command.slice(0, 60)})`).join(', ')}`);
  signalAll(alive, 'SIGTERM');
  alive = await waitUntilGone(alive, termGraceMs);
  if (alive.length) {
    log(`Sending SIGKILL to ${alive.length} process(es) that ignored SIGTERM: ${alive.map((p) => p.pid).join(', ')}`);
    signalAll(alive, 'SIGKILL');
    alive = await waitUntilGone(alive, 2000);
    if (alive.length) log(`WARNING: could not terminate ${alive.map((p) => p.pid).join(', ')}`);
  }
  return count;
};

// ---------------------------------------------------------------------------
// Queue tickets, stale-lock recovery, acquisition
// ---------------------------------------------------------------------------

const createTicket = (ctx) => {
  const name = `${String(Date.now()).padStart(15, '0')}-${String(process.pid).padStart(7, '0')}-${randomToken()}.json`;
  const file = path.join(ctx.paths.queue, name);
  writeAtomic(file, { ...ctx.identity, ticket: name });
  return file;
};

// Live tickets, oldest first. Dead waiters' tickets are removed on the way.
const liveTickets = (ctx) => {
  const names = fs.readdirSync(ctx.paths.queue).filter((n) => n.endsWith('.json')).sort();
  const live = [];
  for (const name of names) {
    const file = path.join(ctx.paths.queue, name);
    if (file === ctx.ticket) { live.push({ file, mine: true }); continue; }
    const record = readRecord(file);
    if (!record) continue;
    if (recordState(record, ctx.cfg) === 'dead') { unlinkQuiet(file); continue; }
    live.push({ file, record });
  }
  return live;
};

const removeClaims = (ctx, key) => {
  for (const name of fs.readdirSync(ctx.paths.reap)) {
    if (name === key || name.startsWith(`${key}+`)) unlinkQuiet(path.join(ctx.paths.reap, name));
  }
};

// Recover a stale lock. Only the process that wins the exclusive claim for this
// exact lock (by token) may terminate its orphans and unlink it; the lock cannot
// change underneath the winner because its dead owner cannot release it and no
// one can create a new lock while it exists. Returns 'reaped' | 'busy' | 'changed'.
const reapStaleLock = async (ctx, record) => {
  const key = recordKey(record);
  let name = key;
  let claimPath = null;
  for (let depth = 0; depth < 32 && !claimPath; depth += 1) {
    const candidate = path.join(ctx.paths.reap, name);
    if (createExclusive(candidate, ctx.identity)) { claimPath = candidate; break; }
    const claim = readRecord(candidate);
    if (!claim) continue;
    if (recordState(claim, ctx.cfg) !== 'dead') return 'busy';
    name = `${name}+${recordKey(claim)}`;
  }
  if (!claimPath) return 'busy';
  ctx.claimPath = claimPath;
  try {
    const again = readRecord(ctx.paths.lock);
    if (!again || recordKey(again) !== key) return 'changed';
    const owner = record.corrupt ? null : record.data;
    log(`Recovering stale lock (${owner ? deadReason(owner) : 'unreadable lock file'}) held by ${describeOwner(owner)}`);
    const procsFile = path.join(ctx.paths.procs, `${key}.json`);
    const procs = readRecord(procsFile);
    const recorded = procs && !procs.corrupt && Array.isArray(procs.data.processes) ? procs.data.processes : [];
    // The sidecar lags by up to trackMs: add children the recorded processes
    // spawned after the last write (vitest forks, browsers).
    const expanded = new Map(recorded.filter((p) => Number.isInteger(p.pid)).map((p) => [p.pid, p]));
    trackDescendants(expanded, [], psSnapshot());
    const orphans = [...expanded.values()];
    const killed = await terminateAll(orphans, { lingerMs: 0, termGraceMs: ctx.cfg.termGraceMs, label: 'orphaned test subprocess(es) of the stale run' });
    if (!killed) log('No orphaned test subprocesses survived the stale run.');
    unlinkQuiet(procsFile);
    unlinkQuiet(ctx.paths.lock);
    return 'reaped';
  } finally {
    removeClaims(ctx, key);
    ctx.claimPath = null;
  }
};

const cancellableSleep = (ctx, ms) => new Promise((resolve) => {
  const timer = setTimeout(done, ms);
  function done() { clearTimeout(timer); ctx.wake = null; resolve(); }
  ctx.wake = done;
});

// Resolves 'acquired' or 'nested' (the lock holder is an ancestor), or
// 'cancelled'. Prints a status line when the situation changes and every statusMs.
const acquire = async (ctx) => {
  ctx.ticket = createTicket(ctx);
  const waitStart = Date.now();
  let lastKey = '';
  let lastPrinted = 0;
  const ancestorCache = new Map();
  try {
    while (!ctx.cancelSignal) {
      const lock = readRecord(ctx.paths.lock);
      let message;
      let key; // what the run is waiting on; the message text also holds a ticking age
      if (lock) {
        if (recordState(lock, ctx.cfg) === 'dead') {
          const result = await reapStaleLock(ctx, lock);
          if (result !== 'busy') continue;
          message = 'Another waiter is recovering a stale test lock';
          key = `reap:${recordKey(lock)}`;
        } else {
          const holder = recordKey(lock);
          if (!lock.corrupt && !ancestorCache.has(holder)) ancestorCache.set(holder, isAncestor(lock.data, psSnapshot()));
          if (ancestorCache.get(holder)) {
            log(`Lock is held by an ancestor process (PID ${lock.data.pid}); running nested without a second lock.`);
            return 'nested';
          }
          message = `Waiting for the test lock held by ${describeOwner(lock.corrupt ? null : lock.data)}`;
          key = `lock:${holder}`;
        }
      } else {
        const tickets = liveTickets(ctx);
        const ahead = tickets.findIndex((t) => t.mine);
        if (ahead <= 0) {
          if (createExclusive(ctx.paths.lock, ctx.record)) {
            if (lastPrinted) log(`Test lock acquired after ${formatDuration(Date.now() - waitStart)}.`);
            return 'acquired';
          }
          continue;
        }
        const first = tickets[0].record;
        message = `Waiting behind ${ahead} queued run(s); next: ${describeOwner(first && !first.corrupt ? first.data : null)}`;
        key = `queue:${path.basename(tickets[0].file)}`;
      }
      const tickets = fs.readdirSync(ctx.paths.queue).filter((n) => n.endsWith('.json')).sort();
      const position = tickets.indexOf(path.basename(ctx.ticket)) + 1;
      const now = Date.now();
      if (key !== lastKey || now - lastPrinted >= ctx.cfg.statusMs) {
        const waited = lastPrinted ? ` (waited ${formatDuration(now - waitStart)})` : '';
        log(`${message}. Queue position ${position} of ${tickets.length}${waited}. Lock dir: ${ctx.paths.dir}`);
        if (!lastPrinted) log(`This run: ${ctx.record.command}`);
        lastKey = key;
        lastPrinted = now;
      }
      await cancellableSleep(ctx, ctx.cfg.pollMs);
    }
    return 'cancelled';
  } finally {
    unlinkQuiet(ctx.ticket);
    ctx.ticket = null;
  }
};

// Remove everything this process owns in the queue dir. Synchronous so it also
// runs from the 'exit' handler.
const releaseSync = (ctx) => {
  unlinkQuiet(ctx.ticket);
  ctx.ticket = null;
  unlinkQuiet(ctx.claimPath);
  ctx.claimPath = null;
  if (!ctx.holding) return;
  ctx.holding = false;
  unlinkQuiet(ctx.procsFile);
  try {
    const cur = readRecord(ctx.paths.lock);
    if (cur && !cur.corrupt && cur.data.token === ctx.token) fs.unlinkSync(ctx.paths.lock);
  } catch { /* nothing to release */ }
};

// ---------------------------------------------------------------------------
// Running the command
// ---------------------------------------------------------------------------

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const signalExitCode = (signal) => 128 + (os.constants.signals[signal] || 1);

const spawnCommand = (spec, env) => (
  spec.shell
    ? spawn(spec.command, { stdio: 'inherit', env, shell: true })
    : spawn(spec.argv[0], spec.argv.slice(1), { stdio: 'inherit', env })
);

const waitForExit = (child) => new Promise((resolve) => {
  child.once('error', (error) => {
    log(`Failed to start command: ${error.message}`);
    resolve(error.code === 'ENOENT' ? 127 : 1);
  });
  child.once('exit', (code, signal) => resolve(code ?? (signal ? signalExitCode(signal) : 1)));
});

// No lock: CI, an explicit disable, or a nested call under the lock holder.
// Signals are forwarded to the command, as npm does for its scripts.
const runDirect = async (spec, env) => {
  const child = spawnCommand(spec, env);
  const forward = (signal) => { try { child.kill(signal); } catch { /* exited */ } };
  for (const s of SIGNALS) process.on(s, forward);
  const code = await waitForExit(child);
  for (const s of SIGNALS) process.removeListener(s, forward);
  return code;
};

const runHeld = async (ctx, spec) => {
  const env = { ...process.env, [TOKEN_ENV]: ctx.token };
  const child = spawnCommand(spec, env);
  ctx.child = child;
  const tracked = new Map();
  const track = () => {
    if (!child.pid) return;
    if (trackDescendants(tracked, [child.pid], psSnapshot())) {
      try {
        writeAtomic(ctx.procsFile, { token: ctx.token, owner: ctx.record.pid, processes: [...tracked.values()] });
      } catch { /* best effort; the in-memory list still drives cleanup */ }
    }
  };
  track();
  const timer = setInterval(track, Math.max(10, ctx.cfg.trackMs));
  const code = await waitForExit(child);
  clearInterval(timer);
  ctx.child = null;
  track();
  await terminateAll([...tracked.values()], {
    lingerMs: ctx.cancelSignal ? 0 : ctx.cfg.lingerMs,
    termGraceMs: ctx.cfg.termGraceMs,
    label: 'leftover test subprocess(es)',
  });
  return code;
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = [
  'Usage:',
  '  node scripts/test-queue.js [--] <command> [args...]',
  '  node scripts/test-queue.js --shell "<command line>"',
  '  node scripts/test-queue.js --status',
].join('\n');

const shellQuote = (arg) => `'${String(arg).replace(/'/g, "'\\''")}'`;

const parseArgs = (argv) => {
  if (argv[0] === '--status') return { status: true };
  if (argv[0] === '--help' || argv[0] === '-h') return { help: true };
  if (argv[0] === '--shell') {
    // argv[1] is the shell command line; anything after it was appended by
    // `npm run <script> -- <args>` and must reach the shell as literal words.
    const [line, ...extra] = argv.slice(1);
    if (!line || !line.trim()) return { help: true };
    return { shell: true, command: [line, ...extra.map(shellQuote)].join(' ') };
  }
  const rest = argv[0] === '--' ? argv.slice(1) : argv;
  if (!rest.length) return { help: true };
  return { shell: false, argv: rest, command: rest.join(' ') };
};

const printStatus = (paths) => {
  const lines = [`Lock dir: ${paths.dir}`];
  const lock = fs.existsSync(paths.dir) ? readRecord(paths.lock) : null;
  if (!lock) lines.push('Lock: free');
  else lines.push(`Lock: held by ${describeOwner(lock.corrupt ? null : lock.data)} [${recordState(lock, settings())}]`);
  const tickets = fs.existsSync(paths.queue) ? fs.readdirSync(paths.queue).filter((n) => n.endsWith('.json')).sort() : [];
  lines.push(`Queue: ${tickets.length} waiting`);
  tickets.forEach((name, i) => {
    const t = readRecord(path.join(paths.queue, name));
    lines.push(`  ${i + 1}. ${describeOwner(t && !t.corrupt ? t.data : null)}`);
  });
  process.stdout.write(`${lines.join('\n')}\n`);
};

const main = async (argv = process.argv.slice(2)) => {
  const spec = parseArgs(argv);
  if (spec.help) { process.stderr.write(`${USAGE}\n`); return 2; }
  const paths = queuePaths(resolveQueueDir());
  if (spec.status) { printStatus(paths); return 0; }

  if (process.env.CI || process.env.VECTURA_TEST_QUEUE_DISABLE === '1') {
    return runDirect(spec, process.env);
  }

  for (const dir of [paths.dir, paths.queue, paths.reap, paths.procs]) fs.mkdirSync(dir, { recursive: true });

  const inherited = process.env[TOKEN_ENV];
  if (inherited) {
    const lock = readRecord(paths.lock);
    if (lock && !lock.corrupt && lock.data.token === inherited) {
      if (ownerState(lock.data) === 'alive') return runDirect(spec, process.env);
      // The aggregate that started us was killed; its remaining steps must not
      // queue up (and possibly reap their own ancestors) as an orphaned run.
      log(`The parent test run (${describeOwner(lock.data)}) is gone; not starting: ${spec.command}`);
      return 1;
    }
    log(`Ignoring inherited ${TOKEN_ENV}: it does not match a live lock.`);
  }

  const cfg = settings();
  const token = randomToken();
  const identity = {
    token,
    pid: process.pid,
    start: processStart(process.pid),
    host: os.hostname(),
    cwd: process.cwd(),
    command: spec.command,
    startedAt: new Date().toISOString(),
  };
  const ctx = {
    cfg,
    paths,
    token,
    identity,
    record: { version: 1, ...identity },
    procsFile: path.join(paths.procs, `${token}.json`),
    ticket: null,
    claimPath: null,
    holding: false,
    child: null,
    cancelSignal: null,
    wake: null,
  };

  let firstSignalAt = 0;
  let escalated = false;
  const onSignal = (signal) => {
    const now = Date.now();
    if (!ctx.cancelSignal) {
      ctx.cancelSignal = signal;
      firstSignalAt = now;
      if (ctx.wake) ctx.wake();
      if (ctx.child) {
        log(`${signal} received; stopping the test command (up to ${formatDuration(cfg.killGraceMs)} before forced kill).`);
        try { ctx.child.kill(signal); } catch { /* exited */ }
        const timer = setTimeout(() => { if (ctx.child) ctx.child.kill('SIGKILL'); }, cfg.killGraceMs);
        timer.unref();
      }
      return;
    }
    // A repeat within 1s is the same Ctrl-C arriving twice (terminal + npm).
    if (!escalated && now - firstSignalAt >= 1000 && ctx.child) {
      escalated = true;
      log(`${signal} received again; killing the test command now.`);
      try { ctx.child.kill('SIGKILL'); } catch { /* exited */ }
    }
  };
  for (const s of SIGNALS) process.on(s, onSignal);
  process.on('exit', () => releaseSync(ctx));

  const outcome = await acquire(ctx);
  if (outcome === 'cancelled') {
    releaseSync(ctx);
    log(`${ctx.cancelSignal} received while waiting; left the queue.`);
    return signalExitCode(ctx.cancelSignal);
  }
  if (outcome === 'nested') {
    for (const s of SIGNALS) process.removeListener(s, onSignal);
    return runDirect(spec, process.env);
  }

  ctx.holding = true;
  let code;
  try {
    code = await runHeld(ctx, spec);
  } finally {
    releaseSync(ctx);
  }
  return ctx.cancelSignal ? signalExitCode(ctx.cancelSignal) : code;
};

module.exports = {
  parsePsLine,
  parseArgs,
  ownerState,
  processStart,
  resolveQueueDir,
  trackDescendants,
  main,
};

if (require.main === module) {
  main().then(
    (code) => { process.exitCode = code; },
    (error) => {
      log(`Internal error: ${error && error.stack ? error.stack : error}`);
      process.exitCode = 1;
    },
  );
}
