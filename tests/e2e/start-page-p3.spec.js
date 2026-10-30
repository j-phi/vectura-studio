const { test, expect } = require('@playwright/test');

// Start Page P3 wiring: motion settings persistence, Still / reduced motion stop everything, lazy hover effects,
// per-plate motion override + Replay, live 3D band and Plate 4 disc, studio picks Open / Open as template, community.
const TYPES = ['rings', 'topoform', 'terrain', 'flowfield', 'spiralizer'];

const boot = async (page, query = '?startPage=launch') => {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer && window.app.startPage));
};
const { resetStorage, persistedPref, inkReady, worksReady } = require('./helpers/start-page');
const seedWorks = async (page) => {
  await page.evaluate(async (list) => {
    window.Vectura.SETTINGS.cookiePreferencesEnabled = true;
    for (const t of list) {
      window.app.engine.layers.length = 0;
      window.app.engine.addLayer(t);
      await window.app.recents.record({ name: `${t}-study.vectura`, source: 'save' });
    }
    window.app.engine.layers.length = 0;
    window.app.markDocumentClean();
  }, TYPES);
};
const bootWithWorks = async (page) => {
  await boot(page);
  await resetStorage(page);
  await boot(page);
  await seedWorks(page);
  await page.evaluate(() => window.app.startPage.show());
  await expect(page.locator('#sp-plates .sp-pl:not([data-off]) .spl').first()).toBeVisible({ timeout: 15000 });
  await worksReady(expect, page, TYPES.length);
};
// The Start Page re-renders its sections once more when the works finish loading; a scroll that lands mid-render is retried.
const scrollTo = (loc) => expect(async () => { await loc.scrollIntoViewIfNeeded({ timeout: 2000 }); }).toPass({ timeout: 15000 });
const openSettings = async (page) => {
  if (!(await page.locator('#sp-settings').isVisible())) await page.locator('#sp-settings-btn').click();
  await expect(page.locator('#sp-settings')).toBeVisible();
};
const setHover = async (page, v) => { await openSettings(page); await page.locator('#sp-settings select[data-pref="hover"]').selectOption(v); };
// Count calls to the hover-fx loader's attach (the only door an effect comes in by): a negative assertion that does not
// depend on how long a lazy script would take to load.
const spyAttach = (page) => page.evaluate(() => {
  const F = window.Vectura.StartPageHoverFx; window.__attached = 0;
  if (F.__spied) return; F.__spied = true;
  const orig = F.attach; F.attach = function () { window.__attached += 1; return orig.apply(this, arguments); };
});
const attached = (page) => page.evaluate(() => window.__attached);
const hfxScripts = (page) => page.evaluate(() => [...document.querySelectorAll('script[src*="hover-fx/"]')].map((s) => s.src.replace(/.*hover-fx\//, '').replace(/\?.*/, '')));

test.describe('Start Page P3', () => {
  test('settings: animate-in, hover and Community notify persist across a reload', async ({ page }) => {
    await bootWithWorks(page);
    await openSettings(page);
    await page.locator('#sp-settings select[data-pref="animateIn"]').selectOption('ink-bleed');
    await page.locator('#sp-settings select[data-pref="hover"]').selectOption('ripple');
    await scrollTo(page.locator('#sp-community .sp-cm-switch'));
    await page.locator('#sp-community .sp-cm-switch').click();
    await expect(page.locator('#sp-community .sp-cm-switch')).toHaveAttribute('aria-checked', 'true');
    const sp = await page.evaluate(() => ({ a: window.Vectura.SETTINGS.startPage.animateIn, h: window.Vectura.SETTINGS.startPage.hover, n: window.Vectura.SETTINGS.startPage.communityNotify }));
    expect(sp).toEqual({ a: 'ink-bleed', h: 'ripple', n: true });
    // wait for the debounced save itself (the stored preferences), never a fixed sleep
    await expect.poll(() => persistedPref(page, 'animateIn')).toBe('ink-bleed');
    await expect.poll(() => persistedPref(page, 'hover')).toBe('ripple');
    await expect.poll(() => persistedPref(page, 'communityNotify')).toBe(true);
    await boot(page);
    await page.evaluate(() => window.app.startPage.show());
    await expect(page.locator('#sp-plates .sp-pl:not([data-off]) .spl').first()).toBeVisible({ timeout: 15000 });
    const again = await page.evaluate(() => ({ a: window.Vectura.SETTINGS.startPage.animateIn, h: window.Vectura.SETTINGS.startPage.hover, n: window.Vectura.SETTINGS.startPage.communityNotify }));
    expect(again).toEqual({ a: 'ink-bleed', h: 'ripple', n: true });
    await openSettings(page);
    await expect(page.locator('#sp-settings select[data-pref="animateIn"]')).toHaveValue('ink-bleed');
    await expect(page.locator('#sp-settings select[data-pref="hover"]')).toHaveValue('ripple');
  });

  test('hover effects load lazily: nothing before the first hover, then only the chosen effect (+ core)', async ({ page }) => {
    await bootWithWorks(page);
    expect(await hfxScripts(page)).toEqual(['index.js']);
    await setHover(page, 'ripple');
    await page.keyboard.press('Escape');
    expect(await hfxScripts(page)).toEqual(['index.js']); // choosing it loads nothing
    const art = page.locator('.sp-pl .spl-print.sp-pl-art').first();
    await art.scrollIntoViewIfNeeded();
    await inkReady(expect, art);
    await art.hover();
    await expect.poll(() => hfxScripts(page)).toEqual(expect.arrayContaining(['index.js', 'core.js', 'ripple.js']));
    const files = await hfxScripts(page);
    expect(files).not.toContain('holo.js');
    expect(files).not.toContain('stipple.js');
  });

  test('Still stops everything: no hover effect attaches, draw-ins finish instantly, the 3D model does not sway', async ({ page }) => {
    await bootWithWorks(page);
    await setHover(page, 'ripple');
    await page.keyboard.press('Escape');
    const ev = page.evaluate(() => new Promise((r) => window.addEventListener('vectura:start-page-motion', (e) => r(e.detail.still), { once: true })));
    await page.locator('#sp-motion-btn').click();
    expect(await ev).toBe(true);
    expect(await page.evaluate(() => window.Vectura.StartPageInk.isStill())).toBe(true);
    const art = page.locator('.sp-pl .spl-print.sp-pl-art').first();
    await art.scrollIntoViewIfNeeded();
    await inkReady(expect, art);
    await spyAttach(page);
    await art.hover();
    await page.mouse.move(1, 1);
    await art.hover();
    expect(await attached(page)).toBe(0);
    expect(await hfxScripts(page)).toEqual(['index.js']);
    expect(await page.locator('.sp-hfx-wrap.on').count()).toBe(0);
    // a draw-in requested under Still is instant: finished synchronously, and no frame is ever scheduled for it
    const instant = await page.evaluate(async () => {
      const el = document.querySelector('.sp-pl .spl-print.sp-pl-art');
      const raf = window.requestAnimationFrame; let frames = 0; let sawDrawing = false;
      window.requestAnimationFrame = function (cb) { frames += 1; return raf.call(window, cb); };
      const obs = new MutationObserver(() => { if (el.classList.contains('sp-ink-drawing')) sawDrawing = true; });
      obs.observe(el, { attributes: true, attributeFilter: ['class'] });
      const handle = await window.Vectura.StartPageInk.drawIn(el, { style: 'plot', duration: 1500 });
      obs.disconnect(); window.requestAnimationFrame = raf;
      return { resolved: !!handle, frames, sawDrawing, drawing: el.classList.contains('sp-ink-drawing') };
    });
    expect(instant).toEqual({ resolved: true, frames: 0, sawDrawing: false, drawing: false });
    // 3D: no sway frames
    const m = page.locator('.sp-pl .vorbit').first();
    await m.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => document.querySelector('.sp-pl .vorbit')._vorbit.matrix.join(','));
    await page.waitForTimeout(2600);
    const after = await page.evaluate(() => document.querySelector('.sp-pl .vorbit')._vorbit.matrix.join(','));
    expect(after).toBe(before);
  });

  test('no idle rAF: with the pointer idle and nothing animating, the page schedules no frames (Still off or on)', async ({ page }) => {
    await bootWithWorks(page);
    const count = (ms) => page.evaluate((t) => new Promise((res) => {
      let n = 0; const orig = window.requestAnimationFrame;
      window.requestAnimationFrame = function (cb) { n += 1; return orig.call(window, cb); };
      setTimeout(() => { window.requestAnimationFrame = orig; res(n); }, t);
    }), ms);
    // settled = a whole window passes with (almost) no frames; poll for it instead of guessing how long the draw-ins take
    await expect.poll(() => count(1000), { timeout: 30000, intervals: [250] }).toBeLessThanOrEqual(4);
    expect(await count(2000)).toBeLessThanOrEqual(4);
    await page.locator('#sp-motion-btn').click();
    await expect.poll(() => count(1000), { timeout: 15000, intervals: [250] }).toBe(0);
    expect(await count(2000)).toBe(0);
  });

  test('prefers-reduced-motion is honored like Still', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await bootWithWorks(page);
    expect(await page.evaluate(() => window.Vectura.StartPageInk.isStill())).toBe(true);
    await setHover(page, 'ripple');
    await page.keyboard.press('Escape');
    const art = page.locator('.sp-pl .spl-print.sp-pl-art').first();
    await art.scrollIntoViewIfNeeded();
    await inkReady(expect, art);
    await spyAttach(page);
    await art.hover();
    await page.mouse.move(2, 2);
    await art.hover();
    expect(await attached(page)).toBe(0);
    expect(await hfxScripts(page)).toEqual(['index.js']);
    const m = page.locator('.sp-pl .vorbit').first();
    await m.scrollIntoViewIfNeeded();
    await expect.poll(() => m.evaluate((e) => e._vorbit.plotted)).toBe(1);
    const before = await page.evaluate(() => document.querySelector('.sp-pl .vorbit')._vorbit.matrix.join(','));
    await page.waitForTimeout(2600);
    expect(await page.evaluate(() => document.querySelector('.sp-pl .vorbit')._vorbit.matrix.join(','))).toBe(before);
  });

  test('plate motion override: a plate with hover None ignores the page effect; Replay in the editor redraws it', async ({ page }) => {
    await bootWithWorks(page);
    await setHover(page, 'ripple');
    await page.keyboard.press('Escape');
    const plate = page.locator('.sp-pl').first();
    await plate.locator('[data-act="edit"]').click();
    const ed = page.locator('[data-plate-editor]');
    await expect(ed).toBeVisible();
    await ed.evaluate((e) => e.querySelectorAll('details').forEach((d) => { d.open = true; }));
    await ed.locator('[data-spe-motion="hover"]').selectOption('none');
    await ed.locator('[data-spe-motion="animateIn"]').selectOption('iris');
    // Replay plays the plate's style
    await page.evaluate(() => {
      const I = window.Vectura.StartPageInk; const orig = I.drawIn; window.__drawn = [];
      I.drawIn = function (t, o) { window.__drawn.push(o && o.style); return orig.apply(this, arguments); };
    });
    await ed.locator('[data-spe-replay]').click();
    await expect.poll(() => page.evaluate(() => window.__drawn)).toContain('iris');
    await ed.locator('[data-spe-done]').click();
    const art = plate.locator('.spl-print.sp-pl-art').first();
    await inkReady(expect, art);
    await spyAttach(page);
    await art.hover();
    await page.mouse.move(2, 2);
    await art.hover();
    expect(await attached(page)).toBe(0); // plate 1 says None; nothing attached
    expect(await hfxScripts(page)).toEqual(['index.js']);
  });

  test('a 3D work: the Portfolio band and Plate 4 show a live model that drags', async ({ page }) => {
    await bootWithWorks(page);
    // Plate 4 (text-wrap) disc for the Topoform work, no ring
    const id = await page.evaluate(() => [...document.querySelectorAll('.sp-pl')].map((e) => e.dataset.plateId)[1]);
    await page.evaluate((pid) => window.app.startPage.plates.store.upsert(pid, { layout: 'text-wrap' }), id);
    const disc = page.locator('.sp-pl').nth(1).locator('.spl-disc .vorbit');
    await expect(disc).toHaveCount(1, { timeout: 10000 });
    await disc.scrollIntoViewIfNeeded();
    const cs = await disc.evaluate((e) => { const c = getComputedStyle(e); return { r: c.borderRadius, b: c.borderTopWidth, o: c.outlineStyle, s: c.boxShadow }; });
    expect(cs.b).toBe('0px');
    expect(cs.o).toBe('none');
    expect(cs.s).toBe('none');
    await expect(page.locator('.sp-pl').nth(1).locator('.spl-3dhint')).toHaveText('Drag to rotate');
    const cv = disc.locator('canvas');
    await expect.poll(() => disc.evaluate((e) => e._vorbit.plotted)).toBe(1);
    const m0 = await disc.evaluate((e) => e._vorbit.matrix.join(','));
    const box = await cv.boundingBox();
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.55, { steps: 6 });
    await page.mouse.up();
    expect(await disc.evaluate((e) => e._vorbit.matrix.join(','))).not.toBe(m0);

    // the band, with the 3D piece as the cover
    await page.locator('#sp-settings-btn').click();
    await page.locator('#sp-settings .sp-style[data-style="band"]').click();
    await page.keyboard.press('Escape');
    await page.locator('.sp-pl').nth(1).locator('[data-act="cover"]').click();
    const band = page.locator('.sp-pf:not(.sp-pf-old) .vorbit, .sp-pf.vorbit');
    await expect(band.first()).toBeAttached({ timeout: 10000 });
    await band.first().scrollIntoViewIfNeeded();
    await expect(page.locator('.sp-pf-old')).toHaveCount(0, { timeout: 15000 }); // the cover crossfade has finished
    await expect.poll(() => band.first().evaluate((e) => (e._vorbit ? e._vorbit.plotted : 0)), { timeout: 15000 }).toBe(1);
    const bm0 = await band.first().evaluate((e) => e._vorbit.matrix.join(','));
    const bb = await band.first().locator('canvas').boundingBox();
    await page.mouse.move(bb.x + bb.width * 0.7, bb.y + bb.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(bb.x + bb.width * 0.9, bb.y + bb.height * 0.6, { steps: 6 });
    await page.mouse.up();
    expect(await band.first().evaluate((e) => e._vorbit.matrix.join(','))).not.toBe(bm0);
  });

  test('studio picks: Open and Open as template land in the colors the card shows; community has no fake content', async ({ page }) => {
    await bootWithWorks(page);
    await expect(page.locator('#sp-picks .sp-pick')).toHaveCount(8);
    const first = page.locator('#sp-picks .sp-pick').first();
    await scrollTo(first);
    await expect(first.locator('.sp-pick-art.sp-ink-ready, .sp-pick-art .sp-ink-art').first()).toBeAttached({ timeout: 15000 });
    await expect.poll(() => first.locator('.sp-pick-art').evaluate((e) => e.style.getPropertyValue('--sp-paper')), { timeout: 15000 }).not.toBe('');
    const shown = await first.locator('.sp-pick-art').evaluate((e) => ({ paper: e.style.getPropertyValue('--sp-paper'), ink: e.style.getPropertyValue('--sp-ink') }));
    await first.locator('.sp-pick-btn', { hasText: 'Open as template' }).click();
    await expect.poll(() => page.evaluate(() => window.app.engine.layers.length), { timeout: 15000 }).toBeGreaterThan(0);
    const doc = await page.evaluate(() => ({ paper: window.Vectura.SETTINGS.paper.color, pen: window.Vectura.SETTINGS.pens[0].color, name: window.app.documentName }));
    expect(doc.paper.toLowerCase()).toBe(shown.paper.trim().toLowerCase());
    expect(doc.pen.toLowerCase()).toBe(shown.ink.trim().toLowerCase());
    expect(doc.name).toMatch(/copy$/);
    await page.evaluate(() => window.app.startPage.show());
    await expect(page.locator('#sp-picks .sp-pick').first()).toBeVisible();
    await page.locator('#sp-picks .sp-pick').nth(2).locator('.sp-pick-btn-primary').click();
    // the previous template is an unsaved document: opening replaces it after the usual confirm
    await page.locator('.vectura-modal-backdrop').getByRole('button', { name: 'Open', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.app.documentName), { timeout: 15000 }).not.toMatch(/copy$/);

    await page.evaluate(() => window.app.startPage.show());
    const cm = page.locator('#sp-community');
    await cm.scrollIntoViewIfNeeded();
    await expect(cm.locator('.sp-cm-line')).toContainText('Coming later');
    expect(await cm.locator('img, [class*="avatar"], [class*="feed"], time').count()).toBe(0);
    expect(await cm.locator('.sp-cm-empty').count()).toBeGreaterThan(0);
  });
});
