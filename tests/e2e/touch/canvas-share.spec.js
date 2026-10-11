const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { PROJECTS } = require('./viewports');
const { tap, canvasShare, hitArea, engineSupports } = require('../helpers/touch');

// TUX-007: iPhone landscape keeps a usable canvas, scale stays positive, selection draws.
const EVIDENCE = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-007';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const gotoApp = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
  await sleep(700);
};

// Thresholds by device (percent of the viewport).
const MIN_SHARE = { iPhL: 60, 'iPhL-c': 50 };

// Exact measure: 16 px grid over elementFromPoint (canvas, descendant or the container counts).
const fineShare = (page, W, H) => page.evaluate(({ W, H }) => {
  const canvas = document.getElementById('main-canvas');
  let hits = 0; let n = 0;
  for (let x = 8; x < W; x += 16) {
    for (let y = 8; y < H; y += 16) {
      n += 1;
      const t = document.elementFromPoint(x, y);
      if (t && (t === canvas || canvas.contains(t) || t.id === 'viewport-container')) hits += 1;
    }
  }
  return +(100 * hits / n).toFixed(1);
}, { W, H });

const snapshot = (page) => page.evaluate(() => {
  const r = (id) => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  const rn = window.app.renderer;
  return {
    cls: document.body.className,
    phone: document.body.classList.contains('phone-layout'),
    short: document.body.classList.contains('phone-short'),
    scale: rn.scale,
    offX: rn.offsetX,
    offY: rn.offsetY,
    tool: r('tool-bar'),
    vc: r('viewport-container'),
    ih: window.innerHeight,
    leftOpen: !(document.getElementById('left-pane').classList.contains('pane-collapsed')
      || (document.body.classList.contains('auto-collapsed') && !document.getElementById('left-pane').classList.contains('pane-force-open'))),
    rightOpen: !(document.getElementById('right-pane').classList.contains('pane-collapsed')
      || (document.body.classList.contains('auto-collapsed') && !document.getElementById('right-pane').classList.contains('pane-force-open'))),
    bottomCollapsed: document.getElementById('bottom-pane').classList.contains('bottom-pane-collapsed'),
  };
});

const assertLandscapeContract = async (page, testInfo, min, label) => {
  const vp = page.viewportSize();
  const s = await snapshot(page);
  expect(s.phone, `${label} phone-layout`).toBe(true);
  expect(s.short, `${label} short-phone class`).toBe(true);
  expect(s.leftOpen, `${label} left pane closed`).toBe(false);
  expect(s.rightOpen, `${label} right pane closed`).toBe(false);
  expect(s.bottomCollapsed, `${label} bottom pane collapsed`).toBe(true);
  const coarse = await canvasShare(page);
  const fine = await fineShare(page, vp.width, vp.height);
  testInfo.annotations.push({ type: `TUX-007 ${label} share`, description: `48-cell ${coarse}% (margin ${(coarse - min).toFixed(1)}), 16px ${fine}% (margin ${(fine - min).toFixed(1)}), min ${min}` });
  expect(coarse, `${label} canvasShare ${coarse}`).toBeGreaterThanOrEqual(min);
  expect(fine, `${label} fine share ${fine}`).toBeGreaterThanOrEqual(min);
  expect(s.vc.h, `${label} container height`).toBeGreaterThanOrEqual((min / 100) * vp.height);
  expect(s.tool.h, `${label} rail height`).toBeLessThanOrEqual(52);
  expect(Number.isFinite(s.scale) && s.scale > 0, `${label} scale ${s.scale}`).toBe(true);
  return s;
};

test.describe('TUX-007 phone landscape', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!/iphone-landscape/.test(testInfo.project.name), 'iPhone landscape only');
    await gotoApp(page);
  });

  test('A1 usable canvas', async ({ page }, testInfo) => {
    const dev = PROJECTS[testInfo.project.name].device;
    await assertLandscapeContract(page, testInfo, MIN_SHARE[dev], dev);
    await fs.promises.mkdir(EVIDENCE, { recursive: true });
    const eng = /webkit/.test(testInfo.project.name) ? 'webkit' : 'chromium';
    await page.screenshot({ path: `${EVIDENCE}/${dev}-${eng}-default.png` });
  });

  test('A2 selected layers draw without throwing', async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const run = (squeeze) => page.evaluate((squeeze) => {
      try {
        const app = window.app;
        const rn = app.renderer;
        if (squeeze) {
          // The real bug path: ResizeObserver -> resize() -> center() on a container squeezed to 20 px.
          const vc = document.getElementById('viewport-container');
          vc.style.flex = '0 0 auto';
          vc.style.height = '20px';
          rn.userHasManipulated = false;
          rn.resize();
        }
        const id = app.engine.addLayer('text');
        const l = app.engine.layers.find((x) => x.id === id);
        rn.setSelection([id], id);
        rn.activeTool = 'select';
        rn.draw();
        // 3-anchor pen path: draft preview, then commit, then direct-select so anchors and handles draw.
        rn.activeTool = 'pen';
        rn.penDraft = { anchors: [
          { x: 40, y: 40, in: null, out: { x: 60, y: 30 } },
          { x: 100, y: 60, in: { x: 90, y: 40 }, out: { x: 110, y: 80 } },
          { x: 60, y: 100, in: null, out: null },
        ], closed: false };
        rn.penPreview = { x: 70, y: 110 };
        rn.draw();
        rn.commitPenPath();
        const pathLayer = app.engine.layers[app.engine.layers.length - 1];
        rn.setSelection([pathLayer.id], pathLayer.id);
        rn.activeTool = 'direct';
        rn.setDirectSelection(pathLayer, 0);
        rn.draw();
        return { ok: true, scale: rn.scale, text: !!l };
      } catch (e) { return { ok: false, message: String(e && e.message) }; }
    }, squeeze);
    const natural = await run(false);
    expect(natural, JSON.stringify(natural)).toMatchObject({ ok: true });
    const squeezed = await run(true);
    expect(squeezed, `squeezed container: ${JSON.stringify(squeezed)}`).toMatchObject({ ok: true });
    expect(squeezed.scale).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('A3 rotation', async ({ page }, testInfo) => {
    const dev = PROJECTS[testInfo.project.name].device;
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const land = { width: 874, height: dev === 'iPhL' ? 402 : 330 };
    const port = { width: 402, height: dev === 'iPhL' ? 874 : 750 };
    await page.setViewportSize(port);
    await sleep(500);
    const p0 = await snapshot(page);
    expect(p0.scale).toBeGreaterThan(0);
    await page.setViewportSize(land);
    await sleep(600);
    await assertLandscapeContract(page, testInfo, MIN_SHARE[dev], `${dev} rotated`);
    await page.setViewportSize(port);
    await sleep(600);
    const p1 = await snapshot(page);
    expect(p1.phone).toBe(true);
    expect(p1.short).toBe(false);
    expect(p1.scale).toBeGreaterThan(0);
    for (const k of ['x', 'y', 'w', 'h']) expect(Math.abs(p1.tool[k] - p0.tool[k]), `portrait rail ${k}`).toBeLessThanOrEqual(2);
    // Second variant: manipulated view, then rotate.
    await page.evaluate(() => {
      const rn = window.app.renderer;
      rn.scale *= 1.5; rn.userHasManipulated = true; rn.draw();
    });
    await page.setViewportSize(land);
    await sleep(600);
    const m = await snapshot(page);
    expect(Number.isFinite(m.scale) && m.scale > 0).toBe(true);
    expect(Number.isFinite(m.offX) && Number.isFinite(m.offY)).toBe(true);
    const inter = await page.evaluate(() => {
      const rn = window.app.renderer;
      rn.center();
      rn.draw();
      const p = window.app.engine.currentProfile;
      const c = rn.canvas.getBoundingClientRect();
      const x0 = rn.offsetX; const y0 = rn.offsetY; const x1 = x0 + p.width * rn.scale; const y1 = y0 + p.height * rn.scale;
      return x1 > 0 && y1 > 0 && x0 < c.width && y0 < c.height;
    });
    expect(inter, 'paper intersects canvas after center()').toBe(true);
    expect(errors).toEqual([]);
  });

  test('A4 class boundary', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'touch-iphone-landscape', 'Chromium iPhL only');
    await page.setViewportSize({ width: 874, height: 499 });
    await sleep(600);
    await assertLandscapeContract(page, testInfo, 60, '499');
    await page.setViewportSize({ width: 874, height: 500 });
    await sleep(600);
    const s = await snapshot(page);
    expect(s.short).toBe(false);
    const want = await page.evaluate(() => {
      const C = window.Vectura.LayoutClassifier;
      return { layout: C.classify(C.readInput()), short: C.isShort(C.readInput()) };
    });
    expect(want.short).toBe(false);
    expect(await page.evaluate(() => document.body.dataset.layout)).toBe(want.layout);
  });

  test('A5 reachability', async ({ page }, testInfo) => {
    const vp = page.viewportSize();
    const mods = page.locator('#touch-modifier-bar .touch-mod-btn');
    const n = await mods.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i += 1) {
      const b = mods.nth(i);
      if (!(await b.isVisible())) continue;
      const a = await hitArea(page, b);
      expect(a.w >= 44 && a.h >= 44, `modifier ${i} hit ${a.w}x${a.h}`).toBe(true);
    }
    // (d) no covered tool or ctxbar buttons.
    const covered = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('#tool-bar .tool-btn, .ctxbar button').forEach((b) => {
        const r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const cs = getComputedStyle(b);
        if (cs.visibility === 'hidden' || cs.display === 'none') return;
        // Skip buttons scrolled out of their clipping rail; they are reachable by scrolling.
        let p = b.parentElement; let clipped = false;
        const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
        while (p && p !== document.body) {
          const pr = p.getBoundingClientRect();
          if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowX) && (cx < pr.left || cx > pr.right)) { clipped = true; break; }
          p = p.parentElement;
        }
        if (clipped || cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return;
        const t = document.elementFromPoint(cx, cy);
        if (!t || !(t === b || b.contains(t))) out.push(`${b.dataset.tool || b.className}:${t && (t.id || t.className)}`);
      });
      return out;
    });
    expect(covered, 'covered tool/ctxbar buttons').toEqual([]);
    // (b) bottom pane opens with ONE tap on a >= 44x44 control.
    const toggle = page.locator('#btn-pane-toggle-bottom');
    const area = await hitArea(page, toggle);
    expect(area.w >= 44 && area.h >= 44, `bottom toggle hit ${area.w}x${area.h}`).toBe(true);
    await tap(page, toggle);
    await sleep(500);
    expect(await page.evaluate(() => document.getElementById('bottom-pane').classList.contains('bottom-pane-collapsed'))).toBe(false);
    await page.evaluate(() => document.getElementById('bottom-pane').classList.add('bottom-pane-collapsed'));
    // (c) reachable tool count: the rail buttons plus All Tools. The drawer lists every tool, so its item
    // count on iPhL must equal the count on iPhP (402x874); the rail itself only adds quick access.
    const overflow = page.locator('#tool-overflow-btn');
    const oa = await hitArea(page, overflow);
    // The 44 px button sits on a half pixel (header 43.5 px), so the 2 px probe grid reads 43.
    expect(oa.w >= 43 && oa.h >= 43, `All Tools hit ${oa.w}x${oa.h}`).toBe(true);
    const railCount = await page.evaluate(() => new Set([...document.querySelectorAll('#tool-bar .tool-btn[data-tool]')]
      .filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.dataset.tool)).size);
    expect(railCount).toBeGreaterThan(0);
    const drawerCount = async () => {
      await page.evaluate(() => window.Vectura.UI.ToolDrawer.close());
      await tap(page, page.locator('#tool-overflow-btn'));
      await page.waitForSelector('.tool-drawer:not(.hidden)', { state: 'visible' });
      const n = await page.locator('.tool-drawer-item').count();
      await page.evaluate(() => window.Vectura.UI.ToolDrawer.close());
      return n;
    };
    const landCount = await drawerCount();
    await page.setViewportSize({ width: 402, height: 874 });
    await sleep(700);
    const portCount = await drawerCount();
    await page.setViewportSize(vp);
    await sleep(700);
    expect(landCount, 'All Tools lists the same tools as iPhP').toBe(portCount);
    expect(landCount).toBeGreaterThan(0);
    // (e) zoom readout.
    const z = await page.evaluate(() => {
      const rn = window.app.renderer;
      const el = document.getElementById('hud-zoom');
      const vis = !!el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden';
      return { scale: rn.scale, text: el ? el.textContent : '', vis };
    });
    expect(z.scale).toBeGreaterThan(0);
    if (z.vis) {
      expect(z.text).toMatch(/^\d+%$/);
      expect(z.text).not.toBe('0%');
    }
    testInfo.annotations.push({ type: 'TUX-007 A5', description: `railTools=${railCount} drawer=${landCount} zoom=${z.text} vis=${z.vis}` });
  });

  test('A6 persisted toolbar state', async ({ page, browser }, testInfo) => {
    const dev = PROJECTS[testInfo.project.name].device;
    await page.evaluate(() => {
      const S = window.Vectura.SETTINGS;
      S.toolbarHorizontal = true; S.toolbarDock = 'left'; S.toolbarX = 120; S.toolbarY = 90;
      window.app.persistPreferences({ force: true });
    });
    // What the user saved on a desktop session: capture before the phone reload can rewrite it.
    const stored = await page.evaluate(() => ({ ls: JSON.stringify(Object.assign({}, localStorage)) }));
    await page.reload();
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
    await sleep(800);
    await assertLandscapeContract(page, testInfo, MIN_SHARE[dev], `${dev} persisted`);
    if (testInfo.project.name !== 'touch-iphone-landscape') return;
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const d = await ctx.newPage();
    await d.addInitScript((s) => { try { Object.entries(JSON.parse(s.ls)).forEach(([k, v]) => localStorage.setItem(k, v)); } catch (e) { /* ignore */ } }, stored);
    await d.goto(page.url());
    await d.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
    await sleep(800);
    const desk = await d.evaluate(() => ({
      ls: Object.keys(localStorage).join(','),
      mobile: document.body.classList.contains('mobile-layout'),
      short: document.body.classList.contains('phone-short'),
      scale: window.app.renderer.scale,
      horiz: window.Vectura.SETTINGS.toolbarHorizontal,
      dock: window.Vectura.SETTINGS.toolbarDock,
    }));
    await ctx.close();
    expect(desk.mobile).toBe(false);
    expect(desk.short).toBe(false);
    expect(desk.scale).toBeGreaterThan(0);
    expect(desk.horiz, 'saved desktop orientation restored').toBe(true);
    expect(desk.dock, 'saved desktop dock restored').toBe('left');
    testInfo.annotations.push({ type: 'TUX-007 A6 desktop', description: JSON.stringify(desk) });
  });

  test('A7 modifier column clears the landscape insets and Pan stays tappable', async ({ page }, testInfo) => {
    // Playwright WebKit cannot emulate env(safe-area-inset-*), so both engines inject the --safe-* tokens.
    const INS = { left: 62, right: 62, bottom: 21 };
    await page.evaluate((v) => {
      const st = document.documentElement.style;
      st.setProperty('--safe-left', `${v.left}px`);
      st.setProperty('--safe-right', `${v.right}px`);
      st.setProperty('--safe-bottom', `${v.bottom}px`);
    }, INS);
    const vp0 = page.viewportSize();
    const heights = [vp0.height, 330];
    for (const h of heights) {
      await page.setViewportSize({ width: vp0.width, height: h });
      await sleep(600);
      const m = await page.evaluate(() => {
        const bar = document.getElementById('touch-modifier-bar');
        const btns = [...document.querySelectorAll('#touch-modifier-bar .touch-mod-btn')]
          .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
          .map((b) => { const r = b.getBoundingClientRect(); return { id: b.dataset.mod || b.id || b.textContent.trim(), l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; });
        return { W: innerWidth, H: innerHeight, shown: !!bar && getComputedStyle(bar).display !== 'none', btns };
      });
      expect(m.shown, `modifier bar shown at ${h}`).toBe(true);
      expect(m.btns.length, `modifier buttons at ${h}`).toBeGreaterThanOrEqual(5);
      for (const b of m.btns) {
        const tag = `${b.id} at ${m.W}x${m.H}`;
        expect(b.l, `${tag} left`).toBeGreaterThanOrEqual(INS.left - 0.5);
        expect(b.r, `${tag} right`).toBeLessThanOrEqual(m.W - INS.right + 0.5);
        expect(b.t, `${tag} top`).toBeGreaterThanOrEqual(0);
        expect(b.b, `${tag} bottom ${b.b} vs ${m.H - INS.bottom}`).toBeLessThanOrEqual(m.H - INS.bottom + 0.5);
        expect(b.w >= 44 && b.h >= 44, `${tag} size ${b.w}x${b.h}`).toBe(true);
      }
      // Pan reachable by a real finger tap: the centre is uncovered and the tap lands on the button.
      const pan = page.locator('#touch-modifier-bar .touch-mod-btn').filter({ hasText: /pan/i }).first();
      await expect(pan).toBeVisible();
      const hit = await pan.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!t && (t === el || el.contains(t));
      });
      expect(hit, `Pan centre uncovered at ${h}`).toBe(true);
      const panState = () => page.evaluate(() => ({
        active: [...document.querySelectorAll('#touch-modifier-bar .touch-mod-btn')].some((b) => /pan/i.test(b.textContent) && b.classList.contains('active')),
        setting: !!(window.Vectura.SETTINGS.touchModifiers || {}).pan,
      }));
      const before = await panState();
      expect(before, `Pan starts off at ${h}`).toEqual({ active: false, setting: false });
      await tap(page, pan);
      await sleep(150);
      expect(await panState(), `tap toggled Pan on at ${h}`).toEqual({ active: true, setting: true });
      await tap(page, pan);
      await sleep(150);
      expect(await panState(), `second tap cleared Pan at ${h}`).toEqual({ active: false, setting: false });
      testInfo.annotations.push({ type: 'TUX-007 A7', description: `${m.W}x${m.H} ${m.btns.length} modifier buttons, max bottom ${Math.max(...m.btns.map((b) => b.b))} <= ${m.H - INS.bottom}` });
    }
  });

  test('A9 formula chip chevron and expanded sheet clear the modifier column', async ({ page }, testInfo) => {
    const vp0 = page.viewportSize();
    for (const h of [vp0.height, 330]) {
      await page.setViewportSize({ width: vp0.width, height: h });
      await sleep(600);
      const rot = () => page.evaluate(() => {
        const t = document.querySelector('#bottom-pane .pane-toggle-bottom');
        const m = new DOMMatrix(getComputedStyle(t).transform === 'none' ? 'matrix(1,0,0,1,0,0)' : getComputedStyle(t).transform);
        return { collapsed: document.getElementById('bottom-pane').classList.contains('bottom-pane-collapsed'), deg: Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI) };
      });
      let r = await rot();
      if (!r.collapsed) { await page.evaluate(() => document.getElementById('btn-pane-toggle-bottom').click()); await sleep(400); r = await rot(); }
      expect(r.collapsed, `chip collapsed at ${h}`).toBe(true);
      expect(Math.abs(r.deg), `collapsed chevron rotated 180 at ${h}`).toBe(180);
      await tap(page, page.locator('#btn-pane-toggle-bottom'));
      await sleep(500);
      r = await rot();
      expect(r.collapsed, `sheet expanded at ${h}`).toBe(false);
      expect(r.deg, `expanded chevron not rotated at ${h}`).toBe(0);
      const bad = await page.evaluate(() => {
        const out = [];
        const pane = document.getElementById('bottom-pane');
        const leaves = [...pane.querySelectorAll('*')].filter((e) => !e.children.length && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== 'hidden');
        for (const e of leaves) {
          const b = e.getBoundingClientRect();
          const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          if (!t || !pane.contains(t)) out.push(`pane:${e.id || e.className || e.tagName}`);
        }
        for (const e of document.querySelectorAll('#touch-modifier-bar .touch-mod-btn')) {
          const b = e.getBoundingClientRect();
          if (!b.width) continue;
          const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          if (!t || !(t === e || e.contains(t))) out.push(`mod:${e.textContent.trim()}`);
        }
        return out;
      });
      expect(bad, `covered elements with sheet open at ${h}`).toEqual([]);
      await tap(page, page.locator('#btn-pane-toggle-bottom'));
      await sleep(400);
      testInfo.annotations.push({ type: 'TUX-007 A9', description: `${vp0.width}x${h} ok` });
    }
  });
});

test.describe('TUX-007 reachable-set accounting (TUX-058 baseline lowering)', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!/iphone-landscape/.test(testInfo.project.name), 'iPhone landscape only');
  });

  // Targets that left the default reachable set when the baseline went 35 -> 24 must each keep a finger
  // route: tools via All Tools, header menus via the hamburger, pane contents via the pane toggles.
  test('A8 every target that left the default set keeps a finger route', async ({ page }) => {
    await gotoApp(page);
    await sleep(500);
    // Tools that left the rail: reachable in All Tools.
    await tap(page, page.locator('#tool-overflow-btn'));
    await page.waitForSelector('.tool-drawer:not(.hidden)', { state: 'visible' });
    const drawerTools = await page.evaluate(() => [...document.querySelectorAll('.tool-drawer-item')].map((b) => b.dataset.tool || b.textContent.trim()));
    const joined = drawerTools.join('|').toLowerCase();
    for (const t of ['lasso', 'draw algorithm', 'hand', 'scissor line']) expect(joined, `All Tools lists ${t}: ${drawerTools}`).toContain(t);
    await page.evaluate(() => window.Vectura.UI.ToolDrawer.close());
    // Header menus (File/Edit/Object/View/Insert/Help) and the theme toggle (its Theme row): reachable through the hamburger.
    await tap(page, page.locator('#btn-menu-hamburger'));
    await sleep(300);
    const menuIds = await page.evaluate(() => ['#btn-menu-file', '#btn-menu-edit', '#btn-menu-object', '#btn-menu-view', '#btn-menu-insert', '#btn-menu-help', '#top-menubar .top-menu-theme-row']
      .map((s) => { const el = document.querySelector(s); if (!el) return [s, 'missing']; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); const hit = r.width > 1 && r.height > 1 ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null; return [s, !!hit && (hit === el || el.contains(hit))]; }));
    for (const [s, ok] of menuIds) expect(ok, `${s} reachable after the hamburger opens`).toBe(true);
    await page.keyboard.press('Escape');
    await page.evaluate(() => { const h = document.getElementById('btn-menu-hamburger'); if (h && h.getAttribute('aria-expanded') === 'true') h.click(); });
    // Right pane contents: the pane toggle opens the pane and its controls become reachable.
    // TUX-010: a phone opens the Layers drawer from the header button; the closed sliver toggle is gone.
    await tap(page, page.locator('#btn-header-pane-right:visible, #btn-pane-toggle-right:visible').first());
    await sleep(500);
    const pane = await page.evaluate(() => ['#right-pane-tabs .right-pane-tab[data-tab="layers"]', '#right-pane-tabs .right-pane-tab[data-tab="pens"]', '#layer-search-input', '#layer-filter-btn', '#btn-add-layer']
      .map((s) => { const el = document.querySelector(s); if (!el) return [s, 'missing']; const r = el.getBoundingClientRect(); const hit = r.width > 1 && r.height > 1 ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null; return [s, !!hit && (hit === el || el.contains(hit))]; }));
    for (const [s, ok] of pane) expect(ok, `${s} reachable after the right pane opens`).toBe(true);
  });
});
void engineSupports;

// ---------------------------------------------------------------------------------------------
// TUX-008: pane defaults per layout class. Finger-only (tap()); setup through the app API is
// fixture state only (adding and selecting a layer).
// ---------------------------------------------------------------------------------------------
const EVIDENCE_008 = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-008';
const shot008 = async (page, name) => {
  await fs.promises.mkdir(EVIDENCE_008, { recursive: true });
  await page.screenshot({ path: `${EVIDENCE_008}/${name}.png` });
};

// Both sides: open per the controller API (geometry fallback), rect width, and docked.
const paneState = (page) => page.evaluate(() => {
  const ps = window.Vectura && window.Vectura.UI && window.Vectura.UI.Workspace && window.Vectura.UI.Workspace.paneState;
  const one = (side) => {
    const el = document.getElementById(`${side}-pane`);
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const geom = r.width > 60 && cs.visibility !== 'hidden' && r.right > 0 && r.left < innerWidth;
    return {
      open: ps && typeof ps.isOpen === 'function' ? ps.isOpen(side) : geom,
      api: !!(ps && typeof ps.isOpen === 'function'),
      width: r.width,
      left: r.left,
      right: r.right,
      visibility: cs.visibility,
      docked: cs.position !== 'absolute' && cs.position !== 'fixed',
      force: el.classList.contains('pane-force-open'),
      cls: el.className,
    };
  };
  return { left: one('left'), right: one('right') };
});

const backdropVisible = (page) => page.evaluate(() => {
  const b = document.getElementById('mobile-pane-backdrop');
  return !!b && b.classList.contains('visible');
});

// The topmost element at (x, y) as a short label, plus whether it is the canvas or its container.
const topAt = (page, x, y) => page.evaluate(({ x, y }) => {
  const t = document.elementFromPoint(x, y);
  const vc = document.getElementById('viewport-container');
  return {
    id: t && (t.id || t.className || t.tagName),
    canvas: !!t && (t.id === 'main-canvas' || (!!vc && vc.contains(t))),
    inPane: !!t && !!t.closest('#left-pane, #right-pane'),
  };
}, { x, y });

// Fixture: one layer, selected, so the context bar is populated. Returns the screen centre of its bbox.
const addAndSelectLayer = (page) => page.evaluate(() => {
  const app = window.app;
  const id = app.engine.addLayer('lissajous');
  const rn = app.renderer;
  rn.setSelection([id], id);
  rn.activeTool = 'select';
  rn.draw();
  const layer = app.engine.layers.find((l) => l.id === id);
  const b = rn.getSelectionBounds([layer]);
  const c = rn.canvas.getBoundingClientRect();
  if (!b) return null;
  const x0 = b.minX ?? b.x; const y0 = b.minY ?? b.y;
  const x1 = b.maxX ?? (b.x + b.width); const y1 = b.maxY ?? (b.y + b.height);
  const p = rn.worldToScreen((x0 + x1) / 2, (y0 + y1) / 2);
  return { x: c.left + p.x, y: c.top + p.y };
});

// Visible tool-rail and ctxbar buttons whose centre is on screen and not scrolled out of a clipping rail.
const coverReport = (page) => page.evaluate(() => {
  const out = [];
  document.querySelectorAll('#tool-bar .tool-btn, .ctxbar button').forEach((b) => {
    const r = b.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const cs = getComputedStyle(b);
    if (cs.visibility === 'hidden' || cs.display === 'none') return;
    const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
    let p = b.parentElement; let clipped = false;
    while (p && p !== document.body) {
      const pcs = getComputedStyle(p);
      if (pcs.display === 'none' || pcs.visibility === 'hidden') { clipped = true; break; }
      const pr = p.getBoundingClientRect();
      if (/(auto|scroll|hidden)/.test(pcs.overflowX) && (cx < pr.left || cx > pr.right)) { clipped = true; break; }
      p = p.parentElement;
    }
    if (clipped || cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return;
    const t = document.elementFromPoint(cx, cy);
    out.push({
      label: b.dataset.tool || b.getAttribute('aria-label') || b.className,
      ok: !!t && (t === b || b.contains(t)),
      inPane: !!t && !!t.closest('#left-pane, #right-pane'),
      top: t && (t.id || t.className || t.tagName),
    });
  });
  return out;
});

const gotoFresh = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
  await sleep(800);
};

const devOf = (testInfo) => PROJECTS[testInfo.project.name].device;

test.describe('pane defaults (TUX-008)', () => {
  test('A starts closed on tablet and phone', async ({ page }, testInfo) => {
    const dev = devOf(testInfo);
    test.skip(!['iPadP', 'iPhP', 'iPhL', 'iPhP-c', 'iPhL-c'].includes(dev), 'drawer layouts only');
    await gotoFresh(page);
    const s = await paneState(page);
    expect(s.left.api && s.right.api, 'Workspace.paneState.isOpen exists').toBe(true);
    expect(s.left.force, 'left pane-force-open').toBe(false);
    expect(s.right.force, 'right pane-force-open').toBe(false);
    expect(s.left.open, 'left isOpen').toBe(false);
    expect(s.right.open, 'right isOpen').toBe(false);
    expect(await backdropVisible(page), 'backdrop hidden').toBe(false);
    if (dev === 'iPadP') {
      const vp = page.viewportSize();
      const share = await canvasShare(page);
      testInfo.annotations.push({ type: 'TUX-008 A share', description: `${dev} ${testInfo.project.name} canvasShare ${share}%` });
      expect(share, `iPadP canvasShare ${share}`).toBeGreaterThanOrEqual(70);
      for (const side of ['left', 'right']) {
        const p = s[side];
        const gone = p.width === 0 || p.visibility === 'hidden' || p.right <= 0 || p.left >= vp.width;
        expect(gone, `${side} closed pane has no footprint (width ${p.width}, ${p.visibility}, ${p.left}..${p.right})`).toBe(true);
      }
      for (const x of [2, 20, 38, vp.width - 38, vp.width - 20, vp.width - 2]) {
        const t = await topAt(page, x, vp.height / 2);
        expect(t.canvas, `x=${x} mid-height is canvas, got ${t.id}`).toBe(true);
      }
      await shot008(page, `iPadP-${/webkit/.test(testInfo.project.name) ? 'webkit' : 'chromium'}-closed`);
    }
    // Phone canvas share is owned by TUX-007 (iPhL >= 60, iPhL-c >= 50) and TUX-001/013 (iPhP);
    // tracked by the TUX-058 ratchet.
    if (dev === 'iPhP' || dev === 'iPhL') await shot008(page, `${dev}-${/webkit/.test(testInfo.project.name) ? 'webkit' : 'chromium'}`);
  });

  for (const stage of ['on load', 'with a layer selected']) {
    test(`B no pane covers tools or ctxbar (${stage})`, async ({ page }, testInfo) => {
      const dev = devOf(testInfo);
      const phone = /^iPh/.test(dev);
      await gotoFresh(page);
      let bbox = null;
      if (stage !== 'on load') {
        bbox = await addAndSelectLayer(page);
        await sleep(500);
      }
      const rep = await coverReport(page);
      expect(rep.length, 'some tool buttons are checked').toBeGreaterThan(0);
      if (phone) {
        const hit = rep.filter((r) => r.inPane).map((r) => `${r.label}<-${r.top}`);
        expect(hit, 'phone: tools/ctxbar under a pane').toEqual([]);
      } else {
        const bad = rep.filter((r) => !r.ok).map((r) => `${r.label}<-${r.top}`);
        expect(bad, 'covered tool/ctxbar buttons').toEqual([]);
        if (bbox && (dev === 'iPadP' || dev === 'iPadL')) {
          const t = await topAt(page, bbox.x, bbox.y);
          expect(t.inPane, `JRN-011 selected layer centre (${Math.round(bbox.x)},${Math.round(bbox.y)}) sits under a pane`).toBe(false);
        }
      }
    });
  }

  test('C touch-wide docks and collapses by tap', async ({ page }, testInfo) => {
    const dev = devOf(testInfo);
    test.skip(!['iPadL', 'coarseWide'].includes(dev), 'touch-wide only');
    // Real RED/GREEN test. Measured RED on iPadL before TUX-008: 37.9 % docked (panes were unclamped), so the
    // >= 45 floor failed. After the dock caps: 46.1 docked / 61.4 left collapsed / 75.5 both collapsed.
    await gotoFresh(page);
    // Effective caps for this width: narrow caps below roomyMinWidth, roomy caps above (TOUCH_LAYOUT).
    const caps = await page.evaluate(() => {
      const TL = window.Vectura.TOUCH_LAYOUT;
      const roomy = innerWidth >= TL.roomyMinWidth;
      return roomy ? { left: TL.maxDockedRoomyPaneWidth, right: TL.maxDockedRoomyPaneWidth } : { left: TL.maxDockedPaneWidth, right: Math.min(TL.maxDockedPaneWidth, TL.maxDockedRightPaneWidth) };
    });
    const max = caps.left;
    const maxRight = caps.right;
    expect(max, 'TOUCH_LAYOUT.maxDockedPaneWidth').toBeGreaterThan(0);
    let s = await paneState(page);
    for (const side of ['left', 'right']) {
      expect(s[side].docked, `${side} docked`).toBe(true);
      expect(s[side].open, `${side} open`).toBe(true);
      expect(s[side].width, `${side} width <= max`).toBeLessThanOrEqual((side === 'right' ? maxRight : max) + 0.5);
    }
    const vp = page.viewportSize();
    const area = await page.evaluate(() => { const r = document.getElementById('viewport-container').getBoundingClientRect(); return r.width * r.height; });
    expect(100 * area / (vp.width * vp.height), 'container area share').toBeGreaterThanOrEqual(45);
    const s0 = await canvasShare(page);
    expect(s0, `share ${s0}`).toBeGreaterThanOrEqual(45);
    await shot008(page, `${dev}-docked`);
    const prefBefore = await page.evaluate(() => ({ l: window.Vectura.SETTINGS.leftPaneCollapsed, r: window.Vectura.SETTINGS.rightPaneCollapsed }));
    await tap(page, page.locator('#btn-pane-toggle-left'));
    await sleep(400);
    const s1 = await canvasShare(page);
    expect(s1, `left collapsed share ${s1}`).toBeGreaterThanOrEqual(60);
    await tap(page, page.locator('#btn-pane-toggle-right'));
    await sleep(400);
    const s2 = await canvasShare(page);
    expect(s2, `both collapsed share ${s2}`).toBeGreaterThanOrEqual(75);
    await shot008(page, `${dev}-collapsed`);
    // touch-wide persists to its own keys; the desktop keys stay put.
    const prefAfter = await page.evaluate(() => {
      const S = window.Vectura.SETTINGS;
      return { l: S.leftPaneCollapsed, r: S.rightPaneCollapsed, tl: S.touchWideLeftPaneCollapsed, tr: S.touchWideRightPaneCollapsed };
    });
    expect(prefAfter.tl, 'touch-wide left key').toBe(true);
    expect(prefAfter.tr, 'touch-wide right key').toBe(true);
    expect(prefAfter.l, 'desktop left key unchanged').toBe(prefBefore.l);
    expect(prefAfter.r, 'desktop right key unchanged').toBe(prefBefore.r);
    await tap(page, page.locator('#btn-pane-toggle-left'));
    await tap(page, page.locator('#btn-pane-toggle-right'));
    await sleep(400);
    s = await paneState(page);
    for (const side of ['left', 'right']) {
      expect(s[side].docked, `${side} docked again`).toBe(true);
      expect(s[side].open, `${side} open again`).toBe(true);
    }
  });

  test('C layers pane controls stay usable and inside the pane (touch-wide fix round 3)', async ({ page }, testInfo) => {
    const dev = devOf(testInfo);
    test.skip(!['iPadL', 'coarseWide'].includes(dev), 'touch-wide only');
    await gotoFresh(page);
    await addAndSelectLayer(page);
    await sleep(500);
    const m = await page.evaluate(() => {
      const pane = document.getElementById('right-pane').getBoundingClientRect();
      const clipped = [...document.querySelectorAll('#right-pane button')].filter((b) => {
        const r = b.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(b).visibility === 'hidden') return false;
        if (!b.offsetParent && getComputedStyle(b).position !== 'fixed') return false;
        return r.right > pane.right + 0.5 || r.left < pane.left - 0.5 || r.right > window.innerWidth + 0.5;
      }).map((b) => b.id || b.className);
      return { clipped, inputW: document.getElementById('layer-search-input').getBoundingClientRect().width };
    });
    testInfo.annotations.push({ type: 'measured', description: JSON.stringify(m) });
    expect(m.clipped, `clipped #right-pane buttons ${JSON.stringify(m)}`).toEqual([]);
    expect(m.inputW, 'layer search input width').toBeGreaterThanOrEqual(44);
    await tap(page, page.locator('.lvl-search-wrap'));
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('layer-search-input');
    await shot008(page, `${dev}-layers-search`);
  });

  test('C persisted desktop widths are clamped on touch-wide', async ({ page }, testInfo) => {
    const dev = devOf(testInfo);
    test.skip(!['iPadL', 'coarseWide'].includes(dev), 'touch-wide only');
    await page.addInitScript(() => {
      try {
        localStorage.setItem('vectura_prefs', JSON.stringify({ version: 1, data: { uiTheme: 'dark', paneLeftWidth: 520, paneRightWidth: 520 } }));
      } catch (e) { /* storage unavailable */ }
    });
    await gotoFresh(page);
    const seeded = await page.evaluate(() => window.Vectura.SETTINGS.paneLeftWidth);
    expect(seeded, 'preferences seeded').toBe(520);
    const caps = await page.evaluate(() => {
      const TL = window.Vectura.TOUCH_LAYOUT;
      const roomy = innerWidth >= TL.roomyMinWidth;
      return roomy ? { left: TL.maxDockedRoomyPaneWidth, right: TL.maxDockedRoomyPaneWidth } : { left: TL.maxDockedPaneWidth, right: Math.min(TL.maxDockedPaneWidth, TL.maxDockedRightPaneWidth) };
    });
    const max = caps.left;
    expect(max, 'TOUCH_LAYOUT.maxDockedPaneWidth').toBeGreaterThan(0);
    const s = await paneState(page);
    expect(s.left.width, 'left width clamped').toBeLessThanOrEqual(max + 0.5);
    const maxRight = caps.right;
    expect(s.right.width, 'right width clamped').toBeLessThanOrEqual(maxRight + 0.5);
    const share = await canvasShare(page);
    expect(share, `share ${share}`).toBeGreaterThanOrEqual(45);
    expect(await page.evaluate(() => window.Vectura.SETTINGS.paneLeftWidth), 'clamp is not written back').toBe(520);
  });

  test('D tablet drawer model', async ({ page }, testInfo) => {
    const dev = devOf(testInfo);
    test.skip(!['iPadP', 'iPhP', 'iPhL'].includes(dev), 'drawer layouts only');
    await gotoFresh(page);
    const vp = page.viewportSize();
    // Phone openers arrive with TUX-010; until then a phone uses the pane's own toggle when a finger can reach it.
    const opener = async (side) => {
      if (dev === 'iPadP') return page.locator(`#btn-mobile-pane-${side}`);
      const loc = page.locator(`#btn-pane-toggle-${side}`);
      const box = await loc.boundingBox();
      if (!box) return null;
      const t = await page.evaluate(({ x, y, id }) => { const e = document.elementFromPoint(x, y); const b = document.getElementById(id); return !!e && (e === b || b.contains(e)); }, { x: box.x + box.width / 2, y: box.y + box.height / 2, id: `btn-pane-toggle-${side}` });
      return t ? loc : null;
    };
    const left = await opener('left');
    const right = await opener('right');
    if (!left || !right) {
      test.skip(true, 'no finger-reachable phone opener until TUX-010');
      return;
    }
    const prefBefore = await page.evaluate(() => window.Vectura.SETTINGS.leftPaneCollapsed);
    await tap(page, left);
    await sleep(400);
    let s = await paneState(page);
    expect(s.left.open, 'left open').toBe(true);
    expect(await backdropVisible(page), 'backdrop visible').toBe(true);
    const z = await page.evaluate(() => {
      const zi = (el) => { const v = parseInt(getComputedStyle(el).zIndex, 10); return Number.isFinite(v) ? v : 0; };
      return { backdrop: zi(document.getElementById('mobile-pane-backdrop')), tool: zi(document.getElementById('tool-bar')), drawer: zi(document.getElementById('left-pane')) };
    });
    expect(z.backdrop, 'backdrop above tool rail').toBeGreaterThan(z.tool);
    expect(z.drawer, 'drawer above backdrop').toBeGreaterThan(z.backdrop);
    const intro = await page.evaluate(() => {
      const e = document.getElementById('left-welcome-intro');
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { w: r.width, h: r.height, l: r.left, t: r.top, r: r.right, b: r.bottom, W: innerWidth, H: innerHeight, vis: getComputedStyle(e).visibility };
    });
    if (intro) {
      expect(intro.w > 0 && intro.h > 0 && intro.vis !== 'hidden', 'welcome intro visible').toBe(true);
      // A short phone drawer (402 px tall) scrolls its body: the intro must start inside the viewport.
      // Tablet fits whole.
      const bottomOk = dev === 'iPadP' ? intro.b <= intro.H : intro.t < intro.H;
      expect(intro.l >= 0 && intro.t >= 0 && intro.r <= intro.W && bottomOk, `welcome intro inside the viewport ${JSON.stringify(intro)}`).toBe(true);
    }
    if (dev === 'iPadP') await shot008(page, `iPadP-${/webkit/.test(testInfo.project.name) ? 'webkit' : 'chromium'}-drawer-open`);
    if (dev !== 'iPadP') {
      // On a phone the backdrop (z 65) covers the other pane's sliver, so the swap is two taps:
      // the first closes the drawer through the backdrop.
      await tap(page, { x: vp.width - 20, y: vp.height / 2 });
      await sleep(400);
    }
    await tap(page, right);
    await sleep(400);
    s = await paneState(page);
    expect(s.right.open, 'right open').toBe(true);
    expect(s.left.open, 'left closed when right opens').toBe(false);
    // Tap the backdrop outside the drawer (the right drawer sits on the right edge).
    await tap(page, { x: 20, y: vp.height / 2 });
    await sleep(400);
    s = await paneState(page);
    expect(s.left.open || s.right.open, 'backdrop tap closes the drawer').toBe(false);
    expect(await backdropVisible(page), 'backdrop hidden after close').toBe(false);
    await tap(page, left);
    await sleep(400);
    await tap(page, { x: vp.width - 20, y: vp.height / 2 });
    await sleep(400);
    s = await paneState(page);
    expect(s.left.open || s.right.open, 'backdrop tap closes the left drawer').toBe(false);
    if (dev !== 'iPadP') return;
    // Context bar > Show Properties panel restores through the controller, with the backdrop.
    await addAndSelectLayer(page);
    await sleep(500);
    await tap(page, page.locator('.ctxbar-overflow'));
    await sleep(300);
    await tap(page, page.locator('.ctxbar-menu-item', { hasText: 'Show Properties panel' }));
    await sleep(500);
    s = await paneState(page);
    expect(s.left.open || s.right.open, 'Show Properties opens a drawer').toBe(true);
    expect(await backdropVisible(page), 'Show Properties drawer has the backdrop').toBe(true);
    await page.evaluate(() => window.Vectura.UI.Workspace.paneState.closeAll());
    expect(await page.evaluate(() => window.Vectura.SETTINGS.leftPaneCollapsed), 'tablet never writes the desktop key').toBe(prefBefore);
    expect(await page.evaluate(() => window.Vectura.SETTINGS.rightPaneCollapsed), 'tablet never writes the desktop right key').not.toBe(true);
  });

  test('E rotation', async ({ page }, testInfo) => {
    const dev = devOf(testInfo);
    test.skip(dev !== 'iPadL', 'iPad landscape projects start at iPadL');
    await gotoFresh(page);
    await tap(page, page.locator('#btn-pane-toggle-right'));
    await sleep(400);
    for (let cycle = 1; cycle <= 2; cycle += 1) {
      const tag = `cycle ${cycle}`;
      let s = await paneState(page);
      expect(s.left.open && s.left.docked, `${tag} iPadL left docked open`).toBe(true);
      expect(s.right.open, `${tag} iPadL right collapsed`).toBe(false);
      await page.setViewportSize({ width: 834, height: 1210 });
      await sleep(700);
      s = await paneState(page);
      expect(s.left.open, `${tag} portrait left closed`).toBe(false);
      expect(s.right.open, `${tag} portrait right closed`).toBe(false);
      expect(await backdropVisible(page), `${tag} portrait no backdrop`).toBe(false);
      await tap(page, page.locator('#btn-mobile-pane-left'));
      await sleep(400);
      expect((await paneState(page)).left.open, `${tag} drawer open`).toBe(true);
      await page.setViewportSize({ width: 820, height: 1180 });
      await sleep(700);
      expect((await paneState(page)).left.open, `${tag} same-class resize keeps the drawer`).toBe(true);
      for (let i = 0; i < 4; i += 1) {
        await page.setViewportSize({ width: 820 + (i % 2) * 6, height: 1180 });
        await sleep(60);
      }
      expect((await paneState(page)).left.open, `${tag} resize burst keeps the drawer`).toBe(true);
      await page.setViewportSize({ width: 1210, height: 834 });
      await sleep(700);
      s = await paneState(page);
      expect(s.left.open && s.left.docked, `${tag} back to landscape: left docked open`).toBe(true);
      expect(s.right.open, `${tag} back to landscape: right still collapsed`).toBe(false);
      expect(await backdropVisible(page), `${tag} landscape no backdrop`).toBe(false);
    }
  });
});
