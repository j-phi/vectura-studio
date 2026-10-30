const { test, expect } = require('@playwright/test');

// Start Page cover (P1). Opt in to the launch overlay with ?startPage=launch.
const TYPES = ['wavetable', 'lissajous', 'rings', 'spiral', 'topo', 'harmonograph', 'grid'];

const boot = async (page, query = '?startPage=launch') => {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
};

const resetStorage = async (page) => {
  await page.context().clearCookies();
  await page.evaluate(() => { try { localStorage.clear(); indexedDB.deleteDatabase('vectura-start'); } catch (_) { /* noop */ } });
};

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
    await page.locator('#start-page [data-sp-mode="wildcard"]').click();
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
    await page.locator('#start-page .sp-lt').first().focus();
    await expect(page.locator('#start-page .sp-key-row .sp-kk.on')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator('#start-page .sp-lt').nth(1)).toBeFocused();
    await page.locator('#start-page [data-sp-mode="curated"]').focus();
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
});
