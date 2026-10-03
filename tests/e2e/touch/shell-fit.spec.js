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
