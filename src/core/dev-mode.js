/**
 * Developer Mode — window.Vectura.DevMode. One flag, SETTINGS.devMode, owned by the Document Setup switch
 * (Contributor / Presets). Every consumer reads it through here so a change reaches live surfaces (the Start Page's
 * editable example plates) without a reload.
 *
 *   DevMode.isOn()            -> boolean (SETTINGS.devMode === true)
 *   DevMode.set(on, { app })  -> writes SETTINGS.devMode, persists preferences, syncs the Document Setup switch and
 *                                the Contributor buttons, and dispatches 'vectura:dev-mode-changed' on window
 *   DevMode.subscribe(fn)     -> unsubscribe; fn(on) runs on every change
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const EVENT = 'vectura:dev-mode-changed';

  const settings = () => Vectura.SETTINGS || {};
  const isOn = () => settings().devMode === true;

  // Show the buttons that only make sense in Developer Mode (Document Setup's "Edit Start Page plates…").
  const syncDom = () => {
    try {
      const d = G.document;
      if (!d) return;
      const sw = d.getElementById('set-dev-mode');
      if (sw && sw.checked !== isOn()) sw.checked = isOn();
      d.querySelectorAll('[data-dev-only]').forEach((el) => { el.hidden = !isOn(); });
    } catch (_e) { /* noop */ }
  };

  const set = (on, opts = {}) => {
    const next = on === true;
    const changed = isOn() !== next;
    settings().devMode = next;
    const app = opts.app || G.app;
    if (changed) { try { app && app.persistPreferences && app.persistPreferences(); } catch (_e) { /* noop */ } }
    syncDom();
    if (changed) { try { G.dispatchEvent(new G.CustomEvent(EVENT, { detail: { on: next } })); } catch (_e) { /* noop */ } }
    return next;
  };

  const subscribe = (fn) => {
    if (typeof fn !== 'function' || typeof G.addEventListener !== 'function') return () => {};
    const h = () => { try { fn(isOn()); } catch (_e) { /* isolated */ } };
    G.addEventListener(EVENT, h);
    return () => G.removeEventListener(EVENT, h);
  };

  Vectura.DevMode = { isOn, set, subscribe, syncDom, EVENT };
})();
