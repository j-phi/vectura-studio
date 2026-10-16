/* POSIX process-group ownership for test runs. The detached supervisor survives
 * wrapper death; IPC disconnect triggers cleanup without another model turn. */
const { fork, spawn } = require('node:child_process');
const { constants } = require('node:os');
const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const signalStatus = (signal) => 128 + (constants.signals[signal] || 1);

// macOS can briefly report EPERM while exited group members are being reaped.
// Retry briefly, but never treat a persistent permission error as successful cleanup.
async function signalGroup(pgid, signal, kill = process.kill.bind(process)) {
  for (let attempt = 0; ; attempt++) {
    try { kill(-pgid, signal); return true; }
    catch (error) {
      if (error.code === 'ESRCH') return false;
      if (error.code !== 'EPERM' || attempt === 10) throw error;
      await delay(25);
    }
  }
}

function runManaged(command, args, { timeoutMs = 1800000, graceMs = 2000, onOutput = () => {} } = {}) {
  if (process.platform === 'win32') {
    return Promise.resolve({ status: 1, error: 'Vitest cleanup requires POSIX process groups; run this command in WSL.' });
  }
  if (![timeoutMs, graceMs].every((n) => Number.isSafeInteger(n) && n > 0 && n <= 2147483647)) {
    return Promise.resolve({ status: 1, error: 'Timeout and cleanup grace must be positive integer milliseconds (at most 2147483647).' });
  }
  return new Promise((resolve) => {
    const supervisor = fork(__filename, [], { detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let result;
    let cancelled;
    const handlers = new Map(signals.map((signal) => [signal, () => {
      cancelled = cancelled || signal;
      if (supervisor.connected) supervisor.send({ cancel: signal }, () => {});
    }]));
    for (const [signal, handler] of handlers) process.on(signal, handler);
    supervisor.stdout.on('data', (data) => onOutput(data, 'stdout'));
    supervisor.stderr.on('data', (data) => onOutput(data, 'stderr'));
    supervisor.on('message', (message) => { result = message; });
    supervisor.on('error', (error) => { result = { status: 1, error: error.message }; });
    supervisor.on('exit', () => {
      // A cleanup failure may leave a descendant holding these pipes open.
      // Report the failure rather than hanging forever waiting for pipe EOF.
      if (!result || result.error) {
        supervisor.stdout.destroy();
        supervisor.stderr.destroy();
      }
    });
    supervisor.on('close', () => {
      for (const [signal, handler] of handlers) process.removeListener(signal, handler);
      resolve(cancelled ? { ...result, status: signalStatus(cancelled), cancelled: true } :
        result || { status: 1, error: 'Vitest supervisor exited without a result.' });
    });
    supervisor.send({ command, args, timeoutMs, graceMs }, () => {});
  });
}

if (require.main === module) {
  let child;
  let timer;
  let finishing = false;
  let graceMs = 2000;
  const groupExists = () => child?.pid ? signalGroup(child.pid, 0) : false;
  const killGroup = (signal) => child?.pid ? signalGroup(child.pid, signal) : false;
  async function finish(result) {
    if (finishing) return;
    finishing = true;
    clearTimeout(timer);
    try {
      await killGroup('SIGTERM');
      const deadline = Date.now() + graceMs;
      while (await groupExists() && Date.now() < deadline) await delay(25);
      if (await groupExists()) {
        await killGroup('SIGKILL');
        const killDeadline = Date.now() + 2000;
        while (await groupExists() && Date.now() < killDeadline) await delay(25);
        if (await groupExists()) throw new Error('Owned Vitest process group did not exit after SIGKILL.');
      }
    } catch (error) {
      result = { status: 1, error: `Vitest cleanup failed: ${error.message}` };
    }
    if (process.connected) process.send(result, () => process.exit(0));
    else process.exit(0);
  }
  process.on('disconnect', () => finish({ status: 1, cancelled: true }));
  for (const signal of signals) process.on(signal, () => finish({ status: signalStatus(signal), cancelled: true }));
  process.on('message', (message) => {
    if (message.cancel) {
      finish({ status: signalStatus(message.cancel), cancelled: true });
      return;
    }
    if (child || finishing) return;
    graceMs = message.graceMs;
    child = spawn(message.command, message.args, { detached: true, stdio: ['ignore', 'inherit', 'inherit'] });
    timer = setTimeout(() => finish({ status: 124, timedOut: true,
      error: `Vitest exceeded its ${message.timeoutMs}ms run deadline.` }), message.timeoutMs);
    child.on('error', (error) => finish({ status: 1, error: error.message }));
    // 'close' can wait forever when an orphan inherits stdout. Start cleanup at exit.
    child.on('exit', (code, signal) => finish({ status: code ?? signalStatus(signal), signal }));
  });
}

module.exports = { runManaged, signalGroup };
