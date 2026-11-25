/**
 * Unit tests for src/core/start-page/plate-lines.js — window.Vectura.StartPagePlateLines.
 * A display-only reduced-fidelity vector copy of a dense export SVG: flattened + simplified polylines, one absolute
 * `M x y x y ...` path per line, finest tolerance that fits the byte budget, null when nothing fits.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const load = () => {
  const win = {};
  win.window = win;
  const ctx = vm.createContext({ window: win, JSON, Math, Number, Array, Object, String, Float32Array, Error });
  ['src/config/start-page.js', 'src/core/geometry-utils.js', 'src/core/start-page/art-geometry.js', 'src/core/start-page/plate-lines.js']
    .forEach((rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel }));
  return win.Vectura;
};

// A dense export like an image-driven Wavetable: `lines` rows of 129 cubic anchors, A4 landscape, mm, 3-decimal numbers.
const denseExport = (lines = 200, anchors = 129) => {
  const f = (v) => v.toFixed(3);
  let body = '';
  for (let i = 0; i < lines; i += 1) {
    const y0 = 15 + (i * 180) / lines;
    const pt = (j) => {
      const x = 20 + (j * 257) / (anchors - 1);
      const y = y0 + 3 * Math.sin(j * 0.31 + i * 0.07) + 1.2 * Math.sin(j * 1.7 + i) + (((j * 7919 + i * 104729) % 100) / 100) * 0.4;
      return [x, y];
    };
    let d = `M ${f(pt(0)[0])} ${f(pt(0)[1])}`;
    for (let j = 1; j < anchors; j += 1) {
      const [ax, ay] = pt(j - 1); const [bx, by] = pt(j);
      d += ` C ${f(ax + (bx - ax) / 3)} ${f(ay)} ${f(bx - (bx - ax) / 3)} ${f(by)} ${f(bx)} ${f(by)}`;
    }
    body += `<g id="Wavetable_01-${i + 1}" stroke-width="0.300" stroke-linecap="butt" stroke-linejoin="round"><path d="${d}"/></g>`;
  }
  return `<?xml version="1.0" standalone="no"?><svg width="297mm" height="210mm" viewBox="0 0 297 210" xmlns="http://www.w3.org/2000/svg"><g id="pen_Pen_1" stroke="#ffffff" fill="none">${body}</g></svg>`;
};

describe('StartPagePlateLines.build', () => {
  let V; let P; let exp;
  beforeAll(() => { V = load(); P = V.StartPagePlateLines; exp = denseExport(); });

  it('exposes build and a finest-first tolerance ladder', () => {
    expect(typeof P.build).toBe('function');
    expect(P.LADDER_PX[0]).toBeLessThan(P.LADDER_PX[P.LADDER_PX.length - 1]);
    expect(P.LADDER_PX).toEqual([...P.LADDER_PX].sort((a, b) => a - b));
  });

  it('shrinks a dense export under the budget and stays parseable with the same stroke count', () => {
    expect(exp.length).toBeGreaterThan(400 * 1024);
    const budget = V.START_PAGE.LIMITS.plateLinesBytes;
    const out = P.build(exp, { paperColor: '#f4efe4' });
    expect(out).toBeTruthy();
    expect(out.bytes).toBe(out.svg.length);
    expect(out.bytes).toBeLessThanOrEqual(budget);
    const a = V.StartPageArtGeometry.parseArtSvg(out.svg);
    const full = V.StartPageArtGeometry.parseArtSvg(exp);
    expect(a.strokes).toBe(full.strokes);
    expect(out.strokes).toBe(full.strokes);
    expect(a.total).toBeGreaterThan(0);
  });

  it('keeps the viewBox aspect, rescaled so the long side is LONG_SIDE units', () => {
    const out = P.build(exp);
    const vb = /viewBox="([^"]+)"/.exec(out.svg)[1].split(' ').map(Number);
    expect(vb[0]).toBe(0); expect(vb[1]).toBe(0);
    expect(Math.max(vb[2], vb[3])).toBe(P.LONG_SIDE);
    expect(vb[2] / vb[3]).toBeCloseTo(297 / 210, 2);
  });

  it('emits one absolute path per line with only M and implicit lineto (no relative or curve commands, no huge d)', () => {
    const out = P.build(exp);
    const ds = [...out.svg.matchAll(/<path d="([^"]*)"/g)].map((m) => m[1]);
    expect(ds.length).toBe(200);
    for (const d of ds) {
      expect(d.startsWith('M')).toBe(true);
      expect(d).not.toMatch(/[A-LN-Za-z]/); // only the leading M
      expect(d.indexOf('M', 1)).toBe(-1);
      expect(d.length).toBeLessThan(20000); // ink.js rejects attribute values over 200,000 chars
    }
    expect(out.svg).toMatch(/<g stroke-width="0\.3">/); // relative stroke-width multiplier kept at 0.3
    expect(out.svg).not.toMatch(/<image|<script/);
  });

  it('puts the paper ground rect first so the page can strip it like any recents thumbnail', () => {
    const out = P.build(exp, { paperColor: '#f4efe4' });
    expect(/^<svg\b[^>]*>\s*<rect\b[^>]*fill="#f4efe4"/.test(out.svg)).toBe(true);
    expect(P.build(exp).svg).not.toMatch(/<rect/);
  });

  it('rounds to one decimal and drops consecutive duplicate points', () => {
    const out = P.build(exp);
    expect(out.svg).not.toMatch(/\d\.\d\d\d?\d*[ "]/);
    const ds = [...out.svg.matchAll(/<path d="M([^"]*)"/g)].map((m) => m[1].split(' '));
    for (const nums of ds.slice(0, 20)) {
      for (let i = 2; i < nums.length; i += 2) expect(nums[i] === nums[i - 2] && nums[i + 1] === nums[i - 1]).toBe(false);
    }
  });

  it('picks the finest tolerance that fits and a coarser one when the budget shrinks', () => {
    const loose = P.build(exp, { budget: 5 * 1024 * 1024 });
    expect(loose.tolPx).toBe(P.LADDER_PX[0]);
    const mid = P.build(exp, { budget: loose.bytes - 1 });
    expect(mid).toBeTruthy();
    expect(mid.tolPx).toBeGreaterThan(loose.tolPx);
    expect(mid.bytes).toBeLessThanOrEqual(loose.bytes - 1);
    expect(mid.points).toBeLessThan(loose.points);
    // and it is the finest rung that fits: the rung below it did not
    const rung = P.LADDER_PX.indexOf(mid.tolPx);
    const finer = P.build(exp, { budget: 5 * 1024 * 1024, ladder: [P.LADDER_PX[rung - 1]] });
    expect(finer.bytes).toBeGreaterThan(loose.bytes - 1);
  });

  it('returns null when even the coarsest tolerance does not fit, or when there is nothing to draw', () => {
    expect(P.build(exp, { budget: 2000 })).toBeNull();
    expect(P.build('<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"></svg>')).toBeNull();
    expect(P.build('')).toBeNull();
    expect(P.build(null)).toBeNull();
  });

  it('keeps per-line stroke widths as relative multipliers', () => {
    const two = '<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><g stroke="#fff" fill="none"><g stroke-width="0.300"><path d="M 5 5 L 90 40"/></g><g stroke-width="0.600"><path d="M 5 40 L 90 5"/></g></g></svg>';
    const out = P.build(two);
    const a = V.StartPageArtGeometry.parseArtSvg(out.svg);
    expect(Array.from(a.widths).map((w) => +w.toFixed(2))).toEqual([0.3, 0.6]);
  });
});
