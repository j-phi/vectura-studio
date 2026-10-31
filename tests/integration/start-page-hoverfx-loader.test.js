/**
 * @vitest-environment jsdom
 *
 * Start Page hover effects loader: lazy single-file loading, attach/detach lifecycle, 2.6 s teardown,
 * and the Still contract. Real modules from disk; scripts are "fetched" by the harness.
 */
const { load, makeTile, BASE } = require('../helpers/start-page-hoverfx-env');

const flush = async () => { for (let i = 0; i < 6; i++) { await Promise.resolve(); await vi.advanceTimersByTimeAsync(1); } };

describe('StartPageHoverFx loader', () => {
  let env;
  beforeEach(() => { vi.useFakeTimers(); env = load(); });
  afterEach(() => { vi.useRealTimers(); });

  test('urlFor resolves relative bases and refuses cross-origin or non-http(s) bases', () => {
    const { H } = env;
    expect(H.urlFor('lift.js')).toMatch(/^(https?:\/\/localhost(:\d+)?)?\/src\/ui\/start-page\/hover-fx\/lift\.js$/);
    H.setBase('/assets/fx/');
    expect(H.urlFor('lift.js')).toBe('/assets/fx/lift.js');
    H.setBase('../fx/');
    expect(H.urlFor('lift.js')).toMatch(/\/fx\/lift\.js$/);
    H.setBase('https://evil.example/fx/');
    expect(H.urlFor('lift.js')).toBeNull();
    H.setBase(`${window.location.origin}/same/`);
    expect(H.urlFor('lift.js')).toBe('/same/lift.js'); // same origin: root-relative, no scheme or host
    H.setBase('http://example.test:9999/fx/');
    expect(H.urlFor('lift.js')).toBeNull(); // different origin: never crossed
    H.setBase('javascript:alert(1)//');
    expect(H.urlFor('lift.js')).toBeNull();
    H.setBase('data:text/javascript,1//');
    expect(H.urlFor('lift.js')).toBeNull();
  });

  test('a cross-origin base never creates a script element', async () => {
    const { H, fetched } = env;
    H.setBase('https://evil.example/fx/');
    const el = makeTile();
    const ctl = H.attach(el, 'lift', { handle: el._spInk });
    await flush();
    expect(fetched.length).toBe(0);
    expect(ctl).toBeTruthy();
  });

  test('exports the contract API and the nine effect ids', () => {
    const H = env.H;
    for (const k of ['attach', 'detach', 'get', 'registerSimple', 'isStill', 'setBase', 'loadedFiles']) expect(typeof H[k]).toBe('function');
    expect(H.ids().sort()).toEqual(['breeze', 'current', 'glare', 'gravity', 'holo', 'lift', 'replot', 'ripple', 'stipple'].sort());
    expect(H.LEAVE_MS).toBe(2600);
  });

  test('a WebGL effect loads the core and ONLY its own effect file, resolved from the loader base', async () => {
    const { el, handle } = makeTile();
    const ctl = env.H.attach(el, 'holo', { handle });
    await flush();
    expect(env.fetched).toEqual([`${BASE}core.js`, `${BASE}holo.js`]);
    expect(ctl.loadedFiles).toEqual(['core.js', 'holo.js']);
    for (const other of ['ripple', 'stipple', 'breeze', 'gravity', 'current', 'lift', 'glare', 'replot']) expect(env.fetched.some((u) => u.endsWith(`/${other}.js`))).toBe(false);
  });

  test('a DOM effect loads only its own file (no WebGL core)', async () => {
    const { el, handle } = makeTile();
    env.H.attach(el, 'lift', { handle });
    await flush();
    expect(env.fetched).toEqual([`${BASE}lift.js`]);
  });

  test('a second WebGL effect reuses the core: only the new effect file is fetched', async () => {
    const a = makeTile(); const b = makeTile();
    env.H.attach(a.el, 'holo', { handle: a.handle }); await flush();
    env.H.attach(b.el, 'gravity', { handle: b.handle }); await flush();
    expect(env.fetched).toEqual([`${BASE}core.js`, `${BASE}holo.js`, `${BASE}gravity.js`]);
  });

  test('attach is idempotent per element and effect; a different effect replaces the old controller', async () => {
    const { el, handle } = makeTile();
    const a = env.H.attach(el, 'glare', { handle });
    expect(env.H.attach(el, 'glare', { handle })).toBe(a);
    await flush();
    const b = env.H.attach(el, 'replot', { handle });
    expect(b).not.toBe(a);
    expect(a.destroyed).toBe(true);
    expect(env.H.get(el)).toBe(b);
  });

  test('destroyed exactly 2.6 s after the pointer leaves; re-entering cancels', async () => {
    const { el, handle } = makeTile();
    const ctl = env.H.attach(el, 'glare', { handle });
    await flush();
    el.dispatchEvent(new Event('pointerleave'));
    await vi.advanceTimersByTimeAsync(2599);
    expect(ctl.destroyed).toBe(false);
    el.dispatchEvent(new Event('pointerenter'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(ctl.destroyed).toBe(false);
    el.dispatchEvent(new Event('pointerleave'));
    await vi.advanceTimersByTimeAsync(2600);
    expect(ctl.destroyed).toBe(true);
    expect(env.H.get(el)).toBe(null);
  });

  test('destroying before the script arrives never builds the effect', async () => {
    const { el, handle } = makeTile();
    const ctl = env.H.attach(el, 'glare', { handle });
    env.H.detach(el);
    await flush();
    expect(ctl.destroyed).toBe(true);
    expect(ctl.inner).toBe(null);
    expect(el.querySelector('.sp-hfx-glare')).toBe(null);
  });

  test('unknown ids, "none" and elements without an ink handle are inert', () => {
    const { el, handle } = makeTile();
    expect(env.H.attach(el, 'nope', { handle }).destroyed).toBe(true);
    expect(env.H.attach(el, 'none', { handle }).destroyed).toBe(true);
    const bare = document.createElement('div'); document.body.appendChild(bare);
    expect(env.H.attach(bare, 'lift').destroyed).toBe(true);
    expect(env.fetched).toEqual([]);
  });

  test('Still: Lift, Glare and Re-plot are off and fetch nothing', async () => {
    const { el, handle } = makeTile();
    env.H.setMotion({ still: true });
    for (const id of ['lift', 'glare', 'replot']) expect(env.H.attach(el, id, { handle }).destroyed).toBe(true);
    await flush();
    expect(env.fetched).toEqual([]);
  });

  test('Still is also driven by the vectura:start-page-motion event and prefers-reduced-motion', () => {
    expect(env.H.isStill()).toBe(false);
    window.dispatchEvent(new CustomEvent('vectura:start-page-motion', { detail: { still: true } }));
    expect(env.H.isStill()).toBe(true);
    window.dispatchEvent(new CustomEvent('vectura:start-page-motion', { detail: { still: false } }));
    expect(env.H.isStill()).toBe(false);
    expect(load({ reduced: true }).H.isStill()).toBe(true);
  });
});
