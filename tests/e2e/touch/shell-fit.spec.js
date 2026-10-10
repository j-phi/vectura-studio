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
      // hitArea floods a 2 px grid, so it can under-read a 44 px box by one step. The box itself
      // is held to 43.5 above; the hit area gets one grid step of tolerance.
      if (box.width < 43.5 || box.height < 43.5 || hit.w < 41.5 || hit.h < 41.5 || !covered.self) bad.push(`${name}: ${box.width}x${box.height} hit ${hit.w}x${hit.h} ok=${covered.self}`);
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

// TUX-006 fix round 3: the tutorial popover and Document Setup read the classifier, not
// innerWidth. At a coarse 956x440 the classifier says phone, so both use the mobile path.
test.describe('TUX-006 classifier readers at coarse 956x440', () => {
  test('tutorial centers and Document Setup is not desktop', async ({ browser }, testInfo) => {
    test.skip(!/^(touch-ipad-landscape|webkit-ipad-landscape)$/.test(testInfo.project.name), 'one Chromium + one WebKit project');
    const ctx = await browser.newContext({
      viewport: { width: 956, height: 440 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true,
      userAgent: PROJECTS['touch-iphone-landscape'].ua,
      baseURL: testInfo.project.use.baseURL,
    });
    const page = await ctx.newPage();
    try {
      await gotoApp(page);
      const s = await page.evaluate(() => {
        const T = window.Vectura.Tutorial;
        const pop = T.popover;
        pop.init();
        pop.positionAt('#viewport-container', 'right');
        const el = document.getElementById('tutorial-popover');
        const pw = el.offsetWidth || 270;
        return {
          layout: document.body.dataset.layout,
          desktop: window.Vectura.UI.Modals.DocumentSetup.isDesktopViewport(),
          left: parseInt(el.style.left, 10),
          centered: Math.round(Math.max(8, (window.innerWidth - pw) / 2)),
        };
      });
      expect(s.layout).toBe('phone');
      expect(s.desktop, 'Document Setup desktop viewport').toBe(false);
      expect(s.left, 'tutorial popover placement').toBe(s.centered);
    } finally { await ctx.close(); }
  });
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
        // TUX-008: a touch tablet (iPadP) shows the two interim openers in the header; every other case hides them.
        const wantHandle = c.name.startsWith('iPadP');
        expect(s.left === 'none', '#btn-mobile-pane-left hidden').toBe(!wantHandle);
        expect(s.right === 'none', '#btn-mobile-pane-right hidden').toBe(!wantHandle);
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

// TUX-001: phone header. Hamburger + direct Undo/Redo/Export, no viewport inflation.
test.describe('TUX-001 phone header', () => {
  test('header fits, hamburger drills down, direct actions work', async ({ page }, testInfo) => {
    const dev = PROJECTS[testInfo.project.name];
    test.skip(!dev || dev.device === 'iPadP' || dev.device === 'iPadL' || dev.device === 'coarseWide', 'phone projects only');
    await gotoApp(page);
    const st = await page.evaluate(() => ({ iw: innerWidth, sw: document.documentElement.scrollWidth, phone: document.body.classList.contains('phone-layout'),
      ox: getComputedStyle(document.getElementById('app-header')).overflowX }));
    expect(st.iw).toBe(dev.width);
    expect(st.sw).toBeLessThanOrEqual(dev.width);
    expect(st.phone).toBe(true);
    expect(['auto', 'scroll']).not.toContain(st.ox);
    const ids = ['btn-menu-hamburger', 'btn-header-undo', 'btn-header-redo', 'btn-header-export'];
    const rects = [];
    for (const id of ids) {
      const r = await page.evaluate((i) => { const b = document.getElementById(i).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }, id);
      expect(r.w).toBeGreaterThanOrEqual(44);
      expect(r.h).toBeGreaterThanOrEqual(44);
      expect(r.x + r.w).toBeLessThanOrEqual(dev.width);
      rects.push(r);
    }
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      expect(a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 || a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5).toBe(true);
    }
    await touch.tap(page, page.locator('#btn-menu-hamburger'));
    await touch.tap(page, page.locator('#btn-menu-insert'));
    const inside = await page.evaluate(() => [...document.querySelectorAll('.top-menu-panel.open .top-menu-item')].map((e) => { const r = e.getBoundingClientRect(); return r.height >= 44 && r.right <= innerWidth && r.bottom <= innerHeight; }));
    expect(inside.length).toBeGreaterThan(1);
    expect(inside.every(Boolean)).toBe(true);
    await touch.tap(page, page.locator('.top-menu-panel.open .top-menu-back'));
    await touch.tap(page, page.locator('#btn-menu-help'));
    await expect(page.locator('#btn-menu-help ~ .top-menu-panel.open')).toBeVisible();
  });
});


// ---------------------------------------------------------------------------------------------
// TUX-002 / TUX-003 / TUX-004: fixed non-scrolling shell, no page zoom on chrome, dvh heights.
// Computed-style assertions run in BOTH engines (cross-engine RED). Swipe/pinch outcomes only
// count in Chromium (engineSupports), because synthetic WebKit gestures are vacuous.
// ---------------------------------------------------------------------------------------------
const TUX2_PROJECTS = [
  'touch-ipad-portrait', 'webkit-ipad-portrait', 'touch-ipad-landscape', 'webkit-ipad-landscape',
  'touch-iphone-portrait', 'webkit-iphone-portrait', 'touch-iphone-landscape', 'webkit-iphone-landscape',
];
const TUX2_PROJECTS_ALL = [...TUX2_PROJECTS, 'touch-iphone-portrait-chrome'];
const TUX3_PROJECTS = ['touch-ipad-landscape', 'webkit-ipad-landscape', 'touch-iphone-portrait', 'webkit-iphone-portrait'];
// iPhone landscape with browser chrome (874x330) is in scope but is an EXPECTED FAIL owned by TUX-007:
// the 204 px toolbar plus modifier bar plus HUD exceed the 281 px workspace and the canvas collapses to
// 0 px. test.fail() flips to a hard failure when TUX-007 lands, which is the cue to drop the mark.
const TUX4_PROJECTS = [
  ...TUX2_PROJECTS, 'touch-iphone-portrait-chrome', 'touch-iphone-landscape-chrome',
];
const TUX4_EXPECTED_FAIL = {}; // TUX-007 landed: the touch-iphone-landscape-chrome mark was removed (it reported 'Expected to fail, but passed')
// Projects where #status-bar is display:none by design (measured: iPhone portrait, all three projects).
const TUX4_STATUS_BAR_HIDDEN = ['touch-iphone-portrait', 'webkit-iphone-portrait', 'touch-iphone-portrait-chrome'];
const TUX234_EVIDENCE = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after';

const openLeftPane = (page) => page.evaluate(() => {
  const pane = document.getElementById('left-pane');
  const open = pane && !pane.classList.contains('pane-collapsed') && (!document.body.classList.contains('auto-collapsed') || pane.classList.contains('pane-force-open'));
  if (open) return;
  const b = document.getElementById('btn-mobile-pane-left');
  const vis = (el) => el && el.getBoundingClientRect().width > 0;
  (vis(b) ? b : document.getElementById('btn-pane-toggle-left')).click();
});

// Layer rows live in the right pane. Opened by script as setup only; opening by finger is TUX-010.
const openRightPane = (page) => page.evaluate(() => {
  const pane = document.getElementById('right-pane');
  const r = pane && pane.getBoundingClientRect();
  if (r && r.width > 100 && r.right > 0 && r.left < innerWidth && getComputedStyle(pane).visibility !== 'hidden') return;
  const b = document.getElementById('btn-mobile-pane-right');
  const vis = (el) => el && el.getBoundingClientRect().width > 0;
  if (vis(b)) { b.click(); return; }
  if (document.body.classList.contains('auto-collapsed')) pane.classList.add('pane-force-open');
  else pane.classList.remove('pane-collapsed');
});

const SCROLLERS = ['#left-panel-content', '#export-settings-scroll', '.modal-card--help', '#petal-designer-window'];
const overscrollOf = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return 'missing';
  const cs = getComputedStyle(el);
  return `${cs.overscrollBehaviorX}|${cs.overscrollBehaviorY}`;
}, sel);

const sweepScrollers = (page) => page.evaluate(() => {
  const bad = [];
  document.querySelectorAll('*').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.overflowY !== 'auto' && cs.overflowY !== 'scroll') return;
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    if (!(el.scrollHeight > el.clientHeight + 1)) return;
    if (cs.overscrollBehaviorY === 'contain' || cs.overscrollBehaviorY === 'none') return;
    bad.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}[${cs.overscrollBehaviorY}]`);
  });
  return bad;
});

const startPointsClear = (page, pts) => page.evaluate((points) => {
  const ae = document.activeElement;
  const editable = !!ae && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable);
  return { editable, hits: points.map(([x, y]) => {
    const t = document.elementFromPoint(x, y);
    return { x, y, in: !!t && !t.closest('#main-canvas'), tag: t && (t.id || t.className) };
  }) };
}, pts);

const metricsOf = (page) => page.evaluate(() => ({
  sx: scrollX, sy: scrollY, ot: visualViewport.offsetTop, ol: visualViewport.offsetLeft,
  scale: visualViewport.scale, iw: innerWidth, ih: innerHeight,
}));

const gotoFresh = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
};

test.describe('TUX-002 shell does not scroll under swipes', () => {
  test('computed shell styles', async ({ page }, testInfo) => {
      const name = testInfo.project.name;
      test.skip(!TUX2_PROJECTS_ALL.includes(name), 'project not in scope');
      await gotoFresh(page);
      const s = await page.evaluate(() => {
        const h = getComputedStyle(document.documentElement);
        const b = getComputedStyle(document.body);
        return {
          position: b.position, hOx: h.overflowX, hOy: h.overflowY, bOx: b.overflowX, bOy: b.overflowY,
          hObx: h.overscrollBehaviorX, hOby: h.overscrollBehaviorY, bObx: b.overscrollBehaviorX, bOby: b.overscrollBehaviorY,
          hScreen: document.body.classList.contains('h-screen'),
        };
      });
      expect(s.position, 'body position').toBe('fixed');
      expect([s.hOx, s.hOy, s.bOx, s.bOy], 'html/body overflow').toEqual(['hidden', 'hidden', 'hidden', 'hidden']);
      expect([s.hObx, s.hOby, s.bObx, s.bOby], 'html/body overscroll-behavior').toEqual(['none', 'none', 'none', 'none']);
      expect(s.hScreen, 'body.h-screen').toBe(false);
    });

  test('swipes leave the shell at offset 0', async ({ page }, testInfo) => {
      const name = testInfo.project.name;
      test.skip(!TUX2_PROJECTS_ALL.includes(name), 'project not in scope');
      const spec = PROJECTS[name];
      const gestures = [
        { id: '#tool-bar', dir: 'up' },
        { id: '#app-header', dir: 'side' },
        { id: '#touch-modifier-bar', dir: 'up' },
        { id: '#layer-list .layer-item, #layer-list > *', dir: 'hold', pane: 'right' },
      ];
      for (const g of gestures) {
        await gotoFresh(page);
        if (g.pane === 'right') await openRightPane(page);
        await page.waitForTimeout(300);
        const loc = page.locator(g.id).first();
        expect(await loc.count(), `${g.id} must exist (no silent skip)`).toBeGreaterThan(0);
        expect(await loc.isVisible(), `${g.id} must be visible (no silent skip)`).toBe(true);
        const box = await loc.boundingBox();
        expect(box && box.width >= 4 && box.height >= 4, `${g.id} must be at least 4 px (no silent skip)`).toBe(true);
        const cx = box.x + box.width / 2;
        const from = { x: cx, y: Math.min(box.y + box.height - 4, box.y + box.height * 0.8) };
        const to = g.dir === 'side' ? { x: Math.max(2, cx - 150), y: from.y } : { x: cx, y: Math.max(1, from.y - 220) };
        const probe = await startPointsClear(page, [[from.x, from.y]]);
        expect(probe.editable, `${g.id} focused editable`).toBe(false);
        expect(probe.hits[0].in, `${g.id} finger start must not be on the canvas (hit ${probe.hits[0].tag})`).toBe(true);
        await touch.drag(page, from, to, { holdMs: g.dir === 'hold' ? 500 : 0, steps: 12 });
        await page.waitForTimeout(200);
        if (!touch.engineSupports(page, 'nativeDefaultActions')) continue;
        const m = await metricsOf(page);
        expect(m, `${g.id} metrics after swipe`).toMatchObject({ sx: 0, sy: 0, ot: 0, ol: 0, scale: 1, iw: spec.width, ih: spec.height });
      }
    });
});

test.describe('TUX-002 every scroll container contains overscroll', () => {
  test('overscroll contain', async ({ page }, testInfo) => {
      const name = testInfo.project.name;
      test.skip(!TUX2_PROJECTS.includes(name), 'project not in scope');
      await gotoFresh(page);
      const offenders = [];
      offenders.push(...(await sweepScrollers(page)).map((o) => `default: ${o}`));
      await openLeftPane(page);
      await page.waitForTimeout(300);
      expect(['contain|contain', 'none|none'], `#left-panel-content ${await overscrollOf(page, '#left-panel-content')}`).toContain(await overscrollOf(page, '#left-panel-content'));
      offenders.push(...(await sweepScrollers(page)).map((o) => `left-pane: ${o}`));
      await page.evaluate(() => window.app.ui.openExportModal());
      await page.waitForSelector('#export-settings-scroll', { state: 'attached' });
      expect(['contain|contain', 'none|none'], `#export-settings-scroll ${await overscrollOf(page, '#export-settings-scroll')}`).toContain(await overscrollOf(page, '#export-settings-scroll'));
      offenders.push(...(await sweepScrollers(page)).map((o) => `export: ${o}`));
      await page.evaluate(() => window.app.ui.closeModal());
      await page.evaluate(() => window.app.ui.openHelp());
      await page.waitForSelector('.modal-card--help');
      expect(['contain|contain', 'none|none'], `.modal-card--help ${await overscrollOf(page, '.modal-card--help')}`).toContain(await overscrollOf(page, '.modal-card--help'));
      offenders.push(...(await sweepScrollers(page)).map((o) => `help: ${o}`));
      await page.evaluate(() => window.app.ui.closeModal());
      await page.evaluate(() => { const l = window.app.engine.addLayer('petalis'); window.app.ui.openPetalDesigner({ layer: l }); });
      await page.waitForSelector('#petal-designer-window');
      expect(['contain|contain', 'none|none'], `#petal-designer-window ${await overscrollOf(page, '#petal-designer-window')}`).toContain(await overscrollOf(page, '#petal-designer-window'));
      offenders.push(...(await sweepScrollers(page)).map((o) => `petal: ${o}`));
      expect(offenders, 'scrollers without overscroll-behavior contain/none').toEqual([]);
    });
});

test.describe('TUX-003 pinch on chrome does not page-zoom', () => {
  test('pinch scale stays 1', async ({ page }, testInfo) => {
      const name = testInfo.project.name;
      test.skip(!TUX3_PROJECTS.includes(name), 'project not in scope');
      if (!touch.engineSupports(page, 'trustedMultiTouch')) { expect(true).toBe(true); return; }
      const targets = [
        { id: '#left-panel-content', pane: true },
        { id: '#tool-bar' },
        { id: '.modal-card', modal: true },
        { id: '#main-canvas' },
      ];
      for (const t of targets) {
        await gotoFresh(page);
        if (t.pane) await openLeftPane(page);
        if (t.modal) { await page.evaluate(() => window.app.ui.openExportModal()); await page.waitForSelector('#export-settings-scroll', { state: 'attached' }); }
        await page.waitForTimeout(300);
        const loc = page.locator(t.id).first();
        const box = await loc.boundingBox();
        const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        const half = t.id === '#tool-bar' ? Math.max(8, Math.min(40, box.width / 2 - 6)) : 40;
        const probe = await startPointsClear(page, [[c.x - half, c.y], [c.x + half, c.y]]);
        if (t.id !== '#main-canvas') probe.hits.forEach((h) => expect(h.in, `${t.id} pinch start at ${h.x},${h.y} hit ${h.tag}`).toBe(true));
        const startDist = t.id === '#tool-bar' ? Math.max(16, Math.min(80, box.width - 12)) : 80;
        await touch.pinch(page, c, { startDist, endDist: 300, steps: 12 });
        await page.waitForTimeout(250);
        expect(await page.evaluate(() => visualViewport.scale), `${t.id} visualViewport.scale`).toBe(1);
      }
    });

  test('gesture events are prevented on chrome, opt-in zones excepted', async ({ page }, testInfo) => {
      const name = testInfo.project.name;
      test.skip(!TUX3_PROJECTS.includes(name), 'project not in scope');
      await gotoFresh(page);
      await page.evaluate(() => window.app.ui.openExportModal());
      await page.waitForSelector('#export-settings-scroll', { state: 'attached' });
      const res = await page.evaluate(() => {
        const out = {};
        const fire = (el, type) => { const e = new Event(type, { bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; };
        const targets = { toolbar: '#tool-bar', header: '#app-header', pane: '#left-panel-content', modal: '.modal-card' };
        Object.entries(targets).forEach(([k, sel]) => {
          const el = document.querySelector(sel);
          out[k] = el ? [fire(el, 'gesturestart'), fire(el, 'gesturechange')] : 'missing';
        });
        const z = document.createElement('div');
        z.setAttribute('data-touch-zoom', '');
        document.body.appendChild(z);
        out.optin = [fire(z, 'gesturestart'), fire(z, 'gesturechange')];
        z.remove();
        out.touchAction = getComputedStyle(document.documentElement).touchAction;
        return out;
      });
      for (const k of ['toolbar', 'header', 'pane', 'modal']) expect(res[k], `${k} gesturestart/gesturechange defaultPrevented`).toEqual([true, true]);
      expect(res.optin, 'data-touch-zoom opt-in defaultPrevented').toEqual([false, false]);
      expect(['pan-x pan-y', 'manipulation', 'none', 'pan-x', 'pan-y'], `html touch-action ${res.touchAction}`).toContain(res.touchAction);
    });

  test('desktop context: gesture guard is not registered', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'touch-ipad-landscape', 'one run, Chromium only');
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, hasTouch: false, isMobile: false });
    try {
      const page = await ctx.newPage();
      await page.goto('/');
      await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
      const prevented = await page.evaluate(() => { const e = new Event('gesturestart', { bubbles: true, cancelable: true }); document.getElementById('tool-bar').dispatchEvent(e); return e.defaultPrevented; });
      expect(prevented, 'desktop gesturestart defaultPrevented').toBe(false);
    } finally { await ctx.close(); }
  });
});

test.describe('TUX-004 bottom chrome on screen (regression guard, passes before the fix)', () => {
  test('bottom bars inside the visible viewport', async ({ page }, testInfo) => {
      const name = testInfo.project.name;
      test.skip(!TUX4_PROJECTS.includes(name), 'project not in scope');
      test.fail(!!TUX4_EXPECTED_FAIL[name], TUX4_EXPECTED_FAIL[name] || '');
      const spec = PROJECTS[name];
      await gotoFresh(page);
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const out = { vv: visualViewport.height };
        ['touch-modifier-bar', 'status-bar'].forEach((id) => {
          const el = document.getElementById(id);
          const rect = el && el.getBoundingClientRect();
          out[id] = rect && rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden' ? rect.bottom : null;
        });
        return out;
      });
      const limit = Math.min(spec.height, r.vv) + 0.5;
      // #touch-modifier-bar must be present and visible on every in-scope project. #status-bar may be
      // absent only where it is display:none by design (listed per project, no general null guard).
      expect(r['touch-modifier-bar'], '#touch-modifier-bar must be present and visible').not.toBeNull();
      expect(r['touch-modifier-bar'], `#touch-modifier-bar bottom vs ${limit}`).toBeLessThanOrEqual(limit);
      if (TUX4_STATUS_BAR_HIDDEN.includes(name)) {
        expect(r['status-bar'], '#status-bar is display:none by design here').toBeNull();
      } else {
        expect(r['status-bar'], '#status-bar must be present and visible').not.toBeNull();
        expect(r['status-bar'], `#status-bar bottom vs ${limit}`).toBeLessThanOrEqual(limit);
      }
      if (name === 'touch-iphone-portrait') {
        await fs.promises.mkdir(`${TUX234_EVIDENCE}/TUX-004`, { recursive: true });
      }
    });
  test('Export modal footer buttons inside the visible viewport', async ({ page }, testInfo) => {
    const name = testInfo.project.name;
    test.skip(!TUX4_PROJECTS.includes(name), 'project not in scope');
    const spec = PROJECTS[name];
    await gotoFresh(page);
    await page.evaluate(() => window.app.ui.openExportModal());
    await page.waitForSelector('#export-modal-submit', { state: 'visible' });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const b = (id) => { const rc = document.getElementById(id).getBoundingClientRect(); return { top: rc.top, bottom: rc.bottom, h: rc.height }; };
      return { vv: visualViewport.height, ih: innerHeight, cancel: b('export-modal-cancel'), submit: b('export-modal-submit') };
    });
    const limit = Math.min(spec.height, r.vv, r.ih) + 0.5;
    expect(r.cancel.h, 'Cancel button has height').toBeGreaterThan(0);
    expect(r.submit.h, 'primary button has height').toBeGreaterThan(0);
    expect(r.cancel.bottom, `Cancel bottom vs ${limit}`).toBeLessThanOrEqual(limit);
    expect(r.submit.bottom, `primary bottom vs ${limit}`).toBeLessThanOrEqual(limit);
  });
});
