/*
 * COL-2 (Tools Parity, Phase 1 Lane D) — shared pen-assignment
 * helper unit gate.
 *
 * Vectura's color model is pen-based: a layer's color is a reference to a
 * document pen ({id, name, color, width} in SETTINGS.pens), stored as
 * layer.penId plus the denormalized caches layer.color / layer.strokeWidth.
 * Plot-order optimization groups strokes by penId (engine.js), so writing a
 * bare hex to layer.color without a penId is a correctness bug.
 *
 * This gate proves the shared helper:
 *   - Vectura.PensPanel.assignPenToLayers(pens, targetLayers, penId)
 *     writes the FULL penId/color/strokeWidth triple to every target layer
 *   - NEVER writes color (or anything) when the penId does not resolve to a
 *     pen — no partial writes, returns null
 *   - defaults lineCap to 'round' only when the layer has none (parity with
 *     the existing triple-write sites: layers-panel.js applyPen,
 *     pens-panel.js applyArmedPenToLayers)
 *   - tolerates null/undefined pens/layers inputs
 * and the popover-facing read:
 *   - Vectura.PensPanel.getSelectionPenState(pens, layers) reports the
 *     shared pen for a uniform selection and mixed:true for a divergent one.
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

const PENS = () => ([
  { id: 'pen-1', name: 'Pen 1', color: '#ffffff', width: 0.3 },
  { id: 'pen-2', name: 'Pen 2', color: '#dbeafe', width: 0.5 },
  { id: 'pen-3', name: 'Pen 3', color: '#93c5fd', width: 0.8 },
]);

describe('COL-2: Vectura.PensPanel.assignPenToLayers (shared triple-write helper)', () => {
  let dom;
  let PensPanel;

  beforeAll(() => {
    dom = loadInJSDOM(['src/ui/panels/pens-panel.js']);
    PensPanel = dom.window.Vectura?.PensPanel;
  });

  afterAll(() => {
    dom?.window?.close();
  });

  it('is exposed at the spec-named path Vectura.PensPanel and on Vectura.UI.PensPanel', () => {
    expect(PensPanel).toBeTruthy();
    expect(typeof PensPanel.assignPenToLayers).toBe('function');
    expect(dom.window.Vectura.UI.PensPanel.assignPenToLayers).toBe(PensPanel.assignPenToLayers);
  });

  it('writes the full penId/color/strokeWidth triple to every target layer', () => {
    const pens = PENS();
    const layers = [
      { id: 'l1', penId: 'pen-1', color: '#ffffff', strokeWidth: 0.3, lineCap: 'round' },
      { id: 'l2', penId: 'pen-3', color: '#93c5fd', strokeWidth: 0.8, lineCap: 'butt' },
    ];
    const pen = PensPanel.assignPenToLayers(pens, layers, 'pen-2');
    expect(pen).toBe(pens[1]);
    layers.forEach((layer) => {
      expect(layer.penId).toBe('pen-2');
      expect(layer.color).toBe('#dbeafe');
      expect(layer.strokeWidth).toBe(0.5);
    });
    // Pre-existing lineCap values are preserved.
    expect(layers[1].lineCap).toBe('butt');
  });

  it('defaults lineCap to round only when the layer has none (site parity)', () => {
    const layers = [{ id: 'l1' }];
    PensPanel.assignPenToLayers(PENS(), layers, 'pen-1');
    expect(layers[0].lineCap).toBe('round');
  });

  it('NEVER writes color without a resolvable penId — unknown pen is a no-op returning null', () => {
    const layers = [
      { id: 'l1', penId: 'pen-1', color: '#ffffff', strokeWidth: 0.3 },
    ];
    const before = JSON.parse(JSON.stringify(layers[0]));
    const result = PensPanel.assignPenToLayers(PENS(), layers, 'no-such-pen');
    expect(result).toBe(null);
    expect(layers[0]).toEqual(before);
  });

  it('tolerates null/undefined pens and layers inputs', () => {
    expect(PensPanel.assignPenToLayers(null, [{ id: 'l1' }], 'pen-1')).toBe(null);
    expect(PensPanel.assignPenToLayers(PENS(), null, 'pen-1')).toBeTruthy();
    expect(PensPanel.assignPenToLayers(PENS(), [null, undefined], 'pen-1')).toBeTruthy();
  });
});

describe('COL-2: Vectura.PensPanel.getSelectionPenState (mixed-pen read)', () => {
  let dom;
  let PensPanel;

  beforeAll(() => {
    dom = loadInJSDOM(['src/ui/panels/pens-panel.js']);
    PensPanel = dom.window.Vectura?.PensPanel;
  });

  afterAll(() => {
    dom?.window?.close();
  });

  it('reports the shared pen for a uniform selection', () => {
    const pens = PENS();
    const state = PensPanel.getSelectionPenState(pens, [
      { id: 'l1', penId: 'pen-2' },
      { id: 'l2', penId: 'pen-2' },
    ]);
    expect(state.mixed).toBe(false);
    expect(state.penId).toBe('pen-2');
    expect(state.pen).toBe(pens[1]);
  });

  it('reports mixed:true when penIds diverge across the selection', () => {
    const state = PensPanel.getSelectionPenState(PENS(), [
      { id: 'l1', penId: 'pen-1' },
      { id: 'l2', penId: 'pen-3' },
    ]);
    expect(state.mixed).toBe(true);
    expect(state.penId).toBe(null);
    expect(state.pen).toBe(null);
  });

  it('treats a missing penId as its own bucket (mixed against a real pen)', () => {
    const state = PensPanel.getSelectionPenState(PENS(), [
      { id: 'l1', penId: 'pen-1' },
      { id: 'l2' },
    ]);
    expect(state.mixed).toBe(true);
  });

  it('returns an empty non-mixed state for an empty selection', () => {
    const state = PensPanel.getSelectionPenState(PENS(), []);
    expect(state.mixed).toBe(false);
    expect(state.penId).toBe(null);
    expect(state.pen).toBe(null);
  });
});

/*
 * Pen models — the catalogue (src/config/pen-models.js) and the pen × paper
 * trait resolution (src/core/pen-model.js) the ink renderer draws with.
 * Plain colour + diameter pens stay the default and resolve to "draw exactly
 * as before" (null traits) on paper None.
 */
describe('Pen models: catalogue + PenModel.resolveTraits', () => {
  let dom;
  let V;
  const MODEL_FILES = ['src/config/papers.js', 'src/core/paper.js', 'src/config/pen-models.js', 'src/core/pen-model.js', 'src/core/pen-validate.js', 'src/render/ink-renderer.js'];
  const HEX6 = /^#[0-9a-f]{6}$/i;

  beforeAll(() => {
    dom = loadInJSDOM(MODEL_FILES);
    V = dom.window.Vectura;
  });
  afterAll(() => dom?.window?.close());

  const paper = (type, extra = {}) => ({ ...V.Paper.forType(type), ...extra });
  const info = (type) => V.PAPERS.TYPES[type];
  const pen = (extra = {}) => ({ id: 'pen-a', name: 'A', color: '#111111', width: 0.4, ...extra });
  const modelPen = (id, extra = {}) => V.PenModel.applyModel(pen(extra), id);

  it('lists every catalogue model with a sane, complete record', () => {
    const { MODELS, ORDER, EFFECTS, CLASS_ORDER } = V.PEN_MODELS;
    expect(ORDER.length).toBeGreaterThanOrEqual(15);
    ['sakura-pigma-micron', 'sharpie-ultra-fine', 'uniball-signo-broad-um153', 'sakura-gelly-roll-classic',
      'pentel-sign-pen', 'pilot-kakuno-fountain', 'rotring-isograph', 'uni-posca-pc1mr'].forEach((id) => expect(ORDER).toContain(id));
    ORDER.forEach((id) => {
      const m = MODELS[id];
      expect(m && m.id, id).toBe(id);
      expect(m.label && m.short && m.brand, id).toBeTruthy();
      expect(CLASS_ORDER, id).toContain(m.inkClass);
      expect(m.sizes.length, id).toBeGreaterThan(0);
      m.sizes.forEach((s) => expect(s.laidWidthMm, `${id} ${s.label}`).toBeGreaterThan(0.05));
      expect(m.sizes.map((s) => s.label), id).toContain(m.defaultSize);
      ['opacity', 'coverOnDark', 'overlapDarkening', 'dryskipResponse', 'confidence'].forEach((k) => {
        expect(m[k], `${id}.${k}`).toBeGreaterThanOrEqual(0);
        expect(m[k], `${id}.${k}`).toBeLessThanOrEqual(1);
      });
      expect(['multiply', 'source-over'], id).toContain(m.blend);
      expect(['plain', ...EFFECTS], id).toContain(m.effect);
      m.colours.forEach((c) => { expect(c.hex, `${id} ${c.name}`).toMatch(HEX6); expect(['plain', ...EFFECTS]).toContain(c.effect); });
    });
    // Null-prototype map: inherited members never resolve to a model.
    expect(MODELS.constructor).toBeUndefined();
    expect(V.PenModel.modelOf(pen({ model: 'constructor' }))).toBeNull();
  });

  it('plain pen: no traits on paper None (exact legacy path), edge bleed on realistic paper', () => {
    expect(V.PenModel.isPlain(pen())).toBe(true);
    expect(V.PenModel.resolveTraits(pen(), paper('none'), info('none'))).toBeNull();
    // An unknown model (newer build) is kept on the record but renders plain.
    expect(V.PenModel.resolveTraits(pen({ model: 'future-pen-9000' }), paper('none'), info('none'))).toBeNull();
    const t = V.PenModel.resolveTraits(pen(), paper('cotton-rag'), info('cotton-rag'));
    expect(t.plain).toBe(true);
    expect(t.edgeAmpMm).toBeGreaterThan(0);
    expect(t.laidW).toBe(0.4); // a plain pen never changes width
    expect(t.alpha).toBe(1);
    expect(t.opaque).toBe(false);
    expect(t.haloWeight).toBe(1);
  });

  it('edge bleed grows monotonically with the paper bleed slider, the pen bleed and the roughness', () => {
    const amp = (p, pp) => V.PenModel.resolveTraits(p, pp, info(pp.type)).edgeAmpMm;
    const bleeds = [0, 0.25, 0.5, 0.75, 1];
    const byBleed = bleeds.map((b) => amp(pen(), paper('cold-press', { bleed: b })));
    byBleed.slice(1).forEach((v, i) => expect(v).toBeGreaterThan(byBleed[i]));
    const byWet = [0, 0.3, 0.6, 1].map((w) => amp({ ...modelPen('pentel-sign-pen'), ink: { wetness: w } }, paper('cold-press')));
    byWet.slice(1).forEach((v, i) => expect(v).toBeGreaterThan(byWet[i]));
    const byRough = [0, 0.1, 0.3, 0.6].map((r) => amp({ ...modelPen('sakura-pigma-micron'), ink: { roughness: r } }, paper('newsprint')));
    expect(byRough[0]).toBe(0);
    byRough.slice(1).forEach((v, i) => expect(v).toBeGreaterThan(byRough[i]));
    // Absorbent paper: the laid width grows with the bleed slider for a wet pen.
    const w = (b) => V.PenModel.resolveTraits(modelPen('sharpie-ultra-fine'), paper('newsprint', { bleed: b }), info('newsprint')).laidW;
    expect(w(1)).toBeGreaterThan(w(0.5));
    expect(w(0)).toBe(modelPen('sharpie-ultra-fine').width);
  });

  it('a Sharpie and a Uni-ball Signo resolve to visibly different inks', () => {
    const p = paper('cold-press');
    const sharpie = V.PenModel.resolveTraits(modelPen('sharpie-ultra-fine'), p, info('cold-press'));
    const signo = V.PenModel.resolveTraits(modelPen('uniball-signo-broad-um153'), p, info('cold-press'));
    expect(sharpie.opaque).toBe(false); // translucent alcohol dye
    expect(signo.opaque).toBe(true);    // opaque gel
    expect(sharpie.edgeAmpMm).toBeGreaterThan(signo.edgeAmpMm * 2);
    expect(signo.skipRate).toBeGreaterThan(0);
    expect(sharpie.skipRate).toBe(0);
    expect(sharpie.overlapDarkening).toBeGreaterThan(signo.overlapDarkening);
    // Dark stock: a dye pen is faint but never vanishes (floor), an opaque gel covers.
    const black = paper('black');
    const onBlack = V.PenModel.resolveTraits(modelPen('sharpie-ultra-fine'), black, info('black'));
    expect(onBlack.alpha).toBeGreaterThanOrEqual(0.08);
    expect(onBlack.alpha).toBeLessThanOrEqual(0.15);
    expect(onBlack.alpha).toBe(V.PEN_MODELS.LIMITS.dyeOnDarkFloor);
    expect(onBlack.dyeOnDark).toBe(true);
    expect(sharpie.dyeOnDark).toBe(false);
    expect(V.PenModel.resolveTraits(modelPen('uniball-signo-broad-um153'), black, info('black')).dyeOnDark).toBe(false);
    expect(V.PenModel.resolveTraits(modelPen('uniball-signo-broad-um153'), black, info('black')).alpha).toBeGreaterThan(0.8);
  });

  it('a model pen on paper None keeps its pen width and its own (small) edge, no paper bleed', () => {
    const t = V.PenModel.resolveTraits(modelPen('pentel-sign-pen'), paper('none'), info('none'));
    expect(t.realistic).toBe(false);
    expect(t.laidW).toBe(modelPen('pentel-sign-pen').width);
    expect(t.edgeAmpMm).toBeGreaterThan(0);
    expect(t.edgeAmpMm).toBeLessThan(V.PenModel.resolveTraits(modelPen('pentel-sign-pen'), paper('cotton-rag'), info('cotton-rag')).edgeAmpMm);
  });

  it('applyModel writes model, default size and laid width; Plain clears every model field', () => {
    const p = pen({ ink: { wetness: 0.9 }, effect: 'glow' });
    V.PenModel.applyModel(p, 'sakura-pigma-micron', '08');
    expect(p).toMatchObject({ model: 'sakura-pigma-micron', size: '08', width: 0.55 });
    expect(p.ink).toBeUndefined();
    expect(p.effect).toBeUndefined();
    V.PenModel.applyModel(p, 'sakura-pigma-micron', 'nope');
    expect(p.size).toBe('05');
    V.PenModel.applyModel(p, null);
    expect(Object.keys(p).sort()).toEqual(['color', 'id', 'name', 'width']);
    expect(V.PenModel.labelOf(p)).toBe('Plain');
    expect(V.PenModel.labelOf(modelPen('pentel-sign-pen'))).toBe('Sign Pen · fine fibre');
  });

  it('ink overrides replace the model defaults and reset to them when removed', () => {
    const p = modelPen('stabilo-point-88');
    const d = V.PenModel.inkDefaults(p);
    expect(d.opacity).toBe(V.PEN_MODELS.MODELS['stabilo-point-88'].opacity);
    const lum = (hex) => V.PenModel.luminance ? V.PenModel.luminance(hex) : V.Paper.luminance(hex);
    const before = V.PenModel.resolveTraits(p, paper('hot-press'), info('hot-press'));
    p.ink = { opacity: 0.3 };
    expect(V.PenModel.inkValue(p, 'opacity')).toBe(0.3);
    // A translucent dye is an absorber: full alpha, a lighter transmittance colour.
    const after = V.PenModel.resolveTraits(p, paper('hot-press'), info('hot-press'));
    expect(after.alpha).toBe(1);
    expect(after.inkColor).toBe(V.PenModel.dyeColor(p.color, Math.sqrt(0.3)));
    expect(lum(after.inkColor)).toBeGreaterThan(lum(before.inkColor));
    delete p.ink;
    expect(V.PenModel.inkValue(p, 'opacity')).toBe(d.opacity);
  });

  it('the ribbon cache key changes with geometry traits and not with colour/opacity', () => {
    const p = modelPen('pentel-sign-pen');
    const k = (q, pp = paper('cold-press')) => V.PenModel.traitsKey(V.PenModel.resolveTraits(q, pp, info(pp.type)));
    const base = k(p);
    expect(k({ ...p, color: '#ff0000' })).toBe(base);
    expect(k({ ...p, ink: { opacity: 0.2 } })).toBe(base);
    expect(k({ ...p, ink: { roughness: 0.5 } })).not.toBe(base);
    expect(k(p, paper('cold-press', { seed: 7 }))).not.toBe(base);
  });

  it('validatePen keeps a plain pen to exactly its legacy keys and round-trips model fields', () => {
    const { validatePen } = V.PenValidate;
    expect(Object.keys(validatePen({ id: 'pen-1', name: 'P', color: '#fff', width: 0.3, themeManaged: true }))).toEqual(['id', 'name', 'color', 'width', 'themeManaged']);
    const out = validatePen({ id: 'pen-2', name: 'S', color: '#111111', width: 0.85, model: 'pentel-sign-pen', size: 'fine fibre', effect: 'metallic', color2: '#c0c0c0', ink: { wetness: 0.8, blobs: 9, bogus: 1 } });
    expect(out).toMatchObject({ model: 'pentel-sign-pen', size: 'fine fibre', effect: 'metallic', color2: '#c0c0c0' });
    expect({ ...out.ink }).toEqual({ wetness: 0.8, blobs: V.PEN_MODELS.PARAM_LIMITS.blobs[1] });
    expect(validatePen({ id: 'pen-3', name: 'F', color: '#111111', width: 0.4, model: 'future-pen-9000' }).model).toBe('future-pen-9000');
  });

  // Review item 2: black must read black. One pass of a black dye pen on a
  // light stock lands within ~10 sRGB levels of the plain black pen.
  it('a single pass of a black Sharpie / Micron / Sign Pen is within 10 levels of plain black', () => {
    const lvl = (hex) => { const v = parseInt(hex.slice(1), 16); return Math.max((v >> 16) & 255, (v >> 8) & 255, v & 255); };
    ['sharpie-ultra-fine', 'sakura-pigma-micron', 'pentel-sign-pen'].forEach((id) => {
      ['cold-press', 'hot-press', 'cotton-rag'].forEach((pt) => {
        const t = V.PenModel.resolveTraits(modelPen(id, { color: '#151515' }), paper(pt), info(pt));
        // Composited with multiply on white at alpha t.alpha: out = 255·(1 - a + a·c).
        const out = 255 * (1 - t.alpha) + t.alpha * lvl(t.inkColor);
        expect(out - 0x15, `${id} on ${pt}`).toBeLessThanOrEqual(10);
        expect(t.overlapDarkening, id).toBeGreaterThan(0); // crossings still compound
      });
    });
    // A pale dye is not darkened into an opaque paint: it stays a transparent tint.
    const yellow = V.PenModel.resolveTraits(modelPen('stabilo-point-88', { color: '#fff176' }), paper('cold-press'), info('cold-press'));
    expect(lvl(yellow.inkColor)).toBeGreaterThan(240);
    // Mutation witness: the old veil model (alpha = opacity, colour unchanged) is > 10 levels off.
    const sh = V.PEN_MODELS.MODELS['sharpie-ultra-fine'];
    expect(255 * (1 - sh.opacity) + sh.opacity * 0x15 - 0x15).toBeGreaterThan(10);
  });

  // Review item 4: bleed reads at working zoom.
  it('a 0.4 mm fibre-tip line on absorbent stock bleeds about ±0.03 mm and turns ribbon from ~10 px/mm', () => {
    const t = V.PenModel.resolveTraits(modelPen('sakura-pigma-micron', { width: 0.4 }), paper('cotton-rag'), info('cotton-rag'));
    expect(t.edgeAmpMm).toBeGreaterThanOrEqual(0.02);
    expect(t.edgeAmpMm).toBeLessThanOrEqual(0.045);
    expect(V.InkRenderer.tierFor(t, 11)).toBe(2);
    expect(V.InkRenderer.tierFor(t, 2)).toBeLessThan(2);
    // Plain pen on the same stock also reaches the ribbon at working zoom.
    const plain = V.PenModel.resolveTraits(pen(), paper('cotton-rag'), info('cotton-rag'));
    expect(V.InkRenderer.tierFor(plain, 16)).toBe(2);
  });

  it('validatePen applies the catalogue length limits (pen id, model id, size)', () => {
    const { validatePen } = V.PenValidate;
    const L = V.PEN_MODELS.LIMITS;
    const base = { name: 'P', color: '#111111', width: 0.4 };
    expect(validatePen({ ...base, id: 'p'.repeat(L.penIdMaxLen) })).toBeTruthy();
    expect(validatePen({ ...base, id: 'p'.repeat(L.penIdMaxLen + 1) })).toBeNull();
    expect(validatePen({ ...base, id: 'pen-1', model: 'm'.repeat(L.modelIdMaxLen) }).model).toBe('m'.repeat(L.modelIdMaxLen));
    expect(validatePen({ ...base, id: 'pen-1', model: 'm'.repeat(L.modelIdMaxLen + 1) }).model).toBeUndefined();
    expect(validatePen({ ...base, id: 'pen-1', model: 'pentel-sign-pen', size: 's'.repeat(200) }).size).toHaveLength(L.sizeMaxLen);
  });
});

// Special inks (metallic, neon, glow, glitter, opaque white) + pen files /
// My pens. Pure layers: PenModel effect resolution, the InkRenderer effects
// pass on a recording ctx, PenLibrary parse/export and the My pens store.
describe('Special inks: effect resolution, effects layer, pen files, My pens', () => {
  let dom;
  let V;
  const FILES = ['src/config/papers.js', 'src/core/paper.js', 'src/config/pen-models.js', 'src/core/pen-model.js',
    'src/core/pen-validate.js', 'src/render/ink-renderer.js', 'src/core/user-library-store.js', 'src/core/pen-library.js'];

  beforeAll(() => {
    dom = loadInJSDOM(FILES);
    V = dom.window.Vectura;
  });
  afterAll(() => dom?.window?.close());

  const none = (color = '#ffffff') => ({ type: 'none', color, texture: 0, bleed: 0, seed: 7 });
  const traitsOf = (pen, paper = none()) => V.PenModel.resolveTraits(pen, paper, V.PAPERS.TYPES[paper.type] || {});

  // Recording ctx: every fill / stroke with its style and the path ops since
  // the last beginPath (document mm).
  const recorder = () => {
    const ops = [];
    const draws = [];
    const st = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', filter: 'none' };
    const stack = [];
    const ctx = {
      save: () => stack.push({ ...st }),
      restore: () => Object.assign(st, stack.pop() || {}),
      beginPath: () => { ops.length = 0; },
      moveTo: (x, y) => ops.push(['M', x, y]),
      lineTo: (x, y) => ops.push(['L', x, y]),
      arc: (...a) => ops.push(['A', ...a]),
      ellipse: (...a) => ops.push(['E', ...a]),
      closePath: () => ops.push(['Z']),
      quadraticCurveTo: (...a) => ops.push(['Q', ...a]),
      bezierCurveTo: (...a) => ops.push(['C', ...a]),
      fill: () => draws.push({ op: 'fill', ops: ops.slice(), ...st }),
      stroke: () => draws.push({ op: 'stroke', ops: ops.slice(), ...st }),
    };
    return { ctx: new Proxy(ctx, { get: (t, k) => (k in t ? t[k] : st[k]), set: (t, k, v) => { st[k] = v; return true; } }), draws };
  };
  const wave = () => { const p = []; for (let k = 0; k <= 200; k += 1) p.push({ x: 10 + k * 0.25, y: 20 + Math.sin(k / 12) * 3 }); return p; };
  const fxPass = (pen, view, ppm, paper = none('#101012'), path = wave()) => {
    const t = traitsOf(pen, paper);
    const { ctx, draws } = recorder();
    const res = V.InkRenderer.drawEffects(ctx, [{ path }], t, { pxPerMm: ppm, view });
    return { t, draws, res, path };
  };
  const pts = (draws, pred) => draws.filter(pred).map((d) => JSON.stringify(d.ops.map((o) => o.map((v) => (typeof v === 'number' ? +v.toFixed(6) : v))))).join('|');

  it('catalogue: the Special inks strip has every required swatch; each resolves to a valid effect', () => {
    const { EFFECT_SWATCHES, EFFECTS, EFFECT_DEFAULTS } = V.PEN_MODELS;
    ['metallic-gold', 'metallic-silver', 'metallic-copper', 'metallic-bronze', 'metallic-rose-gold',
      'neon-green', 'neon-pink', 'neon-orange', 'neon-yellow', 'neon-blue', 'glow-green', 'glow-aqua',
      'glitter-gold', 'glitter-silver', 'glitter-clear', 'opaque-white'].forEach((id) => expect(V.PenModel.swatchById(id), id).toBeTruthy());
    EFFECT_SWATCHES.forEach((s) => {
      expect(EFFECTS).toContain(s.effect);
      expect(s.hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(EFFECT_DEFAULTS[s.effect]).toBeTruthy();
    });
    // Dual metallic comes with the Pentel model's colours.
    const dual = V.PEN_MODELS.MODELS['pentel-hybrid-dual-metallic'];
    expect(dual.colours.every((c) => c.effect === 'dual-metallic' && /^#[0-9a-f]{6}$/i.test(c.secondHex))).toBe(true);
  });

  it('applyEffectSwatch sets colour + effect (+ color2) on any pen; null clears the effect only', () => {
    const PM = V.PenModel;
    const plain = { id: 'p', name: 'P', color: '#111111', width: 0.4, themeManaged: true };
    PM.applyEffectSwatch(plain, PM.swatchById('glow-aqua'));
    expect(plain).toMatchObject({ color: '#e2f0ee', effect: 'glow', color2: '#5ae0ff', themeManaged: false });
    expect(PM.effectOf(plain)).toBe('glow');
    PM.applyEffectSwatch(plain, PM.swatchById('metallic-gold'));
    expect(plain.effect).toBe('metallic');
    expect(plain.color2).toBeUndefined();
    PM.applyEffectSwatch(plain, null);
    expect(plain.effect).toBeUndefined();
    expect(plain.color).toBe('#c9a24a'); // the colour stays
    // A model pen keeps its model; its default effect applies when unset.
    const gel = PM.applyModel({ id: 'g', name: 'G', color: '#c9a048', width: 0.5 }, 'sakura-gelly-roll-metallic');
    expect(PM.effectOf(gel)).toBe('metallic');
    PM.applyEffectSwatch(gel, PM.swatchById('neon-pink'));
    expect(gel.model).toBe('sakura-gelly-roll-metallic');
    expect(PM.effectOf(gel)).toBe('fluorescent');
  });

  it('resolveTraits: an effect makes a plain pen an ink-renderer pen with crisp edges; per-effect base ink', () => {
    const PM = V.PenModel;
    const base = { id: 'p', name: 'P', width: 0.5 };
    // Plain pen, no effect, paper None: untouched (null = legacy path).
    expect(traitsOf({ ...base, color: '#c9a24a' })).toBeNull();
    const gold = traitsOf({ ...base, color: '#c9a24a', effect: 'metallic' });
    expect(gold.fx.effect).toBe('metallic');
    expect(gold.opaque).toBe(true);
    expect(gold.inkColor).not.toBe('#c9a24a'); // darker base off the glint
    expect(V.InkRenderer.tierFor(gold, 200)).toBe(0); // crisp: no lumps / pools / skips
    expect([gold.edgeAmpMm, gold.jitter, gold.startBlobMm, gold.endPoolMm, gold.skipRate]).toEqual([0, 0, 0, 0, 0]);
    // Opaque white covers black stock (source-over, ≥ 0.9) and never multiplies.
    const white = traitsOf({ ...base, color: '#f7f7f4', effect: 'white' }, none('#000000'));
    expect(white.opaque).toBe(true);
    expect(white.alpha).toBeGreaterThanOrEqual(0.9);
    // Neon pushes chroma; glow's daylight look is a pale, translucent lacquer.
    const neon = traitsOf({ ...base, color: '#cc6699', effect: 'fluorescent' });
    const sat = (hex) => { const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return Math.max(...v) - Math.min(...v); };
    expect(sat(neon.inkColor)).toBeGreaterThan(sat('#cc6699'));
    const glow = traitsOf({ ...base, color: '#e6f2c8', effect: 'glow', color2: '#7dff9a' });
    expect(glow.alpha).toBeLessThan(0.8);
    expect(glow.fx.glow).toBe('#7dff9a');
    // Effect sliders: overrides clamp to PARAM_LIMITS; the defaults show only with an effect.
    const strong = traitsOf({ ...base, color: '#c9a24a', effect: 'glitter', ink: { effectStrength: 7, flakeDensity: -3 } });
    expect(strong.fx.strength).toBe(1);
    expect(strong.fx.flakeDensity).toBe(0);
    expect(PM.inkDefaults({ ...base, color: '#000000' }).effectStrength).toBeUndefined();
    expect(PM.inkDefaults({ ...base, color: '#000000', effect: 'metallic' }).effectStrength).toBeGreaterThan(0);
  });

  it('effects layer: glints change with pan / zoom, never with time; same view → identical output', async () => {
    const pen = { id: 'p', name: 'P', color: '#c9a24a', width: 0.6, effect: 'metallic' };
    const view = { x: 0, y: 0, w: 60, h: 40 };
    const a = fxPass(pen, view, 40);
    expect(a.res.flakes).toBeGreaterThan(0);
    expect(a.res.segments).toBeGreaterThan(0);
    // Same view a moment later: byte-identical draws (no time term).
    await new Promise((r) => setTimeout(r, 15));
    const again = fxPass(pen, view, 40, none('#101012'), a.path);
    expect(JSON.stringify(again.draws)).toBe(JSON.stringify(a.draws));
    // A pan moves the light the view sees, so different flakes glint.
    const panned = fxPass(pen, { ...view, x: 25, y: 8 }, 40, none('#101012'), a.path);
    expect(V.InkRenderer.lightOf({ ...view, x: 25, y: 8 })).not.toBeCloseTo(V.InkRenderer.lightOf(view), 3);
    const glints = (d) => pts(d.draws, (x) => x.op === 'fill' && x.globalAlpha >= 0.6);
    expect(glints(panned)).not.toBe(glints(a));
    // …and so does a zoom (eye height follows the view size).
    const zoomed = fxPass(pen, { x: 15, y: 10, w: 30, h: 20 }, 80, none('#101012'), a.path);
    expect(glints(zoomed)).not.toBe(glints(a));
  });

  it('effects layer: flakes are locked to the stroke in mm (identical positions across pans)', () => {
    const pen = { id: 'p', name: 'P', color: '#c8a048', width: 0.6, effect: 'glitter' };
    const path = wave();
    const all = (view) => {
      const { draws } = fxPass(pen, view, 40, none('#101012'), path);
      // Every flake square of the faint particle layer (drawn regardless of glint).
      const base = draws.find((d) => d.op === 'fill' && Math.abs(d.globalAlpha - 0.32 * traitsOf(pen).fx.strength) < 1e-9);
      const set = new Set();
      for (let i = 0; i < base.ops.length; i += 5) set.add(`${base.ops[i][1].toFixed(6)},${base.ops[i][2].toFixed(6)}`);
      return set;
    };
    const big = { x: -100, y: -100, w: 400, h: 300 };
    const a = all(big);
    const b = all({ ...big, x: -90, y: -95 });
    expect(a.size).toBeGreaterThan(50);
    expect([...a].every((k) => b.has(k))).toBe(true);
    // Some glitter particles sit just past the ink edge.
    const t = traitsOf(pen);
    expect(t.fx.spread).toBeGreaterThan(1);
  });

  it('effects layer: LOD — sub-pixel flakes draw no flakes; the flake budget thins deterministically', () => {
    const pen = { id: 'p', name: 'P', color: '#c9a24a', width: 0.6, effect: 'metallic' };
    const view = { x: 0, y: 0, w: 80, h: 60 };
    const far = fxPass(pen, view, 4);
    expect(far.res.flakes).toBe(0);
    expect(far.res.segments).toBeGreaterThan(0); // the sheen still draws (and still follows the view)
    const L = V.PEN_MODELS.FX_LIMITS;
    const many = []; for (let r = 0; r < 40; r += 1) { const p = []; for (let k = 0; k <= 200; k += 1) p.push({ x: k * 0.3, y: r * 1.2 + Math.sin(k / 9) }); many.push(p); }
    const t = traitsOf(pen);
    const run = (budget) => {
      const saved = V.PEN_MODELS.FX_LIMITS;
      V.PEN_MODELS.FX_LIMITS = { ...saved, flakeBudget: budget };
      try {
        const { ctx } = recorder();
        return V.InkRenderer.drawEffects(ctx, many.map((path) => ({ path })), t, { pxPerMm: 40, view }).flakes;
      } finally { V.PEN_MODELS.FX_LIMITS = saved; }
    };
    const full = run(1e9);
    expect(full).toBeGreaterThan(400);
    const thinned = run(200);
    expect(thinned).toBeLessThan(full);
    expect(thinned).toBeLessThanOrEqual(260);
    expect(run(200)).toBe(thinned); // deterministic
    expect(L.flakeBudget).toBe(20000);
  });

  it('glow: Lights off draws a sharp core and a bloom with lighter compositing', () => {
    const pen = { id: 'p', name: 'P', color: '#e6f2c8', width: 0.8, effect: 'glow', color2: '#5ae0ff' };
    const t = traitsOf(pen);
    const { ctx, draws } = recorder();
    expect(V.InkRenderer.drawGlow(ctx, [{ path: wave() }], t, { pxPerMm: 10, filterOk: true })).toBe(true);
    expect(draws.every((d) => d.globalCompositeOperation === 'lighter')).toBe(true);
    expect(draws.some((d) => /blur\(/.test(d.filter) && d.strokeStyle === '#5ae0ff')).toBe(true);
    expect(draws.some((d) => d.filter === 'none' && d.strokeStyle === '#5ae0ff' && d.lineWidth === t.laidW)).toBe(true);
  });

  it('pen files: export → import round-trip; imported pens always get new ids', () => {
    const PL = V.PenLibrary;
    const pens = [
      { id: 'pen-1', name: 'Gold', color: '#c9a24a', width: 0.55, effect: 'metallic', themeManaged: false },
      V.PenModel.applyModel({ id: 'pen-2', name: 'Signo', color: '#f6f6f2', width: 0.7, effect: 'white', ink: { opacity: 0.8 } }, 'uniball-signo-broad-um153'),
    ];
    pens[1].effect = 'white';
    pens[1].ink = { opacity: 0.8, effectStrength: 0.4 };
    const out = PL.exportText(pens);
    expect(out.ok).toBe(true);
    const doc = JSON.parse(out.text);
    expect(doc).toMatchObject({ schema: 'vectura-pens', version: 1 });
    expect(doc.pens[0]).not.toHaveProperty('id');
    const back = PL.parseImport(out.text, { existingIds: ['pen-1', 'pen-2'] });
    expect(back.ok).toBe(true);
    expect(back.pens).toHaveLength(2);
    back.pens.forEach((p) => expect(['pen-1', 'pen-2']).not.toContain(p.id));
    expect(new Set(back.pens.map((p) => p.id)).size).toBe(2);
    expect(back.pens[0]).toMatchObject({ name: 'Gold', color: '#c9a24a', width: 0.55, effect: 'metallic' });
    expect(back.pens[1]).toMatchObject({ model: 'uniball-signo-broad-um153', effect: 'white', ink: { opacity: 0.8, effectStrength: 0.4 } });
  });

  it('pen files: hostile input is rejected or sanitised', () => {
    const PL = V.PenLibrary;
    const F = V.PEN_MODELS.FILE_LIMITS;
    const file = (pens, extra = {}) => JSON.stringify({ schema: 'vectura-pens', version: 1, pens, ...extra });
    const ok = { name: 'A', color: '#112233', width: 0.4 };
    expect(PL.parseImport('x'.repeat(F.maxBytes + 1)).reason).toBe('too-large');
    expect(PL.parseImport('{nope').reason).toBe('parse');
    expect(PL.parseImport(file([ok], { schema: 'vectura-papers' })).reason).toBe('schema');
    expect(PL.parseImport(file([ok], { version: 2 })).reason).toBe('version');
    expect(PL.parseImport(file(Array.from({ length: F.maxPens + 1 }, () => ok))).reason).toBe('too-many');
    expect(PL.parseImport(file([])).reason).toBe('empty');
    const hostile = PL.parseImport(`{"schema":"vectura-pens","version":1,"__proto__":{"polluted":1},"pens":[
      {"name":"<img src=x onerror=alert(1)>\\u0000","color":"#123456","width":0.5,"__proto__":{"isAdmin":true},
       "ink":{"__proto__":{"x":1},"constructor":5,"opacity":9,"evil":3},"effect":"lava","color2":"red;background:url(x)","model":"x\\"><b>"},
      {"name":"bad colour","color":"url(javascript:alert(1))","width":0.5},
      {"name":"style","color":"#fff","width":"1e9"}]}`, { existingIds: [] });
    expect(hostile.ok).toBe(true);
    expect(hostile.rejected).toBe(1);
    const [a, b] = hostile.pens;
    expect(a.name).toBe('<img src=x onerror=alert(1)>'); // plain text (rendered escaped), control chars gone
    expect(Object.keys(a).sort()).toEqual(['color', 'id', 'ink', 'name', 'themeManaged', 'width']);
    expect(Object.keys(a.ink)).toEqual(['opacity']);
    expect(a.ink.opacity).toBe(1);
    expect({}.polluted).toBeUndefined();
    expect({}.isAdmin).toBeUndefined();
    expect(b.width).toBe(100);
  });

  it('My pens: CRUD + persistence through localStorage, quota → { ok:false, reason:"quota" }', () => {
    const lib = V.PenLibrary.library();
    dom.window.localStorage.clear();
    const put = lib.put(V.PenLibrary.toFilePen({ name: 'My gold', color: '#c9a24a', width: 0.55, effect: 'metallic' }));
    expect(put.ok).toBe(true);
    expect(put.item.id).toMatch(/^mypen-[a-z0-9]{7}$/);
    const raw = JSON.parse(dom.window.localStorage.getItem(V.PEN_MODELS.LIBRARY_KEY));
    expect(raw).toMatchObject({ schema: 'vectura-pens', version: 1 });
    expect(raw.pens[0]).toMatchObject({ name: 'My gold', effect: 'metallic' });
    expect(lib.rename(put.item.id, 'Gold 2').item.name).toBe('Gold 2');
    // Apply an entry to a document pen: ink copied, id + name kept.
    const docPen = { id: 'pen-9', name: 'Mine', color: '#000000', width: 0.3, model: 'sakura-pigma-micron', size: '05' };
    expect(V.PenLibrary.applyEntry(docPen, lib.get(put.item.id))).toBe(true);
    expect(docPen).toMatchObject({ id: 'pen-9', name: 'Mine', color: '#c9a24a', width: 0.55, effect: 'metallic' });
    expect(docPen.model).toBeUndefined();
    expect(lib.remove(put.item.id).ok).toBe(true);
    expect(lib.list()).toEqual([]);
    // Quota: the storage refuses the write; the library is unchanged.
    const proto = dom.window.Storage.prototype;
    const orig = proto.setItem;
    proto.setItem = () => { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; };
    try {
      expect(lib.put(V.PenLibrary.toFilePen({ name: 'X', color: '#000000', width: 0.3 }))).toEqual({ ok: false, reason: 'quota' });
    } finally { proto.setItem = orig; }
    expect(lib.list()).toEqual([]);
    expect(lib.max).toBe(128);
  });
});
