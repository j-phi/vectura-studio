const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-041 (owned-surfaces slice, lane C1): every control on the surfaces below is >= 44px in
// both axes by helpers/touch.js hitArea() (counts ::before extensions), or allowlisted.
// Lane-local spec. D4 pending TUX-058/059/060 (lane H/G): lane H adopts this logic and the
// ALLOWLIST into tests/e2e/touch/target-allowlist.json and lowers target-baseline.json.
// Treat the C1 surface list as the first strict slice.
//
// EXCLUDED surfaces (later ratchet slices):
//   input[type=range] and slider tracks ........ TUX-043 (next unit in lane C)
//   menus / context menus ...................... lane M
//   header / menubar ........................... lane S2
//   .tool-btn, toolbar, drawer ................. lane B and TUX-006
//   ctxbar flyouts ............................. (ctxbar slice)
//   Text panel .vtp-* .......................... lane T
//   modals, Export, Document Setup ............. lane X
//   pane toggles (.pane-toggle) ................ lane S

const MIN = 44;
const FLOOR = 24;

// TODO: migrate to tests/e2e/touch/target-allowlist.json when TUX-058 lands. Max 10 entries.
const ALLOWLIST = [
  // { selector: '...', reason: '...' },
];

const SURFACES = {
  'layers: row buttons': '#right-pane .lvl-grip, #right-pane .lvl-ab, #right-pane .lvl-ib, #right-pane .lvl-caret',
  'layers: header': '#layer-search-input, #layer-filter-btn, #btn-add-layer, #right-pane .right-pane-tab, #draw-order-overlay-toggle, #draw-order-color-settings, #draw-order-settings',
  'left: section headers': '#left-pane .left-panel-section-header, #left-pane .global-section-header',
  'left: presets and selects': '#left-pane .hg-preset-trigger, #left-pane #generator-module-trigger, #left-pane select:not(.sr-only)',
  'left: info buttons': '#left-pane .info-btn',
  'left: noise rack': '#left-pane .noise-add, #left-pane .noise-grip, #left-pane .noise-delete, #left-pane .noise-reset, #left-pane .noise-rand, #left-pane .sw-toggle',
  'left: value chips': '#left-pane .slider-val, #left-pane .slider-val-inp, #left-pane .angle-inp',
  'left: other controls': '#left-pane button.w-full, #left-pane input.w-full, #left-pane .angle-dial',
  'pens rows': '.pen-grip, .pen-item .pen-color, .pen-name-input, .pen-width-value, .pen-remove',
  'modifier bar': '#touch-modifier-bar .touch-mod-btn',
};
const GROUP_PANE = (g) => (g.startsWith('layers') || g.startsWith('pens') ? 'right' : g.startsWith('left') ? 'left' : 'none');

// Hard-coded RED values for fit non-regression (measured on the pre-fix tree, default state).
// share = canvasShare() %, overflow = scrollWidth - innerWidth. iPhL / iPhL-c measure 0 share on
// the pre-fix tree (the default phone-landscape layout covers the canvas), so they only pin overflow.
// webkit-iphone-portrait overflow 142 is the known TUX-001 defect, not C1's.
const FIT_RED = {
  'touch-ipad-portrait': { overflow: 0, share: 24.0 },
  'touch-ipad-landscape': { overflow: 0, share: 46.12 },
  'touch-iphone-portrait': { overflow: 0, share: 25.45 },
  'touch-iphone-landscape': { overflow: 0, share: 0 },
  'touch-iphone-portrait-chrome': { overflow: 0, share: 24.24 },
  'touch-iphone-landscape-chrome': { overflow: 0, share: 0 },
  'touch-coarse-wide': { overflow: 0, share: 52.38 },
  'webkit-ipad-portrait': { overflow: 0, share: 24.0 },
  'webkit-ipad-landscape': { overflow: 0, share: 46.12 },
  'webkit-iphone-portrait': { overflow: 142, share: 48.61 },
  'webkit-iphone-landscape': { overflow: 0, share: 0 },
};

// SETUP STEP (not a journey step): phone panes start closed and TUX-010 has not landed, so the
// spec opens one pane programmatically. Remove once TUX-010 lands.
const showPane = (page, side) => page.evaluate((s) => {
  const l = document.getElementById('left-pane');
  const r = document.getElementById('right-pane');
  l.classList.toggle('pane-force-open', s === 'left');
  r.classList.toggle('pane-force-open', s === 'right');
}, side);

const boot = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  // SETUP: layers through the engine API so rows, the generator panel and the noise rack render.
  await page.evaluate(() => {
    const id = window.app.engine.addLayer('flowfield');
    window.app.engine.addLayer('spiral');
    window.app.engine.activeLayerId = id;
    window.app.ui.renderLayers();
    if (window.app.ui.buildControls) window.app.ui.buildControls();
  });
  await page.waitForTimeout(600);
};

// Inline WCAG 2.5.8 logic copied from docs/touch-audit/scripts/target-audit.js (do not import it).
// 24px circle on A's centre must not reach B's box (or B's own 24px circle when B is undersized).
const wcagOk = (a, others) => {
  const acx = a.x + a.w / 2;
  const acy = a.y + a.h / 2;
  return others.every((b) => {
    const nx = Math.max(b.x, Math.min(acx, b.x + b.w));
    const ny = Math.max(b.y, Math.min(acy, b.y + b.h));
    if (Math.hypot(nx - acx, ny - acy) < 12) return false;
    if (!(b.w >= FLOOR && b.h >= FLOOR) && Math.hypot(b.x + b.w / 2 - acx, b.y + b.h / 2 - acy) < 24) return false;
    return true;
  });
};

// Tag visible candidate elements of a group; returns their count.
const tagGroup = (page, group, selector) => page.evaluate(({ group, selector }) => {
  const out = [];
  document.querySelectorAll(selector).forEach((el) => {
    if (el.matches('input[type=range]')) return;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return;
    if (el.closest('[hidden], .hidden, .sr-only, [aria-hidden=true]')) return;
    out.push(el);
  });
  document.querySelectorAll('[data-tuxm]').forEach((e) => e.removeAttribute('data-tuxm'));
  out.forEach((el, i) => { el.dataset.tuxm = String(i); el.dataset.tuxg = group; });
  return out.length;
}, { group, selector });

const measureGroup = async (page, group, selector) => {
  const n = await tagGroup(page, group, selector);
  const res = { n, measured: 0, small: [], covered: [], allow: [] };
  for (let i = 0; i < n; i += 1) {
    const loc = page.locator(`[data-tuxm="${i}"]`);
    const info = await loc.evaluate((el, allowSels) => {
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const on = cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight;
      const cls = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.');
      const sel = el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (cls ? `.${cls}` : '');
      const allowed = allowSels.some((s) => el.matches(s));
      const others = [...document.querySelectorAll('[data-tuxm]')].filter((o) => o !== el).map((o) => {
        const b = o.getBoundingClientRect();
        return { x: b.left, y: b.top, w: b.width, h: b.height };
      });
      return { on, sel, allowed, rect: { x: r.left, y: r.top, w: r.width, h: r.height }, others };
    }, ALLOWLIST.map((a) => a.selector));
    if (!info.on) continue;
    const area = await touch.hitArea(page, loc);
    res.measured += 1;
    if (area.w === 0 && area.h === 0) { res.covered.push({ sel: info.sel }); continue; }
    if (area.w >= MIN && area.h >= MIN) continue;
    if (info.allowed) {
      const ok = area.w >= FLOOR && area.h >= FLOOR && wcagOk(info.rect, info.others);
      res.allow.push({ sel: info.sel, w: area.w, h: area.h, ok });
    } else {
      res.small.push({ sel: info.sel, w: area.w, h: area.h });
    }
  }
  return res;
};

test.describe('TUX-041 owned-surface touch targets', () => {
  test('allowlist is small and well formed', () => {
    expect(ALLOWLIST.length).toBeLessThanOrEqual(10);
    ALLOWLIST.forEach((a) => { expect(a.selector).toBeTruthy(); expect(a.reason).toBeTruthy(); });
  });

  test('every owned-surface target is >= 44px (hitArea), none covered', async ({ page }, testInfo) => {
    await boot(page);
    // Pens rows live on the Pens tab of the right pane.
    const report = {};
    for (const [group, selector] of Object.entries(SURFACES)) {
      const side = GROUP_PANE(group);
      if (side !== 'none') await showPane(page, side);
      if (group.startsWith('pens')) await page.click('.right-pane-tab[data-tab=pens]');
      else if (group.startsWith('layers')) await page.click('.right-pane-tab[data-tab=layers]');
      await page.waitForTimeout(250);
      report[group] = await measureGroup(page, group, selector);
    }
    const lines = Object.entries(report).map(([g, r]) => `${g}: n=${r.n} measured=${r.measured} small=${r.small.length} covered=${r.covered.length}`);
    const small = Object.entries(report).flatMap(([g, r]) => r.small.map((o) => ({ g, ...o })));
    const covered = Object.entries(report).flatMap(([g, r]) => r.covered.map((o) => ({ g, ...o })));
    const allowBad = Object.values(report).flatMap((r) => r.allow.filter((a) => !a.ok));
    testInfo.annotations.push({ type: 'measured', description: `${small.length} small, ${covered.length} covered | ${lines.join(' | ')}` });
    // (b) a selector that silently matches nothing must fail.
    Object.entries(report).forEach(([g, r]) => expect(r.measured, `no element measured for "${g}"`).toBeGreaterThan(0));
    expect.soft(covered, `covered (hitArea 0x0):\n${JSON.stringify(covered)}`).toEqual([]);
    const byGroup = {};
    small.forEach((o) => { byGroup[o.g] = (byGroup[o.g] || 0) + 1; });
    expect.soft(small, `${small.length} targets < ${MIN}px ${JSON.stringify(byGroup)}:\n${small.slice(0, 400).map((o) => `${o.g} ${o.sel} ${o.w}x${o.h}`).join('\n')}`).toEqual([]);
    expect.soft(allowBad, 'allowlisted targets must be >= 24px and pass WCAG 2.5.8 spacing').toEqual([]);
  });

  test('fit non-regression: no new overflow, canvas share held, layer rows fit the pane', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
    const share = await touch.canvasShare(page);
    testInfo.annotations.push({ type: 'measured', description: `overflow=${overflow} canvasShare=${share.toFixed(2)}` });
    const red = FIT_RED[testInfo.project.name];
    if (red) {
      expect(overflow).toBeLessThanOrEqual(red.overflow);
      expect(share).toBeGreaterThanOrEqual(red.share - 1);
    }
    await boot(page);
    await showPane(page, 'right');
    await page.waitForTimeout(300);
    const spill = await page.evaluate(() => [...document.querySelectorAll('#right-pane .lvl-card, #right-pane .lvl-grp-hdr')]
      .filter((c) => c.scrollWidth > c.clientWidth + 1).map((c) => ({ cls: c.className, sw: c.scrollWidth, cw: c.clientWidth })));
    expect(spill).toEqual([]);
  });
});
