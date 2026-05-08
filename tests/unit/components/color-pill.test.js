const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.ColorPill', () => {
  let runtime;
  let ColorPill;

  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'color-pill']);
    ColorPill = runtime.window.Vectura.UI.ColorPill;
  });
  afterEach(() => runtime.cleanup());

  test('renders a button with swatch + uppercase hex label', () => {
    const inst = ColorPill(runtime.document.body, { value: '#aabbcc' });
    expect(inst.el.tagName).toBe('BUTTON');
    expect(inst.el.classList.contains('color-pill')).toBe(true);
    expect(inst.el.querySelector('.color-pill-swatch')).toBeTruthy();
    expect(inst.el.querySelector('.color-pill-label').textContent).toBe('#AABBCC');
    inst.destroy();
  });

  test('normalizes 3-digit hex to 6-digit on render', () => {
    const inst = ColorPill(runtime.document.body, { value: '#0fa' });
    expect(inst.getValue()).toBe('#00ffaa');
    inst.destroy();
  });

  test('click invokes onOpen with current value and the anchor element', () => {
    const events = [];
    const inst = ColorPill(runtime.document.body, { value: '#123456', onOpen: (v, el) => events.push({ v, el }) });
    inst.el.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(events.length).toBe(1);
    expect(events[0].v).toBe('#123456');
    expect(events[0].el).toBe(inst.el);
    inst.destroy();
  });

  test('Enter and Space trigger onOpen', () => {
    const events = [];
    const inst = ColorPill(runtime.document.body, { value: '#000000', onOpen: () => events.push(1) });
    inst.el.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    inst.el.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(events.length).toBe(2);
    inst.destroy();
  });

  test('disabled suppresses onOpen', () => {
    const events = [];
    const inst = ColorPill(runtime.document.body, { value: '#000', disabled: true, onOpen: () => events.push(1) });
    inst.el.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(events.length).toBe(0);
    inst.destroy();
  });

  test('luma-aware class for dark colors', () => {
    const dark = ColorPill(runtime.document.body, { value: '#101010' });
    expect(dark.el.classList.contains('color-pill-on-dark')).toBe(true);
    dark.destroy();
    const light = ColorPill(runtime.document.body, { value: '#fafafa' });
    expect(light.el.classList.contains('color-pill-on-dark')).toBe(false);
    light.destroy();
  });

  test('update() refreshes value, ignores invalid hex', () => {
    const inst = ColorPill(runtime.document.body, { value: '#aaaaaa' });
    inst.update({ value: '#bbbbbb' });
    expect(inst.getValue()).toBe('#bbbbbb');
    inst.update({ value: 'not a color' });
    expect(inst.getValue()).toBe('#bbbbbb');
    inst.destroy();
  });

  test('destroy() detaches and removes', () => {
    const inst = ColorPill(runtime.document.body, { value: '#000' });
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
  });
});
