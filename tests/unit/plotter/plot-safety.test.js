const safety = require('../../../src/core/plotter/plot-safety.js');
const { PLOTTER_PROFILES, PLOTTER_DEFAULTS } = require('../../../src/config/plotters.js');

const a3 = PLOTTER_PROFILES.find((p) => p.id === 'uunatek-3-a3');
const fw = { 130: 420, 131: 297, 132: 12, 110: 11000, 111: 11000, 112: 5000 };

describe('PlotSafety.classifyCommand', () => {
  test.each([
    '$110=5000', '$130=900', '$ 110 = 5000', '$RST=*', '$RST=$', '$RST=#', '$rst=*', '$SLP', '$I=hello',
    '$N0=G21', '$N1=G90', '$N=1', 'G10 L2 P1 X0', 'G10 L20 P1 X0', 'g10 l20 p1 x0', 'G21 G10 L20 P1 X0',
    'G21G10L20P1X0', 'G28.1', 'G30.1', '$Config/Filename=x', '$CD=1', '$/axes/x/max_travel_mm=500',
    '$H', '$X', '$C', 'M30', 'M2', 'G28', 'G53', 'G21 $110=1', 'M8', 'G38.2 Z-5', 'FOO',
  ])('blocks %s', (line) => {
    const r = safety.classifyCommand(line);
    expect(r.ok).toBe(false);
    expect(r.reason.length).toBeGreaterThan(5);
  });

  test('blocks when any line of a multi-line string is blocked', () => {
    expect(safety.classifyCommand('G21\n$110=5000').ok).toBe(false);
  });

  test('$RST stays blocked even with allowFirmwareWrites', () => {
    expect(safety.classifyCommand('$RST=*', { allowFirmwareWrites: true }).ok).toBe(false);
    expect(safety.classifyCommand('$RST=$', { allowFirmwareWrites: true }).ok).toBe(false);
  });

  test('allowFirmwareWrites unblocks numeric $n=value only', () => {
    const r = safety.classifyCommand('$110=8000', { allowFirmwareWrites: true });
    expect(r).toMatchObject({ ok: true, kind: 'setting' });
    expect(safety.classifyCommand('$SLP', { allowFirmwareWrites: true }).ok).toBe(false);
    expect(safety.classifyCommand('$Config/x=1', { allowFirmwareWrites: true }).ok).toBe(false);
    expect(safety.classifyCommand('G10 L20 P1 X0', { allowFirmwareWrites: true }).ok).toBe(false);
  });

  test('homing and unlock need explicit opt-in', () => {
    expect(safety.classifyCommand('$H')).toMatchObject({ ok: false, kind: 'homing' });
    expect(safety.classifyCommand('$H', { allowHoming: true })).toMatchObject({ ok: true, kind: 'homing' });
    expect(safety.classifyCommand('$X')).toMatchObject({ ok: false, kind: 'unlock' });
    expect(safety.classifyCommand('$x', { allowUnlock: true })).toMatchObject({ ok: true, kind: 'unlock' });
  });

  test.each(['$$', '$I', '$G', '$#', '$N', '$', '?', ' ? '.trim()])('allows query %s', (line) => {
    expect(safety.classifyCommand(line)).toMatchObject({ ok: true, kind: 'query' });
  });

  test('realtime bytes and jog are allowed', () => {
    ['!', '~', '\x18', '\x85'].forEach((c) => expect(safety.classifyCommand(c)).toMatchObject({ ok: true, kind: 'realtime' }));
    expect(safety.classifyCommand('$J=G21G91X1Y1F1000')).toMatchObject({ ok: true, kind: 'jog' });
  });

  test.each([
    'G0 X10 Y10', 'G1 X1.5 Y-2 F3000', 'g1 x1 y1', 'G2 X1 Y1 I0.5 J0', 'G3 X1 Y1 R2', 'G4 P0.05', 'G17', 'G20', 'G21',
    'G90', 'G91', 'G91.1', 'G92 X0 Y0', 'G92.1', 'G53 G0 X0', 'G53 G1 Z0 F100', 'G54', 'G93', 'G94', 'M3 S1000', 'M4', 'M5',
    'F1000', 'X10 Y10 Z1', 'G21 G90', 'G1Z3.5F5000', '', '; just a comment', '(comment)', 'G1 X1 ; trailing',
    'G1 X1 (inline) Y2',
  ])('allows %j', (line) => {
    expect(safety.classifyCommand(line).ok).toBe(true);
  });

  test('a comment cannot hide a blocked command and cannot trigger one', () => {
    expect(safety.classifyCommand('G1 X1 ; $110=5').ok).toBe(true);
    expect(safety.classifyCommand('$110=5 ; harmless').ok).toBe(false);
  });
});

describe('PlotSafety limits', () => {
  test('effectiveWorkArea takes the smaller of profile and firmware', () => {
    expect(safety.effectiveWorkArea(a3, {})).toEqual({ width: 420, height: 297 });
    expect(safety.effectiveWorkArea(a3, undefined)).toEqual({ width: 420, height: 297 });
    expect(safety.effectiveWorkArea(a3, { 130: 300, 131: 500 })).toEqual({ width: 300, height: 297 });
    expect(safety.effectiveWorkArea(a3, { 130: 0, 131: NaN })).toEqual({ width: 420, height: 297 });
  });

  test('clampFeedXY respects profile max, $110 and $111, and a floor of 1', () => {
    expect(safety.clampFeedXY(50000, a3, {})).toBe(11000);
    expect(safety.clampFeedXY(50000, a3, { 110: 8000, 111: 9000 })).toBe(8000);
    expect(safety.clampFeedXY(50000, a3, { 110: 9000, 111: 6000 })).toBe(6000);
    expect(safety.clampFeedXY(2500, a3, fw)).toBe(2500);
    expect(safety.clampFeedXY(-5, a3, fw)).toBe(1);
    expect(safety.clampFeedXY(0, a3, fw)).toBe(1);
  });

  test('clampFeedZ respects maxFeedZ and $112', () => {
    expect(safety.clampFeedZ(9000, a3, {})).toBe(5000);
    expect(safety.clampFeedZ(9000, a3, { 112: 3000 })).toBe(3000);
    expect(safety.clampFeedZ(100, a3, fw)).toBe(100);
  });

  test('clampZ stays within pen limits and $132', () => {
    expect(safety.clampZ(-3, a3, fw)).toBe(0);
    expect(safety.clampZ(11, a3, fw)).toBe(10);
    expect(safety.clampZ(11, a3, { 132: 6 })).toBe(6);
    expect(safety.clampZ(3.5, a3, fw)).toBe(3.5);
  });

  test('NaN never propagates and falls back to profile defaults', () => {
    expect(safety.clampFeedXY(NaN, a3, fw)).toBe(a3.motion.drawFeed);
    expect(safety.clampFeedXY(undefined, a3, fw)).toBe(a3.motion.drawFeed);
    expect(safety.clampFeedZ(NaN, a3, fw)).toBe(a3.pen.zFeed);
    expect(safety.clampZ(NaN, a3, fw)).toBe(a3.pen.up);
    expect(safety.clampZ('abc', a3, fw)).toBe(a3.pen.up);
    expect(Number.isNaN(safety.clampFeedXY(NaN, a3, { 110: NaN }))).toBe(false);
  });
});

describe('PlotSafety.checkJobBounds', () => {
  const area = { width: 420, height: 297 };
  const job = (pts) => ({ pens: [{ paths: [pts] }] });

  test('accepts a job inside the area and reports the bbox', () => {
    const r = safety.checkJobBounds(job([{ x: 0, y: 0 }, { x: 420, y: 297 }, { x: 10, y: 20 }]), area);
    expect(r.ok).toBe(true);
    expect(r.bbox).toEqual({ minX: 0, minY: 0, maxX: 420, maxY: 297 });
    expect(r.overflow).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
  });

  test('computes overflow per side', () => {
    const r = safety.checkJobBounds(job([{ x: -5, y: -2 }, { x: 430.5, y: 300 }]), area);
    expect(r.ok).toBe(false);
    expect(r.overflow.left).toBeCloseTo(5);
    expect(r.overflow.top).toBeCloseTo(2);
    expect(r.overflow.right).toBeCloseTo(10.5);
    expect(r.overflow.bottom).toBeCloseTo(3);
  });

  test('scans every pen and path', () => {
    const j = { pens: [{ paths: [[{ x: 1, y: 1 }]] }, { paths: [[{ x: 1, y: 1 }], [{ x: 0, y: 400 }]] }] };
    const r = safety.checkJobBounds(j, area);
    expect(r.ok).toBe(false);
    expect(r.overflow.bottom).toBeCloseTo(103);
  });

  test('originOffset shifts the allowed range', () => {
    // Work origin sits 100 mm right of machine zero: work x may be -100..320.
    const r = safety.checkJobBounds(job([{ x: -100, y: 0 }, { x: 320, y: 10 }]), area, { originOffset: { x: 100, y: 0 } });
    expect(r.ok).toBe(true);
    const r2 = safety.checkJobBounds(job([{ x: -101, y: 0 }, { x: 321, y: 10 }]), area, { originOffset: { x: 100, y: 0 } });
    expect(r2.ok).toBe(false);
    expect(r2.overflow.left).toBeCloseTo(1);
    expect(r2.overflow.right).toBeCloseTo(1);
  });

  test('empty jobs are ok with no bbox; NaN points are refused', () => {
    expect(safety.checkJobBounds({ pens: [] }, area)).toMatchObject({ ok: true, bbox: null });
    expect(safety.checkJobBounds(job([{ x: NaN, y: 1 }]), area).ok).toBe(false);
  });
});

describe('PlotSafety.validateProfile / normalizeProfile', () => {
  const good = () => safety.normalizeProfile({ id: 'my-plotter', name: 'Mine' });
  const errsOf = (mut) => { const p = good(); mut(p); return safety.validateProfile(p); };

  test('a normalized profile validates', () => {
    expect(safety.validateProfile(good())).toEqual({ ok: true, errors: [] });
  });

  test.each([
    ['NaN feed', (p) => { p.motion.drawFeed = NaN; }],
    ['negative feed', (p) => { p.motion.travelFeed = -1; }],
    ['negative pen up', (p) => { p.pen.up = -1; }],
    ['zMax > 12 for z', (p) => { p.pen.zMax = 13; }],
    ['feed > 20000', (p) => { p.limits.maxFeedXY = 20001; }],
    ['zFeed > 20000', (p) => { p.pen.zFeed = 30000; }],
    ['workArea width > 4000', (p) => { p.workArea.width = 4001; }],
    ['workArea height 0', (p) => { p.workArea.height = 0; }],
    ['workArea negative', (p) => { p.workArea.width = -5; }],
    ['down above zMax', (p) => { p.pen.down = 11; }],
    ['down below zMin', (p) => { p.pen.zMin = 1; p.pen.up = 1; p.pen.down = 0.5; }],
    ['unknown driver', (p) => { p.driver = 'ebb'; }],
    ['unknown mechanism', (p) => { p.pen.mechanism = 'magic'; }],
    ['servo template blocked', (p) => { p.pen.mechanism = 'servo'; p.pen.servoDown = '$110=5000'; }],
    ['servo template missing', (p) => { p.pen.mechanism = 'custom'; p.pen.servoUp = ''; }],
    ['bad preamble', (p) => { p.gcode.preamble = ['G21', 'G10 L20 P1 X0']; }],
    ['bad id', (p) => { p.id = 'Not Kebab'; }],
  ])('rejects %s', (_label, mut) => {
    const r = errsOf(mut);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  test('zMax above 12 is allowed for servo mechanism when templates are valid', () => {
    const r = errsOf((p) => { p.pen.mechanism = 'servo'; p.pen.zMax = 20; });
    expect(r.errors.some((e) => /zMax/.test(e))).toBe(false);
  });

  test('non-object input is rejected', () => {
    expect(safety.validateProfile(null).ok).toBe(false);
  });

  test('normalizeProfile deep-merges onto defaults without mutating them', () => {
    const before = JSON.stringify(PLOTTER_DEFAULTS.profile);
    const p = safety.normalizeProfile({ pen: { down: 4 }, workArea: { width: 100 } });
    expect(p.pen.down).toBe(4);
    expect(p.pen.up).toBe(PLOTTER_DEFAULTS.profile.pen.up);
    expect(p.workArea).toEqual({ width: 100, height: PLOTTER_DEFAULTS.profile.workArea.height });
    p.serial.filters.push({});
    p.gcode.preamble.push('G91');
    expect(JSON.stringify(PLOTTER_DEFAULTS.profile)).toBe(before);
    expect(Object.isFrozen(p)).toBe(false);
  });
});

describe('PlotSafety bounds tolerance', () => {
  const area = { width: 420, height: 297 };
  const job = (pts) => ({ pens: [{ paths: [pts] }] });
  test('accepts overshoot within the tolerance', () => {
    expect(safety.checkJobBounds(job([{ x: -0.015, y: 0 }, { x: 10, y: 297.015 }]), area).ok).toBe(true);
    expect(safety.BOUNDS_TOLERANCE_MM).toBe(0.02);
  });
  test('rejects overshoot beyond the tolerance', () => {
    expect(safety.checkJobBounds(job([{ x: -0.05, y: 0 }]), area).ok).toBe(false);
  });
  test('snapMachineCoord rounds and snaps to 0 and the far edge', () => {
    expect(safety.snapMachineCoord(-0.001, 420)).toBe(0);
    expect(safety.snapMachineCoord(419.99, 420)).toBe(420);
    expect(safety.snapMachineCoord(151.1634, 420)).toBe(151.163);
  });
});
