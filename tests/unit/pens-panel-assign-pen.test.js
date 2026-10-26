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
  const MODEL_FILES = ['src/config/papers.js', 'src/core/paper.js', 'src/config/pen-models.js', 'src/core/pen-model.js', 'src/core/pen-validate.js'];
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
    // Dark stock: a dye pen nearly vanishes, an opaque gel covers.
    const black = paper('black');
    expect(V.PenModel.resolveTraits(modelPen('sharpie-ultra-fine'), black, info('black')).alpha).toBe(0);
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
    p.ink = { opacity: 0.3 };
    expect(V.PenModel.inkValue(p, 'opacity')).toBe(0.3);
    expect(V.PenModel.resolveTraits(p, paper('hot-press'), info('hot-press')).alpha).toBeCloseTo(0.3, 6);
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
});
