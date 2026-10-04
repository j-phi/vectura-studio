const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-030: pen draft controls (Done / Remove Last Anchor / Cancel) reachable by finger on every
// touch viewport. Fingers only; tool selection is setup (app API), anchors and chips are taps.
const EVID = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-030';
const CHIP = { done: '[data-action="pen-done"]', remove: '[data-action="pen-remove-last"]', cancel: '[data-action="pen-cancel"]' };

const boot = async (page, testInfo) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.Vectura.UI.ContextBar));
  await page.evaluate(() => { window.app.ui.setActiveTool('pen'); window.app.ui.setPenMode('draw'); });
  // Wait until the bar is not mid-transition.
  await expect.poll(async () => {
    const a = await page.evaluate(() => { const b = document.querySelector('.ctxbar'); return b ? getComputedStyle(b).opacity : '0'; });
    await page.waitForTimeout(120);
    const b = await page.evaluate(() => { const e = document.querySelector('.ctxbar'); return e ? getComputedStyle(e).opacity : '0'; });
    return a === b && (a === '0' || a === '1');
  }).toBe(true);
  const canvasH = await page.evaluate(() => document.querySelector('#main-canvas').getBoundingClientRect().height);
  // LAY-002 / TUX-007: the iPhone landscape canvas collapses until the shell lane lands.
  test.fail(canvasH < 120 && testInfo.project.name.includes('iphone-landscape'), `LAY-002/TUX-007 dependency: canvas collapsed (${canvasH}px)`);
};

const layerCount = (page) => page.evaluate(() => window.app.engine.layers.length);
const anchors = (page) => page.evaluate(() => (window.app.renderer.penDraft ? window.app.renderer.penDraft.anchors.length : 0));

// Three uncovered canvas points in the UPPER half, >= 60 px apart. Scanned with elementFromPoint
// so a pane / bar covering the canvas is skipped (and asserted again right before each tap).
const pickPoints = (page) => page.evaluate(() => {
  const b = document.querySelector('#main-canvas').getBoundingClientRect();
  const out = [];
  for (let fy = 0.08; fy <= 0.5 && out.length < 3; fy += 0.06) {
    for (let fx = 0.12; fx <= 0.9 && out.length < 3; fx += 0.06) {
      const x = b.x + b.width * fx; const y = b.y + b.height * fy;
      const e = document.elementFromPoint(x, y);
      if (!e || e.id !== 'main-canvas') continue;
      if (out.every((p) => Math.hypot(p.x - x, p.y - y) >= 60)) out.push({ x, y });
    }
  }
  return out;
});

const tapAnchors = async (page, n) => {
  const pts = await pickPoints(page);
  expect(pts.length, 'uncovered canvas points available').toBe(3);
  for (let i = 0; i < n; i += 1) {
    const p = pts[i];
    const hit = await page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e && (e.id || e.className); }, p);
    expect(hit, `anchor ${i} point (${Math.round(p.x)},${Math.round(p.y)}) is covered by ${hit}`).toBe('main-canvas');
    await touch.tap(page, p);
    await expect.poll(() => anchors(page)).toBe(i + 1);
  }
};

const chipVisible = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s);
  if (!e) return false;
  const r = e.getBoundingClientRect();
  const bar = e.closest('.ctxbar');
  const cs = bar ? getComputedStyle(bar) : null;
  return r.width > 0 && r.height > 0 && !!cs && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.9;
}, sel);

const shot = (page, testInfo, name) => page.screenshot({ path: `${EVID}/${name || testInfo.project.name}.png` }).catch(() => {});

test.describe('TUX-030 pen draft controls', () => {
  test.beforeEach(async ({ page }, testInfo) => { await boot(page, testInfo); });

  test('done commits the draft by finger', async ({ page }, testInfo) => {
    const before = await layerCount(page);
    await tapAnchors(page, 3);
    if (testInfo.project.name.includes('iphone-portrait')) {
      expect(await page.evaluate(() => getComputedStyle(document.querySelector('.ctxbar')).display), 'iPhP ctxbar display').not.toBe('none');
    }
    await expect(page.locator(CHIP.done)).toBeVisible();
    expect(await chipVisible(page, CHIP.done)).toBe(true);
    const hit = await touch.hitArea(page, page.locator(CHIP.done));
    expect(hit.w, `done hit ${hit.w}x${hit.h}`).toBeGreaterThanOrEqual(44);
    expect(hit.h).toBeGreaterThanOrEqual(44);
    await shot(page, testInfo);
    await touch.tap(page, page.locator(CHIP.done));
    await expect.poll(() => layerCount(page)).toBe(before + 1);
    expect(await page.evaluate(() => window.app.renderer.penDraft)).toBeNull();
    await expect.poll(() => chipVisible(page, CHIP.done)).toBe(false);
  });

  test('remove last anchor steps back; done is disabled under two anchors', async ({ page }) => {
    const before = await layerCount(page);
    await tapAnchors(page, 3);
    await expect(page.locator(CHIP.remove)).toBeVisible();
    await touch.tap(page, page.locator(CHIP.remove));
    await expect.poll(() => anchors(page)).toBe(2);
    await touch.tap(page, page.locator(CHIP.remove));
    await expect.poll(() => anchors(page)).toBe(1);
    await expect(page.locator(CHIP.done)).toHaveAttribute('aria-disabled', 'true');
    const hitR = await touch.hitArea(page, page.locator(CHIP.remove));
    const hitC = await touch.hitArea(page, page.locator(CHIP.cancel));
    expect(hitR.w, `remove hit ${hitR.w}x${hitR.h}`).toBeGreaterThanOrEqual(44);
    expect(hitR.h).toBeGreaterThanOrEqual(44);
    expect(hitC.w, `cancel hit ${hitC.w}x${hitC.h}`).toBeGreaterThanOrEqual(44);
    expect(hitC.h).toBeGreaterThanOrEqual(44);
    await touch.tap(page, page.locator(CHIP.done));
    expect(await anchors(page)).toBe(1);
    expect(await layerCount(page)).toBe(before);
    await touch.tap(page, page.locator(CHIP.remove));
    await expect.poll(() => page.evaluate(() => window.app.renderer.penDraft)).toBeNull();
    await expect.poll(() => chipVisible(page, CHIP.remove)).toBe(false);
  });

  test('cancel discards the draft', async ({ page }) => {
    const before = await layerCount(page);
    await tapAnchors(page, 3);
    await expect(page.locator(CHIP.cancel)).toBeVisible();
    await touch.tap(page, page.locator(CHIP.cancel));
    await expect.poll(() => page.evaluate(() => window.app.renderer.penDraft)).toBeNull();
    expect(await layerCount(page)).toBe(before);
  });

  test('switching tool commits a draft of two or more anchors', async ({ page }) => {
    const before = await layerCount(page);
    await tapAnchors(page, 2);
    await page.evaluate(() => window.app.ui.setActiveTool('select'));
    expect(await layerCount(page), 'layers after setActiveTool(select)').toBe(before + 1);
  });

  test('temporary tool switch does not commit (guard)', async ({ page }) => {
    const before = await layerCount(page);
    await tapAnchors(page, 3);
    await page.evaluate(() => window.app.ui.setActiveTool('hand', { temporary: true }));
    expect(await layerCount(page)).toBe(before);
  });
});

