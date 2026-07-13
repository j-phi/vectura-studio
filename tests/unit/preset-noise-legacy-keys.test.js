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
 * The bundler ignores a flat key when comparing IF every `imageEffects` entry already
 * defines it — because `getParam()` (src/core/noise-rack.js) checks the effect first and
 * only falls back to the flat copy, so a shadowed one is unreachable.
 *
 * THE DANGEROUS HALF, and what this file guards hardest: that argument holds ONLY for the
 * keys `getParam` reads. A noise entry also carries SOURCE / IDENTITY keys with the same
 * `image*` spelling — `imageId`, `imageWidth`, `imageHeight`, `imageInvertColor`,
 * `imageInvertOpacity`, `imageAlgo`, `imageName`, `imagePreview` — which are read DIRECTLY
 * off the entry, never through `getParam` (`noiseDef?.imageId` resolves the raster,
 * noise-rack.js:61; `noiseLayer.imageWidth/Height` scale it, rainfall.js:252). "The effect
 * wins" is simply false of those. A rule keyed on the SPELLING (`/^image/`) would strip a
 * flat `imageId` the moment any effect carried one, and the noise layer would render blank.
 *
 * So the allowlist is derived from the code, and these tests pin that boundary from both
 * sides: the adjustment keys may be ignored, the source keys never may.
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

  /*
   * THE DANGEROUS HALF — exercise the RULE, not its output.
   *
   * These call scripts/lib/noise-canonical.js directly. Asserting on the generated bundle
   * instead would prove nothing: the bundle looks identical whether the rule is keyed on an
   * allowlist or on a /^image/ regex, because no preset happens to carry an effect with an
   * `imageId` today. "Safe by luck" and "safe by construction" are indistinguishable from
   * the output — you can only tell them apart by feeding the rule the case that breaks.
   */
  const { withoutShadowedLegacyKeys, GETPARAM_READ_KEYS } = require('../../scripts/lib/noise-canonical');

  const entryWith = (extra, effect) => ({
    id: 'noise-1', type: 'image', imageId: 'img-123', imageWidth: 4, imageHeight: 2,
    imageAlgo: 'luma', ...extra,
    imageEffects: [{ id: 'effect-1', enabled: true, mode: 'luma', ...effect }],
  });

  test('a SHADOWED adjustment key is dropped (the whole point of the rule)', () => {
    const out = withoutShadowedLegacyKeys(
      entryWith({ imageBrightness: 0, imageGamma: 1 }, { imageBrightness: 0, imageGamma: 1 }),
    );
    expect(out.imageBrightness, 'the effect defines it, so the flat copy is unreachable').toBeUndefined();
    expect(out.imageGamma).toBeUndefined();
  });

  test('an adjustment key the effect does NOT define is kept — getParam would fall back to it', () => {
    const out = withoutShadowedLegacyKeys(entryWith({ imageBrightness: 0.5 }, {}));
    expect(out.imageBrightness, 'no effect defines it, so the flat copy is the live value').toBe(0.5);
  });

  test('an image SOURCE key is NEVER dropped, even when an effect carries one', () => {
    // THE case a /^image/ rule gets wrong. imageId is read straight off the entry
    // (noise-rack.js:61 `noiseDef?.imageId` -> resolves the raster), never via getParam, so
    // an effect carrying an imageId does NOT shadow it. Strip it and the layer renders blank.
    const out = withoutShadowedLegacyKeys(
      entryWith({}, { imageId: 'img-123', imageWidth: 4, imageHeight: 2, imageAlgo: 'luma' }),
    );
    expect(out.imageId, 'imageId is the noise layer\'s image SOURCE — dropping it renders nothing').toBe('img-123');
    expect(out.imageWidth).toBe(4);
    expect(out.imageHeight).toBe(2);
    expect(out.imageAlgo).toBe('luma');
    ['imageId', 'imageWidth', 'imageHeight', 'imageAlgo', 'imageInvertColor', 'imageName', 'imagePreview']
      .forEach((k) => expect(GETPARAM_READ_KEYS.has(k), `${k} must not be treated as shadowable`).toBe(false));
  });

  test('an entry with no imageEffects is untouched — resolveEffects() builds its effect FROM it', () => {
    const flat = { id: 'noise-1', type: 'image', imageId: 'img-9', imageBrightness: 0.3 };
    expect(withoutShadowedLegacyKeys(flat)).toEqual(flat);
  });

  test('the allowlist matches what noise-rack.js actually reads via getParam', () => {
    // The allowlist is a hand-copied mirror of the code. If someone adds a getParam key to
    // noise-rack.js and forgets the mirror, the rule silently stops ignoring it (harmless),
    // but if they REMOVE one, the rule keeps stripping a key that is now read directly
    // (not harmless). Pin them together.
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../../src/core/noise-rack.js'), 'utf8',
    );
    const readByGetParam = new Set(
      (src.match(/getParam\(effect, '([a-zA-Z]+)'/g) || [])
        .map((m) => m.replace(/getParam\(effect, '/, '').replace(/'$/, '')),
    );
    expect([...GETPARAM_READ_KEYS].sort()).toEqual([...readByGetParam].sort());
  });

  test('presets that carry a real image SOURCE keep it — flowfield and grid', () => {
    ['flowfield', 'grid'].forEach((type) => {
      const engine = new V.VectorEngine({ width: 800, height: 600 });
      const id = engine.addLayer(type);
      const entry = engine.getLayerById(id).params.noises?.[0];
      engine.removeLayer(id);
      expect(entry, `${type} must still have a noise entry`).toBeTruthy();
      expect(flatImageKeys(entry), `${type} lost its image source keys`).toEqual(
        expect.arrayContaining(['imageId', 'imageWidth', 'imageHeight', 'imageAlgo']),
      );
    });
  });

  test('a real noise curation is still preserved (rasterPlane adds a source layer)', () => {
    // The rule must not overreach: rasterPlane's default is `noises: []` and its factory
    // preset genuinely ADDS an entry. That is a curation and has to survive.
    const preset = factoryPresetOf('rasterPlane');
    expect(preset.params.noises, 'rasterPlane\'s curated noise stack must survive').toBeTruthy();
    expect(preset.params.noises.length).toBeGreaterThan(0);
    expect(V.ALGO_DEFAULTS.rasterPlane.noises.length).toBe(0);
  });
});
