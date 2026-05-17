const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Multi-selection algorithm panel', () => {
  let runtime, window, document, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    app = window.app = new window.Vectura.App();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  function addTwoLayers() {
    app.engine.layers = [];
    const aId = app.engine.addLayer('wavetable');
    const bId = app.engine.addLayer('wavetable');
    const a = app.engine.layers.find((l) => l.id === aId);
    const b = app.engine.layers.find((l) => l.id === bId);
    a.params.posX = 0; a.params.posY = 0; a.params.scaleX = 1; a.params.scaleY = 1; a.params.rotation = 0;
    b.params.posX = 0; b.params.posY = 0; b.params.scaleX = 1; b.params.scaleY = 1; b.params.rotation = 0;
    return { a, b };
  }

  test('multi-selection shows "Multiple Selection" header and hides algorithm dropdown + configuration', () => {
    const { a, b } = addTwoLayers();
    app.renderer.setSelection([a.id, b.id], a.id);

    const primaryTitle = document.getElementById('left-section-primary-title');
    expect(primaryTitle?.textContent).toBe('Multiple Selection');

    const trigger = document.getElementById('generator-module-trigger');
    expect(trigger?.style.display).toBe('none');

    const algoAbout = document.getElementById('algo-about');
    expect(algoAbout?.style.display).toBe('none');

    const algoConfigSection = document.getElementById('left-section-algorithm-configuration');
    expect(algoConfigSection?.style.display).toBe('none');

    const transformSection = document.getElementById('algorithm-transform-section');
    expect(transformSection?.style.display).not.toBe('none');

    const notice = document.querySelector('[data-multi-selection-notice]');
    expect(notice).toBeTruthy();
    expect(notice.textContent).toMatch(/Select a single layer/i);
  });

  test('single-selection restores algorithm dropdown, configuration, and the Algorithm title', () => {
    const { a } = addTwoLayers();
    // First go multi to apply the hide path…
    app.renderer.setSelection([a.id, app.engine.layers[1].id], a.id);
    // …then narrow to one layer.
    app.renderer.setSelection([a.id], a.id);

    expect(document.getElementById('left-section-primary-title')?.textContent).toBe('Algorithm');
    expect(document.getElementById('generator-module-trigger')?.style.display).toBe('');
    expect(document.getElementById('algo-about')?.style.display).toBe('');
    expect(document.getElementById('left-section-algorithm-configuration')?.style.display).toBe('');
    expect(document.querySelector('[data-multi-selection-notice]')).toBeNull();
  });

  test('changing posX while multi-selected updates every selected layer and regenerates paths', () => {
    const { a, b } = addTwoLayers();
    app.renderer.setSelection([a.id, b.id], a.id);

    // Spy on engine.generate to confirm every selected layer's geometry is rebuilt.
    const origGenerate = app.engine.generate.bind(app.engine);
    const generatedIds = [];
    app.engine.generate = (id) => {
      generatedIds.push(id);
      return origGenerate(id);
    };

    try {
      const posXInput = document.getElementById('inp-pos-x');
      expect(posXInput).toBeTruthy();
      posXInput.value = '42';
      posXInput.dispatchEvent(new window.Event('change', { bubbles: true }));

      expect(a.params.posX).toBe(42);
      expect(b.params.posX).toBe(42);
      expect(generatedIds).toEqual(expect.arrayContaining([a.id, b.id]));
    } finally {
      app.engine.generate = origGenerate;
    }
  });

  test('changing rotation while multi-selected updates every selected layer', () => {
    const { a, b } = addTwoLayers();
    app.renderer.setSelection([a.id, b.id], a.id);

    const rotInput = document.getElementById('inp-rotation');
    expect(rotInput).toBeTruthy();
    rotInput.value = '30';
    rotInput.dispatchEvent(new window.Event('change', { bubbles: true }));

    expect(a.params.rotation).toBe(30);
    expect(b.params.rotation).toBe(30);
  });

  test('transform inputs show a shared value and a blank "Multiple" placeholder when values differ', () => {
    const { a, b } = addTwoLayers();
    a.params.scaleX = 1;
    b.params.scaleX = 2;
    a.params.scaleY = 1.5;
    b.params.scaleY = 1.5;
    app.renderer.setSelection([a.id, b.id], a.id);

    const scaleXInput = document.getElementById('inp-scale-x');
    const scaleYInput = document.getElementById('inp-scale-y');
    // scaleX differs → blank value, "Multiple" placeholder
    expect(scaleXInput.value).toBe('');
    expect(scaleXInput.placeholder).toMatch(/Multiple/i);
    // scaleY shared → shows value, no placeholder
    expect(parseFloat(scaleYInput.value)).toBe(1.5);
    expect(scaleYInput.placeholder).toBe('');
  });
});
