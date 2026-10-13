#!/usr/bin/env node

/**
 * Bounded Vitest 4 engine pilot. Every trial calls the queued npm entrypoint,
 * so cancellation, worker cleanup and the shared local test lock stay active.
 * Keep the rosters fixed and small; this is diagnostic evidence, not a suite.
 */

const { spawn, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const ROSTERS = Object.freeze({
  core: [
    'tests/unit/runtime-loader-contract.test.js',
    'tests/unit/scene3d-engine-contract.test.js',
    'tests/unit/scene3d-fill-style-effective-law.test.js',
  ],
  component: [
    'tests/integration/scene3d-fs-c3-panel.test.js',
    'tests/integration/scene3d-style-fill-lines-panel.test.js',
  ],
  app: [
    'tests/integration/scene3d-panel.test.js',
    'tests/integration/scene3d-add-shape.test.js',
  ],
});

const parseArgs = (argv) => {
  const options = { roster: 'core', pool: 'both', workers: 'both', repetitions: 5, warmups: 1, coverage: false };
  for (let i = 0; i < argv.length; i += 1) {
    const [key, inline] = argv[i].split('=', 2);
    const value = inline === undefined ? argv[++i] : inline;
    if (key === '--help' || key === '-h') options.help = true;
    else if (key === '--roster') options.roster = value;
    else if (key === '--pool') options.pool = value;
    else if (key === '--workers') options.workers = value;
    else if (key === '--repetitions') options.repetitions = Number(value);
    else if (key === '--warmups') options.warmups = Number(value);
    else if (key === '--coverage') options.coverage = value === 'true' || value === '1';
    else throw new Error(`Unknown option: ${key}`);
  }
  if (options.help) return options;
  if (options.roster !== 'all' && !Object.hasOwn(ROSTERS, options.roster)) throw new Error(`Unknown roster: ${options.roster}`);
  if (!['forks', 'threads', 'both'].includes(options.pool)) throw new Error('--pool must be forks, threads, or both');
  if (!['1', '2', 'both'].includes(String(options.workers))) throw new Error('--workers must be 1, 2, or both');
  if (!Number.isInteger(options.repetitions) || options.repetitions < 1 || options.repetitions > 5) {
    throw new Error('--repetitions must be an integer from 1 through 5');
  }
  if (!Number.isInteger(options.warmups) || options.warmups < 0 || options.warmups > 1) {
    throw new Error('--warmups must be 0 or 1');
  }
  return options;
};

const packageVersion = (name) => {
  const file = require.resolve(`${name}/package.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8')).version;
};

const cpuTimeSeconds = (raw) => {
  const [whole, fraction = '0'] = String(raw || '0').split('.');
  const fields = whole.split(':').map(Number);
  if (fields.some((part) => !Number.isFinite(part))) return 0;
  if (fields.length === 4) return (((fields[0] * 24 + fields[1]) * 60 + fields[2]) * 60) + fields[3] + Number(`0.${fraction}`);
  if (fields.length === 3) return (fields[0] * 3600) + (fields[1] * 60) + fields[2] + Number(`0.${fraction}`);
  if (fields.length === 2) return (fields[0] * 60) + fields[1] + Number(`0.${fraction}`);
  return (fields[0] || 0) + Number(`0.${fraction}`);
};

const captureWorkingTree = (root) => {
  const runGit = (args, encoding = 'utf8') => spawnSync('git', args, { cwd: root, encoding, maxBuffer: 20 * 1024 * 1024 });
  const status = runGit(['status', '--short', '--untracked-files=all']);
  const diff = runGit(['diff', '--binary', 'HEAD']);
  const untracked = runGit(['ls-files', '--others', '--exclude-standard', '-z'], 'buffer');
  if (status.status !== 0 || diff.status !== 0 || untracked.status !== 0) {
    throw new Error('Unable to capture working-tree state for the benchmark header');
  }
  const hash = crypto.createHash('sha256');
  hash.update(diff.stdout);
  const untrackedPaths = untracked.stdout.toString('utf8').split('\0').filter(Boolean).sort();
  for (const relative of untrackedPaths) {
    hash.update(relative);
    hash.update(fs.readFileSync(path.join(root, relative)));
  }
  return {
    dirty: status.stdout.trim().length > 0,
    dirtyFiles: status.stdout.trim().split('\n').filter(Boolean),
    diffSha256: hash.digest('hex'),
  };
};

const sampleProcessTree = (rootPid) => {
  const result = spawnSync('ps', ['-Ao', 'pid=,ppid=,rss=,time='], { encoding: 'utf8' });
  if (result.status !== 0 || !result.stdout) return null;
  const rows = result.stdout.trim().split('\n').map((line) => {
    const [pid, ppid, rss, cpu, ...tail] = line.trim().split(/\s+/);
    return { pid: Number(pid), ppid: Number(ppid), rssKb: Number(rss), cpu: [cpu, ...tail].join(' ') };
  }).filter((row) => Number.isInteger(row.pid) && Number.isInteger(row.ppid));
  const pids = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (pids.has(row.ppid) && !pids.has(row.pid)) {
        pids.add(row.pid);
        changed = true;
      }
    }
  }
  const descendants = rows.filter((row) => pids.has(row.pid));
  return {
    rssBytes: descendants.reduce((sum, row) => sum + (Number.isFinite(row.rssKb) ? row.rssKb * 1024 : 0), 0),
    cpuSeconds: descendants.reduce((sum, row) => sum + cpuTimeSeconds(row.cpu), 0),
    processCount: descendants.length,
  };
};

const runTrial = ({ pool, workers, files, coverage, label, logDir, deadlineAt }) => new Promise((resolve) => {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = [
    'run', 'test:vitest', '--', 'run', ...files,
    `--pool=${pool}`, `--maxWorkers=${workers}`, '--reporter=default',
  ];
  if (coverage) args.push('--coverage');
  const started = performance.now();
  let output = '';
  let budgetExpired = false;
  let spawnError = null;
  const child = spawn(npm, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  let peakRssBytes = 0;
  let peakProcessCount = 0;
  let cpuSecondsLast = 0;
  let resourceSamples = 0;
  const sampleResources = () => {
    const sample = sampleProcessTree(child.pid);
    if (!sample) return;
    resourceSamples += 1;
    peakRssBytes = Math.max(peakRssBytes, sample.rssBytes);
    peakProcessCount = Math.max(peakProcessCount, sample.processCount);
    cpuSecondsLast = Math.max(cpuSecondsLast, sample.cpuSeconds);
  };
  sampleResources();
  const resourceTimer = setInterval(sampleResources, 250);
  const timer = setTimeout(() => {
    budgetExpired = true;
    child.kill('SIGTERM');
  }, Math.max(1, deadlineAt - Date.now()));
  const forward = (signal) => child.kill(signal);
  process.once('SIGINT', forward);
  process.once('SIGTERM', forward);
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  child.on('error', (error) => { spawnError = error.message; });
  child.on('close', (code, signal) => {
    clearTimeout(timer);
    clearInterval(resourceTimer);
    process.removeListener('SIGINT', forward);
    process.removeListener('SIGTERM', forward);
    const durationMs = Math.round(performance.now() - started);
    const plain = output.replace(/\u001b\[[0-9;]*m/g, '');
    const summary = plain.match(/^\s*Test Files\s+.*$/m)?.[0]?.trim() || null;
    const logName = `${pool}-${workers}w-${label}${coverage ? '-coverage' : ''}.log`;
    const logPath = path.join(logDir, logName);
    fs.writeFileSync(logPath, plain);
    const vitestDuration = plain.match(/^\s*Duration\s+(\d+(?:\.\d+)?)s\b/m);
    resolve({
      label, pool, workers, coverage, durationMs,
      vitestDurationMs: vitestDuration ? Math.round(Number(vitestDuration[1]) * 1000) : null,
      exitCode: code, signal, summary, error: spawnError,
      budgetExpired,
      processTreePeakSampledRssBytes: peakRssBytes || null,
      processTreeCpuSecondsObserved: Number(cpuSecondsLast.toFixed(2)),
      processTreePeakSampledCount: peakProcessCount,
      processTreeSampleCount: resourceSamples,
      logPath,
      outputTail: code === 0 ? undefined : plain.slice(-2500),
    });
  });
});

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(
      'Usage: node scripts/benchmark-test-engine.js [--roster core|component|app|all] ' +
      '[--pool forks|threads|both] [--workers 1|2|both] [--repetitions 1..5] ' +
      '[--warmups 0|1] [--coverage true|false]\n'
    );
    return 0;
  }

  const pools = options.pool === 'both' ? ['forks', 'threads'] : [options.pool];
  const workerCounts = options.workers === 'both' ? [1, 2] : [Number(options.workers)];
  const rosters = options.roster === 'all'
    ? Object.entries(ROSTERS)
    : [[options.roster, ROSTERS[options.roster]]];
  const root = path.resolve(__dirname, '..');
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vectura-vitest-engine-'));
  const header = {
    kind: 'vectura-vitest-engine-pilot',
    sha: require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    workingTree: captureWorkingTree(root),
    node: process.version,
    vitest: packageVersion('vitest'),
    coverageV8: packageVersion('@vitest/coverage-v8'),
    rosters: Object.fromEntries(rosters),
    runtimeClasses: {
      core: 'DOM-free runtime-loader contract and Scene3D feature manifests',
      component: 'legacy runtime profile with minimal JSDOM markup; these existing fixtures do not use the new component manifest',
      app: 'legacy JSDOM fixtures, including full-stack overrides where specified by the test',
    },
    repetitions: options.repetitions,
    warmups: options.warmups,
    coverage: options.coverage,
    logDir,
    commandTemplate: 'npm run test:vitest -- run <files> --pool=<pool> --maxWorkers=<workers> --reporter=default',
    trialModel: 'Each trial starts a fresh Vitest process. The runtime helper compiled-script cache cannot persist across trials; OS filesystem cache is uncontrolled.',
    results: [],
  };
  process.stdout.write(`${JSON.stringify({ ...header, results: undefined })}\n`);
  const deadlineAt = Date.now() + (10 * 60 * 1000);

  for (const [roster, files] of rosters) {
    for (const workers of workerCounts) {
      for (let repetition = 0; repetition < options.repetitions + options.warmups; repetition += 1) {
        const order = repetition % 2 === 0 ? pools : pools.slice().reverse();
        const isWarmup = repetition < options.warmups;
        for (const pool of order) {
          const label = isWarmup ? `discard-${repetition + 1}` : `run-${repetition - options.warmups + 1}`;
          const result = await runTrial({ pool, workers, files, coverage: options.coverage, label: `${roster}-${label}`, logDir, deadlineAt });
          Object.assign(result, { roster });
          process.stdout.write(`${JSON.stringify(result)}\n`);
          if (!isWarmup) header.results.push(result);
          if (result.budgetExpired) return 124;
          if (result.signal) return result.signal === 'SIGINT' ? 130 : result.signal === 'SIGTERM' ? 143 : 1;
          if (result.exitCode !== 0 || result.error) {
            return 1;
          }
        }
      }
    }
  }
  return 0;
};

main().then((code) => { process.exitCode = code; }).catch((error) => {
  process.stderr.write(`[benchmark-test-engine] ${error.message}\n`);
  process.exitCode = 1;
});
