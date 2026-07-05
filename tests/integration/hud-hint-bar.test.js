/**
 * HUD-1…4 — Hint bar & HUD (Illustrator Tools Parity, Phase 1 Lane F).
 *
 * Covers:
 *  - HUD-1: per-tool contextual hint line (config-driven, bolded keyword
 *    segments, `|` separators); clears during a canvas drag, restores on
 *    release; switches with renderer.setTool (mode-aware for pen/scissor).
 *  - HUD-2: active tool display name + live zoom % + rotation readouts.
 *  - HUD-3: `UI.toast(message)` transient pill — one at a time, queue-drop
 *    oldest, auto-dismiss after Vectura.HINTS.toast.durationMs; consumed by
 *    the `vectura:shape-expanded` CustomEvent (Lane C / PTH-5).
 *  - HUD-4: `SETTINGS.contextualHints` gates the hint text only (readouts
 *    always show); Document Setup "Contextual hints" checkbox wires it.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

// The hint bar updates on a requestAnimationFrame ticker (stubbed to a 16 ms
// setTimeout by the runtime loader) — waiting ~3 frames is enough for a diff
// to land in the DOM.
const nextFrames = (ms = 60) => new Promise((r) => setTimeout(r, ms));

describe('HUD hint bar & readouts (Lane F)', () => {
  let runtime, window, document, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    await Promise.resolve();
    await nextFrames();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const hintsEl = () => document.getElementById('status-bar');
  const barEl = () => document.getElementById('hud-bar');
  const toolEl = () => document.getElementById('hud-tool');
  const zoomEl = () => document.getElementById('hud-zoom');
  const rotationEl = () => document.getElementById('hud-rotation');
  const toastEl = () => document.getElementById('canvas-toast');
  const canvas = () => document.getElementById('main-canvas');

  const pointer = (type, target, x, y) => {
    const ev = new window.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
    });
    target.dispatchEvent(ev);
  };

  describe('HUD-1 — per-tool contextual hints', () => {
    test('hint copy lives in config (src/config/hints.js), one entry per tool', () => {
      const HINTS = window.Vectura.HINTS;
      expect(HINTS).toBeTruthy();
      expect(HINTS.tools).toBeTruthy();
      // Spec-mandated initial copy set.
      expect(HINTS.tools.select.hint[0]).toEqual({ key: 'Click', text: 'the object to select' });
      expect(HINTS.tools.select.hint[1].key).toBe('Shift+Click');
      expect(HINTS.tools.select.hint[2].key).toBe('Option+Drag');
      expect(HINTS.tools.direct.hint[0].key).toBe('Select');
      expect(HINTS.tools['shape-rect'].hint[1].text).toContain('square');
      expect(HINTS.tools['shape-oval'].hint[1].text).toContain('circle');
      expect(HINTS.tools['shape-line'].hint[1].text).toContain('45');
      expect(HINTS.tools['shape-polygon'].hint[1].text).toContain('aligned edges');
      expect(HINTS.tools.type.hint.length).toBe(3);
      // Pen / scissor / fill entries derived from existing tool behavior.
      ['pen-draw', 'pen-add', 'pen-delete', 'pen-anchor', 'scissor-line', 'fill'].forEach((k) => {
        expect(HINTS.tools[k]).toBeTruthy();
        expect(HINTS.tools[k].hint.length).toBeGreaterThan(0);
      });
    });

    test('boot renders the select-tool hint with bolded keyword segments and | separators', async () => {
      app.renderer.setTool('select');
      await nextFrames();
      const el = hintsEl();
      expect(el).toBeTruthy();
      const segs = el.querySelectorAll('.hud-hint-seg');
      expect(segs.length).toBe(3);
      expect(segs[0].querySelector('strong').textContent).toBe('Click');
      expect(segs[0].textContent).toContain('the object to select');
      expect(el.querySelectorAll('.hud-hint-sep').length).toBe(2);
      expect(el.textContent).toContain('|');
    });

    test('hint switches with renderer.setTool, with {shape}/{constrained} substitution', async () => {
      app.renderer.setTool('shape-rect');
      await nextFrames();
      expect(hintsEl().textContent).toContain('rectangle');
      expect(hintsEl().textContent).toContain('square');

      app.renderer.setTool('shape-oval');
      await nextFrames();
      expect(hintsEl().textContent).toContain('oval');
      expect(hintsEl().textContent).toContain('circle');

      app.renderer.setTool('type');
      await nextFrames();
      expect(hintsEl().textContent).toContain('text box');
    });

    test('pen hint is mode-aware (pen subtool modes map to distinct entries)', async () => {
      app.renderer.setTool('pen');
      app.renderer.setPenMode('draw');
      await nextFrames();
      const drawText = hintsEl().textContent;
      app.renderer.setPenMode('delete');
      await nextFrames();
      expect(hintsEl().textContent).not.toBe(drawText);
      app.renderer.setPenMode('draw');
    });

    test('hint text clears while a canvas drag is in progress and restores on release', async () => {
      app.renderer.setTool('select');
      await nextFrames();
      expect(hintsEl().classList.contains('is-hidden')).toBe(false);

      pointer('pointerdown', canvas(), 100, 100);
      pointer('pointermove', canvas(), 130, 130);
      await nextFrames();
      expect(hintsEl().classList.contains('is-hidden')).toBe(true);

      pointer('pointerup', window, 130, 130);
      await nextFrames();
      expect(hintsEl().classList.contains('is-hidden')).toBe(false);
    });

    test('a mere click (no movement past threshold) does not clear the hint', async () => {
      app.renderer.setTool('select');
      await nextFrames();
      pointer('pointerdown', canvas(), 200, 200);
      pointer('pointermove', canvas(), 201, 200);
      await nextFrames();
      expect(hintsEl().classList.contains('is-hidden')).toBe(false);
      pointer('pointerup', window, 201, 200);
      await nextFrames();
    });
  });

  describe('HUD-2 — tool name, zoom and rotation readouts', () => {
    test('active tool display name shows and tracks tool switches', async () => {
      app.renderer.setTool('select');
      await nextFrames();
      expect(toolEl().textContent).toBe(window.Vectura.HINTS.tools.select.name);
      app.renderer.setTool('shape-rect');
      await nextFrames();
      expect(toolEl().textContent).toBe(window.Vectura.HINTS.tools['shape-rect'].name);
      app.renderer.setTool('select');
      await nextFrames();
    });

    test('zoom readout is live from renderer.scale', async () => {
      const pxPerMm = window.Vectura.HINTS.pxPerMm;
      app.renderer.scale = pxPerMm; // exactly 100%
      await nextFrames();
      expect(zoomEl().textContent).toBe('100%');
      app.renderer.scale = pxPerMm * 2.5;
      await nextFrames();
      expect(zoomEl().textContent).toBe('250%');
    });

    test('rotation readout shows 0° when the canvas has no rotation', async () => {
      await nextFrames();
      expect(rotationEl().textContent).toBe('0°');
    });
  });

  describe('HUD-3 — transient canvas toast', () => {
    let originalDuration;
    beforeAll(() => {
      originalDuration = window.Vectura.HINTS.toast.durationMs;
      window.Vectura.HINTS.toast.durationMs = 90;
    });
    afterAll(() => {
      window.Vectura.HINTS.toast.durationMs = originalDuration;
    });

    test('UI.toast(message) shows exactly one non-interactive pill top-center of the canvas', () => {
      window.Vectura.UI.toast('Shape Expanded');
      const el = toastEl();
      expect(el).toBeTruthy();
      expect(el.classList.contains('is-visible')).toBe(true);
      expect(el.textContent).toBe('Shape Expanded');
      // Single surface — mounted inside the viewport container.
      expect(document.querySelectorAll('#canvas-toast').length).toBe(1);
      expect(el.closest('#viewport-container')).toBeTruthy();
    });

    test('queue-drop-oldest: a second toast replaces the first immediately', () => {
      window.Vectura.UI.toast('First');
      window.Vectura.UI.toast('Second');
      const el = toastEl();
      expect(document.querySelectorAll('#canvas-toast').length).toBe(1);
      expect(el.textContent).toBe('Second');
      expect(el.textContent).not.toContain('First');
    });

    test('auto-dismisses after the configured duration', async () => {
      window.Vectura.UI.toast('Ephemeral');
      expect(toastEl().classList.contains('is-visible')).toBe(true);
      await new Promise((r) => setTimeout(r, 200));
      expect(toastEl().classList.contains('is-visible')).toBe(false);
    });

    test('vectura:shape-expanded CustomEvent produces exactly one toast with config copy', async () => {
      document.dispatchEvent(new window.CustomEvent('vectura:shape-expanded'));
      const el = toastEl();
      expect(el.classList.contains('is-visible')).toBe(true);
      expect(el.textContent).toBe(window.Vectura.HINTS.toasts.shapeExpanded);
      await new Promise((r) => setTimeout(r, 200));
      expect(el.classList.contains('is-visible')).toBe(false);
    });
  });

  describe('HUD-4 — Contextual hints preference', () => {
    const checkbox = () => document.getElementById('set-contextual-hints');

    test('Document Setup → Guides & Display has a "Contextual hints" checkbox, default ON', () => {
      const cb = checkbox();
      expect(cb).toBeTruthy();
      // Lives in the Guides & Display section, following the swToggle idiom.
      const sect = cb.closest('.sect');
      expect(sect?.querySelector('.sect-hdr')?.textContent).toContain('Guides');
      expect(cb.checked).toBe(true);
      expect(window.Vectura.SETTINGS.contextualHints !== false).toBe(true);
    });

    test('toggling OFF hides hint text while tool/zoom readouts keep showing', async () => {
      app.renderer.setTool('select');
      await nextFrames();
      const cb = checkbox();
      cb.checked = false;
      cb.dispatchEvent(new window.Event('change', { bubbles: true }));
      await nextFrames();
      expect(hintsEl().classList.contains('is-hidden')).toBe(true);
      expect(window.Vectura.SETTINGS.contextualHints).toBe(false);
      // Readouts always show (HUD-4).
      expect(toolEl().textContent.length).toBeGreaterThan(0);
      expect(zoomEl().textContent).toMatch(/%$/);

      cb.checked = true;
      cb.dispatchEvent(new window.Event('change', { bubbles: true }));
      await nextFrames();
      expect(hintsEl().classList.contains('is-hidden')).toBe(false);
      expect(window.Vectura.SETTINGS.contextualHints).toBe(true);
    });

    test('contextualHints round-trips through the canonical App preference snapshot', () => {
      const SETTINGS = window.Vectura.SETTINGS;
      // The old standalone `vectura-hud-contextual-hints` localStorage fallback
      // was retired at integration; the setter no longer writes it.
      window.Vectura.UI.HintBar.setContextualHints(false);
      expect(window.localStorage.getItem('vectura-hud-contextual-hints')).toBe(null);

      // OFF is carried by getPreferenceSnapshot (alongside showGuides/snapGuides).
      SETTINGS.contextualHints = false;
      const snap = app.getPreferenceSnapshot();
      expect(snap.contextualHints).toBe(false);

      // applyPreferenceSnapshot restores it (round-trips via .vectura + cookie prefs).
      app.applyPreferenceSnapshot({ ...snap, contextualHints: true });
      expect(SETTINGS.contextualHints).toBe(true);
      app.applyPreferenceSnapshot({ ...snap, contextualHints: false });
      expect(SETTINGS.contextualHints).toBe(false);

      // captureState / applyState (undo snapshots) also carry it.
      SETTINGS.contextualHints = true;
      const state = app.captureState();
      expect(state.settings.contextualHints).toBe(true);

      // Reset to default ON for downstream tests.
      SETTINGS.contextualHints = true;
    });
  });

  describe('layout — hint bar strip', () => {
    test('#status-bar (hints region) lives inside the #hud-bar bottom strip in the workspace shell', () => {
      const bar = barEl();
      expect(bar).toBeTruthy();
      expect(hintsEl().closest('#hud-bar')).toBe(bar);
      expect(bar.closest('.workspace-shell')).toBeTruthy();
      // No stray second status bar left in the header.
      expect(document.querySelectorAll('#status-bar').length).toBe(1);
    });
  });
});
