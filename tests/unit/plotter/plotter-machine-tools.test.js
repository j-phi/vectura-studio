/**
 * @vitest-environment node
 * Machine + Console tabs of Send to Plotter. A real PlotterController talks to the
 * SimulatorTransport under a manual clock; never a real serial port.
 */
const { loadUIComponent } = require('../../helpers/load-ui-component');
const { connected, connectedWithOrigin, PlotterController } = require('./plotter-test-helpers.js');
const PlotJob = require('../../../src/core/plotter/plot-job.js');
const { PLOTTER_PROFILES } = require('../../../src/config/plotters.js');

const clone = (v) => JSON.parse(JSON.stringify(v));
const merge = (a, b) => {
  Object.keys(b).forEach((k) => {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) { a[k] = merge(a[k] && typeof a[k] === 'object' ? a[k] : {}, b[k]); } else a[k] = b[k];
  });
  return a;
};

let env;
let mounted;
beforeEach(() => {
  env = loadUIComponent(['src/ui/plotter-machine-tools']);
  env.window.Vectura.PlotJob = PlotJob;
  mounted = [];
});
afterEach(() => {
  mounted.forEach((m) => { try { m.destroy(); } catch (e) { /* already destroyed */ } });
  env.cleanup();
  PlotterController.resetOwnership();
  vi.restoreAllMocks();
});

const Tools = () => env.window.Vectura.PlotterMachineTools;

// s: result of connected() or null. Returns a fake ctx plus helpers.
const makeCtx = (s, o) => {
  const opts = o || {};
  const profile = clone(PLOTTER_PROFILES.find((p) => p.id === 'uunatek-3-a3'));
  if (opts.profile) merge(profile, opts.profile);
  const ref = { ctrl: opts.ctrl || (s ? s.ctrl : null) };
  const overrides = [];
  const logs = [];
  const ctx = {
    getController: () => ref.ctrl,
    getProfile: () => profile,
    getFirmware: () => (ref.ctrl ? ref.ctrl.fw : {}),
    getSettings: () => ({}),
    saveSettings: vi.fn(),
    setProfileOverride: vi.fn((patch) => { overrides.push(patch); merge(profile, patch); }),
    getJobBbox: () => opts.bbox || null,
    getOriginOffset: () => ({ x: 0, y: 0 }),
    log: (m, l) => logs.push({ m, l }),
    requestTab: vi.fn(),
    scheduler: s ? s.clock : { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (i) => clearTimeout(i) },
  };
  return { ctx, ref, profile, overrides, logs };
};

const mountWith = (kind, s, o) => {
  const f = makeCtx(s, o);
  const host = env.document.createElement('div');
  env.document.body.appendChild(host);
  const tool = Tools()[kind](host, f.ctx);
  mounted.push(tool);
  return Object.assign(f, { host, tool, q: (sel) => host.querySelector(sel), qa: (sel) => Array.from(host.querySelectorAll(sel)) });
};
const mountMachine = (s, o) => mountWith('mountMachine', s, o);
const mountConsole = (s, o) => mountWith('mountConsole', s, o);

const flush = (s, ms) => s.clock.advance(ms || 3000);
const ev = (type, init) => new env.window.Event(type, Object.assign({ bubbles: true }, init || {}));
const key = (type, k, init) => new env.window.KeyboardEvent(type, Object.assign({ key: k, bubbles: true }, init || {}));
const act = (m, name) => m.q('[data-stp-act="' + name + '"]');

describe('no controller', () => {
  test('machine controls are disabled with a reason', () => {
    const m = mountMachine(null);
    m.qa('[data-stp-jog]').forEach((b) => expect(b.disabled).toBe(true));
    ['pen-up', 'pen-down', 'set-origin', 'goto-origin', 'frame'].forEach((n) => expect(act(m, n).disabled).toBe(true));
    expect(m.q('[data-stp-field="pen-z"]').disabled).toBe(true);
    m.qa('[data-stp-wizard]').forEach((b) => expect(b.disabled).toBe(true));
    expect(m.host.textContent).toMatch(/Connect to a plotter/);
    expect(m.host.textContent).toMatch(/Not connected/);
  });

  test('console input and quick buttons are disabled', () => {
    const c = mountConsole(null);
    expect(c.q('[data-stp-field="command"]').disabled).toBe(true);
    c.qa('[data-stp-quick]').forEach((b) => expect(b.disabled).toBe(true));
  });
});

describe('jog pad', () => {
  test('buttons call controller.jog with the paper direction mapped through the axes', async () => {
    const s = await connectedWithOrigin();
    const m = mountMachine(s);
    const jog = vi.spyOn(s.ctrl, 'jog');
    m.q('[data-stp-jog="e"]').click();
    await flush(s);
    expect(jog).toHaveBeenLastCalledWith(1, 0, 2500);
    m.q('[data-stp-step="10"]').click();
    m.q('[data-stp-jog="s"]').click();
    await flush(s);
    expect(jog).toHaveBeenLastCalledWith(0, 10, 2500);
    m.q('[data-stp-jog="nw"]').click();
    await flush(s);
    expect(jog).toHaveBeenLastCalledWith(-10, -10, 2500);

    m.profile.axes = { invertX: true, invertY: false, swapXY: false };
    m.q('[data-stp-jog="e"]').click();
    await flush(s);
    expect(jog).toHaveBeenLastCalledWith(-10, 0, 2500);

    m.profile.axes = { invertX: false, invertY: true, swapXY: true };
    m.q('[data-stp-jog="e"]').click(); // paper right -> machine +Y after the swap
    await flush(s);
    expect(jog).toHaveBeenLastCalledWith(0, 10, 2500);
    m.q('[data-stp-jog="s"]').click(); // paper down, invertY then swap -> machine -X
    await flush(s);
    expect(jog).toHaveBeenLastCalledWith(-10, 0, 2500);
  });

  test('the simulated pen really moves', async () => {
    const s = await connectedWithOrigin();
    const m = mountMachine(s);
    m.q('[data-stp-step="10"]').click();
    m.q('[data-stp-jog="e"]').click();
    await flush(s, 8000);
    expect(s.sim.getPosition().mpos.x).toBeCloseTo(10, 2);
    expect(m.q('[data-stp-pos="wpos-x"]').textContent).toBe('10.000');
  });

  test('speed is clamped to the profile maxJogFeed', async () => {
    const s = await connectedWithOrigin();
    const m = mountMachine(s);
    const jog = vi.spyOn(s.ctrl, 'jog');
    const input = m.q('[data-stp-field="jog-feed"]');
    input.value = '99999';
    input.dispatchEvent(ev('change'));
    m.q('[data-stp-jog="e"]').click();
    await flush(s);
    expect(jog).toHaveBeenLastCalledWith(1, 0, 6000);
  });

  test('keyboard arrows use Shift x10 and Alt x0.1; Page keys move the pen', async () => {
    const s = await connectedWithOrigin();
    const m = mountMachine(s);
    const jog = vi.spyOn(s.ctrl, 'jog');
    const pad = m.q('[data-stp-pad]');
    pad.dispatchEvent(key('keydown', 'ArrowRight', { shiftKey: true }));
    await flush(s);
    expect(jog).toHaveBeenLastCalledWith(10, 0, 2500);
    pad.dispatchEvent(key('keydown', 'ArrowUp', { altKey: true }));
    await flush(s);
    expect(jog).toHaveBeenLastCalledWith(0, -0.1, 2500);
    const down = vi.spyOn(s.ctrl, 'penDown');
    const up = vi.spyOn(s.ctrl, 'penUp');
    pad.dispatchEvent(key('keydown', 'PageDown'));
    await flush(s);
    pad.dispatchEvent(key('keydown', 'PageUp'));
    await flush(s);
    expect(down).toHaveBeenCalledTimes(1);
    expect(up).toHaveBeenCalledTimes(1);
  });

  test('a short press steps once; the click that follows is ignored', async () => {
    const s = await connectedWithOrigin();
    const m = mountMachine(s);
    const jog = vi.spyOn(s.ctrl, 'jog');
    const start = vi.spyOn(s.ctrl, 'jogContinuousStart');
    const b = m.q('[data-stp-jog="e"]');
    b.dispatchEvent(ev('pointerdown'));
    await s.clock.advance(50);
    b.dispatchEvent(ev('pointerup'));
    b.click();
    await flush(s);
    expect(jog).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  });

  test('press and hold jogs continuously and stops on pointerup', async () => {
    const s = await connectedWithOrigin();
    const m = mountMachine(s);
    const start = vi.spyOn(s.ctrl, 'jogContinuousStart');
    const stop = vi.spyOn(s.ctrl, 'jogContinuousStop');
    const jog = vi.spyOn(s.ctrl, 'jog');
    const b = m.q('[data-stp-jog="e"]');
    b.dispatchEvent(ev('pointerdown'));
    await s.clock.advance(400);
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0][0]).toEqual({ x: 1, y: 0 });
    expect(stop).not.toHaveBeenCalled();
    b.dispatchEvent(ev('pointerup'));
    await flush(s);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(jog).not.toHaveBeenCalled();
    expect(s.ctrl._jogLoop).toBeNull();
  });

  test.each([['pointercancel'], ['escape'], ['blur']])('continuous jog stops on %s', async (how) => {
    const s = await connectedWithOrigin();
    const m = mountMachine(s);
    const stop = vi.spyOn(s.ctrl, 'jogContinuousStop');
    const b = m.q('[data-stp-jog="s"]');
    b.dispatchEvent(ev('pointerdown'));
    await s.clock.advance(400);
    if (how === 'pointercancel') b.dispatchEvent(ev('pointercancel'));
    else if (how === 'escape') env.document.dispatchEvent(key('keydown', 'Escape'));
    else env.window.dispatchEvent(ev('blur'));
    await flush(s);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(s.ctrl._jogLoop).toBeNull();
  });

  test('destroy stops a continuous jog and removes the listeners', async () => {
    const s = await connectedWithOrigin();
    const sizes = { state: (s.ctrl._handlers.state || { size: 0 }).size, status: (s.ctrl._handlers.status || { size: 0 }).size };
    const m = mountMachine(s);
    const stop = vi.spyOn(s.ctrl, 'jogContinuousStop');
    const jog = vi.spyOn(s.ctrl, 'jog');
    const size = (n) => (s.ctrl._handlers[n] ? s.ctrl._handlers[n].size : 0);
    expect(size('state')).toBeGreaterThan(sizes.state);
    const b = m.q('[data-stp-jog="e"]');
    b.dispatchEvent(ev('pointerdown'));
    await s.clock.advance(400);
    m.tool.destroy();
    await flush(s);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(s.ctrl._jogLoop).toBeNull();
    expect(m.host.children.length).toBe(0);
    b.click();
    b.dispatchEvent(ev('pointerdown'));
    await s.clock.advance(400);
    expect(jog).not.toHaveBeenCalled();
    expect(size('state')).toBe(sizes.state);
    expect(size('status')).toBe(sizes.status);
  });

  test('shows "at limit" feedback relative to the paper', async () => {
    const s = await connectedWithOrigin();
    const m = mountMachine(s);
    m.q('[data-stp-step="50"]').click();
    m.q('[data-stp-jog="w"]').click(); // the origin is the left edge: cannot go left
    await flush(s, 1000);
    expect(m.q('.stp-mt-limit').hidden).toBe(false);
    expect(m.q('.stp-mt-limit').textContent).toMatch(/left/);
  });
});

describe('alarm banner', () => {
  test('Unlock shows with the warning and calls controller.unlock', async () => {
    const s = await connected();
    const m = mountMachine(s);
    s.ctrl._setState('alarm');
    s.ctrl.emit('alarm', { code: 1, message: 'Hard limit' });
    const box = m.q('.stp-mt-alarm');
    expect(box.hidden).toBe(false);
    expect(box.textContent).toContain('Position may be wrong after an alarm. Check the pen is clear of the paper edge before moving.');
    const unlock = vi.spyOn(s.ctrl, 'unlock').mockResolvedValue({});
    expect(act(m, 'unlock').hidden).toBe(false);
    act(m, 'unlock').click();
    expect(unlock).toHaveBeenCalledTimes(1);
    m.qa('[data-stp-jog]').forEach((b) => expect(b.disabled).toBe(true));
  });

  test('Unlock is hidden when the position is lost; power-cycle text is shown', async () => {
    const s = await connected();
    const m = mountMachine(s);
    s.ctrl._setState('alarm');
    s.ctrl.emit('alarm', { code: 3, positionLost: true, message: 'Reset while moving. Power-cycle the plotter, then reconnect.' });
    expect(m.q('.stp-mt-alarm').hidden).toBe(false);
    expect(act(m, 'unlock').hidden).toBe(true);
    expect(m.q('.stp-mt-alarm').textContent).toContain('Power-cycle the plotter');
    expect(m.q('.stp-mt-alarm').textContent).not.toContain('Check the pen is clear');
    s.ctrl._setState('idle');
    m.tool.update();
    expect(m.q('.stp-mt-alarm').hidden).toBe(true);
  });
});

describe('origin, pen and frame', () => {
  test('Set origin, pen height and Go to origin reach the controller', async () => {
    const s = await connected();
    const m = mountMachine(s);
    expect(act(m, 'goto-origin').disabled).toBe(true);
    act(m, 'set-origin').click();
    await flush(s);
    expect(s.ctrl.originSet).toBe(true);
    expect(m.host.textContent).toMatch(/Origin set/);
    expect(act(m, 'goto-origin').disabled).toBe(false);
    const setZ = vi.spyOn(s.ctrl, 'setPenHeight');
    const z = m.q('[data-stp-field="pen-z"]');
    z.value = '2.5';
    z.dispatchEvent(ev('change'));
    await flush(s);
    expect(setZ).toHaveBeenCalledWith(2.5);
  });

  test('Home appears only with $22=1 and needs a confirm step', async () => {
    const s = await connectedWithOrigin();
    const m = mountMachine(s);
    expect(act(m, 'home').hidden).toBe(true);
    s.ctrl.fw[22] = 1;
    m.tool.update();
    expect(act(m, 'home').hidden).toBe(false);
    const home = vi.spyOn(s.ctrl, 'home').mockResolvedValue();
    act(m, 'home').click();
    expect(home).not.toHaveBeenCalled();
    act(m, 'home-confirm').click();
    expect(home).toHaveBeenCalledWith({ confirm: true });
  });

  test('Frame runs a pen-up job with penChange continue', async () => {
    const s = await connectedWithOrigin();
    const m = mountMachine(s, { bbox: { minX: 10, minY: 10, maxX: 60, maxY: 40 } });
    const run = vi.spyOn(s.ctrl, 'run');
    act(m, 'frame').click();
    await s.clock.advance(100);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][1]).toEqual({ penChange: 'continue' });
    await flush(s, 60000);
    expect(s.sim.getTrace()).toEqual([]); // air: nothing drawn
    expect(s.sim.getPosition().mpos.x).toBeGreaterThan(0);
  });

  test('Frame is disabled without a job bounding box', async () => {
    const s = await connectedWithOrigin();
    const m = mountMachine(s);
    expect(act(m, 'frame').disabled).toBe(true);
  });
});

describe('axis check wizard', () => {
  const run = async (s, m, ansX, ansY) => {
    m.q('[data-stp-wizard="axis"]').click();
    act(m, 'next').click(); // move machine X +10
    await flush(s);
    act(m, 'answer-' + ansX).click();
    await flush(s);
    act(m, 'next').click(); // move machine Y +10
    await flush(s);
    act(m, 'answer-' + ansY).click();
    await flush(s);
  };

  test.each([
    ['right', 'down', { invertX: false, invertY: false, swapXY: false }],
    ['left', 'down', { invertX: true, invertY: false, swapXY: false }],
    ['right', 'up', { invertX: false, invertY: true, swapXY: false }],
    ['left', 'up', { invertX: true, invertY: true, swapXY: false }],
    ['down', 'right', { invertX: false, invertY: false, swapXY: true }],
    ['up', 'right', { invertX: false, invertY: true, swapXY: true }],
    ['down', 'left', { invertX: true, invertY: false, swapXY: true }],
    ['up', 'left', { invertX: true, invertY: true, swapXY: true }],
  ])('X moved %s, Y moved %s saves %j', async (ansX, ansY, axes) => {
    const s = await connectedWithOrigin();
    const m = mountMachine(s);
    await run(s, m, ansX, ansY);
    expect(m.ctx.setProfileOverride).not.toHaveBeenCalled(); // nothing saved before Save
    act(m, 'next').click(); // Save
    await flush(s);
    expect(m.ctx.setProfileOverride).toHaveBeenCalledTimes(1);
    expect(m.overrides[0]).toEqual({ axes, calibration: { axisChecked: true } });
    expect(s.sim.getPosition().mpos.x).toBeCloseTo(0, 2); // the pen went back
    expect(s.sim.getPosition().mpos.y).toBeCloseTo(0, 2);
    act(m, 'finish').click();
    expect(m.q('[data-stp-wizard="axis"]').hidden).toBe(false);
  });

  test('the two raw jogs go along machine X then machine Y', async () => {
    const s = await connectedWithOrigin();
    const m = mountMachine(s);
    const jog = vi.spyOn(s.ctrl, 'jog');
    await run(s, m, 'right', 'down');
    expect(jog.mock.calls.map((c) => [c[0], c[1]])).toEqual([[10, 0], [-10, 0], [0, 10], [0, -10]]);
  });

  test('two answers along the same axis are rejected and nothing is saved', async () => {
    const s = await connectedWithOrigin();
    const m = mountMachine(s);
    await run(s, m, 'right', 'left');
    expect(m.q('.stp-mt-wiz-error').textContent).toMatch(/different directions/);
    expect(m.ctx.setProfileOverride).not.toHaveBeenCalled();
  });

  test('Cancel raises the pen and saves nothing', async () => {
    const s = await connectedWithOrigin();
    const m = mountMachine(s);
    m.q('[data-stp-wizard="axis"]').click();
    const up = vi.spyOn(s.ctrl, 'penUp');
    act(m, 'cancel').click();
    await flush(s);
    expect(up).toHaveBeenCalled();
    expect(m.ctx.setProfileOverride).not.toHaveBeenCalled();
    expect(m.q('[data-stp-wizard="axis"]').hidden).toBe(false);
  });

  test('wizards are disabled unless the plotter is idle', async () => {
    const s = await connectedWithOrigin();
    const m = mountMachine(s);
    s.ctrl._setState('running');
    m.tool.update();
    m.qa('[data-stp-wizard]').forEach((b) => expect(b.disabled).toBe(true));
    expect(m.host.textContent).toMatch(/unavailable while a job is running/);
  });
});

describe('pen height wizard', () => {
  const fake = () => ({
    state: 'idle', fw: {}, originSet: true, status: null,
    on() { return () => {}; },
    getState() { return { state: this.state, machineState: 'Idle', wpos: null, mpos: null, pen: { z: null } }; },
    penUp: vi.fn(async () => ({})),
    setPenHeight: vi.fn(async (z) => ({ z, clamped: false })),
  });
  const open = (o) => {
    const c = fake();
    const m = mountMachine(null, Object.assign({ ctrl: c }, o || {}));
    const click = async (name) => { act(m, name).click(); await new Promise((r) => setTimeout(r, 0)); };
    return { c, m, click };
  };

  test('suggests touch + 0.5 mm, saves it, and raises the pen', async () => {
    const { c, m, click } = open();
    m.q('[data-stp-wizard="pen"]').click();
    await click('next'); // Start
    expect(c.setPenHeight).toHaveBeenLastCalledWith(0);
    for (let i = 0; i < 8; i += 1) await click('lower-coarse');
    expect(c.setPenHeight).toHaveBeenLastCalledWith(2);
    await click('next'); // It is touching the paper
    expect(m.q('[data-stp-field="wiz-down"]').value).toBe('2.5');
    expect(m.q('[data-stp-field="wiz-up"]').value).toBe('0');
    await click('next'); // Save
    expect(m.overrides[0]).toEqual({ pen: { down: 2.5, up: 0 }, calibration: { penHeightChecked: true } });
    expect(c.setPenHeight).toHaveBeenLastCalledWith(0);
  });

  test('down is clamped to zMax', async () => {
    const { m, click } = open({ profile: { pen: { zMax: 2 } } });
    m.q('[data-stp-wizard="pen"]').click();
    await click('next');
    for (let i = 0; i < 8; i += 1) await click('lower-coarse'); // reaches 2.0 (the end of travel)
    expect(m.q('.stp-mt-wiz-error').textContent).toMatch(/end of its travel/);
    await click('next');
    expect(m.q('[data-stp-field="wiz-down"]').value).toBe('2');
    await click('next');
    expect(m.overrides[0].pen).toEqual({ down: 2, up: 0 });
  });

  test('touch height from the real simulator is recorded', async () => {
    const s = await connectedWithOrigin();
    const m = mountMachine(s);
    m.q('[data-stp-wizard="pen"]').click();
    act(m, 'next').click();
    await flush(s);
    for (let i = 0; i < 3; i += 1) { act(m, 'lower-coarse').click(); await flush(s); }
    act(m, 'next').click();
    await flush(s);
    expect(m.q('[data-stp-field="wiz-down"]').value).toBe('1.25');
  });
});

describe('scale check wizard', () => {
  test('draws the test square and then shows $100/$101 read-only', async () => {
    const s = await connectedWithOrigin();
    s.ctrl.fw[100] = 80;
    s.ctrl.fw[101] = 80;
    const m = mountMachine(s);
    m.q('[data-stp-wizard="scale"]').click();
    expect(m.q('.stp-mt-wiz').textContent).toMatch(/100 mm square/);
    act(m, 'draw').click();
    await s.clock.advance(200);
    expect(m.q('.stp-mt-wiz-title').textContent).toBe('Drawing');
    for (let i = 0; i < 600 && !/Measure it/.test(m.q('.stp-mt-wiz').textContent); i += 1) await s.clock.advance(1000);
    expect(m.q('.stp-mt-wiz-title').textContent).toBe('Measure it');
    expect(m.q('.stp-mt-wiz-extra').textContent).toContain('$100 = 80');
    expect(s.sim.getTrace().length).toBeGreaterThan(5);
    expect(s.sim.getLog().filter((e) => e.dir === 'in' && /^\$1\d\d=/.test(e.data || ''))).toEqual([]);
  });
});

describe('console', () => {
  const type = (c, text) => {
    c.q('[data-stp-field="command"]').value = text;
    c.q('form').dispatchEvent(ev('submit', { cancelable: true }));
  };

  test('quick buttons send read-only queries and the log shows traffic', async () => {
    const s = await connected();
    const c = mountConsole(s);
    c.q('[data-stp-quick="$G"]').click();
    await flush(s);
    expect(c.q('.stp-mt-log').textContent).toContain('$G');
    expect(c.qa('.stp-mt-line.is-rx').length).toBeGreaterThan(0);
    expect(s.sim.getStats().motionLines).toBe(0);
  });

  test('refuses $110=1 with the reason inline', async () => {
    const s = await connected();
    const c = mountConsole(s);
    const send = vi.spyOn(s.ctrl, 'sendConsole');
    type(c, '$110=1');
    await flush(s);
    expect(send).toHaveBeenCalledWith('$110=1', { allowFirmwareWrites: false });
    const warn = c.q('.stp-mt-line.is-warn');
    expect(warn.textContent).toContain('Refused: $110=1');
    expect(warn.textContent.length).toBeGreaterThan('Refused: $110=1 ()'.length + 5);
    expect(s.sim.getLog().filter((e) => e.dir === 'in' && /\$110/.test(e.data || ''))).toEqual([]);
  });

  const enableAdvanced = (c) => {
    c.q('[data-stp-field="advanced"]').click();
    const t = c.q('[data-stp-field="allow-text"]');
    t.value = 'ALLOW';
    t.dispatchEvent(ev('input'));
    act(c, 'adv-enable').click();
  };

  test('Advanced needs ALLOW typed; $RST is refused even then', async () => {
    const s = await connected();
    const c = mountConsole(s);
    const send = vi.spyOn(s.ctrl, 'sendConsole');
    const box = c.q('[data-stp-field="advanced"]');
    box.click();
    expect(box.checked).toBe(false);
    expect(c.q('.stp-mt-adv-confirm').hidden).toBe(false);
    const text = c.q('[data-stp-field="allow-text"]');
    const go = act(c, 'adv-enable');
    expect(go.disabled).toBe(true);
    text.value = 'allow';
    text.dispatchEvent(ev('input'));
    expect(go.disabled).toBe(true);
    go.click();
    expect(box.checked).toBe(false);
    enableAdvanced(c);
    expect(box.checked).toBe(true);
    type(c, '$RST=*');
    await flush(s);
    expect(send).toHaveBeenLastCalledWith('$RST=*', { allowFirmwareWrites: true });
    expect(Array.from(c.qa('.stp-mt-line.is-warn')).pop().textContent).toContain('Refused: $RST=*');
    expect(s.sim.getLog().filter((e) => e.dir === 'in' && /RST/.test(e.data || ''))).toEqual([]);
  });

  test('Advanced turns itself off when the panel is detached', async () => {
    const s = await connected();
    const c = mountConsole(s);
    const send = vi.spyOn(s.ctrl, 'sendConsole');
    enableAdvanced(c);
    expect(c.q('[data-stp-field="advanced"]').checked).toBe(true);
    c.host.remove(); // the panel closed
    c.tool.update();
    expect(c.q('[data-stp-field="advanced"]').checked).toBe(false);
    env.document.body.appendChild(c.host);
    type(c, '?');
    await flush(s);
    expect(send).toHaveBeenLastCalledWith('?', { allowFirmwareWrites: false });
  });

  test('history with Arrow Up and Down', async () => {
    const s = await connected();
    const c = mountConsole(s);
    const input = c.q('[data-stp-field="command"]');
    type(c, '$G');
    await flush(s);
    type(c, '$#');
    await flush(s);
    input.dispatchEvent(key('keydown', 'ArrowUp'));
    expect(input.value).toBe('$#');
    input.dispatchEvent(key('keydown', 'ArrowUp'));
    expect(input.value).toBe('$G');
    input.dispatchEvent(key('keydown', 'ArrowDown'));
    expect(input.value).toBe('$#');
    input.dispatchEvent(key('keydown', 'ArrowDown'));
    expect(input.value).toBe('');
  });

  test('filter chips hide kinds; the log is capped at 2000 lines', async () => {
    const s = await connected();
    const c = mountConsole(s);
    c.q('[data-stp-chip="tx"]').click();
    expect(c.q('.stp-mt-log').classList.contains('is-hide-tx')).toBe(true);
    expect(c.q('[data-stp-chip="tx"]').getAttribute('aria-pressed')).toBe('false');
    for (let i = 0; i < 2100; i += 1) s.ctrl.emit('log', { dir: 'rx', text: 'ok ' + i });
    expect(c.qa('.stp-mt-line').length).toBe(2000);
    expect(c.q('.stp-mt-line:last-child .stp-mt-line-text').textContent).toBe('ok 2099');
  });

  test('destroy unsubscribes from the controller', async () => {
    const s = await connected();
    const before = (s.ctrl._handlers.log || { size: 0 }).size;
    const c = mountConsole(s);
    expect(s.ctrl._handlers.log.size).toBe(before + 1);
    c.tool.destroy();
    expect(s.ctrl._handlers.log.size).toBe(before);
    expect(c.host.children.length).toBe(0);
  });
});
