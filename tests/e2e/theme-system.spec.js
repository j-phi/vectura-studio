const { test, expect } = require('@playwright/test');

// System theme: the rotation dark -> lark -> light -> system, following prefers-color-scheme live, kept in sync
// between the editor header button and the Start Page toggle, persisted across reloads, no wrong-theme flash.
const state = (page) => page.evaluate(() => ({
  theme: window.Vectura.SETTINGS.uiTheme,
  system: window.Vectura.SETTINGS.uiThemeSystem,
  skin: document.documentElement.dataset.uiSkin,
  bg: window.Vectura.SETTINGS.bgColor,
  label: document.getElementById('theme-toggle').getAttribute('aria-label'),
  icon: document.getElementById('theme-toggle').dataset.activeIcon,
}));
const boot = async (page, url = '/') => {
  await page.goto(url);
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
};

test.describe('System theme', () => {
  test('header button: Light -> System follows the OS live, then back to Dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await boot(page);
    const toggle = page.locator('#theme-toggle');
    for (let i = 0; i < 3; i += 1) await toggle.click();
    await expect(toggle).toHaveAttribute('data-active-icon', 'system');
    await expect(toggle.locator('.theme-toggle-icon--system svg')).toBeVisible();
    expect(await state(page)).toMatchObject({ theme: 'dark', system: true, skin: 'dark', label: 'Theme: System (Dark). Switch to Dark theme.' });
    const darkBg = (await state(page)).bg;

    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => state(page)).toMatchObject({ theme: 'light', system: true, skin: 'light', label: 'Theme: System (Light). Switch to Dark theme.' });
    expect((await state(page)).bg).not.toBe(darkBg); // plain sheet followed the theme

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => state(page)).toMatchObject({ theme: 'dark', system: true });

    await toggle.click();
    expect(await state(page)).toMatchObject({ theme: 'dark', system: false, label: 'Theme: Dark. Switch to Lark theme.' });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForTimeout(200);
    expect(await state(page)).toMatchObject({ theme: 'dark', system: false });
  });

  test('Start Page toggle and header button stay in sync', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await boot(page, '/?startPage=launch');
    await page.waitForFunction(() => window.app.startPage);
    await page.evaluate(() => window.app.startPage.show());
    const sp = page.locator('.sp-theme');
    await expect(sp).toBeVisible();
    for (let i = 0; i < 3; i += 1) await sp.click();
    await expect(sp).toHaveAttribute('data-mode', 'system');
    await expect(sp).toHaveAttribute('aria-label', 'Theme: System (Light). Switch to Dark theme.');
    await expect(sp.locator('.sp-ico-sun-moon')).toBeVisible();
    expect((await state(page)).label).toBe('Theme: System (Light). Switch to Dark theme.');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(sp).toHaveAttribute('aria-label', 'Theme: System (Dark). Switch to Dark theme.');
    await expect(page.locator('.sp')).toHaveAttribute('data-light', 'false');
    await sp.click();
    await expect(sp).toHaveAttribute('data-mode', 'dark');
    expect((await state(page)).icon).toBe('dark');
  });

  test('System survives a reload and is applied before first paint', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await boot(page);
    await page.evaluate(() => {
      window.Vectura.SETTINGS.cookiePreferencesEnabled = true;
      window.app.setThemeMode('system');
      window.app.persistPreferences({ force: true });
    });
    // Record data-ui-skin the moment <body> exists: before any deferred app script has run.
    await page.addInitScript(() => {
      const mo = new MutationObserver(() => {
        if (document.body && !window.__firstSkin) { window.__firstSkin = document.documentElement.dataset.uiSkin; mo.disconnect(); }
      });
      mo.observe(document, { childList: true, subtree: true });
    });
    await page.reload();
    await page.waitForFunction(() => !!(window.app && window.app.renderer));
    expect(await page.evaluate(() => window.__firstSkin)).toBe('light');
    expect(await state(page)).toMatchObject({ theme: 'light', system: true, icon: 'system' });
    // A different OS scheme on the next visit re-resolves.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload();
    await page.waitForFunction(() => !!(window.app && window.app.renderer));
    expect(await page.evaluate(() => window.__firstSkin)).toBe('dark');
    expect(await state(page)).toMatchObject({ theme: 'dark', system: true });
  });
});
