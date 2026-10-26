const { test, expect } = require('@playwright/test');
const { tap, drag } = require('../helpers/touch');
const { waitLayoutSettled, waitGeometryStable } = require('../helpers/target-audit-core');

// Q27 follow-up (static-guard round 2): a finger must reach the panel resizers. The side resizers are 6 px
// wide, below the 24 px floor, so Chromium retargeted a trusted touch on them to #main-canvas and the pane
// never resized. The coarse-pointer hit strip fixes that without covering the pane toggles, the tool rail or
// the canvas above the expanded bottom pane. Trusted touch in Chromium (CDP); WebKit dispatches at the
// elementFromPoint target, which is the same hit test.
const WIDE = ['touch-ipad-landscape', 'touch-coarse-wide', 'webkit-ipad-landscape'];

// Nightly flake (webkit-ipad-landscape, 2026-10): the bottom pane's 0.2 s height transition starts when the toggle's
// click lands, which on a slow hosted WebKit is well after the tap returns; a fixed sleep then measured a pane top that
// was still moving up, so taps "11 px above the pane" landed on the bar. Never measure after a fixed sleep: wait for the
// state, then for no running transition and an unchanged box across two frames (settle).
const settle = async (page, selector) => {
  await waitLayoutSettled(page);
  await page.waitForFunction((sel) => new Promise((res) => {
    const e = document.querySelector(sel);
    if (!e) return res(false);
    const a = JSON.stringify(e.getBoundingClientRect());
    requestAnimationFrame(() => requestAnimationFrame(() => res(
      JSON.stringify(e.getBoundingClientRect()) === a && !document.getAnimations().some((x) => x.playState === 'running'),
    )));
  }), selector, { timeout: 10000, polling: 50 });
};
const isCollapsed = (page) => page.evaluate(() => document.getElementById('bottom-pane').classList.contains('bottom-pane-collapsed'));
const expandBottom = async (page) => {
  await tap(page, page.locator('#btn-pane-toggle-bottom'));
  await expect.poll(() => isCollapsed(page), { message: 'pane expanded' }).toBe(false);
  await settle(page, '#bottom-pane');
};

const gotoApp = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
  await page.evaluate(() => document.fonts.ready);
  await waitLayoutSettled(page);
  await waitGeometryStable(page);
};

const spy = (page) => page.evaluate(() => {
  window.__downs = [];
  document.addEventListener('pointerdown', (e) => window.__downs.push(e.target && (e.target.id || e.target.className || e.target.tagName)), true);
});
const downs = (page) => page.evaluate(() => window.__downs.slice());
const paneW = (page, id) => page.evaluate((i) => document.getElementById(i).getBoundingClientRect().width, id);
const paneH = (page, id) => page.evaluate((i) => document.getElementById(i).getBoundingClientRect().height, id);

test.describe('panel resizers by finger', () => {
  for (const side of ['left', 'right']) {
    test(`a finger drag on the ${side} resizer centre resizes the ${side} pane`, async ({ page }, testInfo) => {
      test.skip(!WIDE.includes(testInfo.project.name), 'docked panes with a resizer: touch-wide only');
      await gotoApp(page);
      await spy(page);
      const before = await paneW(page, `${side}-pane`);
      const cap = await page.evaluate((s) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(s === 'left' ? '--touch-wide-pane-max' : '--touch-wide-pane-max-right')), side);
      const b = await page.locator(`#${side}-resizer`).boundingBox();
      const from = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      // Shrink toward the minimum (200 px) when the pane sits at its cap; grow when there is room.
      const grow = before + 40 <= cap + 0.5;
      const dir = side === 'left' ? (grow ? 1 : -1) : (grow ? -1 : 1);
      await drag(page, from, { x: from.x + dir * 40, y: from.y });
      await settle(page, `#${side}-pane`);
      expect(await downs(page), 'the finger landed on the resizer, not the canvas').toEqual([`${side}-resizer`]);
      const after = await paneW(page, `${side}-pane`);
      if (grow || before - 200 > 5) { // at the 200 px minimum and the cap there is no room to move
        expect(Math.abs(after - before), `${side} pane width changed (${before} -> ${after})`).toBeGreaterThan(5);
      }
    });
  }

  for (const side of ['left', 'right']) {
    test(`a finger on the ${side} resizer bar near its top and bottom ends still lands on it`, async ({ page }, testInfo) => {
      test.skip(!WIDE.includes(testInfo.project.name), 'docked panes with a resizer: touch-wide only');
      await gotoApp(page);
      await spy(page);
      const b = await page.locator(`#${side}-resizer`).boundingBox();
      // The 24 px strip covers the middle of the bar; the 6 px bar alone must hold a finger at 12 % and 88 %.
      const barX = await page.evaluate((id) => { const e = document.getElementById(id); const r = e.getBoundingClientRect(); const bar = getComputedStyle(e, '::before'); return r.left + parseFloat(bar.left) + parseFloat(bar.width) / 2; }, `${side}-resizer`);
      for (const f of [0.12, 0.88]) await page.touchscreen.tap(barX, b.y + b.height * f);
      expect(await downs(page)).toEqual([`${side}-resizer`, `${side}-resizer`]);
    });
  }

  test('a canvas tap just above the expanded bottom pane reaches the canvas', async ({ page }, testInfo) => {
    test.skip(!WIDE.includes(testInfo.project.name), 'resizer visible layouts only');
    await gotoApp(page);
    await expandBottom(page);
    const paneTop = () => page.evaluate(() => document.getElementById('bottom-pane').getBoundingClientRect().top);
    const r = await page.evaluate(() => {
      const p = document.getElementById('bottom-pane').getBoundingClientRect();
      const c = document.getElementById('main-canvas').getBoundingClientRect();
      return { top: p.top, x: c.left + c.width / 2 };
    });
    await spy(page);
    // The 6 px bar spans [top-6, top). Chromium's touch targeting also claims taps up to ~4 px above the bar for
    // the resizer (it carries a mouse handler so a finger on the bar does not fall through to the canvas). 11 px
    // and more above the pane is canvas; the old 12 px strip above the bar took taps up to 18 px above the pane.
    const h0 = await paneH(page, 'bottom-pane');
    for (const [i, off] of [11, 14, 20].entries()) {
      expect(await paneTop(), 'the pane top is still where it settled').toBeCloseTo(r.top, 1);
      await page.touchscreen.tap(r.x, r.top - off);
      await expect.poll(async () => (await downs(page)).length, { message: `tap ${off} px above the pane was delivered` }).toBe(i + 1);
    }
    expect(await downs(page), 'every tap 5+ px above the bar reached the canvas').toEqual(['main-canvas', 'main-canvas', 'main-canvas']);
    // TUX-051 stray-tap rule: a tap on the bar itself changes nothing (a touch press engages only after the slop).
    await page.touchscreen.tap(r.x, r.top - 3);
    await expect.poll(async () => (await downs(page)).length, { message: 'the bar tap was delivered' }).toBe(4);
    expect((await downs(page))[3], 'the 3 px tap is on the bar').toBe('bottom-resizer');
    await settle(page, '#bottom-pane');
    expect(await paneH(page, 'bottom-pane'), 'a tap on the bar leaves the height').toBeCloseTo(h0, 0);
    expect(await page.evaluate(() => document.getElementById('bottom-pane').classList.contains('bottom-pane-collapsed')), 'and the pane stays open').toBe(false);
  });

  test('a finger drag on the bottom resizer bar still resizes the expanded pane', async ({ page }, testInfo) => {
    test.skip(!WIDE.includes(testInfo.project.name), 'resizer visible layouts only');
    await gotoApp(page);
    await expandBottom(page);
    const h0 = await paneH(page, 'bottom-pane');
    const b = await page.locator('#bottom-resizer').boundingBox();
    const from = { x: b.x + b.width * 0.2, y: b.y + b.height / 2 };
    await drag(page, from, { x: from.x, y: from.y - 40 });
    await settle(page, '#bottom-pane');
    expect(await paneH(page, 'bottom-pane') - h0).toBeGreaterThan(20);
  });
  // Static-guard round 3: an open top menu must not part-cover a resizer strip. A part-covered strip leaves a sliver
  // (9 px on coarse-wide) that a trusted finger drag hits: it resized the pane (290 -> 250) and closed the menu.
  for (const menu of ['object', 'view', 'help']) {
    test(`with the ${menu} menu open no resizer sliver under 24 px is tappable`, async ({ page }, testInfo) => {
      test.skip(!WIDE.includes(testInfo.project.name), 'docked panes with a resizer: touch-wide only');
      await gotoApp(page);
      for (const side of ['left', 'right']) {
        await page.evaluate(() => { document.querySelector('.top-menu-panel.open') && document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
        await tap(page, page.locator(`#btn-menu-${menu}`));
        await expect.poll(() => page.evaluate(() => !!document.querySelector('.top-menu-panel.open')), { message: 'the menu is open' }).toBe(true);
        await settle(page, '.top-menu-panel.open');
        const m = await page.evaluate((id) => {
          const e = document.getElementById(id); const r = e.getBoundingClientRect(); const y = Math.round(r.top + r.height / 2);
          const runs = []; let start = null;
          for (let x = Math.floor(r.left) - 2; x <= Math.ceil(r.right) + 2; x += 1) {
            const own = document.elementFromPoint(x, y) === e;
            if (own && start === null) start = x;
            if (!own && start !== null) { runs.push({ from: start, w: x - start }); start = null; }
          }
          const p = document.querySelector('.top-menu-panel.open').getBoundingClientRect();
          return { runs, panel: { l: p.left, r: p.right, t: p.top, b: p.bottom }, vw: window.innerWidth, y };
        }, `${side}-resizer`);
        for (const run of m.runs) expect(run.w, `${side} resizer run ${JSON.stringify(run)} with the ${menu} menu open`).toBeGreaterThanOrEqual(24);
        expect(m.panel.l, 'the menu stays on screen').toBeGreaterThanOrEqual(0);
        expect(m.panel.r, 'the menu stays on screen').toBeLessThanOrEqual(m.vw);
        // A trusted finger on every tappable pixel of the strip's row at the open menu's edge never lands on a short sliver.
        if (side === 'left') await spy(page); else await page.evaluate(() => { window.__downs = []; });
        for (const run of m.runs) await page.touchscreen.tap(run.from + 1, m.y);
        const hit = (await downs(page)).filter((d) => d === `${side}-resizer`).length;
        expect(hit, 'every tappable run is a full strip').toBe(m.runs.length);
      }
    });
  }
});
