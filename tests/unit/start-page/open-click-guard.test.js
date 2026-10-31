/**
 * StartPageDom.onOpenClick: art opens ONLY on a genuine quick single click. A drag (orbiting a live 3D model), a
 * wobbly press or a long press swallows the click that follows; keyboard activation still opens.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const { ptr, click, gesture } = require('../../helpers/pointer-gesture');

const read = (f) => fs.readFileSync(path.join(__dirname, '../../..', f), 'utf8');

describe('StartPageDom.onOpenClick', () => {
  let dom; let W; let el; let opened; let clock;
  beforeEach(() => {
    dom = new JSDOM('<!doctype html><body><div id="art"><canvas id="cv"></canvas></div></body>', { runScripts: 'outside-only' });
    W = dom.window;
    clock = 1000;
    W.performance.now = () => clock;
    ['src/config/start-page.js', 'src/ui/start-page/dom.js'].forEach((f) => vm.runInContext(read(f), dom.getInternalVMContext(), { filename: f }));
    el = W.document.getElementById('art');
    opened = 0;
    W.Vectura.StartPageDom.onOpenClick(el, () => { opened += 1; });
  });
  afterEach(() => dom.window.close());
  const tick = (ms) => { clock += ms; };
  const cv = () => W.document.getElementById('cv');

  test('config carries the thresholds', () => {
    expect(W.Vectura.START_PAGE.CLICK).toEqual({ maxMovePx: 5, maxMoveTouchPx: 10, maxPressMs: 350, clickGapMs: 700 });
  });
  test('a stationary quick click opens, also when it lands on a nested canvas', () => {
    gesture(W, cv(), { tick });
    expect(opened).toBe(1);
  });
  test('a tiny wobble inside the threshold still opens', () => {
    gesture(W, cv(), { to: [3, 2], tick });
    expect(opened).toBe(1);
  });
  test('a drag past the threshold does not open on release', () => {
    gesture(W, cv(), { to: [40, 10], tick });
    expect(opened).toBe(0);
  });
  test('touch tolerates more wobble than a mouse, but not a drag', () => {
    gesture(W, cv(), { to: [8, 0], pointerType: 'touch', tick });
    expect(opened).toBe(1);
    gesture(W, cv(), { to: [30, 0], pointerType: 'touch', tick });
    expect(opened).toBe(1);
  });
  test('a long press does not open', () => {
    gesture(W, cv(), { ms: 800, tick });
    expect(opened).toBe(0);
  });
  test('a cancelled pointer does not open', () => {
    ptr(W, cv(), 'pointerdown', 100, 100);
    ptr(W, cv(), 'pointercancel', 100, 100);
    click(W, cv());
    expect(opened).toBe(0);
  });
  test('keyboard activation (a click with no pointer gesture) opens, even right after a drag', () => {
    click(W, el);
    expect(opened).toBe(1);
    gesture(W, cv(), { to: [40, 0], tick });
    expect(opened).toBe(1);
    tick(2000);
    click(W, el); // Enter later, the stale drag verdict has expired
    expect(opened).toBe(2);
  });
  test('the next quick click after a swallowed drag opens', () => {
    gesture(W, cv(), { to: [40, 0], tick });
    gesture(W, cv(), { tick });
    expect(opened).toBe(1);
  });
  test('the returned detach function removes the guard', () => {
    const el2 = W.document.createElement('div'); let n = 0;
    const off = W.Vectura.StartPageDom.onOpenClick(el2, () => { n += 1; });
    off(); click(W, el2);
    expect(n).toBe(0);
  });
});
