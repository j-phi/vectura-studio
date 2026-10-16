/**
 * TUX-045: touch modifier tasks (Multi-select, Constrain, Duplicate, Pan) are one-shot latches
 * with a double-tap lock. Runtime-only state: never saved, never touched by history.
 *
 * jsdom has no PointerEvent, so a MouseEvent subclass shim carries pointerType and pointerId.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };

describe('TUX-045 touch modifier latches', () => {
  let runtime;
  let win;
  let doc;
  let IM;

  const pe = (type, o = {}) => new win.PointerEvent(type, {
    bubbles: true, cancelable: true, clientX: 0, clientY: 0, button: 0, ...o,
  });
  const T = (id = 1) => ({ pointerType: 'touch', pointerId: id });
  const canvas = () => doc.getElementById('main-canvas');
  const gesture = (o = T()) => {
    canvas().dispatchEvent(pe('pointerdown', o));
    canvas().dispatchEvent(pe('pointerup', o));
  };
  const barBtn = (task) => doc.querySelector(`#touch-modifier-bar [data-touch-mod="${task}"]`);
  const tapBar = (task) => barBtn(task).dispatchEvent(pe('pointerup', T(9)));
  const state = (task) => IM.getTaskState(task);

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
  });

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('(a) one bar tap latches Constrain; the next canvas gesture consumes it after the readers ran', async () => {
    tapBar('constrain');
    expect(state('constrain')).toBe('latched');
    expect(IM.readModifiers({ pointerType: 'touch' }).shift).toBe(true);
    gesture();
    // Readers (renderer pointerup) still see the latch before the setTimeout(0) flush.
    expect(IM.readModifiers({ pointerType: 'touch' }).shift).toBe(true);
    await sleep(5);
    expect(state('constrain')).toBe('off');
    expect(IM.readModifiers({ pointerType: 'touch' }).shift).toBe(false);
  });

  test('(b) double-tap inside 300 ms locks; a third tap or a slow second tap turns it off', async () => {
    IM.tap('constrain', 1000);
    IM.tap('constrain', 1200);
    expect(state('constrain')).toBe('locked');
    gesture(T(2));
    await sleep(5);
    gesture(T(3));
    await sleep(5);
    expect(state('constrain')).toBe('locked');
    IM.tap('constrain', 5000);
    expect(state('constrain')).toBe('off');
    IM.tap('constrain', 6000);
    IM.tap('constrain', 6400);
    expect(state('constrain')).toBe('off');
  });

  test('(c) a bar tap alone leaves the latch on, and tapping another task does not consume it', async () => {
    tapBar('constrain');
    tapBar('duplicate');
    await sleep(5);
    expect(state('constrain')).toBe('latched');
    expect(state('duplicate')).toBe('latched');
  });

  test('(d) a second pointer (pinch) and pointercancel do not consume', async () => {
    IM.tap('constrain', 0);
    canvas().dispatchEvent(pe('pointerdown', T(1)));
    canvas().dispatchEvent(pe('pointerdown', T(2)));
    canvas().dispatchEvent(pe('pointerup', T(1)));
    canvas().dispatchEvent(pe('pointerup', T(2)));
    await sleep(5);
    expect(state('constrain')).toBe('latched');
    canvas().dispatchEvent(pe('pointerdown', T(3)));
    canvas().dispatchEvent(pe('pointercancel', T(3)));
    await sleep(5);
    expect(state('constrain')).toBe('latched');
  });

  test('(e) pen applies and consumes; mouse neither applies nor consumes', async () => {
    IM.tap('constrain', 0);
    expect(IM.readModifiers({ pointerType: 'pen' }).shift).toBe(true);
    expect(IM.readModifiers({ pointerType: 'mouse' }).shift).toBe(false);
    expect(IM.readModifiers({}).shift).toBe(false);
    gesture({ pointerType: 'mouse', pointerId: 1 });
    await sleep(5);
    expect(state('constrain')).toBe('latched');
    gesture({ pointerType: 'pen', pointerId: 4 });
    await sleep(5);
    expect(state('constrain')).toBe('off');
  });

  test('(f) Multi-select sets additive only; Constrain does not', () => {
    IM.tap('multiSelect', 0);
    const m = IM.readModifiers({ pointerType: 'touch' });
    expect(m.additive).toBe(true);
    expect(m.shift).toBe(false);
    expect(m.meta).toBe(false);
    IM.clearAll();
    IM.tap('constrain', 0);
    const c = IM.readModifiers({ pointerType: 'touch' });
    expect(c.additive).toBe(false);
    expect(c.shift).toBe(true);
    // Desktop result is unchanged: keyboard modifiers pass through bit-identically.
    const d = IM.readModifiers({ pointerType: 'mouse', shiftKey: true, ctrlKey: true });
    expect(d).toEqual({ shift: true, alt: false, meta: true, ctrl: true, pan: false, additive: true, rawShift: true, multiSelect: false });
  });

  describe('(g) renderer', () => {
    let engine;
    let renderer;
    let A;
    let B;
    const rect = (x0, y0, x1, y1) => [[{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }]];
    const at = (type, x, y, o) => pe(type, { clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1, ...o });

    beforeEach(() => {
      const { Layer } = win.Vectura;
      engine = win.app.engine;
      renderer = win.app.renderer;
      engine.layers = [];
      A = new Layer('tc-a', 'shape', 'A');
      A.sourcePaths = rect(40, 40, 80, 80);
      B = new Layer('tc-b', 'shape', 'B');
      B.sourcePaths = rect(140, 40, 180, 80);
      engine.layers.push(A, B);
      engine.generate(A.id);
      engine.generate(B.id);
      renderer.setTool('select');
      renderer.scale = 1;
      renderer.offsetX = 0;
      renderer.offsetY = 0;
      renderer.setSelection([A.id], A.id);
    });

    const tapAt = async (x, y, o = T()) => {
      canvas().dispatchEvent(at('pointerdown', x, y, o));
      canvas().dispatchEvent(at('pointerup', x, y, o));
      await sleep(5);
    };

    test('Constrain latched: a touch tap on another object selects only it', async () => {
      IM.tap('constrain', 0);
      await tapAt(140, 60);
      expect([...renderer.selectedLayerIds]).toEqual([B.id]);
    });

    test('Multi-select latched: a touch tap adds the object to the selection', async () => {
      IM.tap('multiSelect', 0);
      await tapAt(140, 60);
      expect([...renderer.selectedLayerIds].sort()).toEqual([A.id, B.id].sort());
    });

    describe('Direct tool anchor multi-select follows Multi-select only', () => {
      const prime = async () => {
        renderer.setTool('direct');
        renderer.setDirectSelection(A, 0);
        await tapAt(40, 40); // plain touch tap selects anchor 0
        expect([...renderer.directSelection.selectedIndices]).toEqual([0]);
      };

      test('Multi-select latched: a touch tap on a second anchor selects 2 anchors', async () => {
        await prime();
        IM.tap('multiSelect', 0);
        await tapAt(80, 80);
        expect([...renderer.directSelection.selectedIndices].sort()).toEqual([0, 2]);
      });

      test('Constrain latched only: a touch tap on a second anchor replaces the selection', async () => {
        await prime();
        IM.tap('constrain', 0);
        await tapAt(80, 80);
        expect([...renderer.directSelection.selectedIndices]).toEqual([2]);
      });
    });

    test('Multi-select latched: a diagonal touch drag is not axis-locked', async () => {
      IM.tap('multiSelect', 0);
      IM.tap('multiSelect', 100); // lock so the first gesture does not consume it
      // TUX-024: a finger picks within 22 px of a stroke, and a latched multi-select press ON a selected stroke toggles it. A 40 px
      // box has no interior point further than 20 px from its edge, so the drag starts inside a larger selected box instead.
      A.sourcePaths = rect(0, 0, 120, 120);
      engine.generate(A.id);
      renderer.setSelection([A.id], A.id);
      const o = T();
      canvas().dispatchEvent(at('pointerdown', 60, 60, o));
      await sleep(400);
      for (let i = 1; i <= 10; i += 1) win.dispatchEvent(at('pointermove', 60 + i * 3, 60 + i * 7, o));
      const t = renderer.tempTransform;
      expect(t).toBeTruthy();
      expect(Math.abs(t.dx)).toBeGreaterThan(1);
      expect(Math.abs(t.dy)).toBeGreaterThan(1);
      win.dispatchEvent(at('pointerup', 90, 130, o));
    });
  });

  describe('(h) persistence', () => {
    test('legacy prefs carrying touchModifiers leave every task off', async () => {
      runtime?.cleanup?.();
      runtime = await loadVecturaRuntime(FULL_STACK);
      win = runtime.window;
      doc = win.document;
      win.localStorage.setItem('vectura_prefs', JSON.stringify({
        version: 1, data: { cookiePreferencesEnabled: true, touchModifiers: { shift: true } },
      }));
      win.app = new win.Vectura.App();
      await Promise.resolve();
      IM = win.Vectura.InputModifiers;
      ['multiSelect', 'constrain', 'duplicate', 'pan'].forEach((t) => expect(IM.getTaskState(t)).toBe('off'));
    });

    test('captureState has no touchModifiers; history and applyState leave latches alone', async () => {
      IM.tap('constrain', 0);
      expect(JSON.stringify(win.app.captureState())).not.toContain('touchModifiers');
      win.app.pushHistory();
      win.app.undo?.();
      win.app.redo?.();
      expect(state('constrain')).toBe('latched');
      const s = win.app.captureState();
      s.touchModifiers = { shift: true, alt: true };
      IM.clearAll();
      win.app.applyState(s);
      ['multiSelect', 'constrain', 'duplicate', 'pan'].forEach((t) => expect(IM.getTaskState(t)).toBe('off'));
    });
  });

  test('(i) designers: pen with Duplicate latched reads alt; mouse never does', () => {
    IM.tap('duplicate', 0);
    expect(IM.readModifiers({ pointerType: 'pen' }).alt).toBe(true);
    expect(IM.readModifiers({ pointerType: 'mouse' }).alt).toBe(false);
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../src/ui/ui-pattern-designer.js'), 'utf8');
    expect(src).not.toMatch(/SETTINGS\?\.touchModifiers/);
    const petal = require('fs').readFileSync(require('path').join(__dirname, '../../src/ui/ui-petal-designer.js'), 'utf8');
    expect(petal).not.toMatch(/touchModifiers/);
  });

  test('(j) the shape-complete hook never clears a locked task, and clears a latched one', () => {
    IM.tap('constrain', 0);
    IM.tap('constrain', 100);
    IM.tap('duplicate', 0);
    win.app.renderer.onClearTransientModifiers();
    expect(state('constrain')).toBe('locked');
    expect(state('duplicate')).toBe('off');
  });

  test('bar: four named task buttons, no Cmd/Ctrl/Shift/Alt, aria-pressed and locked state', () => {
    const names = [...doc.querySelectorAll('#touch-modifier-bar .touch-mod-btn')].map((b) => b.getAttribute('aria-label').toLowerCase());
    expect(names).toEqual(['multi-select', 'constrain', 'duplicate', 'pan']);
    expect(doc.querySelector('.touch-mod-btn[data-touch-mod="ctrl"]')).toBeNull();
    expect(doc.querySelector('.touch-mod-btn[data-touch-mod="meta"]')).toBeNull();
    expect(doc.querySelector('.touch-mod-btn[data-touch-mod="space"]')).toBeNull();
    IM.tap('pan', 0);
    expect(barBtn('pan').getAttribute('aria-pressed')).toBe('true');
    IM.tap('pan', 50);
    expect(barBtn('pan').dataset.state).toBe('locked');
    const badge = doc.getElementById('touch-mod-badge');
    expect(badge.textContent).toMatch(/Pan/);
  });
});
