const { test, expect } = require('@playwright/test');

/*
 * e2e visual/interaction coverage for the All Tools drawer (Phase 3 Lane L —
 * TLD-1/2). Runs in a real browser against the dev server.
 *
 * The drawer's <script> tags (src/config/tool-drawer.js + src/ui/shell/
 * tool-drawer.js) are added to index.html by the phase integrator at merge, and
 * this spec file must be registered in a playwright.config project `testMatch`
 * (Lane L owns neither file). Until then, this spec self-injects the two modules
 * via addScriptTag so it is runnable the moment it is wired in — after the
 * integrator adds the real tags, the injection is a harmless no-op re-register.
 */
const injectDrawer = async (page) => {
  await page.addScriptTag({ path: 'src/config/tool-drawer.js' });
  await page.addScriptTag({ path: 'src/ui/shell/tool-drawer.js' });
  await page.evaluate(() => window.Vectura.UI.ToolDrawer.attach(window.app.ui));
};

test.describe('All Tools drawer', () => {
  test('opens from the overflow affordance, lists every tool once, activates + cross-highlights', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');
    await injectDrawer(page);

    // Overflow "…" affordance is injected into the rail.
    const overflow = page.locator('#tool-overflow-btn');
    await expect(overflow).toBeVisible();

    // Opening reveals the "All Tools" drawer.
    await overflow.click();
    const drawer = page.locator('#tool-drawer');
    await expect(drawer).toBeVisible();
    await expect(page.locator('.tool-drawer-title')).toHaveText('All Tools');

    // Category headers in order.
    await expect(page.locator('.tool-drawer-category-label')).toHaveText([
      'Select', 'Draw', 'Shapes', 'Type', 'Modify', 'Navigate',
    ]);

    // Every registered tool appears exactly once (derived from the rail registry).
    const inventory = await page.evaluate(() => {
      const defs = window.app.ui.getSharedToolbarDefinitions();
      const PLACEHOLDERS = ['shape', 'pen', 'scissor'];
      const expected = Object.keys(defs).filter((k) => !PLACEHOLDERS.includes(k)).sort();
      const drawerIds = Array.from(document.querySelectorAll('.tool-drawer-item'))
        .map((el) => el.dataset.toolId).sort();
      return { expected, drawerIds, unique: new Set(drawerIds).size };
    });
    expect(inventory.unique).toBe(inventory.drawerIds.length);
    expect(inventory.drawerIds).toEqual(inventory.expected);

    // Clicking an entry activates the tool and the drawer STAYS open.
    await page.locator('.tool-drawer-item[data-tool-id="shape-line"]').click();
    expect(await page.evaluate(() => window.app.ui.activeTool)).toBe('shape-line');
    await expect(drawer).toBeVisible();

    // TLD-2: hovering an entry rings its rail slot.
    await page.locator('.tool-drawer-item[data-tool-id="pen-add"]').hover();
    await expect(page.locator('.tool-btn[data-tool="pen"]')).toHaveClass(/tool-drawer-rail-highlight/);

    // Grid/list toggle persists in SETTINGS.
    await page.locator('.tool-drawer-view-btn[data-view="list"]').click();
    expect(await page.evaluate(() => window.Vectura.SETTINGS.toolDrawerView)).toBe('list');
    await expect(drawer).toHaveAttribute('data-view', 'list');

    // Clicking the canvas closes the drawer.
    await page.locator('#main-canvas').click({ position: { x: 30, y: 30 } });
    await expect(drawer).toBeHidden();

    expect(pageErrors).toEqual([]);
  });
});

// TUX-013 desktop guard: the one-row touch rail must not change desktop or fine-pointer windows.
// Baselines measured on the pre-fix base: 1600x1000 rail 52x477 absolute; 800x900 fine pointer rail 800x174 static.
test.describe('TUX-013 desktop parity', () => {
  const railState = (page) => page.evaluate(() => {
    const rail = document.getElementById('tool-bar');
    const r = rail.getBoundingClientRect();
    const f = rail.querySelector('.toolbar-footer').getBoundingClientRect();
    const h = rail.querySelector('.toolbar-drag-handle').getBoundingClientRect();
    return { w: r.width, h: r.height, pos: getComputedStyle(rail).position, footerW: f.width, footerH: f.height,
      handleH: h.height, overflowed: rail.querySelectorAll('.rail-overflowed').length, touchUi: document.body.classList.contains('touch-ui') };
  });
  test('1600x1000 vertical rail is unchanged', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#tool-bar .tool-btn');
    await page.waitForTimeout(600);
    const s = await railState(page);
    expect(s.touchUi).toBe(false);
    expect(Math.round(s.w)).toBe(52);
    expect(Math.abs(s.h - 477)).toBeLessThanOrEqual(1);
    expect(s.pos).toBe('absolute');
    expect(s.footerH).toBeGreaterThan(0);
    expect(s.handleH).toBeGreaterThan(0);
    expect(s.overflowed).toBe(0);
  });
  test('800x900 fine-pointer window keeps its pre-fix rail', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto('/');
    await page.waitForSelector('#tool-bar .tool-btn');
    await page.waitForTimeout(600);
    const s = await railState(page);
    expect(s.touchUi).toBe(false);
    expect(Math.abs(s.h - 174)).toBeLessThanOrEqual(1);
    expect(s.footerH).toBeGreaterThan(0);
    expect(s.overflowed).toBe(0);
  });
});
