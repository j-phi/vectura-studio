const { test, expect } = require('@playwright/test');

// TUX-001 desktop parity: 1600x1000 keeps the inline menubar; a mouse user in a window
// narrower than 600 px gets the hamburger sheet and can drive it from the keyboard.
const gotoApp = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
};
const shown = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0;
}, sel);
const TRIGGERS = ['btn-menu-file', 'btn-menu-edit', 'btn-menu-object', 'btn-menu-view', 'btn-menu-insert', 'btn-menu-help'];

test.describe('TUX-001 desktop parity', () => {
  test('1600x1000 mouse: inline menubar, 38 px header, no hamburger', async ({ page }) => {
    await gotoApp(page);
    expect(await shown(page, '#btn-menu-hamburger')).toBe(false);
    for (const id of TRIGGERS) expect(await shown(page, `#${id}`), id).toBe(true);
    for (const id of ['btn-header-undo', 'btn-header-redo', 'btn-header-export', 'btn-header-generator', 'btn-header-layers']) {
      expect(await shown(page, `#${id}`), `${id} hidden on desktop`).toBe(false);
    }
    expect(await page.evaluate(() => document.getElementById('app-header').getBoundingClientRect().height)).toBe(38);
  });

  test('500x900 mouse: hamburger, no overflow, keyboard navigation', async ({ page }) => {
    await gotoApp(page);
    await page.setViewportSize({ width: 500, height: 900 });
    await page.waitForFunction(() => document.body.classList.contains('phone-layout'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(500);
    const ham = page.locator('#btn-menu-hamburger');
    await expect(ham).toBeVisible();
    await expect(ham).toHaveAttribute('aria-expanded', 'false');
    expect(await ham.getAttribute('aria-controls')).toBeTruthy();
    await ham.click();
    await expect(ham).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#phone-menu-sheet')).toBeVisible();
    const focusedLabel = () => page.evaluate(() => (document.activeElement && document.activeElement.textContent || '').trim());
    expect(await focusedLabel(), 'opening focuses the first row').toBe('File');
    await page.keyboard.press('ArrowDown');
    expect(await focusedLabel()).toBe('Edit');
    await page.keyboard.press('ArrowDown');
    expect(await focusedLabel()).toBe('Object');
    await page.keyboard.press('ArrowUp');
    expect(await focusedLabel()).toBe('Edit');
    // go to Help with the arrow keys and drill in with Enter
    await page.locator('#phone-menu-root [data-menu-target="btn-menu-help"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#btn-help')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#phone-menu-root [data-menu-target]').first()).toBeVisible();
    await expect(page.locator('#btn-help')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('#phone-menu-sheet')).toBeHidden();
    await expect(ham).toBeFocused();
    await expect(ham).toHaveAttribute('aria-expanded', 'false');
  });
});
