const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('window.Vectura.UI.motion', () => {
  let runtime;
  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'motion']);
  });
  afterEach(() => runtime.cleanup());

  test('exposes the trigger API', () => {
    const { motion } = runtime.window.Vectura.UI;
    expect(motion).toBeTruthy();
    ['triggerBtnPulse', 'triggerSliderPulse', 'triggerThumbRelease', 'triggerDialWave', 'rafLoop']
      .forEach((name) => expect(typeof motion[name]).toBe('function'));
  });

  test('triggerBtnPulse adds .btn-pulse and removes it on animationend', () => {
    const { motion } = runtime.window.Vectura.UI;
    const btn = runtime.document.createElement('button');
    runtime.document.body.appendChild(btn);
    motion.triggerBtnPulse(btn);
    expect(btn.classList.contains('btn-pulse')).toBe(true);
    btn.dispatchEvent(new runtime.window.Event('animationend', { bubbles: false }));
    expect(btn.classList.contains('btn-pulse')).toBe(false);
  });

  test('triggerSliderPulse adds .fx-active and removes it on animationend', () => {
    const { motion } = runtime.window.Vectura.UI;
    const wrap = runtime.document.createElement('div');
    wrap.className = 'sld-fx-wrap';
    runtime.document.body.appendChild(wrap);
    motion.triggerSliderPulse(wrap);
    expect(wrap.classList.contains('fx-active')).toBe(true);
    wrap.dispatchEvent(new runtime.window.Event('animationend'));
    expect(wrap.classList.contains('fx-active')).toBe(false);
  });

  test('triggerDialWave appends and removes a .dial-wave-ring inside the svg', async () => {
    const { motion } = runtime.window.Vectura.UI;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = runtime.document.createElementNS(NS, 'svg');
    runtime.document.body.appendChild(svg);
    runtime.document.documentElement.style.setProperty('--motion-dial-wave-dur', '40');
    runtime.document.documentElement.style.setProperty('--motion-dial-wave-max-r', '8');
    motion.triggerDialWave(svg, 19, 19);
    expect(svg.querySelector('.dial-wave-ring')).toBeTruthy();
    // Wait long enough for the rAF-driven animation to finish (~40ms + setTimeout shim 16ms).
    await new Promise((r) => setTimeout(r, 120));
    expect(svg.querySelector('.dial-wave-ring')).toBeFalsy();
  });

  test('triggerDialWave is a no-op when prefers-reduced-motion is true', () => {
    runtime.window.matchMedia = () => ({
      matches: true,
      addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {},
      dispatchEvent() { return false; },
    });
    const NS = 'http://www.w3.org/2000/svg';
    const svg = runtime.document.createElementNS(NS, 'svg');
    runtime.document.body.appendChild(svg);
    const handle = runtime.window.Vectura.UI.motion.triggerDialWave(svg, 0, 0);
    expect(typeof handle.cancel).toBe('function');
    expect(svg.querySelector('.dial-wave-ring')).toBeFalsy();
  });

  test('rafLoop fires `tick` and resolves at completion', async () => {
    const { motion } = runtime.window.Vectura.UI;
    let lastT = 0;
    motion.rafLoop(40, (t) => { lastT = t; });
    await new Promise((r) => setTimeout(r, 120));
    expect(lastT).toBe(1);
  });
});
