/**
 * TUX-039: TouchTooltip (inside src/ui/overlays/tooltip.js) on the shared TouchHold.
 * Touch hold of 500 ms on an icon-only button shows its aria-label (shortcut stripped) and
 * swallows that button's compat click. Mouse never tips. Variant, drag-handle and opted-out
 * buttons do nothing.
 */
const path = require('path');
const { JSDOM } = require('jsdom');

const R = (p) => path.resolve(__dirname, '../..', p);
const MODS = [R('src/config/context-menu.js'), R('src/ui/touch/touch-hold.js'), R('src/ui/overlays/tooltip.js')];

let dom;
let now;

const load = () => {
  MODS.forEach((m) => { delete require.cache[m]; });
  dom = new JSDOM(`<!doctype html><body>
    <button id="plain" aria-label="Hand Tool (Space)" title="Hand (Space)"><svg></svg></button>
    <button id="sub" aria-label="Shape Tool (M)" data-has-submenu="true"><svg></svg></button>
    <button id="opt" aria-label="No tip" data-no-hold-tip><svg></svg></button>
    <button id="handle" class="toolbar-drag-handle" aria-label="Move toolbar"><svg></svg></button>
    <button id="text" aria-label="Save">Save</button>
    <button id="g1" class="ctxbar-handle" aria-label="Move bar"><svg></svg></button>
    <button id="g2" class="pen-grip" aria-label="Reorder pen"><svg></svg></button>
    <button id="g3" class="noise-grip" aria-label="Reorder noise"><svg></svg></button>
    <button id="g4" class="optimization-grip" aria-label="Reorder optimization"><svg></svg></button>
    <button id="g5" class="mobile-pane-handle" aria-label="Resize pane"><svg></svg></button>
    <button id="g6" class="layer-grip" aria-label="Reorder layer"><svg></svg></button>
    <button id="g7" class="lvl-grip" aria-label="Reorder"><svg></svg></button>
  </body>`, { url: 'http://localhost/', pretendToBeVisual: true });
  global.window = dom.window;
  global.document = dom.window.document;
  Object.defineProperty(dom.window, 'performance', { value: { now: () => now }, configurable: true });
  MODS.forEach((m) => require(m));
  dom.window.Vectura.UI.overlays.TouchTooltip.install();
};

const pe = (type, init = {}) => {
  const ev = new dom.window.Event(type, { bubbles: true, cancelable: true });
  Object.assign(ev, { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true }, init);
  return ev;
};
const $ = (id) => dom.window.document.getElementById(id);
const advance = (ms) => { for (let i = 0; i < ms; i += 1) { now += 1; vi.advanceTimersByTime(1); } };
const tipEl = () => dom.window.document.getElementById('vectura-touch-tip');
const tipShown = () => { const t = tipEl(); return !!t && t.style.visibility === 'visible'; };

const clickCount = (el) => {
  let n = 0;
  el.addEventListener('click', () => { n += 1; });
  return () => n;
};
const sendClick = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));

beforeEach(() => { vi.useFakeTimers(); now = 0; load(); });
afterEach(() => { vi.useRealTimers(); });

describe('TouchTooltip', () => {
  it('a touch hold shows the stripped aria-label, sets aria-describedby, and swallows one click', () => {
    const clicks = clickCount($('plain'));
    $('plain').dispatchEvent(pe('pointerdown'));
    advance(520);
    expect(tipShown()).toBe(true);
    expect(tipEl().textContent).toBe('Hand Tool');
    expect($('plain').getAttribute('aria-describedby')).toBe('vectura-touch-tip');
    $('plain').dispatchEvent(pe('pointerup'));
    sendClick($('plain'));
    expect(clicks()).toBe(0);
    sendClick($('plain'));
    expect(clicks()).toBe(1); // exactly one click is swallowed
  });

  it('hides 1500 ms after the lift and removes aria-describedby', () => {
    $('plain').dispatchEvent(pe('pointerdown'));
    advance(520);
    $('plain').dispatchEvent(pe('pointerup'));
    advance(1400);
    expect(tipShown()).toBe(true);
    advance(200);
    expect(tipShown()).toBe(false);
    expect($('plain').hasAttribute('aria-describedby')).toBe(false);
  });

  it('the next pointerdown hides it at once and clears the swallow', () => {
    $('plain').dispatchEvent(pe('pointerdown'));
    advance(520);
    $('plain').dispatchEvent(pe('pointerup'));
    $('text').dispatchEvent(pe('pointerdown', { pointerId: 2 }));
    advance(5);
    expect(tipShown()).toBe(false);
    const clicks = clickCount($('plain'));
    sendClick($('plain'));
    expect(clicks()).toBe(1);
  });

  it('a mouse hold never tips and the following click is not swallowed', () => {
    const clicks = clickCount($('plain'));
    $('plain').dispatchEvent(pe('pointerdown', { pointerType: 'mouse' }));
    advance(700);
    $('plain').dispatchEvent(pe('pointerup', { pointerType: 'mouse' }));
    sendClick($('plain'));
    expect(tipShown()).toBe(false);
    expect(clicks()).toBe(1);
  });

  it('a short touch (a tap) shows nothing', () => {
    $('plain').dispatchEvent(pe('pointerdown'));
    advance(200);
    $('plain').dispatchEvent(pe('pointerup'));
    advance(800);
    expect(tipShown()).toBe(false);
  });

  it.each(['sub', 'opt', 'handle', 'text'])('a touch hold on %s does nothing', (id) => {
    $(id).dispatchEvent(pe('pointerdown'));
    advance(700);
    expect(tipShown()).toBe(false);
    expect($(id).hasAttribute('aria-describedby')).toBe(false);
  });

  it.each(['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7'])('resolve() returns null for drag handle %s', (id) => {
    expect(dom.window.Vectura.UI.overlays.TouchTooltip._resolve($(id))).toBeNull();
    $(id).dispatchEvent(pe('pointerdown'));
    advance(700);
    expect(tipShown()).toBe(false);
  });

  it('a button whose visible text is hidden counts as icon-only (rendered text, not textContent)', () => {
    const b = dom.window.document.createElement('button');
    b.setAttribute('aria-label', 'Shift modifier');
    b.innerHTML = '<span>Shift</span>';
    dom.window.document.body.appendChild(b);
    // jsdom has no innerText; emulate a browser that hides the span (phone layout)
    Object.defineProperty(b, 'innerText', { value: '', configurable: true });
    expect(dom.window.Vectura.UI.overlays.TouchTooltip._resolve(b)).not.toBeNull();
    Object.defineProperty(b, 'innerText', { value: 'Shift', configurable: true });
    expect(dom.window.Vectura.UI.overlays.TouchTooltip._resolve(b)).toBeNull();
  });
});
