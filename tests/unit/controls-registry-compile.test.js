/*
 * Compile gate for src/ui/controls-registry.js (Phase 2 extraction).
 *
 * The legacy CONTROL_DEFS literal lived inside the src/ui/ui.js IIFE, where
 * `showIf` arrow predicates could closure-capture module-level helpers without
 * us noticing. After moving the literal into its own IIFE file, any predicate
 * that secretly referenced an unexported local would throw `ReferenceError`
 * the moment it ran outside the old closure.
 *
 * This suite loads controls-registry.js into a JSDOM context, then iterates
 * every (algorithm × control × showIf) combination twice — once with
 * ALGO_DEFAULTS and once with an empty {} — asserting no ReferenceError.
 *
 * If extraction ever drags a closure-captured helper back in, this test fails
 * loudly with the offending algorithm + control id, and the fix is to hoist
 * the helper onto window.Vectura.UI.helpers per migration plan §2.9.
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
  // dom.getInternalVMContext() IS the window — `window` and `document` are
  // already available as getters, no assignment needed.
  for (const rel of scriptPaths) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, context, { filename: rel });
  }
  return dom;
};

describe('controls-registry compile gate', () => {
  let dom;
  let CONTROL_DEFS;
  let ALGO_DEFAULTS;

  beforeAll(() => {
    // FillPanel must be on window first because controls-registry calls
    // window.Vectura.FillPanel.buildFillControlDefs() inside its top-level
    // spreads. Defaults provides ALGO_DEFAULTS for predicate input.
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/ui/ui-fill-panel.js',
      'src/ui/controls-registry.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    CONTROL_DEFS = w.Vectura.UI.CONTROL_DEFS;
    ALGO_DEFAULTS = w.Vectura.ALGO_DEFAULTS;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.CONTROL_DEFS', () => {
    expect(CONTROL_DEFS).toBeTruthy();
    expect(typeof CONTROL_DEFS).toBe('object');
  });

  it('every algorithm key maps to an array of control defs', () => {
    for (const [algo, defs] of Object.entries(CONTROL_DEFS)) {
      expect(Array.isArray(defs), `CONTROL_DEFS.${algo} should be an array`).toBe(true);
    }
  });

  it('every showIf predicate runs without ReferenceError under ALGO_DEFAULTS', () => {
    const failures = [];
    for (const [algo, defs] of Object.entries(CONTROL_DEFS)) {
      const params = ALGO_DEFAULTS?.[algo] || {};
      for (const def of defs) {
        if (typeof def?.showIf !== 'function') continue;
        try {
          def.showIf(params);
        } catch (err) {
          failures.push(`${algo}.${def.id || def.type}: ${err.message}`);
        }
      }
    }
    expect(failures, `predicates threw:\n${failures.join('\n')}`).toEqual([]);
  });

  it('every showIf predicate runs without ReferenceError under empty params', () => {
    const failures = [];
    for (const [algo, defs] of Object.entries(CONTROL_DEFS)) {
      for (const def of defs) {
        if (typeof def?.showIf !== 'function') continue;
        try {
          def.showIf({});
        } catch (err) {
          failures.push(`${algo}.${def.id || def.type}: ${err.message}`);
        }
      }
    }
    expect(failures, `predicates threw on {}:\n${failures.join('\n')}`).toEqual([]);
  });

  it('petalisDesigner controls are derived from petalis without designer-removed ids/labels/types', () => {
    expect(Array.isArray(CONTROL_DEFS.petalisDesigner)).toBe(true);
    const petalisDesignerIds = new Set(
      CONTROL_DEFS.petalisDesigner.map((d) => d?.id).filter(Boolean),
    );
    // Spot-check a few removed ids per the migration spec § PETALIS_DESIGNER_REMOVED_CONTROL_IDS
    expect(petalisDesignerIds.has('petalProfile')).toBe(false);
    expect(petalisDesignerIds.has('count')).toBe(false);
    expect(petalisDesignerIds.has('innerCount')).toBe(false);
  });
});
