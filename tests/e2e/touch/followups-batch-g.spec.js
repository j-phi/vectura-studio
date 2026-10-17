const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');
const { PROJECTS } = require('./viewports');

// Batch G followups (docs/touch-audit/followups.md): a collapsed right pane header stays on screen on touch-wide,
// and the Export legend gear sits above the modal footer on short phone landscape.

test.describe('followups batch G', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
    await page.waitForTimeout(600);
  });

  test('collapsed right pane header does not run past the screen edge (touch-wide)', async ({ page }, testInfo) => {
    const s = PROJECTS[testInfo.project.name];
    test.skip(!(s.device === 'iPadL' || s.device === 'coarseWide'), 'touch-wide layouts only');
    const collapsed = () => page.evaluate(() => document.getElementById('right-pane').classList.contains('pane-collapsed'));
    if (!(await collapsed())) {
      await touch.tap(page, page.locator('#btn-pane-toggle-right'));
      await page.waitForTimeout(600);
    }
    expect(await collapsed(), 'right pane collapsed by finger').toBe(true);
    const r = await page.evaluate(() => { const b = document.querySelector('#right-pane .pane-header').getBoundingClientRect(); return { right: b.right, iw: innerWidth }; });
    expect(r.right, `header right ${r.right} vs viewport ${r.iw}`).toBeLessThanOrEqual(r.iw + 0.5);
    // The chevron keeps a 44 px finger target.
    const hit = await touch.hitArea(page, '#btn-pane-toggle-right');
    expect(Math.min(hit.w, hit.h)).toBeGreaterThanOrEqual(44);
  });

  test('Export legend gear is not under the modal footer', async ({ page }, testInfo) => {
    const s = PROJECTS[testInfo.project.name];
    test.skip(s.device !== 'iPhL-c' && s.device !== 'iPhL', 'phone landscape only');
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
});
