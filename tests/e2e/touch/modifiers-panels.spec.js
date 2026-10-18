const { evidenceDir, shoot } = require('../helpers/evidence');
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');
const { openPane, addLayer } = require('./target-audit-states');
const { waitLayoutSettled } = require('../helpers/target-audit-core');

// TUX-033: the Multi-select task works in the layer list with real finger taps in both engines.
// WebKit reports pointerType "mouse" on the click that follows a tap, so a pointerType-only gate fails there.
// iPhone projects open the layers pane by finger through #btn-header-pane-right.
const EVIDENCE = evidenceDir('TUX-033');

test.describe('TUX-033 layer list honours touch modifiers @needs-tall-pane', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.Vectura.InputModifiers));
    for (let i = 0; i < 4; i += 1) await addLayer(page, 'wavetable');
    await page.evaluate(() => { window.app.renderer.setSelection([], null); window.app.ui.lastLayerClickId = null; window.app.ui.renderLayers(); });
    const hdr = page.locator('#btn-header-pane-right');
    if (await hdr.isVisible().catch(() => false)) await touch.tap(page, hdr);
    else await openPane(page, 'right');
    await page.waitForFunction(() => document.getElementById('right-pane').getBoundingClientRect().width > 100);
    await waitLayoutSettled(page);
  });

  const rows = (page) => page.locator('#layer-list [data-lvl-id] .lvl-name');
  const selCount = (page) => page.evaluate(() => window.app.renderer.selectedLayerIds.size);
  const latch = async (page) => {
    const b = page.locator('#touch-modifier-bar [data-touch-mod="multiSelect"]');
    if (await b.isVisible().catch(() => false)) await touch.tap(page, b);
    else await page.evaluate(() => window.Vectura.InputModifiers.tap('multiSelect'));
    expect(await page.evaluate(() => window.Vectura.InputModifiers.getTaskState('multiSelect'))).not.toBe('off');
  };

  test('Multi-select then two finger taps select both rows; the latch releases', async ({ page }, testInfo) => {
    await latch(page);
    await touch.tap(page, rows(page).nth(0));
    expect(await selCount(page)).toBe(1);
    // One-shot: the first row tap used the latch, so re-arm for the second row.
    await latch(page);
    await touch.tap(page, rows(page).nth(2));
    expect(await selCount(page)).toBe(2);
    await touch.tap(page, rows(page).nth(3));
    expect(await selCount(page)).toBe(1);
    fs.mkdirSync(EVIDENCE, { recursive: true });
    await latch(page);
    await touch.tap(page, rows(page).nth(1));
    await shoot(page, { path: `${EVIDENCE}/${testInfo.project.name}.png` });
  });

  test('a locked Multi-select toggles rows in and out', async ({ page }) => {
    await page.evaluate(() => { const IM = window.Vectura.InputModifiers; IM.tap('multiSelect', 0); IM.tap('multiSelect', 100); });
    await touch.tap(page, rows(page).nth(0));
    await touch.tap(page, rows(page).nth(2));
    expect(await selCount(page)).toBe(2);
    await touch.tap(page, rows(page).nth(2));
    expect(await selCount(page)).toBe(1);
  });

  test('mouse parity: a latch never changes a mouse click', async ({ page }) => {
    await latch(page);
    await rows(page).nth(0).click();
    await rows(page).nth(2).click();
    expect(await selCount(page)).toBe(1);
  });
});

// Constrain latch + Fill tool: a finger drag across three ring bands pours into each (drag-pour parity).
test.describe('TUX-033 Constrain drag-pour with a finger @needs-tall-pane', () => {
  test('Constrain then a finger drag across 3 ring bands gives 3 fills', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.engine && window.Vectura.InputModifiers));
    await page.evaluate(() => {
      const e = window.app.engine;
      e.layers.slice().forEach((l) => { try { e.removeLayer(l.id); } catch (_) { /* noop */ } });
      const id = e.addLayer('rings');
      e.generate?.(id);
      window.app.computeDisplayGeometry?.();
      window.app.renderer.setTool('fill');
      window.app.renderer.draw();
    });
    await waitLayoutSettled(page);
    // Three adjacent bands on one horizontal line, with the canvas the top element at both ends.
    const pts = await page.evaluate(() => {
      const r = window.app.renderer;
      const PBO = window.Vectura.PaintBucketOps;
      const cv = document.querySelector('#main-canvas');
      const box = cv.getBoundingClientRect();
      const prof = window.app.engine.currentProfile;
      const y = box.top + r.offsetY + (prof.height / 2) * r.scale;
      const loopAt = (x) => {
        const w = r.screenToWorld(x - box.left, y - box.top);
        if (!r._isWorldInsidePaper(w)) return null;
        const st = PBO.findFillTargetStack(window.app.engine, w.x, w.y, { scope: 'all-objects', sensitivity: 5 }).stack;
        return st.length && !st[0].isDocBounds ? st[0].loopId : null;
      };
      // An obstruction (the tool rail, a resizer strip at a canvas edge) ends an unobstructed stretch; a triple of bands
      // must lie inside one stretch. Bands found before the obstruction still count.
      const tripleIn = (runs) => {
        for (let i = 0; i + 2 < runs.length; i += 1) {
          const [a, b, c] = [runs[i], runs[i + 1], runs[i + 2]];
          if ([a, b, c].every((s) => s.x1 - s.x0 >= 4) && new Set([a.loopId, b.loopId, c.loopId]).size === 3) {
            return { y, a: (a.x0 + a.x1) / 2, c: (c.x0 + c.x1) / 2 };
          }
        }
        return null;
      };
      let runs = [];
      for (let x = Math.max(box.left + 4, 4); x < Math.min(innerWidth, box.right) - 4; x += 2) {
        if (document.elementFromPoint(x, y) !== cv) { const t = tripleIn(runs); if (t) return t; runs = []; continue; }
        const l = loopAt(x);
        if (l == null) { continue; }
        const last = runs[runs.length - 1];
        if (last && last.loopId === l) last.x1 = x; else runs.push({ loopId: l, x0: x, x1: x });
      }
      return tripleIn(runs);
    });
    expect(pts, 'three adjacent ring bands').not.toBeNull();
    const fills = () => page.evaluate(() => window.app.engine.layers.reduce((n, l) => n + ((l.fills && l.fills.length) || 0), 0));
    const before = await fills();
    const bar = page.locator('[data-touch-mod="constrain"]');
    if (await bar.first().isVisible().catch(() => false)) await touch.tap(page, bar.first());
    else await page.evaluate(() => window.Vectura.InputModifiers.tap('constrain'));
    expect(await page.evaluate(() => window.Vectura.InputModifiers.getTaskState('constrain'))).not.toBe('off');
    await touch.drag(page, { x: pts.a, y: pts.y }, { x: pts.c, y: pts.y }, { steps: Math.max(30, Math.ceil((pts.c - pts.a) / 2)) });
    expect(await fills()).toBe(before + 3);
    fs.mkdirSync(EVIDENCE, { recursive: true });
    await shoot(page, { path: `${EVIDENCE}/dragpour-${testInfo.project.name}.png` });
  });
});
