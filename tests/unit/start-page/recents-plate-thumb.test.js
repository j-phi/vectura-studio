/**
 * Recents controller: an export too big for an SVG thumbnail (> SVG_LIMIT) records the 512 px PNG thumbnail AND a
 * display-only plate-lines SVG on the entry; a small export records the SVG thumbnail and no plate.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const { makeFakeIdb } = require('../../helpers/fake-indexeddb.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const load = ({ png = true } = {}) => {
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/png;base64,AAAA' };
  const win = {
    dispatchEvent: () => true, CustomEvent: class { constructor(t) { this.type = t; } },
    Image: class { set src(_v) { setTimeout(() => (png ? this.onload() : this.onerror()), 0); } get naturalWidth() { return 2600; } get naturalHeight() { return 1838; } },
  };
  win.window = win;
  const ctx = vm.createContext({
    window: win, document: { createElement: () => canvas, getElementById: () => null }, navigator: { platform: '', userAgent: '' },
    structuredClone, JSON, Promise, Map, Set, Date, Math, Error, Object, Array, Number, String, Float32Array, setTimeout, console,
  });
  ['src/config/start-page.js', 'src/core/recents-store.js', 'src/core/geometry-utils.js', 'src/core/start-page/art-geometry.js',
    'src/core/start-page/plate-lines.js', 'src/ui/start-page/recents.js']
    .forEach((rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel }));
  win.Vectura.SETTINGS = { paper: { color: '#f4efe4' }, pens: [{ id: 'p1', color: '#ffffff', width: 0.3 }] };
  return win.Vectura;
};

const dense = (lines) => {
  const f = (v) => v.toFixed(3);
  let body = '';
  for (let i = 0; i < lines; i += 1) {
    let d = `M 20.000 ${f(15 + i * 0.6)}`;
    for (let j = 1; j < 129; j += 1) { const x = 20 + j * 2; const y = 15 + i * 0.6 + 2 * Math.sin(j * 0.4 + i); d += ` C ${f(x - 1.3)} ${f(y)} ${f(x - 0.7)} ${f(y)} ${f(x)} ${f(y)}`; }
    body += `<g stroke-width="0.300"><path d="${d}"/></g>`;
  }
  return `<svg width="297mm" height="210mm" viewBox="0 0 297 210" xmlns="http://www.w3.org/2000/svg"><g stroke="#ffffff" fill="none">${body}</g></svg>`;
};
const mkApp = (svg) => ({ ui: { buildSvgDocument: () => ({ svg }), getAppVersion: () => '1' }, engine: { layers: [] }, captureState: () => ({}) });

describe('RecentsController.record thumbnail + plate', () => {
  it('records a PNG thumbnail plus plate lines for an oversized export', async () => {
    const V = load();
    const svg = dense(150);
    expect(svg.length).toBeGreaterThan(250 * 1024);
    const ctl = V.UI.RecentsController.create(mkApp(svg));
    const entry = await ctl.record({ name: 'statue.vectura', payload: { type: 'vectura', state: {}, images: {} } });
    expect(entry.thumb.kind).toBe('png');
    expect(entry.plate.kind).toBe('svg');
    expect(entry.plate.data.length).toBeLessThanOrEqual(V.START_PAGE.LIMITS.plateLinesBytes);
    expect(entry.plate.data).toMatch(/<rect[^>]*fill="#f4efe4"/);
    expect(V.StartPageArtGeometry.parseArtSvg(entry.plate.data).strokes).toBe(150);
  });

  it('keeps plate lines even when the PNG could not be made', async () => {
    const V = load({ png: false });
    const ctl = V.UI.RecentsController.create(mkApp(dense(150)));
    const entry = await ctl.record({ name: 'a.vectura', payload: { type: 'vectura', state: {}, images: {} } });
    expect(entry.thumb).toBeNull();
    expect(entry.plate.kind).toBe('svg');
  });

  it('a small export records the SVG thumbnail and no plate', async () => {
    const V = load();
    const ctl = V.UI.RecentsController.create(mkApp('<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><g stroke-width="0.3"><path d="M 1 1 L 5 5"/></g></svg>'));
    const entry = await ctl.record({ name: 'b.vectura', payload: { type: 'vectura', state: {}, images: {} } });
    expect(entry.thumb.kind).toBe('svg');
    expect(entry.plate).toBeNull();
  });

  it('scheduleBackfill stays off under automation or jsdom, and without the renderer; otherwise it sets one idle timer', () => {
    const V = load();
    V.StartPageArtRenderer = { renderDocument: async () => ({}) };
    V.StartPagePlateBackfill = { run: async () => ({}) };
    const ctl = V.UI.RecentsController.create(mkApp('<svg/>'));
    const t = ctl.scheduleBackfill();
    expect(t).toBeTruthy();
    clearTimeout(t);
    delete V.StartPageArtRenderer;
    expect(ctl.scheduleBackfill()).toBeNull();
  });
});
