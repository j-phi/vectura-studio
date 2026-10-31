const { test, expect } = require('@playwright/test');
const { resetStorage, flush } = require('./helpers/start-page');

// Developer Mode (the Document Setup switch) makes the shipped example plates editable on the Start Page.
const boot = async (page) => {
  await page.goto('/?startPage=launch');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer && window.app.startPage));
};

test.describe('Start Page Developer Mode', () => {
  test('Document Setup opens the example plates for editing; edits persist across a reload; exit returns to normal', async ({ page }) => {
    await resetStorage(page);
    await boot(page);
    await page.evaluate(() => window.app.startPage.hide());
    await expect(page.locator('#btn-edit-start-page-plates')).toBeHidden();

    // saved preferences (Developer Mode survives the reload below) need the cookie-preferences consent
    await page.evaluate(() => { window.Vectura.SETTINGS.cookiePreferencesEnabled = true; window.Vectura.DevMode.set(true); });
    await page.locator('#btn-menu-file').click();
    await page.click('#btn-settings');
    await expect(page.locator('#settings-panel')).toHaveClass(/open/);
    // the button lives in the collapsed "Contributor / Presets" section of Document Setup
    const contributor = page.locator('#settings-panel [data-sect-toggle]').filter({ hasText: 'Contributor / Presets' });
    if ((await contributor.getAttribute('aria-expanded')) !== 'true') await contributor.click();
    await page.locator('#btn-edit-start-page-plates').click();
    await expect(page.locator('#start-page')).toBeVisible();
    await expect(page.locator('#sp-dev')).toBeVisible();
    await expect(page.locator('#sp-dev-pill')).toBeVisible();
    await expect(page.locator('#sp-plates .sp-pl[data-example]')).toHaveCount(10);

    const first = page.locator('#sp-plates .sp-pl').first();
    await first.scrollIntoViewIfNeeded();
    await first.locator('[data-act="edit"]').click();
    await page.locator('[data-spe-field="title"]').fill('Dev Draft Title');
    await page.locator('[data-spe-field="title"]').blur();
    await expect(first).toContainText('Dev Draft Title');
    await expect(page.locator('#sp-dev')).toHaveAttribute('data-dirty', 'true');

    await flush(page);
    await page.reload();
    await page.waitForFunction(() => !!(window.app && window.app.startPage));
    await page.evaluate(() => window.app.startPage.show({ editPlates: true }));
    await expect(page.locator('#sp-plates .sp-pl').first()).toContainText('Dev Draft Title');

    await page.locator('[data-dev-act="export"]').click();
    await expect(page.locator('[data-dev-dialog="export"] textarea')).toHaveValue(/Dev Draft Title/);
    await page.locator('[data-dev-close]').click();
    await page.locator('[data-dev-act="exit"]').click();
    await expect(page.locator('#sp-dev')).toHaveCount(0);
    // back on the normal page the plates are the user's own copies of the examples: the dev draft does not show there
    await expect(page.locator('#sp-plates .sp-pl').first()).not.toContainText('Dev Draft Title');
    await expect(page.locator('#sp-plates .sp-pl[data-example]')).toHaveCount(10);
  });
});
