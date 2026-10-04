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

  test('tapping the Select rail button by finger commits a draft of two or more anchors', async ({ page }) => {
    // Finger path, not setActiveTool(): a rail or drawer route that bypasses setActiveTool would
    // discard the draft here. Known bypasses (renderer.setTool('type'|'direct'), menubar direct
    // fallback) are logged as PRH-300 and are not exercised.
    const before = await layerCount(page);
    const sel = page.locator('#tool-bar .tool-btn[data-tool="select"]').first();
    // On narrow layouts the open left pane overlays the tool rail (shell-lane finding, TUX-007).
    // Collapse it by finger first so the rail button is reachable.
    const covered = () => page.evaluate(() => {
      const e = document.querySelector('#tool-bar .tool-btn[data-tool="select"]');
      if (!e) return true;
      const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !(t && (t === e || e.contains(t)));
    });
    if (await covered()) {
      await touch.tap(page, page.locator('#btn-pane-toggle-left'));
      await expect.poll(covered).toBe(false);
    }
    await tapAnchors(page, 2);
    await expect(sel).toBeVisible();
    await touch.tap(page, sel);
    await expect.poll(() => page.evaluate(() => window.app.renderer.activeTool)).toBe('select');
    expect(await layerCount(page), 'layers after finger tap on Select').toBe(before + 1);
    expect(await page.evaluate(() => window.app.renderer.penDraft)).toBeNull();
  });

  test('draft bar clears the overlay panes and every control passes a hit test at 44px', async ({ page }, testInfo) => {
    await tapAnchors(page, 3);
    await expect(page.locator(CHIP.done)).toBeVisible();
    const rows = await page.evaluate(() => {
      const bar = document.querySelector('.ctxbar');
      const out = [];
      const sels = ['[data-action="pen-done"]', '[data-action="pen-remove-last"]', '[data-action="pen-cancel"]', '.ctxbar-overflow', '.ctxbar-handle'];
      sels.forEach((s) => {
        const e = bar.querySelector(s);
        if (!e) { out.push({ s, absent: true }); return; }
        const r = e.getBoundingClientRect();
        const shown = r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none';
        const cx = r.x + r.width / 2; const cy = r.y + r.height / 2;
        const top = shown ? document.elementFromPoint(cx, cy) : null;
        out.push({ s, shown, w: Math.round(r.width), h: Math.round(r.height), hit: shown ? !!(top && (top === e || e.contains(top))) : null, over: top && (top.className || top.id) });
      });
      return out;
    });
    for (const r of rows) {
      if (r.absent || !r.shown) continue; // hidden while kind === pen-draft is allowed
      expect(r.hit, `${r.s} covered by ${r.over}`).toBe(true);
      expect(r.w, `${r.s} ${r.w}x${r.h}`).toBeGreaterThanOrEqual(44);
      expect(r.h, `${r.s} ${r.w}x${r.h}`).toBeGreaterThanOrEqual(44);
    }
    for (const a of ['pen-done', 'pen-remove-last', 'pen-cancel']) expect(rows.find((r) => r.s === `[data-action="${a}"]`).hit, a).toBe(true);
    const geo = await page.evaluate(() => {
      const b = document.querySelector('.ctxbar').getBoundingClientRect();
      const ov = (sel, side) => { const n = document.querySelector(sel); if (!n) return 0; const r = n.getBoundingClientRect(); if (!r.width) return 0; return side === 'l' ? r.right : innerWidth - r.left; };
      return { bl: b.left, br: b.right, l: ov('.pane-left', 'l'), r: ov('.pane-right', 'r'), vw: innerWidth };
    });
    expect(geo.bl, 'bar left edge vs left pane').toBeGreaterThanOrEqual(geo.l - 1);
    expect(geo.br, 'bar right edge vs right pane').toBeLessThanOrEqual(geo.vw - geo.r + 1);
    await shot(page, testInfo, `${testInfo.project.name}-hit`);
  });

  test('the draft bar leaves the canvas band free: a tap beside it still places the next anchor', async ({ page }) => {
    await tapAnchors(page, 1);
    await expect(page.locator(CHIP.done)).toBeVisible();
    // Every canvas point above the bar's top edge and clear of the panes must stay a canvas hit.
    const p = await page.evaluate(() => {
      const cv = document.querySelector('#main-canvas').getBoundingClientRect();
      const bar = document.querySelector('.ctxbar').getBoundingClientRect();
      const first = window.app.renderer.penDraft.anchors.length;
      const pts = [];
      for (let fy = 0.1; fy < 0.9; fy += 0.04) {
        for (let fx = 0.1; fx < 0.95; fx += 0.04) {
          const x = cv.x + cv.width * fx; const y = cv.y + cv.height * fy;
          const e = document.elementFromPoint(x, y);
          if (e && e.id === 'main-canvas') pts.push({ x, y, inBand: y >= bar.top - 2 && y <= bar.bottom + 2 && x >= bar.left - 2 && x <= bar.right + 2 });
        }
      }
      return { pts, first, barTop: bar.top, canvasBottom: cv.bottom, canvasTop: cv.top };
    });
    // Canvas points exist in the bar's row on both sides and the band above the bar is free.
    const free = p.pts.filter((q) => !q.inBand && q.y < p.barTop - 2);
    expect(free.length, `free canvas points above the bar (bar top ${Math.round(p.barTop)})`).toBeGreaterThan(5);
    // Central band: at least half of the canvas height sits above the bar.
    expect(p.barTop - p.canvasTop, 'canvas height above the bar').toBeGreaterThanOrEqual((p.canvasBottom - p.canvasTop) * ((p.canvasBottom - p.canvasTop) < 300 ? 0.72 : 0.6));
    const q = free[Math.floor(free.length / 2)];
    await touch.tap(page, q);
    await expect.poll(() => anchors(page)).toBe(2);
  });

  test('temporary tool switch does not commit (guard)', async ({ page }) => {
    const before = await layerCount(page);
    await tapAnchors(page, 3);
    await page.evaluate(() => window.app.ui.setActiveTool('hand', { temporary: true }));
    expect(await layerCount(page)).toBe(before);
  });
});

