const { evidenceDir, shoot } = require('../helpers/evidence');
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { PROJECTS } = require('./viewports');
const touch = require('../helpers/touch');

// TUX-040: the layer filter menu (UI.overlays.Menu) must close on ANY outside pointer press,
// including touch drags/scrolls that never synthesize a compat mousedown.
const EVIDENCE = evidenceDir('TUX-040');

const MENU = '.menu-dropdown.open';

const openMenu = async (page) => {
  const btn = page.locator('#layer-filter-btn');
  let box = await btn.boundingBox();
  if (!(box && box.width > 0 && box.height > 0)) {
    // Phone: the left pane is closed. Use the real pane toggle to bring the layers panel up.
    const toggle = page.locator('#btn-pane-toggle-left');
    if (await toggle.isVisible().catch(() => false)) {
      await touch.tap(page, toggle);
      await page.waitForTimeout(400);
      box = await btn.boundingBox();
    }
  }
  if (box && box.width > 0 && box.height > 0) {
    await touch.tap(page, btn);
  } else {
    // Documented fallback: no reachable drawer control; open through the menu API on a visible anchor.
    await page.evaluate(() => {
      // A dedicated 1px anchor: using the canvas as the anchor would exclude canvas taps from dismissal.
      const anchor = document.createElement('div');
      anchor.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;pointer-events:none';
      document.body.appendChild(anchor);
      window.Vectura.UI.Menus.LayerFilter.open(window.app.ui, anchor);
    });
  }
  await expect(page.locator(MENU)).toBeVisible();
};

const menuClosed = async (page) => {
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const m = document.querySelector('.menu-dropdown.open');
    return !m || getComputedStyle(m).display === 'none';
  });
};

// An outside point on the canvas: >= 24px from the menu rect and not covered by a menu element.
const outsidePoint = (page) => page.evaluate(() => {
  const c = document.getElementById('main-canvas').getBoundingClientRect();
  const m = document.querySelector('.menu-dropdown.open').getBoundingClientRect();
  const M = 24;
  const menuEl = document.querySelector('.menu-dropdown.open');
  const maxY = Math.min(c.bottom, innerHeight) - 50;
  const maxX = Math.min(c.right, innerWidth) - 70;
  for (let y = Math.max(c.top, 0) + 20; y < maxY; y += 10) {
    for (let x = Math.max(c.left, 0) + 20; x < maxX; x += 10) {
      const near = x > m.left - M - 60 && x < m.right + M + 60 && y > m.top - M - 40 && y < m.bottom + M + 40;
      if (near) continue;
      const hit = document.elementFromPoint(x, y);
      if (hit && (menuEl.contains(hit) || hit.closest('.menu-dropdown'))) continue;
      // On phones the open drawer lays a backdrop over the canvas; it is a legitimate outside surface.
      if (hit && (hit.id === 'main-canvas' || hit.classList.contains('mobile-pane-backdrop'))) return { x, y };
    }
  }
  return null;
});

test.describe('menu outside dismiss (TUX-040)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!PROJECTS[testInfo.project.name], 'touch project only');
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
    await page.evaluate(() => {
      window.app.engine.addLayer('spiral');
      window.app.engine.addLayer('flowfield');
      window.app.ui.renderLayers();
    });
  });

  test('(a) RED: a one-finger canvas drag closes the menu', async ({ page }, testInfo) => {
    await openMenu(page);
    const p = await outsidePoint(page);
    expect(p, 'no outside canvas point').toBeTruthy();
    await touch.drag(page, p, { x: p.x + 60, y: p.y + 40 }, { steps: 10 });
    expect(await menuClosed(page)).toBe(true);
    fs.mkdirSync(EVIDENCE, { recursive: true });
    await shoot(page, { path: `${EVIDENCE}/${testInfo.project.name}.png` });
  });

  test('(b) RED: a one-finger scroll-drag of the layer list closes the menu', async ({ page }) => {
    await openMenu(page);
    // Start on #layer-list (or the panel body) at a point outside the menu rect.
    const p = await page.evaluate(() => {
      const m = document.querySelector('.menu-dropdown.open').getBoundingClientRect();
      const host = [document.getElementById('layer-list'), document.querySelector('.left-pane, #left-pane')].find((e) => {
        if (!e) return false;
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (!host) return null;
      const r = host.getBoundingClientRect();
      for (let y = r.top + 8; y < Math.min(r.bottom - 70, innerHeight - 70); y += 8) {
        for (let x = r.left + 8; x < r.right - 8; x += 12) {
          if (x > m.left - 24 && x < m.right + 24 && y > m.top - 24 && y < m.bottom + 24) continue;
          const hit = document.elementFromPoint(x, y);
          if (hit && !hit.closest('.menu-dropdown') && host.contains(hit)) return { x, y };
        }
      }
      return null;
    });
    test.skip(!p, 'no list/panel point outside the menu at this viewport');
    await touch.drag(page, p, { x: p.x, y: p.y + 60 }, { steps: 10 });
    expect(await menuClosed(page)).toBe(true);
  });

  test('(c) RED: a tap on the canvas with the Type tool closes the menu', async ({ page }) => {
    await page.evaluate(() => window.app.ui.setActiveTool('type'));
    await openMenu(page);
    const p = await outsidePoint(page);
    expect(p).toBeTruthy();
    await touch.tap(page, p);
    expect(await menuClosed(page)).toBe(true);
  });

  test('(d) a tap on the canvas (Select) closes the menu', async ({ page }) => {
    await page.evaluate(() => window.app.ui.setActiveTool('select'));
    await openMenu(page);
    const p = await outsidePoint(page);
    expect(p).toBeTruthy();
    await touch.tap(page, p);
    expect(await menuClosed(page)).toBe(true);
  });

  test('(e) a tap on empty header space closes the menu', async ({ page }) => {
    await openMenu(page);
    const p = await page.evaluate(() => {
      const m = document.querySelector('.menu-dropdown.open').getBoundingClientRect();
      const hdr = document.querySelector('header, .app-header, #app-header, .topbar');
      if (!hdr) return null;
      const r = hdr.getBoundingClientRect();
      const y = r.top + r.height / 2;
      for (let x = r.left + 4; x < r.right - 4; x += 6) {
        if (x > m.left - 24 && x < m.right + 24 && y > m.top - 24 && y < m.bottom + 24) continue;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === hdr || /^(DIV|HEADER|SPAN)$/.test(hit.tagName)) && !hit.closest('button,a,input,.menu-dropdown,[role=menuitem]') && !hit.textContent.trim()) return { x, y };
      }
      return null;
    });
    test.skip(!p, 'no empty header point at this viewport');
    await touch.tap(page, p);
    expect(await menuClosed(page)).toBe(true);
  });

  test('(f) tapping the trigger twice leaves the menu closed', async ({ page }) => {
    const btn = page.locator('#layer-filter-btn');
    const box = await btn.boundingBox();
    test.skip(!(box && box.width > 0), 'trigger not reachable on this viewport');
    await touch.tap(page, btn);
    await expect(page.locator(MENU)).toBeVisible();
    await touch.tap(page, btn);
    expect(await menuClosed(page)).toBe(true);
  });

  test('(g) tapping a menu entry selects it and closes the menu', async ({ page }) => {
    await openMenu(page);
    const entry = page.locator(`${MENU} .menu-entry[data-key="spiral"]`);
    await entry.scrollIntoViewIfNeeded();
    await touch.tap(page, entry);
    expect(await page.evaluate(() => window.app.ui.layerFilterType)).toBe('spiral');
    expect(await menuClosed(page)).toBe(true);
  });

  // TUX-040/014: a tap that activates a control outside an open TOP menu (Insert, Object) must also close it.
  for (const [trigger, tool] of [['#btn-menu-insert', 'pen'], ['#btn-menu-object', 'scissor']]) {
    test(`(h) tapping the ${tool} tool with ${trigger} open switches the tool and closes the menu`, async ({ page }) => {
      await page.evaluate(() => window.app.ui.setActiveTool('select'));
      const trig = page.locator(trigger);
      const tbox = await trig.boundingBox();
      test.skip(!(tbox && tbox.width > 0), 'top menu trigger not reachable on this viewport');
      await touch.tap(page, trig);
      const panel = page.locator(`${trigger} + [data-top-menu-panel]`);
      await expect(panel).toBeVisible();
      const btn = page.locator(`#tool-bar .tool-btn[data-tool="${tool}"], .tool-btn[data-tool="${tool}"]`).first();
      const bbox = await btn.boundingBox();
      test.skip(!(bbox && bbox.width > 0), `${tool} tool not reachable on this viewport`);
      const covered = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[data-top-menu-panel]'), { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 });
      test.skip(covered, 'the open menu covers the tool button here');
      await touch.tap(page, btn);
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => window.app.ui.activeTool)).toBe(tool);
      expect(await panel.isVisible()).toBe(false);
      expect(await page.evaluate(() => window.app.ui.openTopMenuTrigger)).toBeNull();
    });
  }
});
