const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-031: touch equivalents for keyboard-only controls. Isolation exit (Escape), Arrange
// (Cmd+[ / Cmd+]) and the shape-property verify-first checks. Fingers only; SETUP uses the app API.
const EVID = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-031';
const phoneLayout = (page) => page.evaluate(() => document.body.classList.contains('phone-layout'));

const boot = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
};

test.describe('TUX-031 keyboard-only controls by finger', () => {
  test.beforeEach(async ({ page }) => { await boot(page); });

  test('isolation exit control is finger sized and exits one level', async ({ page }, testInfo) => {
    await page.evaluate(() => {
      const { engine, ui, renderer } = window.app;
      const a = engine.addLayer('spiral');
      const b = engine.addLayer('flowfield');
      renderer.setSelection([a, b], b);
      ui.groupSelection();
      const child = engine.layers.find((l) => l.parentId);
      renderer.enterGroupEditMode(child);
    });
    await page.waitForSelector('.iso-breadcrumb.is-visible');
    await page.waitForTimeout(400);
    const sel = '[data-action="exit-group-edit"]';
    await expect(page.locator(sel)).toBeVisible({ timeout: 3000 });
    const hit = await touch.hitArea(page, page.locator(sel));
    expect(hit.w, `exit control hit ${hit.w}x${hit.h}`).toBeGreaterThanOrEqual(44);
    expect(hit.h).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `${EVID}/${testInfo.project.name}-isolation.png` }).catch(() => {});
    await touch.tap(page, page.locator(sel));
    await expect.poll(() => page.evaluate(() => window.app.renderer.groupEditMode == null)).toBe(true);
  });

  test('Object menu arranges the selection by finger', async ({ page }, testInfo) => {
    const ids = await page.evaluate(() => {
      const { engine, renderer } = window.app;
      const a = engine.addLayer('spiral'); const b = engine.addLayer('flowfield'); const c = engine.addLayer('grid');
      window.app.pushHistory();
      renderer.setSelection([a], a);
      return { a, b, c };
    });
    const openObject = async () => {
      if (await phoneLayout(page)) {
        await touch.tap(page, page.locator('#btn-menu-hamburger'));
        await page.waitForTimeout(150);
      }
      const trigger = page.locator('#btn-menu-object');
      await trigger.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      await touch.tap(page, trigger);
      await page.waitForTimeout(200);
    };
    await openObject();
    const items = ['bring-forward', 'send-backward', 'bring-to-front', 'send-to-back'].map((n) => `#btn-object-${n}`);
    for (const s of items) expect(await page.locator(s).count(), `${s} present`).toBe(1);
    for (const s of items) expect(await page.locator(s).isDisabled(), `${s} enabled with a selection`).toBe(false);
    await page.screenshot({ path: `${EVID}/${testInfo.project.name}-object-menu.png` }).catch(() => {});
    const h0 = await page.evaluate(() => window.app.history.length);
    const item = page.locator('#btn-object-bring-to-front');
    await item.scrollIntoViewIfNeeded();
    await touch.tap(page, item);
    await expect.poll(() => page.evaluate(() => window.app.engine.layers.map((l) => l.id).pop())).toBe(ids.a);
    expect(await page.evaluate(() => window.app.history.length), 'history +1').toBe(h0 + 1);
    // Nothing selected: the items disable.
    await page.evaluate(() => { window.app.renderer.setSelection([], null); });
    await openObject();
    for (const s of items) expect(await page.locator(s).isDisabled(), `${s} disabled with no selection`).toBe(true);
  });

  test('polygon sides adjust by finger through Shape Properties', async ({ page }, testInfo) => {
    test.fail(testInfo.project.name.includes('iphone-portrait'), 'phone ctxbar display:none - ownership gap (journeys.md:67)');
    await page.evaluate(() => { window.app.ui.setActiveTool('shape-polygon'); });
    const r = await page.evaluate(() => { const b = document.querySelector('#main-canvas').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
    const from = { x: r.x + r.w * 0.45, y: r.y + r.h * 0.35 };
    await touch.drag(page, from, { x: from.x + 90, y: from.y + 90 });
    await expect.poll(() => page.evaluate(() => window.app.renderer.getShapePropsState && window.app.renderer.getShapePropsState() && window.app.renderer.getShapePropsState().type)).toBe('polygon');
    const sides0 = await page.evaluate(() => window.app.renderer.getShapePropsState().sides);
    const btn = page.locator('.ctxbar.is-visible .ctxbar-btn').filter({ has: page.locator('svg') }).locator('xpath=self::*[contains(@title,"hape") or contains(@aria-label,"hape")]').first();
    await expect(btn).toBeVisible();
    await touch.tap(page, btn);
    const more = page.locator('.shape-props-popover .shape-props-sides .shape-props-stepper[aria-label="More sides"]');
    await expect(more).toBeVisible();
    await page.screenshot({ path: `${EVID}/${testInfo.project.name}-shape-props.png` }).catch(() => {});
    await touch.tap(page, more);
    await expect.poll(() => page.evaluate(() => window.app.renderer.getShapePropsState().sides)).toBe(sides0 + 1);
  });
});
