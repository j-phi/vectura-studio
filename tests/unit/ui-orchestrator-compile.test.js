/*
 * Compile gate for src/ui/ui.js (Meridian Unit 1.10 consolidated entry).
 *
 * Unit 1.10 (2026-05-20): the historical two-file split — `_ui-legacy.js`
 * carrying the `class UI` + bootstrap IIFE and `ui.js` carrying only the
 * orchestrator init shim — was collapsed into a single `src/ui/ui.js`.
 * The trip-wire that protected against load-order regressions between the
 * two files is no longer needed; the consolidated entry IS the class.
 *
 * This test asserts:
 *
 *   1. Loading `src/ui/ui.js` in isolation defines `window.Vectura.UI` as
 *      the runtime UI class (a function/constructor).
 *   2. `window.Vectura.UI.Orchestrator` is the same class (backwards-compat
 *      alias for any fixture that prefers the explicit name).
 *   3. `Orchestrator.init` is a function (the orchestrator constructor body).
 *   4. `Orchestrator.installOn(proto)` installs `proto._init` on an
 *      arbitrary prototype object — mirrors the satellite pattern used
 *      throughout the panels.
 *
 * Note: this test loads ui.js standalone (no satellites, no controls
 * registry). The bootstrap block inside the IIFE guards each
 * `Panel.bind` / `Panel.installOn` call with `window.Vectura?.UI?.<X>?` so
 * the IIFE completes cleanly even without any sibling modules loaded.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const loadInJSDOM = (scriptPaths) => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const context = dom.getInternalVMContext();
  for (const rel of scriptPaths) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, context, { filename: rel });
  }
  return dom;
};

describe('ui.js consolidated orchestrator entry (Meridian Unit 1.10)', () => {
  let dom;
  let UI;
  let Orchestrator;

  beforeAll(() => {
    // ui.js needs `window.Vectura.AlgorithmUtils.{clamp, lerp}` at IIFE
    // load time (line ~166 of the file destructures them). Stub a minimal
    // namespace before loading so the IIFE completes.
    dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
      url: 'http://localhost/',
      pretendToBeVisual: true,
      runScripts: 'outside-only',
    });
    const ctx = dom.getInternalVMContext();
    // Seed the minimum window.Vectura surface ui.js inspects during the
    // IIFE (the destructure at the top + AlgorithmUtils.clamp/lerp + the
    // canonical UI.utils.escapeHtml that ui.js now aliases into its
    // IIFE-local scope per Redundancy-1 PR1).
    vm.runInContext(`
      window.Vectura = {
        AlgorithmUtils: {
          clamp: (v, lo, hi) => Math.min(Math.max(v, lo), hi),
          lerp: (a, b, t) => a + (b - a) * t,
        },
<<<<<<< HEAD
        UI: {
          utils: {
            escapeHtml: (v) => String(v ?? '')
              .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
          },
        },
=======
        Utils: {
          clone: (typeof structuredClone === 'function')
            ? (v) => structuredClone(v)
            : (v) => JSON.parse(JSON.stringify(v)),
        },
        UI: {},
>>>>>>> e5bf55e (refactor(utils): canonical clone with structuredClone (Redundancy-1 PR4))
      };
    `, ctx);
    const code = fs.readFileSync(path.join(ROOT, 'src/ui/ui.js'), 'utf8');
    vm.runInContext(code, ctx, { filename: 'src/ui/ui.js' });
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    UI = w.Vectura.UI;
    Orchestrator = UI && UI.Orchestrator;
  });

  afterAll(() => dom?.window?.close?.());

  it('window.Vectura.UI is a class (constructor function)', () => {
    expect(typeof UI).toBe('function');
  });

  it('window.Vectura.UI.Orchestrator aliases the same class', () => {
    expect(Orchestrator).toBe(UI);
  });

  it('exposes Orchestrator.init as a function (Unit 1.9c → 1.10)', () => {
    expect(typeof Orchestrator.init).toBe('function');
  });

  it('Orchestrator.installOn assigns _init to a prototype object (Unit 1.9c → 1.10)', () => {
    expect(typeof Orchestrator.installOn).toBe('function');
    const proto = {};
    Orchestrator.installOn(proto);
    expect(typeof proto._init).toBe('function');
  });

  it('UI.prototype._init is pre-installed by the IIFE', () => {
    expect(typeof UI.prototype._init).toBe('function');
  });
});
