const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-035: tapping "Algorithm Layer" in the Layers add menu drills into the algorithm list
// instead of silently adding the stray default (Attractor) layer. Finger-only: every action is
// touch.tap / touch.drag. The pane is opened by its own toggle button (finger) when needed.
const IPHP = ['touch-iphone-portrait', 'webkit-iphone-portrait', 'touch-iphone-portrait-chrome'];
const HIT_MIN = 44;
const PARENT_ROWS = ['algo-parent', 'mirror', 'morph', 'layer', 'group'];

const layerCount = (page) => page.evaluate(() => window.app.engine.layers.length);

const addBtnBox = (page) => page.locator('#btn-add-layer').boundingBox().catch(() => null);

// Finger-only reachability: the button needs a real box inside the visual viewport.
const reachable = async (page) => {
  const b = await addBtnBox(page);
  const vp = page.viewportSize();
  return !!(b && b.width > 4 && b.height > 4 && b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width && b.y + b.height <= vp.height);
};

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    window.__mouse = [];
    ['mousedown', 'click'].forEach((type) => window.addEventListener(type, (e) => window.__mouse.push(type + ':' + (e.isTrusted ? 't' : 'u')), true));
  });
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  await page.waitForTimeout(300);
  if (!(await reachable(page))) {
    for (const id of ['btn-pane-toggle-right', 'btn-mobile-pane-right']) {
      const btn = page.locator(`#${id}`);
      if (await btn.isVisible().catch(() => false)) {
        await touch.tap(page, btn);
        await page.waitForTimeout(400);
        if (await reachable(page)) break;
      }
    }
  }
  test.fixme(IPHP.includes(testInfo.project.name) && !(await reachable(page)), 'blocked on TUX-010: Layers pane unreachable by finger');
  expect(await reachable(page), '#btn-add-layer reachable by finger').toBe(true);
});

const openAdd = async (page) => { await touch.tap(page, page.locator('#btn-add-layer')); await expect(page.locator('#layer-add-menu')).toBeVisible(); };
const drill = async (page) => {
  await openAdd(page);
  await touch.tap(page, page.locator('#layer-add-menu .lvl-add-item[data-add="algo-parent"]'));
};
const DRILL = '#layer-add-menu.is-drill .lvl-add-drill-list';

test('A: tap drills down and adds nothing', async ({ page }) => {
  const n0 = await layerCount(page);
  await drill(page);
  expect(await layerCount(page), 'layers after tapping Algorithm Layer').toBe(n0);
  await expect(page.locator('.vectura-toast', { hasText: /Added .* layer/ })).toHaveCount(0);
  await expect(page.locator(DRILL)).toBeVisible();
  await expect(page.locator('#layer-add-menu [data-add="algo-back"]')).toBeVisible();
  await expect(page.locator('#lvl-algo-submenu')).toHaveCSS('display', 'none');
});

test('B: pick adds exactly one of that type', async ({ page }) => {
  const n0 = await layerCount(page);
  await drill(page);
  const row = page.locator(`${DRILL} [data-algo-type="flowfield"]`);
  await row.scrollIntoViewIfNeeded();
  await touch.tap(page, row);
  expect(await layerCount(page)).toBe(n0 + 1);
  expect(await page.evaluate(() => window.app.engine.getActiveLayer().type)).toBe('flowfield');
  await expect(page.locator('#layer-add-menu')).toBeHidden();
  await expect(page.locator('#lvl-algo-submenu')).toHaveCSS('display', 'none');
  await expect(page.locator('.vectura-toast', { hasText: 'flowfield' })).toHaveCount(1);
});

test('C: drill list fits the viewport and the last 3D entry is reachable', async ({ page }) => {
  const n0 = await layerCount(page);
  await drill(page);
  const vp = page.viewportSize();
  const fit = await page.evaluate(() => {
    const r = document.querySelector('#layer-add-menu').getBoundingClientRect();
    return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, vvh: window.visualViewport.height, vvw: window.visualViewport.width };
  });
  expect(fit.top).toBeGreaterThanOrEqual(0);
  expect(fit.left).toBeGreaterThanOrEqual(0);
  expect(fit.right).toBeLessThanOrEqual(vp.width);
  expect(fit.bottom).toBeLessThanOrEqual(vp.height);
  expect(fit.bottom).toBeLessThanOrEqual(fit.vvh + 1);
  const last = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#layer-add-menu .lvl-add-drill-list [data-algo-type]')];
    const pick = rows.filter((r) => ['rasterPlane', 'polyhedron'].includes(r.dataset.algoType)).pop() || rows[rows.length - 1];
    return pick.dataset.algoType;
  });
  const row = page.locator(`${DRILL} [data-algo-type="${last}"]`);
  // Finger-drag the list until the row sits fully inside the list and the viewport.
  for (let i = 0; i < 40; i += 1) {
    // Let fling momentum settle before measuring (scrollTop stable for 3 frames).
    await page.evaluate(() => new Promise((res) => {
      const l = document.querySelector('#layer-add-menu .lvl-add-drill-list');
      let prev = -1; let same = 0;
      const tick = () => { same = l.scrollTop === prev ? same + 1 : 0; prev = l.scrollTop; if (same >= 3) res(); else requestAnimationFrame(tick); };
      tick();
    }));
    const m = await page.evaluate((t) => {
      const l = document.querySelector('#layer-add-menu .lvl-add-drill-list').getBoundingClientRect();
      const r = document.querySelector(`#layer-add-menu .lvl-add-drill-list [data-algo-type="${t}"]`).getBoundingClientRect();
      const vh = window.visualViewport.height;
      return { above: r.top < l.top, inView: r.top >= l.top && r.bottom <= Math.min(l.bottom, vh), lx: l.left + l.width / 2, lt: l.top, lb: Math.min(l.bottom, vh) };
    }, last);
    if (m.inView) break;
    if (!touch.engineSupports(page, 'nativeDefaultActions')) {
      // WebKit synthetic touches do not scroll natively; position the list only, the tap stays a finger tap.
      await page.evaluate((t) => document.querySelector(`#layer-add-menu .lvl-add-drill-list [data-algo-type="${t}"]`).scrollIntoView({ block: 'nearest' }), last);
      continue;
    }
    const span = Math.max(40, (m.lb - m.lt) - 30);
    // Scroll down when the row is below the list, up when a fling overshot it.
    const from = m.above ? m.lt + 10 : m.lt + span + 10;
    const to = m.above ? m.lt + span + 10 : m.lt + 10;
    await touch.drag(page, { x: m.lx, y: from }, { x: m.lx, y: to }, { steps: 8 });
    await page.waitForTimeout(60);
  }
  const hit = await page.evaluate((t) => {
    const el = document.querySelector(`#layer-add-menu .lvl-add-drill-list [data-algo-type="${t}"]`);
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!top && (top === el || el.contains(top)) ? true : `${top && (top.id || top.className)} at ${Math.round(r.left + r.width / 2)},${Math.round(r.top + r.height / 2)} row ${Math.round(r.top)}-${Math.round(r.bottom)} list ${JSON.stringify(document.querySelector('#layer-add-menu .lvl-add-drill-list').getBoundingClientRect())}`;
  }, last);
  expect(hit, `elementFromPoint resolves to ${last}`).toBe(true);
  await touch.tap(page, row);
  expect(await layerCount(page)).toBe(n0 + 1);
  expect(await page.evaluate(() => window.app.engine.getActiveLayer().type)).toBe(last);
});

test('D: Back returns to the parent rows', async ({ page }) => {
  const n0 = await layerCount(page);
  await drill(page);
  await touch.tap(page, page.locator('#layer-add-menu [data-add="algo-back"]'));
  for (const k of PARENT_ROWS) await expect(page.locator(`#layer-add-menu .lvl-add-item[data-add="${k}"]`)).toBeVisible();
  await expect(page.locator(DRILL)).toBeHidden();
  expect(await layerCount(page)).toBe(n0);
});

test('E: touch targets are at least 44px', async ({ page }) => {
  await openAdd(page);
  const parent = await touch.hitArea(page, page.locator('#layer-add-menu .lvl-add-item[data-add="algo-parent"]'));
  expect(parent.h, 'algo-parent hit height').toBeGreaterThanOrEqual(HIT_MIN);
  await touch.tap(page, page.locator('#layer-add-menu .lvl-add-item[data-add="algo-parent"]'));
  const back = await touch.hitArea(page, page.locator('#layer-add-menu [data-add="algo-back"]'));
  expect(back.h, 'Back hit height').toBeGreaterThanOrEqual(HIT_MIN);
  const heights = await page.evaluate(() => [...document.querySelectorAll('#layer-add-menu .lvl-add-drill-list .lvl-algo-sub-item')].map((r) => r.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(10);
  expect(Math.min(...heights), 'smallest drill row').toBeGreaterThanOrEqual(HIT_MIN);
});

test('F: no hover-driven DOM change on touch', async ({ page }) => {
  await page.evaluate(() => {
    window.__subMut = 0;
    const el = document.getElementById('lvl-algo-submenu');
    new MutationObserver((m) => { window.__subMut += m.length; }).observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
  });
  await drill(page);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__subMut), 'mutations on #lvl-algo-submenu').toBe(0);
  await expect(page.locator('#lvl-algo-submenu')).toHaveCSS('display', 'none');
});
