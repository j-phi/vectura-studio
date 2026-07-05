/*
 * COL-2 (Illustrator Tools Parity, Phase 1 Lane D) — shared pen-assignment
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
