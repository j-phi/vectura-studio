const { T, a3 } = require('./plotter-test-helpers.js');

const mkSim = async (o) => {
  const clock = T.createManualClock();
  const sim = new T.SimulatorTransport(Object.assign({ profile: a3, clock, resetOnOpen: false }, o || {}));
  const out = [];
  sim.onLine((l) => out.push(l));
  await sim.open();
  const send = async (line, ms) => { sim.writeLine(line); await clock.advance(ms === undefined ? 0 : ms); };
  const rt = async (b, ms) => { sim.writeRealtime(b); await clock.advance(ms === undefined ? 0 : ms); };
  const status = async () => {
    const n = out.length;
    await rt(0x3f);
    return out.slice(n).find((l) => l.startsWith('<'));
  };
  return { clock, sim, out, send, rt, status };
};

describe('SimulatorTransport open / banner', () => {
  test('resetOnOpen: banner arrives after a delay and early writes are lost', async () => {
    const clock = T.createManualClock();
    const sim = new T.SimulatorTransport({ profile: a3, clock });
    const out = [];
    sim.onLine((l) => out.push(l));
    await sim.open();
    sim.writeLine('$$');
    await clock.advance(1000);
    expect(out).toEqual([]);
    await clock.advance(300);
    expect(out[0]).toMatch(/^Grbl 1\.1h/);
    expect(sim.getStats().droppedWhileBooting).toBe(1);
    sim.writeLine('$$');
    await clock.advance(0);
    expect(out.some((l) => l.startsWith('$130='))).toBe(true);
  });

  test('resetOnOpen zeroes position and clears G92 on reopen', async () => {
    const { sim, send, clock } = await mkSim({ initialPosition: { x: 0, y: 0, z: 0 } });
    await send('G1 X10 Y10 F6000', 5000);
    await send('G92 X0 Y0');
    expect(sim.getPosition().wco).toEqual({ x: 10, y: 10, z: 0 });
    await sim.close();
    sim.resetOnOpen = true;
    await sim.open();
    await clock.advance(1300);
    expect(sim.getPosition().wco).toEqual({ x: 0, y: 0, z: 0 });
  });

  test('writing to a closed port throws', async () => {
    const { sim } = await mkSim();
    await sim.close();
    expect(() => sim.writeLine('G21')).toThrow();
    expect(() => sim.writeRealtime(0x3f)).toThrow();
  });
});

describe('SimulatorTransport queries', () => {
  test('$$ reports the documented settings', async () => {
    const { send, out } = await mkSim();
    await send('$$');
    const want = ['$130=420.000', '$131=297.000', '$132=12.000', '$110=11000.000', '$111=11000.000', '$112=5000.000', '$22=0.000', '$20=1.000'];
    want.forEach((w) => expect(out).toContain(w));
    expect(out[out.length - 1]).toBe('ok');
  });

  test('$I and $G and $#', async () => {
    const { send, out } = await mkSim();
    await send('$I');
    expect(out).toContain('[VER:1.1h DrawCore V2.12.20240704:]');
    expect(out).toContain('[OPT:VZHDL,15,128]');
    await send('$G');
    expect(out.some((l) => l.startsWith('[GC:'))).toBe(true);
    await send('$#');
    expect(out.some((l) => l.startsWith('[G92:'))).toBe(true);
  });

  test('error codes for unsupported commands', async () => {
    const { send, out } = await mkSim();
    for (const [line, code] of [['G28', 20], ['G2 X1 Y1 I1', 20], ['M30', 20], ['G20', 20], ['$RST=*', 3], ['$H', 5], ['G1 X1', 22], ['FOO', 1]]) {
      const n = out.length;
      await send(line);
      expect(out.slice(n)).toEqual(['error:' + code]);
    }
  });
});

describe('SimulatorTransport motion', () => {
  test('status report format with WCO after G92', async () => {
    const { send, status } = await mkSim();
    expect(await status()).toMatch(/^<Idle\|MPos:0\.000,0\.000,0\.000\|WPos:0\.000,0\.000,0\.000\|Bf:15,127\|FS:0,0\|WCO:0\.000,0\.000,0\.000>$/);
    await send('G1 X10 Y5 F6000', 60000);
    await send('G92 X0 Y0');
    const s = await status();
    expect(s).toMatch(/MPos:10\.000,5\.000,0\.000\|WPos:0\.000,0\.000,0\.000/);
    expect(s).toMatch(/WCO:10\.000,5\.000,0\.000/);
  });

  test('statusMode mpos / wpos', async () => {
    const a = await mkSim({ statusMode: 'mpos' });
    expect(await a.status()).not.toMatch(/WPos/);
    const b = await mkSim({ statusMode: 'wpos' });
    expect(await b.status()).not.toMatch(/MPos/);
  });

  test('motion takes simulated time, scaled by speed, and reports Run', async () => {
    const { sim, send, clock, status } = await mkSim();
    await send('G1 X60 F3600'); // 60 mm at 60 mm/s = 1 s
    expect(await status()).toMatch(/^<Run/);
    await clock.advance(500);
    expect(sim.getPosition().mpos.x).toBeCloseTo(30, 1);
    await clock.advance(600);
    expect(sim.getPosition().mpos.x).toBeCloseTo(60, 3);
    expect(await status()).toMatch(/^<Idle/);
    const fast = await mkSim({ speed: 10 });
    await fast.send('G1 X60 F3600', 150);
    expect(fast.sim.getPosition().mpos.x).toBeCloseTo(60, 3);
  });

  test('pen-down trace, G4 sync and relative moves', async () => {
    const { sim, send, out } = await mkSim();
    await send('G1 Z3.5 F5000');
    await send('G1 X10 F6000');
    await send('G1 Y10');
    await send('G1 Z0');
    await send('G1 X0 F6000');
    await send('G4 P0', 60000);
    expect(sim.getTrace()).toEqual([
      { from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, z: 3.5 },
      { from: { x: 10, y: 0 }, to: { x: 10, y: 10 }, z: 3.5 },
    ]);
    expect(sim.getPolylines()).toEqual([[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]]);
    expect(out[out.length - 1]).toBe('ok');
  });

  test('pen threshold is configurable', async () => {
    const { sim, send } = await mkSim({ penThreshold: 5 });
    await send('G1 Z3.5 F5000');
    await send('G1 X10 F6000', 60000);
    expect(sim.getTrace()).toEqual([]);
  });

  test('G4 P holds the ok for the dwell, ok count matches line count', async () => {
    const { send, out, clock } = await mkSim();
    await send('G4 P2');
    expect(out).toEqual([]);
    await clock.advance(1900);
    expect(out).toEqual([]);
    await clock.advance(200);
    expect(out).toEqual(['ok']);
  });

  test('G1 without F is error:22 but G0 works at rapid rate', async () => {
    const { send, out, sim } = await mkSim();
    await send('G0 X10', 60000);
    expect(out).toEqual(['ok']);
    expect(sim.getPosition().mpos.x).toBe(10);
  });
});

describe('SimulatorTransport char counting', () => {
  test('records max unacked bytes and counts overflow', async () => {
    const { sim, send, out } = await mkSim();
    // fill the planner so lines stay unacked in the RX buffer
    for (let i = 0; i < 15; i += 1) await send('G1 X' + (i + 1) + ' F60');
    expect(out.length).toBe(15);
    const long = 'G1 X100.123 Y100.123 F60';
    let sent = 0;
    while (sim.getStats().overflowCount === 0 && sent < 20) { await send(long); sent += 1; }
    expect(sim.getStats().overflowCount).toBe(1);
    expect(sim.getStats().maxRxBytes).toBeLessThanOrEqual(127);
  });

  test('planner-full blocks oks until a block completes', async () => {
    const { send, out, clock } = await mkSim();
    for (let i = 0; i < 16; i += 1) await send('G1 X' + (i + 1) + ' F600');
    expect(out.length).toBe(15);
    await clock.advance(1200);
    expect(out.length).toBe(16);
  });
});

describe('SimulatorTransport realtime', () => {
  test('feed hold freezes motion, resume continues', async () => {
    const { sim, send, rt, clock, status } = await mkSim();
    await send('G1 X60 F3600');
    await clock.advance(500);
    await rt(0x21);
    expect(await status()).toMatch(/^<Hold:0/);
    const held = sim.getPosition().mpos.x;
    await clock.advance(5000);
    expect(sim.getPosition().mpos.x).toBeCloseTo(held, 6);
    await rt(0x7e);
    await clock.advance(1000);
    expect(sim.getPosition().mpos.x).toBeCloseTo(60, 3);
  });

  test('holdDecelMs reports Hold:1 first', async () => {
    const { send, rt, clock, status } = await mkSim({ holdDecelMs: 200 });
    await send('G1 X60 F3600');
    await clock.advance(300);
    await rt(0x21);
    expect(await status()).toMatch(/^<Hold:1/);
    await clock.advance(250);
    expect(await status()).toMatch(/^<Hold:0/);
  });

  test('reset in motion: banner then ALARM:3 and position-lost flag', async () => {
    const { sim, send, rt, clock, out, status } = await mkSim();
    await send('G92 X0 Y0');
    await send('G1 X60 F3600');
    await clock.advance(500);
    const n = out.length;
    await rt(0x18);
    expect(out.slice(n)[0]).toMatch(/^Grbl/);
    expect(out.slice(n)).toContain('ALARM:3');
    expect(sim.getPosition().positionLost).toBe(true);
    expect(await status()).toMatch(/^<Alarm/);
    const m = out.length;
    await send('G1 X1 F100');
    expect(out.slice(m)).toEqual(['error:9']);
    await send('$X');
    expect(await status()).toMatch(/^<Idle/);
  });

  test('reset while idle (or after a completed hold) raises no alarm and clears G92', async () => {
    const { sim, send, rt, out, clock } = await mkSim();
    await send('G1 X10 F6000', 5000);
    await send('G92 X0 Y0');
    await rt(0x18);
    expect(out.some((l) => l.startsWith('ALARM'))).toBe(false);
    expect(sim.getPosition().wco).toEqual({ x: 0, y: 0, z: 0 });
    await send('G1 X60 F3600');
    await clock.advance(200);
    await rt(0x21);
    await rt(0x18);
    expect(out.some((l) => l.startsWith('ALARM'))).toBe(false);
  });

  test('0x85 cancels jogging; $J supports G90 and G91 and rejects bad targets', async () => {
    const { sim, send, rt, clock, out } = await mkSim();
    await send('$J=G21G91X50F3000');
    await clock.advance(200);
    await rt(0x85);
    const x = sim.getPosition().mpos.x;
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(50);
    await clock.advance(5000);
    expect(sim.getPosition().mpos.x).toBeCloseTo(x, 6);
    await send('$J=G21G90X5Y5F6000', 5000);
    expect(sim.getPosition().mpos.x).toBeCloseTo(5, 3);
    const n = out.length;
    await send('$J=G21G90X9999F6000');
    expect(out.slice(n)).toEqual(['error:15']);
    await send('$J=G21G90X5');
    expect(out[out.length - 1]).toBe('error:22');
    expect(sim.getState()).toBe('Idle');
  });

  test('$J while running is error:8', async () => {
    const { send, out } = await mkSim();
    await send('G1 X60 F60');
    await send('$J=G21G91X1F100');
    expect(out).toEqual(['ok', 'error:8']);
  });
});

describe('SimulatorTransport alarms', () => {
  test('soft limit: queued motion finishes, then ALARM:2, later lines get error:9, $X recovers', async () => {
    const { sim, send, out, clock } = await mkSim();
    await send('G1 X10 F6000');
    await send('G1 X500 F6000'); // beyond $130
    expect(out).toEqual(['ok']);
    await clock.advance(5000);
    expect(out).toContain('ALARM:2');
    expect(sim.getPosition().mpos.x).toBe(10);
    await send('G1 X5 F6000');
    expect(out[out.length - 1]).toBe('error:9');
    await send('$X');
    expect(out[out.length - 1]).toBe('ok');
    expect(sim.getState()).toBe('Idle');
  });

  test('negative machine target is a soft limit violation', async () => {
    const { send, out, clock } = await mkSim();
    await send('G1 X-1 F6000', 100);
    expect(out).toContain('ALARM:2');
  });

  test('G92 shifts the soft-limit window (targets are checked in machine space)', async () => {
    const { send, out, clock } = await mkSim();
    await send('G1 X100 F6000', 60000);
    await send('G92 X0');
    await send('G1 X-50 F6000', 60000); // machine 50: fine
    expect(out.filter((l) => l.startsWith('ALARM'))).toEqual([]);
    await send('G1 X-150 F6000', 60000); // machine -50: alarm
    expect(out).toContain('ALARM:2');
  });

  test('$H is accepted when $22=1', async () => {
    const { send, out, sim } = await mkSim({ settings: { 22: 1 } });
    await send('G1 X10 F6000', 60000);
    await send('$H');
    expect(out[out.length - 1]).toBe('ok');
    expect(sim.getPosition().mpos.x).toBe(0);
  });

  test('setting writes are accepted when idle and recorded', async () => {
    const { send, out, sim } = await mkSim();
    await send('$110=5000');
    expect(out).toEqual(['ok']);
    expect(sim.getStats().settingWrites).toEqual(['$110=5000']);
  });
});

describe('SimulatorTransport faults', () => {
  test('dropOk suppresses exactly one ok', async () => {
    const { sim, send, out } = await mkSim();
    sim.injectFault({ type: 'dropOk', afterLines: 2 });
    await send('G21');
    await send('G90');
    await send('G17');
    expect(out).toEqual(['ok', 'ok']);
    expect(sim.getLog().some((e) => e.type === 'dropped')).toBe(true);
  });

  test('dropOk by pattern', async () => {
    const { sim, send, out } = await mkSim();
    sim.injectFault({ type: 'dropOk', match: /G90/ });
    await send('G21');
    await send('G90');
    expect(out).toEqual(['ok']);
  });

  test('disconnect fires callbacks and blocks later writes', async () => {
    const { sim, send, clock } = await mkSim();
    const reasons = [];
    sim.onDisconnect((r) => reasons.push(r));
    sim.injectFault({ type: 'disconnect', afterLines: 1 });
    await send('G21');
    expect(reasons.length).toBe(1);
    expect(sim.isOpen).toBe(false);
    expect(() => sim.writeLine('G21')).toThrow();
  });

  test('immediate disconnect and alarm', async () => {
    const a = await mkSim();
    a.sim.injectFault({ type: 'alarm', code: 1 });
    await a.clock.advance(0);
    expect(a.out).toContain('ALARM:1');
    expect(a.sim.getPosition().positionLost).toBe(true);
    const b = await mkSim();
    const r = [];
    b.sim.onDisconnect((x) => r.push(x));
    b.sim.injectFault({ type: 'disconnect' });
    await b.clock.advance(0);
    expect(r.length).toBe(1);
  });

  test('alarm fault after N lines', async () => {
    const { sim, send, out } = await mkSim();
    sim.injectFault({ type: 'alarm', code: 2, afterLines: 2 });
    await send('G21');
    await send('G90');
    expect(out).toContain('ALARM:2');
  });
});

describe('SimulatorTransport log', () => {
  test('logs every received line and realtime byte', async () => {
    const { send, rt, sim } = await mkSim();
    await send('G21');
    await rt(0x3f);
    await rt(0x85);
    const rx = sim.getLog().filter((e) => e.dir === 'in');
    expect(rx.map((e) => e.data)).toEqual(['G21', 0x3f, 0x85]);
    expect(sim.getStats().realtime['0x85']).toBe(1);
  });
});

describe('createManualClock', () => {
  test('runs timers in order including intervals and rescheduling', async () => {
    const c = T.createManualClock();
    const order = [];
    c.setTimeout(() => { order.push('a'); c.setTimeout(() => order.push('c'), 10); }, 5);
    c.setTimeout(() => order.push('b'), 8);
    const iv = c.setInterval(() => order.push('i'), 10);
    await c.advance(20);
    c.clearInterval(iv);
    expect(order).toEqual(['a', 'b', 'i', 'c', 'i']);
    expect(c.now()).toBe(20);
  });
});
