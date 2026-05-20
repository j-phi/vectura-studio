/*
 * Compile gate for src/ui/ui.js (Phase 2 step 6 runtime entry).
 *
 * Step 6 chose option (b): `_ui-legacy.js` carries the UI class + bind()
 * block + IIFE locals, and `ui.js` is a thin entry that aliases
 * `window.Vectura.UI` as `window.Vectura.UI.Orchestrator`. This test
 * confirms two things:
 *
 *   1. Loaded standalone (without `_ui-legacy.js`): the Orchestrator is
 *      a placeholder class that throws a clear "you forgot to load the
 *      legacy satellite" error on construction. This is the trip-wire
 *      that protects against accidental load-order regressions.
 *   2. Loaded after `_ui-legacy.js`: `Orchestrator` aliases the legacy
 *      class itself (so callers preferring the explicit name reach the
 *      same constructor as `new UI(app)`).
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

describe('ui.js orchestrator entry (option-b satellite shape)', () => {
  let dom;
  let Orchestrator;

  beforeAll(() => {
    // Standalone load — `_ui-legacy.js` deliberately NOT loaded so we
    // exercise the trip-wire path.
    dom = loadInJSDOM([
      'src/ui/ui.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    Orchestrator = w.Vectura.UI.Orchestrator;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.Orchestrator as a class', () => {
    expect(Orchestrator).toBeTruthy();
    expect(typeof Orchestrator).toBe('function');
  });

  it('refuses to construct standalone with a clear "load order" error', () => {
    expect(() => new Orchestrator({}))
      .toThrow(/_ui-legacy\.js|legacy carries the runtime UI class/);
  });

  // Meridian Unit 1.9c (2026-05-20): the legacy `class UI { constructor() {...} }`
  // body migrated to src/ui/ui.js. The orchestrator IIFE now also exposes:
  //   - Orchestrator.init  — the constructor-body function (called as
  //                          init.call(this, app) once _init is invoked).
  //   - Orchestrator.installOn(proto) — installs proto._init on the UI
  //                                     prototype so `new UI(app)` runs init.
  it('exposes Orchestrator.init as a function (Unit 1.9c)', () => {
    expect(typeof Orchestrator.init).toBe('function');
  });

  it('Orchestrator.installOn assigns _init to a prototype object (Unit 1.9c)', () => {
    expect(typeof Orchestrator.installOn).toBe('function');
    const proto = {};
    Orchestrator.installOn(proto);
    expect(typeof proto._init).toBe('function');
  });
});
