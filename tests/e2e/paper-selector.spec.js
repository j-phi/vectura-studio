const fs = require('fs');
const { test, expect } = require('@playwright/test');

// Paper selector (desktop): pick a paper + colour in the Pen / Paper tab, save
// and reopen the .vectura (paper is per project), and Set as default → a fresh
// load starts on the default paper. Also checks the realistic paper actually
// changes the canvas pixels while 'none' paints the plain sheet.

const boot = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
};

const sheetPixel = (page) => page.evaluate(() => {
  const r = window.app.renderer;
  r.draw();
  const dpr = r.getBackingDpr();
  const p = window.app.engine.currentProfile;
  // A point on the sheet near its top-left corner, away from the art.
  const x = Math.round((r.offsetX + p.width * r.scale * 0.04) * dpr);
  const y = Math.round((r.offsetY + p.height * r.scale * 0.04) * dpr);
  const d = r.ctx.getImageData(x, y, 24, 24).data;
  let sum = 0; let sumSq = 0; const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += l; sumSq += l * l; }
  const mean = sum / n;
  return { mean, variance: sumSq / n - mean * mean };
});

test('paper selector: per-project paper survives save/reopen; default paper drives new documents', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { try { localStorage.clear(); } catch (_) { /* noop */ } });
  await boot(page);
  await page.evaluate(() => window.app.engine.addLayer('harmonograph'));

  const tab = page.locator('.right-pane-tab[data-tab="pens"]');
  await expect(tab).toHaveText('Pen / Paper');
  await tab.click();
  await expect(page.locator('#paper-global-section')).toBeVisible();

  // Plain sheet is flat; cold-press adds visible tooth.
  const plain = await sheetPixel(page);
  expect(plain.variance).toBeLessThan(1);
  await page.locator('.paper-swatch[data-paper-type="cold-press"]').click();
  await expect(page.locator('.paper-swatch[data-paper-type="cold-press"]')).toHaveAttribute('aria-checked', 'true');
  // Texture refines in idle slices: wait for the queue to drain.
  await page.waitForFunction(() => window.Vectura.PaperTexture.cacheStats().queued === 0, null, { timeout: 15000 });
  const textured = await sheetPixel(page);
  expect(textured.variance).toBeGreaterThan(plain.variance + 2);

  // Any colour (the picker input is what the native/modal picker writes to).
  await page.evaluate(() => {
    const input = document.getElementById('inp-paper-color');
    input.value = '#e8d8c0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#paper-color-pill')).toHaveText('#E8D8C0');

  // Save the project through the real File > Save path.
  const downloadP = page.waitForEvent('download');
  await page.evaluate(() => window.app.ui.saveVecturaFile());
  const download = await downloadP;
  const saved = fs.readFileSync(await download.path(), 'utf8');
  const parsed = JSON.parse(saved);
  expect(parsed.state.settings.paper).toMatchObject({ type: 'cold-press', color: '#e8d8c0' });
  expect(parsed.state.settings.bgColor).toBe('#e8d8c0');

  // Fresh load (no default set) is a plain sheet; reopening restores the paper.
  await boot(page);
  expect(await page.evaluate(() => window.Vectura.SETTINGS.paper.type)).toBe('none');
  await page.locator('#btn-menu-file').click();
  const chooserP = page.waitForEvent('filechooser');
  await page.locator('#btn-open-vectura').click();
  const chooser = await chooserP;
  await chooser.setFiles({ name: 'paper.vectura', mimeType: 'application/octet-stream', buffer: Buffer.from(saved) });
  await page.waitForFunction(() => window.Vectura.SETTINGS.paper && window.Vectura.SETTINGS.paper.type === 'cold-press', null, { timeout: 10000 });
  expect(await page.evaluate(() => window.Vectura.SETTINGS.paper)).toMatchObject({ type: 'cold-press', color: '#e8d8c0' });
  await page.locator('.right-pane-tab[data-tab="pens"]').click();
  await expect(page.locator('.paper-swatch[data-paper-type="cold-press"]')).toHaveAttribute('aria-checked', 'true');

  // Set as default → a fresh load (new document) starts on it.
  await page.locator('.paper-swatch[data-paper-type="kraft"]').click();
  await page.locator('#btn-paper-set-default').click();
  await expect(page.locator('#paper-default-badge')).toBeVisible();
  await boot(page);
  expect(await page.evaluate(() => window.Vectura.SETTINGS.paper)).toMatchObject({ type: 'kraft' });
  await page.locator('.right-pane-tab[data-tab="pens"]').click();
  await expect(page.locator('#paper-default-badge')).toBeVisible();
  // …and the Document Setup Default paper row reflects it.
  expect(await page.evaluate(() => document.getElementById('set-default-paper-type').value)).toBe('kraft');
});

// Custom papers (My papers): save a tuned custom paper, export the library,
// then on a clean browser profile (fresh context = empty library) open the
// project — it renders from the paper embedded in the file — import the
// library, and make the custom paper the default across a reload.
test('custom papers: save + tune, export, project opens on a clean profile, import, default survives reload', async ({ page, browser }) => {
  await boot(page);
  await page.evaluate(() => { try { localStorage.clear(); } catch (_) { /* noop */ } });
  await boot(page);
  await page.evaluate(() => window.app.engine.addLayer('harmonograph'));
  await page.locator('.right-pane-tab[data-tab="pens"]').click();
  await page.locator('.paper-swatch[data-paper-type="cold-press"]').click();

  // + Save as custom… → name it in the app's prompt.
  await page.locator('#btn-paper-save-custom').click();
  const nameInput = page.locator('.vectura-dialog-input');
  await expect(nameInput).toBeVisible();
  await nameInput.fill('Studio cold press');
  await nameInput.press('Enter');
  const custom = page.locator('.paper-swatch.is-custom');
  await expect(custom).toHaveCount(1);
  await expect(custom).toHaveAttribute('aria-checked', 'true');
  const id = await custom.getAttribute('data-paper-type');
  expect(id).toMatch(/^custom-[a-z0-9]{7}$/);

  // Advanced: tune the realism (each drag = one undo step), then store it.
  await page.locator('#paper-advanced > summary').click();
  await expect(page.locator('#paper-param-tooth')).toBeVisible();
  const before = await page.evaluate(() => window.app.history.length);
  await page.evaluate(() => {
    const set = (key, v) => {
      const el = document.getElementById(`paper-param-${key}`);
      el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('tooth', 0.95);
    set('grainMm', 2.4);
    set('speckle', 0.4);
  });
  expect(await page.evaluate(() => window.app.history.length)).toBe(before + 3);
  await expect(page.locator('#paper-custom-status')).toHaveAttribute('data-state', 'modified');
  await page.locator('#btn-paper-update-saved').click();
  await expect(page.locator('#paper-custom-status')).toHaveAttribute('data-state', 'saved');
  const params = await page.evaluate(() => window.Vectura.SETTINGS.paper.custom.params);
  expect(params).toMatchObject({ tooth: 0.95, grainMm: 2.4, speckle: 0.4 });

  // Section ⋯ → Export all (a real .json download).
  await page.locator('#btn-paper-library-menu').click();
  const libDownloadP = page.waitForEvent('download');
  await page.locator('.menu-dropdown.paper-menu .menu-entry[data-key="export-all"]').click();
  const libDownload = await libDownloadP;
  expect(libDownload.suggestedFilename()).toBe('vectura-papers.json');
  const libraryText = fs.readFileSync(await libDownload.path(), 'utf8');
  expect(JSON.parse(libraryText)).toMatchObject({ schema: 'vectura-papers', version: 1, papers: [{ id, name: 'Studio cold press' }] });

  // Save the project.
  const projP = page.waitForEvent('download');
  await page.evaluate(() => window.app.ui.saveVecturaFile());
  const projectText = fs.readFileSync(await (await projP).path(), 'utf8');
  expect(JSON.parse(projectText).state.settings.paper).toMatchObject({ type: id, custom: { name: 'Studio cold press', params } });

  // Clean profile: a fresh browser context has an empty library.
  const ctx2 = await browser.newContext({ viewport: page.viewportSize() });
  const page2 = await ctx2.newPage();
  try {
    await boot(page2);
    expect(await page2.evaluate(() => window.Vectura.Paper.customLibrary().list().length)).toBe(0);
    await page2.locator('#btn-menu-file').click();
    const chooserP = page2.waitForEvent('filechooser');
    await page2.locator('#btn-open-vectura').click();
    await (await chooserP).setFiles({ name: 'custom.vectura', mimeType: 'application/octet-stream', buffer: Buffer.from(projectText) });
    await page2.waitForFunction((t) => window.Vectura.SETTINGS.paper && window.Vectura.SETTINGS.paper.type === t, id, { timeout: 10000 });
    const opened = await page2.evaluate((t) => {
      const T = window.Vectura.PAPERS.TYPES[t];
      return { params: window.Vectura.SETTINGS.paper.custom.params, tooth: T.tooth, grainMm: T.grainMm, realistic: window.Vectura.Paper.isRealistic(window.Vectura.SETTINGS.paper) };
    }, id);
    expect(opened).toEqual({ params, tooth: 0.95, grainMm: 2.4, realistic: true });
    await page2.locator('.right-pane-tab[data-tab="pens"]').click();
    await expect(page2.locator(`.paper-swatch-wrap.is-from-file[data-custom-id="${id}"] .paper-swatch`)).toHaveAttribute('aria-checked', 'true');
    await expect(page2.locator('#paper-custom-status')).toHaveAttribute('data-state', 'from-file');
    await page2.waitForFunction(() => window.Vectura.PaperTexture.cacheStats().queued === 0, null, { timeout: 15000 });
    const textured = await sheetPixel(page2);
    expect(textured.variance).toBeGreaterThan(2);

    // Import the exported library: the paper is now saved, same id.
    await page2.locator('#btn-paper-library-menu').click();
    const importChooserP = page2.waitForEvent('filechooser');
    await page2.locator('.menu-dropdown.paper-menu .menu-entry[data-key="import"]').click();
    await (await importChooserP).setFiles({ name: 'vectura-papers.json', mimeType: 'application/json', buffer: Buffer.from(libraryText) });
    await expect(page2.locator('#paper-custom-status')).toHaveAttribute('data-state', 'saved');
    await expect(page2.locator(`.paper-swatch-wrap[data-custom-id="${id}"]`)).not.toHaveClass(/is-from-file/);

    // Default = the custom paper survives a reload.
    await page2.locator('#btn-paper-set-default').click();
    await boot(page2);
    expect(await page2.evaluate(() => window.Vectura.SETTINGS.paper.type)).toBe(id);
    expect(await page2.evaluate(() => window.Vectura.SETTINGS.paper.custom.params)).toEqual(params);
    expect(await page2.evaluate(() => document.getElementById('set-default-paper-type').value)).toBe(id);
  } finally {
    await ctx2.close();
  }
});

// Image papers: a photo of paper becomes a custom paper (de-lit, tiled, sized
// in mm); the project embeds the tile, so a clean profile renders the same
// texture without its library or IndexedDB.
test('image paper: upload a paper photo, save the project, reopen on a clean profile', async ({ page, browser }) => {
  await boot(page);
  await page.evaluate(() => { try { localStorage.clear(); } catch (_) { /* noop */ } });
  await boot(page);
  await page.evaluate(() => window.app.engine.addLayer('harmonograph'));
  // A synthetic "photo": grain + a lighting gradient, as a real PNG.
  const png = Buffer.from(await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(256, 256);
    let s = 7;
    for (let i = 0; i < 256 * 256; i += 1) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const light = 0.7 + 0.3 * ((i % 256) / 255);
      const v = Math.round(255 * light * (0.85 + 0.15 * (s / 0x7fffffff)));
      img.data.set([v, v, Math.round(v * 0.94), 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }));
  await page.locator('.right-pane-tab[data-tab="pens"]').click();
  await page.locator('#btn-paper-texture').click();
  const chooserP = page.waitForEvent('filechooser');
  await page.locator('.menu-dropdown.paper-menu .menu-entry[data-key="upload"]').click();
  await (await chooserP).setFiles({ name: 'my-paper.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.paper-import-dialog')).toBeVisible();
  await expect(page.locator('#paper-import-name')).toHaveValue('my-paper');
  await expect(page.locator('#paper-import-scale')).toHaveValue('300');
  await page.locator('#paper-import-create').click();
  await page.waitForFunction(() => {
    const p = window.Vectura.SETTINGS.paper;
    return p.custom && p.custom.image && window.Vectura.PaperImage.mapsFor(window.Vectura.PAPERS.TYPES[p.type].image);
  }, null, { timeout: 20000 });
  const paper = await page.evaluate(() => window.Vectura.SETTINGS.paper);
  expect(paper.custom.image.tile).toMatch(/^data:image\/(webp|jpeg);base64,/);
  expect(paper.custom.image.tileMm).toBeCloseTo((256 / 300) * 25.4, 1);
  // The library keeps refs only; the pixels live in IndexedDB.
  expect(await page.evaluate(() => localStorage.getItem('vectura.customPapers'))).not.toContain('base64');

  const projP = page.waitForEvent('download');
  await page.evaluate(() => window.app.ui.saveVecturaFile());
  const projectText = fs.readFileSync(await (await projP).path(), 'utf8');
  expect(JSON.parse(projectText).state.settings.paper.custom.image.tile).toBe(paper.custom.image.tile);

  const ctx2 = await browser.newContext({ viewport: page.viewportSize() });
  const page2 = await ctx2.newPage();
  try {
    await boot(page2);
    await page2.locator('#btn-menu-file').click();
    const ch = page2.waitForEvent('filechooser');
    await page2.locator('#btn-open-vectura').click();
    await (await ch).setFiles({ name: 'photo.vectura', mimeType: 'application/octet-stream', buffer: Buffer.from(projectText) });
    await page2.waitForFunction((t) => {
      const p = window.Vectura.SETTINGS.paper;
      return p.type === t && window.Vectura.PaperImage.mapsFor(window.Vectura.PAPERS.TYPES[t].image);
    }, paper.type, { timeout: 20000 });
    await page2.waitForFunction(() => window.Vectura.PaperTexture.cacheStats().queued === 0, null, { timeout: 15000 });
    const textured = await sheetPixel(page2);
    expect(textured.variance).toBeGreaterThan(2);

    // From file -> Save to my papers -> real reload -> the library paper still has its pixels.
    await page2.locator('.right-pane-tab[data-tab="pens"]').click();
    await expect(page2.locator('#paper-custom-status')).toHaveAttribute('data-state', 'from-file');
    await page2.locator('#btn-paper-custom-save').click();
    await expect(page2.locator('#paper-custom-status')).toHaveAttribute('data-state', 'saved');
    expect(await page2.evaluate((ref) => window.Vectura.TextureStore.shared().get(ref).then((r) => Boolean(r && r.tile)), paper.custom.image.ref)).toBe(true);
    await boot(page2);
    await page2.locator('.right-pane-tab[data-tab="pens"]').click();
    await page2.locator(`.paper-swatch[data-paper-type="${paper.type}"]`).click();
    await page2.waitForFunction((t) => {
      const p = window.Vectura.SETTINGS.paper;
      return p.type === t && p.custom.image.tile && window.Vectura.PaperImage.mapsFor(window.Vectura.PAPERS.TYPES[t].image);
    }, paper.type, { timeout: 20000 });
    await expect(page2.locator('#paper-custom-status')).toHaveAttribute('data-state', 'saved');
  } finally {
    await ctx2.close();
  }
});
