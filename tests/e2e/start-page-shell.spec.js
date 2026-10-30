const { test, expect } = require('@playwright/test');

// Start Page shell (P0). Specs opt in to the launch overlay with ?startPage=launch: under
// automation (navigator.webdriver) the app boots straight into the editor otherwise.
const OCTET = 'application/octet-stream';

const boot = async (page, query = '?startPage=launch') => {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
};

// Preferences live in localStorage AND the vectura_prefs cookie; recents live in IndexedDB.
const { resetStorage } = require('./helpers/start-page');

const makeFixture = async (page, types = ['wavetable', 'lissajous']) => page.evaluate((list) => {
  list.forEach((t) => window.app.engine.addLayer(t));
  return JSON.stringify({ type: 'vectura', version: 'x', state: window.app.captureState(), images: {} });
}, types);

const openFixture = async (page, fixture, name = 'proj.vectura') => {
  await page.locator('#btn-menu-file').click();
  const chooserP = page.waitForEvent('filechooser');
  await page.locator('#btn-open-vectura').click();
  const chooser = await chooserP;
  await chooser.setFiles({ name, mimeType: OCTET, buffer: Buffer.from(fixture) });
  await expect(page.locator('.vectura-toast', { hasText: 'Project loaded' })).toBeVisible();
};

test.describe('Start Page shell', () => {
  test('shows on launch when opted in, and not under automation by default', async ({ page }) => {
    await boot(page, '');
    await expect(page.locator('#start-page')).toHaveCount(0);
    await boot(page, '?startPage=launch');
    await expect(page.locator('#start-page')).toBeVisible();
    await expect(page.locator('#sp-main')).toBeVisible();
    await expect(page.locator('#start-page')).toContainText('New blank canvas');
    expect(await page.evaluate(() => document.getElementById('app-header').inert)).toBe(true);
  });

  test('turning "Show Start Page on launch" off sticks across a reload', async ({ page }) => {
    await boot(page);
    await resetStorage(page);
    await boot(page);
    await page.locator('#start-page [data-pref="showOnLaunch"]').uncheck();
    await expect(page.locator('.vectura-toast', { hasText: 'Document Setup' })).toBeVisible();
    await boot(page);
    await expect(page.locator('#start-page')).toHaveCount(0);
    // Document Setup mirrors it
    await page.keyboard.press('Control+k');
    await expect(page.locator('#set-show-start-page')).not.toBeChecked();
  });

  test('wordmark and Shift+Cmd+H return to the Start Page; Back to canvas leaves it', async ({ page }) => {
    await boot(page);
    await resetStorage(page);
    await boot(page);
    await expect(page.locator('#start-page [data-act="back"]')).toBeHidden();
    await page.locator('#start-page [data-paper="A4"]').click();
    await page.locator('#sp-rail [data-act="new"]').click();
    await expect(page.locator('#start-page')).toBeHidden();
    await page.evaluate(() => window.app.engine.addLayer('wavetable'));
    await page.locator('#app-header h1').click();
    await expect(page.locator('#start-page')).toBeVisible();
    await expect(page.locator('#start-page [data-act="back"]')).toBeVisible();
    await page.locator('#start-page [data-act="back"]').click();
    await expect(page.locator('#start-page')).toBeHidden();
    await page.keyboard.press('Meta+Shift+H');
    await expect(page.locator('#start-page')).toBeVisible();
  });

  test('editor shortcuts do nothing behind the Start Page', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window.app.startPage.hide({ restoreFocus: false });
      window.app.engine.addLayer('wavetable');
      window.app.renderer.selectLayer?.(window.app.engine.layers[0].id);
    });
    await page.locator('#app-header h1').click();
    await expect(page.locator('#start-page')).toBeVisible();
    await page.keyboard.press('Delete');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+d');
    expect(await page.evaluate(() => window.app.engine.layers.length)).toBe(1);
  });

  test('a recent is recorded on open, and reopens from the rail and from File > Open Recent', async ({ page }) => {
    await boot(page, '');
    const fixture = await makeFixture(page);
    const expected = JSON.parse(fixture).state.engine.layers.map((l) => l.type);
    await resetStorage(page);
    await boot(page, '');
    await openFixture(page, fixture, 'orchid-study.vectura');

    await page.locator('#btn-menu-file').click();
    await page.locator('#btn-open-recent').hover();
    const row = page.locator('#open-recent-panel [data-recent-id]').first();
    await expect(row).toContainText('orchid-study.vectura');
    await page.keyboard.press('Escape');

    // from the Start Page rail
    await page.evaluate(() => { window.app.engine.layers = []; window.app.markDocumentClean(); }); // reopening asks first when dirty
    await page.keyboard.press('Meta+Shift+H');
    const railRow = page.locator('#sp-rail [data-recent-id]').first();
    await expect(railRow).toContainText('orchid-study.vectura');
    await railRow.click();
    await expect(page.locator('#start-page')).toBeHidden();
    await page.waitForFunction((n) => window.app.engine.layers.length === n, expected.length);
    expect(await page.evaluate(() => window.app.engine.layers.map((l) => l.type))).toEqual(expected);

    // from File > Open Recent
    await page.evaluate(() => { window.app.engine.layers = []; window.app.markDocumentClean(); }); // reopening asks first when dirty
    await page.locator('#btn-menu-file').click();
    await page.locator('#btn-open-recent').hover();
    await page.locator('#open-recent-panel [data-recent-id]').first().click();
    await page.waitForFunction((n) => window.app.engine.layers.length === n, expected.length);
  });

  test('Clear Recent hides the list and Undo brings it back', async ({ page }) => {
    await boot(page, '');
    const fixture = await makeFixture(page, ['wavetable']);
    await resetStorage(page);
    await boot(page, '');
    await openFixture(page, fixture, 'one.vectura');
    await page.keyboard.press('Meta+Shift+H');
    await expect(page.locator('#sp-rail [data-recent-id]')).toHaveCount(1);
    await page.locator('#sp-rail [data-act="clear-recent"]').click();
    await expect(page.locator('#sp-rail [data-recent-id]')).toHaveCount(0);
    await page.locator('.vectura-toast [data-action="undo"]').click();
    await expect(page.locator('#sp-rail [data-recent-id]')).toHaveCount(1);
  });
});
