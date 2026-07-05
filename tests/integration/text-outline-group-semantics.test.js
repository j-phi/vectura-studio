/*
 * TXT-2 — Per-glyph identity & group semantics (full app integration).
 *
 * The group produced by TextOutlineOps.outlineText uses the existing group
 * machinery: the renderer's double-click isolation drill works on it
 * unchanged and selects individual glyph layers. Each glyph layer's
 * Layers-panel row shows its character in the row label (via layer.name,
 * which the panel renders as the row text).
 *
 * The module has no <script> tag in index.html yet (Lane F owns the shell), so
 * the suite evals it into the runtime window explicitly.
 */
const fs = require('fs');
const path = require('path');

const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const MODULE_PATH = path.resolve(__dirname, '../../src/core/text-outline-ops.js');

const waitForUi = () => new Promise((resolve) => setTimeout(resolve, 80));

describe('Outline Text group semantics (TXT-2)', () => {
  let runtime;
  let app;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      useIndexHtml: true,
    });
    runtime.window.eval(fs.readFileSync(MODULE_PATH, 'utf8'));
    runtime.window.app = new runtime.window.Vectura.App();
    app = runtime.window.app;
    await waitForUi();
  });

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
    app = null;
  });

  const outlineTextLayer = (text) => {
    const id = app.engine.addLayer('text');
    const layer = app.engine.getLayerById(id);
    Object.assign(layer.params, { text, fitToFrame: false, fontSize: 40, jitter: 0 });
    app.engine.generate(id);
    const result = runtime.window.Vectura.TextOutlineOps.outlineText(id);
    expect(result).toBeTruthy();
    return result;
  };

  test('double-click isolation drill selects individual glyph layers', () => {
    const result = outlineTextLayer('abc');
    const children = app.engine.layers.filter((l) => l.parentId === result.groupId);
    expect(children.length).toBe(3);

    // The renderer's group-isolation machinery works on the produced group
    // unchanged: entering isolation on a glyph child selects just that glyph.
    const glyph = children[1];
    app.renderer.enterGroupEditMode(glyph);
    expect(app.renderer.groupEditMode).toBeTruthy();
    expect(app.renderer.groupEditMode.kind).toBe('group');
    expect(app.renderer.groupEditMode.groupId).toBe(result.groupId);
    expect(Array.from(app.renderer.selectedLayerIds)).toEqual([glyph.id]);

    // While isolated, glyph siblings remain individually selectable.
    const sibling = children[2];
    app.renderer.selectLayer(sibling);
    expect(Array.from(app.renderer.selectedLayerIds)).toEqual([sibling.id]);

    app.renderer.exitGroupEditMode();
    expect(app.renderer.groupEditMode).toBeNull();
  });

  test('group is a standard group container (engine child traversal intact)', () => {
    const result = outlineTextLayer('Hi');
    const group = app.engine.getLayerById(result.groupId);
    expect(group.isGroup).toBe(true);
    expect(group.groupType).toBe('group');
    expect(group.containerRole).toBeNull();
    const children = app.engine.getLayerChildren(result.groupId);
    expect(children.map((l) => l.name)).toEqual(['H', 'i']);
    children.forEach((child) => {
      expect(app.engine.getLayerDepth(child)).toBe(1);
    });
  });

  test('Layers-panel rows show each glyph character in the row label', () => {
    const result = outlineTextLayer('Hi');
    const children = app.engine.layers.filter((l) => l.parentId === result.groupId);

    app.ui.renderLayers();
    const doc = runtime.window.document;
    const list = doc.getElementById('layer-list');
    expect(list).toBeTruthy();
    // Each glyph row is addressable by its layer id and shows the character.
    children.forEach((child) => {
      const row = list.querySelector(`[data-layer-id="${child.id}"]`);
      expect(row).toBeTruthy();
      expect(row.textContent).toContain(child.name);
    });
  });
});
