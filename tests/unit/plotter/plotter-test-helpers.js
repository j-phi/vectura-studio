// Shared fixtures for the plotter controller/simulator tests (not a test file).
const T = require('../../../src/core/plotter/serial-transport.js');
const { PlotterController } = require('../../../src/core/plotter/plotter-controller.js');
const { PLOTTER_PROFILES } = require('../../../src/config/plotters.js');

const a3 = PLOTTER_PROFILES.find((p) => p.id === 'uunatek-3-a3');

const setup = (o) => {
  const opts = o || {};
  const clock = T.createManualClock();
  const sim = new T.SimulatorTransport(Object.assign({ profile: a3, clock }, opts.sim || {}));
  const ctrl = new PlotterController(a3, sim, Object.assign({ scheduler: clock }, opts.ctrl || {}));
  const events = [];
  ['state', 'alarm', 'reset', 'error', 'done', 'penChange', 'progress', 'limit', 'origin'].forEach((name) => {
    ctrl.on(name, (p) => events.push({ name, p }));
  });
  const run = (p, so) => clock.settle(p, so);
  return { clock, sim, ctrl, events, run };
};

const connected = async (o) => {
  const opts = o || {};
  const s = setup(o);
  await s.run(s.ctrl.connect());
  if (!opts.unconfirmed) s.ctrl.confirmMachineCorner(); // tests exercise motion; the box has its own tests
  return s;
};

const connectedWithOrigin = async (o) => {
  const s = await connected(o);
  await s.run(s.ctrl.setOrigin());
  return s;
};

const f = (n) => String(Number(n.toFixed(3)));

// Hand-made job in the PlotJob.toGcode shape. penGroups: [[ [pt,...], ... ], ...]
const makeJob = (penGroups, o) => {
  const opts = Object.assign({ draw: 3000, travel: 6000, up: 0, down: 3.5 }, o || {});
  const lines = ['G21', 'G90', 'G1 Z' + f(opts.up) + ' F5000'];
  const penChangeIndices = [];
  const pathStartIndices = [];
  penGroups.forEach((paths, pi) => {
    paths.forEach((path, i) => {
      if (pi > 0 && i === 0) penChangeIndices.push(lines.length);
      pathStartIndices.push(lines.length);
      lines.push('G1 X' + f(path[0].x) + ' Y' + f(path[0].y) + ' F' + opts.travel);
      lines.push('G1 Z' + f(opts.down) + ' F5000');
      lines.push('G4 P0.05');
      path.slice(1).forEach((pt, k) => {
        lines.push('G1 X' + f(pt.x) + ' Y' + f(pt.y) + (k === 0 ? ' F' + opts.draw : ''));
      });
      lines.push('G1 Z' + f(opts.up) + ' F5000');
    });
  });
  lines.push('G1 X0 Y0 F' + opts.travel);
  return { lines, penChangeIndices, pathStartIndices, pathCount: pathStartIndices.length };
};

const drawnSegments = (penGroups) => {
  const segs = [];
  penGroups.forEach((paths) => paths.forEach((path) => {
    for (let i = 1; i < path.length; i += 1) segs.push({ from: path[i - 1], to: path[i] });
  }));
  return segs;
};

const motionLog = (sim) => sim.getLog().filter((e) => e.dir === 'in' && e.type === 'line' && /^\$J|G0|G1|G2|G3/i.test(e.data));

const until = async (clock, pred, maxMs, step) => {
  const limit = maxMs || 600000;
  const dt = step || 50;
  let t = 0;
  while (!pred() && t < limit) { await clock.advance(dt); t += dt; }
  if (!pred()) throw new Error('until: condition not reached after ' + limit + ' virtual ms');
};

// Every byte the simulated device received must pass the command filter.
const assertAllSafe = (sim) => {
  const safety = require('../../../src/core/plotter/plot-safety.js');
  const bad = [];
  sim.getLog().filter((e) => e.dir === 'in').forEach((e) => {
    const text = e.type === 'realtime' ? e.char : e.data;
    const r = safety.classifyCommand(text, { allowUnlock: true, allowHoming: true });
    if (!r.ok) bad.push(text);
  });
  return bad;
};

// Received traffic as readable labels: lines as text, realtime as '!' '?' '0x18' ...
const wireLabels = (sim) => sim.getLog().filter((e) => e.dir === 'in' && e.type !== 'overflow').map((e) => {
  if (e.type === 'line') return e.data;
  return e.data === 0x3f ? '?' : e.data === 0x21 ? '!' : e.data === 0x7e ? '~' : '0x' + e.data.toString(16);
});

module.exports = { until, assertAllSafe, wireLabels, T, a3, setup, connected, connectedWithOrigin, makeJob, drawnSegments, motionLog, PlotterController };
