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
  // TUX-016 (stale by design): in mobile-layout the rail is position: static, so the drag handle and the
  // pin/home/rotate footer did nothing there. They no longer render for any pointer type; the rail
  // loses their 21 px (174 -> 153). Everything else about the rail is unchanged.
  test('800x900 fine-pointer window keeps its pre-fix rail', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto('/');
    await page.waitForSelector('#tool-bar .tool-btn');
    await page.waitForTimeout(600);
    const s = await railState(page);
    expect(s.touchUi).toBe(false);
    expect(Math.abs(s.h - 153)).toBeLessThanOrEqual(1);
    expect(s.footerH).toBe(0);
    expect(s.handleH).toBe(0);
    expect(s.overflowed).toBe(0);
  });
  // Decision (TUX-013): the phone rail keys on phone-layout, which a narrow FINE-pointer window also gets.
  // That keeps one phone contract for every 500 px viewport. Pinned here so a change is deliberate.
  test('500x800 fine-pointer window gets the phone rail contract', async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 800 });
    await page.goto('/');
    await page.waitForSelector('#tool-bar .tool-btn');
    await page.waitForTimeout(600);
    const s = await page.evaluate(() => {
      const rail = document.getElementById('tool-bar');
      const cl = document.body.classList;
      const vis = (e) => !!e && e.getBoundingClientRect().width > 0;
      return { phone: cl.contains('phone-layout'), touchUi: cl.contains('touch-ui'), h: rail.getBoundingClientRect().height,
        overflowed: rail.querySelectorAll('.rail-overflowed').length, footer: vis(rail.querySelector('.toolbar-footer')),
        ovBtn: vis(document.getElementById('tool-overflow-btn')), scrollW: rail.scrollWidth, clientW: rail.clientWidth,
        keep: window.Vectura.TOOL_RAIL.phone.length };
    });
    expect(s.phone).toBe(true);
    expect(s.touchUi).toBe(false);
    expect(s.h).toBeLessThanOrEqual(52);
    expect(s.overflowed).toBeGreaterThan(0);
    expect(s.footer).toBe(false);
    expect(s.ovBtn).toBe(true);
    expect(s.scrollW).toBeLessThanOrEqual(s.clientW + 1);
  });

  test('Reset View (expandPanes) at phone layout clears stale rail overflow state', async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 800 });
    await page.goto('/');
    await page.waitForSelector('#tool-bar .tool-btn');
    await page.waitForTimeout(600);
    await page.evaluate(() => window.app.ui.setActiveTool('lasso'));
    const before = await page.evaluate(() => ({
      overflowed: document.querySelectorAll('.rail-overflowed').length,
      pressed: document.getElementById('tool-overflow-btn').getAttribute('aria-pressed'),
    }));
    expect(before.overflowed).toBeGreaterThan(0);
    expect(before.pressed).toBe('true');
    await page.evaluate(() => window.app.ui.expandPanes());
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('.rail-overflowed').length)).toBe(0);
    expect(await page.evaluate(() => document.body.classList.contains('phone-layout'))).toBe(false);
    expect(await page.locator('#tool-overflow-btn').getAttribute('aria-pressed')).toBeNull();
  });
});

// TUX-015 desktop guard (D6): touch sizing and placement must not change the mouse contract.
test.describe('TUX-015 desktop parity', () => {
  test('mouse drawer keeps 34px grid items, 24x22 toggles and opens beside the vertical rail', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui));
    await page.waitForSelector('#tool-overflow-btn');
    await page.waitForTimeout(500);
    await page.locator('#tool-overflow-btn').click();
    await expect(page.locator('#tool-drawer')).toBeVisible();
    await page.locator('.tool-drawer-view-btn[data-view="grid"]').click();
    const m = await page.evaluate(() => {
      const dr = document.getElementById('tool-drawer').getBoundingClientRect();
      const rail = document.getElementById('tool-bar').getBoundingClientRect();
      const item = document.querySelector('.tool-drawer-item').getBoundingClientRect();
      const tg = document.querySelector('.tool-drawer-view-btn').getBoundingClientRect();
      return { dl: dr.left, dt: dr.top, dh: dr.height, rr: rail.right, rt: rail.top, vh: innerHeight,
        iw: item.width, ih: item.height, tw: tg.width, th: tg.height };
    });
    expect([m.iw, m.ih]).toEqual([34, 34]);
    expect([m.tw, m.th]).toEqual([24, 22]);
    expect(m.dl).toBeGreaterThanOrEqual(m.rr);
    expect(Math.abs(m.dt - Math.max(8, Math.min(m.vh - m.dh - 8, m.rt)))).toBeLessThanOrEqual(1);
    await page.screenshot({ path: require('path').join(__dirname, '../..', 'docs/touch-audit/evidence/after/TUX-015/desktop-1600x1000.png') });
  });
});

// TUX-015 fix round: a toolbar docked at the bottom is a horizontal rail with little room below it.
test.describe('TUX-015 desktop bottom-docked rail', () => {
  test('drawer opens above a bottom-docked toolbar, inside the viewport, every item hittable', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui));
    await page.waitForSelector('#tool-overflow-btn');
    await page.waitForTimeout(500);
    // Dock via the real drag-to-edge gesture on the toolbar handle.
    const handle = page.locator('.toolbar-drag-handle').first();
    const hb = await handle.boundingBox();
    const vp = await page.evaluate(() => {
      const r = document.querySelector('.viewport-container, #viewport-container, .canvas-container')?.getBoundingClientRect();
      return r ? { left: r.left, right: r.right, bottom: r.bottom } : { left: 0, right: 1600, bottom: 1000 };
    });
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + 300, hb.y + 200, { steps: 5 });
    await page.mouse.move((vp.left + vp.right) / 2, vp.bottom - 20, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('#tool-bar')).toHaveClass(/toolbar-docked-bottom/);
    await page.waitForTimeout(300);
    await page.locator('#tool-overflow-btn').click();
    await expect(page.locator('#tool-drawer')).toBeVisible();
    const m = await page.evaluate(() => {
      const dr = document.getElementById('tool-drawer').getBoundingClientRect();
      const rail = document.getElementById('tool-bar').getBoundingClientRect();
      const bad = [];
      document.querySelectorAll('.tool-drawer-item').forEach((el) => {
        el.scrollIntoView({ block: 'nearest' });
        const r = el.getBoundingClientRect();
        const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!(t && (el === t || el.contains(t)))) bad.push(el.dataset.toolId);
      });
      return { l: dr.left, t: dr.top, r: dr.right, b: dr.bottom, h: dr.height, railTop: rail.top, bad };
    });
    expect(m.l).toBeGreaterThanOrEqual(0);
    expect(m.t).toBeGreaterThanOrEqual(0);
    expect(m.r).toBeLessThanOrEqual(1600);
    expect(m.b).toBeLessThanOrEqual(1000);
    expect(m.h).toBeGreaterThanOrEqual(400);
    expect(m.bad).toEqual([]);
  });
});
