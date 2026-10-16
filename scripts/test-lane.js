#!/usr/bin/env node
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-lanes.json'), 'utf8'));
const { executionExpired, parseQueueWait } = require('./test-lane-timing');
const lane = process.argv[2];
if (!manifest.lanes[lane]) {
  process.stderr.write(`Unknown test lane '${lane}'. Choose: ${Object.keys(manifest.lanes).join(', ')}\n`);
  process.exit(2);
}
const { command, maxSeconds } = manifest.lanes[lane];
const started = Date.now();
const child = spawn(command, { shell: true, detached: process.platform !== 'win32', stdio: ['inherit', 'pipe', 'pipe'], env: process.env });
let interruptedBy = null;
let queueWaitMs = Number(process.env.VECTURA_TEST_QUEUE_WAIT_MS) || 0;
const streamLines = (stream, target) => {
  let pending = '';
  stream.on('data', (chunk) => {
    const output = chunk.toString();
    target.write(output);
    pending += output;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop();
    for (const line of lines) {
      const parsed = parseQueueWait(line);
      if (parsed !== null) queueWaitMs = parsed;
    }
  });
  stream.on('end', () => {
    const parsed = parseQueueWait(pending);
    if (parsed !== null) queueWaitMs = parsed;
  });
};
streamLines(child.stdout, process.stdout);
streamLines(child.stderr, process.stderr);
const signalChild = (signal) => {
  if (!child.pid) return;
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    if (error.code !== 'ESRCH') process.stderr.write(`[test-lane] Could not forward ${signal}: ${error.message}\n`);
  }
};
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => {
  interruptedBy = signal;
  signalChild(signal);
});
let timedOut = false;
let timer;
const armExecutionTimer = () => {
  timer = setTimeout(() => {
    if (!executionExpired(started, Date.now(), maxSeconds)) { armExecutionTimer(); return; }
    timedOut = true;
    process.stderr.write(`[test-lane] ${lane} exceeded ${maxSeconds}s; terminating and failing.\n`);
    signalChild('SIGTERM');
    const killTimer = setTimeout(() => signalChild('SIGKILL'), 5000);
    killTimer.unref();
  }, Math.max(0, maxSeconds * 1000 - (Date.now() - started)));
};
armExecutionTimer();
const record = (exitCode, signal) => {
  clearTimeout(timer);
  const finalCode = timedOut ? 124 : (interruptedBy ? 130 : (exitCode == null ? 1 : exitCode));
  const row = {
    schemaVersion: 1,
    lane,
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    setupMs: Number(process.env.VECTURA_SETUP_MS) || null,
    queueWaitMs,
    maxSeconds,
    exitCode: finalCode,
    signal: signal || interruptedBy,
    timedOut,
    ci: Boolean(process.env.CI),
    sha: process.env.GITHUB_SHA || null,
    classes: (process.env.VECTURA_RISK_CLASSES || '').split(',').filter(Boolean),
  };
  const destination = process.env.VECTURA_LANE_METRICS_FILE || path.join(os.tmpdir(), 'vectura-test-lane-metrics.jsonl');
  try { fs.appendFileSync(destination, `${JSON.stringify(row)}\n`); }
  catch (error) { process.stderr.write(`[test-lane] Could not write metrics: ${error.message}\n`); }
  process.stderr.write(`[test-lane] ${lane} ${finalCode === 0 ? 'passed' : 'failed'} in ${Math.ceil(row.durationMs / 1000)}s; metrics: ${destination}\n`);
  process.exitCode = finalCode;
};
child.once('error', (error) => { process.stderr.write(`[test-lane] Could not start lane: ${error.message}\n`); record(1); });
child.once('exit', record);
