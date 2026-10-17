/**
 * TUX-023: pointer-type aware transform-handle hit radii, drawn size and rotate affordance.
 * Mouse and Apple Pencil keep the 10 / 28 px radii and 6 px handles. Touch gets 22 / 48 px,
 * 12 px handles, a visible round rotate handle, and a small-selection nudge.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('TUX-023: touch transform-handle hit targets', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const makeRenderer = (layerList) => {
    const { Renderer } = runtime.window.Vectura;
    const engine = {
      layers: layerList,
      currentProfile: { width: 600, height: 600 },
      getBounds() {
        return { width: 600, height: 600, m: 0, dW: 600, dH: 600, truncate: false };
      },
    };
    const renderer = new Renderer('main-canvas', engine);
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    return renderer;
  };

  const boxLayer = (id, min, max) => ({
    id,
    visible: true,
    isGroup: false,
    paths: [[
      { x: min, y: min }, { x: max, y: min }, { x: max, y: max }, { x: min, y: max }, { x: min, y: min },
    ]],
    origin: { x: 0, y: 0 },
    params: { posX: 0, posY: 0, rotation: 0 },
    strokeWidth: 0.5,
  });

  const setup = (min, max) => {
    const renderer = makeRenderer([boxLayer('box', min, max)]);
    const bounds = renderer.getSelectionBounds([renderer.engine.layers[0]]);
    return { renderer, bounds };
  };

  // Offset a point outward from (cx, cy) along the (+1,+1) diagonal by a Euclidean distance d.
  const off = (cx, cy, d) => ({ x: cx + d / Math.SQRT2, y: cy + d / Math.SQRT2 });

  describe('large 200x200 box, SE corner at (300,300)', () => {
    const rows = [
      ['touch', 0, 'se'],
      ['touch', 18, 'se'],
      ['touch', 21, 'se'],
      ['touch', 23, 'rotate-se'],
      ['touch', 40, 'rotate-se'],
      ['touch', 46, 'rotate-se'],
      ['touch', 50, null],
      ['mouse', 9, 'se'],
      ['mouse', 11, 'rotate-se'],
      ['mouse', 18, 'rotate-se'],
      ['mouse', 27, 'rotate-se'],
      ['mouse', 29, null],
      ['pen', 18, 'rotate-se'],
    ];
    test.each(rows)('%s at %i px outside SE -> %s', (pointerType, d, expected) => {
      const { renderer, bounds } = setup(100, 300);
      const p = off(300, 300, d);
      expect(renderer.hitHandle(p.x, p.y, bounds, { pointerType })).toBe(expected);
    });

    test('pointer type omitted behaves as mouse', () => {
      const { renderer, bounds } = setup(100, 300);
      const p = off(300, 300, 18);
      expect(renderer.hitHandle(p.x, p.y, bounds)).toBe('rotate-se');
    });

    test('touch 14 px inside the SE corner grabs the corner', () => {
      const { renderer, bounds } = setup(100, 300);
      expect(renderer.hitHandle(290, 290, bounds, { pointerType: 'touch' })).toBe('se');
    });

    test('mouse 14 px inside the SE corner is a move (null)', () => {
      const { renderer, bounds } = setup(100, 300);
      expect(renderer.hitHandle(290, 290, bounds, { pointerType: 'mouse' })).toBeNull();
    });
  });

  describe('small 30x30 box (100..130)', () => {
    test('touch at the centre is a move (null)', () => {
      const { renderer, bounds } = setup(100, 130);
      expect(renderer.hitHandle(115, 115, bounds, { pointerType: 'touch' })).toBeNull();
    });
    test('touch exactly on the true SE corner grabs it', () => {
      const { renderer, bounds } = setup(100, 130);
      expect(renderer.hitHandle(130, 130, bounds, { pointerType: 'touch' })).toBe('se');
    });
    test('touch 15 px outside SE grabs it', () => {
      const { renderer, bounds } = setup(100, 130);
      const p = off(130, 130, 15);
      expect(renderer.hitHandle(p.x, p.y, bounds, { pointerType: 'touch' })).toBe('se');
    });
    test('touch at the true n midpoint is a move (null)', () => {
      const { renderer, bounds } = setup(100, 130);
      expect(renderer.hitHandle(115, 100, bounds, { pointerType: 'touch' })).toBeNull();
    });
    test('mouse at the centre is a move (null)', () => {
      const { renderer, bounds } = setup(100, 130);
      expect(renderer.hitHandle(115, 115, bounds, { pointerType: 'mouse' })).toBeNull();
    });
    test('getHandleHitPoints omits edge midpoints and keeps the true points for mouse', () => {
      const { renderer, bounds } = setup(100, 130);
      expect(renderer.getHandleHitPoints(bounds, 'touch').map((h) => h.key).sort()).toEqual(['ne', 'nw', 'se', 'sw']);
      expect(renderer.getHandleHitPoints(bounds, 'mouse')).toEqual(renderer.getHandlePoints(bounds));
    });
  });

  describe('tiny selections move from the centre (TUX-023 round 3)', () => {
    [4, 8, 10, 12, 14].forEach((side) => {
      test(`touch press at the centre of a ${side}px square is a move (null)`, () => {
        const { renderer, bounds } = setup(100, 100 + side);
        const c = 100 + side / 2;
        expect(renderer.hitHandle(c, c, bounds, { pointerType: 'touch' })).toBeNull();
      });
    });
  });

  describe('thin selections: edge handles are nudged off the centre (TUX-023 round 5)', () => {
    const rectLayer = (x0, y0, x1, y1) => ({
      ...boxLayer('rect', 0, 1),
      paths: [[{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }]],
    });
    const setupRect = (x0, y0, x1, y1) => {
      const renderer = makeRenderer([rectLayer(x0, y0, x1, y1)]);
      return { renderer, bounds: renderer.getSelectionBounds([renderer.engine.layers[0]]) };
    };
    [[200, 2], [200, 8], [200, 30], [200, 36], [200, 44], [2, 200], [8, 200], [30, 200], [44, 200]].forEach(([w, h]) => {
      test(`touch press at the centre of a ${w}x${h} selection is a move (null)`, () => {
        const { renderer, bounds } = setupRect(100, 100, 100 + w, 100 + h);
        expect(renderer.hitHandle(100 + w / 2, 100 + h / 2, bounds, { pointerType: 'touch' })).toBeNull();
      });
    });
    test('mouse results on a 200x30 selection are unchanged (n zone covers the centre)', () => {
      const { renderer, bounds } = setupRect(100, 100, 300, 130);
      expect(renderer.hitHandle(200, 115, bounds, { pointerType: 'mouse' })).toBeNull();
      expect(renderer.getHandleHitPoints(bounds, 'mouse')).toEqual(renderer.getHandlePoints(bounds));
    });
    test('a nudged n handle is still grabbable on a 200x30 selection', () => {
      const { renderer, bounds } = setupRect(100, 100, 300, 130);
      const n = renderer.getHandleHitPoints(bounds, 'touch').find((h) => h.key === 'n');
      expect(n.y).toBeLessThan(100);
      expect(renderer.hitHandle(n.x, n.y, bounds, { pointerType: 'touch' })).toBe('n');
    });
    test('a 300x8 selection stays grabbable at its true end corner (touch)', () => {
      const { renderer, bounds } = setupRect(100, 100, 400, 108);
      expect(renderer.hitHandle(400, 100, bounds, { pointerType: 'touch' })).toBe('ne');
    });
  });

  describe('drawn size follows the pointer type (requirement 2)', () => {
    test('a mouse move after a touch requests a redraw; a repeat does not', () => {
      const renderer = makeRenderer([boxLayer('box', 100, 300)]);
      renderer.ready = true;
      renderer.lastPointerType = 'touch';
      const draw = vi.spyOn(renderer, 'draw').mockImplementation(() => {});
      try { renderer.move({ pointerType: 'mouse', clientX: 5, clientY: 5, pointerId: 1 }); } catch (_) { /* downstream jsdom limits */ }
      expect(renderer.lastPointerType).toBe('mouse');
      expect(draw).toHaveBeenCalled();
      draw.mockClear();
      try { renderer.move({ pointerType: 'mouse', clientX: 6, clientY: 6, pointerId: 1 }); } catch (_) { /* noop */ }
      expect(draw).not.toHaveBeenCalled();
    });
    test('a touch down after a mouse requests a redraw', () => {
      const renderer = makeRenderer([boxLayer('box', 100, 300)]);
      renderer.ready = true;
      renderer.lastPointerType = 'mouse';
      const draw = vi.spyOn(renderer, 'draw').mockImplementation(() => {});
      renderer._notePointerType({ pointerType: 'touch' });
      expect(draw).toHaveBeenCalled();
    });
  });

  describe('rotate-affordance refresh is coalesced (TUX-023 round 5)', () => {
    const setupTouch = () => {
      const renderer = makeRenderer([boxLayer('box', 100, 300)]);
      renderer.lastPointerType = 'touch';
      renderer.getSelectedLayers = () => [renderer.engine.layers[0]];
      let draws = 0;
      const orig = renderer.draw.bind(renderer);
      renderer.draw = (...a) => { draws += 1; return orig(...a); };
      return { renderer, count: () => draws };
    };
    const withFakeRaf = (fn) => {
      const w = runtime.window;
      const saved = w.requestAnimationFrame;
      let queue = [];
      w.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
      const flush = () => { const q = queue; queue = []; q.forEach((cb) => cb()); };
      try { fn(flush); } finally { w.requestAnimationFrame = saved; }
    };

    test('30 pan frames with the bar re-anchoring each frame draw at most frames + 1 times', () => {
      const { renderer, count } = setupTouch();
      withFakeRaf((flush) => {
        const frames = 30;
        for (let i = 0; i < frames; i += 1) {
          // Frame order: input events (the pan redraw) run before rAF callbacks.
          renderer.offsetX += 3;
          renderer.draw();
          flush(); // rAF: the previous frame's coalesced request, then the ctxbar tick
          renderer.refreshRotateAffordance(); // ctxbar re-anchored this frame
        }
        flush();
        expect(count()).toBeLessThanOrEqual(frames + 1);
      });
    });

    test('an isolated refresh still repaints once on the next frame', () => {
      const { renderer, count } = setupTouch();
      withFakeRaf((flush) => {
        renderer.refreshRotateAffordance();
        renderer.refreshRotateAffordance();
        expect(count()).toBe(0);
        flush();
        expect(count()).toBe(1);
        flush();
        expect(count()).toBe(1);
      });
    });

    test('refresh does nothing and clears the painted record when not coarse or nothing selected', () => {
      const { renderer, count } = setupTouch();
      renderer._rotAffDrawn = { x: 1, y: 1, r: 1 };
      renderer.lastPointerType = 'mouse';
      withFakeRaf((flush) => {
        renderer.refreshRotateAffordance();
        flush();
        expect(count()).toBe(0);
      });
      expect(renderer._rotAffDrawn).toBeNull();
      renderer.lastPointerType = 'touch';
      renderer._rotAffDrawn = { x: 1, y: 1, r: 1 };
      renderer.getSelectedLayers = () => [];
      renderer.refreshRotateAffordance();
      expect(renderer._rotAffDrawn).toBeNull();
    });
  });

  describe('one tolerance source', () => {
    test('_computeRotateAffordance and hitHandle hold no numeric radius or offset literals', () => {
      const src = require('fs').readFileSync(require('path').join(__dirname, '../../src/render/renderer.js'), 'utf8');
      const grab = (name) => {
        const i = src.indexOf(`    ${name}(`);
        return src.slice(i, src.indexOf('\n    }\n', i));
      };
      ['_computeRotateAffordance', 'hitHandle', '_drawRotateAffordance'].forEach((fn) => {
        const body = grab(fn).replace(/\/\/.*$/gm, '');
        expect(body, fn).not.toMatch(/\*\s*(34|12|28|48|22)\b|\b(34|28|48)\b/);
      });
    });
  });

  describe('hitTolerance', () => {
    test('maps touch to coarse values and everything else to mouse values', () => {
      const { hitTolerance } = runtime.window.Vectura;
      expect(hitTolerance('resize', 'touch')).toBe(22);
      expect(hitTolerance('rotate', 'touch')).toBe(48);
      expect(hitTolerance('handleDraw', 'touch')).toBe(12);
      expect(hitTolerance('resize', 'pen')).toBe(10);
      expect(hitTolerance('rotate', 'pen')).toBe(28);
      expect(hitTolerance('handleDraw', undefined)).toBe(6);
      expect(hitTolerance('resize', 'mouse')).toBe(10);
    });
  });

  describe('drawing', () => {
    const drawWith = (pointerType) => {
      const { renderer, bounds } = setup(100, 300);
      renderer.lastPointerType = pointerType;
      const rects = [];
      const arcs = [];
      const ctx = renderer.ctx;
      const origRect = ctx.rect;
      const origArc = ctx.arc;
      ctx.rect = (x, y, w, h) => { rects.push({ x, y, w, h }); return origRect && origRect.call(ctx, x, y, w, h); };
      ctx.arc = (...a) => { arcs.push(a); return origArc && origArc.apply(ctx, a); };
      renderer.drawSelection(bounds, { showHandles: true });
      ctx.rect = origRect;
      ctx.arc = origArc;
      return { renderer, bounds, rects, arcs };
    };

    test('touch draws 12 px handles and a rotate affordance reachable as a rotate hit', () => {
      const { renderer, bounds, rects, arcs } = drawWith('touch');
      expect(rects.length).toBeGreaterThan(0);
      rects.forEach((r) => { expect(r.w).toBe(12); expect(r.h).toBe(12); });
      const aff = renderer.getRotateAffordance(bounds);
      expect(aff).not.toBeNull();
      expect(aff.r).toBeGreaterThanOrEqual(9);
      expect(arcs.some((a) => Math.hypot(a[0] - aff.x, a[1] - aff.y) < 1)).toBe(true);
      expect(renderer.hitHandle(aff.x, aff.y, bounds, { pointerType: 'touch' })).toMatch(/^rotate/);
      renderer.getHandleHitPoints(bounds, 'touch').forEach((h) => {
        expect(Math.hypot(aff.x - h.x, aff.y - h.y)).toBeGreaterThan(22);
      });
    });

    test('mouse draws 6 px handles and no affordance', () => {
      const { renderer, bounds, rects, arcs } = drawWith('mouse');
      expect(rects.length).toBeGreaterThan(0);
      rects.forEach((r) => { expect(r.w).toBe(6); expect(r.h).toBe(6); });
      expect(renderer.getRotateAffordance(bounds)).toBeNull();
      expect(arcs).toHaveLength(0);
    });
  });
  describe('rotate affordance fallback and cache', () => {
    const sized = (min, max, cw, ch) => {
      const { renderer, bounds } = setup(min, max);
      Object.defineProperty(renderer.canvas, 'clientWidth', { value: cw, configurable: true });
      Object.defineProperty(renderer.canvas, 'clientHeight', { value: ch, configurable: true });
      renderer.lastPointerType = 'touch';
      return { renderer, bounds };
    };

    test('a selection larger than the canvas clamps the affordance inside the canvas', () => {
      const { renderer, bounds } = sized(-500, 1500, 300, 300);
      const a = renderer.getRotateAffordance(bounds);
      expect(a).not.toBeNull();
      expect(a.x).toBeGreaterThanOrEqual(a.r);
      expect(a.x).toBeLessThanOrEqual(300 - a.r);
      expect(a.y).toBeGreaterThanOrEqual(a.r);
      expect(a.y).toBeLessThanOrEqual(300 - a.r);
    });

    test('the affordance is computed once per geometry within a frame window', () => {
      const { renderer, bounds } = sized(100, 300, 600, 600);
      const spy = vi.spyOn(renderer, '_computeRotateAffordanceUncached');
      const first = renderer.getRotateAffordance(bounds);
      renderer.getRotateAffordance(bounds);
      renderer.hitHandle(10, 10, bounds, { pointerType: 'touch' });
      expect(spy).toHaveBeenCalledTimes(1);
      renderer.scale = 2;
      const moved = renderer.getRotateAffordance(bounds);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(moved).not.toEqual(first);
    });
  });
});
