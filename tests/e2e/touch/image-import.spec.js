const fs = require('fs');
const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');
const { PROJECTS } = require('./viewports');

// TUX-055: camera-roll photos import safely. A 48 MP JPEG must be resampled to <= 2048 px on the
// long side, persisted previews must shrink with it, Save must survive, and small images must be
// byte-identical to the old drawImage(img, 0, 0) path. Real engine only; jsdom covers the failure
// branches (tests/integration/image-asset-downscale.test.js).
const EVIDENCE = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-055';
const CAP = 2048;
const spec = (testInfo) => PROJECTS[testInfo.project.name];

let bigJpeg = null;
let smallPng = null;

// A gradient plus coloured rects, so a resample is measurable. Built once per worker.
const makeFixture = (page, { w, h, type, quality }) => page.evaluate(async ({ w, h, type, quality }) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#102030'); grad.addColorStop(0.5, '#e0c080'); grad.addColorStop(1, '#40a060');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  ['#d02020', '#2040d0', '#f0f020', '#ffffff'].forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(w * (0.1 + i * 0.2), h * (0.2 + (i % 2) * 0.4), w * 0.12, h * 0.18);
  });
  const blob = await new Promise((r) => c.toBlob(r, type, quality));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
}, { w, h, type, quality });

test.beforeAll(async ({ browser }) => {
  const p = await browser.newPage();
  await p.goto('about:blank');
  bigJpeg = Buffer.from(await makeFixture(p, { w: 8000, h: 6000, type: 'image/jpeg', quality: 0.85 }), 'base64');
  smallPng = Buffer.from(await makeFixture(p, { w: 1000, h: 800, type: 'image/png' }), 'base64');
  await p.close();
});

const boot = async (page) => {
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(e.message));
  await page.addInitScript(() => { try { delete Navigator.prototype.share; delete Navigator.prototype.canShare; } catch { /* ignore */ } });
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
  // SETUP: phone panes start closed; open them programmatically.
  await page.evaluate(() => {
    document.getElementById('left-pane').classList.add('pane-force-open');
    document.getElementById('right-pane').classList.add('pane-force-open');
  });
};

const addLayer = (page, type, mutate) => page.evaluate(({ type, mutate }) => {
  const id = window.app.engine.addLayer(type);
  window.app.engine.activeLayerId = id;
  const layer = window.app.engine.layers.find((l) => l.id === id);
  // eslint-disable-next-line no-new-func
  if (mutate) new Function('layer', mutate)(layer);
  window.app.ui.renderLayers();
  window.app.ui.buildControls();
  window.__layerId = id;
  return id;
}, { type, mutate });

const openSilhouetteModal = async (page) => {
  const btn = page.locator('.noise-image-btn', { hasText: 'Select Image' }).first();
  await btn.scrollIntoViewIfNeeded();
  await touch.tap(page, btn);
  await page.waitForSelector('#noise-file-input', { state: 'attached' });
};

const importViaModal = async (page, file) => {
  await openSilhouetteModal(page);
  await page.setInputFiles('#noise-file-input', file);
  await page.waitForFunction(() => {
    const l = window.app.engine.layers.find((x) => x.id === window.__layerId);
    const id = l && l.params.silhouetteId;
    return !!(id && window.Vectura.NOISE_IMAGES[id]);
  }, null, { timeout: 60000 });
};

const stored = (page) => page.evaluate(() => {
  const l = window.app.engine.layers.find((x) => x.id === window.__layerId);
  const id = l.params.silhouetteId;
  const im = window.Vectura.NOISE_IMAGES[id];
  return { id, name: l.params.silhouetteName, w: im.width, h: im.height, len: im.data.length };
});

const shot = async (page, testInfo, tag) => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  await page.screenshot({ path: `${EVIDENCE}/${testInfo.project.name}${tag ? `-${tag}` : ''}.png` });
};

const BIG = () => ({ name: 'photo-48mp.jpg', mimeType: 'image/jpeg', buffer: bigJpeg });

test('48 MP photo through the Silhouette modal is stored at <= 2048 px', async ({ page }, testInfo) => {
  test.slow();
  await boot(page);
  await addLayer(page, 'rainfall');
  await importViaModal(page, BIG());
  const s = await stored(page);
  expect(Math.max(s.w, s.h)).toBe(CAP);
  expect(Math.abs(Math.min(s.w, s.h) - 1536)).toBeLessThanOrEqual(1);
  expect(s.len).toBe(s.w * s.h * 4);
  expect(s.name).toBe('photo-48mp.jpg');
  await page.waitForFunction(() => !window.app.ui.modal.overlay.classList.contains('open'));
  expect(page.__errors).toEqual([]);
  await shot(page, testInfo, '');
});

test('previewKey import persists a capped preview, not the raw URL', async ({ page }) => {
  test.slow();
  await boot(page);
  await addLayer(page, 'wavetable', "layer.params.noises[0].type = 'image';");
  const btn = page.locator('.noise-image-btn', { hasText: 'Select Image' }).first();
  await btn.scrollIntoViewIfNeeded();
  const chooserP = page.waitForEvent('filechooser');
  await touch.tap(page, btn);
  const chooser = await chooserP;
  await chooser.setFiles(BIG());
  await page.waitForFunction(() => {
    const l = window.app.engine.layers.find((x) => x.id === window.__layerId);
    const n = l.params.noises[0];
    return !!(n.imageId && window.Vectura.NOISE_IMAGES[n.imageId] && n.imagePreview);
  }, null, { timeout: 60000 });
  const r = await page.evaluate(async () => {
    const l = window.app.engine.layers.find((x) => x.id === window.__layerId);
    const n = l.params.noises[0];
    const im = window.Vectura.NOISE_IMAGES[n.imageId];
    const prev = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
      i.onerror = () => rej(new Error('preview does not decode'));
      i.src = n.imagePreview;
    });
    return { sw: im.width, sh: im.height, pw: prev.w, ph: prev.h, plen: n.imagePreview.length };
  });
  expect(Math.max(r.sw, r.sh)).toBeLessThanOrEqual(CAP);
  expect(Math.max(r.pw, r.ph)).toBeLessThanOrEqual(CAP);
  const rawLen = `data:image/jpeg;base64,${bigJpeg.toString('base64')}`.length;
  expect(r.plen).toBeLessThan(rawLen * 0.5);
  expect(page.__errors).toEqual([]);
});

test('Save survives a capped 48 MP import', async ({ page }, testInfo) => {
  test.slow();
  test.skip(!/iphone-portrait$/.test(testInfo.project.name), 'CPU: Save payload checked in the iPhone portrait projects');
  await boot(page);
  await addLayer(page, 'rainfall');
  await importViaModal(page, BIG());
  const id = (await stored(page)).id;
  const dlP = page.waitForEvent('download', { timeout: 120000 });
  await page.evaluate(() => { window.app.ui.saveVecturaFile(); });
  const dl = await dlP;
  const payload = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  expect(payload.images[id].width).toBeLessThanOrEqual(CAP);
  expect(payload.images[id].height).toBeLessThanOrEqual(CAP);
  await expect(page.locator('.vectura-toast-danger')).toHaveCount(0);
  expect(page.__errors).toEqual([]);
});

test('<= 2048 px import is byte-identical and keeps the original preview', async ({ page }) => {
  await boot(page);
  await addLayer(page, 'rainfall');
  await importViaModal(page, { name: 'small.png', mimeType: 'image/png', buffer: smallPng });
  const s = await stored(page);
  expect([s.w, s.h]).toEqual([1000, 800]);
  const same = await page.evaluate(async (b64) => {
    const hash = (d) => { let h = 2166136261 >>> 0; for (let i = 0; i < d.length; i += 1) { h ^= d[i]; h = Math.imul(h, 16777619) >>> 0; } return h; };
    const l = window.app.engine.layers.find((x) => x.id === window.__layerId);
    const im = window.Vectura.NOISE_IMAGES[l.params.silhouetteId];
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `data:image/png;base64,${b64}`; });
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    return hash(g.getImageData(0, 0, c.width, c.height).data) === hash(im.data);
  }, smallPng.toString('base64'));
  expect(same).toBe(true);

  // previewKey path keeps the exact original data URL.
  await addLayer(page, 'wavetable', "layer.params.noises[0].type = 'image';");
  const btn = page.locator('.noise-image-btn', { hasText: 'Select Image' }).first();
  await btn.scrollIntoViewIfNeeded();
  const chooserP = page.waitForEvent('filechooser');
  await touch.tap(page, btn);
  await (await chooserP).setFiles({ name: 'small.png', mimeType: 'image/png', buffer: smallPng });
  await page.waitForFunction(() => {
    const l = window.app.engine.layers.find((x) => x.id === window.__layerId);
    return !!l.params.noises[0].imagePreview;
  }, null, { timeout: 30000 });
  const preview = await page.evaluate(() => window.app.engine.layers.find((x) => x.id === window.__layerId).params.noises[0].imagePreview);
  expect(preview).toBe(`data:image/png;base64,${smallPng.toString('base64')}`);
  expect(page.__errors).toEqual([]);
});
