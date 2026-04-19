const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('SVG export hard crop', () => {
  let runtime;

  const getPathCoords = (svg) =>
    [...svg.matchAll(/ d="([^"]+)"/g)]
      .flatMap((match) => ((match[1] || '').match(/-?\d+(?:\.\d+)?/g) || []).map(Number))
      .reduce((pairs, value, index, arr) => {
        if (index % 2 === 0 && Number.isFinite(arr[index + 1])) {
          pairs.push({ x: value, y: arr[index + 1] });
        }
        return pairs;
      }, []);

  const expectAllCoordsInsideMargin = (coords, marginRect) => {
    expect(coords.length).toBeGreaterThan(0);
    coords.forEach(({ x, y }) => {
      expect(x).toBeGreaterThanOrEqual(marginRect.minX - 1e-3);
      expect(x).toBeLessThanOrEqual(marginRect.maxX + 1e-3);
      expect(y).toBeGreaterThanOrEqual(marginRect.minY - 1e-3);
      expect(y).toBeLessThanOrEqual(marginRect.maxY + 1e-3);
    });
  };

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('Crop Exports to Margin hard-clips geometry to configured margins', async () => {
    const { UI, SETTINGS } = runtime.window.Vectura;
    SETTINGS.margin = 20;
    SETTINGS.cropExports = true;
    SETTINGS.truncate = true;
    SETTINGS.optimizationExport = false;
    SETTINGS.plotterOptimize = 0;
    SETTINGS.pens = [{ id: 'p1', name: 'P1', color: '#ff0000', width: 0.3 }];

    const layer = {
      id: 'layer-1',
      name: 'Layer 1',
      visible: true,
      isGroup: false,
      penId: 'p1',
      strokeWidth: 0.3,
      lineCap: 'round',
      params: { curves: true },
      paths: [
        [
          { x: -10, y: 75 },
          { x: 95, y: 20 },
          { x: 210, y: 75 },
        ],
        [
          { x: 95, y: -15 },
          { x: 95, y: 165 },
        ],
      ],
    };

    const engine = {
      currentProfile: { width: 190, height: 150 },
      layers: [layer],
      optimizeLayers() {},
    };

    const app = { engine, computeDisplayGeometry() {} };
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
      return 'blob:test-hard-crop';
    };

    const originalCreateElement = runtime.document.createElement.bind(runtime.document);
    runtime.document.createElement = (tagName, options) => {
      const el = originalCreateElement(tagName, options);
      if (`${tagName}`.toLowerCase() === 'a') {
        el.click = () => {};
      }
      return el;
    };

    try {
      UI.prototype.exportSVG.call({ app });

      expect(capturedBlob).toBeTruthy();
      const svg = await capturedBlob.text();

      expect(svg).not.toContain('<clipPath');
      expect(svg).not.toContain(' clip-path=');
      expect(svg).not.toContain(' Q ');
      expect(svg).toContain('stroke-linecap="butt"');

      const marginRect = {
        minX: SETTINGS.margin,
        maxX: engine.currentProfile.width - SETTINGS.margin,
        minY: SETTINGS.margin,
        maxY: engine.currentProfile.height - SETTINGS.margin,
      };
      const coords = getPathCoords(svg);
      expectAllCoordsInsideMargin(coords, marginRect);
    } finally {
      runtime.document.createElement = originalCreateElement;
    }
  });

  test('hard crop removes outside segments for repeated boundary crossings', async () => {
    const { UI, SETTINGS } = runtime.window.Vectura;
    SETTINGS.margin = 20;
    SETTINGS.cropExports = true;
    SETTINGS.truncate = true;
    SETTINGS.optimizationExport = false;
    SETTINGS.plotterOptimize = 0;
    SETTINGS.pens = [{ id: 'p1', name: 'P1', color: '#4f9cff', width: 0.4 }];

    const layer = {
      id: 'layer-crossings',
      name: 'Crossings',
      visible: true,
      isGroup: false,
      penId: 'p1',
      strokeWidth: 0.4,
      lineCap: 'round',
      params: { curves: true },
      paths: [
        [
          { x: -30, y: 50 },
          { x: 95, y: 50 },
          { x: 220, y: 50 },
          { x: 95, y: 50 },
          { x: 95, y: -30 },
          { x: 95, y: 50 },
          { x: 95, y: 200 },
          { x: 95, y: 50 },
          { x: -40, y: 160 },
          { x: 95, y: 75 },
          { x: 220, y: 160 },
        ],
        [
          { x: 0, y: 0 },
          { x: 190, y: 150 },
        ],
      ],
    };

    const engine = {
      currentProfile: { width: 190, height: 150 },
      layers: [layer],
      optimizeLayers() {},
    };
    const app = { engine, computeDisplayGeometry() {} };
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
      return 'blob:test-hard-crop-crossings';
    };

    const originalCreateElement = runtime.document.createElement.bind(runtime.document);
    runtime.document.createElement = (tagName, options) => {
      const el = originalCreateElement(tagName, options);
      if (`${tagName}`.toLowerCase() === 'a') {
        el.click = () => {};
      }
      return el;
    };

    try {
      UI.prototype.exportSVG.call({ app });
      expect(capturedBlob).toBeTruthy();
      const svg = await capturedBlob.text();

      expect(svg).not.toContain('<clipPath');
      expect(svg).not.toContain(' clip-path=');
      expect(svg).toContain('stroke-linecap="butt"');

      const marginRect = {
        minX: SETTINGS.margin,
        maxX: engine.currentProfile.width - SETTINGS.margin,
        minY: SETTINGS.margin,
        maxY: engine.currentProfile.height - SETTINGS.margin,
      };
      const coords = getPathCoords(svg);
      expectAllCoordsInsideMargin(coords, marginRect);
    } finally {
      runtime.document.createElement = originalCreateElement;
    }
  });
});
