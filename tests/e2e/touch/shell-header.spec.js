const { test, expect } = require('@playwright/test');
const { PROJECTS } = require('./viewports');
const touch = require('../helpers/touch');

// TUX-001 closing round: sub-level fit/scroll in landscape, modifier glyphs in landscape,
// header vs modal (and after the modal closes), narrow mouse window overflow, phone-path audit probe.
const PHONES = ['iPhP', 'iPhL', 'iPhL-c', 'iPhP-c'];
const gotoApp = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
};
const phoneOnly = (testInfo) => {
  const dev = PROJECTS[testInfo.project.name];
  test.skip(!dev || !PHONES.includes(dev.device), 'phone projects only');
  return dev;
};

test.describe('TUX-001 closing round', () => {
  test('every sub-level fits or scrolls, last item reachable, no horizontal overflow', async ({ page }, testInfo) => {
    phoneOnly(testInfo);
    await gotoApp(page);
    const ids = await page.evaluate(() => [...document.querySelectorAll('#top-menubar [data-top-menu-trigger]')].map((t) => t.id));
    expect(ids.length).toBeGreaterThan(3);
    for (const id of ids) {
      await touch.tap(page, page.locator('#btn-menu-hamburger'));
      await touch.tap(page, page.locator(`#${id}`));
      const info = await page.evaluate(() => {
        const bar = document.getElementById('top-menubar');
        const panel = document.querySelector('.top-menu-panel.open');
        const items = [...panel.querySelectorAll('.top-menu-item')].filter((e) => e.getBoundingClientRect().height > 0);
        const last = items[items.length - 1];
        const br = bar.getBoundingClientRect();
        const lr0 = last.getBoundingClientRect();
        // the scroller is whichever ancestor of the last item scrolls
        let sc = panel; const chain = [];
        while (sc) { const cs = getComputedStyle(sc); if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && sc.scrollHeight > sc.clientHeight + 1) { sc.scrollTop = sc.scrollHeight; chain.push(sc.id || sc.className); } if (sc === bar) break; sc = sc.parentElement; }
        const lr = last.getBoundingClientRect();
        const hOver = [...panel.querySelectorAll('.top-menu-item')].filter((e) => e.scrollWidth > e.clientWidth + 1).length;
        return { barBottom: br.bottom, ih: innerHeight, before: lr0.bottom, after: lr.bottom, scrolled: chain, hOver, sw: document.documentElement.scrollWidth, iw: innerWidth };
      });
      expect(info.barBottom, `${id} sheet inside viewport`).toBeLessThanOrEqual(info.ih + 1);
      expect(info.after, `${id} last item reachable (scrolled by ${info.scrolled})`).toBeLessThanOrEqual(info.ih + 1);
      expect(info.hOver, `${id} horizontal overflow`).toBe(0);
      expect(info.sw).toBeLessThanOrEqual(info.iw);
      await page.evaluate(() => document.getElementById('btn-menu-hamburger').click());
      await page.evaluate(() => { if (document.body.classList.contains('phone-menu-open')) document.getElementById('btn-menu-hamburger').click(); });
    }
  });

  test('modifier glyph CSS applies in every phone viewport', async ({ page }, testInfo) => {
    phoneOnly(testInfo);
    await gotoApp(page);
    const r = await page.evaluate(() => {
      const bar = document.getElementById('touch-modifier-bar');
      return [...bar.querySelectorAll('.touch-mod-btn')].map((b) => {
        const lab = b.querySelector('.touch-mod-label');
        return { mod: b.dataset.touchMod, content: getComputedStyle(b, '::before').content, labelDisplay: lab ? getComputedStyle(lab).display : 'none' };
      });
    });
    expect(r.length).toBeGreaterThan(3);
    for (const b of r) {
      expect(b.content, b.mod).not.toMatch(/^(none|normal)$/);
      expect(b.labelDisplay, b.mod).toBe('none');
    }
  });

  test('header stays below a modal and live again after the modal closes', async ({ page }, testInfo) => {
    phoneOnly(testInfo);
    await gotoApp(page);
    await page.evaluate(() => { window.app.engine.addLayer('spiral'); window.app.pushHistory(); window.app.engine.addLayer('rings'); window.app.pushHistory(); window.app.render(); });
    await page.waitForFunction(() => !document.getElementById('btn-header-export').classList.contains('is-disabled'));
    await touch.tap(page, page.locator('#btn-header-export'));
    await page.waitForSelector('#export-modal-root', { state: 'attached' });
    const hit = await page.evaluate(() => {
      const card = document.querySelector('#modal-overlay.open .modal-card, #modal-overlay.open > *');
      const cr = card.getBoundingClientRect();
      const top = document.elementFromPoint(cr.left + cr.width / 2, Math.max(2, cr.top + 2));
      const ub = document.getElementById('btn-header-undo').getBoundingClientRect();
      const u = document.elementFromPoint(ub.left + ub.width / 2, ub.top + ub.height / 2);
      return { topInModal: !!top.closest('#modal-overlay'), undoInModal: !!u.closest('#modal-overlay'), undoIsHeader: !!u.closest('#app-header'), cardTop: cr.top };
    });
    expect(hit.topInModal).toBe(true);
    expect(hit.undoIsHeader && !hit.undoInModal).toBe(false);
    await touch.tap(page, page.locator('#export-modal-cancel'));
    await expect(page.locator('#modal-overlay.open')).toHaveCount(0);
    const pe = await page.evaluate(() => getComputedStyle(document.getElementById('app-header')).pointerEvents);
    expect(pe).not.toBe('none');
    await page.evaluate(() => { window.__undoCalls = 0; const u = document.getElementById('btn-undo'); u.addEventListener('click', () => { window.__undoCalls += 1; }, true); });
    const before = await page.evaluate(() => window.app.engine.layers.length);
    await touch.tap(page, page.locator('#btn-header-undo'));
    await expect.poll(() => page.evaluate(() => window.__undoCalls)).toBe(1);
    const after = await page.evaluate(() => window.app.engine.layers.length);
    expect(after, `layers ${before} -> ${after}`).toBeLessThanOrEqual(before);
    await touch.tap(page, page.locator('#btn-menu-hamburger'));
    await expect(page.locator('body.phone-menu-open')).toHaveCount(1);
  });

  test('phone-path audit probe: no horizontal overflow in any menu state', async ({ page }, testInfo) => {
    phoneOnly(testInfo);
    await gotoApp(page);
    const states = await page.evaluate(async () => {
      const out = [];
      const burger = document.getElementById('btn-menu-hamburger');
      const triggers = [...document.querySelectorAll('#top-menubar [data-top-menu-trigger]')];
      for (const t of triggers) {
        if (!document.body.classList.contains('phone-menu-open')) burger.click();
        t.click();
        await new Promise((r) => setTimeout(r, 30));
        const bad = [...document.querySelectorAll('.top-menu-panel.open, .top-menu-panel.open .top-menu-item, #top-menubar')].filter((e) => e.scrollWidth > e.clientWidth + 1).length;
        out.push({ id: t.id, bad, doc: document.documentElement.scrollWidth <= innerWidth });
        burger.click(); if (document.body.classList.contains('phone-menu-open')) burger.click();
      }
      return out;
    });
    for (const s of states) { expect(s.bad, s.id).toBe(0); expect(s.doc, s.id).toBe(true); }
  });
});

test.describe('TUX-001 desktop and narrow mouse windows', () => {
  test('mouse windows 500-640 px never overflow horizontally', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only');
    for (let w = 500; w <= 640; w += 10) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto('/');
      await page.waitForFunction(() => !!(window.app && window.app.ui));
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
      expect(m.sw, `width ${w}`).toBeLessThanOrEqual(m.iw);
    }
  });
  test('desktop header has no hamburger and no Theme row', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only');
    await page.setViewportSize({ width: 1600, height: 1000 });
    await gotoApp(page);
    const m = await page.evaluate(() => ({
      burger: document.getElementById('btn-menu-hamburger').getBoundingClientRect().width,
      theme: [...document.querySelectorAll('#top-menubar .top-menu-theme-row')].some((e) => e.getBoundingClientRect().width > 0),
      triggers: [...document.querySelectorAll('#top-menubar .top-menu-trigger')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.textContent.trim()),
    }));
    expect(m.burger).toBe(0);
    expect(m.theme).toBe(false);
    expect(m.triggers).not.toContain('Theme');
  });
});
