const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { PROJECTS } = require('./viewports');
const { tap, drag, hitArea, canvasShare } = require('../helpers/touch');

// TUX-051: a stray finger tap near the canvas bottom edge must not expand the bottom pane, and the
// collapsed pane's chevron must be a 44 px target. Note: touch-coarse-wide has no WebKit twin.
const EVIDENCE = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-051';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const gotoApp = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
  await sleep(600);
};

const collapse = (page) => page.evaluate(() => {
  const p = document.getElementById('bottom-pane');
  p.classList.add('bottom-pane-collapsed');
  window.Vectura.SETTINGS.bottomPaneCollapsed = true;
});

const state = (page) => page.evaluate(() => {
  const p = document.getElementById('bottom-pane');
  const r = p.getBoundingClientRect();
  const cv = document.getElementById('main-canvas').getBoundingClientRect();
  const rz = document.getElementById('bottom-resizer');
  return {
    collapsed: p.classList.contains('bottom-pane-collapsed'),
    setting: window.Vectura.SETTINGS.bottomPaneCollapsed,
    pane: { left: r.left, width: r.width, top: r.top, height: r.height },
    cb: cv.bottom,
    resizerVisible: !!rz && getComputedStyle(rz).display !== 'none',
  };
});

const WIDE = ['touch-ipad-landscape', 'touch-coarse-wide', 'webkit-ipad-landscape'];

test.describe('TUX-051 A: stray taps', () => {
  const OFFSETS = [-2, 3, 8, 16];
  for (const d of OFFSETS) {
    test(`A stray tap at canvas bottom ${d >= 0 ? '+' : ''}${d} px keeps the pane collapsed`, async ({ page }, testInfo) => {
      test.skip(!WIDE.includes(testInfo.project.name), 'resizer visible layouts only');
      await gotoApp(page);
      await collapse(page);
      const s = await state(page);
      await page.touchscreen.tap(s.pane.left + s.pane.width * 0.2, s.cb + d);
      await sleep(300);
      const after = await state(page);
      expect(after.collapsed, `collapsed after tap at cb+${d}`).toBe(true);
      expect(after.setting, 'bottomPaneCollapsed not persisted as false').not.toBe(false);
    });
  }

  test('A positive control: chevron expands then collapses', async ({ page }, testInfo) => {
    test.skip(!WIDE.includes(testInfo.project.name), 'wide only');
    await gotoApp(page);
    await collapse(page);
    await tap(page, page.locator('#btn-pane-toggle-bottom'));
    await sleep(300);
    expect((await state(page)).collapsed).toBe(false);
    await tap(page, page.locator('#btn-pane-toggle-bottom'));
    await sleep(300);
    expect((await state(page)).collapsed).toBe(true);
  });

  test('A drag control: vertical drag on the divider resizes', async ({ page }, testInfo) => {
    test.skip(!WIDE.includes(testInfo.project.name), 'wide only');
    await gotoApp(page);
    await collapse(page);
    // Q17: the divider has no use while the pane is collapsed, so it is hidden then. The chevron expands the pane first.
    expect(await page.locator('#bottom-resizer').isVisible(), 'divider hidden while collapsed').toBe(false);
    await tap(page, page.locator('#btn-pane-toggle-bottom'));
    await sleep(300);
    const before = await state(page);
    expect(before.collapsed).toBe(false);
    const box = await page.locator('#bottom-resizer').boundingBox();
    const from = { x: box.x + box.width * 0.2, y: box.y + box.height / 2 };
    await drag(page, from, { x: from.x, y: from.y - 40 });
    await sleep(300);
    const after = await state(page);
    expect(after.collapsed).toBe(false);
    expect(after.pane.height).toBeGreaterThan(before.pane.height);
  });
});

test.describe('TUX-051 B: toggle geometry', () => {
  test('B collapsed toggle is a 44 px target clear of the canvas edge', async ({ page }, testInfo) => {
    const dev = PROJECTS[testInfo.project.name].device;
    await gotoApp(page);
    await collapse(page);
    await sleep(300);
    const s = await state(page);
    const hit = await hitArea(page, '#btn-pane-toggle-bottom');
    const rect = await page.evaluate(() => {
      const b = document.getElementById('btn-pane-toggle-bottom').getBoundingClientRect();
      const c = document.getElementById('main-canvas').getBoundingClientRect();
      return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, c: { top: c.top, bottom: c.bottom, left: c.left, right: c.right } };
    });
    const share = await canvasShare(page);
    testInfo.annotations.push({ type: 'TUX-051', description: `${dev} hit ${hit.w}x${hit.h}, paneH ${s.pane.height}, share ${share}%` });
    expect(hit.w, `${dev} hit w`).toBeGreaterThanOrEqual(44);
    expect(hit.h, `${dev} hit h`).toBeGreaterThanOrEqual(44);
    if (s.resizerVisible) {
      // Fix round: the iPadL 75 % both-collapsed floor (section 1.2) leaves no room for 8 px of slack
      // under a 6 px resizer plus a 44 px toggle. The toggle sits wholly below the 6 px resizer strip.
      expect(rect.top, 'toggle top >= canvas bottom + 6 (below the resizer strip)').toBeGreaterThanOrEqual(rect.c.bottom + 6);
    } else if (await page.evaluate(() => document.body.classList.contains('phone-short'))) {
      // phone-short: the collapsed pane is a 48 px floating button over the canvas corner (TUX-007 design).
      expect(rect.bottom, 'FAB inside the viewport').toBeLessThanOrEqual(page.viewportSize().height);
    } else {
      const inter = rect.left < rect.c.right && rect.right > rect.c.left && rect.top < rect.c.bottom && rect.bottom > rect.c.top;
      expect(inter, 'toggle does not intersect the canvas').toBe(false);
    }
    await fs.promises.mkdir(EVIDENCE, { recursive: true });
    await page.screenshot({ path: `${EVIDENCE}/${dev}-${/webkit/.test(testInfo.project.name) ? 'webkit' : 'chromium'}.png` });
  });
});
