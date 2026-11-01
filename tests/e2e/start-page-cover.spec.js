const { test, expect } = require('@playwright/test');

// Start Page cover (P1). Opt in to the launch overlay with ?startPage=launch.
const TYPES = ['wavetable', 'lissajous', 'rings', 'spiral', 'topo', 'harmonograph', 'grid'];

const boot = async (page, query = '?startPage=launch') => {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
};

const { resetStorage, setColorMode, openSettings } = require('./helpers/start-page');

// Seven real works in the recents store, each a different algorithm (real export thumbnails).
const seedWorks = async (page, types = TYPES) => {
  await page.evaluate(async (list) => {
    for (const t of list) {
      window.app.engine.layers.length = 0;
      window.app.engine.addLayer(t);
      await window.app.recents.record({ name: `${t}.vectura`, source: 'open' });
    }
    window.app.engine.layers.length = 0;
  }, types);
};

const bootWithWorks = async (page) => {
  await boot(page);
  await resetStorage(page);
  await boot(page);
  await seedWorks(page);
  await page.evaluate(() => window.app.startPage.render());
};

test.describe('Start Page cover', () => {
  test('Vectura is seven letters, each a button with distinct art', async ({ page }) => {
    await bootWithWorks(page);
    const letters = page.locator('#start-page .sp-lt');
    await expect(letters).toHaveCount(7);
    const ids = await letters.evaluateAll((els) => els.map((e) => e.dataset.artId));
    expect(new Set(ids).size).toBe(7);
    await expect(letters.first()).toHaveAttribute('aria-label', /^V, /);
    await expect(page.locator('#start-page .sp-lt .sp-word-on').first()).toBeVisible();
  });

  test('switching color mode recolors without re-plotting', async ({ page }) => {
    await bootWithWorks(page);
    await expect(page.locator('#start-page .sp-lt .sp-word-on')).toHaveCount(7);
    const handles = await page.evaluate(() => { window.__h = [...document.querySelectorAll('#start-page .sp-lt .sp-vw')].map((e) => e._spWord); return window.__h.length; });
    expect(handles).toBe(7);
    const before = await page.locator('#start-page .sp-lt .sp-vw').evaluateAll((els) => els.map((e) => e.dataset.spKey));
    await setColorMode(expect, page, 'wildcard');
    await expect.poll(async () => page.locator('#start-page .sp-lt .sp-vw').evaluateAll((els) => els.map((e) => e.dataset.spKey).join('|'))).not.toBe(before.join('|'));
    const same = await page.evaluate(() => [...document.querySelectorAll('#start-page .sp-lt .sp-vw')].every((e, i) => e._spWord === window.__h[i]));
    expect(same).toBe(true);
  });

  test('Still persists across a reload (cookie saving auto-enabled)', async ({ page }) => {
    await bootWithWorks(page);
    await page.locator('#sp-motion-btn').click();
    await expect(page.locator('#sp-motion-btn')).toHaveAttribute('aria-pressed', 'true');
    await boot(page);
    await expect(page.locator('#sp-motion-btn')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-sp-motion'))).toBe('still');
  });

  test('rail collapse persists across a reload', async ({ page }) => {
    await bootWithWorks(page);
    await page.locator('#sp-rail-toggle').click();
    await expect(page.locator('#start-page')).toHaveAttribute('data-rail', 'closed');
    await expect(page.locator('#sp-colo')).toBeVisible();
    await page.evaluate(() => { window.app.persistPreferences({ force: true }); });
    await boot(page);
    await expect(page.locator('#start-page')).toHaveAttribute('data-rail', 'closed');
  });

  test('keyboard path: header, settings, cover letters, color controls', async ({ page }) => {
    await bootWithWorks(page);
    await page.locator('#sp-settings-btn').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#sp-settings')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#sp-settings')).toBeHidden();
    await expect(page.locator('#sp-settings-btn')).toBeFocused();
    // At rest the key row is only its rule: no numbers or ticks under the letters.
    await expect(page.locator('#start-page .sp-key-row .sp-kk').first()).toBeHidden();
    await page.locator('#start-page .sp-lt').first().focus();
    await expect(page.locator('#start-page .sp-key-row .sp-kk.on')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator('#start-page .sp-lt').nth(1)).toBeFocused();
    await openSettings(expect, page);
    await page.locator('#sp-settings [data-sp-mode="curated"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#start-page [data-sp-mode="mono"]')).toHaveAttribute('aria-checked', 'true');
  });

  for (const word of ['Rings', 'Studies']) {
    test(`no clipped descenders in the cover word "${word}"`, async ({ page }) => {
      await bootWithWorks(page);
      await page.evaluate((w) => {
        window.Vectura.SETTINGS.startPage.coverStyle = 'word';
        window.Vectura.SETTINGS.startPage.coverWord = 'custom';
        window.Vectura.SETTINGS.startPage.customWord = w;
        window.app.startPage.render();
      }, word);
      const box = page.locator('#start-page .sp-xc-word .sp-word-fill');
      await expect(box).toBeVisible();
      const inside = await page.evaluate(() => {
        const host = document.querySelector('#start-page .sp-xc-word');
        const cv = host.querySelector('.sp-word-fill');
        const h = host.getBoundingClientRect(); const c = cv.getBoundingClientRect();
        return { top: c.top - h.top, bottom: h.bottom - c.bottom, hostH: h.height, canvasH: c.height };
      });
      expect(inside.bottom).toBeGreaterThanOrEqual(-0.5);
      expect(inside.top).toBeGreaterThanOrEqual(-0.5);
    });
  }

  test('the title section has no Colorways button (any cover style)', async ({ page }) => {
    await bootWithWorks(page);
    for (const style of ['band', 'word', 'mosaic']) {
      await page.evaluate((st) => { window.Vectura.SETTINGS.startPage.coverStyle = st; window.app.startPage.render(); }, style);
      await expect(page.locator('#start-page .sp-cv-top')).toBeAttached();
      await expect(page.locator('#start-page .sp-cv-fan')).toHaveCount(0);
      await expect(page.locator('#start-page .sp-cover button', { hasText: /colorways/i })).toHaveCount(0);
    }
  });

  test('narrow: colophon scrolls with the page, hints hidden, Tab starts at the top', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 800 });
    await bootWithWorks(page);
    await expect.poll(() => page.evaluate(() => document.querySelector('#sp-colo-wrap').parentElement.id)).toBe('sp-scroll');
    await expect(page.locator('#sp-colo-wrap .sp-co-btn kbd').first()).toBeHidden();
    const hdr = await page.evaluate(() => document.querySelector('.sp-hdr').getBoundingClientRect().bottom);
    expect(hdr).toBeLessThan(60);
  });

  test('wide: initial focus is at the top of the page and Tab visits header before cover before rail', async ({ page }) => {
    await bootWithWorks(page);
    await page.evaluate(() => { window.app.startPage.hide({ restoreFocus: false }); window.app.startPage.show(); });
    await expect.poll(() => page.evaluate(() => !!document.activeElement.closest('.sp-hdr'))).toBe(true);
    const order = await page.evaluate(() => { const r = document.querySelector('#start-page'); const a = [...r.querySelectorAll('button')].filter((b) => b.getClientRects().length && !b.closest('[inert]')); const idx = (sel) => a.findIndex((b) => b.matches(sel) || b.closest(sel)); return { skip: [...r.querySelectorAll('button')][0].dataset.act, hdr: idx('.sp-hdr'), cover: idx('#sp-cover'), rail: idx('#sp-rail') }; });
    expect(order.skip).toBe('skip');
    expect(order.hdr).toBeLessThan(order.cover);
    expect(order.cover).toBeLessThan(order.rail);
  });
});
