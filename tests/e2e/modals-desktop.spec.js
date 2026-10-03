const { test, expect } = require('@playwright/test');

// TUX-046 D6: desktop parity for the legacy #modal-overlay (fine pointer, mouse).
const openExport = async (page) => {
  await page.click('#btn-menu-file');
  await page.click('#btn-export');
  await page.waitForSelector('#modal-overlay.open');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(300);
};

test.describe('TUX-046 modals on desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
    await page.evaluate(() => {
      const { engine, ui } = window.app;
      engine.addLayer('spiral');
      if (ui.renderLayers) ui.renderLayers();
      if (ui.buildControls) ui.buildControls();
    });
    await page.waitForFunction(() => { const b = document.getElementById('btn-export'); return b && !b.disabled; });
  });

  test('1280x700: the header does not cover the Export card top', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    await openExport(page);
    const probe = await page.evaluate(() => {
      const r = document.querySelector('#modal-overlay .modal-card').getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + 40, r.top + 4);
      return { inCard: !!hit && !!hit.closest('#modal-overlay .modal-card'), hit: hit ? `${hit.tagName}.${hit.className}` : 'null', top: r.top };
    });
    expect(probe.inCard, `hit ${probe.hit} at card top ${probe.top}`).toBe(true);
  });

  test('1600x1000: Export card size, close size and focus are unchanged', async ({ page }) => {
    await openExport(page);
    const m = await page.evaluate(() => {
      const card = document.querySelector('#modal-overlay .modal-card');
      const cs = getComputedStyle(card);
      const close = document.querySelector('.modal-card .modal-close').getBoundingClientRect();
      const a = document.activeElement;
      const first = Array.from(card.querySelectorAll('button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')).find((el) => !el.classList.contains('modal-close'));
      return { w: parseFloat(cs.width), h: parseFloat(cs.height), cw: close.width, ch: close.height, focusIsFirst: a === first, active: a ? `${a.tagName}.${a.className}` : 'null' };
    });
    expect(m.w).toBeCloseTo(Math.min(Math.max(0.8 * 1600, 1080), 1600 - 32), 0);
    expect(m.h).toBeCloseTo(Math.min(Math.max(0.8 * 1000, 720), 1000 - 32), 0);
    expect(m.cw).toBe(24);
    expect(m.ch).toBe(24);
    expect(m.focusIsFirst, `active ${m.active}`).toBe(true);
  });

  test('1600x1000: Help and colour picker open with the 24px close', async ({ page }) => {
    await page.click('#btn-menu-help');
    await page.click('#btn-help');
    await page.waitForSelector('#modal-overlay.open');
    expect((await page.locator('.modal-card .modal-close').boundingBox()).width).toBe(24);
    await page.evaluate(() => window.app.ui.closeModal());
    await page.evaluate(() => window.app.ui.openColorModal({ title: 'Pen Color', value: '#ff0000', onApply: () => {} }));
    await page.waitForSelector('#modal-overlay.open');
    expect((await page.locator('.modal-card .modal-close').boundingBox()).height).toBe(24);
  });
});
