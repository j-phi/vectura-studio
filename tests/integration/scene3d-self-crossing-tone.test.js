const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * RGR — THE MID-BAND MUST NOT COLLAPSE ON A SELF-CROSSING LAW.
 *
 * Five of the twelve variable-width laws draw a centreline that crosses itself
 * (a chained pen-down path, a trochoid loop, a weave). `buildRibbonRing` used to
 * dissolve that self-overlap by keeping the union's LARGEST SHELL, which threw
 * away the loop interiors that polygon-clipping had correctly returned as holes.
 * `erode` + `PenFill` then painted the swallowed area solid: the form rendered as
 * a slab with a hollow black lens and the law's pattern was gone.
 *
 * Judge C measured it on the running app (sphere r=46 detail=26, orthographic,
 * one directional light az 90 / el 30, fillDensity 60, pen 0.3 mm) as the
 * collapse of the disc's MIDDLE THIRD while both flanks saturated:
 *
 *   law            BASE mid   broken mid   BASE shadow/lit
 *   onePenDown       0.629       0.147          2.56 -> 1.25
 *   trochoidLoop     0.758       0.473          1.96 -> 2.00
 *
 * These bounds bracket the BASE build's numbers. `taperedEnds` — whose centreline
 * never crosses — is the control: it was correct before and must not move.
 *
 * The rasterizer below is deliberately hand-rolled: jsdom stubs the 2D canvas, so
 * the only way to count ink in a Vitest run is to stamp the pen ourselves.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };
const PEN = 0.3;
const PPM = 10;                      // 0.1 mm/px — three samples across the pen

describe('self-crossing ribbon laws keep their mid-band tone', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  }, 180000);
  afterAll(() => runtime.cleanup());

  const scene = (law) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'ball', name: 'Ball', primitive: 'sphere', params: { radius: 46, detail: 26 },
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.backdrop = { enabled: false };
    p.camera = {
      projection: 'orthographic', yaw: 0, pitch: 0, roll: 0,
      cameraDistance: 620, focalLength: 520, zoom: 1,
    };
    const base = { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 60, toneLaw: law } };
    p.styleTable = { scene: clone(base), byObject: { ball: clone(base) }, byFace: {} };
    p.tone = { ...clone(defaults).tone, enabled: true };
    p.lights = [{ id: 'sun', type: 'directional', azimuth: 90, elevation: 30, intensity: 1, castShadows: false }];
    return p;
  };

  /**
   * Stamp every path at the pen width into a bitmap, then report the inked
   * fraction of the disc's left / middle / right thirds. The disc is taken from
   * the ink's own bounding box: the fill covers the whole silhouette, so its
   * bbox IS the silhouette's, and every law is measured against the same circle.
   */
  const bandCoverage = (paths) => {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const p of paths) {
      for (const q of p) {
        if (q.x < minX) minX = q.x;
        if (q.x > maxX) maxX = q.x;
        if (q.y < minY) minY = q.y;
        if (q.y > maxY) maxY = q.y;
      }
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const R = Math.min(maxX - minX, maxY - minY) / 2;
    const pad = PEN * 2;
    const W = Math.ceil((maxX - minX + pad * 2) * PPM);
    const H = Math.ceil((maxY - minY + pad * 2) * PPM);
    const ink = new Uint8Array(W * H);
    const X = (v) => (v - minX + pad) * PPM;
    const Y = (v) => (v - minY + pad) * PPM;
    const rad = (PEN / 2) * PPM;
    const rad2 = rad * rad;
    const stamp = (px, py) => {
      const x0 = Math.max(0, Math.floor(px - rad));
      const x1 = Math.min(W - 1, Math.ceil(px + rad));
      const y0 = Math.max(0, Math.floor(py - rad));
      const y1 = Math.min(H - 1, Math.ceil(py + rad));
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const dx = x + 0.5 - px;
          const dy = y + 0.5 - py;
          if (dx * dx + dy * dy <= rad2) ink[y * W + x] = 1;
        }
      }
    };
    for (const p of paths) {
      for (let i = 1; i < p.length; i += 1) {
        const ax = X(p[i - 1].x); const ay = Y(p[i - 1].y);
        const bx = X(p[i].x); const by = Y(p[i].y);
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5));
        for (let s = 0; s <= steps; s += 1) stamp(ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps);
      }
    }
    // Thirds of the disc, measured inside a circle of 0.94 R so the limb's own
    // outline does not dominate the flanks.
    const rr = (R * 0.94) ** 2;
    const tot = [0, 0, 0];
    const hit = [0, 0, 0];
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const mx = x / PPM - pad + minX;
        const my = y / PPM - pad + minY;
        const dx = mx - cx;
        const dy = my - cy;
        if (dx * dx + dy * dy > rr) continue;
        const band = dx < -R / 3 ? 0 : (dx > R / 3 ? 2 : 1);
        tot[band] += 1;
        if (ink[y * W + x]) hit[band] += 1;
      }
    }
    return {
      left: hit[0] / Math.max(1, tot[0]),
      mid: hit[1] / Math.max(1, tot[1]),
      right: hit[2] / Math.max(1, tot[2]),
    };
  };

  const measure = (law) => {
    const paths = (algo.generate(scene(law), null, null, BOUNDS) || [])
      .filter((p) => Array.isArray(p) && p.length >= 2);
    expect(paths.length).toBeGreaterThan(0);
    return bandCoverage(paths);
  };

  it('onePenDown keeps its graded mid-band (BASE 0.629, slab build 0.147)', () => {
    const c = measure('onePenDown');
    // eslint-disable-next-line no-console
    console.log('onePenDown bands', JSON.stringify(c));
    expect(c.mid).toBeGreaterThan(0.45);
    expect(c.mid).toBeLessThan(0.85);
    // The slab saturated BOTH flanks and flattened the form. Shadow must still
    // read darker than the lit side by a clear margin.
    expect(c.left / Math.max(1e-6, c.right)).toBeGreaterThan(1.4);
  }, 300000);

  it('trochoidLoop keeps its graded mid-band (BASE 0.758, slab build 0.473)', () => {
    const c = measure('trochoidLoop');
    // eslint-disable-next-line no-console
    console.log('trochoidLoop bands', JSON.stringify(c));
    expect(c.mid).toBeGreaterThan(0.60);
    expect(c.mid).toBeLessThan(0.92);
  }, 300000);

  it('taperedEnds is the control — a non-crossing law must not move', () => {
    const c = measure('taperedEnds');
    // eslint-disable-next-line no-console
    console.log('taperedEnds bands', JSON.stringify(c));
    expect(c.mid).toBeGreaterThan(0.22);
    expect(c.mid).toBeLessThan(0.50);
  }, 300000);
});
