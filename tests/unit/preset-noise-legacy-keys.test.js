/*
 * A factory preset must not keep `noises` alive as an "override" purely because its
 * noise entry is a stale SCHEMA.
 *
 * Image adjustments used to live flat on a noise entry (`imageBrightness`, `imageGamma`,
 * …); they now live inside `imageEffects`. Old app-saved dumps carry both, so a preset's
 * noise entry is a strict superset of the current default's — behaviourally identical,
 * unequal to a deep-compare. That was enough to make terrain's `noises` survive the
 * bundler's "carry only what you override" pass, which in turn meant
 * `ALGO_DEFAULTS.terrain.noises` was DEAD CONFIG: editing it could not reach the app.
 * That is the same trap that hid a stale Occlusion Bias, in miniature.
 *
 * The bundler now ignores a flat key when comparing IF every `imageEffects` entry already
 * defines it — because `getParam()` (src/core/noise-rack.js) checks the effect first and
 * only falls back to the flat key, so a shadowed copy is unreachable and dropping it
 * cannot change what renders.
 *
 * The dangerous half is the converse, and it is what this file guards hardest: when a
 * noise entry has NO `imageEffects`, `resolveEffects()` synthesises an effect FROM the
 * flat entry. There those keys are LOAD-BEARING — flowfield, grid and svgDistort ship
 * exactly that shape. A blanket "strip legacy keys" would silently gut them.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Preset noise entries — stale schema must not masquerade as a curation', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });
  afterAll(() => runtime.cleanup());

  const factoryPresetOf = (type) =>
    (V.PRESETS || []).find((p) => p.id === `${type.toLowerCase()}-default` && p.preset_system === type);

  const flatImageKeys = (entry) =>
    Object.keys(entry || {}).filter((k) => /^image/.test(k) && k !== 'imageEffects');

  test('ALGO_DEFAULTS.terrain.noises is LIVE — the factory preset no longer shadows it', () => {
    const preset = factoryPresetOf('terrain');
    expect(preset, 'terrain must have a factory preset').toBeTruthy();
    expect(
      Object.keys(preset.params).includes('noises'),
      'terrain\'s factory preset still pins `noises`, so ALGO_DEFAULTS.terrain.noises is dead config',
    ).toBe(false);

    // Prove it, rather than inferring it from the absence of a key: mutate the default
    // and require a brand-new layer to see it.
    const engine = new V.VectorEngine({ width: 800, height: 600 });
    const freshZoom = () => {
      const id = engine.addLayer('terrain');
      const zoom = engine.getLayerById(id).params.noises[0].zoom;
      engine.removeLayer(id);
      return zoom;
    };
    const original = V.ALGO_DEFAULTS.terrain.noises[0].zoom;
    try {
      V.ALGO_DEFAULTS.terrain.noises[0].zoom = 0.0777;
      expect(freshZoom(), 'editing ALGO_DEFAULTS must reach a new layer').toBe(0.0777);
    } finally {
      V.ALGO_DEFAULTS.terrain.noises[0].zoom = original;
    }
  });

  test('no factory preset keeps a noise entry that only differs by SHADOWED legacy keys', () => {
    const offenders = [];
    Object.keys(V.ALGO_DEFAULTS).forEach((type) => {
      const preset = factoryPresetOf(type);
      const pinned = preset && preset.params && preset.params.noises;
      if (!Array.isArray(pinned) || !pinned.length) return;
      const defaults = (V.ALGO_DEFAULTS[type] || {}).noises;
      if (!Array.isArray(defaults) || pinned.length !== defaults.length) return; // a real curation

      const shadowedOnly = pinned.every((entry, i) => {
        const fx = entry.imageEffects;
        if (!Array.isArray(fx) || !fx.length) return false;
        const strip = (e) => {
          const out = {};
          Object.keys(e).forEach((k) => {
            const shadowed = /^image/.test(k) && k !== 'imageEffects'
              && (e.imageEffects || []).every((f) => f && k in f);
            if (!shadowed) out[k] = e[k];
          });
          return out;
        };
        const sorted = (o) => Object.keys(o).sort().reduce((acc, k) => { acc[k] = o[k]; return acc; }, {});
        return JSON.stringify(sorted(strip(entry))) === JSON.stringify(sorted(strip(defaults[i] || {})));
      });
      if (shadowedOnly) offenders.push(type);
    });
    expect(
      offenders,
      `these factory presets pin \`noises\` that is identical to ALGO_DEFAULTS once stale ` +
      `schema is ignored — so ALGO_DEFAULTS is dead for them: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  // THE DANGEROUS HALF. Without imageEffects, resolveEffects() builds the effect FROM the
  // flat entry, so these keys decide what renders. A blanket strip would delete them.
  test.each(['flowfield', 'grid'])(
    '%s keeps its flat legacy image keys — with no imageEffects they are LOAD-BEARING',
    (type) => {
      const engine = new V.VectorEngine({ width: 800, height: 600 });
      const id = engine.addLayer(type);
      const entry = engine.getLayerById(id).params.noises?.[0];
      engine.removeLayer(id);
      if (!entry) return;
      if (Array.isArray(entry.imageEffects) && entry.imageEffects.length) return; // shape changed; rule N/A
      expect(
        flatImageKeys(entry).length,
        `${type}'s noise entry has no imageEffects, so its flat image* keys are the only ` +
        'source for the synthesised effect — they must not be stripped',
      ).toBeGreaterThan(0);
    },
  );

  test('a real noise curation is still preserved (rasterPlane adds a source layer)', () => {
    // The rule must not overreach: rasterPlane's default is `noises: []` and its factory
    // preset genuinely ADDS an entry. That is a curation and has to survive.
    const preset = factoryPresetOf('rasterPlane');
    expect(preset.params.noises, 'rasterPlane\'s curated noise stack must survive').toBeTruthy();
    expect(preset.params.noises.length).toBeGreaterThan(0);
    expect(V.ALGO_DEFAULTS.rasterPlane.noises.length).toBe(0);
  });
});
