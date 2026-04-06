const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('SVG export edge cases', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const captureSvgExport = async (runExport) => {
    let capturedBlob = null;
    runtime.window.Blob = class MockBlob {
      constructor(parts = []) {
        this.parts = parts;
      }
      text() {
        return Promise.resolve(this.parts.map((part) => `${part ?? ''}`).join(''));
      }
    };
    runtime.window.URL.createObjectURL = (blob) => {
      capturedBlob = blob;
      return 'blob:test-export-edge-cases';
    };

    const originalCreateElement = runtime.document.createElement.bind(runtime.document);
    runtime.document.createElement = (tagName, options) => {
      const el = originalCreateElement(tagName, options);
      if (`${tagName}`.toLowerCase() === 'a') el.click = () => {};
      return el;
    };

    try {
      runExport();
      expect(capturedBlob).toBeTruthy();
      return await capturedBlob.text();
    } finally {
      runtime.document.createElement = originalCreateElement;
    }
  };

  const makeEngine = (layers) => ({
    currentProfile: { width: 190, height: 150 },
    layers,
    optimizeLayers() {},
  });

  test('export with an empty-path layer does not crash and produces valid SVG', async () => {
    const { UI, SETTINGS } = runtime.window.Vectura;
    SETTINGS.margin = 10;
    SETTINGS.cropExports = false;
    SETTINGS.truncate = false;
    SETTINGS.optimizationExport = false;
    SETTINGS.plotterOptimize = 0;
    SETTINGS.pens = [{ id: 'p1', name: 'Pen 1', color: 'black', width: 0.3 }];

    const engine = makeEngine([
      {
        id: 'layer-empty',
        name: 'Empty Layer',
        visible: true,
        isGroup: false,
        penId: 'p1',
        strokeWidth: 0.3,
        lineCap: 'round',
        params: { curves: false },
        paths: [],
      },
      {
        id: 'layer-data',
        name: 'Data Layer',
        visible: true,
        isGroup: false,
        penId: 'p1',
        strokeWidth: 0.3,
        lineCap: 'round',
        params: { curves: false },
        paths: [[{ x: 20, y: 20 }, { x: 80, y: 80 }]],
      },
    ]);

    const svg = await captureSvgExport(() => {
      UI.prototype.exportSVG.call({ app: { engine } });
    });

    expect(svg).toBeTruthy();
    const doc = new runtime.window.DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  });

  test('layer name with XML special characters produces well-formed SVG', async () => {
    const { UI, SETTINGS } = runtime.window.Vectura;
    SETTINGS.margin = 10;
    SETTINGS.cropExports = false;
    SETTINGS.truncate = false;
    SETTINGS.optimizationExport = false;
    SETTINGS.plotterOptimize = 0;
    SETTINGS.pens = [{ id: 'p1', name: 'Pen & Co.', color: 'black', width: 0.3 }];

    const engine = makeEngine([
      {
        id: 'layer-xml-chars',
        name: 'Layer & "Test" <one>',
        visible: true,
        isGroup: false,
        penId: 'p1',
        strokeWidth: 0.3,
        lineCap: 'round',
        params: { curves: false },
        paths: [[{ x: 10, y: 10 }, { x: 90, y: 90 }]],
      },
    ]);

    const svg = await captureSvgExport(() => {
      UI.prototype.exportSVG.call({ app: { engine } });
    });

    expect(svg).toBeTruthy();
    const doc = new runtime.window.DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    // Unescaped & in XML attribute values would cause a parse error — verify it's escaped
    expect(svg).not.toMatch(/\s(?:id|inkscape:label)="[^"]*&[^a-z#][^"]*"/);
  });
});
