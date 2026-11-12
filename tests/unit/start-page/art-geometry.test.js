/*
 * Start Page art runtime — pure geometry: SVG parse, ink extent, shape-aware
 * cover crop, raster size policy, word ink-box sizing.
 */
const fs = require('fs');
const path = require('path');

const G = require('../../../src/core/start-page/art-geometry.js');
const fixture = (n) => fs.readFileSync(path.resolve(__dirname, '../../fixtures/start-page', n), 'utf8');

// A synthetic piece: a dense blob in the left third of a wide ink extent.
const makeArt = ({ blobX = 10, wide = 300, high = 100 } = {}) => {
  const polys = [];
  // sparse frame lines to define the ink extent
  polys.push(new Float32Array([0, 0, wide, 0]));
  polys.push(new Float32Array([0, high, wide, high]));
  // dense hatch near blobX
  for (let i = 0; i < 40; i++) polys.push(new Float32Array([blobX, 2 + i * 2, blobX + 40, 2 + i * 2]));
  return { vb: [0, 0, wide, high], polys, widths: new Float32Array(polys.length).fill(0.3), total: 1 };
};

describe('parseArtSvg', () => {
  test('parses a real exported piece into polylines with lengths', () => {
    const art = G.parseArtSvg(fixture('lissajous-trefoil.svg'));
    expect(art.vb).toHaveLength(4);
    expect(art.vb[2]).toBeGreaterThan(0);
    expect(art.polys.length).toBeGreaterThan(0);
    expect(art.total).toBeGreaterThan(10);
    expect(art.polys[0]).toBeInstanceOf(Float32Array);
    expect(art.widths[0]).toBeCloseTo(0.3, 2);
  });
  test('handles curves, circles and polylines', () => {
    const art = G.parseArtSvg('<svg viewBox="0 0 10 10"><g stroke-width="0.5"><path d="M 0 0 C 2 0 4 2 4 4"/><circle cx="5" cy="5" r="2"/><polyline points="0,0 5,5 9,0"/></g></svg>');
    expect(art.polys).toHaveLength(3);
    expect(art.widths[0]).toBeCloseTo(0.5, 5);
  });
});

describe('artWindow: object (whole piece, scaled up)', () => {
  // a 60x40 object in the middle of a 300x400 sheet
  const sheet = () => ({ vb: [0, 0, 300, 400], polys: [new Float32Array([120, 180, 180, 180]), new Float32Array([120, 220, 180, 220]), new Float32Array([120, 180, 120, 220]), new Float32Array([180, 180, 180, 220])], widths: new Float32Array(4).fill(0.3), total: 200 });
  test('the ink box fills the window (not the paper) and nothing is cut off', () => {
    const a = sheet();
    const w = G.artWindow(a, 400, 400, 'object');
    expect(w[2] / w[3]).toBeCloseTo(1, 5);
    expect(w[2]).toBeCloseTo(60, 4); // 60 wide ink limits a square window
    expect(w[0]).toBeLessThanOrEqual(120 + 1e-6);
    expect(w[0] + w[2]).toBeGreaterThanOrEqual(180 - 1e-6);
    expect(w[1]).toBeLessThanOrEqual(180 + 1e-6);
    expect(w[1] + w[3]).toBeGreaterThanOrEqual(220 - 1e-6);
    expect(w[0] + w[2] / 2).toBeCloseTo(150, 4);
    expect(w[1] + w[3] / 2).toBeCloseTo(200, 4);
    // contain would show the whole 300x400 sheet: object is far tighter
    expect(G.artWindow(a, 400, 400, 'contain')[3]).toBeGreaterThan(w[3] * 5);
  });
  test('a wide box widens the window around the ink; frame z zooms in', () => {
    const a = sheet();
    const w = G.artWindow(a, 800, 400, 'object');
    expect(w[2] / w[3]).toBeCloseTo(2, 5);
    expect(w[3]).toBeCloseTo(40, 4);
    expect(G.artWindow(a, 400, 400, 'object', { z: 2 })[2]).toBeCloseTo(30, 4);
  });
});

describe('artWindow: contain / cover', () => {
  test('contain shows the whole viewBox at the box aspect', () => {
    const art = makeArt();
    const w = G.artWindow(art, 400, 400, 'contain');
    expect(w[2] / w[3]).toBeCloseTo(1, 5);
    // whole 300x100 viewBox fits inside the window
    expect(w[2]).toBeGreaterThanOrEqual(300 - 1e-6);
    // centered
    expect(w[0] + w[2] / 2).toBeCloseTo(150, 4);
  });
  test('cover fills the frame: window aspect equals the box aspect and lies inside the ink box', () => {
    const art = makeArt();
    const w = G.artWindow(art, 300, 300, 'cover');
    expect(w[2] / w[3]).toBeCloseTo(1, 5);
    expect(w[2]).toBeLessThanOrEqual(300 + 1e-6);
    expect(w[3]).toBeLessThanOrEqual(100 + 1e-6);
    expect(w[0]).toBeGreaterThanOrEqual(-1e-6);
    expect(w[0] + w[2]).toBeLessThanOrEqual(300 + 1e-6);
  });
  test('cover centers on the densest region, with a pull toward the center', () => {
    const left = makeArt({ blobX: 10 });
    const wl = G.artWindow(left, 100, 100, 'cover');
    const cxLeft = wl[0] + wl[2] / 2;
    expect(cxLeft).toBeLessThan(150); // moved off center toward the blob
    expect(cxLeft).toBeGreaterThan(50 - 1e-6); // clamped inside the ink box
    const right = makeArt({ blobX: 250 });
    const wr = G.artWindow(right, 100, 100, 'cover');
    expect(wr[0] + wr[2] / 2).toBeGreaterThan(150);
  });
  test('a contained object is scaled up until its ink extent fills the frame', () => {
    // a small ring in a big viewBox: ink extent 20x20 inside 200x200
    const pts = [];
    for (let i = 0; i <= 32; i++) pts.push(100 + 10 * Math.cos(i / 32 * 6.2832), 100 + 10 * Math.sin(i / 32 * 6.2832));
    const art = { vb: [0, 0, 200, 200], polys: [new Float32Array(pts)], widths: new Float32Array([0.3]), total: 60 };
    const contain = G.artWindow(art, 200, 200, 'contain');
    const cover = G.artWindow(art, 200, 200, 'cover');
    expect(contain[2]).toBeCloseTo(200, 3);
    expect(cover[2]).toBeLessThan(25); // ~20 ink units fill the 200px frame
    expect(200 / cover[2]).toBeGreaterThan(8); // >8x px per unit vs. contain's 1x
  });
  test('frame override { z, cx, cy } zooms and recenters', () => {
    const art = makeArt();
    const base = G.artWindow(art, 100, 100, 'cover', { cx: 0.5, cy: 0.5 });
    const zoomed = G.artWindow(art, 100, 100, 'cover', { z: 2, cx: 0.5, cy: 0.5 });
    expect(zoomed[2]).toBeCloseTo(base[2] / 2, 4);
    const moved = G.artWindow(art, 100, 100, 'cover', { z: 2, cx: 0.2, cy: 0.5 });
    expect(moved[0] + moved[2] / 2).toBeLessThan(zoomed[0] + zoomed[2] / 2);
  });
  test('frame center in contain mode is a fraction of the viewBox', () => {
    const art = makeArt();
    const w = G.artWindow(art, 300, 100, 'contain', { cx: 0.25, cy: 0.5 });
    expect(w[0] + w[2] / 2).toBeCloseTo(75, 4);
  });
});

describe('denseCenter', () => {
  test('returns fractions inside the ink box and prefers the dense side', () => {
    const art = makeArt({ blobX: 10 });
    const c = G.denseCenter(art, 100, 100);
    expect(c[0]).toBeGreaterThan(0);
    expect(c[0]).toBeLessThan(0.5);
  });
  test('whole-piece window returns the center', () => {
    expect(G.denseCenter(makeArt(), 1000, 1000)).toEqual([0.5, 0.5]);
  });
});

describe('rasterPolicy: DPR x zoom with caps', () => {
  test('multiplies DPR by pinch zoom', () => {
    const p = G.rasterPolicy({ cssWidth: 400, cssHeight: 300, dpr: 2, zoom: 1.5 });
    expect(p.scale).toBeCloseTo(3, 6);
    expect(p.width).toBe(1200);
    expect(p.height).toBe(900);
  });
  test('caps the scale at 4', () => {
    expect(G.rasterPolicy({ cssWidth: 100, cssHeight: 100, dpr: 3, zoom: 3 }).scale).toBe(4);
  });
  test('caps the longest side at 4096 px', () => {
    const p = G.rasterPolicy({ cssWidth: 2000, cssHeight: 1000, dpr: 4, zoom: 1 });
    expect(p.width).toBeLessThanOrEqual(4096);
    expect(p.scale).toBeCloseTo(4096 / 2000, 6);
  });
  test('never goes below 1x and tolerates junk input', () => {
    expect(G.rasterPolicy({ cssWidth: 100, cssHeight: 100, dpr: 0.5, zoom: 0 }).scale).toBe(1);
    expect(G.rasterPolicy({ cssWidth: 0, cssHeight: 0, dpr: NaN }).width).toBe(1);
  });
});

describe('wordInkBox: real ink box incl. descenders', () => {
  const fs60 = 60;
  const metrics = { width: 220, actualBoundingBoxLeft: 2, actualBoundingBoxRight: 224, actualBoundingBoxAscent: 44, actualBoundingBoxDescent: 14, fontBoundingBoxAscent: 56, fontBoundingBoxDescent: 14 };
  test('the glyph box (ascender top to descender bottom) fits inside the canvas box', () => {
    const baseline = 50;
    const b = G.wordInkBox(metrics, { baseline, fontSize: fs60 });
    const glyphTop = baseline - metrics.actualBoundingBoxAscent;
    const glyphBottom = baseline + metrics.actualBoundingBoxDescent;
    expect(b.top).toBeLessThan(glyphTop);
    expect(b.top + b.height).toBeGreaterThan(glyphBottom);
    // text origin inside the canvas places the baseline where requested
    expect(b.top + b.ty).toBeCloseTo(baseline, 6);
    expect(b.left).toBeLessThan(0 - metrics.actualBoundingBoxLeft + 1e-6);
    expect(b.left + b.width).toBeGreaterThan(metrics.actualBoundingBoxRight);
  });
  test('descender-only overshoot (Vectura "g"-like) is not clipped when the DOM line box is shorter', () => {
    const tall = { ...metrics, actualBoundingBoxDescent: 22 };
    const b = G.wordInkBox(tall, { baseline: 50, fontSize: fs60 });
    expect(b.top + b.height).toBeGreaterThanOrEqual(50 + 22);
  });
  test('falls back to font box metrics when actual ones are missing', () => {
    const b = G.wordInkBox({ width: 100 }, { baseline: 40, fontSize: 50 });
    expect(b.width).toBeGreaterThan(100);
    expect(b.height).toBeGreaterThan(50 * 0.9);
    expect(b.glyphHeight).toBeGreaterThan(0);
  });
});

describe('lineLook', () => {
  test('denser art gets thinner, lighter lines; clamped', () => {
    const art = G.parseArtSvg(fixture('petalis-anemone.svg'));
    const small = G.lineLook(art, 120, 120, true, 0);
    const big = G.lineLook(art, 1200, 1200, true, 0);
    expect(small.lw).toBeGreaterThanOrEqual(0.34);
    expect(big.lw).toBeLessThanOrEqual(1.15);
    expect(big.lw).toBeGreaterThanOrEqual(small.lw);
    expect(small.alpha).toBeGreaterThanOrEqual(0.62);
  });
});

describe('plotEase', () => {
  test('is monotonic from 0 to 1', () => {
    let prev = -1;
    for (let k = 0; k <= 1.0001; k += 0.05) { const v = G.plotEase(Math.min(1, k)); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
    expect(G.plotEase(0)).toBe(0);
    expect(G.plotEase(1)).toBeCloseTo(1, 6);
  });
});

describe('word cover: the art window covers the whole word ink box', () => {
  // square piece with ink everywhere (grid of hatch lines), wide word box
  const square = (() => {
    const polys = [];
    for (let i = 0; i <= 50; i++) { polys.push(new Float32Array([0, i * 2, 100, i * 2])); polys.push(new Float32Array([i * 2, 0, i * 2, 100])); }
    return { vb: [0, 0, 100, 100], polys, widths: new Float32Array(polys.length).fill(0.3), total: 1 };
  })();
  test('window aspect equals the word box and spans the full ink width, inside the ink box vertically', () => {
    const box = G.wordInkBox({ width: 600, actualBoundingBoxAscent: 90, actualBoundingBoxDescent: 10, actualBoundingBoxRight: 600 }, { baseline: 100, fontSize: 120 });
    const w = G.artWindow(square, box.width, box.height, 'cover');
    expect(w[2] / w[3]).toBeCloseTo(box.width / box.height, 4);
    expect(w[0]).toBeCloseTo(0, 4);
    expect(w[0] + w[2]).toBeCloseTo(100, 4);
    expect(w[1]).toBeGreaterThanOrEqual(-1e-6);
    expect(w[1] + w[3]).toBeLessThanOrEqual(100 + 1e-6);
  });
  test('the dense-center search avoids windows with empty stretches', () => {
    // ink only in a diagonal band: the chosen window must hold ink across its width
    const polys = [];
    for (let i = 0; i < 60; i++) polys.push(new Float32Array([i * 1.6, 50 + (i - 30) * 0.2, i * 1.6 + 1.5, 50 + (i - 30) * 0.2]));
    polys.push(new Float32Array([0, 0, 1, 0]), new Float32Array([0, 100, 1, 100]));
    const art = { vb: [0, 0, 100, 100], polys, widths: new Float32Array(polys.length).fill(0.3), total: 1 };
    const w = G.artWindow(art, 600, 100, 'cover');
    expect(w[2]).toBeCloseTo(Math.min(100, w[2]), 4);
    expect(G.lengthInWindow(art, w)).toBeGreaterThan(30);
  });
});

describe('lineLook with a crop window', () => {
  test('density counts only ink inside the window', () => {
    const art = G.parseArtSvg(fixture('petalis-anemone.svg'));
    const win = G.artWindow(art, 300, 60, 'cover');
    const s = 300 / win[2];
    const withWin = G.lineLook(art, 300, 60, true, s, win);
    const whole = G.lineLook(art, 300, 60, true, s);
    expect(G.lengthInWindow(art, win)).toBeLessThan(art.total);
    expect(withWin.lw).toBeGreaterThanOrEqual(whole.lw);
  });
});

describe('artWindow: focus (a 3D piece framed on its dense body)', () => {
  // A hatched ball + shadow (dense, ~60 x 40) in the middle of a 280 x 220 sheet, with two long, sparse "ground edge" strokes
  // that stretch the plain ink box across the whole sheet and make the ball read tiny under fit 'object'.
  const scene = () => {
    const polys = [new Float32Array([20, 167, 167, 196]), new Float32Array([112, 20, 259, 49])];
    for (let i = 0; i < 60; i++) polys.push(new Float32Array([110, 60 + i * 0.7, 150, 60 + i * 0.7 + 4]));
    return { vb: [0, 0, 280, 220], polys, widths: new Float32Array(polys.length).fill(0.3), total: 1 };
  };
  test('leaves the long sparse strokes out of the frame: the ball fills the window where fit object shrinks it', () => {
    const a = scene();
    const ink = G.inkInfo(a).box;
    expect(ink[2]).toBeGreaterThan(230); // the plain ink box spans the sheet
    const box = G.focusInfo(a);
    expect(box[2]).toBeLessThan(ink[2] * 0.4);
    expect(box[0]).toBeLessThanOrEqual(110);
    expect(box[0] + box[2]).toBeGreaterThanOrEqual(150); // the whole ball is inside
    const obj = G.artWindow(a, 400, 400, 'object');
    const foc = G.artWindow(a, 400, 400, 'focus');
    expect(foc[2]).toBeLessThan(obj[2] * 0.5); // a much tighter window: the object is far larger on the plate
  });
  test('a piece with uniform ink is framed on all of it (nothing is trimmed away)', () => {
    const polys = []; for (let i = 0; i < 20; i++) polys.push(new Float32Array([0, i * 5, 100, i * 5]));
    const a = { vb: [0, 0, 100, 100], polys, widths: new Float32Array(20).fill(0.3), total: 1 };
    const box = G.focusInfo(a);
    expect(box[2]).toBeCloseTo(100, 0);
    expect(box[3]).toBeGreaterThan(90);
  });
  test('focusSvg drops the long strokes that lie mostly outside the frame and keeps the body', () => {
    let svg = '<svg viewBox="0 0 280 220"><g stroke-width="0.3"><path d="M 20 167 L 167 196"/><path d="M 112 20 L 259 49"/>';
    for (let i = 0; i < 60; i++) svg += `<path d="M 110 ${60 + i * 0.7} L 150 ${64 + i * 0.7}"/>`;
    svg += '</g></svg>';
    const out = G.focusSvg(svg);
    expect(out).not.toContain('M 20 167');
    expect(out).not.toContain('M 112 20');
    expect((out.match(/<path/g) || []).length).toBe(60);
    const flat = '<svg viewBox="0 0 100 100"><g stroke-width="0.3"><path d="M 0 10 L 100 10"/><path d="M 0 50 L 100 50"/><path d="M 0 90 L 100 90"/></g></svg>';
    expect(G.focusSvg(flat)).toBe(flat); // uniform ink: nothing dropped, same text back
  });
});
