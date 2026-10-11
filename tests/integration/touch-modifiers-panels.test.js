/**
 * TUX-033: the layer list and the renderer read modifiers through Vectura.InputModifiers,
 * so a touch task (Multi-select) works where a keyboard Cmd/Shift click works on desktop.
 * WebKit reports pointerType 'mouse' on the click that follows a tap, so every tap here is
 * pointerdown(touch) + pointerup(touch) + a plain click.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };

describe('TUX-033 panels and renderer honour touch modifiers', () => {
  let runtime;
  let win;
  let doc;
  let IM;
  let ids;

  const pe = (type, o = {}) => new win.PointerEvent(type, { bubbles: true, cancelable: true, button: 0, ...o });
  const card = (i) => doc.querySelector(`[data-lvl-id="${ids[i]}"]`);
  const sel = () => [...win.app.renderer.selectedLayerIds];
  const touchTap = (el, id = 1) => {
    el.dispatchEvent(pe('pointerdown', { pointerType: 'touch', pointerId: id }));
    el.dispatchEvent(pe('pointerup', { pointerType: 'touch', pointerId: id }));
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  };
  const mouseClick = (el, o = {}) => {
    el.dispatchEvent(pe('pointerdown', { pointerType: 'mouse', pointerId: 7 }));
    el.dispatchEvent(pe('pointerup', { pointerType: 'mouse', pointerId: 7 }));
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, ...o }));
  };
  const latch = (task) => IM.tap(task, 0);

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    win = runtime.window;
    doc = win.document;
    win.PointerEvent = class extends win.MouseEvent {
      constructor(t, o = {}) {
        super(t, o);
        this.pointerId = o.pointerId ?? 1;
        this.pointerType = o.pointerType ?? 'mouse';
        this.isPrimary = o.isPrimary ?? true;
      }
    };
    win.app = new win.Vectura.App();
    await Promise.resolve();
    IM = win.Vectura.InputModifiers;
    ids = [];
    for (let i = 0; i < 4; i += 1) ids.push(win.app.engine.addLayer('wavetable'));
    win.app.ui.renderLayers();
    // lastLayerClickId anchors a range; each test starts with nothing selected.
    win.app.ui.lastLayerClickId = null;
    await sleep(20);
  });

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('A1/A2 Multi-select latch toggles rows in; a second tap toggles one off', () => {
    latch('multiSelect');
    touchTap(card(0).querySelector('.lvl-card-body') || card(0));
    expect(sel().length).toBe(1);
    touchTap(card(2).querySelector('.lvl-card-body') || card(2));
    expect(sel().sort()).toEqual([ids[0], ids[2]].sort());
  });

  test('A2b locked Multi-select toggles off a selected row', async () => {
    latch('multiSelect'); latch('multiSelect');
    expect(IM.getTaskState('multiSelect')).toBe('locked');
    touchTap(card(0).querySelector('.lvl-card-body') || card(0));
    touchTap(card(2).querySelector('.lvl-card-body') || card(2));
    expect(sel().length).toBe(2);
    touchTap(card(2).querySelector('.lvl-card-body') || card(2));
    expect(sel()).toEqual([ids[0]]);
  });

  test('A3 desktop guard: a latch never alters a mouse click', () => {
    latch('multiSelect');
    mouseClick(card(0).querySelector('.lvl-card-body') || card(0));
    mouseClick(card(2).querySelector('.lvl-card-body') || card(2));
    expect(sel()).toEqual([ids[2]]);
  });

  test('A4 real keys unchanged without a latch', () => {
    const b = (i) => card(i).querySelector('.lvl-card-body') || card(i);
    mouseClick(b(0));
    mouseClick(b(2), { shiftKey: true });
    expect(sel().length).toBe(3);
    mouseClick(b(3), { metaKey: true });
    expect(sel().length).toBe(4);
    mouseClick(b(3), { ctrlKey: true });
    expect(sel().length).toBe(3);
  });

  test('A5 a stale snapshot expires and never reaches key events', () => {
    latch('multiSelect');
    const b = (i) => card(i).querySelector('.lvl-card-body') || card(i);
    b(0).dispatchEvent(pe('pointerdown', { pointerType: 'touch', pointerId: 1 }));
    const realNow = win.Date.now;
    try {
      win.Date.now = () => realNow() + 1500;
      b(0).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
      expect(IM.readModifiers(new win.MouseEvent('click')).multiSelect).toBe(false);
    } finally { win.Date.now = realNow; }
    expect(sel()).toEqual([ids[0]]);
    b(1).dispatchEvent(pe('pointerdown', { pointerType: 'touch', pointerId: 1 }));
    const kd = new win.KeyboardEvent('keydown', { key: 'a' });
    expect(IM.readModifiers(kd).multiSelect).toBe(false);
    expect(IM.readModifiers(kd).shift).toBe(false);
  });

  test('A6 the one-shot latch is released before click, the click still toggles', async () => {
    latch('multiSelect');
    const b = (i) => card(i).querySelector('.lvl-card-body') || card(i);
    touchTap(b(0));
    await sleep(10); // consume (setTimeout 0) runs after pointerup
    touchTap(b(2)); // latch is off now: plain select
    expect(sel()).toEqual([ids[2]]);
    // And the pointerup-then-release order: latch, down, up, release, click.
    latch('multiSelect');
    const el = b(0);
    el.dispatchEvent(pe('pointerdown', { pointerType: 'touch', pointerId: 2 }));
    el.dispatchEvent(pe('pointerup', { pointerType: 'touch', pointerId: 2 }));
    await sleep(10);
    expect(IM.getTaskState('multiSelect')).toBe('off');
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    expect(sel().sort()).toEqual([ids[0], ids[2]].sort());
  });

  test('A7 UI.getModifierState(layer) still returns the mirror modifier state', () => {
    const plain = win.app.engine.getLayerById(ids[0]);
    expect(win.app.ui.getModifierState(plain)).toBeNull();
  });

  test('B1 fill sample: the Multi-select task adopts a fill on touch, the mouse ignores it', () => {
    const r = win.app.renderer;
    let adopted = 0;
    r._paintBucketAdoptAtPoint = () => { adopted += 1; return true; };
    r.activeTool = 'fill';
    r._isWorldInsidePaper = () => true;
    r._paintBucketHover = () => {};
    const c = doc.getElementById('main-canvas');
    const down = (o) => {
      c.dispatchEvent(pe('pointerdown', { clientX: 10, clientY: 10, ...o }));
      win.dispatchEvent(pe('pointerup', { clientX: 10, clientY: 10, ...o }));
    };
    latch('multiSelect');
    down({ pointerType: 'touch', pointerId: 3 });
    expect(adopted).toBe(1);
    IM.clearAll();
    down({ pointerType: 'touch', pointerId: 4 });
    expect(adopted).toBe(1);
    latch('multiSelect');
    down({ pointerType: 'mouse', pointerId: 5 });
    expect(adopted).toBe(1);
    down({ pointerType: 'mouse', pointerId: 6, metaKey: true });
    expect(adopted).toBe(2);
  });

  // Drag-pour rig: three regions side by side (loopId = floor(x / 100)); the real _paintBucketPour
  // runs, only the region lookup and the fill write are stubbed. The batch is lastPaintedFillRefs.
  const dragRig = () => {
    const r = win.app.renderer;
    const PBO = win.Vectura.PaintBucketOps;
    const origApply = PBO.applyFillAtPoint;
    let n = 0;
    PBO.applyFillAtPoint = (_e, _a, x) => {
      n += 1;
      return { loopId: Math.floor(x / 100), fillId: `f${n}`, layerId: 'L' };
    };
    r.activeTool = 'fill';
    r._isWorldInsidePaper = () => true;
    r.screenToWorld = (x, y) => ({ x, y });
    r._paintBucketHover = (world) => {
      r.paintBucketStack = [{ loopId: Math.floor(world.x / 100), polygon: null }];
      r.paintBucketScopeIndex = 0;
    };
    const c = doc.getElementById('main-canvas');
    c.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 });
    const ev = (type, target, o) => target.dispatchEvent(pe(type, { clientY: 10, ...o }));
    return {
      batch: () => (r.lastPaintedFillRefs || []).length,
      restore: () => { PBO.applyFillAtPoint = origApply; },
      drag: (o, xs, pointerId = 21) => {
        ev('pointerdown', c, { clientX: xs[0], pointerId, buttons: 1, ...o });
        xs.slice(1).forEach((x) => ev('pointermove', win, { clientX: x, pointerId, buttons: 1, ...o }));
        ev('pointerup', win, { clientX: xs[xs.length - 1], pointerId, buttons: 0, ...o });
      },
    };
  };
  const REGIONS = [50, 150, 250];

  test('B2 a touch drag with the Constrain task pours into each region it crosses', () => {
    const rig = dragRig();
    try {
      latch('constrain');
      rig.drag({ pointerType: 'touch' }, REGIONS);
      expect(rig.batch()).toBe(3);
    } finally { rig.restore(); }
  });

  test('B2b without the task a touch drag pours once, on the lift (TUX-022)', () => {
    const rig = dragRig();
    try {
      rig.drag({ pointerType: 'touch' }, REGIONS);
      expect(rig.batch()).toBe(1);
    } finally { rig.restore(); }
  });

  test('B2c a cancelled plain touch press pours nothing', () => {
    const rig = dragRig();
    try {
      const c = doc.getElementById('main-canvas');
      c.dispatchEvent(pe('pointerdown', { clientX: 50, clientY: 10, pointerType: 'touch', pointerId: 22, buttons: 1 }));
      win.dispatchEvent(pe('pointercancel', { clientX: 50, clientY: 10, pointerType: 'touch', pointerId: 22 }));
      expect(rig.batch()).toBe(0);
    } finally { rig.restore(); }
  });

  test('B3 mouse parity: the Constrain task never drag-pours a mouse, a real Shift does', () => {
    const rig = dragRig();
    try {
      latch('constrain');
      rig.drag({ pointerType: 'mouse' }, REGIONS, 23);
      expect(rig.batch()).toBe(1);
      IM.clearAll();
      rig.drag({ pointerType: 'mouse', shiftKey: true }, REGIONS, 24);
      expect(rig.batch()).toBe(3);
    } finally { rig.restore(); }
  });
});
