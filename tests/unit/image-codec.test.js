/**
 * ImageCodec — compact lossless noise-image storage for .vectura files, plus the save -> load
 * round trip through the real ui-file-io mixin (legacy number arrays must keep loading).
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const loadInJSDOM = (scriptPaths) => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only',
  });
  const context = dom.getInternalVMContext();
  scriptPaths.forEach((rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), context, { filename: rel }));
  return dom;
};

const pixels = (w, h, seed = 1) => {
  const a = new Uint8ClampedArray(w * h * 4);
  let s = seed;
  for (let i = 0; i < a.length; i += 1) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; a[i] = s >>> 24; }
  return a;
};

describe('ImageCodec', () => {
  let dom; let C; let win;
  beforeAll(() => {
    dom = loadInJSDOM(['src/core/utils.js', 'src/core/image-codec.js', 'src/ui/ui-file-io.js']);
    win = dom.window;
    C = win.Vectura.ImageCodec;
  });
  afterAll(() => dom.window.close());

  it('round-trips bytes through the base64 form losslessly (incl. odd lengths)', () => {
    const img = { width: 3, height: 5, data: pixels(3, 5, 7) }; // 60 bytes
    const enc = C.encodeAll({ a: img }).a;
    expect(enc).toMatchObject({ width: 3, height: 5, encoding: 'rgba8-base64' });
    expect(typeof enc.data).toBe('string');
    const back = C.decodeAll({ a: enc }).a;
    expect(back.width).toBe(3);
    expect(back.data).toBeInstanceOf(win.Uint8ClampedArray);
    expect(Array.from(back.data)).toEqual(Array.from(img.data));
    const big = pixels(300, 200, 3); // multi-chunk
    expect(Array.from(C.decodeAll({ b: C.encodeAll({ b: { width: 300, height: 200, data: big } }).b }).b.data)).toEqual(Array.from(big));
  });

  it('writes a byte-identical later image as a sameAs ref and decodes it to the same bytes', () => {
    const d = pixels(8, 8, 2);
    const enc = C.encodeAll({
      one: { width: 8, height: 8, data: d },
      two: { width: 8, height: 8, data: new Uint8ClampedArray(d) },
      three: { width: 8, height: 8, data: pixels(8, 8, 9) },
    });
    expect(enc.one.encoding).toBe('rgba8-base64');
    expect(enc.two).toEqual({ width: 8, height: 8, sameAs: 'one' });
    expect(enc.three.sameAs).toBeUndefined();
    const dec = C.decodeAll(enc);
    expect(Array.from(dec.two.data)).toEqual(Array.from(d));
    expect(Array.from(dec.three.data)).not.toEqual(Array.from(d));
  });

  it('decodes legacy number arrays exactly as before', () => {
    const dec = C.decodeAll({ x: { width: 1, height: 2, data: [1, 2, 3, 255, 4, 5, 6, 255] } });
    expect(dec.x.width).toBe(1);
    expect(Array.from(dec.x.data)).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
  });

  it('warns and skips an unknown encoding instead of throwing', () => {
    const warn = vi.spyOn(win.console, 'warn').mockImplementation(() => {});
    const dec = C.decodeAll({ x: { width: 1, height: 1, encoding: 'zstd-9000', data: 'AAAA' } });
    expect(dec.x).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('compactPayload shrinks legacy images (and dedupes) without touching the original', () => {
    const d = Array.from(pixels(16, 16, 5));
    const payload = { type: 'vectura', state: { a: 1 }, images: { p: { width: 16, height: 16, data: d }, q: { width: 16, height: 16, data: d.slice() } } };
    const out = C.compactPayload(payload);
    expect(out).not.toBe(payload);
    expect(Array.isArray(payload.images.p.data)).toBe(true);
    expect(out.state).toBe(payload.state);
    expect(out.images.q.sameAs).toBe('p');
    expect(JSON.stringify(out).length).toBeLessThan(JSON.stringify(payload).length / 3);
    expect(Array.from(C.decodeAll(out.images).q.data)).toEqual(d);
    expect(C.compactPayload({ state: 1 })).toEqual({ state: 1 });
  });

  describe('save -> load through the ui-file-io mixin', () => {
    const makeThis = (saved) => ({
      getAppVersion: () => '9.9.9',
      app: {
        captureState: () => ({ engine: { layers: [] }, settings: { a: 1 }, layerLockedIds: [] }),
        applyState: vi.fn(),
        pushHistory: vi.fn(),
        recents: { record: (input) => { saved.record = input; } },
      },
    });

    it('saves compact images, and loading the saved file restores identical bytes', async () => {
      const V = win.Vectura;
      const d = pixels(20, 10, 4);
      V.NOISE_IMAGES = { i1: { width: 20, height: 10, data: d }, i2: { width: 20, height: 10, data: new Uint8ClampedArray(d) } };
      let blob = null;
      V.Download = { saveBlob: (b) => { blob = b; return Promise.resolve('downloaded'); } };
      const saved = {};
      const ctx = makeThis(saved);
      V._UIFileIOMixin.saveVecturaFile.call(ctx);
      expect(blob).toBeTruthy();
      const text = await new Promise((res) => { const r = new win.FileReader(); r.onload = () => res(r.result); r.readAsText(blob); });
      const parsed = JSON.parse(text);
      expect(parsed.images.i1.encoding).toBe('rgba8-base64');
      expect(parsed.images.i2.sameAs).toBe('i1');
      expect(text.length).toBeLessThan(d.length * 2 * 3); // legacy would be ~3.5 chars per byte per image + indentation
      // load it back into a clean store
      V.NOISE_IMAGES = {};
      expect(V._UIFileIOMixin.loadVecturaPayload.call(ctx, parsed, { quiet: true })).toBe(true);
      expect(Array.from(V.NOISE_IMAGES.i1.data)).toEqual(Array.from(d));
      expect(Array.from(V.NOISE_IMAGES.i2.data)).toEqual(Array.from(d));
      expect(V.NOISE_IMAGES.i2.width).toBe(20);
    });

    it('still loads a legacy-format file (number arrays)', () => {
      const V = win.Vectura;
      V.NOISE_IMAGES = {};
      const ctx = makeThis({});
      const legacy = { type: 'vectura', state: { engine: { layers: [] }, settings: {} }, images: { old: { width: 2, height: 1, data: [9, 8, 7, 6, 5, 4, 3, 2] } } };
      expect(V._UIFileIOMixin.loadVecturaPayload.call(ctx, legacy, { quiet: true })).toBe(true);
      expect(Array.from(V.NOISE_IMAGES.old.data)).toEqual([9, 8, 7, 6, 5, 4, 3, 2]);
    });
  });
});
