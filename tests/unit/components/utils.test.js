const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('window.Vectura.UI.utils', () => {
  let runtime;
  beforeAll(() => {
    runtime = loadUIComponent(['utils']);
  });
  afterAll(() => runtime.cleanup());

  test('exposes the helper API', () => {
    const { utils } = runtime.window.Vectura.UI;
    expect(utils).toBeTruthy();
    ['clamp', 'formatNumber', 'tabularNum', 'cssVarPx', 'prefersReducedMotion', 'uid', 'on', 'off']
      .forEach((name) => expect(typeof utils[name]).toBe('function'));
  });

  test('clamp respects min/max bounds and rejects non-finite values', () => {
    const { clamp } = runtime.window.Vectura.UI.utils;
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
    expect(clamp(NaN, 1, 5)).toBe(1);
    expect(clamp(Infinity, 1, 5)).toBe(5);
    expect(clamp('nope', 1, 5)).toBe(1);
  });

  test('formatNumber trims trailing zeros', () => {
    const { formatNumber } = runtime.window.Vectura.UI.utils;
    expect(formatNumber(12.5, 2)).toBe('12.5');
    expect(formatNumber(12, 2)).toBe('12');
    expect(formatNumber(12.345, 2)).toBe('12.35');
    expect(formatNumber(0.1 + 0.2, 4)).toBe('0.3');
    expect(formatNumber(7, 0)).toBe('7');
    expect(formatNumber(NaN)).toBe('');
  });

  test('cssVarPx reads pixel-valued CSS variables off documentElement', () => {
    const { cssVarPx } = runtime.window.Vectura.UI.utils;
    runtime.document.documentElement.style.setProperty('--probe-row', '42px');
    expect(cssVarPx('--probe-row', 0)).toBe(42);
    expect(cssVarPx('--definitely-unset-' + Date.now(), 12)).toBe(12);
  });

  test('on returns an unsubscribe function', () => {
    const { on } = runtime.window.Vectura.UI.utils;
    const target = runtime.document.createElement('button');
    let count = 0;
    const off = on(target, 'click', () => { count += 1; });
    target.dispatchEvent(new runtime.window.Event('click'));
    expect(count).toBe(1);
    off();
    target.dispatchEvent(new runtime.window.Event('click'));
    expect(count).toBe(1);
  });

  test('uid generates unique strings with the given prefix', () => {
    const { uid } = runtime.window.Vectura.UI.utils;
    const a = uid('btn');
    const b = uid('btn');
    expect(a).not.toBe(b);
    expect(a.startsWith('btn-')).toBe(true);
  });
});
