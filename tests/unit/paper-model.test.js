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

  test('limits: chunks stay screen-sharp to extreme zoom and the cache is capped in bytes', () => {
    expect(PAPERS.LIMITS.maxBucket).toBeGreaterThanOrEqual(128);
    expect(PAPERS.LIMITS.cacheBytes).toBeLessThanOrEqual(64 * 1024 * 1024);
    expect(PAPERS.LIMITS.chunkPx).toBeGreaterThanOrEqual(128);
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

  test('normalize clamps, validates, keeps future types and rejects unsafe ones', () => {
    expect(Paper.normalize({ type: 'cold-press', color: '#ABCDEF', texture: 4, bleed: -1, seed: 9.7 }))
      .toEqual({ type: 'cold-press', color: '#abcdef', texture: 1, bleed: 0, seed: 9 });
    // A type from a newer build is kept verbatim (renders as a plain sheet);
    // anything that isn't a safe identifier is rejected.
    expect(Paper.normalize({ type: 'papyrus', color: '#fff' }).type).toBe('papyrus');
    expect(Paper.isRealistic({ type: 'papyrus', texture: 1, bleed: 1 })).toBe(false);
    expect(Paper.isKnownType('papyrus')).toBe(false);
    expect(Paper.normalize({ type: '<img src=x>', color: '#fff' }).type).toBe('none');
    expect(Paper.normalize({ type: 'constructor' }).color).toBe('#121214');
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

  test('themeMaySync: only a plain sheet still in the previous theme colour, with no user default, follows the theme', () => {
    expect(Paper.themeMaySync('#121214')).toBe(true);
    Paper.setActive({ type: 'none', color: '#121214' });
    expect(Paper.themeMaySync('#121214')).toBe(true);
    // A custom plain colour is the user's choice: never overwritten.
    Paper.setActive({ type: 'none', color: '#ff0000' });
    expect(Paper.themeMaySync('#121214')).toBe(false);
    Paper.setActive({ type: 'cold-press' });
    expect(Paper.themeMaySync('#121214')).toBe(false);
    Paper.setActive({ type: 'none', color: '#121214' });
    V.SETTINGS.paperDefault = Paper.fromLegacyBg('#ffffff');
    expect(Paper.themeMaySync('#121214')).toBe(false);
  });

  test('equals compares the visible paper (rounded sliders), not object identity', () => {
    expect(Paper.equals({ type: 'kraft', color: '#C39A6B', texture: 0.701, bleed: 0.5 }, { type: 'kraft', color: '#c39a6b', texture: 0.7, bleed: 0.5 })).toBe(true);
    expect(Paper.equals({ type: 'kraft', color: '#c39a6b' }, { type: 'rough', color: '#c39a6b' })).toBe(false);
    expect(Paper.equals(null, { type: 'kraft' })).toBe(false);
  });
});
}

// ---- texture synthesis ----
{
/*
 * Paper selector — texture synthesis (src/render/paper-texture.js).
 *
 * The surface is one global, non-periodic function of document millimetres,
 * rasterised at a zoom "bucket": the same bump must sit at the same mm
 * position at every bucket (no re-randomising while zooming), nothing may
 * repeat, and chunk resolution follows on-screen px/mm only.
 */

const FILES = ['src/config/papers.js', 'src/core/rng.js', 'src/render/paper-texture.js'];

const corr = (a, b) => {
  const n = a.length;
  let ma = 0; let mb = 0;
  for (let i = 0; i < n; i += 1) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sab = 0; let saa = 0; let sbb = 0;
  for (let i = 0; i < n; i += 1) {
    const da = a[i] - ma; const db = b[i] - mb;
    sab += da * db; saa += da * da; sbb += db * db;
  }
  return sab / Math.sqrt(saa * sbb);
};

// Box-downsample a size×size field by an integer factor.
const down = (f, size, k) => {
  const n = size / k;
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      let s = 0;
      for (let j = 0; j < k; j += 1) for (let i = 0; i < k; i += 1) s += f[(y * k + j) * size + x * k + i];
      out[y * n + x] = s / (k * k);
    }
  }
  return out;
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

  // The same 32 mm window at two adjacent zoom buckets, compared at the
  // coarser resolution.
  const bucketPair = (type, seed, b, x0 = 13.7, y0 = 41.2) => {
    const mm = 32;
    const lo = PT.heightField(type, seed, x0, y0, mm * b, b);
    const hi = PT.heightField(type, seed, x0, y0, mm * b * 2, b * 2);
    return corr(lo, down(hi, mm * b * 2, 2));
  };

  test('features are stable across zoom buckets (same bumps at the same mm)', () => {
    ['cold-press', 'rough', 'hot-press', 'kraft'].forEach((type) => {
      [2, 4, 8].forEach((b) => {
        expect(bucketPair(type, 1, b), `${type} @${b}→${b * 2}`).toBeGreaterThan(0.85);
      });
    });
  });

  test('stability witness: an unrelated field (other seed) does NOT correlate', () => {
    // Mutation proof for the check above: re-randomising per bucket (what a
    // per-bucket lattice did) looks like a different seed.
    const mm = 32; const b = 4;
    const a = PT.heightField('rough', 1, 13.7, 41.2, mm * b, b);
    const c = PT.heightField('rough', 2, 13.7, 41.2, mm * b, b);
    expect(Math.abs(corr(a, c))).toBeLessThan(0.3);
  });

  test('no repetition: windows 32–512 mm apart are uncorrelated', () => {
    const b = 4; const size = 64;
    const base = PT.heightField('kraft', 1, 10, 10, size, b);
    [32, 64, 128, 256, 512].forEach((shift) => {
      const other = PT.heightField('kraft', 1, 10 + shift, 10, size, b);
      expect(Math.abs(corr(base, other)), `shift ${shift} mm`).toBeLessThan(0.3);
    });
  });

  test('fields are deterministic per seed', () => {
    const a = PT.heightField('rough', 7, 0, 0, 64, 4);
    const b = PT.heightField('rough', 7, 0, 0, 64, 4);
    expect(Array.from(a)).toEqual(Array.from(b));
    a.forEach((v) => { expect(v).toBeGreaterThanOrEqual(-1); expect(v).toBeLessThanOrEqual(1); });
  });

  test('chunk buckets are powers of two of on-screen px/mm, clamped, up to extreme zoom', () => {
    expect(PT.bucketFor(3.1)).toBe(4);
    expect(PT.bucketFor(5.5)).toBe(4);
    expect(PT.bucketFor(6)).toBe(8);
    expect(PT.bucketFor(110)).toBe(128);
    expect(PT.bucketFor(0.01)).toBe(PAPERS.LIMITS.minBucket);
    expect(PT.bucketFor(5000)).toBe(PAPERS.LIMITS.maxBucket);
    // A chunk covers chunkPx / bucket mm — a property of zoom, not sheet size.
    expect(PT.chunkMmFor(4)).toBe(PAPERS.LIMITS.chunkPx / 4);
  });
});
}
