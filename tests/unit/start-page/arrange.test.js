/**
 * Start Page Arrange mode (src/ui/start-page/plates/arrange.js): pointer + touch drag with a labelled drop line,
 * keyboard Alt+Up/Down with aria-live text (incl. the two-darks warning), autoscroll, Undo, reset, FLIP under
 * reduced motion. JSDOM has no layout, so row rects are stubbed from DOM order.
 */
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '../../..');
const FILES = ['src/ui/start-page/dom.js', 'src/ui/start-page/plates/arrange.js'];
const ROW_H = 60;

let dom; let win; let doc; let A; let host; let moves; let toasts; let reduce;

const load = () => {
  FILES.forEach((f) => { delete require.cache[path.join(ROOT, f)]; });
  dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true });
  win = dom.window; doc = win.document;
  global.window = win; global.document = doc;
  reduce = false;
  win.matchMedia = (q) => ({ matches: /reduce/.test(q) ? reduce : false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  toasts = [];
  win.Vectura = { UI: { overlays: { Toast: { show: (p) => { toasts.push(p); return { dismiss() {}, el: doc.createElement('div') }; } } } } };
  FILES.forEach((f) => require(path.join(ROOT, f)));
  A = win.Vectura.UI.StartPageArrange;
  host = doc.getElementById('host');
  // layout stub: every row is ROW_H tall, stacked in DOM order, offset by the scroller position
  win.HTMLElement.prototype.getBoundingClientRect = function rect() {
    const list = this.closest && this.closest('.sp-arr-list');
    if (this.classList && this.classList.contains('sp-arr-row') && list) {
      const i = [...list.querySelectorAll('.sp-arr-row')].indexOf(this);
      return { top: i * ROW_H, bottom: i * ROW_H + ROW_H, height: ROW_H, left: 0, right: 400, width: 400, x: 0, y: i * ROW_H };
    }
    if (this.classList && this.classList.contains('sp-arr-list')) return { top: 0, bottom: 600, height: 600, left: 0, right: 400, width: 400, x: 0, y: 0 };
    return { top: 0, bottom: 0, height: 0, left: 0, right: 0, width: 0, x: 0, y: 0 };
  };
};

const PLATES = () => ([
  { id: 'a', name: 'Alpha', colorway: { ground: '#f4efe6', ink: '#111111', class: 'light' } },
  { id: 'b', name: 'Beta', colorway: { ground: '#0b0b0d', ink: '#e9e9e9', class: 'dark' } },
  { id: 'c', name: 'Gamma', colorway: { ground: '#d9c9a8', ink: '#222222', class: 'ground' } },
  { id: 'd', name: 'Delta', colorway: { ground: '#101418', ink: '#f0f0f0', class: 'dark' } },
  { id: 'e', name: 'Epsilon', colorway: { ground: '#ffffff', ink: '#000000', class: 'light' }, hidden: true },
]);

const enter = (extra = {}) => {
  moves = [];
  const handle = A.enter(host, Object.assign({
    plates: PLATES(),
    onMove: (ids) => moves.push(ids.slice()),
    onResetOrder: () => ['a', 'b', 'c', 'd', 'e'],
    onExit: () => { handle.exited = true; },
  }, extra));
  return handle;
};
const rows = () => [...host.querySelectorAll('.sp-arr-row')];
const ids = () => rows().map((r) => r.dataset.plateId);
const live = () => host.querySelector('[aria-live]').textContent.replace(/ /g, ' ').trim();
const pe = (type, init = {}) => {
  const ev = new win.Event(type, { bubbles: true, cancelable: true });
  Object.assign(ev, { pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true, clientX: 20, clientY: 0 }, init);
  return ev;
};
const key = (el, k, init = {}) => { const ev = new win.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, init)); el.dispatchEvent(ev); return ev; };
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

beforeEach(load);
afterEach(() => { delete global.window; delete global.document; });

describe('StartPageArrange.enter', () => {
  test('shows all N rows in order, hidden ones marked, on their own paper', () => {
    enter();
    expect(ids()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(rows()[0].textContent).toMatch(/Plate 01/);
    expect(rows()[4].textContent).toMatch(/Hidden on the page/);
    expect(rows()[0].textContent).not.toMatch(/Hidden on the page/);
    expect(rows()[1].style.getPropertyValue('--spa-paper')).toBe('#0b0b0d');
    expect(rows()[1].dataset.dark).toBe('true');
    expect(host.dataset.arranging).toBe('true');
  });

  test('exit (Done) removes the rows, restores the plate list and calls onExit once', () => {
    host.innerHTML = '<div class="plate-x">p</div>';
    const h = enter();
    expect(host.querySelector('.plate-x').hidden).toBe(true);
    host.querySelector('[data-arr-done]').click();
    expect(h.exited).toBe(true);
    expect(host.querySelector('.sp-arr')).toBeNull();
    expect(host.querySelector('.plate-x').hidden).toBe(false);
    expect(host.dataset.arranging).toBeUndefined();
    h.exit(); // idempotent
  });

  test('Escape leaves arrange mode', () => {
    const h = enter();
    key(rows()[0], 'Escape');
    expect(h.exited).toBe(true);
  });
});

describe('pointer + touch drag', () => {
  const drag = (pointerType) => {
    enter();
    const grip = rows()[0].querySelector('.sp-arr-grip');
    grip.dispatchEvent(pe('pointerdown', { pointerType, clientY: 30 }));
    win.dispatchEvent(pe('pointermove', { pointerType, clientY: 90 }));
    return grip;
  };

  test('lifts the row, follows the pointer, and shows a labelled drop line', () => {
    drag('mouse');
    expect(rows()[0].classList.contains('dragging')).toBe(true);
    expect(rows()[0].style.transform).toMatch(/translateY\(60px\)/);
    const line = host.querySelector('.sp-arr-drop');
    expect(line.hidden).toBe(false);
    expect(line.dataset.label).toBe('Drop as plate 02');
    expect(host.querySelector('.sp-arr-list').classList.contains('dnd')).toBe(true);
  });

  test.each(['mouse', 'touch', 'pen'])('%s drop commits the order through onMove', (type) => {
    drag(type);
    win.dispatchEvent(pe('pointermove', { pointerType: type, clientY: 260 }));
    win.dispatchEvent(pe('pointerup', { pointerType: type, clientY: 260 }));
    expect(moves).toHaveLength(1);
    expect(moves[0]).toEqual(['b', 'c', 'd', 'a', 'e']);
    expect(ids()).toEqual(['b', 'c', 'd', 'a', 'e']);
    expect(rows()[3].classList.contains('dragging')).toBe(false);
    expect(host.querySelector('.sp-arr-drop').hidden).toBe(true);
  });

  test('pointercancel and Escape abort without a move', () => {
    drag('touch');
    win.dispatchEvent(pe('pointercancel', { pointerType: 'touch' }));
    expect(moves).toHaveLength(0);
    expect(ids()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(rows()[0].classList.contains('dragging')).toBe(false);
    drag('mouse');
    key(doc.body, 'Escape');
    win.dispatchEvent(pe('pointerup', { clientY: 200 }));
    expect(moves).toHaveLength(0);
  });

  test('a click on the grip without travel is not a move', () => {
    enter();
    const grip = rows()[0].querySelector('.sp-arr-grip');
    grip.dispatchEvent(pe('pointerdown', { clientY: 30 }));
    win.dispatchEvent(pe('pointerup', { clientY: 31 }));
    expect(moves).toHaveLength(0);
  });

  test('a drop offers Undo that restores the previous order through onMove', () => {
    drag('mouse');
    win.dispatchEvent(pe('pointerup', { clientY: 200 }));
    expect(moves[0]).toEqual(['b', 'c', 'a', 'd', 'e']);
    const t = toasts[toasts.length - 1];
    expect(t.action.label).toBe('Undo');
    t.action.onAction({ dismiss() {}, disableAction() {} });
    expect(moves[1]).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(ids()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('autoscroll', () => {
  test('edgeVelocity is zero mid-viewport and signed near the edges, capped', () => {
    const v = A.edgeVelocity;
    expect(v(300, 0, 600)).toBe(0);
    expect(v(10, 0, 600)).toBeLessThan(0);
    expect(v(590, 0, 600)).toBeGreaterThan(0);
    expect(Math.abs(v(-500, 0, 600))).toBeLessThanOrEqual(A.MAX_SPEED);
    expect(Math.abs(v(5000, 0, 600))).toBeLessThanOrEqual(A.MAX_SPEED);
  });

  test('dragging near the bottom edge scrolls the scroller and keeps the drop line in step', async () => {
    const scroller = doc.createElement('div');
    scroller.scrollTop = 0;
    scroller.getBoundingClientRect = () => ({ top: 0, bottom: 600, height: 600, left: 0, right: 400, width: 400 });
    enter({ scroller });
    const grip = rows()[0].querySelector('.sp-arr-grip');
    grip.dispatchEvent(pe('pointerdown', { clientY: 30 }));
    win.dispatchEvent(pe('pointermove', { clientY: 590 }));
    await tick(120);
    expect(scroller.scrollTop).toBeGreaterThan(0);
    win.dispatchEvent(pe('pointerup', { clientY: 590 }));
    const top = scroller.scrollTop;
    await tick(80);
    expect(scroller.scrollTop).toBe(top); // loop stopped on drop
  });
});

describe('keyboard', () => {
  test('Alt+ArrowDown moves the plate and announces it', () => {
    enter();
    key(rows()[0], 'ArrowDown', { altKey: true });
    expect(moves[0]).toEqual(['b', 'a', 'c', 'd', 'e']);
    expect(live()).toMatch(/^Moved Plate 1 to position 2/);
    expect(doc.activeElement).toBe(rows()[1]);
    expect(rows()[1].dataset.plateId).toBe('a');
  });

  test('Alt+ArrowUp at the top and Alt+ArrowDown at the bottom do nothing', () => {
    enter();
    key(rows()[0], 'ArrowUp', { altKey: true });
    key(rows()[4], 'ArrowDown', { altKey: true });
    expect(moves).toHaveLength(0);
  });

  test('plain arrows (no Alt) do not reorder', () => {
    enter();
    key(rows()[1], 'ArrowDown');
    expect(moves).toHaveLength(0);
  });

  test('up/down buttons move too, labelled, and are disabled at the ends', () => {
    enter();
    expect(rows()[0].querySelector('[data-arr-up]').disabled).toBe(true);
    expect(rows()[4].querySelector('[data-arr-down]').disabled).toBe(true);
    const dn = rows()[2].querySelector('[data-arr-down]');
    expect(dn.getAttribute('aria-label')).toBe('Move plate 3 down');
    dn.click();
    expect(moves[0]).toEqual(['a', 'b', 'd', 'c', 'e']);
    expect(live()).toMatch(/^Moved Plate 3 to position 4/);
  });

  test('moving a dark plate next to another dark announces the warning', () => {
    enter();
    key(rows()[2], 'ArrowUp', { altKey: true }); // Gamma above Beta: a c b d -> darks b,d now adjacent
    expect(live()).toMatch(/Two dark plates are now next to each other/);
    key(rows()[1], 'ArrowDown', { altKey: true }); // c back under b?: a b c d -> apart again
    expect(live()).not.toMatch(/Two dark plates/);
  });

  test('every move offers Undo', () => {
    enter();
    key(rows()[0], 'ArrowDown', { altKey: true });
    const t = toasts[toasts.length - 1];
    expect(t.action.label).toBe('Undo');
    t.action.onAction({ dismiss() {}, disableAction() {} });
    expect(moves[1]).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(live()).toMatch(/Order restored/);
  });
});

describe('reset to suggested order', () => {
  test('applies the ids onResetOrder returns, announces, and offers Undo', async () => {
    enter({ plates: PLATES().reverse(), onResetOrder: () => ['a', 'b', 'c', 'd', 'e'] });
    expect(ids()).toEqual(['e', 'd', 'c', 'b', 'a']);
    host.querySelector('[data-arr-reset]').click();
    await tick();
    expect(ids()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(live()).toMatch(/suggested order/i);
    expect(toasts[toasts.length - 1].action.label).toBe('Undo');
  });
});

describe('FLIP reflow and reduced motion', () => {
  test('with motion, moved rows get an inverse transform that is cleared afterwards', async () => {
    enter();
    key(rows()[0], 'ArrowDown', { altKey: true });
    const moved = rows().filter((r) => r.style.transform && r.style.transform !== 'none');
    expect(moved.length).toBeGreaterThan(0);
    await tick(600);
    rows().forEach((r) => { expect(r.style.transform).toBe(''); expect(r.style.transition).toBe(''); });
    expect(ids()).toEqual(['b', 'a', 'c', 'd', 'e']);
  });

  test('with prefers-reduced-motion nothing animates and the order is still right', async () => {
    reduce = true;
    enter();
    key(rows()[0], 'ArrowDown', { altKey: true });
    rows().forEach((r) => { expect(r.style.transform).toBe(''); expect(r.style.transition).toBe(''); });
    expect(ids()).toEqual(['b', 'a', 'c', 'd', 'e']);
    expect(moves).toHaveLength(1);
    await tick(50);
    rows().forEach((r) => expect(r.style.transform).toBe(''));
  });
});
