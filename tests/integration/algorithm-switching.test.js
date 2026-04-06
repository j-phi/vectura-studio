const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { pathSignature } = require('../helpers/path-signature');

describe('Algorithm switching', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      includeMain: false,
      useIndexHtml: true,
    });
    runtime.window.app = new runtime.window.Vectura.App();
    await new Promise((resolve) => setTimeout(resolve, 80));
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('generated layers do not silently materialize source paths after app boot', () => {
    const { window } = runtime;
    const layer = window.app.engine.getActiveLayer();
    expect(layer).toBeTruthy();
    expect(layer.type).not.toBe('expanded');
    expect(layer.sourcePaths).toBeNull();
    expect(layer.paths.length).toBeGreaterThan(0);
  });

  test('switching algorithms regenerates artboard geometry instead of reusing stale source paths', async () => {
    const { window, document } = runtime;
    const app = window.app;
    const moduleSelect = document.getElementById('generator-module');
    const beforeLayer = app.engine.getActiveLayer();
    const nextType = beforeLayer.type === 'topo' ? 'lissajous' : 'topo';
    const beforeSignature = pathSignature(beforeLayer.paths);
    const beforeName = beforeLayer.name;
    const beforeFormula = document.getElementById('formula-display')?.textContent?.trim() || '';

    moduleSelect.value = nextType;
    moduleSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    const afterLayer = app.engine.getActiveLayer();
    const afterFormula = document.getElementById('formula-display')?.textContent?.trim() || '';

    expect(afterLayer.type).toBe(nextType);
    expect(afterLayer.name).not.toBe(beforeName);
    expect(afterLayer.sourcePaths).toBeNull();
    expect(afterLayer.paths.length).toBeGreaterThan(0);
    expect(pathSignature(afterLayer.paths)).not.toBe(beforeSignature);
    expect(afterFormula.length).toBeGreaterThan(0);
    expect(afterFormula).not.toBe(beforeFormula);
  });
});
