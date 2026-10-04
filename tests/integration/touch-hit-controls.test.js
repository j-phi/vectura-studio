/**
 * TUX-024: finger-sized pen close, anchor, handle, corner-widget and light targets, a
 * touch-aware double-tap, nearest-wins for touch, and the phantom duplicate anchor fix.
 * Everything runs through the real renderer down/move/up path. Mouse and pen keep today's values.
 * D6 desktop parity (R4): the 'pen' pointerType is driven here with events that carry pointerType 'pen',
 * not through CDP Input.dispatchMouseEvent. The renderer reads only e.pointerType, so the two are equal.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('TUX-024: touch hit targets through the real renderer', () => {
  let runtime;
  let clock;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  beforeEach(() => {
    clock = 100000;
    runtime.window.performance.now = () => clock;
  });

  const evt = (x, y, pointerType, timeStamp = 0) => ({
    clientX: x,
    clientY: y,
    pointerType,
    pointerId: pointerType === 'touch' ? 7 : 1,
    isPrimary: true,
    button: 0,
    buttons: 1,
    timeStamp,
    cancelable: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    preventDefault() {},
    stopPropagation() {},
    target: { setPointerCapture() {}, releasePointerCapture() {} },
  });

  const makeRenderer = () => {
    const { VectorEngine, Renderer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const renderer = new Renderer('main-canvas', engine);
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    renderer.canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 800 });
    return { renderer, engine };
  };

  // One full tap: down then up. The clock only matters for mouse/pen (performance.now).
  const tap = (renderer, x, y, pointerType, at, upAt = at + 40) => {
    clock = at;
    renderer.down(evt(x, y, pointerType, at));
    clock = upAt;
    renderer.up(evt(x, y, pointerType, upAt));
  };

  const pathLayer = (engine, anchors) => {
    const { Layer } = runtime.window.Vectura;
    const path = anchors.map((p) => ({ x: p.x, y: p.y }));
    path.meta = {
      kind: 'poly',
      closed: false,
      anchors: anchors.map((p) => ({ x: p.x, y: p.y, in: p.in || null, out: p.out || null })),
    };
    const layer = new Layer('hit-target', 'shape', 'Target');
    layer.sourcePaths = [path];
    layer.params = { curves: false, smoothing: 0, simplify: 0, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0 };
    engine.layers.push(layer);
    engine.generate(layer.id);
    return layer;
  };

  const directSetup = (anchors) => {
    const { renderer, engine } = makeRenderer();
    const layer = pathLayer(engine, anchors);
    renderer.setSelection([layer.id], layer.id);
    renderer.setTool('direct');
    renderer.setDirectSelection(layer, 0);
    return { renderer, engine, layer };
  };

  // What a press picks: the direct drag target, or null.
  const press = (renderer, x, y, pointerType) => {
    renderer.directDrag = null;
    renderer.isLightDrag = false;
    renderer.shapeCornerDrag = null;
    renderer.down(evt(x, y, pointerType, 500));
    const out = renderer.directDrag
      ? { kind: renderer.directDrag.type, index: renderer.directDrag.index }
      : renderer.shapeCornerDrag
        ? { kind: 'corner' }
        : renderer.isLightDrag
          ? { kind: 'light' }
          : null;
    renderer.up(evt(x, y, pointerType, 540));
    return out;
  };

  describe('(a) direct tool anchor grab', () => {
    const anchors = [{ x: 200, y: 200 }, { x: 400, y: 200 }, { x: 400, y: 400 }];
    test.each([
      ['touch', 15, { kind: 'anchor', index: 0 }],
      ['mouse', 15, null],
      ['mouse', 10, null],
      ['pen', 15, null],
      ['pen', 10, null],
      ['touch', 30, null],
    ])('%s %i px from anchor 0', (pointerType, d, expected) => {
      const { renderer } = directSetup(anchors);
      expect(press(renderer, 200 - d, 200, pointerType)).toEqual(expected);
    });
  });

  describe('(b) out-handle grab', () => {
    const anchors = [
      { x: 200, y: 200, out: { x: 160, y: 200 } },
      { x: 400, y: 200 },
      { x: 400, y: 400 },
    ];
    test.each([
      ['touch', { kind: 'out', index: 0 }],
      ['mouse', null],
      ['pen', null],
    ])('%s 15 px from a handle 40 px from its anchor', (pointerType, expected) => {
      const { renderer } = directSetup(anchors);
      expect(press(renderer, 160, 185, pointerType)).toEqual(expected);
    });
  });

  describe('(c) nearest wins for touch', () => {
    const near = [
      { x: 200, y: 200, out: { x: 212, y: 200 } },
      { x: 400, y: 200 },
      { x: 400, y: 400 },
    ];
    const pair = [{ x: 200, y: 200 }, { x: 220, y: 200 }, { x: 220, y: 400 }];
    test('touch at 3 px from the anchor picks the anchor', () => {
      const { renderer } = directSetup(near);
      expect(press(renderer, 203, 200, 'touch')).toEqual({ kind: 'anchor', index: 0 });
    });
    test('touch at 2 px from the handle picks the handle', () => {
      const { renderer } = directSetup(near);
      expect(press(renderer, 210, 200, 'touch')).toEqual({ kind: 'out', index: 0 });
    });
    test('touch 7 px from the second of two anchors 20 px apart picks the second', () => {
      const { renderer } = directSetup(pair);
      expect(press(renderer, 227, 193, 'touch')).toEqual({ kind: 'anchor', index: 1 });
    });
    test('touch between two anchors picks the closer one although the first is also in range', () => {
      const { renderer } = directSetup(pair);
      expect(press(renderer, 212, 193, 'touch')).toEqual({ kind: 'anchor', index: 1 });
    });
  });

  describe('(d) corner widget vs anchor on a rect', () => {
    const rectSetup = () => {
      const { Layer } = runtime.window.Vectura;
      const { renderer, engine } = makeRenderer();
      const shape = { type: 'rect', x1: 100, y1: 100, x2: 300, y2: 300, cornerRadii: [0, 0, 0, 0] };
      const layer = new Layer('rect-t', 'shape', 'Rect');
      layer.sourcePaths = [renderer.buildShapePath(shape)];
      layer.params = { curves: false, smoothing: 0, simplify: 0, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0 };
      engine.layers.push(layer);
      engine.generate(layer.id);
      renderer.setSelection([layer.id], layer.id);
      renderer.setTool('direct');
      renderer.setDirectSelection(layer, 0);
      return { renderer, layer };
    };

    test('touch 3 px outward from a vertex picks the anchor, not the corner widget', () => {
      const { renderer } = rectSetup();
      expect(press(renderer, 97, 97, 'touch')).toEqual({ kind: 'anchor', index: 0 });
    });
    test('touch on the widget position starts the corner drag', () => {
      const { renderer, layer } = rectSetup();
      const widget = renderer.getShapeCornerHandles(layer, 0)[0].point;
      expect(press(renderer, widget.x, widget.y, 'touch')).toEqual({ kind: 'corner' });
    });
    test('mouse 3 px outward from a vertex still picks the anchor', () => {
      const { renderer } = rectSetup();
      expect(press(renderer, 97, 97, 'mouse')).toEqual({ kind: 'anchor', index: 0 });
    });
  });

  describe('(d2) Select tool: corner widget vs resize handle', () => {
    const selectSetup = () => {
      const { Layer } = runtime.window.Vectura;
      const { renderer, engine } = makeRenderer();
      const shape = { type: 'rect', x1: 100, y1: 100, x2: 400, y2: 400, cornerRadii: [0, 0, 0, 0] };
      const layer = new Layer('rect-s', 'shape', 'Rect');
      layer.sourcePaths = [renderer.buildShapePath(shape)];
      layer.params = { curves: false, smoothing: 0, simplify: 0, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0 };
      engine.layers.push(layer);
      engine.generate(layer.id);
      renderer.setSelection([layer.id], layer.id);
      renderer.setTool('select');
      return { renderer, layer };
    };
    const pressSelect = (renderer, x, y, pointerType) => {
      renderer.shapeCornerDrag = null;
      renderer.dragMode = null;
      renderer.down(evt(x, y, pointerType, 500));
      const out = renderer.shapeCornerDrag ? 'corner' : (renderer.activeHandle || renderer.resizeHandle || (renderer.dragState && renderer.dragState.handle) || 'other');
      renderer.up(evt(x, y, pointerType, 540));
      return out;
    };

    test('a finger 15 px from the Select-tool corner widget grabs the widget', () => {
      const { renderer, layer } = selectSetup();
      const w = renderer.getShapeCornerHandles(layer, 0)[0].point;
      // 15 px further inward (away from the vertex), where no resize centre is nearer.
      const v = renderer.getShapeCornerHandles(layer, 0)[0].vertex;
      const dx = w.x - v.x; const dy = w.y - v.y; const len = Math.hypot(dx, dy) || 1;
      expect(pressSelect(renderer, w.x + (dx / len) * 15, w.y + (dy / len) * 15, 'touch')).toBe('corner');
    });
    test('a finger on the resize handle still resizes, not the widget', () => {
      const { renderer, layer } = selectSetup();
      const v = renderer.getShapeCornerHandles(layer, 0)[0].vertex;
      expect(pressSelect(renderer, v.x - 2, v.y - 2, 'touch')).toBe('nw');
    });
    test('mouse keeps the 7 px widget radius: 15 px off the widget grabs nothing of it', () => {
      const { renderer, layer } = selectSetup();
      const h = renderer.getShapeCornerHandles(layer, 0)[0];
      const dx = h.point.x - h.vertex.x; const dy = h.point.y - h.vertex.y; const len = Math.hypot(dx, dy) || 1;
      expect(pressSelect(renderer, h.point.x + (dx / len) * 15, h.point.y + (dy / len) * 15, 'mouse')).not.toBe('corner');
    });
  });

  describe('(e) light source vs anchor', () => {
    const tri = [{ x: 200, y: 200 }, { x: 400, y: 200 }, { x: 400, y: 400 }];
    test('touch 4 px from an anchor and 11 px from the light picks the anchor', () => {
      const { renderer } = directSetup(tri);
      renderer.lightSource = { x: 215, y: 200 };
      expect(press(renderer, 204, 200, 'touch')).toEqual({ kind: 'anchor', index: 0 });
    });
    test('touch 15 px from the light with nothing nearer grabs the light', () => {
      const { renderer } = directSetup(tri);
      renderer.lightSource = { x: 110, y: 100 };
      expect(press(renderer, 110, 115, 'touch')).toEqual({ kind: 'light' });
    });
    test('mouse 15 px from the light does not grab it', () => {
      const { renderer } = directSetup(tri);
      renderer.lightSource = { x: 110, y: 100 };
      expect(press(renderer, 110, 115, 'mouse')).toBeNull();
    });
    test('mouse on the light still grabs it', () => {
      const { renderer } = directSetup(tri);
      renderer.lightSource = { x: 110, y: 100 };
      expect(press(renderer, 114, 100, 'mouse')).toEqual({ kind: 'light' });
    });
  });

  describe('(f) mouse parity, hard-coded from the pre-change run', () => {
    const near = [
      { x: 200, y: 200, out: { x: 212, y: 200 } },
      { x: 400, y: 200 },
      { x: 400, y: 400 },
    ];
    const pair = [{ x: 200, y: 200 }, { x: 220, y: 200 }, { x: 220, y: 400 }];
    test('mouse 3 px from the anchor, handle 9 px away', () => {
      expect(press(directSetup(near).renderer, 203, 200, 'mouse')).toEqual({ kind: 'anchor', index: 0 });
    });
    test('mouse 2 px from the handle', () => {
      expect(press(directSetup(near).renderer, 210, 200, 'mouse')).toEqual({ kind: 'out', index: 0 });
    });
    test('mouse 7 px from the second of two anchors 20 px apart', () => {
      expect(press(directSetup(pair).renderer, 227, 193, 'mouse')).toBeNull();
    });
    test('mouse 4 px from an anchor and 11 px from the light', () => {
      const { renderer } = directSetup(near);
      renderer.lightSource = { x: 215, y: 200 };
      expect(press(renderer, 204, 200, 'mouse')).toEqual({ kind: 'anchor', index: 0 });
    });
  });

  // ── Pen tool ───────────────────────────────────────────────────────────────
  const penSetup = () => {
    const s = makeRenderer();
    const done = [];
    s.renderer.onPenComplete = (r) => done.push(r);
    s.renderer.setTool('pen');
    s.renderer.penMode = 'draw';
    s.done = done;
    return s;
  };

  describe('(g) double-tap uses e.timeStamp for touch and performance.now for mouse', () => {
    test('touch: 300 ms apart by timeStamp is a double-tap although performance.now moved 900 ms', () => {
      const { renderer, done } = penSetup();
      tap(renderer, 50, 50, 'touch', 1000);
      tap(renderer, 250, 50, 'touch', 3000);
      tap(renderer, 250, 250, 'touch', 6000);
      // Second tap of the pair: timeStamp only 300 ms later, clock 900 ms later.
      clock = 6900;
      renderer.down(evt(260, 250, 'touch', 6300));
      renderer.up(evt(260, 250, 'touch', 6340));
      expect(done).toHaveLength(1);
    });
    test('mouse: timeStamp is ignored and performance.now < 400 finishes', () => {
      const { renderer, done } = penSetup();
      tap(renderer, 50, 50, 'mouse', 1000);
      tap(renderer, 250, 50, 'mouse', 3000);
      tap(renderer, 250, 250, 'mouse', 6000);
      clock = 6300;
      renderer.down(evt(252, 250, 'mouse', 99999));
      renderer.up(evt(252, 250, 'mouse', 99999));
      expect(done).toHaveLength(1);
    });
    test('mouse: performance.now 400 ms apart is not a double-click', () => {
      const { renderer, done } = penSetup();
      tap(renderer, 50, 50, 'mouse', 1000);
      tap(renderer, 250, 50, 'mouse', 3000);
      tap(renderer, 250, 250, 'mouse', 6000);
      clock = 6400;
      renderer.down(evt(252, 250, 'mouse', 0));
      renderer.up(evt(252, 250, 'mouse', 0));
      expect(done).toHaveLength(0);
    });
  });

  describe('(h) a double-tap finish adds no duplicate anchor', () => {
    test.each([
      ['touch', 10],
      ['mouse', 4],
    ])('%s drift %i px: committed path has exactly 3 anchors', (pointerType, drift) => {
      const { renderer, done } = penSetup();
      tap(renderer, 50, 50, pointerType, 1000);
      tap(renderer, 250, 50, pointerType, 3000);
      tap(renderer, 250, 250, pointerType, 6000);
      tap(renderer, 250 + drift, 250, pointerType, 6200);
      expect(done).toHaveLength(1);
      expect(done[0].anchors).toHaveLength(3);
    });
  });

  describe('(i) finger jitter makes no handles', () => {
    const jitter = (pointerType, dx) => {
      const { renderer } = penSetup();
      tap(renderer, 50, 50, pointerType, 1000);
      clock = 3000;
      renderer.down(evt(250, 50, pointerType, 3000));
      renderer.move(evt(250 + dx, 50, pointerType, 3020));
      renderer.up(evt(250 + dx, 50, pointerType, 3040));
      return renderer.penDraft.anchors[1];
    };
    test('touch 3 px move: in and out are null', () => {
      const a = jitter('touch', 3);
      expect(a.in).toBeNull();
      expect(a.out).toBeNull();
    });
    test('mouse 3 px move still creates handles', () => {
      const a = jitter('mouse', 3);
      expect(a.out).not.toBeNull();
    });
    test('touch 12 px drag creates handles', () => {
      const a = jitter('touch', 12);
      expect(a.out).not.toBeNull();
    });
  });

  describe('close behaviour', () => {
    const threeAnchors = (pointerType) => {
      const s = penSetup();
      tap(s.renderer, 100, 100, pointerType, 1000);
      tap(s.renderer, 300, 100, pointerType, 3000);
      tap(s.renderer, 300, 300, pointerType, 5000);
      return s;
    };
    test.each([
      ['touch', 10, true],
      ['touch', 20, true],
      ['touch', 30, false],
      ['mouse', 10, false],
      ['pen', 10, false],
      ['mouse', 4, true],
    ])('%s tap %i px from the start: closes=%s', (pointerType, d, closes) => {
      const { renderer, done } = threeAnchors(pointerType);
      tap(renderer, 100 + d, 100, pointerType, 8000);
      expect(done).toHaveLength(closes ? 1 : 0);
      if (closes) {
        expect(done[0].closed).toBe(true);
        expect(done[0].anchors).toHaveLength(3);
      } else {
        expect(renderer.penDraft.anchors).toHaveLength(4);
      }
    });

    test('hover preview snaps to the start at finger range for touch only', () => {
      const t = threeAnchors('touch');
      t.renderer.move(evt(118, 100, 'touch', 6000));
      expect(t.renderer.penSnapToOrigin).toBe(true);
      const m = threeAnchors('mouse');
      m.renderer.move(evt(118, 100, 'mouse', 6000));
      expect(m.renderer.penSnapToOrigin).toBe(false);
      const p = threeAnchors('pen');
      p.renderer.move(evt(118, 100, 'pen', 6000));
      expect(p.renderer.penSnapToOrigin).toBe(false);
    });

    test('double-tap finish with 22 px drift commits with no extra anchor (touch)', () => {
      const { renderer, done } = threeAnchors('touch');
      tap(renderer, 322, 300, 'touch', 5200);
      expect(done).toHaveLength(1);
      expect(done[0].anchors).toHaveLength(3);
    });

    test('mouse double-click with 12 px drift does not finish', () => {
      const { renderer, done } = threeAnchors('mouse');
      tap(renderer, 312, 300, 'mouse', 5200);
      expect(done).toHaveLength(0);
      expect(renderer.penDraft.anchors).toHaveLength(4);
    });

    test('fast taps 30 px apart do not finish (touch)', () => {
      const { renderer, done } = threeAnchors('touch');
      tap(renderer, 330, 300, 'touch', 5200);
      tap(renderer, 370, 300, 'touch', 5400);
      expect(done).toHaveLength(0);
      expect(renderer.penDraft.anchors).toHaveLength(5);
    });
  });

  describe('(j) a quick second tap after a close does not start a new draft', () => {
    const closeThen = (pointerType, gapMs, secondX) => {
      const s = penSetup();
      tap(s.renderer, 100, 100, pointerType, 1000);
      tap(s.renderer, 300, 100, pointerType, 3000);
      tap(s.renderer, 300, 300, pointerType, 5000);
      tap(s.renderer, 105, 100, pointerType, 8000, 8040);
      expect(s.done).toHaveLength(1);
      expect(s.renderer.penDraft).toBeNull();
      tap(s.renderer, secondX, 100, pointerType, 8040 + gapMs);
      return s;
    };
    test('touch second tap 300 ms and 10 px after the commit is swallowed', () => {
      const s = closeThen('touch', 300, 115);
      expect(s.renderer.penDraft).toBeNull();
    });
    test('touch second tap 600 ms later starts a new draft', () => {
      const s = closeThen('touch', 600, 115);
      expect(s.renderer.penDraft).not.toBeNull();
    });
    test('touch second tap 300 ms later but 60 px away starts a new draft', () => {
      const s = closeThen('touch', 300, 170);
      expect(s.renderer.penDraft).not.toBeNull();
    });
  });
});
