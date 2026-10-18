// Overlay clearance on touch layouts: nothing live is covered (canvas HUD vs windows and sheets, header vs a
// full-screen sheet, collapsed panes, Export legend gear vs the modal footer), sheets and strips keep their gap to the
// HUD, the fill bar clears the safe-area inset, and Scene3D panel targets keep a 24 px hit area.
// Most tests drive a real target-audit state (target-audit-states.js) and assert the contract the audit cell only counts.
const { test, expect } = require('@playwright/test');
const core = require('../helpers/target-audit-core');
const touch = require('../helpers/touch');
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
// HUD buttons that look live (visible) but whose centre another layer covers: must be none.
const hudLiveButCovered = (page) => page.evaluate(() => [...document.querySelectorAll('.canvas-hud-btn')].filter((b) => {
  if (getComputedStyle(b).visibility === 'hidden') return false;
  const r = b.getBoundingClientRect();
  if (r.width < 1) return false; // display:none (phone layout hides Undo and Redo)
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !(hit && (hit === b || b.contains(hit)));
}).map((b) => b.id));

test('the canvas HUD never shows a button that a Petal Designer window or a phone sheet covers', async ({ page, baseURL }, testInfo) => {
  await open(page, baseURL, 'petal-designer-window');
  await expect.poll(() => hudLiveButCovered(page), { message: 'HUD buttons under the Petal Designer window', timeout: 3000 }).toEqual([]);
  if (/iphone/.test(testInfo.project.name)) {
    await open(page, baseURL, 'modal-document-setup');
    await expect.poll(() => hudLiveButCovered(page), { message: 'HUD buttons under the phone Document Setup sheet', timeout: 3000 }).toEqual([]);
  }
});

test('phone: the header action buttons step aside under a full-screen modal sheet', async ({ page, baseURL }, testInfo) => {
  test.skip(!/iphone-portrait/.test(testInfo.project.name), 'phone portrait only');
  await open(page, baseURL, 'color-picker');
  const vis = await page.evaluate(() => [...document.querySelectorAll('#app-header button')].map((b) => getComputedStyle(b).visibility));
  expect(vis.length).toBeGreaterThan(0);
  expect(vis.every((v) => v === 'hidden'), `header buttons ${vis}`).toBe(true);
});

test('iPhone landscape: the open bottom sheet ends left of the canvas HUD', async ({ page, baseURL }, testInfo) => {
  test.skip(!/iphone-landscape/.test(testInfo.project.name) || /chrome/.test(testInfo.project.name), 'phone-short only');
  await open(page, baseURL, 'bottom-pane-open');
  const r = await page.evaluate(() => {
    const p = document.getElementById('bottom-pane').getBoundingClientRect();
    const z = document.getElementById('btn-hud-zoom-out').getBoundingClientRect();
    return { paneRight: p.right, zoomLeft: z.left };
  });
  expect(r.paneRight, 'pane right edge vs Zoom Out left edge').toBeLessThanOrEqual(r.zoomLeft);
});

test('iPhone landscape: the open sheet and the status strip derive their right offset from the real HUD width (8 px gap)', async ({ page, baseURL }, testInfo) => {
  test.skip(!/iphone-landscape/.test(testInfo.project.name) || /chrome/.test(testInfo.project.name), 'phone-short only');
  await open(page, baseURL, 'bottom-pane-open');
  const r = await page.evaluate(() => {
    const p = document.getElementById('bottom-pane').getBoundingClientRect();
    const h = document.getElementById('canvas-hud').getBoundingClientRect();
    const bar = document.querySelector('.hud-bar').getBoundingClientRect();
    return { paneRight: p.right, hudLeft: h.left, hudW: h.width, barRight: bar.right, token: parseFloat(getComputedStyle(document.body).getPropertyValue('--canvas-hud-w')) };
  });
  expect(r.token, 'token equals the HUD box width').toBeCloseTo(r.hudW, 0);
  expect(r.hudLeft - r.paneRight, 'sheet to HUD gap').toBeGreaterThanOrEqual(7);
  expect(r.hudLeft - r.paneRight, 'sheet to HUD gap').toBeLessThanOrEqual(9);
  expect(r.hudLeft - r.barRight, 'status strip to HUD gap').toBeGreaterThanOrEqual(7);
  expect(r.hudLeft - r.barRight, 'status strip to HUD gap').toBeLessThanOrEqual(9);
});

test('touch-wide: the collapsed bottom pane row is 36 px and its chevron is a 44 px target', async ({ page, baseURL }, testInfo) => {
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
  expect(g.pane, 'collapsed pane height (36 px)').toBe(36);
  expect(g.h, 'chevron height').toBeGreaterThanOrEqual(44);
  expect(g.hitIsToggle, 'the chevron takes the tap at its bottom edge').toBe(true);
});

test('Scene3D panel: every target has a 24 px hit area (WCAG 2.5.8 floor)', async ({ page, baseURL }, testInfo) => {
  test.skip(!/(ipad-portrait|coarse-wide)/.test(testInfo.project.name), 'the add-light chips and toggles are on screen on iPad portrait and touch-wide');
  await open(page, baseURL, 'scene3d-panel');
  let seen = 0;
  for (const sel of ['.vs3-more-caret', '.vs3-tree-vis', '.vs3-tree-addbtn']) {
    const els = await page.locator(sel).elementHandles();
    for (const h of els) {
      if (!(await h.isVisible())) continue;
      // A chip that the header's height puts on the screen edge is half cut by the viewport, not by its CSS: scroll it fully in first.
      await h.evaluate((e) => e.scrollIntoView({ block: 'center' }));
      const a = await core.probeHit(page, h, { probe: 2, radius: 24 });
      if (a.w === 0 && a.h === 0) continue; // scrolled out of the panel: not on screen, so not a target in this state
      seen += 1;
      expect(a.w, `${sel} probed width`).toBeGreaterThanOrEqual(24);
      expect(a.h, `${sel} probed height`).toBeGreaterThanOrEqual(24);
    }
  }
  expect(seen).toBeGreaterThan(0);
});

test('iPhone landscape: the fill bar clears the bottom safe-area inset', async ({ page, baseURL }, testInfo) => {
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

test('touch-wide: the collapsed right pane header stays on screen and its chevron is a 44 px target', async ({ page, baseURL }, testInfo) => {
  const s = PROJECTS[testInfo.project.name];
  test.skip(!(s.device === 'iPadL' || s.device === 'coarseWide'), 'touch-wide layouts only');
  await core.bootApp(page, baseURL);
  const collapsed = () => page.evaluate(() => document.getElementById('right-pane').classList.contains('pane-collapsed'));
  if (!(await collapsed())) {
    await touch.tap(page, page.locator('#btn-pane-toggle-right'));
    await page.waitForTimeout(600);
  }
  expect(await collapsed(), 'right pane collapsed by finger').toBe(true);
  const r = await page.evaluate(() => { const b = document.querySelector('#right-pane .pane-header').getBoundingClientRect(); return { right: b.right, iw: innerWidth }; });
  expect(r.right, `header right ${r.right} vs viewport ${r.iw}`).toBeLessThanOrEqual(r.iw + 0.5);
  const hit = await touch.hitArea(page, '#btn-pane-toggle-right');
  expect(Math.min(hit.w, hit.h)).toBeGreaterThanOrEqual(44);
});

test('phone landscape: the Export legend gear is not under the modal footer', async ({ page, baseURL }, testInfo) => {
  const s = PROJECTS[testInfo.project.name];
  test.skip(s.device !== 'iPhL-c' && s.device !== 'iPhL', 'phone landscape only');
  await core.bootApp(page, baseURL);
  await page.evaluate(() => { window.app.engine.addLayer('flowfield'); document.getElementById('btn-export').click(); });
  await page.waitForSelector('#modal-overlay.open #export-legend-gear', { state: 'attached', timeout: 5000 });
  await page.waitForTimeout(600);
  const m = await page.evaluate(() => {
    document.getElementById('export-preview-legend').classList.remove('hidden');
    const g = document.getElementById('export-legend-gear').getBoundingClientRect();
    const f = document.querySelector('#modal-overlay .vt-sheet__footer').getBoundingClientRect();
    const hit = document.elementFromPoint(g.x + g.width / 2, g.y + g.height / 2);
    return { gearBottom: g.bottom, footerTop: f.top, hitIsGear: !!hit && hit.id === 'export-legend-gear' };
  });
  expect(m.gearBottom, `gear bottom ${m.gearBottom} vs footer top ${m.footerTop}`).toBeLessThanOrEqual(m.footerTop);
  expect(m.hitIsGear, 'the gear receives its own tap').toBe(true);
});
