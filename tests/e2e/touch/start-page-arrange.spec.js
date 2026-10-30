const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// Start Page Arrange: a finger drags a row by its handle and the new order is kept (pointer + keyboard are in
// tests/e2e/start-page-plates-integrated.spec.js).
const TYPES = ['rings', 'topo', 'flowfield', 'rainfall'];

test('a finger drag on a row handle reorders the plates', async ({ page }) => {
  await page.goto('/?startPage=launch');
  await page.waitForFunction(() => !!(window.app && window.app.startPage && window.app.recents));
  await page.evaluate(async (list) => {
    for (const t of list) {
      window.app.engine.layers.length = 0;
      window.app.engine.addLayer(t);
      await window.app.recents.record({ name: `${t}-study.vectura`, source: 'save', forceNew: true });
    }
    window.app.engine.layers.length = 0;
    window.app.markDocumentClean();
    window.app.startPage.show();
  }, TYPES);
  await expect(page.locator('#sp-plates .sp-pl .spl').first()).toBeVisible({ timeout: 15000 });
  const order = () => page.locator('.sp-pl').evaluateAll((els) => els.map((e) => e.dataset.plateId));
  const start = await order();
  await page.locator('#sp-pl-arrange').scrollIntoViewIfNeeded();
  await page.locator('#sp-pl-arrange').tap();
  const rows = page.locator('.sp-arr-row');
  await expect(rows).toHaveCount(4);
  // Drag plate 4 up one slot, to plate 3, the way a person does: the finger follows the row it is aiming at and lets go
  // when the labelled drop line says "Drop as plate 03". In a short pane (iPhone landscape: the list scroller is only
  // 147-219 px tall and its top and bottom thirds autoscroll) plates 1-3 are not all on screen at once, so aiming at
  // fixed coordinates measured before the drag lands wherever autoscroll has taken the list by then.
  const geo = () => page.evaluate(() => {
    const row = document.querySelectorAll('.sp-arr-row')[2].getBoundingClientRect();
    let sc = document.querySelector('.sp-arr-list');
    while (sc && !(sc.scrollHeight > sc.clientHeight && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
    const pane = sc ? sc.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    const drop = document.querySelector('.sp-arr-drop');
    return { x: row.left + 40, aim: row.top + row.height / 2 - 8, top: pane.top + 2, bottom: pane.bottom - 2, label: drop && !drop.hidden ? drop.dataset.label : '' };
  });
  await rows.nth(3).scrollIntoViewIfNeeded();
  const gb = await rows.nth(3).locator('[data-arr-grip]').boundingBox();
  let at = { x: gb.x + gb.width / 2, y: Math.min(gb.y + gb.height / 2, (await geo()).bottom) };
  await touch.touchPhase(page, 'start', [{ ...at, id: 0 }]);
  let settled = 0;
  for (let i = 0; i < 120 && settled < 3; i += 1) {
    const g = await geo();
    const y = Math.max(g.top, Math.min(g.bottom, g.aim));
    at = { x: g.x, y: at.y + Math.max(-14, Math.min(14, y - at.y)) };
    await touch.touchPhase(page, 'move', [{ ...at, id: 0 }]);
    await page.waitForTimeout(16);
    settled = g.label === 'Drop as plate 03' && Math.abs(y - at.y) < 3 ? settled + 1 : 0;
  }
  await touch.touchPhase(page, 'end', [{ ...at, id: 0 }]);
  await page.waitForTimeout(600);
  await page.locator('[data-arr-done]').tap();
  await page.waitForTimeout(500);
  const moved = await order();
  expect(moved).not.toEqual(start);
  expect(moved).toEqual([start[0], start[1], start[3], start[2]]);
});
