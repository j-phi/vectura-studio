const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('SVG export sanitization', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('sanitizes pen/layer identifiers and prevents attribute injection', async () => {
    const { UI, SETTINGS } = runtime.window.Vectura;
    SETTINGS.margin = 10;
    SETTINGS.cropExports = false;
    SETTINGS.truncate = false;
    SETTINGS.optimizationExport = false;
    SETTINGS.plotterOptimize = 0;
    SETTINGS.pens = [
      {
        id: 'p1',
        name: 'Pen <script>alert(1)</script>',
        color: 'red" onload="alert(1)',
        width: 0.3,
      },
    ];

    const layer = {
      id: 'layer-1',
      name: 'Layer \"><script>alert(2)</script>',
      visible: true,
      isGroup: false,
      penId: 'p1',
      strokeWidth: 0.3,
      lineCap: 'round',
      params: { curves: false },
      paths: [
        [
          { x: 20, y: 20 },
          { x: 60, y: 60 },
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
      return 'blob:test-export-sanitization';
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

      expect(svg).not.toContain('<script>');
      const doc = new runtime.window.DOMParser().parseFromString(svg, 'image/svg+xml');
      expect(doc.getElementsByTagName('parsererror').length).toBe(0);
      expect(doc.querySelector('[onload],[onerror],[onclick]')).toBeNull();

      const groups = [...doc.querySelectorAll('g[id]')];
      expect(groups.length).toBeGreaterThan(0);
      groups.forEach((group) => {
        const id = group.getAttribute('id');
        expect(id).toMatch(/^[A-Za-z_][A-Za-z0-9_.-]*$/);
      });

      const penGroup = groups.find((group) => `${group.getAttribute('id')}`.startsWith('pen_'));
      expect(penGroup).toBeTruthy();
      expect(penGroup.getAttribute('onload')).toBeNull();
    } finally {
      runtime.document.createElement = originalCreateElement;
    }
  });
});
