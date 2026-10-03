/**
 * TUX-006: layout classifier. Pure table test plus apply() DOM/event contract.
 */
const path = require('path');
const { JSDOM } = require('jsdom');

const MODULE = path.resolve(__dirname, '../../src/ui/shell/layout-classifier.js');

const loadClassifier = () => {
  delete require.cache[MODULE];
  // The module registers on window.Vectura; give it a window-like global.
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
  global.window = dom.window;
  const mod = require(MODULE);
  return { mod, dom };
};

const ROWS = [
  [834, 1210, true, 'tablet'],
  [1210, 834, true, 'touch-wide'],
  [1366, 1024, true, 'touch-wide'],
  [1024, 1366, true, 'touch-wide'], // ADJ-2: 13-inch portrait stays touch-wide
  [600, 834, true, 'tablet'],
  [599, 834, true, 'phone'],
  [402, 874, true, 'phone'],
  [544, 1183, true, 'phone'], // Chromium iPhone portrait inflated viewport
  [874, 402, true, 'phone'],
  [874, 330, true, 'phone'],
  [1210, 499, true, 'phone'],
  [1600, 1000, false, 'desktop'],
  [900, 700, false, 'desktop'],
  [899, 700, false, 'tablet'],
  [540, 800, false, 'tablet'],
  [539, 800, false, 'phone'],
  [402, 874, false, 'phone'],
];

describe('LayoutClassifier.classify', () => {
  let C, dom;
  beforeAll(() => { ({ mod: C, dom } = loadClassifier()); });
  afterAll(() => { dom.window.close(); delete global.window; });

  test.each(ROWS)('%ix%i coarse=%s -> %s', (width, height, coarsePointer, expected) => {
    expect(C.classify({ width, height, coarsePointer })).toBe(expected);
  });
});

describe('LayoutClassifier.apply', () => {
  let C, dom, doc;
  beforeEach(() => {
    ({ mod: C, dom } = loadClassifier());
    doc = dom.window.document;
  });
  afterEach(() => { dom.window.close(); delete global.window; });

  const setEnv = (width, height, coarse) => {
    Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: height });
    dom.window.matchMedia = () => ({ matches: coarse });
  };
  const cls = () => [...doc.body.classList].sort();

  test('maps layouts to body classes and data-layout; touch-ui iff coarse', () => {
    setEnv(402, 874, true);
    expect(C.apply(doc)).toBe('phone');
    expect(cls()).toEqual(['mobile-layout', 'phone-layout', 'touch-ui']);
    expect(doc.body.dataset.layout).toBe('phone');

    setEnv(834, 1210, true);
    expect(C.apply(doc)).toBe('tablet');
    expect(cls()).toEqual(['mobile-layout', 'tablet-layout', 'touch-ui']);

    setEnv(1210, 834, true);
    expect(C.apply(doc)).toBe('touch-wide');
    expect(cls()).toEqual(['touch-ui', 'touch-wide-layout']);
    expect(C.current()).toBe('touch-wide');

    setEnv(1600, 1000, false);
    expect(C.apply(doc)).toBe('desktop');
    expect(cls()).toEqual([]);
    expect(doc.body.dataset.layout).toBe('desktop');
  });

  test('vectura:layoutchange fires once per real change, not on no-op', () => {
    const events = [];
    dom.window.addEventListener('vectura:layoutchange', (e) => events.push(e.detail));
    setEnv(1210, 834, true);
    C.apply(doc);
    C.apply(doc);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ to: 'touch-wide', coarsePointer: true });
    setEnv(834, 1210, true);
    C.apply(doc);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ from: 'touch-wide', to: 'tablet' });
  });

  test('missing matchMedia defaults to fine pointer and does not throw', () => {
    Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: 800 });
    dom.window.matchMedia = undefined;
    expect(C.readInput()).toEqual({ width: 1000, height: 800, coarsePointer: false });
  });
});
