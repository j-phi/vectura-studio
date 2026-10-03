const { test, expect } = require('@playwright/test');
const { PROJECTS } = require('./viewports');
const { tap, longPress, hitArea, touchPhase } = require('../helpers/touch');

// TUX-014: tool sub-menus open by tap / long-press and stay open (touch path).
// TUX-013 and TUX-015 append their toolbar specs to this file later.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Surface table. Selectors and mode names come from toolbar.js / buildSharedToolbarMarkup.
const SURFACES = [
  {
    name: 'shape',
    parent: '.tool-btn[data-tool="shape"]',
    menu: '.tool-submenu[data-menu="shape"]',
    rowSel: '.tool-sub-btn[data-shape]',
    activeOf: (t) => String(t).startsWith('shape'),
    longRow: '.tool-sub-btn[data-shape="line"]',
    longExpect: { tool: 'shape-line' },
    tapRow: '.tool-sub-btn[data-shape="polygon"]',
    tapExpect: { tool: 'shape-polygon' },
  },
  {
    name: 'pen',
    parent: '.tool-btn[data-tool="pen"]',
    menu: '.tool-submenu[data-menu="pen"]',
    rowSel: '.tool-sub-btn[data-pen]',
    activeOf: (t) => t === 'pen',
    longRow: '.tool-sub-btn[data-pen="add"]',
    longExpect: { tool: 'pen', penMode: 'add' },
    tapRow: '.tool-sub-btn[data-pen="delete"]',
    tapExpect: { tool: 'pen', penMode: 'delete' },
  },
  {
    name: 'fill',
    parent: '.tool-btn[data-tool="fill"]',
    menu: '.tool-submenu[aria-label="Fill subtools"]',
    rowSel: '.tool-sub-btn[data-fill]',
    activeOf: (t) => String(t).startsWith('fill'),
    longRow: '.tool-sub-btn[data-fill="erase"]',
    longExpect: { tool: 'fill-erase' },
    tapRow: '.tool-sub-btn[data-fill="pattern"]',
    tapExpect: { tool: 'fill-pattern' },
  },
  {
    name: 'scissor',
    parent: '.tool-btn[data-tool="scissor"]',
    menu: '.tool-submenu[aria-label="Scissor subtools"]',
    rowSel: '.tool-sub-btn[data-scissor]',
    activeOf: (t) => t === 'scissor',
    longRow: '.tool-sub-btn[data-scissor="rect"]',
    longExpect: { tool: 'scissor', scissorMode: 'rect' },
    tapRow: '.tool-sub-btn[data-scissor="circle"]',
    tapExpect: { tool: 'scissor', scissorMode: 'circle' },
  },
  {
    name: 'algo-draw',
    algo: true,
    parent: '.tool-btn[data-tool="algo-draw"]',
    menu: '#algo-draw-picker',
    rowSel: '.algo-pick-item',
    activeOf: (t) => t === 'algo-draw',
    // longRow / tapRow resolved at run time (end of list, not the current type).
  },
];

const readState = (page) => page.evaluate(() => ({
  tool: app.ui.activeTool,
  penMode: app.ui.penMode,
  scissorMode: app.ui.scissorMode,
  algo: app.renderer.algoDraftType,
}));

const isOpen = (page, s) => page.evaluate(({ menu, algo }) => {
  const el = document.querySelector(menu);
  if (!el) return false;
  return algo ? !el.classList.contains('hidden') : el.classList.contains('open');
}, { menu: s.menu, algo: !!s.algo });

// Pick two distinct picker types from the END of the list (so the picker must scroll on short phones).
const algoTypes = (page) => page.evaluate(() => {
  const items = window.Vectura.UI.utils.getDrawableAlgorithmOptions();
  const types = window.Vectura.groupAlgorithmsForMenu(items).flatMap((g) => g.items.map((i) => i.type));
  const cur = app.renderer.algoDraftType;
  return types.filter((t) => t !== cur).slice(-2).reverse();
});

const resolveRows = async (page, s) => {
  if (!s.algo) return { long: s.longRow, longExpect: s.longExpect, tapR: s.tapRow, tapExpect: s.tapExpect };
  const [a, b] = await algoTypes(page);
  return {
    long: `.algo-pick-item[data-algo-type="${a}"]`,
    longExpect: { tool: 'algo-draw', algo: a },
    tapR: `.algo-pick-item[data-algo-type="${b}"]`,
    tapExpect: { tool: 'algo-draw', algo: b },
  };
};

const expectState = async (page, expected) => {
  const st = await readState(page);
  Object.entries(expected).forEach(([k, v]) => expect(st[k], `state.${k}`).toBe(v));
};

const menuGeometry = (page, s) => page.evaluate(({ menu }) => {
  const r = document.querySelector(menu).getBoundingClientRect();
  const vv = window.visualViewport;
  return {
    rect: { l: r.left, t: r.top, r: r.right, b: r.bottom },
    vv: { l: vv.offsetLeft, t: vv.offsetTop, r: vv.offsetLeft + vv.width, b: vv.offsetTop + vv.height },
  };
}, { menu: s.menu });

const expectInside = (g, size) => {
  const eps = 0.5;
  expect(g.rect.l).toBeGreaterThanOrEqual(g.vv.l - eps);
  expect(g.rect.t).toBeGreaterThanOrEqual(g.vv.t - eps);
  expect(g.rect.r).toBeLessThanOrEqual(g.vv.r + eps);
  expect(g.rect.b).toBeLessThanOrEqual(g.vv.b + eps);
  expect(g.rect.l).toBeGreaterThanOrEqual(-eps);
  expect(g.rect.t).toBeGreaterThanOrEqual(-eps);
  expect(g.rect.r).toBeLessThanOrEqual(size.width + eps);
  expect(g.rect.b).toBeLessThanOrEqual(size.height + eps);
};

const distanceToRect = (p, r) => {
  const dx = Math.max(r.l - p.x, 0, p.x - r.r);
  const dy = Math.max(r.t - p.y, 0, p.y - r.b);
  return Math.hypot(dx, dy);
};

test.describe('TUX-014 tool sub-menus (touch)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
    await page.evaluate(() => app.ui.setActiveTool('select'));
  });

  for (const s of SURFACES) {
    test(`TUX-014 long-press keeps menu open: ${s.name}`, async ({ page }) => {
      const size = page.viewportSize();
      const parent = page.locator(s.parent).first();
      const rows = await resolveRows(page, s);
      await longPress(page, parent, 600);
      expect(await isOpen(page, s), `expected ${s.menu} visible after longPress(600), was hidden; activeTool ${(await readState(page)).tool}`).toBe(true);
      expect((await readState(page)).tool).toBe('select');
      expectInside(await menuGeometry(page, s), size);

      // Every row fully inside the visible menu area.
      const rowHandles = await page.locator(`${s.menu} ${s.rowSel}`).elementHandles();
      let checked = 0;
      for (const h of rowHandles) {
        const info = await h.evaluate((el, menu) => {
          const m = document.querySelector(menu).getBoundingClientRect();
          const r = el.getBoundingClientRect();
          const inside = r.top >= m.top - 0.5 && r.bottom <= m.bottom + 0.5 && r.left >= m.left - 0.5 && r.right <= m.right + 0.5;
          const cs = getComputedStyle(el);
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return {
            inside, text: (el.innerText || '').trim().length, userSelect: cs.userSelect || cs.webkitUserSelect,
            callout: 'webkitTouchCallout' in cs ? cs.webkitTouchCallout : null,
            hitIsRow: !!hit && hit.closest(el.tagName.toLowerCase() + '.' + el.classList[0]) === el,
          };
        }, s.menu);
        if (!info.inside) continue;
        checked += 1;
        const area = await hitArea(page, h);
        expect(area.w, `row hit width (${s.name})`).toBeGreaterThanOrEqual(44);
        expect(area.h, `row hit height (${s.name})`).toBeGreaterThanOrEqual(44);
        expect(info.hitIsRow, 'elementFromPoint(centre) is the row').toBe(true);
        expect(info.text, 'visible label text').toBeGreaterThan(0);
        expect(info.userSelect).toBe('none');
        if (info.callout !== null) expect(info.callout).toBe('none');
      }
      expect(checked).toBeGreaterThan(0);

      // Tap the target row.
      const target = page.locator(`${s.menu} ${rows.long}`).first();
      await target.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await sleep(50);
      await tap(page, target);
      await expectState(page, rows.longExpect);
      expect(await isOpen(page, s)).toBe(false);
      await sleep(400);
      await expectState(page, rows.longExpect);
    });

    test(`TUX-014 tap on active tool opens menu: ${s.name}`, async ({ page }) => {
      const parent = page.locator(s.parent).first();
      const rows = await resolveRows(page, s);
      await tap(page, parent);
      const st1 = await readState(page);
      expect(s.activeOf(st1.tool), `group active after first tap, tool=${st1.tool}`).toBe(true);
      expect(await isOpen(page, s)).toBe(false);
      await tap(page, parent);
      expect(await isOpen(page, s), 'menu visible after tapping the active tool').toBe(true);
      expect((await readState(page)).tool).toBe(st1.tool);
      const target = page.locator(`${s.menu} ${rows.tapR}`).first();
      await target.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await sleep(50);
      await tap(page, target);
      await expectState(page, rows.tapExpect);
      expect(await isOpen(page, s)).toBe(false);
    });
  }

  test('TUX-014 dismiss: tap parent closes; outside tap is consumed', async ({ page }) => {
    for (const s of SURFACES.filter((x) => ['shape', 'pen'].includes(x.name))) {
      await page.evaluate(() => app.ui.setActiveTool('select'));
      const parent = page.locator(s.parent).first();
      await longPress(page, parent, 600);
      expect(await isOpen(page, s), `${s.name} open`).toBe(true);
      await tap(page, parent);
      expect(await isOpen(page, s), `${s.name} closed by parent tap`).toBe(false);
      expect((await readState(page)).tool).toBe('select');

      // Activate the tool, reopen via tap-on-active.
      if (s.name === 'shape') {
        await longPress(page, parent, 600);
        await tap(page, page.locator(`${s.menu} .tool-sub-btn[data-shape="rect"]`));
      } else {
        await tap(page, parent);
      }
      await tap(page, parent);
      expect(await isOpen(page, s), `${s.name} reopened`).toBe(true);
      await page.evaluate(() => {
        window.__canvasDowns = 0;
        document.querySelector('#main-canvas').addEventListener('pointerdown', () => { window.__canvasDowns += 1; });
      });
      const before = await page.evaluate(() => ({
        layers: app.engine.layers.length,
        sel: Array.from(app.renderer.selectedLayerIds || []).join(','),
        tool: app.ui.activeTool,
      }));
      const box = await page.locator('#main-canvas').boundingBox();
      const vw = page.viewportSize();
      const pt = {
        x: Math.min(box.x + box.width - 24, vw.width - 24),
        y: Math.min(box.y + box.height - 24, vw.height - 24),
      };
      await page.touchscreen.tap(pt.x, pt.y);
      expect(await isOpen(page, s), `${s.name} closed by outside tap`).toBe(false);
      const after = await page.evaluate(() => ({
        layers: app.engine.layers.length,
        sel: Array.from(app.renderer.selectedLayerIds || []).join(','),
        tool: app.ui.activeTool,
        downs: window.__canvasDowns,
      }));
      expect(after.layers).toBe(before.layers);
      expect(after.sel).toBe(before.sel);
      expect(after.tool).toBe(before.tool);
      expect(after.downs, 'outside tap must not reach the canvas').toBe(0);
    }
  });

  for (const s of SURFACES.filter((x) => ['shape', 'algo-draw'].includes(x.name))) {
    test(`TUX-014 hold cancel: ${s.name}`, async ({ page }) => {
      const parent = page.locator(s.parent).first();
      const p = await parent.boundingBox();
      const c = { x: p.x + p.width / 2, y: p.y + p.height / 2, id: 0 };
      // Movement of 15 px before the timer fires cancels the hold.
      await touchPhase(page, 'start', [c]);
      for (let i = 1; i <= 5; i += 1) {
        await touchPhase(page, 'move', [{ ...c, y: c.y + 3 * i }]);
        await sleep(30);
      }
      await sleep(500);
      await touchPhase(page, 'end', [{ ...c, y: c.y + 15 }]);
      expect(await isOpen(page, s), 'no menu after a moved hold').toBe(false);
      expect((await readState(page)).tool).toBe('select');
      // pointercancel cancels the hold.
      await touchPhase(page, 'start', [c]);
      await sleep(100);
      await touchPhase(page, 'cancel', [c]);
      await sleep(400);
      expect(await isOpen(page, s), 'no menu after pointercancel').toBe(false);
    });
  }

  for (const s of SURFACES.filter((x) => ['shape', 'algo-draw'].includes(x.name))) {
    test(`TUX-014 placement on two docks: ${s.name}`, async ({ page }, testInfo) => {
      const size = page.viewportSize();
      const device = PROJECTS[testInfo.project.name]?.device;
      const landscape = size.width > size.height;
      const check = async () => {
        await page.evaluate(() => app.ui.setActiveTool('select'));
        const parent = page.locator(s.parent).first();
        const b = await parent.boundingBox();
        const press = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        await longPress(page, parent, 600);
        expect(await isOpen(page, s), `${s.name} open (${device})`).toBe(true);
        const g = await menuGeometry(page, s);
        expectInside(g, size);
        expect(distanceToRect(press, g.rect), 'press point clearance').toBeGreaterThanOrEqual(24);
        await tap(page, parent); // close
      };
      await check();
      await page.evaluate((side) => { app.ui.setToolbarDock(side); app.ui._updateAllSubmenuDirs(); }, landscape ? 'left' : 'bottom');
      await sleep(250);
      await check();
    });
  }
});
