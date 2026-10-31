const { test, expect } = require('@playwright/test');

// Start Page plates, integrated (P2): editor, arrange, fan, Use as cover, color rhythm, exact-color opens.
const TYPES = ['rings', 'topo', 'flowfield', 'rainfall', 'lissajous', 'wavetable', 'spiral'];

const boot = async (page, query = '?startPage=launch') => {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer && window.app.startPage));
};
const { resetStorage, flush, worksReady, hideExamples } = require('./helpers/start-page');
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
  await hideExamples(expect, page); // example plates sit beside the works; these specs drive the works' own plates
};
const reload = async (page) => { await flush(page); await boot(page); await expect(page.locator('#sp-plates .sp-pl:not([data-off]) .spl').first()).toBeVisible({ timeout: 15000 }); };
const order = (page) => page.locator('.sp-pl').evaluateAll((els) => els.map((e) => e.dataset.plateId));
const showAll = async (page) => { await page.locator('#sp-pl-show').selectOption('all'); await page.waitForTimeout(500); };

test.describe('Start Page plates, integrated', () => {
  test('editor: word + layout + a manual color in Curated; hidden in Mono/Wildcard; Curated and a reload restore it', async ({ page }) => {
    await bootWithWorks(page);
    const plate = page.locator('.sp-pl').nth(2);
    await plate.scrollIntoViewIfNeeded(); // plates mount lazily near the viewport
    const before = await plate.evaluate((e) => ({ paper: e.dataset.spPaper, layout: e.dataset.layout }));
    await plate.locator('[data-act="edit"]').click();
    const ed = page.locator('[data-plate-editor]');
    await expect(ed).toBeVisible();
    await ed.evaluate((e) => e.querySelectorAll('details').forEach((d) => { d.open = true; }));
    await ed.locator('[data-spe-field="word"]').fill('Zebra');
    await ed.locator('[data-layout="big-numeral"]').click();
    await ed.locator('[data-mc-part="background"] [data-mc-swatch]').nth(3).click();
    await page.waitForTimeout(600);
    const edited = await plate.evaluate((e) => ({ paper: e.dataset.spPaper, layout: e.dataset.layout }));
    expect(edited.layout).toBe('big-numeral');
    expect(edited.paper).not.toBe(before.paper);
    await ed.locator('[data-spe-done]').click();
    await expect(ed).toHaveCount(0);

    for (const m of ['mono', 'wildcard']) {
      await page.locator(`[data-sp-mode="${m}"]`).click();
      await page.waitForTimeout(500);
      await expect(page.locator('.sp-pl .spl [data-act="edit"]')).toHaveCount(0);
      expect(await plate.evaluate((e) => e.dataset.layout)).toBe('big-numeral'); // layout applies in every mode
      expect(await plate.evaluate((e) => e.dataset.spPaper)).not.toBe(edited.paper);
    }
    await page.locator('[data-sp-mode="curated"]').click();
    await page.waitForTimeout(500);
    expect(await plate.evaluate((e) => e.dataset.spPaper)).toBe(edited.paper);

    await reload(page);
    const again = page.locator('.sp-pl').nth(2);
    await again.scrollIntoViewIfNeeded(); // plates mount lazily near the viewport
    expect(await again.evaluate((e) => ({ paper: e.dataset.spPaper, layout: e.dataset.layout }))).toEqual(edited);
    await expect(again.locator('svg.spl-hword text, svg.spl-vword text, .spl-ko-word').first()).toBeAttached();
  });

  test('arrange: a pointer drag reorders the plates and the order survives a reload', async ({ page }) => {
    await bootWithWorks(page);
    const start = await order(page);
    await page.locator('#sp-pl-arrange').click();
    await expect(page.locator('.sp-arr-row')).toHaveCount(7);
    const grip = page.locator('.sp-arr-row').nth(0).locator('[data-arr-grip]');
    const target = await page.locator('.sp-arr-row').nth(2).boundingBox();
    const g = await grip.boundingBox();
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + g.width / 2, g.y + 30, { steps: 5 });
    await page.mouse.move(g.x + g.width / 2, target.y + target.height * 0.8, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    const moved = await order(page);
    expect(moved).not.toEqual(start);
    expect(moved[0]).toBe(start[1]);
    await page.locator('[data-arr-done]').click();
    await reload(page);
    expect(await order(page)).toEqual(moved);
  });

  test('arrange: Alt+ArrowDown moves a plate and announces it', async ({ page }) => {
    await bootWithWorks(page);
    const start = await order(page);
    await page.locator('#sp-pl-arrange').click();
    await page.locator('.sp-arr-row').nth(2).focus();
    await page.keyboard.press('Alt+ArrowDown');
    await expect(page.locator('.sp-arr [aria-live]').first()).toContainText(/Moved Plate 3 to position 4/);
    await page.locator('[data-arr-done]').click();
    await page.waitForTimeout(500);
    const moved = await order(page);
    expect(moved[3]).toBe(start[2]);
  });

  test('fan: opens four cards and a card opens the piece on that paper and pen', async ({ page }) => {
    await bootWithWorks(page);
    await page.locator('[data-sp-mode="wildcard"]').click();
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const O = window.Vectura.StartPageOpenArt; const orig = O.open;
      window.__picked = null;
      O.open = (art, cw, o) => { window.__picked = cw; return orig.call(O, art, cw, o); };
    });
    await page.locator('.sp-pl').nth(1).locator('[data-act="fan"]').click();
    const cards = page.locator('.sp-fan .sp-fan-card');
    await expect(cards).toHaveCount(4);
    await page.keyboard.press('Escape');
    await expect(page.locator('.sp-fan')).toHaveCount(0);
    await page.locator('.sp-pl').nth(1).locator('[data-act="fan"]').click();
    await page.locator('.sp-fan .sp-fan-card').nth(2).click();
    await expect(page.locator('#start-page')).toBeHidden({ timeout: 15000 });
    const got = await page.evaluate(() => ({ picked: window.__picked, paper: (window.Vectura.SETTINGS.paper || {}).color, ink: window.Vectura.SETTINGS.pens[0].color }));
    expect(got.picked).toBeTruthy();
    expect(got.paper.toLowerCase()).toBe(got.picked.paper.toLowerCase());
    expect(got.ink.toLowerCase()).toBe(got.picked.ink.toLowerCase());
  });

  test('Use as cover persists across a reload, and a mode change recolors it', async ({ page }) => {
    await bootWithWorks(page);
    const plate = page.locator('.sp-pl').nth(3);
    await plate.scrollIntoViewIfNeeded(); // plates mount lazily near the viewport
    const artId = await plate.evaluate((e) => e.dataset.artId);
    await plate.locator('[data-act="cover"]').click();
    await expect(page.locator('.vectura-toast', { hasText: /cover/i }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#sp-cover .sp-lt').first()).toHaveAttribute('data-art-id', artId);
    await reload(page);
    await expect(page.locator('#sp-cover .sp-lt').first()).toHaveAttribute('data-art-id', artId, { timeout: 10000 });
    const paper = await page.locator('#sp-cover .sp-lt [data-sp-paper]').first().evaluate((e) => e.dataset.spPaper);
    await page.locator('[data-sp-mode="wildcard"]').click();
    await page.waitForTimeout(700);
    await expect(page.locator('#sp-cover .sp-lt').first()).toHaveAttribute('data-art-id', artId);
    expect(await page.locator('#sp-cover .sp-lt [data-sp-paper]').first().evaluate((e) => e.dataset.spPaper)).not.toBe(paper);
  });

  test('no two dark plates and no near-identical colorways side by side (curated, wildcard, a Randomize seed)', async ({ page }) => {
    await bootWithWorks(page);
    await showAll(page);
    const check = async (label) => {
      const rows = await page.locator('.sp-pl:not([data-off])').evaluateAll((els) => els.map((e) => [e.dataset.cwClass, e.dataset.cwId, e.dataset.cwFam]));
      expect(rows.length, label).toBe(7);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i][0] === 'dark' && rows[i - 1][0] === 'dark', `${label} dark pair at ${i}`).toBe(false);
        expect(rows[i][1], `${label} twin at ${i}`).not.toBe(rows[i - 1][1]);
        expect(rows[i][2], `${label} family at ${i}`).not.toBe(rows[i - 1][2]);
      }
    };
    await check('curated');
    await page.locator('[data-sp-mode="wildcard"]').click(); await page.waitForTimeout(600);
    await check('wildcard');
    await page.locator('#sp-dice').click(); await page.waitForTimeout(600);
    await expect(page.locator('#sp-dice')).toHaveClass(/is-random/);
    await check('random');
  });

  test('a rail recent shows the file in its own colors and reopens the ORIGINAL file (no "(colorway)" fork)', async ({ page }) => {
    await bootWithWorks(page);
    await page.locator('[data-sp-mode="wildcard"]').click();
    await page.waitForTimeout(600);
    const row = page.locator('#sp-rail .sp-row[data-recent-id]').first();
    const id = await row.getAttribute('data-recent-id');
    const own = await page.evaluate(async (rid) => { const a = (await window.Vectura.StartPageArtSource.list()).find((x) => x.recentId === rid); return a && a.ownColors; }, id);
    expect(await row.getAttribute('data-sp-paper')).toBe(own.paper);
    await row.click();
    await expect(page.locator('#start-page')).toBeHidden({ timeout: 15000 });
    const got = await page.evaluate(() => ({ name: window.app.documentName || null, recent: window.app.currentRecentId || null }));
    // P4: reopening a recent keeps the file's own name (so Save does not rename it to a
    // date) — and it is never a "(colorway)" fork.
    const fileName = await page.evaluate(async (rid) => {
      const e = (await window.Vectura.RecentsStore.shared().list()).find((x) => x.id === rid);
      return e && e.name.replace(/\.vectura$/i, '');
    }, id);
    expect(got.name).toBe(fileName);
    expect(got.name).not.toMatch(/\(colorway\)/);
    expect(got.recent).toBe(id);
  });
});
