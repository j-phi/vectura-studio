/*
 * Compile gate for src/ui/modals/color-picker.js (Phase 3 step 4 — first modal).
 *
 * Verifies the color-picker module:
 *   - registers as window.Vectura.UI.Modals.ColorPicker
 *   - exposes bind() + openColorModal()
 *   - throws a clear error if openColorModal runs before bind()
 *   - openColorModal composes this.openModal() with the expected title and
 *     body markup (saturation-value canvas, hue strip, hex input, cancel +
 *     apply buttons)
 *   - a non-#RRGGBB seed value falls back to the default red (#ff0000) — this
 *     is the contract relied on by `openColorPickerAnchoredTo` when the
 *     source `<input type="color">` has not yet been initialized
 *   - clicking Cancel routes to this.closeModal() without calling onApply;
 *     clicking Apply routes through onApply(hex) then closes
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const loadInJSDOM = (scriptPaths) => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const context = dom.getInternalVMContext();
  for (const rel of scriptPaths) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, context, { filename: rel });
  }
  return dom;
};

describe('color-picker compile gate', () => {
  let dom;
  let ColorPicker;

  beforeAll(() => {
    dom = loadInJSDOM(['src/ui/modals/color-picker.js']);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    expect(w.Vectura.UI.Modals).toBeTruthy();
    ColorPicker = w.Vectura.UI.Modals.ColorPicker;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.Modals.ColorPicker with bind + openColorModal', () => {
    expect(ColorPicker).toBeTruthy();
    expect(typeof ColorPicker.bind).toBe('function');
    expect(typeof ColorPicker.openColorModal).toBe('function');
  });

  it('openColorModal throws a clear error before bind()', () => {
    expect(() => ColorPicker.openColorModal.call({}, { title: 'X', value: '#ffffff' }))
      .toThrow(/ColorPicker\.openColorModal invoked before ColorPicker\.bind/);
  });

  it('after bind(), openColorModal composes openModal with the picker markup', () => {
    ColorPicker.bind({});

    let lastCall = null;
    const stub = {
      modal: { bodyEl: dom.window.document.createElement('div') },
      openModal(opts) {
        lastCall = opts;
        // mimic real openModal: drop the body markup into bodyEl so the
        // module's querySelector lookups resolve.
        this.modal.bodyEl.innerHTML = opts.body;
      },
      closeModal() {},
    };

    ColorPicker.openColorModal.call(stub, {
      title: 'Margin Color',
      value: '#abcdef',
      onApply: () => {},
    });

    expect(lastCall).toBeTruthy();
    expect(lastCall.title).toBe('Margin Color');
    // Picker scaffold present
    expect(lastCall.body).toContain('color-modal');
    expect(lastCall.body).toContain('color-sv-canvas');
    expect(lastCall.body).toContain('color-hue-canvas');
    expect(lastCall.body).toContain('color-modal-hex');
    expect(lastCall.body).toContain('color-modal-cancel');
    expect(lastCall.body).toContain('color-modal-apply');
    // Hex seed shown uppercase, sans #
    expect(lastCall.body).toContain('value="ABCDEF"');
  });

  it('non-#RRGGBB seed falls back to default red (#ff0000)', () => {
    let lastCall = null;
    const stub = {
      modal: { bodyEl: dom.window.document.createElement('div') },
      openModal(opts) { lastCall = opts; this.modal.bodyEl.innerHTML = opts.body; },
      closeModal() {},
    };
    ColorPicker.openColorModal.call(stub, { title: 'X', value: 'not-a-hex' });
    // Default red, uppercase, no #
    expect(lastCall.body).toContain('value="FF0000"');
  });

  it('Cancel routes to closeModal without invoking onApply; Apply invokes onApply then closes', () => {
    let closed = 0;
    let applied = null;
    const stub = {
      modal: { bodyEl: dom.window.document.createElement('div') },
      openModal(opts) { this.modal.bodyEl.innerHTML = opts.body; },
      closeModal() { closed += 1; },
    };
    ColorPicker.openColorModal.call(stub, {
      title: 'X',
      value: '#123456',
      onApply: (hex) => { applied = hex; },
    });

    const cancelBtn = stub.modal.bodyEl.querySelector('.color-modal-cancel');
    const applyBtn = stub.modal.bodyEl.querySelector('.color-modal-apply');
    expect(cancelBtn).toBeTruthy();
    expect(applyBtn).toBeTruthy();

    cancelBtn.click();
    expect(closed).toBe(1);
    expect(applied).toBe(null);

    applyBtn.click();
    expect(closed).toBe(2);
    // Apply uses the hex input; seed was #123456 so it should round-trip.
    expect(applied).toBe('#123456');
  });
});
