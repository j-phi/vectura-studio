const { evidenceDir, shoot } = require('./helpers/evidence');
const { test, expect } = require('@playwright/test');

// Send to Plotter: File > Send to Plotter, simulator only (no port is ever opened).
const openPanel = async (page) => {
  await page.click('#btn-menu-file');
  await page.click('#btn-send-to-plotter');
  await page.waitForSelector('.stp-dialog');
};

test.describe('Send to Plotter (simulator)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
    await page.evaluate(() => {
      const { engine, ui } = window.app;
      engine.addLayer('spiral');
      if (ui.renderLayers) ui.renderLayers();
      window.Vectura.UI.Modals.SendToPlotter.simOptions = { bannerDelayMs: 50, speed: 3000 };
    });
    await page.waitForFunction(() => { const b = document.getElementById('btn-send-to-plotter'); return b && !b.disabled; });
  });

  test('connect to the simulator, set the origin, plot to 100 percent', async ({ page }) => {
    const dir = evidenceDir('send-to-plotter');
    await page.setViewportSize({ width: 1280, height: 800 });
    await openPanel(page);
    await shoot(page, { path: `${dir}/connect.png` });

    // v2: the simulator lives in a collapsed "Practice with the simulator" section.
    await page.evaluate(() => { const b = document.getElementById('stp-connect-sim'); const d = b && b.closest('details'); if (d) d.open = true; });
    await page.click('#stp-connect-sim');
    // Safety: the start-corner question comes before any motion; confirming it sets the origin
    // (the carriage has not moved since connect).
    await page.click('#stp-corner-yes');
    await expect(page.locator('#stp-origin-chip')).toHaveText(/Origin set/);
    await expect(page.locator('#stp-origin-reminder')).toBeVisible();

    await page.click('[data-tab="setup"]');
    await expect(page.locator('#stp-stat-paths')).not.toHaveText('0');
    await shoot(page, { path: `${dir}/setup.png` });

    await page.click('[data-tab="plot"]');
    await expect(page.locator('#stp-start')).toBeEnabled();
    await page.click('#stp-start');
    await page.waitForSelector('#stp-done', { timeout: 60000 });
    await shoot(page, { path: `${dir}/plot-done.png` });

    const result = await page.evaluate(() => {
      const s = window.Vectura.UI.Modals.SendToPlotter.getSession();
      return { percent: s.progress.percent, state: s.controller.state, traces: s.transport.getPolylines().length };
    });
    expect(result.percent).toBe(100);
    expect(result.state).toBe('idle');
    expect(result.traces).toBeGreaterThan(0);
  });

  test('the panel fits 1024 wide and Escape closes it when idle', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 700 });
    await openPanel(page);
    const box = await page.evaluate(() => { const r = document.querySelector('.stp-dialog').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: innerWidth, h: innerHeight }; });
    expect(box.l).toBeGreaterThanOrEqual(0);
    expect(box.r).toBeLessThanOrEqual(box.w);
    expect(box.b).toBeLessThanOrEqual(box.h);
    await page.keyboard.press('Escape');
    await expect(page.locator('.stp-dialog')).toHaveCount(0);
  });
});
