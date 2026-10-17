const { test, expect } = require('@playwright/test');

// TUX-051 D6 guard: a mouse press on the bottom resizer still expands the pane; a drag still resizes.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const prep = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  await sleep(500);
  await page.evaluate(() => document.getElementById('bottom-pane').classList.add('bottom-pane-collapsed'));
};
const info = (page) => page.evaluate(() => ({
  collapsed: document.getElementById('bottom-pane').classList.contains('bottom-pane-collapsed'),
  h: document.getElementById('bottom-pane').getBoundingClientRect().height,
}));

test('mouse click on the bottom resizer expands the collapsed pane', async ({ page }) => {
  await prep(page);
  const b = await page.locator('#bottom-resizer').boundingBox();
  await page.mouse.move(b.x + 40, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await sleep(200);
  expect((await info(page)).collapsed).toBe(false);
});

test('mouse drag of 40 px up resizes the pane', async ({ page }) => {
  await prep(page);
  const before = await info(page);
  const b = await page.locator('#bottom-resizer').boundingBox();
  const y = b.y + b.height / 2;
  await page.mouse.move(b.x + 40, y);
  await page.mouse.down();
  await page.mouse.move(b.x + 40, y - 40, { steps: 8 });
  await page.mouse.up();
  await sleep(200);
  const after = await info(page);
  expect(after.collapsed).toBe(false);
  expect(after.h).toBeGreaterThan(before.h);
});

// Q27 / TUX-060 R3: the panel resizers run on Pointer Events with pointer capture. A mouse drag keeps
// working, a touch pointer drags the same way, and pointercancel restores the starting size.
const paneW = (page, id) => page.evaluate((i) => document.getElementById(i).getBoundingClientRect().width, id);

test('mouse drag of the left and right pane resizers resizes the panes and stores the width', async ({ page }) => {
  await prep(page);
  for (const [side, dir] of [['left', 1], ['right', -1]]) {
    const before = await paneW(page, `${side}-pane`);
    const b = await page.locator(`#${side}-resizer`).boundingBox();
    const y = b.y + b.height / 2;
    await page.mouse.move(b.x + b.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + dir * 40, y, { steps: 8 });
    await page.mouse.up();
    await sleep(500); // the pane width has a CSS transition
    const after = await paneW(page, `${side}-pane`);
    expect(Math.abs(after - before - 40), `${side} pane grew by ~40`).toBeLessThanOrEqual(2);
    expect(await page.evaluate((s) => window.Vectura.SETTINGS[s === 'left' ? 'paneLeftWidth' : 'paneRightWidth'], side)).toBe(Math.round(after));
  }
});

test('resizers are touch-action none and are touch-action none', async ({ page }) => {
  await prep(page);
  for (const id of ['left-resizer', 'right-resizer', 'bottom-resizer']) {
    expect(await page.evaluate((i) => getComputedStyle(document.getElementById(i)).touchAction, id), id).toBe('none');
  }
});

// A touch pointer sequence, dispatched on the resizer (pointer capture on a synthetic id is a no-op).
const touchSeq = (page, id, axis, delta, endType) => page.evaluate(({ id, axis, delta, endType }) => {
  const el = document.getElementById(id);
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const ev = (type, dx, dy) => new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 41, pointerType: 'touch', isPrimary: true, clientX: x + dx, clientY: y + dy, button: 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1 });
  el.dispatchEvent(ev('pointerdown', 0, 0));
  const dx = axis === 'x' ? delta : 0;
  const dy = axis === 'y' ? delta : 0;
  el.dispatchEvent(ev('pointermove', dx, dy));
  const rootVar = (n) => parseFloat(document.documentElement.style.getPropertyValue(n));
  const mid = { w: rootVar('--pane-left-width'), h: rootVar('--bottom-pane-height'), collapsed: document.getElementById('bottom-pane').classList.contains('bottom-pane-collapsed') };
  el.dispatchEvent(ev(endType, dx, dy));
  return mid;
}, { id, axis, delta, endType });

test('a touch pointer drags the left pane, and pointercancel restores the starting width', async ({ page }) => {
  await prep(page);
  const before = await paneW(page, 'left-pane');
  const stored = await page.evaluate(() => window.Vectura.SETTINGS.paneLeftWidth);
  const seq = await touchSeq(page, 'left-resizer', 'x', 50, 'pointercancel');
  expect(seq.w, 'width var follows the touch pointer').toBeGreaterThan(before + 30);
  await sleep(500);
  expect(Math.abs((await paneW(page, 'left-pane')) - before), 'cancel restored the width').toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => window.Vectura.SETTINGS.paneLeftWidth), 'cancel stores nothing').toBe(stored);
  expect(await page.evaluate(() => document.getElementById('left-resizer').classList.contains('active'))).toBe(false);
});

test('a touch pointer drags the bottom pane, and pointercancel restores its state', async ({ page }) => {
  await prep(page); // the pane starts collapsed
  const seq = await touchSeq(page, 'bottom-resizer', 'y', -60, 'pointercancel');
  expect(seq.collapsed, 'pane opened past the slop').toBe(false);
  expect(seq.h).toBeGreaterThan(80);
  await sleep(500);
  expect((await info(page)).collapsed, 'cancel put the collapsed state back').toBe(true);
});
