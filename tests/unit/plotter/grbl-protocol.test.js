const P = require('../../../src/core/plotter/grbl-protocol.js');

describe('GrblProtocol.parseLine', () => {
  test('ok / error / alarm', () => {
    expect(P.parseLine('ok').type).toBe('ok');
    expect(P.parseLine('error:20')).toMatchObject({ type: 'error', code: 20 });
    expect(P.parseLine('error:20').message).toMatch(/unsupported/i);
    expect(P.parseLine('ALARM:2')).toMatchObject({ type: 'alarm', code: 2 });
    expect(P.parseLine('ALARM:3').message).toMatch(/reset while in motion/i);
  });

  test('any line starting with "Grbl " is a banner (DrawCore too)', () => {
    expect(P.parseLine("Grbl 1.1h ['$' for help]")).toMatchObject({ type: 'banner', version: '1.1h' });
    const b = P.parseLine("Grbl 1.1h DrawCore V2.12 ['$' for help]");
    expect(b.type).toBe('banner');
    expect(b.version).toBe('1.1h');
    expect(P.parseLine('Grbl 3.7 [FluidNC v3.7.2]').type).toBe('banner');
  });

  test('VER and OPT info lines; usable RX buffer is min(profile, OPT-1)', () => {
    expect(P.parseLine('[VER:1.1h DrawCore V2.12.20240704:]')).toMatchObject({ type: 'msg', kind: 'VER', ver: '1.1h DrawCore V2.12.20240704' });
    const opt = P.parseLine('[OPT:VZHDL,15,128]');
    expect(opt.opt).toEqual({ flags: 'VZHDL', blocks: 15, rxBuffer: 128 });
    expect(P.usableRxBuffer(127, opt.opt)).toBe(127);
    expect(P.usableRxBuffer(127, { rxBuffer: 64 })).toBe(63);
    expect(P.usableRxBuffer(100, { rxBuffer: 128 })).toBe(100);
    expect(P.usableRxBuffer(127, null)).toBe(127);
  });

  test('status reports with every field', () => {
    const s = P.parseLine('<Hold:0|MPos:10.000,20.500,3.500|WPos:1.000,2.000,3.500|Bf:14,120|FS:3000,0|WCO:9.000,18.500,0.000|Pn:XY>');
    expect(s).toMatchObject({ type: 'status', state: 'Hold', subState: '0' });
    expect(s.mpos).toEqual({ x: 10, y: 20.5, z: 3.5 });
    expect(s.wpos).toEqual({ x: 1, y: 2, z: 3.5 });
    expect(s.wco).toEqual({ x: 9, y: 18.5, z: 0 });
    expect(s.bf).toEqual({ planner: 14, rx: 120 });
    expect(s.fs).toEqual({ feed: 3000, speed: 0 });
    expect(s.pn).toBe('XY');
  });

  test('merged junk: ok glued to a status report', () => {
    const s = P.parseLine('ok<Idle|MPos:1.000,2.000,0.000|FS:0,0>');
    expect(s.type).toBe('status');
    expect(s.alsoOk).toBe(true);
    const list = P.parseLines('ok<Idle|MPos:1.000,2.000,0.000|FS:0,0>');
    expect(list.map((x) => x.type)).toEqual(['ok', 'status']);
    expect(P.parseLines('<Idle|MPos:0,0,0>ok').map((x) => x.type)).toEqual(['status', 'ok']);
  });

  test('settings and messages', () => {
    expect(P.parseLine('$130=420.000')).toMatchObject({ type: 'setting', id: 130, value: 420 });
    expect(P.parseLine('[GC:G0 G54 G17 G21 G90 G94 M5 M9 T0 F0 S0]').modal).toContain('G90');
    expect(P.parseLine('[MSG:Caution: Unlocked]')).toMatchObject({ type: 'msg', kind: 'MSG' });
    expect(P.parseLine('garbage').type).toBe('other');
    expect(P.parseLine('').type).toBe('other');
  });
});

describe('GrblProtocol.parseSettings / scanGcode', () => {
  test('parseSettings returns numbers', () => {
    expect(P.parseSettings(['$130=420.000', '$110=11000.000', 'ok', '$22=0'])).toEqual({ 130: 420, 110: 11000, 22: 0 });
    expect(P.parseSettings('$1=25\n$2=0\nok')).toEqual({ 1: 25, 2: 0 });
  });

  test('scanGcode extracts words and handles comments and $J=', () => {
    const s = P.scanGcode('g1 x10.5 Y-2 F3000 ; hi (c)');
    expect(s).toMatchObject({ X: 10.5, Y: -2, F: 3000, jog: false });
    expect(s.g).toEqual([1]);
    const j = P.scanGcode('$J=G21G91X5Y-5F2000');
    expect(j.jog).toBe(true);
    expect(j.g).toEqual([21, 91]);
    expect(P.scanGcode('$$').error).toBeTruthy();
    expect(P.parseDwellSeconds('G4 P0.05')).toBe(0.05);
    expect(P.parseDwellSeconds('G1 X1')).toBe(0);
  });
});

describe('CharCountingStreamer', () => {
  const mk = (extra) => {
    const written = [];
    const events = { progress: [], errors: [], boundaries: [], done: 0 };
    const s = new P.CharCountingStreamer(Object.assign({
      write: (t) => written.push(t),
      onProgress: (p) => events.progress.push(p),
      onError: (e) => events.errors.push(e),
      onBoundary: (i) => events.boundaries.push(i),
      onDone: () => { events.done += 1; },
    }, extra || {}));
    return { s, written, events };
  };
  const longLines = (n) => Array.from({ length: n }, (_, i) => 'G1 X' + (100 + i) + '.123 Y' + (200 + i) + '.456 F3000');

  test('never exceeds 127 bytes in flight, acks free space', () => {
    const { s, written } = mk();
    const lines = longLines(40);
    s.enqueue(lines);
    expect(s.bytesInFlight).toBeLessThanOrEqual(127);
    expect(written.length).toBeLessThan(40);
    let max = s.bytesInFlight;
    while (!s.isDone()) {
      expect(s.onResponse({ type: 'ok' })).toBe(true);
      max = Math.max(max, s.bytesInFlight);
      expect(s.bytesInFlight).toBeLessThanOrEqual(127);
    }
    expect(written).toEqual(lines);
    expect(max).toBeLessThanOrEqual(127);
  });

  test('reports acked line index and calls onDone once', () => {
    const { s, events } = mk();
    s.enqueue(['G21', 'G90', 'G1 X1 Y1 F100']);
    s.onResponse({ type: 'ok' });
    expect(events.progress[0].ackedIndex).toBe(0);
    s.onResponse({ type: 'ok' });
    s.onResponse({ type: 'ok' });
    expect(s.ackedIndex).toBe(2);
    expect(events.done).toBe(1);
  });

  test('blank and comment-only lines are skipped but indices stay stable', () => {
    const { s, written } = mk();
    s.enqueue(['G21', '', '; note', 'G90 ; trailing', 'G1 X1']);
    expect(written).toEqual(['G21', 'G90', 'G1 X1']);
    s.onResponse({ type: 'ok' }); s.onResponse({ type: 'ok' }); s.onResponse({ type: 'ok' });
    expect(s.ackedIndex).toBe(4);
  });

  test('error response halts the stream and reports the line', () => {
    const { s, written, events } = mk();
    s.enqueue(['G21', 'G90', 'FOO']);
    s.onResponse({ type: 'ok' });
    s.onResponse({ type: 'ok' });
    s.enqueue(['G1 X5']);
    s.onResponse({ type: 'error', code: 20, message: 'bad' });
    expect(events.errors[0]).toMatchObject({ code: 20, index: 2, line: 'FOO' });
    expect(s.halted).toBe(true);
    const n = written.length;
    s.pump();
    expect(written.length).toBe(n);
  });

  test('cancel clears queue and ignores late responses', () => {
    const { s, written } = mk();
    s.enqueue(longLines(30));
    const sent = written.length;
    const info = s.cancel();
    expect(info.droppedInFlight).toBe(sent);
    expect(info.droppedUnsent).toBe(30 - sent);
    expect(s.onResponse({ type: 'ok' })).toBe(false);
    s.pump();
    expect(written.length).toBe(sent);
  });

  test('pauseAt waits for a drained buffer, then releases', () => {
    const { s, written, events } = mk();
    s.pauseAt(2);
    s.enqueue(['G21', 'G90', 'G1 X1', 'G1 X2']);
    expect(written).toEqual(['G21', 'G90']);
    expect(events.boundaries).toEqual([]);
    s.onResponse({ type: 'ok' });
    expect(events.boundaries).toEqual([]);
    s.onResponse({ type: 'ok' });
    expect(events.boundaries).toEqual([2]);
    expect(written.length).toBe(2);
    s.releaseBoundary();
    expect(written).toEqual(['G21', 'G90', 'G1 X1', 'G1 X2']);
  });

  test('forceAck recovers a lost ok', () => {
    const { s, events } = mk();
    s.enqueue(['G21', 'G90']);
    expect(s.forceAck()).toEqual([0, 1]);
    expect(events.done).toBe(1);
  });

  test('over-long line is an error, write failure is an error', () => {
    const a = mk();
    a.s.enqueue(['G1 X' + '1'.repeat(100)]);
    expect(a.events.errors[0].code).toBe('line-too-long');
    const errs = [];
    const s = new P.CharCountingStreamer({ write: () => { throw new Error('boom'); }, onError: (e) => errs.push(e) });
    s.enqueue(['G21']);
    expect(errs[0].code).toBe('write-failed');
  });

  test('reentrant response during write does not break accounting', () => {
    let s;
    const acks = [];
    s = new P.CharCountingStreamer({ write: () => { s.onResponse({ type: 'ok' }); acks.push(1); } });
    s.enqueue(longLines(20));
    expect(s.isDone()).toBe(true);
    expect(s.ackedCount).toBe(20);
  });
});
