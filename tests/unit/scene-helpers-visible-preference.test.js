/**
 * Job 3 (fs-d1-engine) — persist SETTINGS.sceneHelpersVisible across reload.
 *
 * A sibling agent (branch 3d-scene/fs-b3-helpers, commit d3b65744) added
 * `SETTINGS.sceneHelpersVisible` (default true) in src/config/defaults.js and
 * gated the renderer's non-print 3D-scene helper overlays on it
 * (`Renderer#_sceneHelpersVisible()` = `SETTINGS.sceneHelpersVisible !== false`).
 * It is a plain SETTINGS key so undo/redo already carries it live, but the
 * cookie-based preference pair in src/app/app.js — getPreferenceSnapshot /
 * applyPreferenceSnapshot — had no entry, so toggling the toolbar switch would
 * not survive a page reload. That commit's own handoff note calls this out as
 * app.js's job (out of scope for the renderer-owning agent).
 *
 * Note: `src/config/defaults.js` on THIS branch does not yet carry the
 * `sceneHelpersVisible: true` default (that lands with the fs-b3-helpers
 * merge) — these tests exercise app.js's round-trip logic directly against
 * `window.Vectura.SETTINGS`, which is robust to that regardless: both sides
 * use the `!== false` / `=== true` idiom, so "key absent" already reads as
 * "true" without relying on defaults.js.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('SETTINGS.sceneHelpersVisible preference round-trip (Job 3)', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const bootApp = async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      includeMain: false,
      useIndexHtml: true,
    });
    const { window } = runtime;
    window.app = new window.Vectura.App();
    await Promise.resolve();
    return window;
  };

  test('default (cookie absent) reads true in the snapshot', async () => {
    const window = await bootApp();
    const snap = window.app.getPreferenceSnapshot();
    expect(snap.sceneHelpersVisible).toBe(true);
  });

  test('malformed snapshot (not an object) is a no-op: live SETTINGS default stays true', async () => {
    const window = await bootApp();
    const { SETTINGS } = window.Vectura;
    window.app.applyPreferenceSnapshot('not-an-object');
    window.app.applyPreferenceSnapshot(null);
    window.app.applyPreferenceSnapshot(42);
    expect(SETTINGS.sceneHelpersVisible !== false).toBe(true);
  });

  test('snapshot omitting the key preserves the current live value (true) after apply', async () => {
    const window = await bootApp();
    const { SETTINGS } = window.Vectura;
    window.app.applyPreferenceSnapshot({});
    expect(SETTINGS.sceneHelpersVisible !== false).toBe(true);
  });

  test('explicit false round-trips: apply(false) -> SETTINGS false -> snapshot false', async () => {
    const window = await bootApp();
    const { SETTINGS } = window.Vectura;
    window.app.applyPreferenceSnapshot({ sceneHelpersVisible: false });
    expect(SETTINGS.sceneHelpersVisible).toBe(false);
    const snap = window.app.getPreferenceSnapshot();
    expect(snap.sceneHelpersVisible).toBe(false);
  });

  test('explicit true round-trips after having been false', async () => {
    const window = await bootApp();
    const { SETTINGS } = window.Vectura;
    window.app.applyPreferenceSnapshot({ sceneHelpersVisible: false });
    expect(SETTINGS.sceneHelpersVisible).toBe(false);
    window.app.applyPreferenceSnapshot({ sceneHelpersVisible: true });
    expect(SETTINGS.sceneHelpersVisible).toBe(true);
  });

  test('full save -> load round trip via JSON (simulates cookie persistence) preserves false', async () => {
    const window = await bootApp();
    const { SETTINGS } = window.Vectura;
    SETTINGS.sceneHelpersVisible = false;
    const saved = JSON.parse(JSON.stringify(window.app.getPreferenceSnapshot()));
    // Simulate a reload: reset SETTINGS back to true, then reapply the saved cookie.
    SETTINGS.sceneHelpersVisible = true;
    window.app.applyPreferenceSnapshot(saved);
    expect(SETTINGS.sceneHelpersVisible).toBe(false);
  });
});
