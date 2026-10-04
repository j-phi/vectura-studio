/**
 * Vectura Studio — Scene 3D fill controls (fill-style review U6).
 *
 * One table for the artistic controls added in U6. Ranges, steps and defaults
 * live here, so the Object 3D Style tab, the Scene Style editor, the style
 * normalizer and the engine all read the same numbers.
 *
 * Every default below reproduces the output that shipped before the control
 * existed. The engine never reads a default from this table when the key is
 * ABSENT from the style: an absent key keeps the engine's own literal. That
 * keeps every saved document byte-identical.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});

  const NUM = (min, max, step, dflt) => ({ kind: 'number', min, max, step, default: dflt });

  // key -> descriptor. `group` places the control in the Style tab.
  const CONTROLS = {
    // Tone pipeline (one point, every Fill Style).
    toneGamma: { ...NUM(0.4, 2.5, 0.05, 1), group: 'tone', label: 'Gamma', help: 'Bends the mid-tones before any Fill Style reads them. Above 1 darkens (more ink); below 1 lightens. 1 = unchanged.' },
    toneContrast: { ...NUM(-1, 1, 0.05, 0), group: 'tone', label: 'Contrast', help: 'Steepens (positive) or flattens (negative) the tone curve about mid-grey. The lightest and darkest tones stay put. 0 = unchanged.' },
    // Depth fade (same point).
    depthFade: { kind: 'bool', default: false, group: 'depth', label: 'Fade by depth' },
    depthFadeStrength: { ...NUM(0, 1, 0.05, 0.6), group: 'depth', label: 'Fade strength', help: 'How much the farthest surfaces lighten. 1 fades them to bare paper.' },
    depthFadeNear: { ...NUM(0, 1, 0.05, 0), group: 'depth', label: 'Fade starts', help: 'How far into the scene depth the fade begins. 0 = at the nearest surface.' },
    depthFadeFar: { ...NUM(0, 1, 0.05, 1), group: 'depth', label: 'Fade full', help: 'How far into the scene depth the fade reaches full strength. 1 = at the farthest surface.' },
    // Wave family.
    waveLength: { ...NUM(4, 20, 0.1, 7.3), group: 'wave', label: 'Wavelength', help: 'Length of one wave, in pen widths. Short = tight ripple. Long = lazy swell.' },
    waveCrest: {
      kind: 'enum', default: 'auto', group: 'wave', label: 'Crest phase',
      options: [
        { value: 'auto', label: 'From Phase' },
        { value: 'in', label: 'Aligned' },
        { value: 'anti', label: 'Alternating' },
        { value: 'jit', label: 'Alternating + jitter' },
        { value: 'walk', label: 'Drifting' },
      ],
    },
    // Calligraphic nib.
    nibAngleDeg: { ...NUM(0, 180, 1, 45), group: 'nib', label: 'Nib angle', help: 'Angle of the broad nib on the page. 45 is foundational; 30 is italic.' },
    nibContrast: { ...NUM(0, 0.9, 0.01, 0.65), group: 'nib', label: 'Nib contrast', help: 'How much thinner the stroke gets when it runs along the nib edge. 0 = even width.' },
    // Width ribbon taper.
    taperLength: { ...NUM(0, 15, 0.1, 3.5), group: 'taper', label: 'Taper length', help: 'How far in from each end the stroke narrows, in mm. 0 = no taper.' },
    taperTipWidth: { ...NUM(0, 1, 0.01, 0.42), group: 'taper', label: 'Tip width', help: 'Width at the very end of a tapered stroke, as a share of its full width.' },
    taperSoftness: { ...NUM(0, 0.25, 0.01, 0.09), group: 'taper', label: 'Softness', help: 'Highlight softness: how gently the lightest strokes thin out. Low = a hard knee. High = a long, soft fade.' },
    // Turing stripe (stripeAlign is the U4b key, kept for grouping).
    stripeAlign: { ...NUM(0, 1.2, 0.05, 0), group: 'turing', label: 'Stripe align', aria: 'Stripe alignment', help: 'Combs the stripes along the form instead of a random labyrinth. 0 = off.' },
    patternMaturity: { ...NUM(40, 400, 10, 170), group: 'turing', label: 'Maturity', help: 'How long the pattern relaxes. Low = young, broken stripes. High = settled stripes.' },
    stripeScale: { ...NUM(0.5, 3, 0.05, 1), group: 'turing', label: 'Stripe scale', help: 'Stripe wavelength multiplier. Below 1 = finer stripes. Above 1 = broader stripes.' },
    // Mark chaining (maze).
    chainMarks: { kind: 'bool', default: false, group: 'chain', label: 'Chain marks' },
    // Tone tier -> real pen.
    tierPens: { kind: 'pens', default: null, group: 'pens', label: 'Tiers to pens' },
    // U7: split ANY Fill Style's output into N tone bands (0 = off). Band k draws with tierPens[k].
    toneBands: { ...NUM(0, 4, 1, 0), group: 'pens', label: 'Tone bands', help: 'Splits the drawing into 2 to 4 tone bands, light to dark, and draws each band with its own pen.' },
  };

  // Engine-side tone curve constants.
  const TONE_PIVOT = 0.5;
  // Maze chaining joins endpoints that sit this close (mm). Smaller than a pen.
  const CHAIN_JOIN_MM = 0.01;
  // Highest wave sample count a short wavelength may ask for.
  const WAVE_MAX_STEPS = 900;
  // Keys the engine clamps by range.
  const NUMERIC_KEYS = Object.keys(CONTROLS).filter((k) => CONTROLS[k].kind === 'number');

  const clampNum = (key, value) => {
    const d = CONTROLS[key];
    const n = Number(value);
    if (!d || !Number.isFinite(n)) return undefined;
    return Math.min(d.max, Math.max(d.min, n));
  };

  // The clamped value, or undefined when the key is absent or not a number.
  // `undefined` means "use the engine literal", which is today's output.
  const read = (bag, key) => {
    if (!bag || typeof bag !== 'object' || bag[key] === undefined || bag[key] === null) return undefined;
    return clampNum(key, bag[key]);
  };

  // Clamp one style value. Returns undefined for a key this table does not own.
  const clampStyle = (key, value) => {
    const d = CONTROLS[key];
    if (!d) return undefined;
    if (d.kind === 'number') return clampNum(key, value);
    if (d.kind === 'bool') return value === true;
    if (d.kind === 'enum') return d.options.some((o) => o.value === value) ? value : d.default;
    if (d.kind === 'pens') {
      if (!Array.isArray(value)) return null;
      const ids = value.slice(0, 8).map((v) => (typeof v === 'string' && v ? v : null));
      return ids.some((v) => v) ? ids : null;
    }
    return undefined;
  };

  Vectura.SCENE_FILL_CONTROLS = {
    CONTROLS, NUMERIC_KEYS, TONE_PIVOT, CHAIN_JOIN_MM, WAVE_MAX_STEPS, read, clampStyle,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Vectura.SCENE_FILL_CONTROLS;
  }
})();
