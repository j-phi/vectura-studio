/**
 * TUX-034a: TouchHold. Timer, slop, cancel, pointerType gate, contextmenu de-dupe,
 * ghost-click swallow, re-resolve by data-layer-id.
 */
const path = require('path');
const { JSDOM } = require('jsdom');

const MODULE = path.resolve(__dirname, '../../src/ui/touch/touch-hold.js');
const CFG = path.resolve(__dirname, '../../src/config/context-menu.js');

let dom;
let TH;
let root;
let now;

const load = () => {
  delete require.cache[MODULE];
  delete require.cache[CFG];
  dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true });
  global.window = dom.window;
  global.document = dom.window.document;
  Object.defineProperty(dom.window, 'performance', { value: { now: () => now }, configurable: true });
  require(CFG);
  require(MODULE);
  TH = dom.window.Vectura.UI.TouchHold;
  root = dom.window.document.getElementById('root');
};

const pe = (type, init = {}) => {
  const ev = new dom.window.Event(type, { bubbles: true, cancelable: true });
  Object.assign(ev, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100, isPrimary: true }, init);
  return ev;
};
const card = (id) => {
  const c = dom.window.document.createElement('div');
  c.className = 'card';
  c.dataset.layerId = id;
  const inner = dom.window.document.createElement('span');
  c.appendChild(inner);
  root.appendChild(c);
  return { c, inner };
};
const advance = (ms) => { for (let i = 0; i < ms; i += 1) { now += 1; vi.advanceTimersByTime(1); } };

beforeEach(() => {
  vi.useFakeTimers();
  now = 0;
  load();
});
afterEach(() => { vi.useRealTimers(); });

const bind = (extra = {}) => {
  const fired = [];
  const unbind = TH.bind(root, {
    selector: '.card',
    resolve: (t) => ({ key: t.dataset.layerId, anchorEl: t }),
    onFire: (d) => fired.push(d),
    pointerTypes: ['touch', 'pen'],
    ...extra,
  });
  return { fired, unbind };
};

describe('TouchHold', () => {
  it('fires at the configured hold time and dispatches progress then fire', () => {
    const { fired } = bind();
    const { inner } = card('a');
    const log = [];
    ['progress', 'fire', 'cancel'].forEach((n) => dom.window.document.addEventListener(`touchhold:${n}`, (e) => log.push([n, e.detail.t])));
    inner.dispatchEvent(pe('pointerdown'));
    advance(149);
    expect(log).toEqual([]);
    advance(2);
    expect(log[0][0]).toBe('progress');
    expect(dom.window.document.querySelector('[data-touch-hold-progress]')).toBeTruthy();
    advance(340);
    expect(fired).toHaveLength(0);
    advance(10);
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ key: 'a', x: 100, y: 100 });
    expect(log.map((l) => l[0])).toEqual(['progress', 'fire']);
    expect(dom.window.document.querySelector('[data-touch-hold-progress]')).toBeNull();
  });

  it('cancels at slop >= 10 px measured from the start point, not on 9 px', () => {
    const { fired } = bind();
    const { inner } = card('a');
    inner.dispatchEvent(pe('pointerdown'));
    advance(200);
    inner.dispatchEvent(pe('pointermove', { clientX: 109, clientY: 100 }));
    inner.dispatchEvent(pe('pointermove', { clientX: 100, clientY: 91 }));
    advance(400);
    expect(fired).toHaveLength(1);
    // slop is from the start point: drifting 6+6 px in two steps is 12 px away
    fired.length = 0;
    inner.dispatchEvent(pe('pointerup'));
    inner.dispatchEvent(pe('pointerdown'));
    inner.dispatchEvent(pe('pointermove', { clientX: 106, clientY: 100 }));
    inner.dispatchEvent(pe('pointermove', { clientX: 112, clientY: 100 }));
    advance(700);
    expect(fired).toHaveLength(0);
    expect(dom.window.document.querySelector('[data-touch-hold-progress]')).toBeNull();
  });

  it('TUX-039 capture:true still fires when a deeper bubble handler stops propagation', () => {
    const bubble = bind();
    const cap = [];
    TH.bind(root, {
      selector: '.card',
      capture: true,
      resolve: (t) => ({ key: t.dataset.layerId, anchorEl: t }),
      onFire: (d) => cap.push(d),
    });
    const { c, inner } = card('a');
    c.addEventListener('pointerdown', (e) => e.stopPropagation()); // a deeper owner eats the bubble
    inner.dispatchEvent(pe('pointerdown'));
    advance(520);
    expect(bubble.fired, 'bubble-phase owner never sees the stopped event').toHaveLength(0);
    expect(cap, 'capture owner fires').toHaveLength(1);
  });

  it('ignores mouse pointers', () => {
    const { fired } = bind();
    const { inner } = card('a');
    inner.dispatchEvent(pe('pointerdown', { pointerType: 'mouse' }));
    advance(900);
    expect(fired).toHaveLength(0);
    expect(dom.window.document.querySelector('[data-touch-hold-progress]')).toBeNull();
  });

  it('cancels on pointercancel, pointerup and a second pointer', () => {
    const { fired } = bind();
    const { inner } = card('a');
    inner.dispatchEvent(pe('pointerdown'));
    advance(100);
    inner.dispatchEvent(pe('pointercancel'));
    advance(800);
    inner.dispatchEvent(pe('pointerdown'));
    advance(100);
    inner.dispatchEvent(pe('pointerup'));
    advance(800);
    inner.dispatchEvent(pe('pointerdown'));
    advance(100);
    inner.dispatchEvent(pe('pointerdown', { pointerId: 2, isPrimary: false }));
    advance(800);
    expect(fired).toHaveLength(0);
  });

  it('ignores contextmenu while a hold is active and for 600 ms after a fire', () => {
    bind();
    const { inner } = card('a');
    inner.dispatchEvent(pe('pointerdown'));
    advance(300);
    const e1 = new dom.window.Event('contextmenu', { bubbles: true, cancelable: true });
    let reached = 0;
    root.parentNode.addEventListener('contextmenu', () => { reached += 1; });
    inner.dispatchEvent(e1);
    expect(e1.defaultPrevented).toBe(true);
    advance(250);
    const e2 = new dom.window.Event('contextmenu', { bubbles: true, cancelable: true });
    inner.dispatchEvent(e2);
    expect(e2.defaultPrevented).toBe(true);
    inner.dispatchEvent(pe('pointerup'));
    advance(40);
    const e3 = new dom.window.Event('contextmenu', { bubbles: true, cancelable: true });
    inner.dispatchEvent(e3);
    expect(e3.defaultPrevented).toBe(true);
    advance(520);
    const e4 = new dom.window.Event('contextmenu', { bubbles: true, cancelable: true });
    inner.dispatchEvent(e4);
    expect(e4.defaultPrevented).toBe(false);
    expect(reached).toBe(1); // only the late one gets through
  });

  it('swallows the next compat click once, capture phase, within 800 ms', () => {
    bind();
    const { inner } = card('a');
    const seen = [];
    dom.window.document.body.addEventListener('click', () => seen.push('click'));
    inner.dispatchEvent(pe('pointerdown'));
    advance(520);
    inner.dispatchEvent(pe('pointerup'));
    inner.dispatchEvent(new dom.window.Event('click', { bubbles: true, cancelable: true }));
    expect(seen).toEqual([]);
    inner.dispatchEvent(new dom.window.Event('click', { bubbles: true, cancelable: true }));
    expect(seen).toEqual(['click']); // swallowed once only
  });

  it('stops swallowing after 800 ms and when a new pointer goes down', () => {
    bind();
    const { inner } = card('a');
    const seen = [];
    dom.window.document.body.addEventListener('click', () => seen.push('click'));
    inner.dispatchEvent(pe('pointerdown'));
    advance(520);
    inner.dispatchEvent(pe('pointerup'));
    advance(801);
    inner.dispatchEvent(new dom.window.Event('click', { bubbles: true, cancelable: true }));
    expect(seen).toEqual(['click']);
    seen.length = 0;
    inner.dispatchEvent(pe('pointerdown'));
    advance(520);
    inner.dispatchEvent(pe('pointerup'));
    inner.dispatchEvent(pe('pointerdown', { pointerId: 3 }));
    inner.dispatchEvent(new dom.window.Event('click', { bubbles: true, cancelable: true }));
    expect(seen).toEqual(['click']);
  });

  it('re-resolves a re-rendered target by data-layer-id at fire time', () => {
    const resolved = [];
    const { fired } = bind({ resolve: (t) => { resolved.push(t); return { key: t.dataset.layerId, anchorEl: t }; } });
    const { c, inner } = card('a');
    inner.dispatchEvent(pe('pointerdown'));
    advance(200);
    root.removeChild(c); // renderLayers() rebuilt the card
    const fresh = card('a').c;
    advance(400);
    expect(fired).toHaveLength(1);
    expect(fired[0].target).toBe(fresh);
  });

  // C1: the owner started a drag (shouldYield true). The hold must not fire, even when the finger rests
  // under the slop past holdMs. A stationary hold (moved false) still fires.
  it('shouldYield cancels the hold on a move and at the fire check, with reason interaction', () => {
    let started = false;
    const asked = [];
    const { fired } = bind({ shouldYield: (info) => { asked.push(info.moved); return started && info.moved; } });
    const { inner } = card('a');
    const reasons = [];
    dom.window.document.addEventListener('touchhold:cancel', (e) => reasons.push(e.detail.reason));
    inner.dispatchEvent(pe('pointerdown'));
    advance(50);
    dom.window.document.dispatchEvent(pe('pointermove', { clientX: 103, clientY: 100 }));
    expect(asked).toEqual([true]);
    started = true; // the owner's move handler started the drag after our move listener ran
    advance(600);
    expect(fired).toHaveLength(0);
    expect(reasons).toEqual(['interaction']);
  });

  it('shouldYield false (stationary hold) still fires', () => {
    const { fired } = bind({ shouldYield: (info) => info.moved });
    const { inner } = card('a');
    inner.dispatchEvent(pe('pointerdown'));
    advance(510);
    expect(fired).toHaveLength(1);
  });

  it('unbind removes the listeners', () => {
    const { fired, unbind } = bind();
    const { inner } = card('a');
    unbind();
    inner.dispatchEvent(pe('pointerdown'));
    advance(900);
    expect(fired).toHaveLength(0);
  });
});
