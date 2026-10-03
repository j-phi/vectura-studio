const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { PROJECTS } = require('./viewports');
const touch = require('../helpers/touch');

// TUX-006: layout classifier. Class set per device, 44 px visible tool buttons on touch,
// rail integrity, and rotation. Evidence PNGs go to the main repo (untracked).
const EXPECT = {
  iPadP: { layout: 'tablet', mobile: true },
  iPadL: { layout: 'touch-wide', mobile: false },
  coarseWide: { layout: 'touch-wide', mobile: false },
  iPhP: { layout: 'phone', mobile: true },
  'iPhP-c': { layout: 'phone', mobile: true },
  iPhL: { layout: 'phone', mobile: true },
  'iPhL-c': { layout: 'phone', mobile: true },
};
const EVIDENCE = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-006';

const gotoApp = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
};

const layoutState = (page) => page.evaluate(() => ({
  touchUi: document.body.classList.contains('touch-ui'),
  mobile: document.body.classList.contains('mobile-layout'),
  phone: document.body.classList.contains('phone-layout'),
  tablet: document.body.classList.contains('tablet-layout'),
  wide: document.body.classList.contains('touch-wide-layout'),
  layout: document.body.dataset.layout || null,
  iw: innerWidth,
}));

test.describe('TUX-006 shell layout', () => {
  test.beforeEach(async ({ page }) => { await gotoApp(page); });

  test('matchMedia pointer coarse is true in this project', async ({ page }) => {
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  });

  test('layout class per project', async ({ page }, testInfo) => {
    const spec = PROJECTS[testInfo.project.name];
    const want = EXPECT[spec.device];
    const s = await layoutState(page);
    expect(s.touchUi, 'touch-ui').toBe(true);
    expect(s.layout, `data-layout (innerWidth ${s.iw})`).toBe(want.layout);
    expect(s.mobile, 'mobile-layout').toBe(want.mobile);
    expect(s.phone, 'phone-layout').toBe(want.layout === 'phone');
    expect(s.tablet, 'tablet-layout').toBe(want.layout === 'tablet');
    expect(s.wide, 'touch-wide-layout').toBe(want.layout === 'touch-wide');
  });

  test('visible tool buttons are >= 44x44 and unoccluded', async ({ page }, testInfo) => {
    const spec = PROJECTS[testInfo.project.name];
    const ids = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('#tool-bar .tool-btn').forEach((b, i) => {
        const r = b.getBoundingClientRect();
        if (b.offsetParent === null || b.classList.contains('hidden') || r.width === 0 || r.height === 0) return;
        b.setAttribute('data-tux6-idx', String(i));
        out.push(i);
      });
      return out;
    });
    expect(ids.length).toBeGreaterThan(3);
    const bad = [];
    for (const i of ids) {
      const loc = page.locator(`#tool-bar .tool-btn[data-tux6-idx="${i}"]`);
      const box = await loc.boundingBox();
      // Buttons scrolled out of the rail are covered by the reachability check below.
      if (!box || box.y + box.height > page.viewportSize().height || box.x + box.width > page.viewportSize().width) continue;
      // A docked/open side pane can overlay the rail in tablet and phone layouts
      // (pre-existing; TUX-008 owns pane default state). Size is still asserted for those.
      const covered = await loc.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const overlapsPane = [...document.querySelectorAll('.pane')].some((p) => {
          const q = p.getBoundingClientRect();
          return q.width > 0 && q.height > 0 && q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top;
        });
        return { self: !!t && (t === el || el.contains(t)), pane: overlapsPane };
      });
      const name = await loc.getAttribute('data-tool') || i;
      if (covered.pane) {
        if (box.width < 43.5 || box.height < 43.5) bad.push(`${name}: ${box.width}x${box.height} (pane-covered)`);
        continue;
      }
      const hit = await touch.hitArea(page, loc);
      if (hit.w < 43.5 || hit.h < 43.5 || !covered.self) bad.push(`${name}: ${box.width}x${box.height} hit ${hit.w}x${hit.h} ok=${covered.self}`);
    }
    expect(bad, `undersized/occluded on ${spec.device}`).toEqual([]);
  });

  test('landscape tablet rail stays one column and reaches the last tool', async ({ page }, testInfo) => {
    const spec = PROJECTS[testInfo.project.name];
    test.skip(!(spec.device === 'iPadL' || spec.device === 'coarseWide'), 'wide touch only');
    const info = await page.evaluate(() => {
      const bs = [...document.querySelectorAll('#tool-bar .tool-btn')].filter((b) => {
        const r = b.getBoundingClientRect();
        return b.offsetParent !== null && !b.classList.contains('hidden') && r.width > 0 && r.height > 0;
      });
      const bar = document.getElementById('tool-bar');
      const lefts = bs.map((b) => b.getBoundingClientRect().left);
      const last = bs[bs.length - 1].getBoundingClientRect();
      return {
        n: bs.length,
        spread: Math.max(...lefts) - Math.min(...lefts),
        lastBottom: last.bottom,
        vh: innerHeight,
        scrollable: bar.scrollHeight > bar.clientHeight && getComputedStyle(bar).overflowY !== 'visible' && getComputedStyle(bar).overflowY !== 'hidden',
      };
    });
    expect(info.spread).toBeLessThanOrEqual(1);
    expect(info.lastBottom <= info.vh || info.scrollable, `last tool bottom ${info.lastBottom} vs ${info.vh}`).toBe(true);
    const share = await touch.canvasShare(page);
    testInfo.annotations.push({ type: 'canvasShare', description: String(share) });
    const basePath = path.join(__dirname, 'target-baseline.json');
    if (fs.existsSync(basePath)) {
      const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
      const entry = base[spec.device] || base[testInfo.project.name];
      const floor = entry && (entry.canvasPct ?? entry);
      if (typeof floor === 'number') expect(share).toBeGreaterThanOrEqual(floor - 0.5);
    }
  });

  test('screenshot evidence', async ({ page }, testInfo) => {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    await page.screenshot({ path: path.join(EVIDENCE, `${testInfo.project.name}.png`) });
  });

  test('rotation iPad landscape -> portrait -> landscape', async ({ page }, testInfo) => {
    test.skip(!/ipad-landscape/.test(testInfo.project.name), 'iPad landscape projects only');
    await page.evaluate(() => {
      window.__lc = [];
      window.addEventListener('vectura:layoutchange', (e) => window.__lc.push(e.detail));
    });
    const steps = [[834, 1210, 'tablet'], [1210, 834, 'touch-wide']];
    for (const [w, h, layout] of steps) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForFunction((l) => document.body.dataset.layout === l, layout);
      const s = await layoutState(page);
      expect(s.touchUi).toBe(true);
      expect(s.layout).toBe(layout);
      expect(s.mobile).toBe(layout === 'tablet');
    }
    const events = await page.evaluate(() => window.__lc);
    expect(events.map((e) => e.to)).toEqual(['tablet', 'touch-wide']);
    fs.mkdirSync(EVIDENCE, { recursive: true });
    await page.screenshot({ path: path.join(EVIDENCE, `${testInfo.project.name}-after-rotation.png`) });
  });
});

// TUX-006 fix round: a coarse landscape phone at >= 900 px wide classifies as phone, so the
// drawer structure CSS must apply (keyed on the layout class, not on viewport width).
test.describe('TUX-006 coarse landscape phone >= 900 px', () => {
  const SIZES = [[956, 440], [932, 430]];
  for (const [w, h] of SIZES) {
    test(`drawer structure at ${w}x${h}`, async ({ browser }, testInfo) => {
      test.skip(!/^(touch-ipad-landscape|webkit-ipad-landscape)$/.test(testInfo.project.name), 'one Chromium + one WebKit project');
      const ctx = await browser.newContext({
        viewport: { width: w, height: h }, deviceScaleFactor: 3, hasTouch: true, isMobile: true,
        userAgent: PROJECTS['touch-iphone-landscape'].ua,
        baseURL: testInfo.project.use.baseURL,
      });
      const page = await ctx.newPage();
      try {
        await gotoApp(page);
        const s = await page.evaluate(() => {
          const pos = (id) => getComputedStyle(document.getElementById(id)).position;
          const rect = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { l: r.left, r: r.right, w: r.width }; };
          return {
            coarse: matchMedia('(pointer: coarse)').matches,
            phone: document.body.classList.contains('phone-layout'),
            left: pos('left-pane'), right: pos('right-pane'),
            collapsed: getComputedStyle(document.documentElement).getPropertyValue('--pane-collapsed-width').trim(),
            vp: rect('#viewport-container'), iw: innerWidth,
          };
        });
        expect(s.coarse, 'coarse pointer').toBe(true);
        expect(s.phone, `phone-layout at ${s.iw}`).toBe(true);
        expect(s.left, '.pane-left position').not.toBe('relative');
        expect(s.right, '.pane-right position').not.toBe('relative');
        expect(s.collapsed, '--pane-collapsed-width').toBe('40px');
        // Panes are overlay drawers: the canvas container spans (nearly) the full width.
        expect(s.vp.w, 'canvas container is not split by docked panes').toBeGreaterThan(s.iw * 0.8);
        // Re-probe the tool rail: no clipped or 44x30 buttons.
        const rail = await page.evaluate(() => [...document.querySelectorAll('#tool-bar .tool-btn')].filter((b) => {
          const r = b.getBoundingClientRect();
          return b.offsetParent !== null && !b.classList.contains('hidden') && r.width > 0 && r.height > 0;
        }).map((b) => { const r = b.getBoundingClientRect(); return { id: b.id || b.dataset.tool || b.title, w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) }; }));
        const bad = rail.filter((b) => b.w < 44 || b.h < 44);
        // elementFromPoint: every visible rail button that is in view is hit-testable.
        const occluded = await page.evaluate(() => [...document.querySelectorAll('#tool-bar .tool-btn')].filter((b) => {
          const r = b.getBoundingClientRect();
          return b.offsetParent !== null && !b.classList.contains('hidden') && r.width > 0 && r.height > 0
            && r.right <= innerWidth && r.bottom <= innerHeight;
        }).map((b) => {
          const r = b.getBoundingClientRect();
          const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return {
            id: b.id || b.dataset.tool || b.title,
            by: t && (t.id || String(t.className).slice(0, 40)),
            inPane: !!(t && t.closest && t.closest('.pane')),
            ok: !!t && (t === b || b.contains(t)),
          };
        }).filter((x) => !x.ok));
        // TUX-008 HAND-OFF: the default-open left drawer (welcome intro) still covers the first
        // rail button on a coarse landscape phone >= 900 px. TUX-008 owns pane default state.
        // Only a pane overlay is tolerated here; any other occluder fails.
        const unexpected = occluded.filter((x) => !x.inPane);
        expect(unexpected, `rail buttons covered by something other than a pane at ${w}x${h}`).toEqual([]);
        testInfo.annotations.push({ type: 'TUX-008 hand-off: pane-covered rail buttons', description: JSON.stringify(occluded) });
        expect(bad, `tool buttons under 44x44: ${JSON.stringify(bad)}`).toEqual([]);
        testInfo.annotations.push({ type: 'rail', description: JSON.stringify({ vh: h, n: rail.length, maxBottom: Math.max(...rail.map((b) => b.bottom)) }) });
      } finally { await ctx.close(); }
    });
  }
});

// TUX-006 fix round 2: converting the deleted @media (max-width: 900px) block to class gates
// must not change cascade weight. The pane handles are display:none in every mobile-layout
// viewport (the base .mobile-pane-handle {display:none} wins), and header spacing keeps the
// base values. Regression for 2fd199a5, where body.mobile-layout rules out-weighed them.
test.describe('TUX-006 mobile-layout cascade weight', () => {
  const CASES = [
    { name: 'iPadP 834x1210 coarse', w: 834, h: 1210, coarse: true, ua: PROJECTS['touch-ipad-portrait'].ua },
    { name: 'iPhP 402x874 coarse', w: 402, h: 874, coarse: true, ua: PROJECTS['touch-iphone-portrait'].ua },
    { name: 'iPhL 874x402 coarse', w: 874, h: 402, coarse: true, ua: PROJECTS['touch-iphone-landscape'].ua },
    { name: '800x900 fine', w: 800, h: 900, coarse: false, ua: undefined },
  ];
  for (const c of CASES) {
    test(`handles hidden, header spacing at base values, nothing covers layer actions: ${c.name}`, async ({ browser }, testInfo) => {
      test.skip(!/^(touch-ipad-landscape|webkit-ipad-landscape)$/.test(testInfo.project.name), 'one Chromium + one WebKit project');
      const ctx = await browser.newContext({
        viewport: { width: c.w, height: c.h }, deviceScaleFactor: 2, hasTouch: c.coarse, isMobile: c.coarse,
        ...(c.ua ? { userAgent: c.ua } : {}),
        baseURL: testInfo.project.use.baseURL,
      });
      const page = await ctx.newPage();
      try {
        await gotoApp(page);
        const s = await page.evaluate(() => {
          const cs = (sel) => getComputedStyle(document.querySelector(sel));
          return {
            mobile: document.body.classList.contains('mobile-layout'),
            left: cs('#btn-mobile-pane-left').display,
            right: cs('#btn-mobile-pane-right').display,
            gap: cs('.top-menubar').columnGap,
            align: cs('.header-main').alignItems,
            padL: cs('#app-header').paddingLeft,
          };
        });
        expect(s.mobile, 'mobile-layout active').toBe(true);
        expect(s.left, '#btn-mobile-pane-left display').toBe('none');
        expect(s.right, '#btn-mobile-pane-right display').toBe('none');
        expect(s.gap, '.top-menubar gap').toBe('1px');
        expect(s.align, '.header-main align-items').toBe('center');
        expect(s.padL, '#app-header padding-left').toBe('14px');
        // No visible layer-card action button is covered by a pane handle.
        const covered = await page.evaluate(() => [...document.querySelectorAll('.layer-item .layer-act')].filter((b) => {
          const r = b.getBoundingClientRect();
          return b.offsetParent !== null && r.width > 0 && r.height > 0 && r.right <= innerWidth && r.bottom <= innerHeight;
        }).map((b) => {
          const r = b.getBoundingClientRect();
          const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { ok: !!t && (t === b || b.contains(t)), by: t && (t.id || t.className) };
        }).filter((x) => !x.ok && /mobile-pane-handle/.test(String(x.by))));
        expect(covered, 'layer actions covered by a pane handle').toEqual([]);
      } finally { await ctx.close(); }
    });
  }
});

// ---------------------------------------------------------------------------------------------
// TUX-001: phone header. A phone-layout header holds a hamburger (menus + theme) and five
// direct buttons. Finger input only. Phone mode is read from body.phone-layout, never from width.
// ---------------------------------------------------------------------------------------------
const PHONE_PROJECTS = [
  'touch-iphone-portrait', 'webkit-iphone-portrait', 'touch-iphone-landscape',
  'webkit-iphone-landscape', 'touch-iphone-portrait-chrome', 'touch-iphone-landscape-chrome',
];
const NONPHONE_PROJECTS = [
  'touch-ipad-portrait', 'webkit-ipad-portrait', 'touch-ipad-landscape',
  'webkit-ipad-landscape', 'touch-coarse-wide',
];
const TUX1_EVIDENCE = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-001';
const HEADER_IDS = ['btn-menu-hamburger', 'btn-header-generator', 'btn-header-layers', 'btn-header-undo', 'btn-header-redo', 'btn-header-export'];
const INLINE_TRIGGERS = ['btn-menu-file', 'btn-menu-edit', 'btn-menu-object', 'btn-menu-view', 'btn-menu-insert', 'btn-menu-help'];

const layerCount = (page) => page.evaluate(() => window.app.engine.layers.length);
const visibleBox = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom };
}, sel);

test.describe('TUX-001 phone header', () => {
  test.beforeEach(async ({ page }) => { await gotoApp(page); });

  test('A fits and classifies', async ({ page }, testInfo) => {
    test.skip(!PHONE_PROJECTS.includes(testInfo.project.name), 'phone projects only');
    const spec = PROJECTS[testInfo.project.name];
    const iw = await page.evaluate(() => innerWidth);
    expect(iw, 'window.innerWidth').toBe(spec.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), 'scrollWidth').toBeLessThanOrEqual(spec.width);
    expect(await page.evaluate(() => document.body.classList.contains('phone-layout')), 'body.phone-layout').toBe(true);
    const ox = await page.evaluate(() => getComputedStyle(document.getElementById('app-header')).overflowX);
    expect(['auto', 'scroll'], `#app-header overflow-x ${ox}`).not.toContain(ox);
    const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
    const regions = [];
    for (const id of HEADER_IDS) {
      const sel = `#${id}`;
      const loc = page.locator(sel);
      expect(await loc.count(), `${sel} exists`).toBe(1);
      expect(await loc.isVisible(), `${sel} visible`).toBe(true);
      const hit = await touch.hitArea(page, loc);
      expect(hit.w, `${sel} hit width`).toBeGreaterThanOrEqual(43.5);
      expect(hit.h, `${sel} hit height`).toBeGreaterThanOrEqual(43.5);
      const b = await visibleBox(page, sel);
      expect(b.x, `${sel} left`).toBeGreaterThanOrEqual(0);
      expect(b.y, `${sel} top`).toBeGreaterThanOrEqual(0);
      expect(b.r, `${sel} right`).toBeLessThanOrEqual(vp.w);
      expect(b.b, `${sel} bottom`).toBeLessThanOrEqual(vp.h);
      const owned = await loc.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!t && (t === el || el.contains(t));
      });
      expect(owned, `${sel} elementFromPoint(centre)`).toBe(true);
      regions.push({ id, ...b });
    }
    for (let i = 0; i < regions.length; i += 1) {
      for (let j = i + 1; j < regions.length; j += 1) {
        const a = regions[i];
        const c = regions[j];
        const overlap = a.x < c.r && c.x < a.r && a.y < c.b && c.y < a.b;
        expect(overlap, `${a.id} overlaps ${c.id}`).toBe(false);
      }
    }
    for (const id of [...INLINE_TRIGGERS, 'theme-toggle']) {
      expect(await visibleBox(page, `#${id}`), `#${id} must not show in the phone header`).toBeNull();
    }
    fs.mkdirSync(TUX1_EVIDENCE, { recursive: true });
    await page.screenshot({ path: path.join(TUX1_EVIDENCE, `${spec.device}${spec.engine === 'webkit' ? '-webkit' : ''}-closed.png`) });
  });

  test('B hamburger drill-down', async ({ page }, testInfo) => {
    test.skip(!PHONE_PROJECTS.includes(testInfo.project.name), 'phone projects only');
    const spec = PROJECTS[testInfo.project.name];
    const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
    const inside = (b, what) => {
      expect(b, `${what} visible`).not.toBeNull();
      expect(b.x, `${what} left`).toBeGreaterThanOrEqual(0);
      expect(b.y, `${what} top`).toBeGreaterThanOrEqual(0);
      expect(b.r, `${what} right`).toBeLessThanOrEqual(vp.w + 0.5);
      expect(b.b, `${what} bottom`).toBeLessThanOrEqual(vp.h + 0.5);
    };
    await touch.tap(page, page.locator('#btn-menu-hamburger'));
    await expect(page.locator('#phone-menu-sheet')).toBeVisible();
    inside(await visibleBox(page, '#phone-menu-sheet'), 'sheet');
    const rows = page.locator('#phone-menu-root [data-menu-target]');
    expect(await rows.count(), 'root rows').toBe(6);
    expect(await rows.allTextContents().then((t) => t.map((s) => s.trim()))).toEqual(['File', 'Edit', 'Object', 'View', 'Insert', 'Help']);
    for (let i = 0; i < 6; i += 1) {
      const b = await rows.nth(i).boundingBox();
      expect(b.height, `root row ${i} height`).toBeGreaterThanOrEqual(43.5);
    }
    expect(await page.locator('#phone-menu-root [data-phone-theme]').isVisible(), 'theme row').toBe(true);
    fs.mkdirSync(TUX1_EVIDENCE, { recursive: true });
    const tag = `${spec.device}${spec.engine === 'webkit' ? '-webkit' : ''}`;
    await page.screenshot({ path: path.join(TUX1_EVIDENCE, `${tag}-root.png`) });

    await touch.tap(page, page.locator('#phone-menu-root [data-menu-target="btn-menu-insert"]'));
    const insertItems = page.locator('#btn-insert-mirror-modifier');
    await expect(insertItems).toBeVisible();
    inside(await visibleBox(page, '#btn-insert-mirror-modifier'), 'Insert item');
    expect((await insertItems.boundingBox()).height, 'Insert item height').toBeGreaterThanOrEqual(43.5);
    const back = page.locator('.phone-menu-back:visible');
    await expect(back).toHaveCount(1);
    expect((await back.boundingBox()).height, 'Back height').toBeGreaterThanOrEqual(43.5);
    await page.screenshot({ path: path.join(TUX1_EVIDENCE, `${tag}-insert.png`) });

    await touch.tap(page, back);
    await expect(rows).toHaveCount(6);
    expect(await rows.first().isVisible(), 'root rows back').toBe(true);
    await touch.tap(page, page.locator('#phone-menu-root [data-menu-target="btn-menu-help"]'));
    await expect(page.locator('#btn-help')).toBeVisible();
    inside(await visibleBox(page, '#btn-help'), 'Help item');
    // every item of the tall levels is reachable (the level scrolls inside the sheet)
    await touch.tap(page, page.locator('.phone-menu-back:visible'));
    await touch.tap(page, page.locator('#phone-menu-root [data-menu-target="btn-menu-object"]'));
    const tall = await page.evaluate(() => {
      const sheet = document.getElementById('top-menubar');
      const panel = document.querySelector('.top-menu-panel.open');
      const cs = getComputedStyle(panel);
      return { fits: panel.scrollHeight <= panel.clientHeight + 1 || ['auto', 'scroll'].includes(cs.overflowY), sheetB: sheet.getBoundingClientRect().bottom, vh: innerHeight };
    });
    expect(tall.fits, 'Object level scrolls when taller than the sheet').toBe(true);
    expect(tall.sheetB, 'Object level sheet bottom').toBeLessThanOrEqual(tall.vh + 0.5);

    // close, reopen, then tap the canvas: closes without side effects
    await page.evaluate(() => window.app.ui.setTopMenuOpen(null, false));
    await page.keyboard.press('Escape').catch(() => {});
    if (!(await page.locator('#phone-menu-sheet').isVisible())) await touch.tap(page, page.locator('#btn-menu-hamburger'));
    await expect(page.locator('#phone-menu-sheet')).toBeVisible();
    const before = await page.evaluate(() => ({ n: window.app.engine.layers.length, sel: [...(window.app.renderer.selectedLayerIds || [])], h: window.app.history.length }));
    const canvas = await page.locator('#main-canvas').boundingBox();
    await touch.tap(page, { x: canvas.x + canvas.width / 2, y: Math.min(canvas.y + canvas.height / 2, vp.h - 6) });
    await expect(page.locator('#phone-menu-sheet')).toBeHidden();
    const after = await page.evaluate(() => ({ n: window.app.engine.layers.length, sel: [...(window.app.renderer.selectedLayerIds || [])], h: window.app.history.length }));
    expect(after).toEqual(before);
  });

  test('C direct actions work', async ({ page }, testInfo) => {
    test.skip(!PHONE_PROJECTS.includes(testInfo.project.name), 'phone projects only');
    expect(await layerCount(page), 'fresh load layers').toBe(0);
    await expect(page.locator('#btn-header-export')).toHaveAttribute('aria-disabled', 'true');
    await touch.tap(page, page.locator('#btn-header-export'));
    await expect(page.locator('#export-modal-root')).toHaveCount(0);
    // Narrowest finger path: Layers drawer from the header, then the add button.
    // Landscape phones keep the docked Layers pane open by default (TUX-008 owns that); only toggle it when closed.
    const wasOpen = await page.locator('#btn-add-layer').isVisible();
    if (!wasOpen) await touch.tap(page, page.locator('#btn-header-layers'));
    await expect(page.locator('#btn-add-layer')).toBeVisible();
    // Wait for the drawer slide to finish so the tap lands on the settled button.
    let prev = null;
    await expect.poll(async () => {
      const b = await page.locator('#btn-add-layer').boundingBox();
      const same = !!prev && !!b && Math.abs(prev.x - b.x) < 0.5 && Math.abs(prev.y - b.y) < 0.5;
      prev = b;
      return same;
    }, { intervals: [120] }).toBe(true);
    // #btn-add-layer opens the type menu (TUX-035 territory); a finger tap on "Algorithm Layer" adds the default algorithm layer (Empty Layer adds a group, which cannot be exported).
    await touch.tap(page, page.locator('#btn-add-layer'));
    await expect(page.locator('#layer-add-menu .lvl-add-item[data-add="algo-parent"]')).toBeVisible();
    await touch.tap(page, page.locator('#layer-add-menu .lvl-add-item[data-add="algo-parent"]'));
    await expect.poll(() => layerCount(page)).toBe(1);
    if (!wasOpen) await touch.tap(page, page.locator('#btn-header-layers')); // close the drawer
    await expect(page.locator('#btn-header-undo')).toBeEnabled();
    await expect(page.locator('#btn-header-export')).not.toHaveAttribute('aria-disabled', 'true');
    await touch.tap(page, page.locator('#btn-header-undo'));
    await expect.poll(() => layerCount(page)).toBe(0);
    await expect(page.locator('#btn-header-redo')).toBeEnabled();
    await touch.tap(page, page.locator('#btn-header-redo'));
    await expect.poll(() => layerCount(page)).toBe(1);
    await touch.tap(page, page.locator('#btn-header-export'));
    await expect(page.locator('#export-modal-root')).toBeVisible();
  });
});

const LANDSCAPE_PHONES = ['touch-iphone-landscape', 'webkit-iphone-landscape', 'touch-iphone-landscape-chrome'];
const PORTRAIT_AND_LANDSCAPE_PHONES = [...PHONE_PROJECTS];

test.describe('TUX-001 phone sub-levels fit the viewport', () => {
  test.beforeEach(async ({ page }) => { await gotoApp(page); });

  for (const level of ['btn-menu-object', 'btn-menu-file']) {
    test(`E ${level} level scrolls and its last item is reachable by finger`, async ({ page }, testInfo) => {
      test.skip(!LANDSCAPE_PHONES.includes(testInfo.project.name), 'phone landscape projects only');
      const spec = PROJECTS[testInfo.project.name];
      await touch.tap(page, page.locator('#btn-menu-hamburger'));
      await expect(page.locator('#phone-menu-sheet')).toBeVisible();
      await touch.tap(page, page.locator(`#phone-menu-root [data-menu-target="${level}"]`));
      const panel = page.locator('.top-menu-panel.open');
      await expect(panel).toBeVisible();
      const m = await page.evaluate(() => {
        const p = document.querySelector('.top-menu-panel.open');
        const cs = getComputedStyle(p);
        const r = p.getBoundingClientRect();
        return { sh: p.scrollHeight, ch: p.clientHeight, oy: cs.overflowY, bottom: r.bottom, vh: innerHeight, top: r.top };
      });
      // The panel itself must be inside the viewport and carry the scroll.
      expect(m.bottom, `${level} panel bottom ${m.bottom} vs viewport ${m.vh}`).toBeLessThanOrEqual(m.vh + 0.5);
      expect(m.sh, `${level} scrollHeight ${m.sh} must exceed clientHeight ${m.ch} (panel is the scroller)`).toBeGreaterThan(m.ch);
      expect(['auto', 'scroll']).toContain(m.oy);
      const lastSel = async () => page.evaluate(() => {
        const items = [...document.querySelectorAll('.top-menu-panel.open .top-menu-item')].filter((e) => e.getClientRects().length);
        const el = items[items.length - 1];
        const r = el.getBoundingClientRect();
        const t = document.elementFromPoint(r.left + r.width / 2, Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1));
        // A disabled item (e.g. Transform with no selection) has pointer-events:none; the hit then lands on its panel.
        const panelEl = document.querySelector('.top-menu-panel.open');
        return { id: el.id || el.textContent.trim(), top: r.top, bottom: r.bottom, vh: innerHeight, hit: !!t && (t === el || el.contains(t) || (el.disabled && panelEl.contains(t))) };
      });
      const before = await lastSel();
      // Finger scroll (native in Chromium). WebKit synthetic touch does not scroll natively, so
      // fall back to scrollTop there; the scroller assertions above are the real proof.
      const box = await panel.boundingBox();
      const from = { x: box.x + box.width / 2, y: box.y + box.height - 20 };
      const to = { x: from.x, y: box.y + 20 };
      for (let i = 0; i < 4; i += 1) {
        if (touch.engineSupports(page, 'nativeDefaultActions')) await touch.drag(page, from, to, { steps: 8 });
        else await page.evaluate(() => { const p = document.querySelector('.top-menu-panel.open'); p.scrollTop = p.scrollHeight; });
      }
      const after = await lastSel();
      expect(after.bottom, `${level} last item "${after.id}" bottom ${after.bottom} vs viewport ${after.vh}`).toBeLessThanOrEqual(after.vh + 0.5);
      expect(after.top, `${level} last item top`).toBeGreaterThanOrEqual(0);
      expect(after.hit, `${level} last item is hit-testable (tappable)`).toBe(true);
      fs.mkdirSync(TUX1_EVIDENCE, { recursive: true });
      await page.screenshot({ path: path.join(TUX1_EVIDENCE, `${spec.device}${spec.engine === 'webkit' ? '-webkit' : ''}-${level.replace('btn-menu-', '')}-scrolled.png`) });
    });
  }
});

test.describe('TUX-001 modifier bar glyphs in phone layout', () => {
  test('G glyphs replace SHIFT/ALT/CMD/CTRL/PAN labels in portrait and landscape', async ({ page }, testInfo) => {
    test.skip(!PORTRAIT_AND_LANDSCAPE_PHONES.includes(testInfo.project.name), 'phone projects only');
    const spec = PROJECTS[testInfo.project.name];
    await gotoApp(page);
    expect(await page.evaluate(() => document.body.classList.contains('phone-layout'))).toBe(true);
    const res = await page.evaluate(() => [...document.querySelectorAll('#touch-modifier-bar .touch-mod-btn')].map((b) => {
      const label = b.querySelector('.touch-mod-label');
      return {
        mod: b.dataset.touchMod,
        before: getComputedStyle(b, '::before').content,
        labelDisplay: label ? getComputedStyle(label).display : 'none',
      };
    }));
    expect(res.length, 'modifier buttons').toBeGreaterThan(0);
    for (const r of res) {
      expect(r.before, `${r.mod} ::before content`).not.toBe('none');
      expect(r.before, `${r.mod} ::before content`).not.toBe('normal');
      expect(r.labelDisplay, `${r.mod} text label hidden`).toBe('none');
    }
    fs.mkdirSync(TUX1_EVIDENCE, { recursive: true });
    const bar = page.locator('#touch-modifier-bar');
    if (await bar.isVisible().catch(() => false)) {
      await bar.screenshot({ path: path.join(TUX1_EVIDENCE, `${spec.device}${spec.engine === 'webkit' ? '-webkit' : ''}-modifier-glyphs.png`) });
    } else {
      await page.screenshot({ path: path.join(TUX1_EVIDENCE, `${spec.device}${spec.engine === 'webkit' ? '-webkit' : ''}-modifier-glyphs.png`) });
    }
  });
});

test.describe('TUX-001 non-phone keeps the inline menubar', () => {
  test('D iPad and wide-touch headers stay inline', async ({ page }, testInfo) => {
    test.skip(!NONPHONE_PROJECTS.includes(testInfo.project.name), 'iPad and wide-touch projects only');
    const spec = PROJECTS[testInfo.project.name];
    await gotoApp(page);
    expect(await visibleBox(page, '#btn-menu-hamburger'), 'no hamburger').toBeNull();
    for (const id of INLINE_TRIGGERS) expect(await visibleBox(page, `#${id}`), `#${id} inline`).not.toBeNull();
    const m = await page.evaluate(() => ({ r: document.getElementById('app-header').getBoundingClientRect().right, iw: innerWidth, sw: document.documentElement.scrollWidth }));
    expect(m.r).toBeLessThanOrEqual(m.iw);
    expect(m.sw).toBeLessThanOrEqual(m.iw);
    fs.mkdirSync(TUX1_EVIDENCE, { recursive: true });
    await page.screenshot({ path: path.join(TUX1_EVIDENCE, `${spec.device}${spec.engine === 'webkit' ? '-webkit' : ''}-closed.png`) });
  });
});

test.describe('TUX-001 phone header stays under an open modal', () => {
  test('E header does not cover or answer taps while the Export modal is open', async ({ page }, testInfo) => {
    test.skip(!PHONE_PROJECTS.includes(testInfo.project.name), 'phone projects only');
    await gotoApp(page);
    // Setup shortcut (not under test): one layer so Export is enabled.
    await page.evaluate(() => { window.app.engine.addLayer('flowfield'); window.app.pushHistory && window.app.pushHistory(); window.app.render(); });
    await expect.poll(() => layerCount(page)).toBe(1);
    await expect(page.locator('#btn-header-export')).not.toHaveAttribute('aria-disabled', 'true');
    await touch.tap(page, page.locator('#btn-header-export'));
    await expect(page.locator('#export-modal-root')).toBeVisible();
    await page.waitForTimeout(400);
    const probe = await page.evaluate(() => {
      const root = document.getElementById('export-modal-root');
      const card = root.closest('.modal-card') || root;
      const r = card.getBoundingClientRect();
      const inside = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (card.contains(t) || root.contains(t)); };
      const close = document.getElementById('export-modal-cancel');
      const cr = close.getBoundingClientRect();
      const hdr = document.getElementById('btn-header-undo').getBoundingClientRect();
      const t = document.elementFromPoint(hdr.left + hdr.width / 2, hdr.top + hdr.height / 2);
      return {
        top: inside(r.left + r.width / 2, r.top + 2),
        close: inside(cr.left + cr.width / 2, cr.top + cr.height / 2),
        undoPointHitsHeaderButton: !!t && !!t.closest('#app-header'),
        hdrBottom: document.getElementById('app-header').getBoundingClientRect().bottom,
        cardTop: r.top,
      };
    });
    expect(probe.top, 'modal top edge resolves inside modal').toBe(true);
    expect(probe.close, 'close control resolves inside modal').toBe(true);
    expect(probe.undoPointHitsHeaderButton, 'header undo position must not reach the header').toBe(false);
    const before = await layerCount(page);
    const hb = await page.locator('#btn-header-undo').boundingBox();
    await page.touchscreen.tap(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.waitForTimeout(250);
    expect(await layerCount(page), 'tap at the Undo position leaves layers unchanged').toBe(before);
  });
});
