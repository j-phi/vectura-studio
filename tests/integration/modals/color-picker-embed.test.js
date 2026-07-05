/*
 * COL-1 prerequisite (Illustrator Tools Parity, Phase 1 Lane D) — embeddable
 * HSV+hex picker extracted from the Color Picker modal.
 *
 * The Pen Picker popover's New Pen tab must reuse openColorModal's HSV canvas
 * + hue strip + hex field machinery (SPEC: "reuse openColorModal, don't
 * rebuild"). openColorModal is a centered modal, so the machinery is
 * extracted into Vectura.UI.Modals.ColorPicker.createHsvHexPicker(rootEl,
 * { value, onChange }) which mounts the same scaffold (same class names, so
 * the existing skin CSS applies) into any host element and returns
 * { getHex, setHex }.
 *
 * The existing modal contract is covered by color-picker.test.js and must
 * stay green through the refactor.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Embeddable HSV+hex picker (ColorPicker.createHsvHexPicker)', () => {
  let runtime, window, document;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const mount = (opts = {}) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const picker = window.Vectura.UI.Modals.ColorPicker.createHsvHexPicker(host, opts);
    return { host, picker };
  };

  test('is exposed on Vectura.UI.Modals.ColorPicker', () => {
    expect(typeof window.Vectura.UI.Modals.ColorPicker.createHsvHexPicker).toBe('function');
  });

  test('mounts the picker scaffold (same class names as the modal) into an arbitrary host', () => {
    const { host } = mount({ value: '#aabbcc' });
    expect(host.querySelector('.color-sv-canvas')).toBeTruthy();
    expect(host.querySelector('.color-sv-cursor')).toBeTruthy();
    expect(host.querySelector('.color-hue-canvas')).toBeTruthy();
    expect(host.querySelector('.color-hue-cursor')).toBeTruthy();
    expect(host.querySelector('.color-modal-hex')).toBeTruthy();
    expect(host.querySelector('.color-preview-swatch')).toBeTruthy();
    host.remove();
  });

  test('getHex returns the seed value; invalid seeds fall back to #ff0000', () => {
    const { host, picker } = mount({ value: '#AbCdEf' });
    expect(picker.getHex()).toBe('#abcdef');
    host.remove();
    const fallback = mount({ value: 'nonsense' });
    expect(fallback.picker.getHex()).toBe('#ff0000');
    fallback.host.remove();
  });

  test('typing 6 hex chars updates getHex and fires onChange', () => {
    const seen = [];
    const { host, picker } = mount({ value: '#000000', onChange: (hex) => seen.push(hex) });
    const hexInput = host.querySelector('.color-modal-hex');
    hexInput.value = 'ff8800';
    hexInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(picker.getHex()).toBe('#ff8800');
    expect(seen).toContain('#ff8800');
    host.remove();
  });

  test('layout() re-measures the host and resizes the canvas backing stores; a hidden (0-width) host is a no-op', () => {
    const { host, picker } = mount({ value: '#12ab34' });
    expect(typeof picker.layout).toBe('function');
    const sv = host.querySelector('.color-sv-canvas');
    const hue = host.querySelector('.color-hue-canvas');
    // jsdom has no layout, so offsets read 0 — exactly what a display:none
    // host (the Pen Picker's hidden New Pen tab) measures. layout() must not
    // adopt 0×0 backing stores.
    expect(picker.layout()).toBe(false);
    // Host becomes visible → offsets are real; layout() must adopt them.
    [[sv, 232, 174], [hue, 232, 12]].forEach(([canvas, w, h]) => {
      Object.defineProperty(canvas, 'offsetWidth', { value: w, configurable: true });
      Object.defineProperty(canvas, 'offsetHeight', { value: h, configurable: true });
    });
    expect(picker.layout()).toBe(true);
    expect(sv.width).toBe(232);
    expect(sv.height).toBe(174);
    expect(hue.width).toBe(232);
    expect(hue.height).toBe(12);
    host.remove();
  });

  test('setHex programmatically updates the input and getHex without firing onChange', () => {
    const seen = [];
    const { host, picker } = mount({ value: '#000000', onChange: (hex) => seen.push(hex) });
    picker.setHex('#12ab34');
    expect(picker.getHex()).toBe('#12ab34');
    expect(host.querySelector('.color-modal-hex').value.toLowerCase()).toBe('12ab34');
    expect(seen).toEqual([]);
    host.remove();
  });
});
