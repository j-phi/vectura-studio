const { test, expect } = require('@playwright/test');

// P2 review fixes, end to end: framing survives edits, Use as cover keeps a special fill (and persists), arrange focus.
const TYPES = ['rings', 'topo', 'flowfield', 'rainfall', 'lissajous', 'wavetable', 'spiral'];

const boot = async (page) => {
  await page.goto('/?startPage=launch');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.startPage && window.app.recents));
};
const bootWithWorks = async (page) => {
  await boot(page);
  await page.context().clearCookies();
  await page.evaluate(() => { try { localStorage.clear(); ['vectura-start', 'vectura-start-plates', 'vectura-start-art'].forEach((n) => indexedDB.deleteDatabase(n)); } catch (_) { /* noop */ } });
  await boot(page);
  await page.evaluate(async (list) => {
    window.Vectura.SETTINGS.cookiePreferencesEnabled = true;
    for (const t of list) { window.app.engine.layers.length = 0; window.app.engine.addLayer(t); await window.app.recents.record({ name: `${t}-study.vectura`, source: 'save' }); }
    window.app.engine.layers.length = 0; window.app.markDocumentClean(); window.app.startPage.show();
  }, TYPES);
  await expect(page.locator('#sp-plates .sp-pl:not([data-off]) .spl').first()).toBeVisible({ timeout: 15000 });
};
const reload = async (page) => { await page.waitForTimeout(900); await boot(page); await expect(page.locator('#sp-plates .sp-pl:not([data-off]) .spl').first()).toBeVisible({ timeout: 15000 }); };

test.describe('Start Page plates: review fixes', () => {
  test('framing stays on through arrow keys, +, wheel and drag; Enter ends it and the frame survives a reload', async ({ page }) => {
    await bootWithWorks(page);
    const plate = page.locator('.sp-pl').nth(1);
    await plate.locator('[data-act="edit"]').click();
    const ed = page.locator('[data-plate-editor]');
    await expect(ed).toBeVisible();
    await ed.locator('details').evaluateAll((els) => els.forEach((d) => { d.open = true; }));
    const toggle = ed.locator('[data-spe-frame-toggle]');
    await toggle.scrollIntoViewIfNeeded();
    await toggle.click();
    const print = plate.locator('.spl-print.spe-framing').first();
    await expect(print).toBeVisible();
    await page.evaluate(() => { window.__pr = document.querySelector('.spe-framing'); });
    const still = async (label) => {
      await page.waitForTimeout(450);
      await expect(toggle, label).toHaveAttribute('aria-pressed', 'true');
      const ok = await page.evaluate(() => { const el = window.__pr; return !!el && el.isConnected && el.classList.contains('spe-framing') && document.activeElement === el; });
      expect(ok, `${label}: same print, still framing, focus kept`).toBe(true);
    };
    for (let i = 0; i < 3; i += 1) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(120); }
    await still('arrows');
    for (let i = 0; i < 2; i += 1) { await page.keyboard.press('+'); await page.waitForTimeout(120); }
    await still('plus');
    const box = await print.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -120);
    await still('wheel');
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 12, { steps: 6 });
    await page.mouse.up();
    await still('drag');
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    const before = await page.evaluate(async () => { const r = (await window.app.startPage.plates.store.load()).plates.find((x) => x.frame); return r && r.frame; });
    expect(before).toBeTruthy();
    await reload(page);
    const after = await page.evaluate(async () => { const r = (await window.app.startPage.plates.store.load()).plates.find((x) => x.frame); return r && r.frame; });
    expect(after).toEqual(before);
  });

  test('Use as cover keeps a special fill (painted on the canvas) and it persists across a reload', async ({ page }) => {
    await bootWithWorks(page);
    const plate = page.locator('.sp-pl').nth(1);
    await plate.locator('[data-act="edit"]').click();
    const ed = page.locator('[data-plate-editor]');
    await ed.locator('details').evaluateAll((els) => els.forEach((d) => { d.open = true; }));
    const fill = ed.locator('[data-fill="metallic-gold"]').first();
    await fill.scrollIntoViewIfNeeded();
    await fill.click();
    await page.waitForTimeout(500);
    await ed.locator('[data-spe-done]').click();
    await page.locator('#sp-settings-btn').click();
    await page.locator('.sp-style[data-style="band"]').click();
    await page.locator('#sp-settings-btn').click();
    await page.waitForTimeout(800);
    await plate.scrollIntoViewIfNeeded();
    await plate.locator('[data-act="cover"]').click();
    const colors = async () => page.evaluate(() => {
      const cv = [...document.querySelectorAll('#sp-cover canvas')].filter((c) => c.width > 40).sort((a, b) => b.width * b.height - a.width * a.height)[0];
      if (!cv) return 0;
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      const seen = new Set();
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) seen.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
      return seen.size;
    });
    await expect.poll(colors, { timeout: 15000 }).toBeGreaterThan(3); // a flat ink would be one color
    await reload(page);
    await expect.poll(colors, { timeout: 15000 }).toBeGreaterThan(3);
  });

  test('leaving Arrange with Done returns focus to the Arrange button', async ({ page }) => {
    await bootWithWorks(page);
    await page.locator('#sp-pl-arrange').click();
    await page.locator('[data-arr-done]').click();
    await expect(page.locator('#sp-pl-arrange')).toBeFocused();
    await page.locator('#sp-pl-arrange').click();
    await page.locator('.sp-arr-row').first().focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#sp-pl-arrange')).toBeFocused();
  });
});
