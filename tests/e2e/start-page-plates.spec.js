const { test, expect } = require('@playwright/test');

// Start Page Plates section (P2). Opt in to the launch overlay with ?startPage=launch.
const TYPES = ['rings', 'topo', 'flowfield', 'rainfall', 'lissajous', 'wavetable', 'spiral'];

const boot = async (page, query = '?startPage=launch') => {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer && window.app.startPage));
};
const resetStorage = async (page) => {
  await page.context().clearCookies();
  await page.evaluate(() => {
    try { localStorage.clear(); ['vectura-start', 'vectura-start-plates', 'vectura-start-art'].forEach((n) => indexedDB.deleteDatabase(n)); } catch (_) { /* noop */ }
  });
};
const seedWorks = async (page) => {
  await page.evaluate(async (list) => {
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
};

test.describe('Start Page plates', () => {
  test('Show dropdown persists across a reload and the line reads "Showing x of N"', async ({ page }) => {
    await bootWithWorks(page);
    await page.evaluate(() => { window.Vectura.SETTINGS.cookiePreferencesEnabled = true; });
    await expect(page.locator('.sp-pl-more')).toContainText('Showing 5 of 7');
    await page.locator('#sp-pl-show').selectOption('3');
    await expect(page.locator('.sp-pl-more')).toContainText('Showing 3 of 7');
    await expect(page.locator('.sp-pl:not([data-off])')).toHaveCount(3);
    await page.waitForTimeout(900);
    await boot(page);
    await expect(page.locator('#sp-pl-show')).toHaveValue('3');
  });

  test('Edit is hidden outside Curated and Basic; plate colors are the mode\'s; no adjacent dark plates', async ({ page }) => {
    await bootWithWorks(page);
    await page.locator('#sp-pl-show').selectOption('all');
    await expect(page.locator('.sp-pl:not([data-off])')).toHaveCount(7);
    for (const [mode, edit] of [['curated', true], ['mono', false], ['basic', true], ['wildcard', false]]) {
      await page.locator(`[data-sp-mode="${mode}"]`).click();
      await page.waitForTimeout(600);
      const n = await page.locator('.sp-pl .spl [data-act="edit"]').count();
      if (edit) expect(n).toBeGreaterThan(0); else expect(n).toBe(0);
      const classes = await page.locator('.sp-pl:not([data-off])').evaluateAll((els) => els.map((e) => [e.dataset.cwClass, e.dataset.cwId]));
      for (let i = 1; i < classes.length; i++) {
        if (mode !== 'mono') expect(classes[i][1]).not.toBe(classes[i - 1][1]);
        if (mode === 'curated' || mode === 'wildcard') expect(classes[i][0] === 'dark' && classes[i - 1][0] === 'dark').toBe(false);
      }
    }
  });

  test('plate words are descender-safe: every display word sits inside its plate', async ({ page }) => {
    await bootWithWorks(page);
    await page.waitForTimeout(800);
    const bad = await page.evaluate(() => [...document.querySelectorAll('.sp-pl:not([data-off]) .spl')].flatMap((pl) => {
      const r = pl.getBoundingClientRect();
      return [...pl.querySelectorAll('svg.spl-hword text, svg.spl-vword text')].map((t) => {
        const b = t.getBoundingClientRect();
        return b.width > 0 && (b.left < r.left - 1 || b.right > r.right + 1 || b.top < r.top - 1 || b.bottom > r.bottom + 1) ? t.textContent : null;
      }).filter(Boolean);
    }));
    expect(bad).toEqual([]);
  });

  test('opening a plate in Wildcard lands in the editor on the tile\'s paper and pen', async ({ page }) => {
    await bootWithWorks(page);
    await page.locator('[data-sp-mode="wildcard"]').click();
    await page.waitForTimeout(600);
    const plate = page.locator('.sp-pl:not([data-off])').nth(2);
    const shown = await plate.evaluate((e) => ({ paper: e.dataset.spPaper, ink: e.dataset.spInk }));
    await plate.locator('.spl-btn-p').click();
    await expect(page.locator('#start-page')).toBeHidden({ timeout: 15000 });
    const got = await page.evaluate(() => {
      const S = window.Vectura.SETTINGS;
      return { paper: (S.paper && S.paper.color) || S.bgColor, ink: S.pens[0].color, name: window.app.documentName };
    });
    expect(got.paper.toLowerCase()).toBe(shown.paper.toLowerCase());
    expect(got.ink.toLowerCase()).toBe(shown.ink.toLowerCase());
    expect(got.name).toMatch(/\(colorway\)$/);
  });
});
