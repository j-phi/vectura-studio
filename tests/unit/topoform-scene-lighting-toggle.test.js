/*
 * Topoform (topoform) master "Scene Lighting" toggle.
 *
 * A master checkbox `sceneLighting` (default OFF) gates ALL lighting sub-controls
 * on the topoform panel only. When OFF, the Lambert/hatch group and the
 * depth-cue group are hidden; the geometry/visibility controls (creases, hidden
 * lines, outline, depth bias) stay ungated. The other 3D algos are untouched.
 *
 * Loaded via the same JSDOM harness as 3d-wave3-schema.test.js.
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

const findDef = (defs, id) => defs.find((d) => d.id === id);

describe('Topoform Scene Lighting master toggle', () => {
  let dom;
  let CONTROL_DEFS;
  let ALGO_DEFAULTS;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/ui/ui-fill-panel.js',
      'src/ui/controls-registry.js',
    ]);
    const w = dom.window;
    expect(w.Vectura?.UI?.CONTROL_DEFS).toBeTruthy();
    CONTROL_DEFS = w.Vectura.UI.CONTROL_DEFS;
    ALGO_DEFAULTS = w.Vectura.ALGO_DEFAULTS;
  });

  afterAll(() => dom?.window?.close?.());

  it('defaults sceneLighting to false on topoform', () => {
    expect(ALGO_DEFAULTS).toBeTruthy();
    expect(ALGO_DEFAULTS.topoform.sceneLighting).toBe(false);
  });

  it('adds a sceneLighting checkbox as the first item in the Shading & Lines section', () => {
    const defs = CONTROL_DEFS.topoform;
    const sectionIdx = defs.findIndex(
      (d) => d.type === 'section' && d.label === 'Shading & Lines'
    );
    expect(sectionIdx).toBeGreaterThanOrEqual(0);
    const next = defs[sectionIdx + 1];
    expect(next).toBeTruthy();
    expect(next.id).toBe('sceneLighting');
    expect(next.type).toBe('checkbox');
    expect(next.label).toBe('Scene Lighting');
  });

  it('hides every lighting sub-control when sceneLighting is false', () => {
    const defs = CONTROL_DEFS.topoform;
    const off = { sceneLighting: false };
    for (const id of [
      'hatchEnable',
      'lightAzimuth',
      'lightElevation',
      'hatchAngle',
      'hatchSpacing',
      'crossHatch',
      'depthCue',
      'depthCueStrength',
    ]) {
      const def = findDef(defs, id);
      expect(def, `topoform should declare ${id}`).toBeTruthy();
      expect(def.showIf, `${id} should be gated`).toBeTypeOf('function');
      expect(def.showIf(off), `${id} must be hidden when sceneLighting is false`).toBe(false);
    }
  });

  it('keeps lighting sub-controls hidden even if their self-toggle is on but master is off', () => {
    const defs = CONTROL_DEFS.topoform;
    const params = { sceneLighting: false, hatchEnable: true, depthCue: 'dash' };
    expect(findDef(defs, 'lightAzimuth').showIf(params)).toBe(false);
    expect(findDef(defs, 'depthCueStrength').showIf(params)).toBe(false);
  });

  it('reveals lighting sub-controls when sceneLighting is true and self-toggle is on', () => {
    const defs = CONTROL_DEFS.topoform;
    expect(findDef(defs, 'hatchEnable').showIf({ sceneLighting: true })).toBe(true);
    expect(findDef(defs, 'depthCue').showIf({ sceneLighting: true })).toBe(true);
    expect(
      findDef(defs, 'lightAzimuth').showIf({ sceneLighting: true, hatchEnable: true })
    ).toBe(true);
    expect(
      findDef(defs, 'depthCueStrength').showIf({ sceneLighting: true, depthCue: 'dash' })
    ).toBe(true);
  });

  it('does NOT gate the geometry/visibility controls behind sceneLighting', () => {
    const defs = CONTROL_DEFS.topoform;
    // showCreases has no prior self-toggle; with the always-true crease cap its
    // showIf stays the pre-existing ungated value (null) — NOT a sceneLighting gate.
    // The contract: it must be visible regardless of sceneLighting.
    const showCreases = findDef(defs, 'showCreases');
    expect(showCreases.showIf == null || showCreases.showIf({ sceneLighting: false }) === true).toBe(true);
    // hiddenLineMode likewise ungated.
    const hiddenLineMode = findDef(defs, 'hiddenLineMode');
    expect(hiddenLineMode.showIf == null || hiddenLineMode.showIf({ sceneLighting: false }) === true).toBe(true);
    // emphasizeOutline ungated; outlineWeight/depthBias keep their own self-toggles
    // and ignore sceneLighting.
    const emphasize = findDef(defs, 'emphasizeOutline');
    expect(emphasize.showIf == null || emphasize.showIf({ sceneLighting: false }) === true).toBe(true);
    expect(findDef(defs, 'outlineWeight').showIf({ sceneLighting: false, emphasizeOutline: true })).toBe(true);
    expect(findDef(defs, 'depthBias').showIf({ sceneLighting: false, hiddenLineMode: 'remove' })).toBe(true);
  });

  it('does not add a sceneLighting control to the other 3D algos', () => {
    for (const algo of ['polyhedron', 'spiralizer', 'rasterPlane', 'terrain']) {
      const def = findDef(CONTROL_DEFS[algo], 'sceneLighting');
      expect(def, `${algo} must NOT have a sceneLighting control`).toBeUndefined();
    }
  });

  it('Specular Highlight + size + Light Position pad live inside the Shading & Lines section', () => {
    const defs = CONTROL_DEFS.topoform;
    const sectionIdx = defs.findIndex((d) => d.type === 'section' && d.label === 'Shading & Lines');
    const idxOf = (id) => defs.findIndex((d) => d.id === id);
    for (const id of ['specularHighlight', 'specularSize', 'lightDirection']) {
      expect(idxOf(id), `${id} should exist`).toBeGreaterThan(sectionIdx); // after the section header
    }
    // It is NOT left behind in an earlier (Contours/Source) section.
    const viewIdx = defs.findIndex((d) => d.type === 'section' && d.label === 'View');
    expect(idxOf('specularHighlight')).toBeGreaterThan(viewIdx); // shading section is after View
  });

  it('the Light Position pad is an xy lightPad wired to azimuth + elevation', () => {
    const pad = findDef(CONTROL_DEFS.topoform, 'lightDirection');
    expect(pad).toBeTruthy();
    expect(pad.type).toBe('lightPad');
    expect(pad.azParam).toBe('lightAzimuth');
    expect(pad.elParam).toBe('lightElevation');
  });

  it('the light controls (pad + azimuth + elevation) show for hatching OR specular highlight', () => {
    const defs = CONTROL_DEFS.topoform;
    for (const id of ['lightDirection', 'lightAzimuth', 'lightElevation']) {
      const sh = findDef(defs, id).showIf;
      // hidden when neither is on
      expect(sh({ ...ALGO_DEFAULTS.topoform })).toBe(false);
      // shown when the specular highlight is on (even with scene lighting off)
      expect(sh({ ...ALGO_DEFAULTS.topoform, specularHighlight: true })).toBe(true);
      // shown for Lambert hatching (scene lighting + hatch)
      expect(sh({ ...ALGO_DEFAULTS.topoform, sceneLighting: true, hatchEnable: true })).toBe(true);
    }
  });

  it('the specular controls + pad are scoped to topoform only', () => {
    for (const algo of ['polyhedron', 'spiralizer', 'rasterPlane', 'terrain']) {
      for (const id of ['specularHighlight', 'specularSize', 'lightDirection']) {
        expect(findDef(CONTROL_DEFS[algo], id), `${algo}.${id} must not exist`).toBeUndefined();
      }
    }
  });
});
