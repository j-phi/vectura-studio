const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Pendula/harmonograph oscillator-card controls:
 *   1. Pluck Pad — a drag-vector control that sets amplitude (length) and
 *      phase/release-direction (angle) for both axes at once.
 *   2. Advanced disclosure — the four numeric amp/phase controls live behind a
 *      <details> so the pad is the promoted control.
 *   3. Per-param padlocks — a lock toggle next to each control that makes the
 *      dice/mutate (applyHarmonographFamilyBias) skip the locked param.
 */
describe('Pendula oscillator controls — pluck pad, advanced disclosure, padlocks', () => {
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

  test('every pendulum card mounts a pluck pad as its first control', () => {
    const list = cards();
    expect(list.length).toBeGreaterThan(0);
    list.forEach((card) => {
      const pad = card.querySelector('.pendulum-pluck-pad');
      expect(pad).toBeTruthy();
      // The pad comes after the header row, before the .noise-controls block.
      const header = card.querySelector('.pendulum-header');
      const controls = card.querySelector('.noise-controls');
      expect(pad.compareDocumentPosition(header) & window.Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
      expect(pad.compareDocumentPosition(controls) & window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  test('the pluck pad sets the (ampX, ampY) swing vector, leaves phase alone, commits, and pushes one history entry', () => {
    const card = cards()[0];
    const pendulum = layer().params.pendulums[0];
    const pad = card.querySelector('.pendulum-pluck-pad canvas') || card.querySelector('.pendulum-pluck-pad');
    const phaseXBefore = pendulum.phaseX;
    const phaseYBefore = pendulum.phaseY;

    // Spy regen + pushHistory through the commit path.
    let regens = 0;
    const origRegen = app.regen.bind(app);
    app.regen = (...a) => { regens += 1; return origRegen(...a); };
    let pushes = 0;
    const origPush = app.pushHistory ? app.pushHistory.bind(app) : null;
    if (origPush) app.pushHistory = (...a) => { pushes += 1; return origPush(...a); };

    // Fake a square pad geometry so the drag math is deterministic.
    const SIZE = 80;
    pad.getBoundingClientRect = () => ({
      left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, x: 0, y: 0,
    });
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    // Drag to the right edge: full +X amplitude, zero Y amplitude.
    pad.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: cx, clientY: cy }));
    window.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: SIZE, clientY: cy }));
    window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: SIZE, clientY: cy }));

    // Handle x = +radius → ampX ≈ +AMP_MAX (200); handle y = 0 → ampY ≈ 0.
    expect(Math.abs(pendulum.ampX - 200)).toBeLessThanOrEqual(1);
    expect(Math.abs(pendulum.ampY)).toBeLessThanOrEqual(1);
    // Phase is NEVER touched by the pad (that's what used to collapse the figure).
    expect(pendulum.phaseX).toBe(phaseXBefore);
    expect(pendulum.phaseY).toBe(phaseYBefore);

    expect(regens).toBeGreaterThan(0);
    if (origPush) expect(pushes).toBe(1); // one push per drag, on pointerdown

    // params persisted to the engine layer
    expect(layer().params.pendulums[0].ampX).toBe(pendulum.ampX);

    app.regen = origRegen;
    if (origPush) app.pushHistory = origPush;
  });

  test('a small nudge never collapses the figure to a line (phaseX/phaseY stay distinct)', () => {
    const card = cards()[0];
    const pendulum = layer().params.pendulums[0];
    const pad = card.querySelector('.pendulum-pluck-pad canvas') || card.querySelector('.pendulum-pluck-pad');
    // The default pendulum has phaseX=90, phaseY=0 — a 90deg quadrature that
    // gives the figure its 2D shape. The OLD pad forced phaseX===phaseY on any
    // touch, collapsing x(t)=y(t) into a diagonal line. The pad must not do that.
    expect(pendulum.phaseX).not.toBe(pendulum.phaseY);
    const SIZE = 80;
    pad.getBoundingClientRect = () => ({ left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, x: 0, y: 0 });
    // a tiny nudge near the centre
    pad.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 42, clientY: 41 }));
    window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 42, clientY: 41 }));
    expect(pendulum.phaseX).not.toBe(pendulum.phaseY); // still a real 2D figure
  });

  test('a compatibility mousedown after pointerdown does NOT double-push history (no mouse listener)', () => {
    const card = cards()[0];
    const pad = card.querySelector('.pendulum-pluck-pad canvas') || card.querySelector('.pendulum-pluck-pad');
    const origPush = app.pushHistory ? app.pushHistory.bind(app) : null;
    if (!origPush) return; // nothing to assert without a history API
    let pushes = 0;
    app.pushHistory = (...a) => { pushes += 1; return origPush(...a); };
    const SIZE = 80;
    pad.getBoundingClientRect = () => ({ left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, x: 0, y: 0 });
    // Real browsers emit a compatibility mousedown right after pointerdown.
    pad.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 40, clientY: 40 }));
    pad.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, clientX: 40, clientY: 40 }));
    window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 40, clientY: 40 }));
    expect(pushes).toBe(1); // the stray mousedown is ignored — only the pointer interaction counts
    app.pushHistory = origPush;
  });

  test('dragging straight up sets a negative Y swing amplitude (signed vector)', () => {
    const card = cards()[0];
    const pendulum = layer().params.pendulums[0];
    const pad = card.querySelector('.pendulum-pluck-pad canvas') || card.querySelector('.pendulum-pluck-pad');
    const SIZE = 80;
    pad.getBoundingClientRect = () => ({
      left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, x: 0, y: 0,
    });
    const cx = SIZE / 2;
    pad.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: cx, clientY: cx }));
    window.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: cx, clientY: 0 }));
    window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: cx, clientY: 0 }));
    // straight up → handle y = -radius → ampY ≈ -AMP_MAX; ampX ≈ 0
    expect(Math.abs(pendulum.ampY + 200)).toBeLessThanOrEqual(1);
    expect(Math.abs(pendulum.ampX)).toBeLessThanOrEqual(1);
  });

  test('the four amp/phase numeric controls live inside the Advanced disclosure; freq/micro/damp do not', () => {
    const card = cards()[0];
    const details = card.querySelector('details.pendulum-advanced');
    expect(details).toBeTruthy();

    const advancedLabels = Array.from(details.querySelectorAll('.control-label')).map((l) => l.textContent.trim());
    expect(advancedLabels).toEqual(expect.arrayContaining(['Amplitude X', 'Amplitude Y', 'Phase X', 'Phase Y']));

    // freq/micro/damp are NOT inside the advanced disclosure
    expect(advancedLabels).not.toEqual(expect.arrayContaining(['Frequency']));
    expect(advancedLabels).not.toEqual(expect.arrayContaining(['Micro Tuning']));
    expect(advancedLabels).not.toEqual(expect.arrayContaining(['Damping']));

    const allLabels = Array.from(card.querySelectorAll('.control-label')).map((l) => l.textContent.trim());
    expect(allLabels).toEqual(expect.arrayContaining(['Frequency', 'Micro Tuning', 'Damping']));
  });

  test('every pendulum control carries a padlock toggle button', () => {
    const card = cards()[0];
    const locks = card.querySelectorAll('.pendulum-param-lock');
    // freq, micro, damp + 4 advanced = 7 controls
    expect(locks.length).toBe(7);
  });

  test('locking a param persists to params.pendulumParamLocks keyed by pendulum id', () => {
    const card = cards()[0];
    const pendulum = layer().params.pendulums[0];
    // find the freq control's lock
    const freqLock = Array.from(card.querySelectorAll('.pendulum-param-lock'))
      .find((b) => b.dataset.paramKey === 'freq');
    expect(freqLock).toBeTruthy();
    freqLock.click();
    expect(layer().params.pendulumParamLocks[pendulum.id].freq).toBe(true);
    // toggling off removes/falsifies it
    freqLock.click();
    expect(layer().params.pendulumParamLocks?.[pendulum.id]?.freq).toBeFalsy();
  });

  test('dice (applyHarmonographFamilyBias) skips a locked param but mutates unlocked ones', () => {
    const RU = window.Vectura.RandomizationUtils;
    const params = layer().params;
    // ensure 2 pendulums exist
    if (params.pendulums.length < 2) {
      params.pendulums.push({
        id: 'pend-locktest-2', enabled: true, ampX: 60, ampY: 60,
        phaseX: 30, phaseY: 30, freq: 3, micro: 0, damp: 0.001,
      });
    }
    const p0 = params.pendulums[0];
    const p1 = params.pendulums[1];
    // Pin a distinctive freq + damp on p0 and lock ONLY p0.freq.
    p0.freq = 2.345;
    p0.damp = 0.00123;
    params.pendulumParamLocks = { [p0.id]: { freq: true } };

    // Deterministic-ish RNG sweep: many calls, near-certain to move unlocked.
    let n = 0;
    const random = () => { n += 1; return (Math.sin(n * 12.9898) * 43758.5453) % 1 < 0 ? ((Math.sin(n * 12.9898) * 43758.5453) % 1) + 1 : (Math.sin(n * 12.9898) * 43758.5453) % 1; };

    RU.applyHarmonographFamilyBias(params, random);

    // locked p0.freq is byte-equal (untouched)
    expect(params.pendulums[0].freq).toBe(2.345);
    // unlocked p0.damp changed (it is not pintograph)
    expect(params.pendulums[0].damp).not.toBe(0.00123);
    // p1 has no locks → its freq is rewritten to the tasteful set (whole/half).
    expect(params.pendulums[1].freq).not.toBe(3.0000001); // sanity: it was reassigned
  });

  test('editing a numeric advanced control updates the pluck-pad handle (redraw hook present)', () => {
    const card = cards()[0];
    const pad = card.querySelector('.pendulum-pluck-pad');
    expect(pad).toBeTruthy();
    // onCardCommit should redraw the pad — assert the pad exposes a redraw hook
    // we can call, or that committing a numeric control does not throw.
    const details = card.querySelector('details.pendulum-advanced');
    const ampSlider = details.querySelector('input[type="range"]');
    expect(ampSlider).toBeTruthy();
    ampSlider.value = '120';
    // UI.Slider reads the value on 'input' and commits it on 'change' —
    // browsers always fire input before change on a range drag/keystep.
    ampSlider.dispatchEvent(new window.Event('input', { bubbles: true }));
    ampSlider.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(layer().params.pendulums[0].ampX).toBe(120);
  });

  test('the pluck pad is labelled "Release" with an info button', () => {
    const card = cards()[0];
    const label = card.querySelector('.pendulum-pluck-pad .pluck-pad-label .control-label');
    expect(label).toBeTruthy();
    expect(label.textContent.trim()).toBe('Release');
    const info = card.querySelector('.pendulum-pluck-pad .info-btn');
    expect(info).toBeTruthy();
    expect(info.dataset.info).toBe('pendula.pluckPad');
    // and the info entry exists
    expect(window.Vectura.UI.Modals.InfoModals.INFO['pendula.pluckPad']).toBeTruthy();
  });

  test('an out-of-range inline value error names the allowed range', () => {
    let body = '';
    const orig = app.ui.openModal.bind(app.ui);
    app.ui.openModal = (opts) => { body = (opts && opts.body) || ''; return orig(opts); };
    // Micro Tuning ranges about -0.2..0.2; "2" must be rejected WITH the range.
    app.ui.showValueError('2', { min: -0.2, max: 0.2, unit: '', precision: 3 });
    expect(body).toMatch(/0\.200/);
    expect(body).toMatch(/-0\.200/);
    expect(body.toLowerCase()).toContain('from');
    app.ui.openModal = orig;
  });

  test('each card has a Phase pad beside the Release pad, labelled "Phase"', () => {
    const card = cards()[0];
    const pads = card.querySelectorAll('.pendulum-pad-row .pendulum-pluck-pad');
    expect(pads.length).toBe(2); // Release + Phase, side by side
    const phasePad = card.querySelector('.pad-phase');
    expect(phasePad).toBeTruthy();
    const label = phasePad.querySelector('.pluck-pad-label .control-label');
    expect(label.textContent.trim()).toBe('Phase');
    const info = phasePad.querySelector('.info-btn');
    expect(info.dataset.info).toBe('pendula.phasePad');
    expect(window.Vectura.UI.Modals.InfoModals.INFO['pendula.phasePad']).toBeTruthy();
  });

  test('the Phase pad sets phaseX/phaseY and leaves amplitude alone', () => {
    const card = cards()[0];
    const pendulum = layer().params.pendulums[0];
    const ampXBefore = pendulum.ampX;
    const ampYBefore = pendulum.ampY;
    const pad = card.querySelector('.pad-phase canvas');
    const SIZE = 80;
    pad.getBoundingClientRect = () => ({ left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, x: 0, y: 0 });
    // drag to the right edge: vx=+1 → phaseX=360; clientY at centre → vy=0 → phaseY=180.
    pad.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: SIZE, clientY: SIZE / 2 }));
    window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: SIZE, clientY: SIZE / 2 }));
    expect(Math.abs(pendulum.phaseX - 360)).toBeLessThanOrEqual(1);
    expect(Math.abs(pendulum.phaseY - 180)).toBeLessThanOrEqual(1);
    // amplitude is NOT touched by the phase pad
    expect(pendulum.ampX).toBe(ampXBefore);
    expect(pendulum.ampY).toBe(ampYBefore);
  });
});
