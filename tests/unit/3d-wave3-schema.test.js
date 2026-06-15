/*
 * 3D-audit Wave 3 schema additions (controls-registry.js).
 *
 * Covers the four label/flag/hint-only requirements from
 * docs/3d-audit/phase3-ux-requirements.md, implemented to the SHARED CONTRACT
 * for two new schema markers (the renderer lives in algo-config-panel.js):
 *
 *   - UX1 / WU7: the shared "Shading & Lines" section gains `collapsed: true`
 *     on all four 3D panels (renderer draws it as a closed disclosure group).
 *   - WU9 / D3: rasterPlane gets a `{ type:'sectionHint', text, showIf }`
 *     marker after the "Surface Noise" header and before noiseMode — visible
 *     only when the noise stack has no enabled layer.
 *   - UX9p2: spiralizer per-shape dimension labels are de-prefixed (the gated set
 *     is mutually exclusive, so the shape prefix was redundant); the co-display
 *     ellipsoid/torus pairs keep their distinguishing names.
 *   - UX6: topoform contourVisibility dashed-hidden option label is
 *     harmonized to the shared "See-Through" vocabulary (value unchanged).
 *
 * Loaded via the same JSDOM harness as 3d-shading-capability.test.js.
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

describe('3D-audit Wave 3 schema additions', () => {
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

  // UX1 / WU7 — collapsed-by-default "Shading & Lines" on all four 3D panels.
  it('marks the "Shading & Lines" section collapsed:true in all four 3D algos', () => {
    for (const algo of ['spiralizer', 'polyhedron', 'topoform', 'rasterPlane']) {
      const section = CONTROL_DEFS[algo].find(
        (d) => d.type === 'section' && d.label === 'Shading & Lines'
      );
      expect(section, `${algo} should have a "Shading & Lines" section`).toBeTruthy();
      expect(section.collapsed, `${algo} "Shading & Lines" must be collapsed:true`).toBe(true);
    }
  });

  it('does not collapse any other section (additive flag only)', () => {
    for (const algo of ['spiralizer', 'polyhedron', 'topoform', 'rasterPlane']) {
      for (const d of CONTROL_DEFS[algo]) {
        if (d.type === 'section' && d.label !== 'Shading & Lines') {
          expect(d.collapsed, `${algo} section "${d.label}" must not be collapsed`).toBeFalsy();
        }
      }
    }
  });

  // Surface Noise — the global Noise Mode/Amount and their empty-state hint were
  // removed; per-layer Blend Mode + Field Weight drive the displacement now.
  it('rasterPlane has a Noise Stack section with no Mode/Amount controls or hint', () => {
    const defs = CONTROL_DEFS.rasterPlane;
    const noiseSectionIdx = defs.findIndex(
      (d) => d.type === 'section' && d.label === 'Noise Stack'
    );
    expect(noiseSectionIdx, 'rasterPlane should have a "Noise Stack" section').toBeGreaterThanOrEqual(0);
    expect(defs.find((d) => d.type === 'sectionHint'), 'no leftover sectionHint').toBeFalsy();
    expect(findDef(defs, 'noiseMode'), 'noiseMode removed').toBeFalsy();
    expect(findDef(defs, 'noiseAmount'), 'noiseAmount removed').toBeFalsy();
    // The section still carries the noise stack control.
    const noiseList = defs.slice(noiseSectionIdx).find((d) => d.type === 'noiseList');
    expect(noiseList, 'Noise Stack section keeps the noise stack').toBeTruthy();
  });

  // UX9p2 — helix shape-dimension labels de-prefixed (mutually exclusive set).
  it('de-prefixes spiralizer mutually-exclusive shape dimension labels', () => {
    const defs = CONTROL_DEFS.spiralizer;
    const expected = {
      sphereRadius: 'Radius',
      baseRadius: 'Radius',
      coneHeight: 'Height',
      cylinderRadius: 'Radius',
      cylinderHeight: 'Height',
      capsuleRadius: 'Radius',
      capsuleHeight: 'Height',
    };
    for (const [id, label] of Object.entries(expected)) {
      const def = findDef(defs, id);
      expect(def, `spiralizer should declare ${id}`).toBeTruthy();
      expect(def.label, `${id} should be relabeled "${label}"`).toBe(label);
    }
  });

  it('keeps the co-displayed ellipsoid/torus radius pairs distinct', () => {
    const defs = CONTROL_DEFS.spiralizer;
    expect(findDef(defs, 'ellipsoidEquatorRadius').label).toBe('Equator Radius');
    expect(findDef(defs, 'ellipsoidPolarRadius').label).toBe('Polar Radius');
    expect(findDef(defs, 'torusRingRadius').label).toBe('Ring Radius');
    expect(findDef(defs, 'torusTubeRadius').label).toBe('Tube Radius');
  });

  it('de-prefixed controls remain mutually exclusive (one shape visible at a time)', () => {
    const defs = CONTROL_DEFS.spiralizer;
    const dimIds = ['sphereRadius', 'baseRadius', 'coneHeight', 'cylinderRadius', 'cylinderHeight', 'capsuleRadius', 'capsuleHeight'];
    for (const shape of ['sphere', 'cone', 'cylinder', 'capsule']) {
      const visible = dimIds
        .map((id) => findDef(defs, id))
        .filter((d) => (d.showIf ? d.showIf({ shape }) : true));
      const labels = visible.map((d) => d.label);
      expect(new Set(labels).size, `shape=${shape} visible dim labels must be unique`).toBe(labels.length);
    }
  });

  // UX6 — See-Through vocabulary unification (option label only; value unchanged).
  it('harmonizes topoform contourVisibility dashed-hidden label to See-Through', () => {
    const def = findDef(CONTROL_DEFS.topoform, 'contourVisibility');
    expect(def, 'topoform should declare contourVisibility').toBeTruthy();
    const fullContour = def.options.find((o) => o.value === 'fullContour');
    expect(fullContour, 'contourVisibility should keep the fullContour value').toBeTruthy();
    expect(fullContour.label).toBe('See-Through (dashed)');
    // The preset-breaking `value` is untouched.
    expect(fullContour.value).toBe('fullContour');
    expect(def.options.find((o) => o.value === 'visibleOnly')).toBeTruthy();
  });
});
