/*
 * TUX-032 KeyboardInset: pure formula + the CSS var / class / event contract.
 * These are unit checks. The outcome proof is tests/e2e/touch/keyboard-inset.spec.js.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadUIComponent } = require('../helpers/load-ui-component');

const ROOT = path.resolve(__dirname, '../..');

describe('KeyboardInset.computeInset', () => {
  let runtime, compute;
  beforeAll(() => {
    runtime = loadUIComponent(['keyboard-inset']);
    compute = runtime.window.Vectura.KeyboardInset.computeInset;
  });
  afterAll(() => runtime.cleanup());

  const cases = [
    ['iPad landscape keyboard', { innerHeight: 834, vvHeight: 434, offsetTop: 0, scale: 1, editableFocused: true }, 400],
    ['iPhone landscape keyboard', { innerHeight: 402, vvHeight: 192, offsetTop: 0, scale: 1, editableFocused: true }, 210],
    ['offsetTop is not lifted twice', { innerHeight: 874, vvHeight: 524, offsetTop: 175, scale: 1, editableFocused: true }, 175],
    ['toolbar collapse, no editable focused', { innerHeight: 834, vvHeight: 764, offsetTop: 0, scale: 1, editableFocused: false }, 0],
    ['pinch-zoomed', { innerHeight: 834, vvHeight: 417, offsetTop: 0, scale: 2, editableFocused: true }, 0],
    ['negative (visual taller than layout)', { innerHeight: 800, vvHeight: 900, offsetTop: 0, scale: 1, editableFocused: true }, 0],
  ];
  test.each(cases)('%s', (_n, input, expected) => {
    expect(compute(input)).toBe(expected);
  });
});

describe('KeyboardInset events', () => {
  let runtime;
  afterEach(() => runtime && runtime.cleanup());

  test('publishes --kb-inset, html.kb-open and vectura:kbinset only while an editable has focus', () => {
    runtime = loadUIComponent([]);
    const { window: w, document: d, context } = runtime;
    const fake = new w.EventTarget();
    Object.assign(fake, { height: w.innerHeight, offsetTop: 0, scale: 1 });
    Object.defineProperty(w, 'visualViewport', { configurable: true, value: fake });
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/ui/keyboard-inset.js'), 'utf8'), context);
    const input = d.createElement('input'); input.type = 'text'; d.body.appendChild(input);
    const seen = [];
    d.addEventListener('vectura:kbinset', (e) => seen.push(e.detail.inset));
    fake.height = w.innerHeight - 300;
    fake.dispatchEvent(new w.Event('resize'));
    expect(w.Vectura.KeyboardInset.inset).toBe(0);                 // nothing focused
    input.focus();
    expect(w.Vectura.KeyboardInset.inset).toBe(300);
    expect(d.documentElement.style.getPropertyValue('--kb-inset')).toBe('300px');
    expect(d.documentElement.classList.contains('kb-open')).toBe(true);
    expect(seen).toEqual([300]);
  });
});
