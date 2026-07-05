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
