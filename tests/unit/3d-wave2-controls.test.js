/*
 * 3D audit Wave 2 — baseline-neutral schema changes (D3 + UX7).
 *
 * D3: rasterPlane Noise Mode / Noise Amount controls are gated behind a
 *     non-empty, enabled noise stack (`p.noises`). The generator's
 *     createNoiseField (src/core/algorithms/raster-plane.js) returns null when
 *     no enabled layers exist, so the controls are inert until a layer is added;
 *     hiding them by default is baseline-neutral. The showIf predicate mirrors
 *     createNoiseField's filter (`n && n.enabled !== false`, so a layer with
 *     `enabled` undefined counts as enabled).
 *
 * UX7: compass-heading sliders become the circular angle dial — lightAzimuth
 *      (shared buildShadingControls) and topoform's planeRotate switch
 *      from type:'range' to type:'angle'. Changing a control's UI type does not
 *      change generated geometry.
 *
 * Loads controls-registry.js into a JSDOM context, mirroring the harness in
 * controls-registry-showif-predicates.test.js.
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

const findControl = (defs, id) => defs.find((c) => c && c.id === id);

describe('3D Wave 2 controls (D3 + UX7)', () => {
  let dom;
  let CONTROL_DEFS;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/ui/ui-fill-panel.js',
      'src/ui/controls-registry.js',
    ]);
    const w = dom.window;
    expect(w.Vectura?.UI?.CONTROL_DEFS).toBeTruthy();
    CONTROL_DEFS = w.Vectura.UI.CONTROL_DEFS;
  });

  afterAll(() => dom?.window?.close?.());

  describe('Surface Noise: global Noise Mode / Amount removed (per-layer driven)', () => {
    // The global Noise Mode + Noise Amount were removed — each noise layer's own
    // Blend Mode and Field Weight now drive the displacement. The Surface Noise
    // section is just the noise stack.
    it('no longer declares a noiseMode or noiseAmount control', () => {
      expect(findControl(CONTROL_DEFS.rasterPlane, 'noiseMode')).toBeFalsy();
      expect(findControl(CONTROL_DEFS.rasterPlane, 'noiseAmount')).toBeFalsy();
    });

    it('the Noise Stack section is followed by the noise stack control', () => {
      const defs = CONTROL_DEFS.rasterPlane;
      const sectionIdx = defs.findIndex((d) => d.type === 'section' && d.label === 'Noise Stack');
      expect(sectionIdx).toBeGreaterThanOrEqual(0);
      const noiseList = defs.slice(sectionIdx).find((d) => d.type === 'noiseList');
      expect(noiseList).toBeTruthy();
      expect(noiseList.source).toBe('rasterPlane');
    });

    it('carries no leftover sectionHint about Mode & Amount', () => {
      const hint = CONTROL_DEFS.rasterPlane.find((d) => d.type === 'sectionHint');
      expect(hint).toBeFalsy();
    });
  });

  describe('UX7: compass-heading sliders use the angle dial', () => {
    it('lightAzimuth (shared shading factory) is type angle', () => {
      // lightAzimuth is injected into every 3D algo via buildShadingControls;
      // assert on rasterPlane (which spreads the shading block).
      const lightAzimuth = findControl(CONTROL_DEFS.rasterPlane, 'lightAzimuth');
      expect(lightAzimuth).toBeTruthy();
      expect(lightAzimuth.type).toBe('angle');
      // wrap range + unit preserved
      expect(lightAzimuth.min).toBe(0);
      expect(lightAzimuth.max).toBe(360);
      expect(lightAzimuth.displayUnit).toBe('°');
    });

    it('planeRotate (topoform) is type angle', () => {
      const planeRotate = findControl(CONTROL_DEFS.topoform, 'planeRotate');
      expect(planeRotate).toBeTruthy();
      expect(planeRotate.type).toBe('angle');
      expect(planeRotate.min).toBe(-180);
      expect(planeRotate.max).toBe(180);
    });

    it('leaves topoform view yaw/pitch/roll as plain ranges (not touched)', () => {
      for (const id of ['yaw', 'pitch', 'roll']) {
        const ctrl = findControl(CONTROL_DEFS.topoform, id);
        expect(ctrl, id).toBeTruthy();
        expect(ctrl.type, id).toBe('range');
      }
    });
  });
});
