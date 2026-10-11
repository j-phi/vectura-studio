const fs = require('fs');
const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');
const { openPane, addLayer } = require('./target-audit-states');
const { waitLayoutSettled } = require('../helpers/target-audit-core');

// TUX-033: the Multi-select task works in the layer list with real finger taps in both engines.
// WebKit reports pointerType "mouse" on the click that follows a tap, so a pointerType-only gate fails there.
// iPhone projects are not in this spec: they need the layers pane reachable by finger (TUX-010 pane work),
// which is covered by the Phase 2 pane lane. Run with the iPad projects.
const EVIDENCE = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-033';

test.describe('TUX-033 layer list honours touch modifiers', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!/ipad/.test(testInfo.project.name), 'iPad projects only (iPhone pane reach is the pane lane)');
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.Vectura.InputModifiers));
    for (let i = 0; i < 4; i += 1) await addLayer(page, 'wavetable');
    await page.evaluate(() => { window.app.renderer.setSelection([], null); window.app.ui.lastLayerClickId = null; window.app.ui.renderLayers(); });
    await openPane(page, 'right');
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
    await page.screenshot({ path: `${EVIDENCE}/${testInfo.project.name}.png` });
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
