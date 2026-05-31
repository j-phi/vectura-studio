const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Phase-3 polish for the pendula/harmonograph pendulum cards:
 *   - a per-pendulum mini-trace thumbnail (.pendulum-mini-trace)
 *   - a frequency-ratio readout derived from the enabled pendulums (.pendulum-freq-ratio)
 * Both must recompute when a pendulum's params commit (no rAF loop).
 */
describe('Pendula oscillator cards — mini-trace + frequency ratio', () => {
  let runtime, window, document, app;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    app.engine.addLayer('pendula');
    app.ui.renderLayers();
    app.ui.buildControls();
  });
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  const layer = () => app.engine.getActiveLayer();
  const cards = () => Array.from(document.querySelectorAll('.pendulum-card'));
  const ratioEl = () => document.querySelector('.pendulum-freq-ratio');

  // Find the Frequency range slider inside a given pendulum card by matching the
  // control whose label reads "Frequency".
  const freqSliderInCard = (card) => {
    const ctrl = Array.from(card.querySelectorAll('.pendulum-control')).find((c) => {
      const label = c.querySelector('.control-label');
      return label && /frequency/i.test(label.textContent);
    });
    return ctrl ? ctrl.querySelector('input[type="range"]') : null;
  };

  test('one .pendulum-mini-trace canvas per pendulum card', () => {
    const cardEls = cards();
    expect(cardEls.length).toBeGreaterThan(0);
    const traces = document.querySelectorAll('.pendulum-mini-trace');
    expect(traces.length).toBe(cardEls.length);
    cardEls.forEach((card) => {
      const c = card.querySelector('.pendulum-mini-trace');
      expect(c).toBeTruthy();
      expect(c.tagName.toLowerCase()).toBe('canvas');
    });
  });

  test('a .pendulum-freq-ratio element reflects the enabled pendulums freqs', () => {
    // Force a known, reduced-able pair: freqs 2 and 3 -> "3:2" or "2:3".
    const pends = layer().params.pendulums;
    expect(pends.length).toBeGreaterThanOrEqual(2);
    pends.forEach((p, i) => { p.enabled = i < 2; });
    pends[0].freq = 2;
    pends[1].freq = 3;
    app.ui.buildControls();

    const el = ratioEl();
    expect(el).toBeTruthy();
    expect(['3:2', '2:3']).toContain(el.textContent.trim());
  });

  test('editing a pendulum freq through its slider updates the freq-ratio readout', () => {
    const pends = layer().params.pendulums;
    pends.forEach((p, i) => { p.enabled = i < 2; });
    pends[0].freq = 2;
    pends[1].freq = 2;
    app.ui.buildControls();

    // 2 and 2 reduce to 1:1.
    expect(ratioEl().textContent.trim()).toBe('1:1');

    // Change pendulum 1's frequency to 4 via its rendered slider, then commit.
    const slider = freqSliderInCard(cards()[1]);
    expect(slider).toBeTruthy();
    slider.value = '4';
    slider.dispatchEvent(new window.Event('change', { bubbles: true }));

    // Param committed...
    expect(layer().params.pendulums[1].freq).toBeCloseTo(4, 5);
    // ...and the readout recomputed: 2 & 4 -> 2:1 (or 1:2).
    expect(['2:1', '1:2']).toContain(ratioEl().textContent.trim());
  });
});
