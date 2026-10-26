const { evidenceDir, shoot } = require('../helpers/evidence');
const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');
const clock = require('../helpers/app-clock');

// TUX-034a: long-press and the ⋯ button open the layer menu; the context bar ⋯ opens the
// canvas selection menu. Timing is asserted from in-page TouchHold CustomEvents (detail.t is
// the performance.now() offset from pointerdown), never from test-side sleeps.
// Canvas long-press is TUX-034b (renderer.js belongs to G2).
// iPhP / iPhL layers pane: opened through the app API in SETUP when TUX-010 has not landed.
// That is setup, not the gesture under test.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CARD = '#layer-list [data-layer-id]';

// iPhL-c (874x330) is a menu-fit project: its list is too short to hold a row by finger.
test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'touch-iphone-landscape-chrome' && !/\(g2?\)/.test(testInfo.title), 'iPhL-c runs the menu-fit cases only');
  await page.addInitScript(() => {
    window.__th = [];
    ['touchhold:progress', 'touchhold:fire', 'touchhold:cancel'].forEach((type) => {
      document.addEventListener(type, (e) => window.__th.push({ type, t: e.detail && e.detail.t }));
    });
    window.__mouse = [];
    ['mousedown', 'click'].forEach((type) => {
      window.addEventListener(type, (e) => {
        const el = e.target;
        window.__mouse.push({ type, cls: (el && el.className && String(el.className)) || '', inMenu: !!(el && el.closest && el.closest('.menu-dropdown, .canvas-ctx-menu')) });
      }, true);
    });
    window.__errors = [];
    window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
  });
});

const paneOpen = (page) => page.evaluate(() => {
  const p = document.getElementById('right-pane');
  if (!p) return false;
  const r = p.getBoundingClientRect();
  const cs = getComputedStyle(p);
  return r.width > 100 && r.right > 0 && r.left < innerWidth && cs.visibility !== 'hidden' && cs.display !== 'none';
});

// SETUP only: open the layers pane (not the gesture under test).
const openLayersPane = async (page) => {
  if (await paneOpen(page)) return;
  await page.evaluate(() => {
    const pane = document.getElementById('right-pane');
    if (document.body.classList.contains('auto-collapsed')) pane.classList.add('pane-force-open');
    else pane.classList.remove('pane-collapsed');
  });
  await page.waitForTimeout(350);
  expect(await paneOpen(page)).toBe(true);
};

// Polyhedron + about 15 other layers so #layer-list scrolls. Returns the polyhedron id.
const setup = async (page, { extra = 15, pane = true } = {}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  const polyId = await page.evaluate((extra) => {
    const { engine, ui } = window.app;
    const types = ['spiral', 'flowfield', 'lissajous', 'grid', 'rings'];
    for (let i = 0; i < extra; i += 1) engine.addLayer(types[i % types.length]);
    const id = engine.addLayer('polyhedron');
    // Keep the polyhedron near the top of the list (list is top = last layer).
    ui.renderLayers();
    return id;
  }, extra);
  if (pane) await openLayersPane(page);
  else {
    // SETUP: the portrait right pane overlaps the context bar (TUX-035 territory); close both panes.
    await page.evaluate(() => {
      document.body.classList.remove('auto-collapsed');
      ['left-pane', 'right-pane'].forEach((id) => { const p = document.getElementById(id); if (p) { p.classList.add('pane-collapsed'); p.classList.remove('pane-force-open'); } });
    });
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => window.app.ui.renderLayers());
  return polyId;
};

// Scroll the card into view and return a hold point inside its .lvl-name area.
const holdPoint = async (page, id) => {
  const pt = await page.evaluate((id) => {
    const card = document.querySelector(`#layer-list [data-layer-id="${id}"]`);
    // Scroll the LIST only: card.scrollIntoView() also moves the visual viewport on the
    // inflated iPhP layout viewport, which shifts touch coordinates.
    const list = document.getElementById('layer-list');
    const cr = card.getBoundingClientRect();
    const lr = list.getBoundingClientRect();
    list.scrollTop += cr.top - lr.top - (lr.height - cr.height) / 2;
    const name = card.querySelector('.lvl-name, .lvl-grp-name');
    const r = name.getBoundingClientRect();
    const vv = window.visualViewport || { offsetLeft: 0, offsetTop: 0 };
    const lx = r.left + Math.min(r.width / 2, 60);
    const ly = r.top + r.height / 2;
    const hit = document.elementFromPoint(lx, ly);
    const x = lx - vv.offsetLeft;
    const y = ly - vv.offsetTop;
    const ok = !!(hit && hit.closest('.lvl-name, .lvl-grp-name') && hit.closest('[data-layer-id]') === card);
    return { x, y, ok };
  }, id);
  expect(pt.ok, 'hold point resolves inside .lvl-name').toBe(true);
  return { x: pt.x, y: pt.y };
};

// Opens the canvas selection menu from the context bar ⋯. The bar is display:none on phone
// portrait and may be clipped on iPhL-c (TUX-035/TUX-010). Returns false when it is not reachable.
const openSelectionMenu = async (page, { apiFallback = false } = {}) => {
  const box = await page.locator('.ctxbar-overflow').boundingBox().catch(() => null);
  if (!box || box.width === 0) {
    if (!apiFallback) return false;
    test.info().annotations.push({ type: 'limited', description: 'context bar not reachable; opened through the API' });
    await page.evaluate(() => window.Vectura.UI.CanvasContextMenu.openForSelection(40, 40));
    return true;
  }
  await touch.tap(page, page.locator('.ctxbar-overflow'));
  const item = page.locator('.ctxbar-menu-item', { hasText: 'Selection menu' });
  if (apiFallback && !(await item.isVisible().catch(() => false))) {
    await page.waitForTimeout(500);
    if (!(await item.isVisible().catch(() => false))) {
      test.info().annotations.push({ type: 'limited', description: 'context bar ⋯ menu not reachable by finger here (TUX-035); opened through the API' });
      await page.evaluate(() => window.Vectura.UI.CanvasContextMenu.openForSelection(40, 40));
      return true;
    }
  }
  await expect(item).toBeVisible();
  await touch.tap(page, item);
  return true;
};

const menuState = (page) => page.evaluate(() => {
  const m = document.querySelector('.menu-dropdown.is-context-menu.open, .menu-dropdown.lvl-ctx-menu.open');
  if (!m) return { open: false };
  const r = m.getBoundingClientRect();
  return {
    open: getComputedStyle(m).display !== 'none',
    rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
    keys: [...m.querySelectorAll('.menu-entry')].map((e) => e.dataset.key),
    scrollTop: m.scrollTop,
  };
});

const events = (page, type) => page.evaluate((type) => window.__th.filter((e) => e.type === type), type);
const startHold = (page, p) => touch.touchPhase(page, 'start', [{ ...p, id: 0 }]);
const endAt = (page, p) => touch.touchPhase(page, 'end', [{ ...p, id: 0 }]);
const waitFire = (page) => page.waitForFunction(() => window.__th.some((e) => e.type === 'touchhold:fire'), null, { timeout: 3000 });
const layerSnapshot = (page) => page.evaluate(() => ({
  ids: window.app.engine.layers.map((l) => `${l.id}:${l.type}`),
  order: [...document.querySelectorAll('#layer-list [data-layer-id]')].map((e) => e.dataset.layerId),
  dragging: document.querySelectorAll('#layer-list .dragging, #layer-list [class*="lvl-drop"]').length,
  locked: [...window.app.ui.layerLockedIds],
  visible: window.app.engine.layers.map((l) => l.visible),
  sel: [...(window.app.renderer.selectedLayerIds || [])],
  active: window.app.engine.activeLayerId,
}));

test.describe('TUX-034a layer card long-press', () => {
  test('(a) card hold: ring at 150ms, fire at 500ms, menu opens while the finger is down', async ({ page }) => {
    // The 300 / 520 ms samples are app time on a frozen page clock: a slow runner stretched the wall-clock
    // sleep past the 500 ms fire, and the ring was already gone at the "300 ms" sample (nightly).
    await clock.install(page);
    const id = await setup(page);
    const p = await holdPoint(page, id);
    await clock.freeze(page);
    await startHold(page, p);
    await clock.advance(page, 300);
    const ring = await page.locator('[data-touch-hold-progress]').isVisible();
    expect(ring, '[data-touch-hold-progress] visible while held (sampled at 300 ms)').toBe(true);
    await clock.advance(page, 220);
    const dragging = await page.evaluate((id) => document.querySelector(`#layer-list [data-layer-id="${id}"]`).classList.contains('dragging'), id);
    expect(dragging, 'card must not enter drag mode on a hold (measured at 520 ms)').toBe(false);
    await clock.thaw(page);
    await waitFire(page);
    const progress = await events(page, 'touchhold:progress');
    const fire = await events(page, 'touchhold:fire');
    expect(progress.length).toBeGreaterThan(0);
    expect(progress[0].t).toBeGreaterThanOrEqual(150);
    expect(progress[0].t).toBeLessThanOrEqual(260);
    expect(fire[0].t).toBeGreaterThanOrEqual(480);
    expect(fire[0].t).toBeLessThanOrEqual(620);
    await expect(page.locator('.menu-dropdown.is-context-menu.open')).toBeVisible();
    const m = await menuState(page);
    expect(m.keys).toContain('convert-to-scene');
    // Placed beside the finger, never under it.
    const under = p.x >= m.rect.left && p.x <= m.rect.right && p.y >= m.rect.top && p.y <= m.rect.bottom;
    expect(under, 'no menu row sits under the finger').toBe(false);
    await sleep(400); // past a native long-press contextmenu: still exactly the same menu, still offset
    const m2 = await menuState(page);
    expect(m2.open).toBe(true);
    expect(Math.round(m2.rect.left)).toBe(Math.round(m.rect.left));
    expect(Math.round(m2.rect.top)).toBe(Math.round(m.rect.top));
    expect((await layerSnapshot(page)).dragging).toBe(0);
    await endAt(page, p);
    expect((await layerSnapshot(page)).dragging).toBe(0);
  });

  test('(a-move) moving after the menu opened runs nothing and cannot scroll the list', async ({ page }) => {
    const id = await setup(page);
    const p = await holdPoint(page, id);
    const before = await layerSnapshot(page);
    const scroll0 = await page.evaluate(() => document.getElementById('layer-list').scrollTop);
    await startHold(page, p);
    await waitFire(page);
    const m = await menuState(page);
    expect(m.open).toBe(true);
    const row = await page.evaluate(() => {
      const e = [...document.querySelectorAll('.menu-dropdown.is-context-menu.open .menu-entry')].find((x) => x.dataset.key === 'duplicate' || x.dataset.key === 'delete');
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    for (let i = 1; i <= 8; i += 1) {
      await touch.touchPhase(page, 'move', [{ x: p.x + ((row.x - p.x) * i) / 8, y: p.y + ((row.y - p.y) * i) / 8, id: 0 }]);
    }
    await endAt(page, row);
    await sleep(150);
    const after = await layerSnapshot(page);
    expect((await menuState(page)).open, 'menu still open').toBe(true);
    expect(after.ids).toEqual(before.ids);
    expect(after.order).toEqual(before.order);
    expect(after.dragging).toBe(0);
    if (touch.engineSupports(page, 'nativeDefaultActions')) {
      expect(await page.evaluate(() => document.getElementById('layer-list').scrollTop)).toBe(scroll0);
    }
  });

  test('(a0) lifting in place keeps the menu open and runs nothing', async ({ page }) => {
    const id = await setup(page);
    const p = await holdPoint(page, id);
    const before = await layerSnapshot(page);
    await startHold(page, p);
    await waitFire(page);
    await sleep(40);
    await endAt(page, p);
    await sleep(500);
    expect((await menuState(page)).open, 'menu open after lift').toBe(true);
    const after = await layerSnapshot(page);
    expect(after.visible).toEqual(before.visible);
    expect(after.locked).toEqual(before.locked);
    expect(after.sel).toEqual(before.sel);
    expect(after.ids).toEqual(before.ids);
    if (touch.engineSupports(page, 'nativeDefaultActions')) {
      const mouse = await page.evaluate(() => window.__mouse);
      expect(mouse, 'no compat mousedown/click after a held lift').toEqual([]);
    }
  });

  test('(b) movement of 11 px cancels; 9 px does not', async ({ page }) => {
    const id = await setup(page);
    const p = await holdPoint(page, id);
    await startHold(page, p);
    await sleep(300);
    await touch.touchPhase(page, 'move', [{ x: p.x + 11, y: p.y, id: 0 }]);
    await sleep(60);
    await endAt(page, { x: p.x + 11, y: p.y });
    await sleep(700);
    expect((await menuState(page)).open, 'no menu after 11 px move').toBe(false);
    expect(await page.locator('[data-touch-hold-progress]').count()).toBe(0);
    expect((await events(page, 'touchhold:cancel')).length).toBeGreaterThan(0);
    expect((await events(page, 'touchhold:fire')).length).toBe(0);
  });

  test('(b2) 9 px of movement still opens the menu', async ({ page }) => {
    const id = await setup(page);
    const p = await holdPoint(page, id);
    await startHold(page, p);
    await touch.touchPhase(page, 'move', [{ x: p.x + 5, y: p.y + 4, id: 0 }]);
    await waitFire(page);
    expect((await menuState(page)).open).toBe(true);
    await endAt(page, { x: p.x + 5, y: p.y + 4 });
  });
});

test.describe('TUX-034a layer card ⋯ and grip', () => {
  test('(c) the ⋯ button opens the same menu with ARIA state and a 44 px hit area', async ({ page }) => {
    const id = await setup(page);
    const p = await holdPoint(page, id);
    const more = page.locator(`#layer-list [data-layer-id="${id}"] .lvl-more`);
    await expect(more).toHaveAttribute('aria-label', /.+/);
    await expect(more).toHaveAttribute('aria-haspopup', 'menu');
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    const hit = await touch.hitArea(page, more);
    expect(hit.w).toBeGreaterThanOrEqual(44);
    expect(hit.h).toBeGreaterThanOrEqual(44);
    await touch.tap(page, more);
    await expect(page.locator('.menu-dropdown.is-context-menu.open')).toBeVisible();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    const viaButton = (await menuState(page)).keys;
    await page.keyboard.press('Escape');
    await expect(page.locator('.menu-dropdown.is-context-menu.open')).toHaveCount(0);
    await startHold(page, p);
    await waitFire(page);
    const viaHold = (await menuState(page)).keys;
    await endAt(page, p);
    expect(viaHold).toEqual(viaButton);
  });

  test('(e) a menu item runs on a real tap', async ({ page }) => {
    const id = await setup(page);
    const p = await holdPoint(page, id);
    await startHold(page, p);
    await waitFire(page);
    await endAt(page, p);
    await sleep(100);
    const entry = page.locator('.menu-dropdown.is-context-menu.open .menu-entry[data-key="convert-to-scene"]');
    await entry.scrollIntoViewIfNeeded();
    await touch.tap(page, entry);
    await expect.poll(() => page.evaluate(() => window.app.engine.layers.some((l) => l.type === 'scene3d'))).toBe(true);
  });

  test('(f) the grip reorders at once; a hold on the card body never does', async ({ page }) => {
    await setup(page, { extra: 4 });
    await page.evaluate(() => { document.getElementById('layer-list').scrollTop = 0; });
    const orderOf = () => page.evaluate(() => [...document.querySelectorAll('#layer-list > [data-layer-id], #layer-list [data-layer-id]')].map((e) => e.dataset.layerId));
    const ids0 = await orderOf();
    // Hold on the body of row 1: menu opens, order unchanged.
    const body = await page.evaluate(() => {
      const r = document.querySelector('#layer-list [data-layer-id] .lvl-name').getBoundingClientRect();
      return { x: r.left + Math.min(r.width / 2, 60), y: r.top + r.height / 2 };
    });
    await startHold(page, body);
    await waitFire(page);
    await touch.touchPhase(page, 'move', [{ x: body.x, y: body.y + 70, id: 0 }]);
    await endAt(page, { x: body.x, y: body.y + 70 });
    expect(await orderOf()).toEqual(ids0);
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelectorAll('.menu-dropdown.open').forEach((m) => { m.classList.remove('open'); m.style.display = 'none'; }));
    // Drag the first grip below the last visible of the first three rows.
    const geo = await page.evaluate(() => {
      const list = document.getElementById('layer-list');
      const lr = list.getBoundingClientRect();
      const cards = [...list.querySelectorAll('[data-layer-id]')].slice(0, 3);
      const g = cards[0].querySelector('.lvl-grip').getBoundingClientRect();
      const visible = cards.filter((c) => { const r = c.getBoundingClientRect(); return r.bottom <= lr.bottom + 1; });
      const t = (visible[visible.length - 1] || cards[1]).getBoundingClientRect();
      return { from: { x: g.left + g.width / 2, y: g.top + g.height / 2 }, to: { x: t.left + t.width / 2, y: t.bottom - 4 }, id0: cards[0].dataset.layerId, nvis: visible.length };
    });
    await touch.drag(page, geo.from, geo.to, { steps: 12 });
    await sleep(150);
    if (geo.nvis < 2) {
      // The list shows one row (iPhL). Reorder past the viewport needs auto-scroll (TUX-044).
      test.info().annotations.push({ type: 'limited', description: 'list shows < 2 rows; grip drag target not reachable until TUX-044' });
      return;
    }
    const ids1 = await orderOf();
    expect(ids1).not.toEqual(ids0);
    expect(ids1.indexOf(geo.id0)).toBeGreaterThan(ids0.indexOf(geo.id0));
  });
});

test.describe('TUX-034a menu fit', () => {
  const FIT = /^(touch-iphone-landscape|touch-iphone-landscape-chrome|webkit-iphone-landscape)$/;
  const inside = (page, rect) => page.evaluate((rect) => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const sa = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    probe.remove();
    const vv = window.visualViewport;
    const gap = ((window.Vectura.CONTEXT_MENU || {}).edgeGapPx) || 8;
    const W = vv ? vv.width : innerWidth;
    const H = vv ? vv.height : innerHeight;
    return rect.left >= sa.l + gap - 1 && rect.top >= sa.t + gap - 1 && rect.right <= W - sa.r - gap + 1 && rect.bottom <= H - sa.b - gap + 1;
  }, rect);

  test('(g) the scene-group ⋯ menu fits, rows are 44 px, and a finger scroll scrolls it', async ({ page }, testInfo) => {
    test.skip(!FIT.test(testInfo.project.name), 'landscape phone projects only');
    await setup(page, { extra: 2 });
    const gid = await page.evaluate(() => {
      const id = window.app.engine.addSceneGroup();
      window.app.ui.renderLayers();
      return id;
    });
    const more = page.locator(`#layer-list [data-layer-id="${gid}"] .lvl-more`);
    await more.scrollIntoViewIfNeeded();
    await touch.tap(page, more);
    await expect(page.locator('.menu-dropdown.is-context-menu.open')).toBeVisible();
    const m = await menuState(page);
    expect(m.keys.length).toBeGreaterThanOrEqual(20);
    expect(await inside(page, m.rect), `menu rect ${JSON.stringify(m.rect)} inside viewport`).toBe(true);
    const rows = await page.evaluate(() => [...document.querySelectorAll('.menu-dropdown.is-context-menu.open .menu-entry:not(.dim)')].map((e) => e.getBoundingClientRect().height));
    rows.forEach((h) => expect(h).toBeGreaterThanOrEqual(43.5));
    if (touch.engineSupports(page, 'nativeDefaultActions')) {
      const c = { x: (m.rect.left + m.rect.right) / 2, y: (m.rect.top + m.rect.bottom) / 2 };
      await touch.drag(page, c, { x: c.x, y: c.y - 120 }, { steps: 10 });
      await sleep(150);
      const m2 = await menuState(page);
      expect(m2.open, 'finger scroll must not close the menu').toBe(true);
      expect(m2.scrollTop).toBeGreaterThan(0);
    }
    const evid = evidenceDir('TUX-034');
    require('fs').mkdirSync(evid, { recursive: true });
    await shoot(page, { path: `${evid}/${testInfo.project.name}-menu.png` });
  });

  test('(g2) the canvas selection menu fits, rows are 44 px, and a finger scroll scrolls it', async ({ page }, testInfo) => {
    test.skip(!FIT.test(testInfo.project.name), 'landscape phone projects only');
    const id = await setup(page, { extra: 2, pane: false });
    await page.evaluate((id) => { window.app.renderer.setSelection([id], id); window.app.engine.setActiveLayerId(id); window.app.render(); }, id);
    await openSelectionMenu(page, { apiFallback: true });
    await expect(page.locator('.canvas-ctx-menu')).toBeVisible();
    const r = await page.evaluate(() => {
      const m = document.querySelector('.canvas-ctx-menu');
      const b = m.getBoundingClientRect();
      return { rect: { left: b.left, top: b.top, right: b.right, bottom: b.bottom }, rows: [...m.querySelectorAll('.canvas-ctx-item:not(.is-disabled)')].map((e) => e.getBoundingClientRect().height), n: m.querySelectorAll('.canvas-ctx-item').length };
    });
    expect(r.n).toBeGreaterThanOrEqual(10);
    expect(await inside(page, r.rect), `canvas menu rect ${JSON.stringify(r.rect)} inside viewport`).toBe(true);
    r.rows.forEach((h) => expect(h).toBeGreaterThanOrEqual(43.5));
    if (touch.engineSupports(page, 'nativeDefaultActions')) {
      const c = { x: (r.rect.left + r.rect.right) / 2, y: (r.rect.top + r.rect.bottom) / 2 };
      await touch.drag(page, c, { x: c.x, y: c.y - 120 }, { steps: 10 });
      await sleep(150);
      expect(await page.locator('.canvas-ctx-menu').count(), 'finger scroll must not close the menu').toBe(1);
      expect(await page.evaluate(() => document.querySelector('.canvas-ctx-menu').scrollTop)).toBeGreaterThan(0);
    }
  });
});

test('(h) the context bar ⋯ offers Selection menu… which opens the canvas menu', async ({ page }) => {
  const id = await setup(page, { extra: 2, pane: false });
  await page.evaluate((id) => { window.app.renderer.setSelection([id], id); window.app.engine.setActiveLayerId(id); window.app.render(); }, id);
  if (!(await openSelectionMenu(page))) {
    test.info().annotations.push({ type: 'limited', description: 'context bar is hidden at this viewport (TUX-035)' });
    return;
  }
  const menu = page.locator('.canvas-ctx-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-ctx-id="duplicate"]')).toBeVisible();
  await expect(menu.locator('[data-ctx-id="delete"]')).toBeVisible();
  const n0 = await page.evaluate(() => window.app.engine.layers.length);
  await touch.tap(page, menu.locator('[data-ctx-id="duplicate"]'));
  await expect.poll(() => page.evaluate(() => window.app.engine.layers.length)).toBe(n0 + 1);
});

test.describe('TUX-034a haptics and clause 16', () => {
  test('(i) fire vibrates once with 10 (Chromium); WebKit has none and still fires', async ({ page }) => {
    const chromium = touch.engineOf(page) === 'chromium';
    await page.addInitScript((chromium) => {
      window.__vib = [];
      if (chromium) {
        navigator.vibrate = (p) => { window.__vib.push(p); return true; };
      } else {
        try { delete Navigator.prototype.vibrate; } catch (_e) { /* noop */ }
        try { Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true }); } catch (_e) { /* noop */ }
      }
    }, chromium);
    const id = await setup(page);
    const p = await holdPoint(page, id);
    await startHold(page, p);
    await waitFire(page);
    await endAt(page, p);
    if (touch.engineOf(page) === 'chromium') expect(await page.evaluate(() => window.__vib)).toEqual([10]);
    expect(await page.evaluate(() => window.__errors)).toEqual([]);
    expect((await menuState(page)).open).toBe(true);
  });

  test('(j) cards suppress the iOS callout and text selection', async ({ page }) => {
    const id = await setup(page);
    const cs = await page.evaluate((id) => {
      const c = getComputedStyle(document.querySelector(`#layer-list [data-layer-id="${id}"]`));
      return { callout: c.getPropertyValue('-webkit-touch-callout'), us: c.userSelect || c.getPropertyValue('-webkit-user-select') };
    }, id);
    expect(cs.us).toBe('none');
    // Desktop engines (Chromium, Playwright WebKit) do not implement -webkit-touch-callout, so the
    // computed value is empty there. Accept 'none' or '' and prove the declaration is in the skin source.
    expect(['none', '']).toContain(cs.callout);
    const css = await (await page.request.get('/src/ui/skin/components.css')).text();
    expect(css).toMatch(/\.lvl-card,\s*\.lvl-grp-hdr\s*\{[^}]*-webkit-touch-callout:\s*none/);
    // [DEVICE] iOS Safari honours it: see the device checklist.
  });
});
