/**
 * Canonicalising a noise entry for COMPARISON (used by scripts/build-user-presets.js).
 *
 * Image adjustments used to live flat on a noise entry; they now live inside its
 * `imageEffects`. Old app-saved dumps carry BOTH, so a preset's noise entry can be a
 * strict superset of the current default's — identical in behaviour, unequal to a
 * deep-compare. That is enough to keep `noises` looking like a deliberate override, and
 * a key listed as an override is a key `defaults.js` no longer controls.
 *
 * This CANNOT be "any key starting with image". Two families of flat key share that
 * spelling and only one is shadowable:
 *
 *   ADJUSTMENT keys — read ONLY through `getParam(effect, key, …)` in
 *   src/core/noise-rack.js, which checks the effect first and falls back to the flat
 *   copy. If every effect defines the key, the flat copy is unreachable.
 *
 *   SOURCE / IDENTITY keys — `imageId`, `imageWidth`, `imageHeight`, `imageInvertColor`,
 *   `imageInvertOpacity`, `imageAlgo`, `imageName`, `imagePreview` — read DIRECTLY off the
 *   entry, never through `getParam`: `noiseDef?.imageId` resolves the raster
 *   (noise-rack.js:61), `noiseLayer.imageWidth/Height` scale it (rainfall.js:252).
 *   "The effect wins" is simply false of these. A rule keyed on spelling would strip a
 *   flat `imageId` the moment any effect carried one, and the layer would render blank.
 *
 * So the allowlist is derived from what the code READS, not from what the key is called.
 *
 * Lives in its own module so the rule can be exercised by a test directly. A rule that
 * can only be tested through its side effects on a generated file is a rule nobody checks.
 */

// Exactly the keys src/core/noise-rack.js reads via getParam(effect, …).
// Keep in sync with that file — tests/unit/preset-noise-legacy-keys.test.js re-derives
// this list from noise-rack.js itself and fails if the two drift apart.
const GETPARAM_READ_KEYS = new Set([
  'imageBandCenter', 'imageBandWidth', 'imageBlur', 'imageBlurRadius', 'imageBlurStrength',
  'imageBrightness', 'imageContrast', 'imageCurveStrength', 'imageDither', 'imageEdgeBlur',
  'imageEmbossStrength', 'imageGamma', 'imageHighpassRadius', 'imageHighpassStrength',
  'imageLevelsHigh', 'imageLevelsLow', 'imageLowpassRadius', 'imageLowpassStrength',
  'imageMedianRadius', 'imagePixelate', 'imagePosterize', 'imageSharpenAmount',
  'imageSharpenRadius', 'imageSolarize', 'imageThreshold', 'imageVignetteRadius',
  'imageVignetteStrength',
]);

/**
 * Drop the flat adjustment keys that every effect already defines (so `getParam` can
 * never reach them). Everything else — including every source/identity key — survives.
 * An entry with no `imageEffects` is returned untouched: `resolveEffects()` synthesises
 * its effect FROM the flat entry, so nothing there is shadowed.
 */
const withoutShadowedLegacyKeys = (entry) => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
  const effects = entry.imageEffects;
  if (!Array.isArray(effects) || !effects.length) return entry;
  const out = {};
  for (const key of Object.keys(entry)) {
    const shadowed = GETPARAM_READ_KEYS.has(key)
      && effects.every((fx) => fx && typeof fx === 'object' && key in fx);
    if (!shadowed) out[key] = entry[key];
  }
  return out;
};

module.exports = { GETPARAM_READ_KEYS, withoutShadowedLegacyKeys };
