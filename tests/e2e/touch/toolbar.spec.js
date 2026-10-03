const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { PROJECTS } = require('./viewports');
const { tap, longPress, drag, hitArea, touchPhase, engineSupports } = require('../helpers/touch');

const EVIDENCE_013 = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-013';

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

// TUX-013: phone layouts keep only some slots on the rail; the rest live in the ⋯ All Tools drawer.
// A surface whose rail parent is hidden has no finger target here, so it is skipped with a named reason
// (the drawer routes are covered by the TUX-013 reachability and algorithm-picker tests below).
const skipIfOffRail = async (page, s) => {
  const off = await page.evaluate((sel) => {
    const e = document.querySelector(sel);
    return !e || e.offsetParent === null || !!e.closest('.rail-overflowed');
  }, s.parent);
  test.skip(off, `TUX-013: ${s.name} slot is in the All Tools overflow on this layout (no rail button to touch)`);
};

test.describe('TUX-014 tool sub-menus (touch)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
    await page.evaluate(() => app.ui.setActiveTool('select'));
  });

  for (const s of SURFACES) {
    test(`TUX-014 long-press keeps menu open: ${s.name}`, async ({ page }) => {
      await skipIfOffRail(page, s);
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
      await skipIfOffRail(page, s);
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
      await skipIfOffRail(page, s);
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
      await skipIfOffRail(page, s);
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

// ── TUX-013: one-row tool rail with ⋯ overflow ───────────────────────────────
// Pre-fix values measured on the gated base (touch/integration + TUX-001/006):
//   rail h: iPadP 204, iPhP 254, iPhP-c 254, iPhL 204. viewport-container h: iPadP 852, iPhP 493, iPhP-c 369.
// Requirement amendment (adjudicator): tablet-layout rail <= 64 px, phone-layout <= 52 px (border counted);
// iPhL/iPhL-c belong to TUX-007 and must not get worse (the shared phone rule gives <= 52 there for free).
const RAIL_BASE = {
  iPadP: { rail: 204, vc: 852, max: 64 },
  iPhP: { rail: 254, vc: 493, max: 52 },
  'iPhP-c': { rail: 254, vc: 369, max: 52 },
};
const railMetrics = (page) => page.evaluate(() => {
  const rail = document.getElementById('tool-bar');
  const rr = rail.getBoundingClientRect();
  const visible = [...rail.querySelectorAll('.tool-btn')].filter((b) => b.offsetParent !== null && !b.classList.contains('hidden'));
  const tops = visible.map((b) => b.getBoundingClientRect().top);
  const wide = [...rail.children].filter((c) => c.getBoundingClientRect().width > 0 && c.getBoundingClientRect().width > rr.width * 0.5)
    .map((c) => `${c.className}:${Math.round(c.getBoundingClientRect().width)}`);
  const vis = (el) => !!el && el.offsetParent !== null && el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden';
  return {
    h: rr.height, w: rr.width, n: visible.length,
    topSpread: tops.length ? Math.max(...tops) - Math.min(...tops) : 0,
    wide,
    footer: vis(rail.querySelector('.toolbar-footer')), handle: vis(rail.querySelector('.toolbar-drag-handle')),
    scrollW: rail.scrollWidth, clientW: rail.clientWidth,
    vc: document.getElementById('viewport-container').getBoundingClientRect().height,
  };
});
// elementFromPoint at the centre of every visible rail button (incl. the overflow button) is the button.
const railOccluders = (page) => page.evaluate(() => [...document.querySelectorAll('#tool-bar .tool-btn')]
  .filter((b) => b.offsetParent !== null && !b.classList.contains('hidden'))
  .map((b) => {
    const r = b.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return t === b || b.contains(t) ? null : `${b.id || b.dataset.tool} <- ${t && (t.id || t.className)}`;
  }).filter(Boolean));
const assertOneRow = (m, dev, label) => {
  const base = RAIL_BASE[dev];
  expect(m.h, `${label}: rail height`).toBeLessThanOrEqual(base.max);
  expect(m.topSpread, `${label}: all visible .tool-btn share one row`).toBeLessThanOrEqual(2);
  expect(m.wide, `${label}: no rail child wider than 50% of the rail`).toEqual([]);
};

test.describe('TUX-013 one row', () => {
  const portrait = (testInfo) => {
    const dev = PROJECTS[testInfo.project.name]?.device;
    return RAIL_BASE[dev] ? dev : null;
  };
  const load = async (page) => {
    await page.goto('/');
    await page.waitForSelector('#tool-bar .tool-btn');
    await page.waitForFunction(() => !!(window.app && window.app.ui && document.getElementById('tool-overflow-btn')));
    // TUX-008 (pane defaults) owns closing the side panes on tablet. Until it lands the open
    // panes overlay the rail edges. Close them the way a finger does: tap both pane toggles.
    // (Narrow phones are .auto-collapsed already; their toggles sit under the lifted rail.)
    const autoCollapsed = await page.evaluate(() => document.body.classList.contains('auto-collapsed'));
    if (!autoCollapsed) {
      await tap(page, page.locator('#btn-pane-toggle-left'));
      await tap(page, page.locator('#btn-pane-toggle-right'));
      await page.waitForFunction(() => document.getElementById('left-pane').classList.contains('pane-collapsed')
        && document.getElementById('right-pane').classList.contains('pane-collapsed'));
    }
    await sleep(300);
  };

  test('one row, short rail, no footer or handle, overflow pinned', async ({ page }, testInfo) => {
    const dev = portrait(testInfo);
    test.skip(!dev, 'portrait projects only');
    await load(page);
    const m = await railMetrics(page);
    assertOneRow(m, dev, 'initial');
    expect(await railOccluders(page), 'no rail button (incl. overflow) is covered after the panes are finger-collapsed').toEqual([]);
    expect(m.footer, 'footer hidden').toBe(false);
    expect(m.handle, 'drag handle hidden').toBe(false);
    expect(m.scrollW, 'no horizontal scroll').toBeLessThanOrEqual(m.clientW + 1);
    // every visible tool is a 44 px target
    for (const sel of await page.locator('#tool-bar .tool-btn:visible').evaluateAll((els) => els.map((e) => (e.id ? `#${e.id}` : `.tool-btn[data-tool="${e.dataset.tool}"]`)))) {
      const a = await hitArea(page, sel);
      expect(a.w, `${sel} hit width`).toBeGreaterThanOrEqual(44);
      expect(a.h, `${sel} hit height`).toBeGreaterThanOrEqual(44);
    }
    const ov = await page.evaluate(() => {
      const b = document.getElementById('tool-overflow-btn');
      const r = b.getBoundingClientRect();
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { l: r.left, r: r.right, ok: t === b || b.contains(t), iw: innerWidth };
    });
    expect(ov.l).toBeGreaterThanOrEqual(0);
    expect(ov.r).toBeLessThanOrEqual(ov.iw);
    expect(ov.ok, 'overflow button hit-testable').toBe(true);
    // the canvas region grows by at least 100 px versus the pre-fix value
    expect(m.vc, 'viewport-container grows').toBeGreaterThan(RAIL_BASE[dev].vc + 100);
    await fs.promises.mkdir(EVIDENCE_013, { recursive: true });
    await page.screenshot({ path: `${EVIDENCE_013}/${dev}${/webkit/.test(testInfo.project.name) ? '-webkit' : ''}.png` });
  });

  test('a 12th item (light tool) still fits one row', async ({ page }, testInfo) => {
    const dev = portrait(testInfo);
    test.skip(!dev, 'portrait projects only');
    await load(page);
    await page.evaluate(() => document.getElementById('btn-light-source')?.classList.remove('hidden'));
    const m = await railMetrics(page);
    assertOneRow(m, dev, 'with light tool');
    expect(m.scrollW).toBeLessThanOrEqual(m.clientW + 1);
  });

  test('every drawer tool is reachable and overflow shows pressed when the active tool is off the rail', async ({ page }, testInfo) => {
    const dev = portrait(testInfo);
    test.skip(!dev, 'portrait projects only');
    await load(page);
    const tools = await page.evaluate(() => {
      const defs = window.app.ui.getSharedToolbarDefinitions();
      return window.Vectura.TOOL_DRAWER.categories.flatMap((c) => c.tools.map((t) => {
        const slot = t.id === 'light-source' ? '#btn-light-source'
          : `.tool-btn[data-tool="${(defs[t.id] && defs[t.id].submenuKind) || t.activate.tool || t.id}"]`;
        return { id: t.id, tool: t.activate.tool || null, slot, cat: c.id };
      }));
    });
    expect(tools.length).toBeGreaterThan(15);
    let offRail = 0;
    for (const t of tools) {
      const onRail = await page.evaluate((slot) => {
        const el = document.querySelector(slot);
        if (!el || el.offsetParent === null || el.classList.contains('hidden')) return false;
        const r = el.getBoundingClientRect();
        if (r.left < 0 || r.right > innerWidth) return false;
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return top === el || el.contains(top);
      }, t.slot);
      if (onRail) continue;
      offRail += 1;
      await page.evaluate(() => { window.Vectura.UI.ToolDrawer.close(); window.app.ui.setActiveTool('select'); });
      await tap(page, page.locator('#tool-overflow-btn'));
      const item = page.locator(`.tool-drawer-item[data-tool-id="${t.id}"]`);
      await expect(item, `drawer lists ${t.id}`).toBeVisible();
      await item.evaluate((el) => el.scrollIntoView({ block: 'nearest' })); // TUX-015: the drawer body scrolls inside the viewport
      await tap(page, item);
      if (t.tool) {
        await expect.poll(() => page.evaluate(() => window.app.ui.activeTool), `${t.id} activates`).toBe(t.tool);
        const slotHidden = await page.evaluate((slot) => { const el = document.querySelector(slot); return !el || el.offsetParent === null; }, t.slot);
        if (slotHidden) {
          await page.evaluate(() => window.Vectura.UI.ToolDrawer.close());
          expect(await page.locator('#tool-overflow-btn').getAttribute('aria-pressed'), `${t.id}: overflow pressed`).toBe('true');
        }
      }
    }
    expect(offRail, 'phone layout moves some tools to overflow').toBeGreaterThanOrEqual(dev === 'iPadP' ? 0 : 3);
    // back on a rail tool: no longer pressed
    await page.evaluate(() => { window.Vectura.UI.ToolDrawer.close(); window.app.ui.setActiveTool('select'); });
    expect(await page.locator('#tool-overflow-btn').getAttribute('aria-pressed')).not.toBe('true');
  });

  test('phone: Draw Algorithm in the All Tools drawer opens the algorithm picker (finger only)', async ({ page }, testInfo) => {
    const dev = portrait(testInfo);
    test.skip(dev !== 'iPhP' && dev !== 'iPhP-c', 'phone portrait only (algo-draw is off the phone rail)');
    await load(page);
    expect(await page.evaluate(() => !!document.querySelector('.tool-btn[data-tool="algo-draw"]').closest('.rail-overflowed'))).toBe(true);
    await page.evaluate(() => window.app.ui.setActiveTool('select'));
    await tap(page, page.locator('#tool-overflow-btn'));
    await tap(page, page.locator('.tool-drawer-item[data-tool-id="algo-draw"]'));
    await expect.poll(() => page.evaluate(() => !document.getElementById('algo-draw-picker').classList.contains('hidden')), 'picker opens').toBe(true);
    const inside = await page.evaluate(() => { const r = document.getElementById('algo-draw-picker').getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; });
    expect(inside, 'picker inside the viewport').toBe(true);
    const row = page.locator('.algo-pick-item[data-algo-type="rings"]');
    await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await sleep(50);
    await tap(page, row);
    await expect.poll(() => page.evaluate(() => window.app.renderer.algoDraftType)).toBe('rings');
    expect(await page.evaluate(() => window.app.ui.activeTool)).toBe('algo-draw');
  });

  test('rail adds no top safe-area inset', async ({ page }, testInfo) => {
    const dev = portrait(testInfo);
    test.skip(!dev || !engineSupports(page, 'cdp'), 'Chromium portrait only');
    await load(page);
    try {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 62, bottom: 34 } });
    } catch (e) { /* fall back to the CSSOM check below */ }
    await sleep(200);
    const pt = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('tool-bar')).paddingTop));
    expect(pt).toBeLessThanOrEqual(8);
    const m = await railMetrics(page);
    expect(m.h).toBeLessThanOrEqual(RAIL_BASE[dev].max);
  });
});

test.describe('TUX-013 guards', () => {
  test('touch-wide keeps the floating rail and does not overflow tools', async ({ page }, testInfo) => {
    test.skip(PROJECTS[testInfo.project.name]?.device !== 'iPadL', 'iPad landscape only');
    await page.goto('/');
    await page.waitForSelector('#tool-bar .tool-btn');
    const g = await page.evaluate(() => {
      const rail = document.getElementById('tool-bar');
      const vis = (s) => { const e = rail.querySelector(s); return !!e && e.offsetParent !== null && e.getBoundingClientRect().width > 0; };
      return { pos: getComputedStyle(rail).position, home: vis('.toolbar-home-btn'), pin: vis('.toolbar-pin-btn'),
        label: rail.querySelector('.toolbar-home-btn')?.getAttribute('aria-label'),
        overflowed: rail.querySelectorAll('.rail-overflowed').length };
    });
    expect(g.pos).not.toBe('static');
    // TUX-013 R4 on touch-wide (pin/home visibility) is deferred to TUX-016, whose Requirement 1
    // wants them not visible under touch-ui. Only position, label and no overflow are asserted here.
    expect(g.label).toBe('Reset toolbar position');
    expect(g.overflowed).toBe(0);
  });

  test('phone landscape rail does not get worse (TUX-007 owns the stricter budget)', async ({ page }, testInfo) => {
    test.skip(PROJECTS[testInfo.project.name]?.device !== 'iPhL', 'iPhone landscape only');
    await page.goto('/');
    await page.waitForSelector('#tool-bar .tool-btn');
    await sleep(300);
    const h = await page.evaluate(() => document.getElementById('tool-bar').getBoundingClientRect().height);
    expect(h).toBeLessThanOrEqual(204); // measured pre-fix 874x204
    // The shared phone rule reaches <= 52 here for free; assert it so a regression shows.
    expect(h).toBeLessThanOrEqual(52);
    // Finger-collapse both panes: the 40 px slivers must not cover Select or the overflow button.
    await page.waitForFunction(() => !!document.getElementById('tool-overflow-btn'));
    await tap(page, page.locator('#btn-pane-toggle-left'));
    await tap(page, page.locator('#btn-pane-toggle-right'));
    await page.waitForFunction(() => document.getElementById('left-pane').classList.contains('pane-collapsed')
      && document.getElementById('right-pane').classList.contains('pane-collapsed'));
    await sleep(500); // pane width transition
    expect(await railOccluders(page), 'rail buttons hittable with slivers').toEqual([]);
    await fs.promises.mkdir(EVIDENCE_013, { recursive: true });
    await page.screenshot({ path: `${EVIDENCE_013}/iPhL${/webkit/.test(testInfo.project.name) ? '-webkit' : ''}.png` });
  });
});

// TUX-015: the All Tools drawer fits inside the visible viewport, sits above the rail/panes and
// has finger-sized targets. Bounds use page.viewportSize() (never in-page innerWidth: Chromium iPhP
// inflates it to 544, the proxy trap). The drawer scrolls, so every item is scrolled into view
// programmatically first (WebKit synthetic touches cannot scroll containers).
test.describe('TUX-015 all tools drawer', () => {
  const EVIDENCE_015 = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-015';
  const tapL = (page, t) => tap(page, typeof t === 'string' ? page.locator(t) : t);
  const openDrawer = async (page) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
    await page.waitForSelector('#tool-overflow-btn');
    await sleep(800);
    // On iPadP/iPhL the default open panes cover the rail's right end (a rail/pane layout matter owned
    // by TUX-013/TUX-007). Finger-collapse the panes first, as the TUX-013 spec does, so this block
    // tests the drawer itself. Only when the overflow button is actually covered.
    const covered = () => page.evaluate(() => {
      const r = document.getElementById('tool-overflow-btn').getBoundingClientRect();
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const b = document.getElementById('tool-overflow-btn');
      return !(t && (t === b || b.contains(t)));
    });
    if (await covered()) {
      for (const id of ['#btn-pane-toggle-left', '#btn-pane-toggle-right']) {
        if (await page.locator(id).isVisible()) await tapL(page, id);
      }
      await sleep(600);
    }
    await tapL(page, '#tool-overflow-btn');
    await page.waitForSelector('.tool-drawer:not(.hidden)', { state: 'visible' });
    await sleep(100);
  };
  const inside = (r, b) => r.left >= b.left - 0.5 && r.top >= b.top - 0.5 && r.right <= b.right + 0.5 && r.bottom <= b.bottom + 0.5;
  const shortName = (name) => PROJECTS[name]?.device || name;

  test('drawer fits the viewport, sits on top, and has 44px targets', async ({ page }, testInfo) => {
    await openDrawer(page);
    const V = page.viewportSize();
    const vb = { left: 0, top: 0, right: V.width, bottom: V.height };
    const rect = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }, sel);
    const failures = [];
    const dr = await rect('.tool-drawer');
    if (!inside(dr, vb)) failures.push(`drawer rect ${JSON.stringify(dr)} outside viewport ${V.width}x${V.height}`);

    for (const view of ['grid', 'list']) {
      await tapL(page, `.tool-drawer-view-btn[data-view="${view}"]`);
      await sleep(150);
      await fs.promises.mkdir(EVIDENCE_015, { recursive: true });
      const dr2 = await rect('.tool-drawer');
      if (!inside(dr2, vb)) failures.push(`${view}: drawer rect ${JSON.stringify(dr2)} outside viewport`);
      const count = await page.locator('.tool-drawer-item').count();
      const targets = [];
      for (let i = 0; i < count; i += 1) targets.push({ kind: 'item', i });
      targets.push({ kind: 'toggle', i: 0 }, { kind: 'toggle', i: 1 });
      for (const t of targets) {
        const loc = t.kind === 'item' ? page.locator('.tool-drawer-item').nth(t.i) : page.locator('.tool-drawer-view-btn').nth(t.i);
        await loc.evaluate((el) => el.scrollIntoView({ block: 'nearest' }));
        const info = await loc.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const body = document.querySelector('.tool-drawer-body').getBoundingClientRect();
          const t2 = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return {
            id: el.dataset.toolId || el.dataset.view,
            r: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
            body: { left: body.left, top: body.top, right: body.right, bottom: body.bottom },
            top: !!t2 && (el === t2 || el.contains(t2)),
            topIs: t2 ? `${t2.tagName}#${t2.id}.${String(t2.className).slice(0, 40)}` : null,
          };
        });
        if (!inside(info.r, vb)) failures.push(`${view} ${info.id}: outside viewport ${JSON.stringify(info.r)}`);
        if (t.kind === 'item' && !inside(info.r, info.body)) failures.push(`${view} ${info.id}: outside drawer body`);
        if (!info.top) failures.push(`${view} ${info.id}: covered by ${info.topIs}`);
        const hit = await hitArea(page, loc);
        if (hit.w < 44 || hit.h < 44) failures.push(`${view} ${info.id}: hit area ${hit.w}x${hit.h} < 44`);
      }
      if (view === 'list') {
        const labels = await page.evaluate(() => Array.from(document.querySelectorAll('.tool-drawer-item-label')).map((l) => {
          const cs = getComputedStyle(l);
          return { text: (l.textContent || '').trim(), shown: cs.display !== 'none' && cs.visibility !== 'hidden' };
        }));
        // Regression assertion: labels already render in list view today (verify-first, TUX-015 req 4).
        expect(labels.length).toBeGreaterThan(10);
        expect(labels.filter((l) => !l.text || !l.shown)).toEqual([]);
      }
      await page.screenshot({ path: `${EVIDENCE_015}/${shortName(testInfo.project.name)}-${view}${/webkit/.test(testInfo.project.name) ? '-webkit' : ''}.png` });
    }
    expect(failures).toEqual([]);
  });

  test('tapping an item activates its tool and the drawer stays open', async ({ page }) => {
    await openDrawer(page);
    await tapL(page, '.tool-drawer-view-btn[data-view="list"]');
    const item = page.locator('.tool-drawer-item[data-tool-id="shape-line"]');
    await item.evaluate((el) => el.scrollIntoView({ block: 'nearest' }));
    expect(await page.evaluate(() => window.app.ui.activeTool)).not.toBe('shape-line');
    await tapL(page, item);
    await page.waitForFunction(() => window.app.ui.activeTool === 'shape-line');
    await expect(page.locator('.tool-drawer')).toBeVisible();
  });

  test('finger drag scrolls the drawer body, not the page', async ({ page }) => {
    await openDrawer(page);
    if (!engineSupports(page, 'nativeDefaultActions')) {
      // WebKit synthetic touches cannot scroll containers; the layout half is asserted above.
      expect(await page.locator('.tool-drawer-body').count()).toBe(1);
      return;
    }
    await tapL(page, '.tool-drawer-view-btn[data-view="list"]');
    const s = await page.evaluate(() => {
      const b = document.querySelector('.tool-drawer-body');
      const r = b.getBoundingClientRect();
      return { scrollable: b.scrollHeight > b.clientHeight + 4, x: r.left + r.width / 2, y1: Math.min(r.bottom - 12, innerHeight - 12), y0: Math.max(r.top + 12, 12), sy: window.scrollY, sx: document.scrollingElement.scrollLeft };
    });
    expect(s.scrollable).toBe(true);
    await drag(page, { x: s.x, y: s.y1 }, { x: s.x, y: s.y0 }, { steps: 12, stepDelayMs: 16 });
    await sleep(300);
    const after = await page.evaluate(() => ({ top: document.querySelector('.tool-drawer-body').scrollTop, sy: window.scrollY, sx: document.scrollingElement.scrollLeft }));
    expect(after.top).toBeGreaterThan(0);
    expect(after.sy).toBe(s.sy);
    expect(after.sx).toBe(s.sx);
  });
});

// TUX-016: toolbar footer and drag handles are touch-safe.
// Anchored rail (mobile-layout): no handle, no footer. Floating rail on a coarse pointer
// (iPadL, coarseWide): no footer, handles are 44px, touch-action none, and a finger drag
// follows 1:1 and is never cancelled.
test.describe('TUX-016 footer and handles', () => {
  const EVIDENCE_016 = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-016';
  const ANCHORED = ['touch-ipad-portrait', 'webkit-ipad-portrait', 'touch-iphone-portrait', 'webkit-iphone-portrait', 'touch-iphone-landscape', 'webkit-iphone-landscape', 'touch-iphone-portrait-chrome', 'touch-iphone-landscape-chrome'];
  const FLOATING = ['touch-ipad-landscape', 'webkit-ipad-landscape', 'touch-coarse-wide'];
  const CTX = ['touch-ipad-landscape', 'webkit-ipad-landscape', 'touch-iphone-landscape', 'webkit-iphone-landscape', 'touch-coarse-wide'];
  const FOOTER_BTNS = ['.toolbar-pin-btn', '.toolbar-home-btn', '.toolbar-rotate-btn', '.toolbar-popout-btn'];
  const short = (testInfo) => `${PROJECTS[testInfo.project.name]?.device || testInfo.project.name}${/webkit/.test(testInfo.project.name) ? '-webkit' : ''}`;
  const shot = async (page, testInfo, tag) => {
    await fs.promises.mkdir(EVIDENCE_016, { recursive: true });
    await page.screenshot({ path: `${EVIDENCE_016}/${short(testInfo)}${tag ? `-${tag}` : ''}.png` });
  };
  const load = async (page) => {
    await page.goto('/');
    await page.waitForSelector('#tool-bar .tool-btn');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
    await sleep(500);
  };
  // iPhone landscape opens the side panes over the ctxbar until TUX-008 closes them by default.
  // Fold them with a finger, as the TUX-013 spec does, so the ctxbar handle is reachable.
  const foldPanes = async (page) => {
    for (const [btn, pane] of [['#btn-pane-toggle-left', '#left-pane'], ['#btn-pane-toggle-right', '#right-pane']]) {
      const open = await page.evaluate((p) => { const el = document.querySelector(p); return !!el && !el.classList.contains('pane-collapsed'); }, pane);
      if (open && await page.locator(btn).isVisible()) await tap(page, page.locator(btn));
    }
    await sleep(600);
  };
  const rectOf = (page, sel) => page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }, sel);
  const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const expectNoPageScroll = async (page) => {
    const sc = await page.evaluate(() => ({ y: window.scrollY, top: document.scrollingElement.scrollTop }));
    expect(sc.y, 'window.scrollY').toBe(0);
    expect(sc.top, 'scrollingElement.scrollTop').toBe(0);
  };

  test('anchored rail renders no handle or footer', async ({ page }, testInfo) => {
    test.skip(!ANCHORED.includes(testInfo.project.name), 'floating-rail project');
    await load(page);
    expect(await page.evaluate(() => document.body.classList.contains('mobile-layout'))).toBe(true);
    await expect(page.locator('#tool-bar .toolbar-drag-handle')).toBeHidden();
    await expect(page.locator('#tool-bar .toolbar-footer')).toBeHidden();
    const bad = await page.evaluate(() => {
      const out = [];
      const sels = ['#tool-bar .tool-btn', '#btn-pane-toggle-left', '#btn-pane-toggle-right'];
      sels.forEach((s) => document.querySelectorAll(s).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return;
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return;
        const t = document.elementFromPoint(x, y);
        // Pane/rail overlap is owned by TUX-007/008; this test only forbids the handle or footer on top.
        if (t && t.closest('.toolbar-drag-handle, .toolbar-footer')) out.push(`${s}:${el.dataset.tool || el.id} covered by handle/footer`);
      }));
      return out;
    });
    expect(bad).toEqual([]);
    await shot(page, testInfo, 'anchored');
  });

  test('floating rail: footer gone, handles touch-safe', async ({ page }, testInfo) => {
    test.skip(!FLOATING.includes(testInfo.project.name), 'anchored-rail project');
    await load(page);
    expect(await page.evaluate(() => document.body.classList.contains('mobile-layout'))).toBe(false);
    for (const b of FOOTER_BTNS) await expect(page.locator(`#tool-bar ${b}`), b).toBeHidden();
    await expect(page.locator('.ctxbar.is-visible')).toBeVisible();
    for (const sel of ['.toolbar-drag-handle', '.ctxbar-handle']) {
      expect(await page.locator(sel).first().evaluate((el) => getComputedStyle(el).touchAction), `${sel} touch-action`).toBe('none');
    }
    const th = await hitArea(page, '.tool-bar .toolbar-drag-handle');
    const ch = await hitArea(page, '.ctxbar .ctxbar-handle');
    expect(th.w, `toolbar handle hit ${th.w}x${th.h}`).toBeGreaterThanOrEqual(44);
    expect(th.h, `toolbar handle hit ${th.w}x${th.h}`).toBeGreaterThanOrEqual(44);
    expect(ch.w, `ctxbar handle hit ${ch.w}x${ch.h}`).toBeGreaterThanOrEqual(44);
    expect(ch.h, `ctxbar handle hit ${ch.w}x${ch.h}`).toBeGreaterThanOrEqual(44);
    const neighbours = await page.evaluate(() => {
      const wins = (el) => {
        const r = el.getBoundingClientRect();
        const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!t && (t === el || el.contains(t));
      };
      return { tool: wins(document.querySelector('#tool-bar .tool-btn')), ctx: wins(document.querySelector('.ctxbar .ctxbar-btn')) };
    });
    expect(neighbours).toEqual({ tool: true, ctx: true });
    // Popout stays hidden after docking by a finger drag of the handle to the left edge.
    const vp = await rectOf(page, '#viewport-container');
    const hc = centre(await rectOf(page, '#tool-bar .toolbar-drag-handle'));
    await drag(page, hc, { x: vp.left + 20, y: hc.y }, { steps: 8 });
    await sleep(300);
    expect(await page.evaluate(() => document.getElementById('tool-bar').className)).toMatch(/toolbar-docked-/);
    for (const b of FOOTER_BTNS) await expect(page.locator(`#tool-bar ${b}`), `${b} docked`).toBeHidden();
    await shot(page, testInfo, 'floating-docked');
  });

  const floatToCentre = async (page) => {
    await page.evaluate(() => {
      const tb = document.getElementById('tool-bar');
      const vp = document.getElementById('viewport-container').getBoundingClientRect();
      const sh = tb.offsetParent.getBoundingClientRect();
      const w = tb.offsetWidth;
      const h = tb.offsetHeight;
      // Right side of the canvas: the touch modifier bar sits over the top-centre of the canvas.
      // Right gap 130 keeps the +80 drag outside the 48px snap zone.
      tb.style.left = `${vp.left - sh.left + vp.width - w - 130}px`;
      // The rail is nearly as tall as the canvas on iPadL: balance the gaps so neither the start
      // nor the end of the +40 drag lands inside the 48px dock snap zone.
      tb.style.top = `${vp.top - sh.top + (vp.height - h - 40) / 2}px`;
    });
    expect(await page.evaluate(() => /toolbar-docked/.test(document.getElementById('tool-bar').className))).toBe(false);
  };
  const countEvents = (page, sel) => page.evaluate((s) => {
    const c = (window.__tux016 = { cancel: 0, up: 0 });
    const h = document.querySelector(s);
    h.addEventListener('pointercancel', () => { c.cancel += 1; });
    window.addEventListener('pointercancel', () => { c.cancel += 1; }, true);
    window.addEventListener('pointerup', () => { c.up += 1; }, true);
  }, sel);

  test('toolbar drag follows the finger', async ({ page }, testInfo) => {
    test.skip(!FLOATING.includes(testInfo.project.name), 'anchored-rail project');
    await load(page);
    await floatToCentre(page);
    await countEvents(page, '#tool-bar .toolbar-drag-handle');
    const before = await rectOf(page, '#tool-bar');
    const hc = centre(await rectOf(page, '#tool-bar .toolbar-drag-handle'));
    await drag(page, hc, { x: hc.x + 80, y: hc.y + 40 }, { steps: 10 });
    await sleep(200);
    const after = await rectOf(page, '#tool-bar');
    const ev = await page.evaluate(() => window.__tux016);
    expect(Math.abs(after.left - before.left - 80), `dx ${after.left - before.left}`).toBeLessThanOrEqual(4);
    expect(Math.abs(after.top - before.top - 40), `dy ${after.top - before.top}`).toBeLessThanOrEqual(4);
    expect(await page.evaluate(() => /toolbar-docked/.test(document.getElementById('tool-bar').className))).toBe(false);
    expect(ev.up).toBeGreaterThanOrEqual(1);
    if (engineSupports(page, 'trustedMultiTouch')) expect(ev.cancel, 'pointercancel count').toBe(0);
    await expectNoPageScroll(page);
    await shot(page, testInfo, 'floating-after-drag');
  });

  // Fix round: a finger drag that docks the bar at the top must leave every rail tool reachable
  // (the touch modifier bar used to sit on top of the docked bar and swallow the taps).
  test('top-docked rail tools are not covered', async ({ page }, testInfo) => {
    test.skip(!FLOATING.includes(testInfo.project.name), 'anchored-rail project');
    await load(page);
    const vp = await rectOf(page, '#viewport-container');
    const hc = centre(await rectOf(page, '#tool-bar .toolbar-drag-handle'));
    await drag(page, hc, { x: vp.left + vp.width / 2, y: vp.top + 12 }, { steps: 12 });
    await sleep(500);
    expect(await page.evaluate(() => document.getElementById('tool-bar').className)).toMatch(/toolbar-docked-top/);
    const covered = await page.evaluate(() => {
      const out = [];
      let seen = 0;
      document.querySelectorAll('#tool-bar .tool-btn').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return;
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return;
        seen += 1;
        const t = document.elementFromPoint(x, y);
        if (!t || !(t === el || el.contains(t))) out.push(`${el.dataset.tool}: ${t ? (t.id || t.className) : 'null'}`);
      });
      return { out, seen };
    });
    expect(covered.seen, 'visible rail tools').toBeGreaterThanOrEqual(6);
    expect(covered.out).toEqual([]);
    await shot(page, testInfo, 'docked-top');
  });

  test('ctxbar handle drag follows the finger and never sticks', async ({ page }, testInfo) => {
    test.skip(!CTX.includes(testInfo.project.name), 'ctxbar hidden or not applicable');
    await load(page);
    if (/iphone/.test(testInfo.project.name)) await foldPanes(page);
    await expect(page.locator('.ctxbar.is-visible')).toBeVisible();
    await countEvents(page, '.ctxbar .ctxbar-handle');
    const iph = /iphone/.test(testInfo.project.name);
    const before = await rectOf(page, '.ctxbar');
    const host = await page.evaluate(() => { const b = document.querySelector('.ctxbar'); const h = b.offsetParent || document.body; const r = h.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
    // Pick a vertical direction that fits (the clamp would absorb a delta near an edge).
    const dy0 = iph ? 20 : 40;
    const fitsDown = before.top + before.height + dy0 + 12 < host.bottom;
    const delta = { x: iph ? 60 : 80, y: fitsDown ? dy0 : -dy0 };
    expect(before.left + before.width + delta.x + 12, 'target fits host').toBeLessThan(host.right);
    expect(fitsDown || before.top + delta.y - 12 > host.top, 'target fits host vertically').toBe(true);
    const hc = centre(await rectOf(page, '.ctxbar .ctxbar-handle'));
    await drag(page, hc, { x: hc.x + delta.x, y: hc.y + delta.y }, { steps: 10 });
    await sleep(200);
    const after = await rectOf(page, '.ctxbar');
    const ev = await page.evaluate(() => window.__tux016);
    expect(Math.abs(after.left - before.left - delta.x), `dx ${after.left - before.left}`).toBeLessThanOrEqual(4);
    expect(Math.abs(after.top - before.top - delta.y), `dy ${after.top - before.top}`).toBeLessThanOrEqual(4);
    if (engineSupports(page, 'trustedMultiTouch')) expect(ev.cancel, 'pointercancel count').toBe(0);
    await shot(page, testInfo, 'ctxbar-after-drag');

    // Stuck-state regression: a cancelled handle drag must not capture later touches.
    const h2 = centre(await rectOf(page, '.ctxbar .ctxbar-handle'));
    await touchPhase(page, 'start', [{ ...h2, id: 0 }]);
    await touchPhase(page, 'move', [{ x: h2.x + 5, y: h2.y + 5, id: 0 }]);
    await touchPhase(page, 'move', [{ x: h2.x + 10, y: h2.y + 8, id: 0 }]);
    if (engineSupports(page, 'cdp')) {
      // CDP rejects touchCancel with touch points; the helper's cancel lists them.
      await page.__touchCdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      page.__touchDown.clear();
    } else {
      await touchPhase(page, 'cancel', [{ x: h2.x + 10, y: h2.y + 8, id: 0 }]);
    }
    await sleep(100);
    const rested = await rectOf(page, '.ctxbar');
    const vp = await rectOf(page, '#viewport-container');
    const from = { x: vp.left + vp.width * 0.5, y: vp.top + vp.height * 0.6 };
    await drag(page, from, { x: from.x + 120, y: from.y - 120 }, { steps: 8 });
    await sleep(150);
    const final = await rectOf(page, '.ctxbar');
    expect(Math.abs(final.left - rested.left), `stuck dx ${final.left - rested.left}`).toBeLessThanOrEqual(1);
    expect(Math.abs(final.top - rested.top), `stuck dy ${final.top - rested.top}`).toBeLessThanOrEqual(1);
    await expectNoPageScroll(page);
  });
});
