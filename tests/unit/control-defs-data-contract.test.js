/*
 * Compile gate for src/ui/panels/control-defs-data.js (Meridian Unit 1.5).
 *
 * Phase 1B of the deferred cleanup chain drains the wave/noise option
 * tables and algorithm-specific NOISE_DEFS out of _ui-legacy.js into a
 * dedicated control-defs-data satellite that publishes them on
 *   window.Vectura.UI.ControlDefsData
 *
 * This suite asserts the migration contract:
 *   - the new file loads in isolation (no `_ui-legacy.js`, no UI bootstrap)
 *   - the namespace is populated with every symbol that the algo-config-panel
 *     DI bag, the noise-rack-panel, and info-modals previously consumed
 *   - byte-for-byte contracts on a few representative tables (so a future
 *     refactor that silently mutates the values fails loudly here)
 *   - the NOISE_DEFS-derived contract is preserved via a re-publish into
 *     window.Vectura._UINoiseDefs for legacy consumers that still read from
 *     the old namespace (noise-rack-panel.js).
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

describe('control-defs-data compile gate (Meridian Unit 1.5)', () => {
  let dom;
  let ControlDefsData;
  let UINoiseDefs;

  beforeAll(() => {
    // defaults.js seeds window.Vectura.ALGO_DEFAULTS so the petal-designer
    // default counts (which clamp against ALGO_DEFAULTS.petalisDesigner)
    // resolve to real numbers. control-defs-data.js loads after.
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/ui/panels/control-defs-data.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    ControlDefsData = w.Vectura.UI.ControlDefsData;
    UINoiseDefs = w.Vectura._UINoiseDefs;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.ControlDefsData', () => {
    expect(ControlDefsData).toBeTruthy();
    expect(typeof ControlDefsData).toBe('object');
  });

  it('publishes the wave/noise option tables', () => {
    expect(Array.isArray(ControlDefsData.WAVE_NOISE_OPTIONS)).toBe(true);
    expect(ControlDefsData.WAVE_NOISE_OPTIONS.length).toBe(32);
    expect(ControlDefsData.WAVE_NOISE_OPTIONS[0]).toEqual({ value: 'billow', label: 'Billow' });

    expect(typeof ControlDefsData.WAVE_NOISE_DESCRIPTIONS).toBe('object');
    expect(Object.keys(ControlDefsData.WAVE_NOISE_DESCRIPTIONS).length).toBe(32);
    expect(ControlDefsData.WAVE_NOISE_DESCRIPTIONS.perlin).toBe('Classic Perlin gradient noise.');

    expect(Array.isArray(ControlDefsData.IMAGE_NOISE_STYLE_OPTIONS)).toBe(true);
    expect(ControlDefsData.IMAGE_NOISE_STYLE_OPTIONS.length).toBe(4);

    expect(ControlDefsData.WAVE_CELL_TYPES).toEqual(['cellular', 'voronoi', 'crackle']);
    expect(ControlDefsData.WAVE_STEP_TYPES).toEqual(['steps', 'facet']);
    expect(ControlDefsData.WAVE_WARP_TYPES).toEqual(['warp', 'domain']);
    expect(ControlDefsData.WAVE_SEEDED_TYPES).toEqual(['steps', 'value', 'perlin', 'facet']);

    expect(Array.isArray(ControlDefsData.WAVE_NOISE_BLEND_OPTIONS)).toBe(true);
    expect(ControlDefsData.WAVE_NOISE_BLEND_OPTIONS.length).toBe(7);

    expect(Array.isArray(ControlDefsData.IMAGE_EFFECT_OPTIONS)).toBe(true);
    expect(ControlDefsData.IMAGE_EFFECT_OPTIONS.length).toBe(21);

    expect(Array.isArray(ControlDefsData.IMAGE_EFFECT_DEFS)).toBe(true);
    expect(ControlDefsData.IMAGE_EFFECT_DEFS[0]).toMatchObject({
      key: 'mode',
      label: 'Effect Mode',
      type: 'select',
      infoKey: 'wavetable.imageAlgo',
    });

    expect(Array.isArray(ControlDefsData.WAVE_TILE_OPTIONS)).toBe(true);
    expect(ControlDefsData.WAVE_TILE_OPTIONS.length).toBe(11);

    expect(ControlDefsData.IMAGE_NOISE_DEFAULT_AMPLITUDE).toBe(1.7);

    expect(Array.isArray(ControlDefsData.WAVE_PATTERN_TYPES)).toBe(true);
    expect(ControlDefsData.WAVE_PATTERN_TYPES).toContain('stripes');
    expect(ControlDefsData.WAVE_PATTERN_TYPES.length).toBe(14);
  });

  it('publishes the algorithm-specific NOISE_DEFS', () => {
    expect(Array.isArray(ControlDefsData.WAVE_NOISE_DEFS)).toBe(true);
    expect(ControlDefsData.WAVE_NOISE_DEFS.length).toBeGreaterThan(20);
    // First def must be the noise-type selector with the full option list.
    expect(ControlDefsData.WAVE_NOISE_DEFS[0].key).toBe('type');
    expect(ControlDefsData.WAVE_NOISE_DEFS[0].options).toBe(ControlDefsData.WAVE_NOISE_OPTIONS);

    expect(Array.isArray(ControlDefsData.RINGS_NOISE_DEFS)).toBe(true);
    expect(Array.isArray(ControlDefsData.TOPO_NOISE_DEFS)).toBe(true);
    expect(Array.isArray(ControlDefsData.FLOWFIELD_NOISE_DEFS)).toBe(true);
    expect(Array.isArray(ControlDefsData.GRID_NOISE_DEFS)).toBe(true);
    expect(Array.isArray(ControlDefsData.PHYLLA_NOISE_DEFS)).toBe(true);
    expect(Array.isArray(ControlDefsData.PETALIS_DRIFT_NOISE_DEFS)).toBe(true);

    expect(typeof ControlDefsData.cloneNoiseDef).toBe('function');
    // cloneNoiseDef should produce a structural copy with overrides applied.
    const cloned = ControlDefsData.cloneNoiseDef(
      { key: 'amplitude', label: 'A', min: 0, max: 1, options: [{ value: 'a' }] },
      { label: 'B' },
    );
    expect(cloned).toMatchObject({ key: 'amplitude', label: 'B', min: 0, max: 1 });
    expect(Array.isArray(cloned.options)).toBe(true);
  });

  it('Field Weight caps at max 4 across the contrast-stretch noise stacks', () => {
    // Field Weight (the per-layer amplitude control) is labelled identically and
    // shares a -2..4 range across the stacks where it contrast-stretches a [0,1]
    // field. Raster-plane is the deliberate exception (covered below): its base
    // Field Weight scales the 3D relief amplitude, so it gets a far wider range.
    const stacks = {
      TOPO_NOISE_DEFS: ControlDefsData.TOPO_NOISE_DEFS,
      FLOWFIELD_NOISE_DEFS: ControlDefsData.FLOWFIELD_NOISE_DEFS,
      GRID_NOISE_DEFS: ControlDefsData.GRID_NOISE_DEFS,
      PHYLLA_NOISE_DEFS: ControlDefsData.PHYLLA_NOISE_DEFS,
    };
    for (const [name, defs] of Object.entries(stacks)) {
      const fw = defs.find((d) => d.label === 'Field Weight');
      expect(fw, `${name} exposes a Field Weight control`).toBeTruthy();
      expect(fw.max, `${name} Field Weight max`).toBe(4);
      expect(fw.min, `${name} Field Weight min`).toBe(-2);
    }
  });

  it('Raster-Plane Field Weight gets a wide relief-amplitude range (dial-up exception)', () => {
    // The raster-plane base Field Weight scales the whole 3D relief amplitude
    // (see baseReliefWeight in raster-plane.js) rather than contrast-stretching a
    // normalized field, so it intentionally exceeds the shared -2..4 cap.
    const fw = ControlDefsData.RASTER_PLANE_NOISE_DEFS.find((d) => d.label === 'Field Weight');
    expect(fw).toBeTruthy();
    expect(fw.max).toBe(25);
    expect(fw.min).toBe(-10);
  });

  it('publishes the Petalis registry tables and factories', () => {
    expect(Array.isArray(ControlDefsData.PETALIS_MODIFIER_TYPES)).toBe(true);
    expect(ControlDefsData.PETALIS_MODIFIER_TYPES.length).toBe(7);
    expect(Array.isArray(ControlDefsData.PETALIS_PETAL_MODIFIER_TYPES)).toBe(true);
    expect(ControlDefsData.PETALIS_PETAL_MODIFIER_TYPES.length).toBe(6);
    expect(Array.isArray(ControlDefsData.PETALIS_SHADING_TYPES)).toBe(true);
    expect(ControlDefsData.PETALIS_SHADING_TYPES.length).toBe(12);
    expect(Array.isArray(ControlDefsData.PETALIS_LINE_TYPES)).toBe(true);
    expect(ControlDefsData.PETALIS_LINE_TYPES.length).toBe(4);

    expect(typeof ControlDefsData.createPetalisModifier).toBe('function');
    expect(typeof ControlDefsData.createPetalModifier).toBe('function');
    expect(typeof ControlDefsData.createPetalisShading).toBe('function');

    const m = ControlDefsData.createPetalisModifier('twist');
    expect(m.type).toBe('twist');
    expect(m.enabled).toBe(true);

    const p = ControlDefsData.createPetalModifier('shear');
    expect(p.type).toBe('shear');
    expect(p.target).toBe('both');

    const s = ControlDefsData.createPetalisShading('parallel');
    expect(s.type).toBe('parallel');
    expect(s.lineType).toBe('solid');
  });

  it('publishes the petal-designer constants', () => {
    expect(Array.isArray(ControlDefsData.PETAL_DESIGNER_TARGET_OPTIONS)).toBe(true);
    expect(ControlDefsData.PETAL_DESIGNER_TARGET_OPTIONS.length).toBe(3);
    expect(ControlDefsData.PETAL_DESIGNER_PROFILE_DIRECTORY).toBe('./src/config/petal-profiles/');
    expect(ControlDefsData.PETAL_DESIGNER_PROFILE_TYPE).toBe('vectura-petal-profile');
    expect(ControlDefsData.PETAL_DESIGNER_PROFILE_VERSION).toBe(1);
    expect(ControlDefsData.PETAL_DESIGNER_PROFILE_BUNDLE_KEY).toBe('PETAL_PROFILE_LIBRARY');
    expect(ControlDefsData.PETAL_DESIGNER_WIDTH_MATCH_BASELINE).toBe(0.85);
    expect(Number.isFinite(ControlDefsData.PETALIS_DESIGNER_DEFAULT_INNER_COUNT)).toBe(true);
    expect(Number.isFinite(ControlDefsData.PETALIS_DESIGNER_DEFAULT_OUTER_COUNT)).toBe(true);
    expect(Number.isFinite(ControlDefsData.PETALIS_DESIGNER_DEFAULT_COUNT)).toBe(true);
    expect(Array.isArray(ControlDefsData.PETALIS_DESIGNER_VIEW_STYLE_OPTIONS)).toBe(true);
    expect(ControlDefsData.PETALIS_DESIGNER_VIEW_STYLE_OPTIONS.length).toBe(2);
    expect(Array.isArray(ControlDefsData.PETALIS_DESIGNER_RANDOMNESS_DEFS)).toBe(true);
    expect(ControlDefsData.PETALIS_DESIGNER_RANDOMNESS_DEFS.length).toBe(9);
  });

  it('republishes the noise-rack consumer namespace at window.Vectura._UINoiseDefs', () => {
    // noise-rack-panel.js reads from this namespace at runtime (see Unit 1.5
    // recon notes). control-defs-data.js must seed the namespace with the
    // NOISE_DEFS-related keys (COMMON_CONTROLS is still legacy-owned and
    // will be merged in by the legacy bootstrap).
    expect(UINoiseDefs).toBeTruthy();
    expect(UINoiseDefs.WAVE_NOISE_DEFS).toBe(ControlDefsData.WAVE_NOISE_DEFS);
    expect(UINoiseDefs.RINGS_NOISE_DEFS).toBe(ControlDefsData.RINGS_NOISE_DEFS);
    expect(UINoiseDefs.TOPO_NOISE_DEFS).toBe(ControlDefsData.TOPO_NOISE_DEFS);
    expect(UINoiseDefs.FLOWFIELD_NOISE_DEFS).toBe(ControlDefsData.FLOWFIELD_NOISE_DEFS);
    expect(UINoiseDefs.GRID_NOISE_DEFS).toBe(ControlDefsData.GRID_NOISE_DEFS);
    expect(UINoiseDefs.PHYLLA_NOISE_DEFS).toBe(ControlDefsData.PHYLLA_NOISE_DEFS);
    expect(UINoiseDefs.PETALIS_DRIFT_NOISE_DEFS).toBe(ControlDefsData.PETALIS_DRIFT_NOISE_DEFS);
    expect(UINoiseDefs.IMAGE_EFFECT_DEFS).toBe(ControlDefsData.IMAGE_EFFECT_DEFS);
  });
});
