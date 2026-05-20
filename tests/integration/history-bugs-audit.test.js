/*
 * Integration tests for v1.1.10 audit history bugs:
 *
 *   Bugs-3  — Pen color/width drag commits must push exactly one history
 *             entry (on `change`, not on every `input` event).
 *   Bugs-12 — `regen()` must NOT push history by default (the existing
 *             pre-push convention is preserved); when explicitly opting in
 *             via `app.regen({ pushHistory: true })` it must push exactly one.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

const waitForUi = () => new Promise((resolve) => setTimeout(resolve, 80));

const fireEvent = (window, el, type) => {
  const event = new window.Event(type, { bubbles: true });
  el.dispatchEvent(event);
};

const firePointerEvent = (window, el, type) => {
  // jsdom doesn't implement PointerEvent — fall back to a plain Event with
  // bubbles. The pens panel only checks for the event firing, not its details.
  const Ctor = typeof window.PointerEvent === 'function' ? window.PointerEvent : window.Event;
  const event = new Ctor(type, { bubbles: true });
  el.dispatchEvent(event);
};

describe('v1.1.10 audit history bugs', () => {
  let runtime, window;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    window.app = new window.Vectura.App();
    await waitForUi();
  });

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  describe('Bugs-3: pen color/width drag pushes one history entry on commit', () => {
    test('color input: 50 input events do not grow history; trailing change pushes exactly 1', () => {
      const app = window.app;
      const SETTINGS = window.Vectura.SETTINGS;
      SETTINGS.pens = [{ id: 'pen-x', name: 'Pen X', color: '#000000', width: 0.5 }];
      app.ui.renderPens();

      const colorInput = window.document.querySelector('#pen-list .pen-color');
      expect(colorInput).toBeTruthy();

      const before = app.history.length;

      // User presses the picker (drag begins).
      firePointerEvent(window, colorInput, 'pointerdown');

      // Simulate a drag: many input events as the user drags the color picker.
      for (let i = 0; i < 50; i++) {
        colorInput.value = `#${i.toString(16).padStart(2, '0')}0000`;
        fireEvent(window, colorInput, 'input');
      }

      // History MUST NOT have grown from the intermediate drag events.
      expect(app.history.length).toBe(before);

      // Final commit fires `change` once on drag release.
      colorInput.value = '#ff0000';
      fireEvent(window, colorInput, 'change');

      // Exactly one history entry added.
      expect(app.history.length).toBe(before + 1);
      // Final value is what the user committed.
      expect(SETTINGS.pens[0].color).toBe('#ff0000');
    });

    test('width input: 50 input events do not grow history; trailing change pushes exactly 1', () => {
      const app = window.app;
      const SETTINGS = window.Vectura.SETTINGS;
      SETTINGS.pens = [{ id: 'pen-y', name: 'Pen Y', color: '#000000', width: 0.5 }];
      app.ui.renderPens();

      const widthInput = window.document.querySelector('#pen-list .pen-width');
      expect(widthInput).toBeTruthy();

      const before = app.history.length;

      // User grabs the slider thumb.
      firePointerEvent(window, widthInput, 'pointerdown');

      for (let i = 0; i < 50; i++) {
        widthInput.value = (0.1 + i * 0.01).toFixed(2);
        fireEvent(window, widthInput, 'input');
      }
      expect(app.history.length).toBe(before);

      widthInput.value = '1.20';
      fireEvent(window, widthInput, 'change');

      expect(app.history.length).toBe(before + 1);
      expect(SETTINGS.pens[0].width).toBeCloseTo(1.2, 5);
    });
  });

  describe('Bugs-12: regen() history control', () => {
    test('app.regen() with default args does NOT push history (preserves convention)', () => {
      const app = window.app;
      app.engine.addLayer('lissajous');
      const before = app.history.length;
      app.regen();
      expect(app.history.length).toBe(before);
    });

    test('app.regen({ pushHistory: true }) pushes exactly one history entry', () => {
      const app = window.app;
      app.engine.addLayer('lissajous');
      const before = app.history.length;
      app.regen({ pushHistory: true });
      expect(app.history.length).toBe(before + 1);
    });
  });
});
