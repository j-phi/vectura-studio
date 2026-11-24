const J = require('../../../src/core/plotter/plot-job.js');
const safety = require('../../../src/core/plotter/plot-safety.js');
const { PLOTTER_PROFILES } = require('../../../src/config/plotters.js');

const a3 = PLOTTER_PROFILES.find((p) => p.id === 'uunatek-3-a3');
const servo = PLOTTER_PROFILES.find((p) => p.id === 'generic-grbl-servo');
const DOC = { width: 100, height: 50 };
const RAW = { optimize: { enabled: false } };

const pt = (x, y) => ({ x, y });
const group = (polylines, penId = 'p1') => ({ penId, pen: { id: penId, name: penId, color: '#000', width: 0.3 }, polylines });
const build = (groups, settings, profile = a3, docSize = DOC) => J.buildJob(groups, { settings, profile, docSize });
const withAxes = (axes) => ({ ...a3, axes: { invertX: false, invertY: false, swapXY: false, ...axes } });
const firstPath = (job) => job.pens[0].paths[0];
const close = (p, x, y) => { expect(p.x).toBeCloseTo(x, 9); expect(p.y).toBeCloseTo(y, 9); };
const line = [[pt(10, 20), pt(30, 20)]];

const place = (placement, profile = a3) => firstPath(build([group(line)], { ...RAW, placement }, profile));

describe('PlotJob placement math (exact numbers)', () => {
  test('document mode with offset and scale', () => {
    const p = place({ mode: 'document', offsetX: 5, offsetY: 7, scale: 2, rotate: 0 });
    close(p[0], 25, 47); close(p[1], 65, 47);
  });

  test.each([
    [90, [30, 10], [30, 30]],
    [180, [90, 30], [70, 30]],
    [270, [20, 90], [20, 70]],
  ])('rotate %i about the document center, re-anchored top-left', (rotate, a, b) => {
    const p = place({ mode: 'document', rotate });
    close(p[0], a[0], a[1]); close(p[1], b[0], b[1]);
  });

  test('center mode centers the (scaled, rotated) document in the work area', () => {
    const p = place({ mode: 'center' });
    close(p[0], 170, 143.5);
  });

  test('fit mode scales to the work area and centers', () => {
    const p = place({ mode: 'fit' });
    close(p[0], 42, 127.5); close(p[1], 126, 127.5);
    expect(build([group(line)], { ...RAW, placement: { mode: 'fit' } }).placement.scale).toBeCloseTo(4.2, 9);
  });

  test('invertX / invertY flip the sign about the work origin', () => {
    close(place({}, withAxes({ invertX: true }))[0], -10, 20);
    close(place({}, withAxes({ invertY: true }))[0], 10, -20);
    close(place({}, withAxes({ invertX: true, invertY: true }))[1], -30, -20);
  });

  test('swapXY swaps after inversion', () => {
    close(place({}, withAxes({ swapXY: true }))[0], 20, 10);
    close(place({}, withAxes({ swapXY: true, invertX: true }))[0], 20, -10);
  });

  test('invertY job is in-bounds only with a matching originOffset', () => {
    const prof = withAxes({ invertY: true });
    const mk = (originOffset) => J.buildJob([group(line)], { settings: RAW, profile: prof, docSize: DOC, originOffset });
    expect(mk({ x: 0, y: 297 }).bounds.ok).toBe(true);
    const bad = mk({ x: 0, y: 0 });
    expect(bad.bounds.ok).toBe(false);
    expect(bad.bounds.overflow.top).toBeCloseTo(20, 9);
    const g = J.toGcode(mk({ x: 0, y: 0 }), prof, { originOffset: { x: 0, y: 297 } });
    expect(g.bounds.ok).toBe(true);
    expect(g.lines).toContain('G1 X10 Y-20 F6000');
  });

  test('swatch and scale-check jobs follow the axes transform', () => {
    const prof = withAxes({ invertY: true });
    const sc = J.scaleCheckJob(prof, { offsetX: 20, offsetY: 30, originOffset: { x: 0, y: 297 } });
    expect(sc.pens[0].paths[0].map((p) => [p.x, p.y])).toEqual([[20, -30], [120, -30], [120, -130], [20, -130], [20, -30]]);
    expect(sc.bounds.ok).toBe(true);
    const sw = J.testSwatchJob({ rows: [1000], cols: [2], offsetX: 10, offsetY: 10, originOffset: { x: 0, y: 297 } }, prof);
    expect(Math.max(...sw.pens[0].paths.flat().map((q) => q.y))).toBeLessThanOrEqual(-10);
    expect(sw.bounds.ok).toBe(true);
  });

  test('settings.profileOverrides.axes applies without mutating the profile', () => {
    const job = build([group(line)], { ...RAW, profileOverrides: { axes: { invertX: true } } });
    close(firstPath(job)[0], -10, 20);
    expect(a3.axes.invertX).toBe(false);
  });
});

describe('PlotJob optimizer', () => {
  const opt = (o) => ({ optimize: { enabled: true, simplify: 0.02, minLength: 0, dedupe: true, sort: true, merge: false, mergeTol: 0.1, ...o } });

  test('RDP simplify removes collinear points but keeps corners', () => {
    const job = build([group([[pt(0, 0), pt(5, 0), pt(10, 0), pt(10, 10)]])], opt({}));
    expect(firstPath(job).map((p) => [p.x, p.y])).toEqual([[0, 0], [10, 0], [10, 10]]);
  });

  test('minLength drops short paths', () => {
    const job = build([group([[pt(0, 0), pt(0.5, 0)], [pt(10, 10), pt(20, 10)]])], opt({ minLength: 1 }));
    expect(job.pens[0].paths).toHaveLength(1);
  });

  test('dedupe removes identical and reversed duplicates', () => {
    const a = [pt(1, 1), pt(9, 1)];
    const job = build([group([a, [pt(1, 1), pt(9, 1)], [pt(9, 1), pt(1, 1)], [pt(2, 2), pt(8, 2)]])], opt({}));
    expect(job.pens[0].paths).toHaveLength(2);
    expect(build([group([a, a])], opt({ dedupe: false })).pens[0].paths).toHaveLength(2);
  });

  test('greedy nearest-neighbour sort with reversal', () => {
    const A = [pt(10, 0), pt(20, 0)];
    const B = [pt(50, 0), pt(30, 0)];
    const C = [pt(60, 0), pt(70, 0)];
    const job = build([group([C, B, A])], opt({}));
    expect(job.pens[0].paths.map((p) => [p[0].x, p[p.length - 1].x])).toEqual([[10, 20], [30, 50], [60, 70]]);
  });

  test('sort off keeps input order', () => {
    const A = [pt(10, 0), pt(20, 0)];
    const C = [pt(60, 0), pt(70, 0)];
    const job = build([group([C, A])], opt({ sort: false }));
    expect(job.pens[0].paths.map((p) => p[0].x)).toEqual([60, 10]);
  });

  test('merge joins end-to-start within tolerance only', () => {
    const near = [[pt(0, 0), pt(10, 0)], [pt(10.05, 0), pt(20, 5)]];
    expect(build([group(near)], opt({ merge: true, mergeTol: 0.1, simplify: 0 })).pens[0].paths).toHaveLength(1);
    expect(build([group(near)], opt({ merge: true, mergeTol: 0.01 })).pens[0].paths).toHaveLength(2);
    expect(build([group(near)], opt({ merge: false })).pens[0].paths).toHaveLength(2);
  });

  test('optimize.enabled=false leaves geometry untouched', () => {
    const polys = [[pt(0, 0), pt(5, 0), pt(10, 0)], [pt(0, 0), pt(5, 0), pt(10, 0)]];
    const job = build([group(polys)], RAW);
    expect(job.pens[0].paths).toHaveLength(2);
    expect(job.pens[0].paths[0]).toHaveLength(3);
  });

  test('deterministic', () => {
    const rnd = J.mulberry32(5);
    const polys = Array.from({ length: 60 }, () => [pt(rnd() * 90, rnd() * 40), pt(rnd() * 90, rnd() * 40), pt(rnd() * 90, rnd() * 40)]);
    const a = build([group(polys)], {});
    const b = build([group(polys)], {});
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('PlotJob path order modes and pen selection', () => {
  const polys = Array.from({ length: 8 }, (_, i) => [pt(i * 10, 0), pt(i * 10 + 5, 0)]);
  const starts = (job) => job.pens[0].paths.map((p) => p[0].x);
  const mode = (order, extra) => build([group(polys)], { ...RAW, pens: { p1: { order } }, ...extra });

  test('document and reverse', () => {
    expect(starts(mode('document'))).toEqual([0, 10, 20, 30, 40, 50, 60, 70]);
    expect(starts(mode('reverse'))).toEqual([70, 60, 50, 40, 30, 20, 10, 0]);
  });

  test('random is a seeded permutation', () => {
    const a = starts(mode('random', { seed: 7 }));
    const b = starts(mode('random', { seed: 7 }));
    const c = starts(mode('random', { seed: 8 }));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a.slice().sort((x, y) => x - y)).toEqual([0, 10, 20, 30, 40, 50, 60, 70]);
    expect(a).not.toEqual([0, 10, 20, 30, 40, 50, 60, 70]);
  });

  test('enabledPens and penOrder', () => {
    const groups = [group(line, 'a'), group(line, 'b'), group(line, 'c')];
    expect(build(groups, { ...RAW, enabledPens: ['a', 'c'] }).pens.map((p) => p.penId)).toEqual(['a', 'c']);
    expect(build(groups, { ...RAW, penOrder: ['c', 'a'] }).pens.map((p) => p.penId)).toEqual(['c', 'a', 'b']);
    expect(build(groups, { ...RAW, pens: { b: { enabled: false } } }).pens.map((p) => p.penId)).toEqual(['a', 'c']);
  });
});

describe('PlotJob passes and per-pen settings', () => {
  test('passes repeat each path, alternate flips direction', () => {
    const job = build([group(line)], { ...RAW, pens: { p1: { passes: 3, alternate: true } } });
    const paths = job.pens[0].paths;
    expect(paths).toHaveLength(3);
    expect(paths[0][0].x).toBe(10);
    expect(paths[1][0].x).toBe(30);
    expect(paths[2][0].x).toBe(10);
    expect(job.stats.drawLength).toBeCloseTo(60, 9);
  });

  test('per-pen overrides are clamped by PlotSafety', () => {
    const job = build([group(line)], { ...RAW, pens: { p1: { drawFeed: 99999, down: 50, downDelay: 0.2 } } });
    expect(job.pens[0].settings).toMatchObject({ drawFeed: 11000, down: 10, up: 0, downDelay: 0.2, travelFeed: 6000, zFeed: 5000 });
  });
});

describe('PlotJob reload / dip', () => {
  const long = [[pt(10, 10), pt(110, 10)]];
  const reloadSettings = (reload) => ({ ...RAW, pens: { p1: { reload } } });
  const R = { everyMm: 30, position: { x: 5, y: 5 }, dips: 2, dipDepth: 6, dwell: 0.5 };

  test('splits so pen-down length between reloads <= everyMm', () => {
    const job = build([group(long)], reloadSettings(R), a3, { width: 200, height: 50 });
    const pen = job.pens[0];
    expect(pen.paths.map((p) => Math.round(p[p.length - 1].x - p[0].x))).toEqual([30, 30, 30, 10]);
    expect(pen.reloadBefore).toEqual([0, 1, 2, 3]);
    pen.paths.forEach((p, i) => { if (i) expect(p[0]).toEqual(pen.paths[i - 1][pen.paths[i - 1].length - 1]); });
  });

  test('G-code dips at the reload position and travels back', () => {
    const job = build([group(long)], reloadSettings(R), a3, { width: 200, height: 50 });
    const g = J.toGcode(job, a3);
    expect(g.lines.filter((l) => l === 'G1 X5 Y5 F6000')).toHaveLength(4);
    expect(g.lines.filter((l) => l.startsWith('G1 Z6 '))).toHaveLength(8);
    expect(g.lines).toContain('G4 P0.5');
    expect(g.lines[g.pathStartIndices[0]]).toBe('G1 X5 Y5 F6000');
    g.lines.forEach((l) => expect(safety.classifyCommand(l).ok).toBe(true));
  });

  test('carries the accumulated length across paths', () => {
    const polys = [[pt(0, 0), pt(20, 0)], [pt(0, 5), pt(20, 5)]];
    const job = build([group(polys)], { ...reloadSettings({ everyMm: 30, position: { x: 0, y: 0 } }), ...{ optimize: { enabled: false } } });
    expect(job.pens[0].paths).toHaveLength(3);
    expect(job.pens[0].reloadBefore).toEqual([0, 2]);
  });

  test('dip depth is clamped; reload position must pass bounds', () => {
    const job = build([group(long)], reloadSettings({ ...R, dipDepth: 50 }), a3, { width: 200, height: 50 });
    expect(job.pens[0].reload.dipDepth).toBe(10);
    const bad = build([group(long)], reloadSettings({ ...R, position: { x: -5, y: 5 } }), a3, { width: 200, height: 50 });
    expect(bad.bounds.ok).toBe(false);
    expect(bad.bounds.overflow.left).toBeCloseTo(5, 9);
  });

  test('off by default', () => {
    expect(build([group(long)], RAW).pens[0].reload).toBeNull();
  });
});

describe('PlotJob registration mark', () => {
  test('10 mm cross at the job top-left drawn by every pen', () => {
    const groups = [group([[pt(20, 30), pt(60, 30)]], 'a'), group([[pt(25, 35), pt(80, 45)]], 'b')];
    const job = build(groups, { ...RAW, registrationMark: true });
    job.pens.forEach((pen) => {
      expect(pen.paths).toHaveLength(3);
      expect(pen.paths[0].map((p) => [p.x, p.y])).toEqual([[20, 35], [30, 35]]);
      expect(pen.paths[1].map((p) => [p.x, p.y])).toEqual([[25, 30], [25, 40]]);
    });
  });

  test('off by default', () => {
    expect(build([group(line)], RAW).pens[0].paths).toHaveLength(1);
  });
});

function bigJob(settings, profile = a3) {
  const rnd = J.mulberry32(11);
  const polys = Array.from({ length: 400 }, () => {
    const x = rnd() * 380; const y = rnd() * 250;
    return Array.from({ length: 10 }, (_, i) => pt(x + i * 2 + rnd(), y + rnd() * 5));
  });
  const groups = [group(polys.slice(0, 200), 'a'), group(polys.slice(200), 'b')];
  return J.buildJob(groups, { settings, profile, docSize: { width: 420, height: 297 } });
}

describe('PlotJob.toGcode', () => {
  test('every line passes classifyCommand; no G0; pen up before every travel; ends pen-up', () => {
    const job = bigJob({ registrationMark: true, pens: { a: { passes: 2 } } });
    const g = J.toGcode(job, a3);
    expect(g.lines.length).toBeGreaterThan(3000);
    g.lines.forEach((l) => {
      expect(safety.classifyCommand(l).ok).toBe(true);
      expect(l).not.toMatch(/^G0\b/);
    });
    let down = false;
    let lastZ = null;
    g.lines.forEach((l) => {
      const z = /Z(-?[\d.]+)/.exec(l);
      if (z) { lastZ = parseFloat(z[1]); down = lastZ > 0; return; }
      if (/ F6000$/.test(l) && /X/.test(l)) expect(down).toBe(false);
    });
    expect(lastZ).toBe(0);
    expect(g.lines[g.lines.length - 1]).toBe('G1 X0 Y0 F6000');
    const zLines = g.lines.filter((l) => /Z/.test(l));
    expect(zLines[zLines.length - 1]).toBe('G1 Z0 F5000');
  });

  test('exact output for a small job', () => {
    const job = build([group([[pt(10, 10), pt(50, 10), pt(50, 20)]])], RAW);
    expect(J.toGcode(job, a3).lines).toEqual([
      'G21', 'G90', 'G1 Z0 F5000',
      'G1 X10 Y10 F6000', 'G1 Z3.5 F5000', 'G4 P0.05', 'G1 X50 Y10 F3000', 'G1 X50 Y20', 'G1 Z0 F5000',
      'G1 X0 Y0 F6000',
    ]);
  });

  test('pen-change and path-start indices', () => {
    const job = bigJob({});
    const g = J.toGcode(job, a3);
    expect(g.pathCount).toBe(job.stats.pathCount);
    expect(g.pathStartIndices).toHaveLength(g.pathCount);
    g.pathStartIndices.forEach((i) => expect(g.lines[i]).toMatch(/^G1 X[-\d.]+ Y[-\d.]+ F6000$/));
    expect(g.penChangeIndices).toHaveLength(1);
    const idx = g.penChangeIndices[0];
    expect(g.lines[idx - 1]).toBe('G1 Z0 F5000');
    expect(g.lines[idx]).toBe(g.lines[g.pathStartIndices[job.pens[0].paths.length]]);
    expect(J.toGcode(job, a3, { penChange: 'continue' }).penChangeIndices).toEqual([]);
  });

  test('formatting follows decimals, strips trailing zeros, never emits -0', () => {
    expect(J.formatNumber(1.5, 3)).toBe('1.5');
    expect(J.formatNumber(10, 3)).toBe('10');
    expect(J.formatNumber(-0.0001, 3)).toBe('0');
    expect(J.formatNumber(100, 0)).toBe('100');
    const p1 = { ...a3, gcode: { ...a3.gcode, decimals: 1 } };
    const job = build([group([[pt(10.123, 10.987), pt(50.04, 10)]])], RAW);
    const lines = J.toGcode(job, p1).lines;
    expect(lines).toContain('G1 X10.1 Y11 F6000');
    expect(lines.join('\n')).not.toMatch(/-0\b/);
  });

  test('compact removes spaces and stays classifiable', () => {
    const p1 = { ...a3, gcode: { ...a3.gcode, compact: true } };
    const lines = J.toGcode(build([group(line)], RAW), p1).lines;
    expect(lines).toContain('G1X10Y20F6000');
    lines.forEach((l) => expect(safety.classifyCommand(l).ok).toBe(true));
  });

  test('preamble/postamble come from the profile; return to origin optional', () => {
    const p1 = { ...a3, gcode: { ...a3.gcode, preamble: ['G21', 'G90', 'G17'], postamble: ['G4 P0'] } };
    const lines = J.toGcode(build([group(line)], RAW), p1, { returnToOrigin: false }).lines;
    expect(lines.slice(0, 3)).toEqual(['G21', 'G90', 'G17']);
    expect(lines[lines.length - 1]).toBe('G4 P0');
    expect(lines.join('\n')).not.toContain('X0 Y0');
  });

  test('refuses to emit a blocked template line', () => {
    const bad = { ...servo, pen: { ...servo.pen, servoDown: '$110=5000' } };
    expect(() => J.toGcode(build([group(line)], RAW, bad), bad)).toThrow(/blocked/);
  });

  test('out-of-bounds job is reported, not thrown', () => {
    const job = build([group([[pt(10, 10), pt(500, 10)]])], RAW, a3, { width: 600, height: 50 });
    expect(job.bounds.ok).toBe(false);
    expect(job.bounds.overflow.right).toBeCloseTo(80, 9);
    const g = J.toGcode(job, a3);
    expect(g.bounds.ok).toBe(false);
    const inb = build([group(line)], RAW);
    expect(inb.bounds.ok).toBe(true);
  });

  test('firmware $130/$131 shrink the area used for bounds', () => {
    const job = J.buildJob([group([[pt(10, 10), pt(300, 10)]])], { settings: RAW, profile: a3, docSize: DOC, firmware: { 130: 200, 131: 297 } });
    expect(job.bounds.ok).toBe(false);
    expect(job.bounds.overflow.right).toBeCloseTo(100, 9);
  });
});

describe('PlotJob.airPlot', () => {
  const zValues = (lines) => lines.filter((l) => /Z/.test(l)).map((l) => parseFloat(/Z(-?[\d.]+)/.exec(l)[1]));

  test('never lowers below up (job + reload dips)', () => {
    const job = J.airPlot(bigJob({ pens: { a: { reload: { everyMm: 50, position: { x: 1, y: 1 }, dipDepth: 6 } } } }));
    expect(job.airPlot).toBe(true);
    const zs = zValues(J.toGcode(job, a3).lines);
    expect(zs.length).toBeGreaterThan(100);
    zs.forEach((z) => expect(z).toBe(0));
  });

  test('settings.airPlot and opts.airPlot both apply; original job untouched', () => {
    const job = bigJob({});
    expect(zValues(J.toGcode(job, a3, { airPlot: true }).lines).every((z) => z === 0)).toBe(true);
    expect(Math.max(...zValues(J.toGcode(job, a3).lines))).toBe(3.5);
    const viaSettings = bigJob({ airPlot: true });
    expect(zValues(J.toGcode(viaSettings, a3).lines).every((z) => z === 0)).toBe(true);
  });

  test('servo airPlot never emits the pen-down template', () => {
    const job = J.airPlot(build([group(line)], RAW, servo));
    expect(J.toGcode(job, servo).lines.join('\n')).not.toContain('M3 S1000');
  });
});

describe('PlotJob servo / custom mechanisms', () => {
  test('servo templates replace Z lines', () => {
    const job = build([group([[pt(10, 10), pt(50, 10)]])], RAW, servo);
    const lines = J.toGcode(job, servo).lines;
    expect(lines.some((l) => /Z/.test(l))).toBe(false);
    expect(lines).toContain('M5');
    expect(lines).toContain('M3 S1000');
    const i = lines.indexOf('M3 S1000');
    expect(lines[i - 1]).toBe('G1 X10 Y10 F6000');
    expect(lines[i + 2]).toBe('G1 X50 Y10 F3000');
    expect(lines.indexOf('M5', i)).toBeGreaterThan(i);
    lines.forEach((l) => expect(safety.classifyCommand(l).ok).toBe(true));
  });

  test('custom mechanism substitutes {z} and supports multi-line templates', () => {
    const custom = { ...a3, pen: { ...a3.pen, mechanism: 'custom', servoUp: 'M5', servoDown: 'M3 S{z}\nG4 P0.1' } };
    const lines = J.toGcode(build([group(line)], RAW, custom), custom).lines;
    expect(lines).toContain('M3 S3.5');
    expect(lines).toContain('G4 P0.1');
  });
});

describe('PlotJob helper jobs', () => {
  test('frameJob traces the bbox pen-up', () => {
    const job = J.frameJob({ minX: 10, minY: 20, maxX: 110, maxY: 120 }, a3, { margin: 2 });
    expect(job.pens[0].paths[0].map((p) => [p.x, p.y])).toEqual([[8, 18], [112, 18], [112, 122], [8, 122], [8, 18]]);
    expect(job.bounds.ok).toBe(true);
    const lines = J.toGcode(job, a3).lines;
    lines.filter((l) => /Z/.test(l)).forEach((l) => expect(l).toMatch(/^G1 Z0 /));
    lines.forEach((l) => expect(safety.classifyCommand(l).ok).toBe(true));
    expect(J.frameJob({ minX: 0, minY: 0, maxX: 500, maxY: 10 }, a3).bounds.ok).toBe(false);
  });

  test('testSwatchJob builds one pen entry per patch with its own F and Z', () => {
    const job = J.testSwatchJob({ rows: [1000, 2000], cols: [1, 2, 50], size: 15, gap: 5, pattern: 'hatch', offsetX: 10, offsetY: 10 }, a3);
    expect(job.pens).toHaveLength(6);
    expect(job.pens[0].settings).toMatchObject({ drawFeed: 1000, down: 1 });
    expect(job.pens[5].settings).toMatchObject({ drawFeed: 2000, down: 10 });
    const xs = job.pens.flatMap((p) => p.paths.flat().map((q) => q.x));
    expect(Math.min(...xs)).toBe(10);
    expect(Math.max(...xs)).toBe(10 + 2 * 20 + 15);
    expect(job.bounds.ok).toBe(true);
    const g = J.toGcode(job, a3);
    expect(g.penChangeIndices).toEqual([]);
    expect(g.lines.some((l) => l.includes('F1000'))).toBe(true);
    expect(g.lines.some((l) => l.startsWith('G1 Z1 '))).toBe(true);
    expect(g.lines.some((l) => l.startsWith('G1 Z10 '))).toBe(true);
    g.lines.forEach((l) => expect(safety.classifyCommand(l).ok).toBe(true));
  });

  test.each(['hatch', 'zigzag', 'circle'])('swatch pattern %s produces paths', (pattern) => {
    const job = J.testSwatchJob({ rows: [1500], cols: [3], pattern }, a3);
    expect(job.pens[0].paths.length).toBeGreaterThan(0);
    expect(job.bounds.ok).toBe(true);
  });

  test('scaleCheckJob is a 100 mm square with a 50 mm cross', () => {
    const job = J.scaleCheckJob(a3, { offsetX: 20, offsetY: 30 });
    const [sq, h, v] = job.pens[0].paths;
    expect(sq.map((p) => [p.x, p.y])).toEqual([[20, 30], [120, 30], [120, 130], [20, 130], [20, 30]]);
    expect(h.map((p) => [p.x, p.y])).toEqual([[45, 80], [95, 80]]);
    expect(v.map((p) => [p.x, p.y])).toEqual([[70, 55], [70, 105]]);
    expect(job.bounds.ok).toBe(true);
    J.toGcode(job, a3).lines.forEach((l) => expect(safety.classifyCommand(l).ok).toBe(true));
  });

  test('estimate reports lengths, lifts, time', () => {
    const job = build([group([[pt(10, 10), pt(50, 10)]])], RAW);
    const e = J.estimate(job, a3);
    expect(e.drawLength).toBeCloseTo(40, 9);
    expect(e.pathCount).toBe(1);
    expect(e.penLifts).toBe(1);
    expect(e.travelLength).toBeCloseTo(Math.hypot(10, 10) + Math.hypot(50, 10), 9);
    expect(e.estSeconds).toBeGreaterThan(0.8);
    expect(job.stats).toEqual(e);
  });
});

describe('PlotJob performance', () => {
  const time = (fn) => { const t = performance.now(); const r = fn(); return [performance.now() - t, r]; };

  test('50k points in 500 long paths < 1500 ms', () => {
    const rnd = J.mulberry32(3);
    const polys = Array.from({ length: 500 }, () => {
      const x = rnd() * 400; const y = rnd() * 280;
      return Array.from({ length: 100 }, (_, i) => pt(x + i * 0.2, y + Math.sin(i / 5) * 3 + rnd() * 0.03));
    });
    const [ms, job] = time(() => J.buildJob([group(polys)], { settings: {}, profile: a3, docSize: { width: 420, height: 297 } }));
    expect(ms).toBeLessThan(1500);
    expect(job.stats.pathCount).toBeGreaterThan(0);
    const [ms2] = time(() => J.toGcode(job, a3));
    expect(ms2).toBeLessThan(1500);
  });

  test('50k points in 5000 short paths < 1500 ms', () => {
    const rnd = J.mulberry32(4);
    const polys = Array.from({ length: 5000 }, () => {
      const x = rnd() * 400; const y = rnd() * 280;
      return Array.from({ length: 10 }, (_, i) => pt(x + i, y + rnd() * 3));
    });
    const [ms, job] = time(() => J.buildJob([group(polys)], { settings: {}, profile: a3, docSize: { width: 420, height: 297 } }));
    expect(ms).toBeLessThan(1500);
    expect(job.pens[0].paths.length).toBeGreaterThan(1000);
  });
});
