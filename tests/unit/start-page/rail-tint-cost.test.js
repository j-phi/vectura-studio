/**
 * Start Page rail, thumbnail tint cost (src/ui/start-page/rail.js).
 * The open rail and the colophon strip show the same files, and every render used to decode each thumbnail again
 * (a 1 MB SVG data URL decoded in full just to read its viewBox, a 512 px readback and a per-pixel pass per copy).
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
// RAIL_SRC lets the RGR proof run the same test against the previous rail.js
const read = (f) => fs.readFileSync(f === 'src/ui/start-page/rail.js' && process.env.RAIL_SRC ? process.env.RAIL_SRC : path.join(ROOT, f), 'utf8');

let dom; let W; let readbacks; let decodeLens; let paints;
const heavyUri = () => {
  let body = '';
  for (let i = 0; i < 4000; i++) body += `<path d="M${i} 0L${i} ${i}L0 ${i}" stroke="#111" fill="none"/>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500">${body}</svg>`)}`;
};
const load = () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only' });
  W = dom.window; readbacks = 0; decodeLens = []; paints = 0;
  const realDecode = W.decodeURIComponent;
  W.decodeURIComponent = (v) => { decodeLens.push(String(v).length); return realDecode(v); };
  W.Image = class { set src(v) { this._s = v; this.naturalWidth = 300; this.naturalHeight = 150; Promise.resolve().then(() => this.onload && this.onload()); } get src() { return this._s; } };
  W.HTMLCanvasElement.prototype.getContext = function () {
    const cv = this;
    return {
      drawImage: () => { paints++; },
      getImageData: (x, y, w, h) => { readbacks++; return { data: new Uint8ClampedArray(w * h * 4) }; },
      putImageData: () => {},
      cv,
    };
  };
  ['src/ui/start-page/dom.js', 'src/ui/start-page/rail.js'].forEach((f) => vm.runInContext(read(f), dom.getInternalVMContext(), { filename: f }));
};
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => W.setTimeout(r, 0)); };

describe('StartPageRail thumbnail tints', () => {
  beforeEach(() => load());
  afterEach(() => dom.window.close());

  const mount = () => {
    const rail = W.Vectura.UI.StartPageRail.create();
    const { rail: r, colo } = rail.build({ paperKeys: [], paperLabel: (k) => k });
    const root = W.document.createElement('div'); root.append(r, colo); W.document.body.append(root);
    const uri = heavyUri();
    const entries = [1, 2, 3, 4].map((n) => ({ id: `e${n}`, name: `w${n}.vectura`, algorithm: 'Rings', lastOpened: n, thumb: { kind: 'svg', data: `x${n}` } }));
    const app = { engine: { layers: [] }, recents: { thumbSrc: () => uri, relativeTime: () => 'now' } };
    const cw = { ink: '#112233', paper: '#f4efe4' };
    const args = { app, root, live: false, entries, colorwayFor: () => cw };
    return { rail, root, args };
  };

  it('reads a heavy thumbnail once, however many places and renders show it', async () => {
    const { rail, root, args } = mount();
    rail.render(args); await settle();
    rail.render(args); await settle();
    expect(root.querySelectorAll('canvas.sp-tint').length).toBeGreaterThanOrEqual(8); // painted in both the rail and the strip
    expect(readbacks).toBe(1); // all four entries share one thumbnail, one ink, one paper: one readback in total
  });

  it('never decodes more than the head of a data URL to find the viewBox', async () => {
    const { rail, args } = mount();
    rail.render(args); await settle();
    expect(Math.max(0, ...decodeLens)).toBeLessThan(10000); // the URL is ~100 KB
  });

  it('still paints a 512 px tint from the viewBox', async () => {
    const { rail, root, args } = mount();
    rail.render(args); await settle();
    const cv = root.querySelector('canvas.sp-tint');
    expect(Math.max(cv.width, cv.height)).toBe(512);
    expect(cv.width / cv.height).toBeCloseTo(2, 1);
  });
});
