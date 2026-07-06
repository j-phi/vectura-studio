/**
 * Coordinate readout during direct-selection anchor drag (Illustrator parity).
 *
 *  - While an anchor is being dragged the X/Y chip must UPDATE LIVE to the
 *    anchor's current position (previously the chip was only shown on hover and
 *    stayed hidden/frozen for the whole drag).
 *  - A `SETTINGS.showCoordinateReadout === false` preference disables the chip
 *    entirely (hover + drag).
 *
 * Extends the SEL-4 measurement-chip machinery (showDragTooltip / lastTooltipText).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { injectSmartGuidesConfig } = require('../helpers/inject-smart-guides-config');

describe('direct-drag live coordinate readout', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  async function setup() {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    injectSmartGuidesConfig(runtime);
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const square = new Layer('read-sq', 'shape', 'Square');
    square.sourcePaths = [[
      { x: 40, y: 40 }, { x: 80, y: 40 }, { x: 80, y: 80 }, { x: 40, y: 80 }, { x: 40, y: 40 },
    ]];
    engine.layers.push(square);
    engine.generate(square.id);
    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('direct');
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    const sel = renderer.setDirectSelection(square, 0);
    return { renderer, engine, square, sel };
  }

  function primeAnchorDrag(renderer, sel, index) {
    const a = sel.anchors[index];
    renderer.directDrag = {
      type: 'anchor',
      index,
      moved: false,
      historyPushed: true,
      anchorStart: { x: a.x, y: a.y },
      otherStarts: [],
      mergeTarget: null,
      grabOffset: null,
      endpointSnapTarget: null,
      lastWorld: null,
    };
  }

  test('dragging an anchor shows a live dX/dY delta chip that tracks the pointer', async () => {
    const { renderer, sel } = await setup();
    primeAnchorDrag(renderer, sel, 0); // anchorStart = (40, 40)

    // Move to (55, 65): delta = (+15, +25) from the drag start.
    renderer.updateDirectDrag({ x: 55, y: 65 }, { clientX: 55, clientY: 65 });
    expect(renderer.lastTooltipText).toBeTruthy();
    expect(renderer.lastTooltipText).toContain('dX: 15');
    expect(renderer.lastTooltipText).toContain('dY: 25');
    expect(renderer.lastTooltipText).toContain('mm');
    // Two-line readout (newline between the axes).
    expect(renderer.lastTooltipText).toContain('\n');
    // No pink feature label while dragging.
    expect(renderer.lastAnchorLabelText).toBeNull();

    // Live: the next move updates the delta relative to the same start.
    renderer.updateDirectDrag({ x: 70, y: 50 }, { clientX: 70, clientY: 50 });
    expect(renderer.lastTooltipText).toContain('dX: 30');
    expect(renderer.lastTooltipText).toContain('dY: 10');
  });

  test('rounds the readout to 0.1 mm', async () => {
    const { renderer, sel } = await setup();
    primeAnchorDrag(renderer, sel, 0);
    // delta = (+3.16, +0) → dX rounds to 3.2 mm, dY to 0.
    renderer.updateDirectDrag({ x: 43.16, y: 40 }, { clientX: 100, clientY: 100 });
    expect(renderer.lastTooltipText).toContain('dX: 3.2');
    expect(renderer.lastTooltipText).toContain('dY: 0 ');
  });

  test('hovering a selected anchor shows the pink "anchor" label + X/Y box', async () => {
    const { renderer } = await setup();
    renderer.move({ clientX: 40, clientY: 40 });
    expect(renderer.lastTooltipText).toContain('X: 40');
    expect(renderer.lastTooltipText).toContain('Y: 40');
    expect(renderer.lastAnchorLabelText).toBe('anchor');
  });

  test('hovering the selection center reveals the center helper point', async () => {
    const { renderer, square } = await setup();
    renderer.setTool('select');
    renderer.setSelection([square.id], square.id);

    // Square spans (40,40)–(80,80); its center is (60,60).
    renderer.move({ clientX: 60, clientY: 60 });
    expect(renderer.hoverCenter).toBeTruthy();
    expect(renderer.hoverCenter.x).toBeCloseTo(60);
    expect(renderer.hoverCenter.y).toBeCloseTo(60);
    expect(renderer.lastAnchorLabelText).toBe('center');
    expect(renderer.lastTooltipText).toContain('X: 60');
    expect(renderer.lastTooltipText).toContain('Y: 60');

    // Moving off-center clears the helper point.
    renderer.move({ clientX: 45, clientY: 45 });
    expect(renderer.hoverCenter).toBeNull();
  });

  test('center helper point is available for an UNSELECTED object', async () => {
    const { renderer, engine, square } = await setup();
    // A second square (120,120)–(160,160), center (140,140), left unselected.
    const { Layer } = runtime.window.Vectura;
    const other = new Layer('read-sq2', 'shape', 'Square2');
    other.sourcePaths = [[
      { x: 120, y: 120 }, { x: 160, y: 120 }, { x: 160, y: 160 }, { x: 120, y: 160 }, { x: 120, y: 120 },
    ]];
    engine.layers.push(other);
    engine.generate(other.id);
    renderer.setTool('select');
    renderer.setSelection([square.id], square.id); // only the FIRST square selected

    renderer.move({ clientX: 140, clientY: 140 }); // hover the other object's center
    expect(renderer.hoverCenter).toBeTruthy();
    expect(renderer.hoverCenter.x).toBeCloseTo(140);
    expect(renderer.hoverCenter.y).toBeCloseTo(140);
    expect(renderer.lastAnchorLabelText).toBe('center');
  });

  test('showCenterPoint === false disables the center helper point', async () => {
    const { renderer, square } = await setup();
    runtime.window.Vectura.SETTINGS.showCenterPoint = false;
    renderer.setTool('select');
    renderer.setSelection([square.id], square.id);
    renderer.move({ clientX: 60, clientY: 60 }); // over the center
    expect(renderer.hoverCenter).toBeNull();
    runtime.window.Vectura.SETTINGS.showCenterPoint = true;
  });

  test('showCoordinateReadout === false disables the readout on drag and hover', async () => {
    const { renderer, sel } = await setup();
    runtime.window.Vectura.SETTINGS.showCoordinateReadout = false;

    // Drag: no chip.
    primeAnchorDrag(renderer, sel, 0);
    renderer.lastTooltipText = null;
    renderer.updateDirectDrag({ x: 55, y: 65 }, { clientX: 55, clientY: 65 });
    expect(renderer.lastTooltipText).toBeNull();

    // Hover: no chip either.
    renderer.directDrag = null;
    renderer.lastTooltipText = null;
    renderer.move({ clientX: 40, clientY: 40 });
    expect(renderer.lastTooltipText || null).toBeNull();
  });
});
