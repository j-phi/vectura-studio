const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Renderer pen snap-to-origin', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const makeRenderer = () => {
    const { Renderer } = runtime.window.Vectura;
    const engine = {
      layers: [],
      currentProfile: { width: 240, height: 180 },
      getBounds() {
        return { width: 240, height: 180, m: 20, dW: 200, dH: 140, truncate: true };
      },
    };
    const renderer = new Renderer('main-canvas', engine);
    // Scale = 1 so world px == screen px; offsetX/Y = 0
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    // Stub canvas.getBoundingClientRect so screenToWorld works in move()
    renderer.canvas.getBoundingClientRect = () => ({ left: 0, top: 0 });
    return renderer;
  };

  const makeEvent = (clientX, clientY, metaKey = false, shiftKey = false) => ({
    clientX,
    clientY,
    metaKey,
    shiftKey,
    altKey: false,
    ctrlKey: false,
    pointerType: 'mouse',
    preventDefault() {},
    stopPropagation() {},
    target: { setPointerCapture() {}, releasePointerCapture() {} },
  });

  // Seed a penDraft with two anchors: origin at (100,100) and a second at (150,120)
  const seedDraft = (renderer) => {
    renderer.penDraft = {
      anchors: [
        { x: 100, y: 100, in: null, out: null },
        { x: 150, y: 120, in: null, out: null },
      ],
      closed: false,
    };
    renderer.isPenDragging = false;
    renderer.penDragAnchor = null;
    renderer.activeTool = 'pen';
    renderer.penMode = 'draw';
  };

  test('penSnapToOrigin is false on a fresh renderer', () => {
    const renderer = makeRenderer();
    expect(renderer.penSnapToOrigin).toBe(false);
  });

  test('move within 5px of origin snaps preview and sets penSnapToOrigin', () => {
    const renderer = makeRenderer();
    seedDraft(renderer);

    // Move cursor 3px away from origin (100,100) → within 5px threshold
    renderer.move(makeEvent(103, 100));

    expect(renderer.penSnapToOrigin).toBe(true);
    expect(renderer.penPreview).toEqual({ x: 100, y: 100 });
  });

  test('CMD held disables snap even when within 5px of origin', () => {
    const renderer = makeRenderer();
    seedDraft(renderer);

    renderer.move(makeEvent(103, 100, /* metaKey= */ true));

    expect(renderer.penSnapToOrigin).toBe(false);
    // penPreview should be the cursor position (no snap to origin)
    expect(renderer.penPreview).not.toEqual({ x: 100, y: 100 });
  });

  test('move outside 5px does not snap and penSnapToOrigin is false', () => {
    const renderer = makeRenderer();
    seedDraft(renderer);

    // Move cursor 10px away from origin
    renderer.move(makeEvent(110, 100));

    expect(renderer.penSnapToOrigin).toBe(false);
    expect(renderer.penPreview).not.toEqual({ x: 100, y: 100 });
  });

  test('single click within 5px of origin enters close-drag then commits on mouseup', () => {
    const renderer = makeRenderer();
    seedDraft(renderer);

    let committed = false;
    let closedValue = null;
    renderer.commitPenPath = function () {
      committed = true;
      closedValue = renderer.penDraft?.closed ?? null;
    };

    // Click at (103, 100) — 3px from origin (100,100), within 5px threshold
    renderer.handlePenDown({ x: 103, y: 100 }, makeEvent(103, 100));

    // On down: enters close-drag state — draft is closed but commit is deferred to mouseup
    expect(renderer.isPenCloseDragging).toBe(true);
    expect(renderer.penDraft.closed).toBe(true);
    expect(committed).toBe(false);

    // Simulating mouseup: wasCloseDrag causes commitPenPath to be called
    renderer.commitPenPath();
    expect(committed).toBe(true);
    expect(closedValue).toBe(true);
  });

  test('CMD prevents snap-close: click within 5px with CMD adds anchor instead', () => {
    const renderer = makeRenderer();
    seedDraft(renderer);

    let committed = false;
    renderer.commitPenPath = () => { committed = true; };

    const anchorsBefore = renderer.penDraft.anchors.length;
    renderer.handlePenDown({ x: 103, y: 100 }, makeEvent(103, 100, /* metaKey= */ true));

    expect(committed).toBe(false);
    expect(renderer.penDraft.anchors.length).toBe(anchorsBefore + 1);
  });

  test('penSnapToOrigin resets to false after commitPenPath', () => {
    const renderer = makeRenderer();
    seedDraft(renderer);
    renderer.penSnapToOrigin = true;

    renderer.commitPenPath();

    expect(renderer.penSnapToOrigin).toBe(false);
  });

  test('penSnapToOrigin resets to false after cancelPenPath', () => {
    const renderer = makeRenderer();
    seedDraft(renderer);
    renderer.penSnapToOrigin = true;

    renderer.cancelPenPath();

    expect(renderer.penSnapToOrigin).toBe(false);
  });
});
