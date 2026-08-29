/*
 * RGR — SPIRAL MUST NOT PAY FOR ITS CONTINUITY IN RETRACED INK.
 *
 * Judge C measured all four fill styles on the SAME real ribbon regions:
 *
 *   style            coverage         overdraw (3 laws)     gaps > (pen/2)²
 *   concentric       0.9999-1.0000    1.28 / 1.32 / 1.53    0
 *   spiral           0.9998-0.9999    2.15 / 2.40 / 3.11    2 regions, max 0.085 mm²
 *
 * Spiral and concentric are handed the IDENTICAL contour rings — `contourPieces`
 * builds them once and both styles consume them. Every one of those differences
 * therefore comes from the two things `chainPieces` does differently for spiral:
 *
 *   1. ORDER. Pieces arrive sorted by LEVEL, so a region with several lobes (any
 *      region with holes: the outer wall and each hole wall contour separately)
 *      is walked lobe-A-outer, lobe-B-outer, …, lobe-A-next, lobe-B-next, …
 *      Concentric LIFTS the pen on a hop over `bridgeMax`. Spiral is continuous,
 *      so every one of those hops becomes a routed walk back across the region,
 *      retracing ink that is already down.
 *   2. BLEND. `applyBlend` morphs the last 30% of each ring onto the next one.
 *      On the OUTERMOST pass there is no outer neighbour to cover the vacated
 *      strip, so the region's own edge is left bare — which is exactly why
 *      spiral is the only style with gaps while sharing concentric's rings.
 *
 * The holey disc below is the smallest fixture with more than one lobe per
 * level, which is all it takes to reproduce both.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const PenFill = require('../../src/core/pen-fill.js');

describe('PenFill spiral — efficiency and continuity', () => {
  let runtime;
  let deps;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    deps = { geometry: runtime.window.Vectura.GeometryUtils, boolean: runtime.window.Vectura.FillBoolean };
  }, 120000);
  afterAll(() => runtime.cleanup());

  const PEN = 0.3;
  const circle = (cx, cy, r, n, cw) => {
    const pts = [];
    for (let i = 0; i < n; i += 1) {
      const t = ((cw ? -i : i) / n) * Math.PI * 2;
      pts.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
    }
    return pts;
  };

  // Disc with three holes: four contour loops at every level, one lobe.
  const holeyDisc = () => [
    circle(0, 0, 10, 220, false),
    circle(-4.5, 0, 2, 90, true),
    circle(4.5, 2.5, 2, 90, true),
    circle(2.5, -4.5, 2, 90, true),
  ];

  // Two discs joined by a neck — a genuinely single component whose contours
  // pinch apart partway down the ladder.
  const peanut = () => {
    const pts = [];
    for (let i = 0; i < 400; i += 1) {
      const t = (i / 400) * Math.PI * 2;
      const r = 7 * (1 - 0.45 * Math.cos(2 * t) ** 2 * 0);
      const x = 9 * Math.cos(t);
      const y = 5 * Math.sin(t) * (0.35 + 0.65 * Math.abs(Math.cos(t)));
      pts.push({ x: x * (r / 7), y: y * (r / 7) });
    }
    return [pts];
  };

  const ringArea = (ring) => {
    let s = 0;
    for (let i = 0, n = ring.length; i < n; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      s += a.x * b.y - b.x * a.y;
    }
    return Math.abs(s / 2);
  };

  // Rasterize at 4 samples per pen (the contract's own grade) and report
  // coverage, the largest uncovered interior blob, and the overdraw ratio.
  const grade = (region, res) => {
    const PPM = 4 / PEN;
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    region.forEach((r) => r.forEach((p) => {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }));
    const pad = PEN * 2;
    const W = Math.ceil((maxX - minX + pad * 2) * PPM);
    const H = Math.ceil((maxY - minY + pad * 2) * PPM);
    const X = (v) => (v - minX + pad) * PPM;
    const Y = (v) => (v - minY + pad) * PPM;
    // region mask by even-odd point test on the ring set
    const inRegion = (x, y) => {
      let inside = false;
      for (const ring of region) {
        let hit = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
          const a = ring[i]; const b = ring[j];
          if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
        }
        if (hit) inside = !inside;
      }
      return inside;
    };
    const reg = new Uint8Array(W * H);
    const ink = new Uint8Array(W * H);
    for (let j = 0; j < H; j += 1) {
      for (let i = 0; i < W; i += 1) {
        if (inRegion(i / PPM - pad + minX, j / PPM - pad + minY)) reg[j * W + i] = 1;
      }
    }
    const rad = (PEN / 2) * PPM;
    const rad2 = rad * rad;
    const stamp = (px, py) => {
      for (let y = Math.max(0, Math.floor(py - rad)); y <= Math.min(H - 1, Math.ceil(py + rad)); y += 1) {
        for (let x = Math.max(0, Math.floor(px - rad)); x <= Math.min(W - 1, Math.ceil(px + rad)); x += 1) {
          const dx = x + 0.5 - px; const dy = y + 0.5 - py;
          if (dx * dx + dy * dy <= rad2) ink[y * W + x] = 1;
        }
      }
    };
    let inkLen = 0;
    for (const p of res.paths) {
      for (let i = 1; i < p.length; i += 1) {
        inkLen += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
        const ax = X(p[i - 1].x); const ay = Y(p[i - 1].y);
        const bx = X(p[i].x); const by = Y(p[i].y);
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5));
        for (let s = 0; s <= steps; s += 1) stamp(ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps);
      }
    }
    let ra = 0; let ca = 0;
    for (let k = 0; k < reg.length; k += 1) if (reg[k]) { ra += 1; if (ink[k]) ca += 1; }
    // largest uncovered 4-connected blob inside the region
    const seen = new Uint8Array(reg.length);
    let biggest = 0;
    const stack = [];
    for (let s = 0; s < reg.length; s += 1) {
      if (seen[s] || !reg[s] || ink[s]) continue;
      let sz = 0; stack.length = 0; stack.push(s); seen[s] = 1;
      while (stack.length) {
        const k = stack.pop(); sz += 1;
        const x = k % W; const y = (k - x) / W;
        const push = (t) => { if (!seen[t] && reg[t] && !ink[t]) { seen[t] = 1; stack.push(t); } };
        if (x > 0) push(k - 1);
        if (x < W - 1) push(k + 1);
        if (y > 0) push(k - W);
        if (y < H - 1) push(k + W);
      }
      if (sz > biggest) biggest = sz;
    }
    const px2 = 1 / (PPM * PPM);
    return {
      coverage: ca / Math.max(1, ra),
      gapMm2: biggest * px2,
      inkMm: inkLen,
      overdraw: (inkLen * PEN) / Math.max(1e-9, ca * px2),
      paths: res.paths.length,
      components: res.components,
    };
  };

  const run = (region, style) => grade(region, PenFill.fillRegion(region, PEN, style, { ...deps }));

  it('spiral does not retrace its way around a holey region', () => {
    const region = holeyDisc();
    const sp = run(region, 'spiral');
    const co = run(region, 'concentric');
    // eslint-disable-next-line no-console
    console.log('holeyDisc spiral', JSON.stringify(sp), 'concentric', JSON.stringify(co));
    expect(sp.coverage).toBeGreaterThan(0.995);
    // Materially closer to concentric than the 1.7x-2.4x the level-ordered
    // chain used to cost.
    expect(sp.overdraw).toBeLessThan(co.overdraw * 1.25);
  });

  it('spiral leaves no gap above (pen/2)^2 on a holey region', () => {
    const sp = run(holeyDisc(), 'spiral');
    expect(sp.gapMm2).toBeLessThan((PEN / 2) ** 2);
  });

  it('spiral returns exactly one path per connected component', () => {
    for (const region of [holeyDisc(), peanut(), [circle(0, 0, 8, 160, false)]]) {
      const res = PenFill.fillRegion(region, PEN, 'spiral', { ...deps });
      expect(res.paths.length).toBe(res.components);
    }
  });

  it('the shared contour rings still fill concentric gap-free', () => {
    const co = run(holeyDisc(), 'concentric');
    expect(co.coverage).toBeGreaterThan(0.995);
    expect(co.gapMm2).toBeLessThan((PEN / 2) ** 2);
    expect(ringArea(holeyDisc()[0])).toBeGreaterThan(0);
  });
});
