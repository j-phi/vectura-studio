/**
 * TUX-056: main canvas backing DPR is capped on coarse pointers and resize() does not
 * re-allocate the backing store when nothing changed.
 */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Renderer.resize — backing DPR and allocation (TUX-056)', () => {
  let runtime;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });
  afterAll(() => runtime.cleanup());

  const make = ({ dpr, coarse }) => {
    const win = runtime.window;
    win.devicePixelRatio = dpr;
    win.matchMedia = (q) => ({ matches: coarse && /pointer:\s*coarse/.test(q), addEventListener() {}, removeEventListener() {} });
    const engine = {
      layers: [],
      currentProfile: { width: 300, height: 300 },
      getBounds() { return { width: 300, height: 300, m: 0, dW: 300, dH: 300, truncate: false }; },
    };
    const r = new win.Vectura.Renderer('main-canvas', engine);
    const parent = r.canvas.parentElement;
    parent.getBoundingClientRect = () => ({ width: 402, height: 493, left: 0, top: 0, right: 402, bottom: 493 });
    let allocs = 0;
    let w = r.canvas.width;
    Object.defineProperty(r.canvas, 'width', { get: () => w, set: (v) => { allocs++; w = v; }, configurable: true });
    let draws = 0;
    const origDraw = r.draw.bind(r);
    r.draw = () => { draws++; return origDraw(); };
    return { r, counts: () => ({ allocs, draws }) };
  };

  test('coarse pointer caps backing DPR at 2', () => {
    const { r } = make({ dpr: 3, coarse: true });
    r.resize();
    expect(r.canvas.width).toBe(804);
    expect(r.getBackingDpr()).toBe(2);
  });

  test('second resize with identical rect does not allocate or draw', () => {
    const { r, counts } = make({ dpr: 3, coarse: true });
    r.resize();
    const before = counts();
    r.resize();
    expect(counts()).toEqual(before);
  });

  test('fine pointer keeps full DPR (desktop parity)', () => {
    const { r } = make({ dpr: 3, coarse: false });
    r.resize();
    expect(r.canvas.width).toBe(1206);
    expect(r.getBackingDpr()).toBe(3);
  });

  test('renderer reads window.devicePixelRatio in one place only', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../src/render/renderer.js'), 'utf8');
    expect((src.match(/window\.devicePixelRatio/g) || []).length).toBeLessThanOrEqual(1);
  });
});
