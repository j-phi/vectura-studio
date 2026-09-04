/**
 * CONTRACT L5 — paper-color pen-true preview (stream 2B).
 *
 * The renderer reads SETTINGS.paperPreview in the draw loop; when on, every
 * stroke resolves to the raw pen color/width with no display substitution, so
 * dark-stock previews render true. The toggle lives in document-setup.js. 2A
 * owns the SETTINGS.paperPreview default in defaults.js (absent in this tree),
 * so undefined must behave as false.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('L5 — paper preview: renderer read (draft flag + stroke resolution)', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  async function setup() {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer, SETTINGS } = runtime.window.Vectura;
    SETTINGS.pens = [{ id: 'pen-neon', name: 'Neon', color: '#39ff14', width: 0.65 }];
    delete SETTINGS.paperPreview; // simulate 2A's default key being absent
    const engine = new VectorEngine();
    engine.layers = [];
    const renderer = new Renderer('main-canvas', engine);
    renderer.scale = 1; renderer.offsetX = 0; renderer.offsetY = 0;
    return { renderer, engine, Layer, SETTINGS };
  }

  test('paperPreviewActive: undefined → false; true → true', async () => {
    const { renderer, SETTINGS } = await setup();
    expect(renderer.paperPreviewActive()).toBe(false); // undefined treated as false
    SETTINGS.paperPreview = true;
    expect(renderer.paperPreviewActive()).toBe(true);
    SETTINGS.paperPreview = false;
    expect(renderer.paperPreviewActive()).toBe(false);
  });

  test('resolvePenStroke returns the raw pen color/width, no substitution', async () => {
    const { renderer } = await setup();
    const layer = { color: '#123456', strokeWidth: 2 };
    // A known pen resolves to its true color + width.
    expect(renderer.resolvePenStroke('pen-neon', layer)).toEqual({ color: '#39ff14', width: 0.65 });
    // An unknown pen falls back to the layer's own color/width (still no
    // contrast substitution against the dark background).
    expect(renderer.resolvePenStroke('missing', layer)).toEqual({ color: '#123456', width: 2 });
  });

  test('with paperPreview on, a scene path strokes its raw pen color/width', async () => {
    const { renderer, engine, Layer, SETTINGS } = await setup();
    SETTINGS.paperPreview = true;
    SETTINGS.bgColor = '#0b0b0d'; // dark stock

    const scene = new Layer('scene-1', 'scene3d', 'Scene');
    const path = [{ x: 10, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 60 }];
    path.meta = { kind: 'sceneEdge', penId: 'pen-neon', sceneTarget: { objectId: 'obj-1' } };
    scene.paths = [path];
    scene.visible = true;
    engine.layers.push(scene);

    // Capture what the draw loop actually strokes.
    const captured = [];
    const realStroke = renderer.ctx.stroke.bind(renderer.ctx);
    renderer.ctx.stroke = () => { captured.push({ color: renderer.ctx.strokeStyle, width: renderer.ctx.lineWidth }); realStroke(); };

    expect(() => renderer.draw()).not.toThrow();
    // The neon pen's raw color + width reached the context under the flag.
    const neon = captured.find((c) => c.color === '#39ff14');
    expect(neon).toBeTruthy();
    expect(neon.width).toBe(0.65);
  });
});

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('L5 — paper preview: document-setup toggle', () => {
  let runtime, window, document;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('the toggle exists and writes SETTINGS.paperPreview', () => {
    const SETTINGS = window.Vectura.SETTINGS;
    const cb = document.getElementById('set-paper-preview');
    expect(cb).toBeTruthy();
    // Undefined default → the toggle reads as off.
    expect(cb.checked).toBe(false);

    cb.checked = true;
    cb.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(SETTINGS.paperPreview).toBe(true);

    cb.checked = false;
    cb.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(SETTINGS.paperPreview).toBe(false);
  });
});
