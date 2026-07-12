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

  test('triggerDialWave origin is whatever cx/cy is passed, not forced to any fixed point', () => {
    const { motion } = runtime.window.Vectura.UI;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = runtime.document.createElementNS(NS, 'svg');
    runtime.document.body.appendChild(svg);
    // 33,19 is a handle position near the edge of a 19,19-centered dial, not the center.
    motion.triggerDialWave(svg, 33, 19);
    const ring = svg.querySelector('.dial-wave-ring');
    expect(ring.getAttribute('cx')).toBe('33');
    expect(ring.getAttribute('cy')).toBe('19');
  });

  test('an off-center origin with clipCx/clipCy/clipR gets clipped to that circle, not the wave origin', async () => {
    const { motion } = runtime.window.Vectura.UI;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = runtime.document.createElementNS(NS, 'svg');
    runtime.document.body.appendChild(svg);
    runtime.document.documentElement.style.setProperty('--motion-dial-wave-dur', '40');
    // Wave starts at the handle position (33,19, near the dial edge) but must be
    // clipped to the dial's own outer ring (center 19,19, r 16) — not a circle
    // centered on the wave's own off-center origin, which would be wrong.
    motion.triggerDialWave(svg, 33, 19, { clipCx: 19, clipCy: 19, clipR: 16 });
    const ring = svg.querySelector('.dial-wave-ring');
    const clipAttr = ring.getAttribute('clip-path');
    expect(clipAttr).toMatch(/^url\(#.+\)$/);
    const clipId = clipAttr.slice(5, -1);
    const clipPath = svg.querySelector(`clipPath#${clipId}`);
    expect(clipPath).toBeTruthy();
    const clipCircle = clipPath.querySelector('circle');
    expect(clipCircle.getAttribute('cx')).toBe('19');
    expect(clipCircle.getAttribute('cy')).toBe('19');
    expect(clipCircle.getAttribute('r')).toBe('16');
    // The clipPath is cleanup'd alongside the ring once the animation ends.
    await new Promise((r) => setTimeout(r, 120));
    expect(svg.querySelector(`clipPath#${clipId}`)).toBeFalsy();
  });

  test('omitting clip opts keeps the old unclipped behavior (no clip-path attribute, no <defs> added)', () => {
    const { motion } = runtime.window.Vectura.UI;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = runtime.document.createElementNS(NS, 'svg');
    runtime.document.body.appendChild(svg);
    motion.triggerDialWave(svg, 19, 19);
    const ring = svg.querySelector('.dial-wave-ring');
    expect(ring.hasAttribute('clip-path')).toBe(false);
    expect(svg.querySelector('defs')).toBeFalsy();
  });

  test('cancel() before the animation completes also removes the clipPath', () => {
    const { motion } = runtime.window.Vectura.UI;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = runtime.document.createElementNS(NS, 'svg');
    runtime.document.body.appendChild(svg);
    const handle = motion.triggerDialWave(svg, 33, 19, { clipCx: 19, clipCy: 19, clipR: 16 });
    expect(svg.querySelector('clipPath')).toBeTruthy();
    handle.cancel();
    expect(svg.querySelector('.dial-wave-ring')).toBeFalsy();
    expect(svg.querySelector('clipPath')).toBeFalsy();
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
