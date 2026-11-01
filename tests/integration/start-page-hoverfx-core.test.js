/**
 * @vitest-environment jsdom
 *
 * Start Page hover effects core: hand-off, rest, Still and destroy, driven by a synthetic effect so the
 * lifecycle is checked without WebGL (the WebGL effects are covered by tests/e2e/start-page-hoverfx.spec.js).
 */
const { load, makeTile } = require('../helpers/start-page-hoverfx-env');

const synth = (calls) => ({
  id: 'synth', name: 'Synth', needsGL: false,
  init(ctx) { calls.init++; ctx.state.sp = ctx.Spring({ f: 1.6, z: 0.5 }); },
  pointer(ctx, ev) { calls.pointer.push(ev.type); },
  frame(ctx, dt) { calls.frames++; const s = ctx.state.sp; s.target = ctx.on ? 1 : 0; s.step(dt); return Math.abs(s.x) + Math.abs(s.v); },
  idle(ctx) { return ctx.state.sp.settled(0.002, 0.01); },
  reducedMotion() { calls.still++; },
  dispose() { calls.dispose++; },
});

const setup = async (opts = {}) => {
  const env = load(opts);
  const calls = { init: 0, frames: 0, still: 0, dispose: 0, pointer: [] };
  await new Promise((r) => { const s = document.createElement('script'); s.src = `${require('../helpers/start-page-hoverfx-env').BASE}core.js`; s.onload = r; document.head.appendChild(s); });
  const Core = window.Vectura.StartPageHoverFxCore;
  Core.register(synth(calls));
  const tile = makeTile(400, 300);
  const ctl = Core.attach(tile.el, 'synth', { handle: tile.handle });
  await ctl.ready;
  return { env, Core, calls, tile, ctl };
};
const move = (el, x, y) => { const e = new Event('pointermove'); e.clientX = x; e.clientY = y; el.dispatchEvent(e); };

describe('StartPageHoverFxCore', () => {
  test('hover wakes the loop, hides the ink layer; leaving settles, stops the loop and returns the ink layer', async () => {
    const { env, calls, tile, ctl } = await setup();
    expect(calls.init).toBe(1);
    expect(env.clock.queue.length).toBe(0); // nothing runs until the pointer is on the art
    move(tile.el, 100, 100);
    expect(env.clock.queue.length).toBe(1);
    env.clock.run(300);
    expect(calls.frames).toBeGreaterThan(5);
    expect(tile.box.style.visibility).toBe('hidden');
    expect(tile.el.querySelector('.sp-hfx-wrap').classList.contains('on')).toBe(true);
    expect(calls.pointer).toContain('enter');
    tile.el.dispatchEvent(new Event('pointerleave'));
    env.clock.run(6000);
    expect(env.clock.queue.length).toBe(0);                 // the rAF loop stopped
    expect(ctl.idle).toBe(true);
    expect(tile.box.style.visibility).toBe('');             // ink layer is back
    expect(tile.el.querySelector('.sp-hfx-wrap').classList.contains('on')).toBe(false);
  });

  test('settles to rest within 3.5 s of the pointer leaving (fake rAF clock)', async () => {
    const { env, calls, tile, ctl } = await setup();
    for (let i = 0; i < 40; i++) { move(tile.el, 20 + i * 8, 100 + (i % 5) * 10); env.clock.run(16); }
    tile.el.dispatchEvent(new Event('pointerleave'));
    const before = calls.frames; let t = 0;
    while (!ctl.idle && t < 8000) { env.clock.run(100); t += 100; }
    expect(ctl.idle).toBe(true);
    expect(t).toBeLessThanOrEqual(3500);
    expect(calls.frames).toBeGreaterThan(before);
  });

  test('manual mode steps a fake clock: _advance runs frames until rest', async () => {
    const env = load();
    const calls = { init: 0, frames: 0, still: 0, dispose: 0, pointer: [] };
    await new Promise((r) => { const s = document.createElement('script'); s.src = `${require('../helpers/start-page-hoverfx-env').BASE}core.js`; s.onload = r; document.head.appendChild(s); });
    const Core = window.Vectura.StartPageHoverFxCore; Core.register(synth(calls));
    const tile = makeTile();
    const ctl = Core.attach(tile.el, 'synth', { handle: tile.handle, manual: true });
    await ctl.ready;
    ctl.input('enter', 50, 50); ctl.input('move', 60, 60);
    expect(ctl.active).toBe(true);
    ctl._advance(1);
    ctl.input('leave', 60, 60);
    const t = ctl._advance(10);
    expect(ctl.idle).toBe(true);
    expect(t).toBeLessThan(4);
    expect(env.clock.queue.length).toBe(0);
  });

  test('Still: no rAF and no frames; the still frame needs the art texture, so without WebGL nothing is drawn and the ink layer stays', async () => {
    const { env, calls, tile } = await setup({ still: true });
    move(tile.el, 100, 100);
    expect(env.clock.queue.length).toBe(0);
    expect(calls.frames).toBe(0);
    expect(calls.still).toBe(0);
    tile.el.dispatchEvent(new Event('pointerleave'));
    expect(tile.box.style.visibility).toBe('');
    env.clock.run(1000);
    expect(calls.frames).toBe(0);
  });

  test('destroy removes the surface and listeners and restores the ink layer', async () => {
    const { env, calls, tile, ctl } = await setup();
    move(tile.el, 100, 100); env.clock.run(100);
    expect(tile.box.style.visibility).toBe('hidden');
    ctl.destroy();
    expect(tile.box.style.visibility).toBe('');
    expect(tile.el.querySelector('.sp-hfx-wrap')).toBe(null);
    expect(calls.dispose).toBe(1);
    const f = calls.frames;
    move(tile.el, 120, 120); env.clock.run(200);
    expect(calls.frames).toBe(f);
    expect(env.clock.queue.length).toBe(0);
  });

  test('the surface lives inside the art element and never outside it', async () => {
    const { tile } = await setup();
    const wrap = tile.el.querySelector('.sp-hfx-wrap');
    expect(wrap.parentElement).toBe(tile.el);
    expect(wrap.previousElementSibling).toBe(tile.box); // directly above the ink layer, below any text layer after it
  });

  test('a torn-down tile (handle no longer alive) stops the loop and destroys the controller', async () => {
    const { env, tile, ctl } = await setup();
    move(tile.el, 100, 100); env.clock.run(50);
    tile.el._spInk = null;
    env.clock.run(100);
    expect(ctl.destroyed).toBe(true);
    expect(env.clock.queue.length).toBe(0);
  });
});
