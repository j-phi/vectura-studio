const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.ImageInput', () => {
  let runtime;
  let ImageInput;

  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'image-input']);
    ImageInput = runtime.window.Vectura.UI.ImageInput;
  });
  afterEach(() => runtime.cleanup());

  test('renders trigger + clear + hidden file input', () => {
    const inst = ImageInput(runtime.document.body, { onChange: () => {} });
    expect(inst.el.querySelector('.image-input-trigger')).toBeTruthy();
    expect(inst.el.querySelector('.image-input-clear')).toBeTruthy();
    expect(inst.el.querySelector('input[type="file"]')).toBeTruthy();
    expect(inst.el.querySelector('.image-input-clear').style.display).toBe('none');
    inst.destroy();
  });

  test('preset value renders filename and shows clear button', () => {
    const inst = ImageInput(runtime.document.body, {
      value: { name: 'photo.png', dataUrl: 'data:image/png;base64,abc' },
      onChange: () => {},
    });
    expect(inst.el.querySelector('.image-input-label').textContent).toBe('photo.png');
    expect(inst.el.querySelector('.image-input-clear').style.display).toBe('');
    inst.destroy();
  });

  test('clear button resets value and fires onChange(null)', () => {
    const log = [];
    const inst = ImageInput(runtime.document.body, {
      value: { name: 'a.png', dataUrl: '' },
      onChange: (v) => log.push(v),
    });
    inst.el.querySelector('.image-input-clear').dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(log).toEqual([null]);
    expect(inst.getValue()).toBeNull();
    inst.destroy();
  });

  test('setValue updates the rendered label without firing onChange', () => {
    const log = [];
    const inst = ImageInput(runtime.document.body, { onChange: (v) => log.push(v) });
    inst.setValue({ name: 'b.jpg', dataUrl: '' });
    expect(inst.el.querySelector('.image-input-label').textContent).toBe('b.jpg');
    expect(log).toEqual([]);
    inst.destroy();
  });

  test('destroy() detaches and removes', () => {
    const inst = ImageInput(runtime.document.body, { onChange: () => {} });
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
  });
});
