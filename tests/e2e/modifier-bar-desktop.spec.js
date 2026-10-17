const { test, expect } = require('@playwright/test');

// TUX-045 D6: a mouse-only desktop never shows the touch modifier bar, and a latch never touches mouse input.
test.describe('TUX-045 desktop parity', () => {
  for (const size of [{ width: 1600, height: 1000 }, { width: 800, height: 900 }]) {
    test(`modifier bar hidden for a mouse at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/');
      await page.waitForFunction(() => !!(window.app && window.Vectura.InputModifiers));
      await page.waitForTimeout(400);
      const shown = await page.evaluate(() => {
        const bar = document.getElementById('touch-modifier-bar');
        const r = bar.getBoundingClientRect();
        return getComputedStyle(bar).display !== 'none' && r.width > 0 && r.height > 0;
      });
      expect(shown).toBe(false);
    });
  }

  test('keyboard modifiers read as before; a latch never applies to a mouse event', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.Vectura.InputModifiers));
    const r = await page.evaluate(() => {
      const IM = window.Vectura.InputModifiers;
      IM.tap('constrain', 0);
      IM.tap('multiSelect', 0);
      IM.tap('duplicate', 0);
      return {
        mouse: IM.readModifiers({ pointerType: 'mouse' }),
        shift: IM.readModifiers({ pointerType: 'mouse', shiftKey: true }),
        meta: IM.readModifiers({ pointerType: 'mouse', metaKey: true }),
        renderer: window.app.renderer.getModifierState({ pointerType: 'mouse', shiftKey: true, altKey: true }),
      };
    });
    expect(r.mouse).toEqual({ shift: false, alt: false, meta: false, ctrl: false, pan: false, additive: false, rawShift: false, multiSelect: false });
    expect(r.shift.additive).toBe(true);
    expect(r.shift.shift).toBe(true);
    expect(r.meta.meta).toBe(true);
    expect(r.meta.additive).toBe(true);
    expect(r.renderer.shift && r.renderer.alt).toBe(true);
  });
});
