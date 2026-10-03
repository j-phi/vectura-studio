const { test, expect } = require('@playwright/test');

// TUX-028 D6: desktop (mouse) Type sessions must not use the touch proxy and
// must keep the window-keydown path, including global Cmd+S / Cmd+E.
const PROXY = '[data-text-proxy]';
const isMac = process.platform === 'darwin';
const MOD = isMac ? 'Meta' : 'Control';

test.describe('TUX-028 desktop parity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.textEdit));
  });

  const open = async (page) => {
    await page.locator('.tool-btn[data-tool="type"]').click();
    const box = await page.locator('#main-canvas').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };

  test('mouse session never focuses the proxy and types via keydown', async ({ page }) => {
    await open(page);
    const onProxy = await page.evaluate((sel) => !!(document.activeElement && document.activeElement.matches(sel)), PROXY);
    expect(onProxy).toBe(false);
    await page.keyboard.type('Ab');
    expect(await page.evaluate(() => window.app.engine.getActiveLayer().params.text)).toBe('Ab');
  });

  test('undo chord ends the session and undoes once', async ({ page }) => {
    await open(page);
    await page.keyboard.type('Ab');
    const before = await page.evaluate(() => window.app.history.length);
    await page.keyboard.press(`${MOD}+z`);
    const s = await page.evaluate(() => ({ active: window.app.textEdit.isActive(), h: window.app.history.length }));
    expect(s.active).toBe(false);
    expect(s.h).toBe(before - 1);
  });

  test('Cmd/Ctrl+S and +E still reach the app handlers during a session', async ({ page }) => {
    await open(page);
    await page.keyboard.type('Ab');
    const hit = await page.evaluate(() => {
      window.__keys = [];
      window.addEventListener('keydown', (e) => { if (e.defaultPrevented) window.__keys.push(`${e.key}:prevented`); else window.__keys.push(`${e.key}:open`); });
      return true;
    });
    expect(hit).toBe(true);
    await page.keyboard.press(`${MOD}+s`);
    await page.keyboard.press(`${MOD}+e`);
    const keys = await page.evaluate(() => window.__keys);
    // Modified chords are not owned by the text session: they reach the app's
    // shortcut handler, which preventDefaults them (save / export). Measured on the
    // pre-TUX-028 code path: identical.
    expect(keys.filter((k) => !k.startsWith(MOD === 'Meta' ? 'Meta' : 'Control'))).toEqual(['s:prevented', 'e:prevented']);
  });
});
