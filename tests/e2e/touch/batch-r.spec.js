// Touch remediation batch R: product regressions the full target audit found (covered, canvas share, Scene3D wcag, fill-bar safe area).
// Each test drives a real audit state (target-audit-states.js) and asserts the contract the audit cell only counts.
const { test, expect } = require('@playwright/test');
const core = require('../helpers/target-audit-core');
const { STATES } = require('./target-audit-states');
const { PROJECTS } = require('./viewports');

test.use({ reducedMotion: 'reduce' });
test.describe.configure({ retries: 0 });

const open = async (page, baseURL, id) => {
  await core.bootApp(page, baseURL);
  const st = STATES.find((s) => s.id === id);
  await st.run(page);
  await expect.poll(() => st.post(page), { timeout: 10_000 }).toBe(true);
  await core.waitLayoutSettled(page);
  await page.waitForTimeout(150);
};
const device = (testInfo) => PROJECTS[testInfo.project.name].device;
const hudShown = (page) => page.evaluate(() => {
  const h = document.querySelector('.canvas-hud');
  return !!h && getComputedStyle(h).visibility !== 'hidden' && [...h.querySelectorAll('.canvas-hud-btn')].some((b) => b.offsetParent && getComputedStyle(b).pointerEvents !== 'none');
});

test('R1 the canvas HUD steps aside under the Petal Designer window and the phone Document Setup sheet', async ({ page, baseURL }, testInfo) => {
  await open(page, baseURL, 'petal-designer-window');
  expect(await hudShown(page), 'HUD under the Petal Designer window').toBe(false);
  if (/iphone/.test(testInfo.project.name)) {
    await open(page, baseURL, 'modal-document-setup');
    expect(await hudShown(page), 'HUD under the phone Document Setup sheet').toBe(false);
  }
});

test('R1 phone: the header action buttons step aside under a full-screen modal sheet', async ({ page, baseURL }, testInfo) => {
  test.skip(!/iphone-portrait/.test(testInfo.project.name), 'phone portrait only');
  await open(page, baseURL, 'color-picker');
  const vis = await page.evaluate(() => [...document.querySelectorAll('#app-header button')].map((b) => getComputedStyle(b).visibility));
  expect(vis.length).toBeGreaterThan(0);
  expect(vis.every((v) => v === 'hidden'), `header buttons ${vis}`).toBe(true);
});

test('R1 iPhone landscape: the open bottom sheet ends left of the canvas HUD', async ({ page, baseURL }, testInfo) => {
  test.skip(!/iphone-landscape/.test(testInfo.project.name) || /chrome/.test(testInfo.project.name), 'phone-short only');
  await open(page, baseURL, 'bottom-pane-open');
  const r = await page.evaluate(() => {
    const p = document.getElementById('bottom-pane').getBoundingClientRect();
    const z = document.getElementById('btn-hud-zoom-out').getBoundingClientRect();
    return { paneRight: p.right, zoomLeft: z.left };
  });
  expect(r.paneRight, 'pane right edge vs Zoom Out left edge').toBeLessThanOrEqual(r.zoomLeft);
});

test('R2 touch-wide: the collapsed bottom pane row is 36 px and its chevron stays a 44 px target', async ({ page, baseURL }, testInfo) => {
  test.skip(!/(coarse-wide|ipad-landscape)/.test(testInfo.project.name), 'touch-wide only');
  await core.bootApp(page, baseURL);
  await page.evaluate(() => document.getElementById('bottom-pane').classList.add('bottom-pane-collapsed'));
  await core.waitLayoutSettled(page);
  const g = await page.evaluate(() => {
    const t = document.getElementById('btn-pane-toggle-bottom');
    const r = t.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.bottom - 3);
    return { pane: document.getElementById('bottom-pane').getBoundingClientRect().height, h: r.height, hitIsToggle: !!hit && (hit === t || t.contains(hit)) };
  });
  expect(g.pane, 'collapsed pane height').toBe(36);
  expect(g.h, 'chevron height').toBeGreaterThanOrEqual(44);
  expect(g.hitIsToggle, 'the overhang over the status strip takes the tap').toBe(true);
});

test('R3 Scene3D panel: every target is at least 24 px and the add-light chips are 44 px', async ({ page, baseURL }, testInfo) => {
  await open(page, baseURL, 'scene3d-panel');
  const g = await page.evaluate(() => {
    const dims = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
    return { caret: dims('.vs3-more-caret'), vis: dims('.vs3-tree-vis'), chips: dims('.vs3-tree-addbtn') };
  });
  g.caret.forEach(([w]) => expect(w, 'caret width').toBeGreaterThanOrEqual(24));
  g.vis.forEach(([w, h]) => { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44); });
  g.chips.forEach(([, h]) => expect(h, 'add-light chip height').toBeGreaterThanOrEqual(44));
});

test('R4 iPhone landscape: the fill bar clears the bottom safe-area inset', async ({ page, baseURL }, testInfo) => {
  test.skip(!/iphone-landscape/.test(testInfo.project.name) || /chrome/.test(testInfo.project.name), 'iPhone landscape only');
  await open(page, baseURL, 'fill-controls');
  const m = await page.evaluate(() => {
    const bar = document.querySelector('.ctxbar--fill');
    const before = bar.getBoundingClientRect().bottom;
    document.documentElement.style.setProperty('--safe-bottom', '21px');
    const after = bar.getBoundingClientRect().bottom;
    return { before, after };
  });
  expect(m.before - m.after, 'bar lifts by the inset').toBeCloseTo(21, 0);
});
