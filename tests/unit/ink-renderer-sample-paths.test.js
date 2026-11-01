/**
 * Pen Studio unit C — InkRenderer.drawSample gains opts.paths / paperFill /
 * originMm. The DEFAULT call (no new opts) must stay byte-identical: the
 * call-log hashes below were recorded on the pre-change renderer.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const loadRuntime = () => {
  const win = { performance: { now: () => 0 } };
  win.window = win; win.globalThis = win;
  const ctx = vm.createContext(win);
  ['src/config/papers.js', 'src/core/paper.js', 'src/config/pen-models.js', 'src/core/pen-model.js', 'src/render/ink-renderer.js'].forEach((rel) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
  });
  return win;
};

const fakeCanvas = (w = 140, h = 40) => {
  const log = [];
  const rec = (name) => (...a) => { log.push([name, ...a.map((v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v))]); };
  const state = {};
  const ctx = new Proxy({}, {
    get(_t, k) {
      if (k === 'log') return log;
      if (k in state) return state[k];
      return rec(String(k));
    },
    set(_t, k, v) { state[k] = v; log.push(['set', String(k), v]); return true; },
  });
  return { width: w, height: h, getContext: () => ctx, log };
};

const sha = (log) => crypto.createHash('sha256').update(JSON.stringify(log)).digest('hex');

describe('drawSample', () => {
  let win; let V;
  beforeAll(() => { win = loadRuntime(); V = win.Vectura; });

  const penOf = (model, size, color = '#222222') => V.PenModel.applyModel({ id: 'p1', color, width: 0.3 }, model, size);
  const paperOf = (type) => V.Paper.forType(type);

  const CASES = {
    micronBristol: () => [penOf('sakura-pigma-micron', '05'), paperOf('bristol-smooth'), {}],
    sharpieNewsprint: () => [penOf('sharpie-ultra-fine', undefined, '#aa2222'), paperOf('newsprint'), { widthMm: 14 }],
    plain: () => [{ id: 'x', color: '#336699', width: 0.5 }, undefined, { background: '#fff' }],
  };
  // Recorded on the renderer BEFORE the opts.paths change (call-log sha256).
const SNAPSHOT = {
  micronBristol: '55db9a7c1e8d4420033c88889cbde47c705b3b7d9d8db2ee85e16198091da1e7',
  sharpieNewsprint: '15acc0e291508e77fa89e8f4888e7527c2b6135e43f8e02647ac8937617f8fdb',
  plain: '52669a37b5915edd107f57eaa9d731af842209688c0949d26adb060eab07aad2',
};

  it('default call-log matches the pre-change snapshot', () => {
    
    Object.entries(CASES).forEach(([k, mk]) => {
      const [pen, paper, opts] = mk();
      const c = fakeCanvas();
      V.InkRenderer.drawSample(c, pen, paper, opts);
      expect(sha(c.log), k).toBe(SNAPSHOT[k]);
    });
  });

  it('returns false without a canvas', () => {
    expect(V.InkRenderer.drawSample(null, {}, null, { paths: [] })).toBe(false);
  });

  it('opts.paths draws each path and no sine; paperFill paints the paper first', () => {
    const pen = penOf('sakura-pigma-micron', '05');
    const paper = paperOf('bristol-smooth');
    const c = fakeCanvas();
    V.InkRenderer.drawSample(c, pen, paper, { paths: [{ pts: [{ x: 1, y: 1 }, { x: 10, y: 1 }] }, { pts: [{ x: 1, y: 3 }, { x: 10, y: 3 }] }], paperFill: true, widthMm: 14 });
    const fills = c.log.filter((e) => e[0] === 'fill').length;
    expect(fills).toBeGreaterThanOrEqual(2);
    const fsIdx = c.log.findIndex((e) => e[0] === 'set' && e[1] === 'fillStyle' && e[2] === paper.color);
    expect(fsIdx).toBeGreaterThanOrEqual(0);
    expect(c.log.findIndex((e) => e[0] === 'fillRect')).toBeLessThan(c.log.findIndex((e) => e[0] === 'fill'));
    // no sine: every moveTo y stays within the two straight paths' band
    const sineLike = fakeCanvas();
    V.InkRenderer.drawSample(sineLike, pen, paper, { widthMm: 14 });
    expect(sha(c.log)).not.toBe(sha(sineLike.log));
  });

  it('dye on light paper composites with multiply; opaque ink stays source-over', () => {
    const paper = paperOf('bristol-smooth');
    const dye = penOf('stabilo-point-88', undefined, '#d62828');
    const opq = penOf('uni-posca-pc1mr', undefined, '#d62828');
    const run = (pen) => {
      const c = fakeCanvas();
      V.InkRenderer.drawSample(c, pen, paper, { paths: [{ pts: [{ x: 1, y: 1 }, { x: 10, y: 1 }] }], widthMm: 14 });
      return c.log.filter((e) => e[0] === 'set' && e[1] === 'globalCompositeOperation').map((e) => e[2]);
    };
    const tm = V.PenModel.modelOf(dye); const to = V.PenModel.modelOf(opq);
    if (tm && tm.blend !== 'source-over') expect(run(dye)).toContain('multiply');
    if (to) expect(run(opq)).not.toContain('multiply');
  });

  it('per-path pen override resolves its own traits', () => {
    const paper = paperOf('bristol-smooth');
    const a = penOf('uni-posca-pc1mr', undefined, '#111111');
    const b = { ...penOf('uni-posca-pc1mr', undefined, '#aa0000'), id: 'p2' };
    const c = fakeCanvas();
    V.InkRenderer.drawSample(c, a, paper, { paths: [{ pts: [{ x: 1, y: 1 }, { x: 10, y: 1 }] }, { pts: [{ x: 1, y: 3 }, { x: 10, y: 3 }], pen: b }], widthMm: 14 });
    const styles = c.log.filter((e) => e[0] === 'set' && e[1] === 'fillStyle').map((e) => e[2]);
    expect(styles).toContain('#111111');
    expect(styles).toContain('#aa0000');
  });
});
