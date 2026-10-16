const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-038 req 3 (regression, VERIFY-FIRST): a finger can rename without a double-click.
//   1  a Scene 3D object: tap its row, tap the Name field (.vs3-name-input), type, Enter.
//   2  a layer: long-press the row (TUX-034), tap Rename in the menu, type, Enter.
// Setup (layers, pane open) goes through page.evaluate; every tested action is a finger.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const boot = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
};
const openPane = async (page, side) => {
  await page.evaluate((s) => window.Vectura.UI.Workspace.paneState.open(s), side);
  await page.waitForFunction((s) => document.getElementById(`${s}-pane`).getBoundingClientRect().width > 100, side);
  await sleep(500);
};
const nameOf = (page, id) => page.evaluate((i) => window.app.engine.getLayerById(i).name, id);

test('1: a Scene 3D object renames through its Name field', async ({ page }) => {
  await boot(page);
  const { childId } = await page.evaluate(() => {
    const eng = window.app.engine;
    const sceneId = eng.addLayer('scene3d');
    const child = eng.layers.find((l) => l.parentId === sceneId);
    // Select each child once so the panel adds its default fields (see gestures.spec.js).
    eng.layers.filter((l) => l.parentId === sceneId).forEach((c) => window.app.renderer.setSelection([c.id], c.id));
    window.app.renderer.setSelection([sceneId], sceneId);
    eng.activeLayerId = sceneId;
    window.app.ui.renderLayers();
    return { childId: child.id };
  });
  await openPane(page, 'right');
  const row = page.locator(`#layer-list [data-lvl-id="${childId}"]`).first();
  await row.scrollIntoViewIfNeeded();
  await touch.tap(page, row.locator('.lvl-name, .lvl-grp-name').first());
  await openPane(page, 'left'); // setup: the object page lives in the Generator pane
  const input = page.locator('#left-panel-content .vs3-name-input').first();
  await input.scrollIntoViewIfNeeded();
  await touch.tap(page, input);
  await input.fill('Finger Renamed');
  await page.keyboard.press('Enter');
  await expect.poll(() => nameOf(page, childId)).toBe('Finger Renamed');
});

test('2: a layer renames through the long-press menu', async ({ page }) => {
  await boot(page);
  const id = await page.evaluate(() => {
    const eng = window.app.engine;
    const lid = eng.addLayer('rings');
    eng.activeLayerId = lid;
    window.app.renderer.setSelection([lid], lid);
    window.app.ui.renderLayers();
    return lid;
  });
  await openPane(page, 'right');
  const row = page.locator(`#layer-list [data-lvl-id="${id}"]`).first();
  await row.scrollIntoViewIfNeeded();
  await touch.longPress(page, row.locator('.lvl-name'), 700);
  const item = page.locator('.menu-dropdown.is-context-menu.open .menu-entry[data-key="rename"]');
  await expect(item).toBeVisible();
  await touch.tap(page, item);
  const input = page.locator('#layer-list .lvl-ren-inp');
  await expect(input).toBeVisible();
  await input.fill('Held Renamed');
  await page.keyboard.press('Enter');
  await expect.poll(() => nameOf(page, id)).toBe('Held Renamed');
});

// TUX-038 req 5, both engines: the double-tap interval is read from event time stamps, never from the wall clock when a
// handler runs. Playwright WebKit queues a real second tap behind a busy main thread (J2 on the heavy document cannot make a
// 110 ms double tap there), so this stamps the events itself: two taps stamped 110 ms apart, with the main thread blocked
// for 700 ms between them. Date.now() at handler time would read 700+ ms and refuse the double tap; the stamp reads 110 ms.
test('3: a double tap stamped 110 ms apart renames although the main thread blocks 700 ms between the taps', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { window.app.engine.addLayer('spiral'); window.app.ui.renderLayers(); });
  await openPane(page, 'right');
  const opened = await page.evaluate(() => {
    const name = document.querySelector('#layer-list .lvl-name');
    const fire = (type, stamp) => {
      const ev = type === 'click'
        ? new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: window })
        : new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 77, pointerType: 'touch', isPrimary: true });
      Object.defineProperty(ev, 'timeStamp', { value: stamp });
      (document.querySelector('#layer-list .lvl-name') || name).dispatchEvent(ev);
    };
    fire('pointerdown', 5000); fire('pointerup', 5040); fire('click', 5040);
    const t0 = performance.now();
    while (performance.now() - t0 < 700) { /* the main thread is busy */ }
    fire('pointerdown', 5110); fire('pointerup', 5150); fire('click', 5150);
    return !!document.querySelector('.lvl-ren-inp');
  });
  expect(opened, 'the rename input opened from event time stamps 110 ms apart').toBe(true);
});
