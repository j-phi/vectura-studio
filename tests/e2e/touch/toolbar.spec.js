const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { PROJECTS } = require('./viewports');
const { tap, longPress, hitArea, touchPhase, engineSupports } = require('../helpers/touch');

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
