/*
 * Compile gate for src/ui/shell/toolbar.js (Phase 2 step 3 seventh extraction).
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

describe('toolbar compile gate', () => {
  let dom;
  let Toolbar;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/ui/shell/toolbar.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    Toolbar = w.Vectura.UI.Toolbar;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.Toolbar with bind + 2 methods', () => {
    expect(Toolbar).toBeTruthy();
    expect(typeof Toolbar.bind).toBe('function');
    expect(typeof Toolbar.initToolBar).toBe('function');
    expect(typeof Toolbar.updateLightSourceTool).toBe('function');
  });

  it('initToolBar throws a clear error before bind()', () => {
    expect(() => Toolbar.initToolBar.call({})).toThrow(/Toolbar\.initToolBar invoked before Toolbar\.bind/);
  });

  it('updateLightSourceTool throws a clear error before bind()', () => {
    expect(() => Toolbar.updateLightSourceTool.call({})).toThrow(/Toolbar\.updateLightSourceTool invoked before Toolbar\.bind/);
  });

  it('after bind(deps), methods run without throwing when target elements are absent', () => {
    const doc = dom.window.document;
    Toolbar.bind({
      getEl: (id) => doc.getElementById(id),
      isPetalisLayerType: () => false,
    });
    dom.window.Vectura.SETTINGS = {};

    const ctx = {
      app: { engine: { getActiveLayer: () => null }, renderer: null },
      createMainToolbarMarkup: () => '',
      activeTool: 'select',
      scissorMode: 'split',
      penMode: 'draw',
      shapeMode: 'rect',
    };
    expect(() => Toolbar.updateLightSourceTool.call(ctx)).not.toThrow();
    expect(() => Toolbar.initToolBar.call(ctx)).not.toThrow();
  });

  it('initToolBar assigns setActiveTool to this when toolbar element is present', () => {
    const doc = dom.window.document;

    const toolbar = doc.createElement('div');
    toolbar.id = 'tool-bar';
    doc.body.appendChild(toolbar);

    Toolbar.bind({
      getEl: (id) => doc.getElementById(id),
      isPetalisLayerType: () => false,
    });
    dom.window.Vectura.SETTINGS = {};

    const ctx = {
      app: { renderer: null },
      createMainToolbarMarkup: () => '<button class="tool-btn" data-tool="select"></button>',
      activeTool: 'select',
      scissorMode: 'split',
      penMode: 'draw',
      shapeMode: 'rect',
    };

    Toolbar.initToolBar.call(ctx);

    // initToolBar should have attached setActiveTool to ctx
    expect(typeof ctx.setActiveTool).toBe('function');
    expect(typeof ctx.setScissorMode).toBe('function');
    expect(typeof ctx.setPenMode).toBe('function');
    expect(typeof ctx.setShapeMode).toBe('function');
    expect(typeof ctx.cycleToolSubmode).toBe('function');

    doc.body.removeChild(toolbar);
  });

  // Meridian Unit 1.9c: startLightSourcePlacement moved from _ui-legacy.js
  it('installOn registers startLightSourcePlacement on the UI prototype (Unit 1.9c)', () => {
    expect(typeof Toolbar.startLightSourcePlacement).toBe('function');
    const proto = {};
    Toolbar.installOn(proto);
    expect(typeof proto.startLightSourcePlacement).toBe('function');
  });

  it('startLightSourcePlacement returns silently when renderer is absent', () => {
    const ctx = { app: {} };
    expect(() => Toolbar.startLightSourcePlacement.call(ctx)).not.toThrow();
  });
});
