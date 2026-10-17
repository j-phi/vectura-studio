const { test, expect } = require('@playwright/test');
const { tap, drag } = require('../helpers/touch');

// Q27 follow-up (static-guard round 2): a finger must reach the panel resizers. The side resizers are 6 px
// wide, below the 24 px floor, so Chromium retargeted a trusted touch on them to #main-canvas and the pane
// never resized. The coarse-pointer hit strip fixes that without covering the pane toggles, the tool rail or
// the canvas above the expanded bottom pane. Trusted touch in Chromium (CDP); WebKit dispatches at the
// elementFromPoint target, which is the same hit test.
const WIDE = ['touch-ipad-landscape', 'touch-coarse-wide', 'webkit-ipad-landscape'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const gotoApp = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
  await sleep(700);
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
      await sleep(500);
      expect(await downs(page), 'the finger landed on the resizer, not the canvas').toEqual([`${side}-resizer`]);
      const after = await paneW(page, `${side}-pane`);
      if (grow || before - 200 > 5) { // at the 200 px minimum and the cap there is no room to move
        expect(Math.abs(after - before), `${side} pane width changed (${before} -> ${after})`).toBeGreaterThan(5);
      }
    });
  }
});
