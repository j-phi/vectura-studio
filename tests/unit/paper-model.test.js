/*
 * Paper selector — pure layers: the catalogue (src/config/papers.js), the
 * model (src/core/paper.js) and texture synthesis (src/render/paper-texture.js).
 * One file on purpose: the shard-weights roster tolerates only a handful of
 * unweighted new files until the next weights refresh.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// ---- from the former papers-catalogue.test.js ----
{
/*
 * Paper selector — the paper catalogue (src/config/papers.js).
 *
 * Guards the data contract the renderer, the Paper panel and the Document
 * Setup Default paper row all read: every listed type exists, carries a valid
 * stock colour and in-range physical/ink parameters (texture features are
 * physical millimetres), 'none' is a plain sheet, and the realistic papers are
 * actually distinct from one another.
 */

const HEX6 = /^#[0-9a-f]{6}$/;
const UNIT_KEYS = ['tooth', 'fiberDensity', 'speckle', 'mottle', 'absorbency', 'feather', 'dryskip', 'inkOpacity', 'defaultTexture', 'defaultBleed'];

describe('PAPERS catalogue', () => {
  let runtime;
  let PAPERS;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ profile: 'feature', files: ['src/config/papers.js'] });
    PAPERS = runtime.window.Vectura.PAPERS;
  });

  afterAll(() => runtime?.cleanup?.());

  test('ORDER lists exactly the catalogue types, none first', () => {
    expect(PAPERS.ORDER[0]).toBe('none');
    expect([...PAPERS.ORDER].sort()).toEqual(Object.keys(PAPERS.TYPES).sort());
    expect(PAPERS.ORDER).toEqual(expect.arrayContaining([
      'hot-press', 'cold-press', 'rough', 'bristol-smooth', 'bristol-vellum',
      'cotton-rag', 'kraft', 'newsprint', 'black', 'tracing',
    ]));
  });

  test("'none' is a plain sheet: theme colour, no texture, no bleed", () => {
    const none = PAPERS.TYPES.none;
    expect(none.color).toBeNull();
    expect(none.defaultTexture).toBe(0);
    expect(none.defaultBleed).toBe(0);
    expect(none.tooth).toBe(0);
    expect(none.bleedMm).toBe(0);
  });

  test('every realistic type has a stock colour, labels and in-range parameters', () => {
    PAPERS.ORDER.filter((t) => t !== 'none').forEach((type) => {
      const info = PAPERS.TYPES[type];
      expect(info.color, type).toMatch(HEX6);
      expect(typeof info.label).toBe('string');
      expect(typeof info.short).toBe('string');
      expect(info.short.length).toBeLessThanOrEqual(11);
      UNIT_KEYS.forEach((key) => {
        expect(info[key], `${type}.${key}`).toBeGreaterThanOrEqual(0);
        expect(info[key], `${type}.${key}`).toBeLessThanOrEqual(1);
      });
      // Physical sizes are real-world millimetres (paper tooth ~0.3–3 mm,
      // fibres a few mm, ink spread well under a millimetre).
      expect(info.grainMm).toBeGreaterThanOrEqual(0.2);
      expect(info.grainMm).toBeLessThanOrEqual(3);
      expect(info.fiberLenMm).toBeLessThanOrEqual(5);
      expect(info.bleedMm).toBeLessThan(1);
      expect(info.defaultTexture).toBeGreaterThan(0);
    });
  });

  test('papers that should look different do: colour and surface/ink signatures are unique', () => {
    const types = PAPERS.ORDER.filter((t) => t !== 'none');
    const signature = (t) => {
      const i = PAPERS.TYPES[t];
      return [i.color, i.grainMm, i.tooth, i.fiberDensity, i.absorbency, i.bleedMm].join('|');
    };
    expect(new Set(types.map(signature)).size).toBe(types.length);
    const T = PAPERS.TYPES;
    // Physical ordering the realism depends on.
    expect(T.rough.tooth).toBeGreaterThan(T['cold-press'].tooth);
    expect(T['cold-press'].tooth).toBeGreaterThan(T['hot-press'].tooth);
    expect(T['bristol-smooth'].tooth).toBeLessThan(T['hot-press'].tooth);
    expect(T.newsprint.bleedMm).toBeGreaterThan(T['cold-press'].bleedMm);
    expect(T.newsprint.inkOpacity).toBeLessThan(T['bristol-smooth'].inkOpacity);
    expect(T.kraft.fiberDensity).toBeGreaterThan(T['hot-press'].fiberDensity);
    expect(T.tracing.absorbency).toBeLessThan(T['hot-press'].absorbency);
  });

  test('limits: large low-frequency mottle tile is longer than an A0 short side', () => {
    expect(PAPERS.LIMITS.mottlePeriodMm).toBeGreaterThan(841);
    // Incommensurate with the power-of-two grain tile periods (in mm).
    expect(Math.log2(PAPERS.LIMITS.mottlePeriodMm) % 1).not.toBe(0);
    expect(PAPERS.STORAGE_KEY).toBe('vectura.paperDefault');
  });
});
}

// ---- from the former paper-model.test.js ----
{
/*
 * Paper selector — the paper model (src/core/paper.js, window.Vectura.Paper).
 */

const FILES = [
  'src/config/machines.js',
  'src/config/defaults.js',
  'src/config/papers.js',
  'src/core/validators.js',
  'src/core/paper.js',
];

describe('Vectura.Paper model', () => {
  let runtime;
  let V;
  let Paper;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ profile: 'feature', files: FILES });
    V = runtime.window.Vectura;
    Paper = V.Paper;
  });

  afterAll(() => runtime?.cleanup?.());

  beforeEach(() => {
    V.SETTINGS.uiTheme = 'dark';
    V.SETTINGS.paper = null;
    V.SETTINGS.paperDefault = null;
    V.SETTINGS.bgColor = '#121214';
  });

  test('normalize clamps, validates and rejects unknown types', () => {
    expect(Paper.normalize({ type: 'cold-press', color: '#ABCDEF', texture: 4, bleed: -1, seed: 9.7 }))
      .toEqual({ type: 'cold-press', color: '#abcdef', texture: 1, bleed: 0, seed: 9 });
    expect(Paper.normalize({ type: 'papyrus', color: '#fff' }).type).toBe('none');
    expect(Paper.normalize({ type: 'kraft', color: '#abc' }).color).toBe('#aabbcc');
    expect(Paper.normalize({ type: 'kraft', color: '#11223344' }).color).toBe('#112233');
    expect(Paper.normalize(null)).toMatchObject({ type: 'none', texture: 0.6, bleed: 0.5, seed: 1 });
    expect(Paper.normalize({ type: 'kraft', texture: 'NaN', seed: -3 })).toMatchObject({ texture: 0.6, seed: 1 });
  });

  test('a CSS-injection colour never survives normalize (falls back to the stock colour)', () => {
    const evil = 'red; background: url(https://attacker/x)';
    const out = Paper.normalize({ type: 'kraft', color: evil });
    expect(out.color).toBe(V.PAPERS.TYPES.kraft.color);
    expect(Paper.normalize({ type: 'none', color: evil }, { fallbackColor: '#ffffff' }).color).toBe('#ffffff');
  });

  test('fromLegacyBg wraps an old background colour as a plain sheet', () => {
    expect(Paper.fromLegacyBg('#FFEEDD')).toEqual({ type: 'none', color: '#ffeedd', texture: 0.6, bleed: 0.5, seed: 1 });
  });

  test('resolveProjectPaper precedence: state.paper > legacy bgColor > user default > built-in', () => {
    const userDefault = { type: 'kraft', color: '#c39a6b', texture: 0.7, bleed: 0.5, seed: 1 };
    const projectPaper = { type: 'rough', color: '#f5f0e2', texture: 0.3, bleed: 0.2, seed: 4 };
    expect(Paper.resolveProjectPaper({ paper: projectPaper, bgColor: '#000000' }, userDefault)).toEqual(projectPaper);
    expect(Paper.resolveProjectPaper({ bgColor: '#222222' }, userDefault)).toMatchObject({ type: 'none', color: '#222222' });
    expect(Paper.resolveProjectPaper({}, userDefault)).toEqual(userDefault);
    expect(Paper.resolveProjectPaper({}, null)).toEqual({ type: 'none', color: '#121214', texture: 0.6, bleed: 0.5, seed: 1 });
    // A tampered paper colour falls back to the file's bgColor.
    expect(Paper.resolveProjectPaper({ paper: { type: 'rough', color: 'x;y' }, bgColor: '#010203' }, null).color).toBe('#010203');
  });

  test('built-in default follows the theme document colour', () => {
    V.SETTINGS.uiTheme = 'lark';
    expect(Paper.builtinDefault()).toMatchObject({ type: 'none', color: '#ffffff' });
  });

  test('forType resets colour/texture/bleed to the type and keeps the seed', () => {
    const next = Paper.forType('newsprint', { type: 'kraft', color: '#123456', texture: 0.1, bleed: 0.1, seed: 42 });
    const info = V.PAPERS.TYPES.newsprint;
    expect(next).toEqual({ type: 'newsprint', color: info.color, texture: info.defaultTexture, bleed: info.defaultBleed, seed: 42 });
  });

  test('isRealistic and inkBlendFor', () => {
    expect(Paper.isRealistic({ type: 'none', texture: 1, bleed: 1 })).toBe(false);
    expect(Paper.isRealistic({ type: 'kraft', texture: 0, bleed: 0 })).toBe(false);
    expect(Paper.isRealistic({ type: 'kraft', texture: 0.4, bleed: 0 })).toBe(true);
    expect(Paper.isRealistic(null)).toBe(false);
    // Light stock multiplies, dark stock keeps light ink on top.
    expect(Paper.inkBlendFor({ color: '#f7f2e6' })).toBe('multiply');
    expect(Paper.inkBlendFor({ color: '#1c1c1e' })).toBe('source-over');
    expect(Paper.inkBlendFor({ color: '#c39a6b' })).toBe('source-over');
  });

  test('setActive is the single writer: normalizes, mirrors bgColor, pushes history only when asked', () => {
    const calls = [];
    const app = { pushHistory: () => calls.push('history'), render: () => calls.push('render') };
    const out = Paper.setActive({ type: 'cold-press', color: '#FAFAFA', texture: 2 }, { app });
    expect(V.SETTINGS.paper).toEqual(out);
    expect(out.texture).toBe(1);
    expect(V.SETTINGS.bgColor).toBe('#fafafa');
    expect(calls).toEqual(['render']);
    Paper.setActive({ type: 'kraft' }, { app, history: true, render: false });
    expect(calls).toEqual(['render', 'history']);
  });

  test('effective() takes the colour of record from bgColor (legacy writers stay correct)', () => {
    Paper.setActive({ type: 'kraft', color: '#c39a6b' });
    V.SETTINGS.bgColor = '#000000';
    expect(Paper.effective()).toMatchObject({ type: 'kraft', color: '#000000' });
  });

  test('themeMaySync: only a plain project sheet with no user default follows the theme', () => {
    expect(Paper.themeMaySync()).toBe(true);
    Paper.setActive({ type: 'none', color: '#ffffff' });
    expect(Paper.themeMaySync()).toBe(true);
    Paper.setActive({ type: 'cold-press' });
    expect(Paper.themeMaySync()).toBe(false);
    Paper.setActive({ type: 'none', color: '#ffffff' });
    V.SETTINGS.paperDefault = Paper.fromLegacyBg('#ffffff');
    expect(Paper.themeMaySync()).toBe(false);
  });

  test('equals compares the visible paper (rounded sliders), not object identity', () => {
    expect(Paper.equals({ type: 'kraft', color: '#C39A6B', texture: 0.701, bleed: 0.5 }, { type: 'kraft', color: '#c39a6b', texture: 0.7, bleed: 0.5 })).toBe(true);
    expect(Paper.equals({ type: 'kraft', color: '#c39a6b' }, { type: 'rough', color: '#c39a6b' })).toBe(false);
    expect(Paper.equals(null, { type: 'kraft' })).toBe(false);
  });
});
}

// ---- from the former paper-texture.test.js ----
{
/*
 * Paper selector — texture synthesis (src/render/paper-texture.js).
 *
 * Fields must be seamless over the tile (periodic lattice), deterministic per
 * seed, and defined in physical millimetres: the tile resolution buckets on
 * on-screen px/mm only, never on the sheet size.
 */

const FILES = ['src/config/papers.js', 'src/core/rng.js', 'src/render/paper-texture.js'];

// Mean |Δ| between horizontally adjacent pixels, inside the tile vs across
// the wrap seam (last column → first column).
const seamStats = (f, size) => {
  let inner = 0;
  let seam = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size - 1; x += 1) inner += Math.abs(f[y * size + x + 1] - f[y * size + x]);
    seam += Math.abs(f[y * size] - f[y * size + size - 1]);
  }
  return { inner: inner / (size * (size - 1)), seam: seam / size };
};

describe('PaperTexture', () => {
  let runtime;
  let PT;
  let PAPERS;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ profile: 'feature', files: FILES });
    PT = runtime.window.Vectura.PaperTexture;
    PAPERS = runtime.window.Vectura.PAPERS;
  });

  afterAll(() => runtime?.cleanup?.());

  test('fields are seamless across the tile wrap (no edge discontinuity)', () => {
    const size = 128;
    const { height, fine } = PT.buildFields('cold-press', 3, 8, size);
    [height, fine].forEach((f) => {
      const { inner, seam } = seamStats(f, size);
      expect(inner).toBeGreaterThan(0);
      // The wrap seam is no rougher than an ordinary interior step.
      expect(seam).toBeLessThan(inner * 2.5);
    });
  });

  test('seam witness: a non-periodic field DOES show a seam (the check can fail)', () => {
    // Mutation proof for the seam check above: an ordinary (non-wrapping)
    // ramp-plus-noise field has a large seam relative to its interior steps.
    const size = 128;
    const f = new Float32Array(size * size);
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) f[y * size + x] = x / size;
    const { inner, seam } = seamStats(f, size);
    expect(seam).toBeGreaterThan(inner * 2.5);
  });

  test('fields are deterministic per seed and differ between seeds', () => {
    const a = PT.buildFields('rough', 7, 4, 64).height;
    const b = PT.buildFields('rough', 7, 4, 64).height;
    const c = PT.buildFields('rough', 8, 4, 64).height;
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
    a.forEach((v) => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); });
  });

  test('tile buckets are powers of two of on-screen px/mm, clamped', () => {
    expect(PT.bucketFor(3.1)).toBe(4);
    expect(PT.bucketFor(5.5)).toBe(4);
    expect(PT.bucketFor(6)).toBe(8);
    expect(PT.bucketFor(0.01)).toBe(PAPERS.LIMITS.minBucket);
    expect(PT.bucketFor(500)).toBe(PAPERS.LIMITS.maxBucket);
  });

  test('grain is physical: the lattice cell in mm is the same at every bucket', () => {
    // Feature size in tile px scales with the bucket, so in document mm
    // (tile px / bucket) the grain stays put as the view zooms.
    const grainMm = PAPERS.TYPES['cold-press'].grainMm;
    [1, 4, 16].forEach((bucket) => {
      const cellPx = grainMm * bucket * 1.6;
      expect(cellPx / bucket).toBeCloseTo(grainMm * 1.6, 10);
    });
    // Tile period in mm is a property of the zoom bucket only.
    expect(PT.periodMmFor(4)).toBe(PT.tileSizeFor(4) / 4);
    expect(PT.periodMmFor(16)).toBe(PT.tileSizeFor(16) / 16);
  });

  test('cache key ignores colour/texture/bleed (applied at draw time) but not type/seed/bucket', () => {
    const base = { type: 'kraft', color: '#c39a6b', texture: 0.7, bleed: 0.5, seed: 1 };
    expect(PT.cacheKey({ ...base, color: '#000000', texture: 0.1, bleed: 1 }, 4)).toBe(PT.cacheKey(base, 4));
    expect(PT.cacheKey({ ...base, seed: 2 }, 4)).not.toBe(PT.cacheKey(base, 4));
    expect(PT.cacheKey({ ...base, type: 'rough' }, 4)).not.toBe(PT.cacheKey(base, 4));
    expect(PT.cacheKey(base, 8)).not.toBe(PT.cacheKey(base, 4));
  });
});
}
