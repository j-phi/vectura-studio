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

/*
 * Pen models + ink edge bleed (src/render/ink-renderer.js, renderer.js
 * _paperInkPlan / _renderCollectedInk). Preview only; export untouched.
 *
 *  - a plain-pen document on paper None draws through the exact pre-model
 *    path: the call log is identical with the ink renderer unloaded;
 *  - a plain pen on realistic paper, zoomed in, is drawn as a filled ribbon
 *    (edge bleed applies to plain pens too);
 *  - ribbon edges are in document mm: identical across pans, and the samples
 *    of a coarser zoom bucket are exactly a subset of a finer one's;
 *  - nothing is scheduled once the cache covers the view (no idle repaint).
 */
describe('pen models: ink renderer integration', () => {
  class Mat {
    constructor(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) { Object.assign(this, { a, b, c, d, e, f }); }
    multiply(m) {
      return new Mat(this.a * m.a + this.c * m.b, this.b * m.a + this.d * m.b, this.a * m.c + this.c * m.d,
        this.b * m.c + this.d * m.d, this.a * m.e + this.c * m.f + this.e, this.b * m.e + this.d * m.f + this.f);
    }
    translate(x, y) { return this.multiply(new Mat(1, 0, 0, 1, x, y)); }
    scale(sx, sy = sx) { return this.multiply(new Mat(sx, 0, 0, sy, 0, 0)); }
  }
  // Recording 2D context (transform-tracking) for the main canvas and every
  // scratch canvas the ink renderer uses.
  const recordingCtx = (canvas) => {
    const calls = [];
    let m = new Mat();
    const stack = [];
    const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, shadowBlur: 0, filter: 'none' };
    const snap = () => ({ ...state });
    const rec = (op) => (...args) => calls.push({ op, args, ...snap() });
    const ctx = {
      canvas,
      calls,
      getTransform: () => new Mat(m.a, m.b, m.c, m.d, m.e, m.f),
      setTransform: (a, b, c, d, e, f) => { m = typeof a === 'object' ? new Mat(a.a, a.b, a.c, a.d, a.e, a.f) : new Mat(a, b, c, d, e, f); },
      resetTransform: () => { m = new Mat(); },
      translate: (x, y) => { m = m.translate(x, y); },
      scale: (x, y) => { m = m.scale(x, y); },
      save: () => stack.push({ m, s: snap() }),
      restore: () => { const top = stack.pop(); if (top) { m = top.m; Object.assign(state, top.s); } },
      moveTo: rec('moveTo'), lineTo: rec('lineTo'), arc: rec('arc'), ellipse: rec('ellipse'), closePath: rec('closePath'),
      quadraticCurveTo: rec('quadraticCurveTo'), bezierCurveTo: rec('bezierCurveTo'),
      beginPath: rec('beginPath'), fill: rec('fill'), stroke: rec('stroke'), fillRect: rec('fillRect'), clearRect: rec('clearRect'),
      drawImage: (image, ...args) => calls.push({ op: 'drawImage', image, args, ...snap() }),
      createPattern: () => ({ setTransform() {} }),
      measureText: (t = '') => ({ width: String(t).length * 7 }),
      getLineDash: () => [],
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
      isPointInPath: () => false,
      isPointInStroke: () => false,
    };
    return new Proxy(ctx, {
      get(target, key) { if (key in target) return target[key]; if (key in state) return state[key]; return () => {}; },
      set(target, key, value) { if (key in state) state[key] = value; else target[key] = value; return true; },
    });
  };

  let runtime; let window; let app; let r; let S; let V;
  const scratch = new Map();

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    window.DOMMatrix = Mat;
    V = window.Vectura;
    app = new V.App();
    r = app.renderer;
    S = V.SETTINGS;
    r.canvas.width = 800;
    r.canvas.height = 600;
    r.ready = true;
    S.margin = 2;
    // Scratch canvases record too (keyed by the renderer's scratch name).
    r._paperScratch = (name, down = 1) => {
      let c = scratch.get(name);
      if (!c) { c = { width: 800 / down, height: 600 / down }; c.ctx = recordingCtx(c); c.getContext = () => c.ctx; scratch.set(name, c); }
      c.ctx.calls.length = 0;
      r[name] = c;
      return c;
    };
    const L = new V.Layer('ink-1', 'expanded', 'Ink');
    const wave = []; for (let k = 0; k <= 80; k += 1) wave.push({ x: 20 + k * 0.5, y: 40 + Math.sin(k / 6) * 6 });
    const zig = [{ x: 20, y: 60 }, { x: 26, y: 70 }, { x: 32, y: 60 }, { x: 38, y: 70 }];
    L.paths = [wave, zig];
    L.effectivePaths = L.paths;
    L.penId = 'pen-ink';
    L.visible = true;
    app.engine.layers = [L];
  });

  afterAll(() => runtime?.cleanup?.());

  const view = (scale, ox = 0, oy = 0) => { r.scale = scale; r.offsetX = ox; r.offsetY = oy; };
  const drawWith = () => {
    const ctx = recordingCtx(r.canvas);
    const prev = r.ctx;
    r.ctx = ctx;
    try { r.draw(); } finally { r.ctx = prev; }
    return ctx.calls;
  };
  const planWith = () => {
    const prev = r.ctx;
    r.ctx = recordingCtx(r.canvas);
    try { return r._paperInkPlan(); } finally { r.ctx = prev; }
  };
  const plainPen = () => [{ id: 'pen-ink', name: 'Ink', color: '#111111', width: 0.4 }];
  // Strokes that actually paint: some path op since the previous beginPath.
  const paintedStrokes = (calls) => {
    const out = [];
    let ops = 0;
    calls.forEach((c) => {
      if (c.op === 'beginPath') ops = 0;
      else if (['moveTo', 'lineTo', 'arc', 'quadraticCurveTo', 'bezierCurveTo', 'rect'].includes(c.op)) ops += 1;
      else if (c.op === 'stroke' && ops > 0) out.push(c);
    });
    return out;
  };
  const pathOps = (calls) => calls.filter((c) => ['moveTo', 'lineTo', 'arc'].includes(c.op))
    .map((c) => c.args.map((v) => (typeof v === 'number' ? +v.toFixed(9) : v)));

  test('plain pens on paper None: no ink plan and a call log identical to the renderer without the ink code', () => {
    S.pens = plainPen();
    V.Paper.setActive({ type: 'none', color: '#fafafa' });
    view(3, 10, 10);
    expect(planWith()).toBeNull();
    const withInk = drawWith();
    const saved = { PenModel: V.PenModel, InkRenderer: V.InkRenderer };
    delete V.PenModel; delete V.InkRenderer;
    let without;
    try { without = drawWith(); } finally { Object.assign(V, saved); }
    const norm = (calls) => JSON.stringify(calls.map(({ op, args, globalAlpha, globalCompositeOperation, fillStyle, strokeStyle, lineWidth }) => ({ op, args, globalAlpha, globalCompositeOperation, fillStyle, strokeStyle, lineWidth })));
    expect(norm(withInk)).toBe(norm(without));
    expect(withInk.some((c) => c.op === 'drawImage')).toBe(false);
    expect(withInk.some((c) => c.op === 'stroke' && c.strokeStyle === '#111111')).toBe(true);
  });

  test('a plain pen on realistic paper, zoomed in, is a filled ribbon drawn straight into the ink canvas (no scratch, no extra composite)', () => {
    S.pens = plainPen();
    V.Paper.setActive(V.Paper.forType('cotton-rag'));
    V.InkRenderer.clearCache();
    view(60, -800, -2000);
    const plan = planWith();
    expect(plan.penTraits.get('pen-ink').plain).toBe(true);
    expect(plan.penTraits.get('pen-ink').tier).toBe(2);
    const main = drawWith();
    const ink = scratch.get('_paperInkCanvas').ctx.calls;
    expect(ink.some((c) => c.op === 'fill' && c.fillStyle === '#111111')).toBe(true);
    expect(ink.some((c) => c.op === 'arc')).toBe(true); // round ends
    expect(paintedStrokes(ink).some((c) => c.strokeStyle === '#111111')).toBe(false); // no native stroke (an empty beginPath/stroke is a no-op)
    // No per-pen scratch canvas and exactly one ink composite (today's cost).
    expect(scratch.has('_inkPenScratch')).toBe(false);
    const inkComposites = main.filter((c) => c.op === 'drawImage' && c.image === scratch.get('_paperInkCanvas'));
    expect(inkComposites).toHaveLength(1);
    expect(inkComposites[0].globalCompositeOperation).toBe('multiply');
    // Zoomed out the edge is sub-pixel: the plain pen keeps today's path.
    view(0.6, 0, 0);
    expect(planWith().penTraits).toBeNull();
  });

  test('ribbon edges are locked to the sheet: identical mm geometry across pans, nested across zoom buckets', () => {
    S.pens = plainPen();
    V.Paper.setActive(V.Paper.forType('cotton-rag'));
    V.InkRenderer.clearCache();
    view(60, -800, -2000);
    drawWith();
    const a = pathOps(scratch.get('_paperInkCanvas').ctx.calls);
    view(60, -837.5, -2013.25);
    drawWith();
    const b = pathOps(scratch.get('_paperInkCanvas').ctx.calls);
    expect(a.length).toBeGreaterThan(100);
    expect(b).toEqual(a);
    // Two zoom buckets: every coarse sample vertex is also a fine one (≤ 1e-6 mm).
    const IR = V.InkRenderer;
    const t = V.PenModel.resolveTraits(S.pens[0], V.Paper.effective(), V.PAPERS.TYPES['cotton-rag']);
    const flat = IR.flatten(app.engine.layers[0].paths[0], false);
    const dsFine = IR.dsFor(t, 32);
    const dsCoarse = IR.dsFor(t, 8);
    expect(dsCoarse).toBe(dsFine * 4); // power-of-two spacing: samples nest
    const fine = polyVerts(IR, IR.buildRibbon(flat, t, dsFine, 1).cmds);
    const coarse = polyVerts(IR, IR.buildRibbon(flat, t, dsCoarse, 1).cmds);
    const near = (p) => fine.some((q) => Math.abs(q[0] - p[0]) <= 1e-6 && Math.abs(q[1] - p[1]) <= 1e-6);
    expect(coarse.length).toBeGreaterThan(20);
    coarse.forEach((p) => expect(near(p)).toBe(true));
    // Mutation witness: a ribbon whose edge noise followed the screen (pan)
    // would move its vertices — a shifted copy is rejected.
    expect(near([coarse[5][0] + 0.01, coarse[5][1]])).toBe(false);
  });

  const discsOf = (IR, cmds) => {
    const out = [];
    for (let i = 0; i < cmds.length;) {
      if (cmds[i] === IR.OP_POLY) i += 2 + 2 * cmds[i + 1];
      else if (cmds[i] === IR.OP_LINE) i += 3 + 2 * cmds[i + 1];
      else { out.push([cmds[i + 1], cmds[i + 2], cmds[i + 3]]); i += 4; }
    }
    return out;
  };

  // Review item 3: a gel skip is a ragged partial skip, not a dashed line.
  test('gel skips thin the ribbon to a ragged streak: no breaks, no round caps inside the line', () => {
    const IR = V.InkRenderer;
    const gel = V.PenModel.applyModel({ id: 'pen-gel', name: 'G', color: '#111111', width: 0.5 }, 'uniball-signo-broad-um153');
    gel.ink = { skips: 0.2 };
    const t = V.PenModel.resolveTraits(gel, V.Paper.forType('hot-press'), V.PAPERS.TYPES['hot-press']);
    expect(t.skipRate).toBeGreaterThan(0);
    const line = [{ x: 0, y: 50 }, { x: 120, y: 50 }];
    const ds = IR.dsFor(t, 32);
    const { cmds } = IR.buildRibbon(IR.flatten(line, false), t, ds, 1);
    const r0 = t.laidW / 2;
    // Only the two end caps: a skip never adds round caps.
    expect(discsOf(IR, cmds)).toHaveLength(2);
    // Width profile along x: covered everywhere, thinned (not cut) in skips.
    const bins = new Map();
    polyVerts(IR, cmds).forEach(([x, y]) => {
      const b = Math.floor(x / 0.25);
      const e = bins.get(b) || [Infinity, -Infinity];
      bins.set(b, [Math.min(e[0], y), Math.max(e[1], y)]);
    });
    const widths = [];
    for (let b = 1; b < Math.floor(120 / 0.25) - 1; b += 1) {
      const e = bins.get(b);
      expect(e, `bin ${b}`).toBeTruthy();
      widths.push(e[1] - e[0]);
    }
    const thin = widths.filter((w) => w < 1.2 * r0);
    expect(thin.length).toBeGreaterThan(0); // skips exist…
    widths.forEach((w) => expect(w).toBeGreaterThan(0.2 * r0)); // …and leave a residual streak
    // Ragged: the residual width varies inside the skips.
    expect(Math.max(...thin) - Math.min(...thin)).toBeGreaterThan(0.05 * r0);
    // Lowered Signo default: about one skip per few cm, not a dash pattern.
    expect(V.PenModel.inkDefaults({ ...gel, ink: undefined }).skips).toBeLessThanOrEqual(0.015);
  });

  test('closed loops get periodic edge noise: no seam where the loop ends', () => {
    const IR = V.InkRenderer;
    const t = V.PenModel.resolveTraits({ id: 'pen-ink', name: 'Ink', color: '#111111', width: 0.4 }, V.Paper.forType('cotton-rag'), V.PAPERS.TYPES['cotton-rag']);
    const ring = [];
    for (let i = 0; i <= 64; i += 1) ring.push({ x: 50 + 20 * Math.cos((i / 64) * 2 * Math.PI), y: 50 + 20 * Math.sin((i / 64) * 2 * Math.PI) });
    ring[64] = { ...ring[0] };
    const flat = IR.flatten(ring, false);
    expect(flat.subs[0].closed).toBe(true);
    const d = discsOf(IR, IR.buildRibbon(flat, t, IR.dsFor(t, 32), 1).cmds);
    const [a, b] = d.slice(-2); // the two end caps sit on the seam
    expect(Math.abs(a[0] - b[0])).toBeLessThan(1e-6);
    expect(Math.abs(a[2] - b[2])).toBeLessThan(1e-9); // same width either side of the seam
    // Mutation witness: the same ring left open (one end nudged) has a seam.
    const open = ring.slice(0, 64).concat([{ x: ring[0].x + 1e-3, y: ring[0].y }]);
    const o = discsOf(IR, IR.buildRibbon(IR.flatten(open, false), t, IR.dsFor(t, 32), 1).cmds).slice(-2);
    expect(Math.abs(o[0][2] - o[1][2])).toBeGreaterThan(1e-4);
  });

  const polyVerts = (IR, cmds) => {
    const out = [];
    for (let i = 0; i < cmds.length;) {
      if (cmds[i] === IR.OP_POLY) { const n = cmds[i + 1]; for (let q = 0; q < n; q += 1) out.push([cmds[i + 2 + 2 * q], cmds[i + 3 + 2 * q]]); i += 2 + 2 * n; } else if (cmds[i] === IR.OP_LINE) i += 3 + 2 * cmds[i + 1]; else i += 4;
    }
    return out;
  };

  // Stacking: layers draw in order whatever pen class they use (review repro:
  // a red Posca layer UNDER a plain blue layer drew on top of it).
  const withLayers = (defs, fn) => {
    const saved = app.engine.layers;
    app.engine.layers = defs.map(([id, penId, y]) => {
      const L = new V.Layer(id, 'expanded', id);
      L.paths = [[{ x: 20, y }, { x: 60, y: y + 1 }], [{ x: 40, y: y - 10 }, { x: 40, y: y + 10 }]];
      L.effectivePaths = L.paths;
      L.penId = penId;
      L.visible = true;
      return L;
    });
    try { return fn(); } finally { app.engine.layers = saved; }
  };
  const posca = () => V.PenModel.applyModel({ id: 'pen-posca', name: 'Posca', color: '#d01010', width: 0.8 }, 'uni-posca-pc1mr');
  const blue = () => ({ id: 'pen-blue', name: 'Blue', color: '#1030d0', width: 0.4 });

  // Last call that puts red ink on the target: a red fill/stroke, or the
  // composite of a recorded canvas that holds red ink.
  const RED = '#d01010';
  const holdsRed = (img) => !!(img && img.ctx && img.ctx.calls && img.ctx.calls.some((c) => paintsRed(c)));
  const paintsRed = (c) => ((c.op === 'fill' || c.op === 'stroke') && `${c.fillStyle}|${c.strokeStyle}`.includes(RED)) || (c.op === 'drawImage' && holdsRed(c.image));
  const lastIndex = (arr, fn) => { for (let i = arr.length - 1; i >= 0; i -= 1) if (fn(arr[i])) return i; return -1; };

  test('stacking on paper None: a model pen layer under a plain pen layer is drawn first (layer order kept)', () => {
    S.pens = [posca(), blue()];
    V.Paper.setActive({ type: 'none', color: '#ffffff' });
    [3, 40].forEach((z) => { // native-stroke tier and ribbon tier
      view(z, 10, 10);
      withLayers([['bottom', 'pen-posca', 50], ['top', 'pen-blue', 52]], () => {
        const main = drawWith();
        const blueAt = main.findIndex((c) => c.op === 'stroke' && c.strokeStyle === '#1030d0');
        expect(blueAt, `zoom ${z}`).toBeGreaterThan(0);
        expect(main.findIndex(paintsRed), `zoom ${z}`).toBeGreaterThanOrEqual(0);
        // Every red paint lands before the blue layer (review repro: red drew over blue).
        expect(lastIndex(main, paintsRed), `zoom ${z}`).toBeLessThan(blueAt);
      });
      // …and swapped, the blue plain layer is under the red Posca.
      withLayers([['bottom', 'pen-blue', 50], ['top', 'pen-posca', 52]], () => {
        const main = drawWith();
        const blueAt = lastIndex(main, (c) => c.op === 'stroke' && c.strokeStyle === '#1030d0');
        expect(main.findIndex(paintsRed), `zoom ${z}`).toBeGreaterThan(blueAt);
      });
    });
  });

  test('stacking on realistic paper: opaque ink gets its own canvas between the translucent ink drawn before and after it', () => {
    S.pens = [posca(), blue()];
    V.Paper.setActive(V.Paper.forType('cold-press'));
    view(3, 10, 10);
    withLayers([['bottom', 'pen-posca', 50], ['top', 'pen-blue', 52]], () => {
      const main = drawWith();
      const order = main.filter((c) => c.op === 'drawImage' && /^_paperInkCanvas$|^_inkStack\d$/.test(nameOf(c.image))).map((c) => [nameOf(c.image), c.globalCompositeOperation]);
      // base ink canvas (empty: the Posca is the bottom layer), then the
      // opaque Posca canvas, then the plain blue ink canvas above it.
      expect(order).toEqual([['_paperInkCanvas', 'multiply'], ['_inkStack1', 'source-over'], ['_inkStack2', 'multiply']]);
      expect(scratch.get('_inkStack1').ctx.calls.some((c) => `${c.fillStyle}${c.strokeStyle}`.includes('#d01010'))).toBe(true);
      expect(scratch.get('_inkStack2').ctx.calls.some((c) => c.op === 'stroke' && c.strokeStyle === '#1030d0')).toBe(true);
    });
    // Plain pens only: one ink canvas, no stack (today's path).
    S.pens = [blue()];
    withLayers([['top', 'pen-blue', 52]], () => {
      const main = drawWith();
      expect(main.filter((c) => c.op === 'drawImage' && /^_inkStack/.test(nameOf(c.image)))).toHaveLength(0);
    });
  });

  const nameOf = (img) => { for (const [k, v] of scratch) if (v === img) return k; return ''; };

  test('a model pen on paper None draws straight onto the target with the paper blend; plain pens still stroke directly', () => {
    S.pens = [...plainPen(), V.PenModel.applyModel({ id: 'pen-sharpie', name: 'S', color: '#202022', width: 0.3 }, 'sharpie-ultra-fine')];
    const L2 = new V.Layer('ink-2', 'expanded', 'Ink 2');
    L2.paths = [[{ x: 20, y: 80 }, { x: 60, y: 82 }]];
    L2.effectivePaths = L2.paths;
    L2.penId = 'pen-sharpie';
    L2.visible = true;
    app.engine.layers.push(L2);
    try {
      V.Paper.setActive({ type: 'none', color: '#ffffff' });
      view(3, 10, 10);
      const plan = planWith();
      expect(plan.direct).toBe(true);
      expect(Array.from(plan.penTraits.keys())).toEqual(['pen-sharpie']);
      const t = plan.penTraits.get('pen-sharpie');
      const main = drawWith();
      expect(main.some((c) => c.op === 'stroke' && c.strokeStyle === '#111111')).toBe(true);
      // The dye multiplies in its absorbance colour at full alpha.
      const ink = main.filter((c) => (c.op === 'fill' || c.op === 'stroke') && c.globalCompositeOperation === 'multiply');
      expect(ink.length).toBeGreaterThan(0);
      expect(ink.some((c) => `${c.fillStyle}${c.strokeStyle}`.includes(t.inkColor) || /rgb\(/.test(`${c.fillStyle}${c.strokeStyle}`))).toBe(true);
      ink.forEach((c) => expect(c.globalAlpha).toBe(1));
      expect(main.some((c) => c.op === 'drawImage')).toBe(false); // no class canvases
    } finally {
      app.engine.layers.pop();
    }
  });

  test('idle: once the cache covers the view nothing is queued and no repaint is scheduled', async () => {
    S.pens = plainPen();
    V.Paper.setActive(V.Paper.forType('cotton-rag'));
    V.InkRenderer.clearCache();
    view(60, -800, -2000);
    drawWith();
    V.InkRenderer.flush();
    V.PaperTexture.flush();
    drawWith();
    const builds = V.InkRenderer.cacheStats().builds;
    expect(V.InkRenderer.cacheStats().queued).toBe(0);
    // Count repaint requests from the shared refine callback.
    let repaints = 0;
    const prevReady = r._paperTileReadyFn;
    r._paperTileReadyFn = () => { repaints += 1; };
    try {
      drawWith();
      expect(V.InkRenderer.cacheStats().queued).toBe(0);
      await new Promise((res) => setTimeout(res, 60));
    } finally { r._paperTileReadyFn = prevReady; }
    expect(repaints).toBe(0);
    expect(V.InkRenderer.cacheStats().builds).toBe(builds); // all hits
    // Witness: a cold cache over the same view does queue / repaint.
    V.InkRenderer.clearCache();
    const LIM = V.PEN_MODELS.LIMITS;
    const budget = LIM.buildBudgetMs; const coarse = LIM.coarseBudgetMs;
    Object.defineProperty(V.PEN_MODELS, 'LIMITS', { value: { ...LIM, buildBudgetMs: -1, coarseBudgetMs: -1 }, configurable: true, writable: true });
    try {
      drawWith();
      expect(V.InkRenderer.cacheStats().queued).toBeGreaterThan(0);
    } finally { V.PEN_MODELS.LIMITS = LIM; }
    expect(budget).toBeGreaterThan(0); expect(coarse).toBeGreaterThan(0);
    V.InkRenderer.flush();
  });

  test('LOD: sub-pixel features stay native, pools switch on the skeleton, visible edges the ribbon; no drop mid-gesture', () => {
    const IR = V.InkRenderer;
    const t = V.PenModel.resolveTraits(V.PenModel.applyModel({ id: 'p', name: 'p', color: '#000000', width: 0.4 }, 'sakura-pigma-micron'), V.Paper.forType('cold-press'), V.PAPERS.TYPES['cold-press']);
    expect(IR.tierFor(t, 1)).toBe(0);
    const pxSkeleton = 0.36 / IR.poolMm(t);
    expect(IR.tierFor(t, pxSkeleton)).toBe(1);
    expect(IR.tierFor(t, 0.8 / IR.edgeMm(t))).toBe(2);
    // While panning / pinching a ribbon pen never pops back down.
    expect(IR.tierFor(t, 1, 2, true)).toBe(2);
    expect(IR.tierFor(t, 1, 2, false)).toBe(0);
  });
});
