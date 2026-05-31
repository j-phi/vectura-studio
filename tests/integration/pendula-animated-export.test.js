const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Phase 4: the "Export Animated SVG" action is a SEPARATE export that produces
 * a draw-on (SMIL) SVG, leaving the canonical plotter SVG untouched.
 * (No browser animation test surface exists — this is a structural assertion.)
 */
describe('Pendula — animated SVG export', () => {
  let runtime, window, document, app;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    app.engine.addLayer('pendula');
    app.ui.renderLayers();
    app.ui.buildControls();
    // stub the download plumbing so the export action runs headless
    window.URL.createObjectURL = () => 'blob:stub';
    window.URL.revokeObjectURL = () => {};
  });
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  test('the builder is loaded and the menu button is wired to exportAnimatedSVG', () => {
    expect(typeof window.Vectura.AnimatedSvg?.buildDrawOn).toBe('function');
    expect(typeof app.ui.exportAnimatedSVG).toBe('function');
    expect(document.getElementById('btn-export-animated')).toBeTruthy();
  });

  test('exportAnimatedSVG builds a draw-on SVG from the layer geometry (captured via the builder)', () => {
    // spy the builder to capture the produced SVG without depending on Blob text
    const orig = window.Vectura.AnimatedSvg.buildDrawOn;
    let captured = null;
    let polylineCount = 0;
    window.Vectura.AnimatedSvg.buildDrawOn = (polylines, opts) => {
      polylineCount = polylines.length;
      captured = orig(polylines, opts);
      return captured;
    };
    app.ui.exportAnimatedSVG();
    window.Vectura.AnimatedSvg.buildDrawOn = orig;

    expect(polylineCount).toBeGreaterThan(0);                       // real geometry collected
    expect(captured).toContain('<animate attributeName="stroke-dashoffset"');
    expect(captured).toContain('repeatCount="indefinite"');
    expect(captured).toMatch(/^<\?xml/);
  });

  test('the canonical exportSVG is NOT animated (no contamination of the plotter-ready output)', () => {
    let canonical = null;
    const origBlob = window.Blob;
    // capture the canonical SVG string from the Blob constructor
    window.Blob = function (parts, opts) {
      if (opts && opts.type === 'image/svg+xml' && !canonical) canonical = String(parts[0]);
      return new origBlob(parts, opts);
    };
    app.ui.exportSVG();
    window.Blob = origBlob;

    expect(canonical).toBeTruthy();
    expect(canonical).toContain('<svg');
    expect(canonical).not.toContain('<animate'); // canonical export stays static
  });
});
