const fs = require('fs');
const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-036 + TUX-041: the multi-select action strip (#layer-status-bar) fits the Layers pane, every button
// is a finger target (>= 44 px both axes), Delete keeps a gap to Duplicate, and an ineligible button
// answers a tap with a toast (a `title` is invisible to a finger).
const EVID = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/batch3/strip';
const MIN = 44;
const SCREEN_SEL = ['#touch-modifier-bar'];

const boot = async (page, types = ['wavetable', 'wavetable']) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  await page.evaluate((ts) => {
    const e = window.app.engine;
    const ids = ts.map((t) => e.addLayer(t));
    window.app.renderer.selectedLayerIds = new Set(ids);
    window.app.ui.renderLayers();
  }, types);
  await page.waitForTimeout(300);
  const open = () => page.evaluate(() => {
    const r = document.getElementById('right-pane').getBoundingClientRect();
    return r.width > 100 && r.right > 60 && r.left < innerWidth - 60;
  });
  if (!(await open())) {
    await page.evaluate(() => (document.getElementById('btn-pane-toggle-right') || document.getElementById('btn-mobile-pane-right')).click());
    await page.waitForTimeout(700);
  }
  await page.evaluate(() => document.querySelector('#right-pane .right-pane-tab[data-tab="layers"]')?.click());
  await page.waitForTimeout(400);
};

const measure = (page) => page.evaluate(() => {
  const bar = document.getElementById('layer-status-bar');
  const pane = document.getElementById('right-pane').getBoundingClientRect();
  const mod = document.getElementById('touch-modifier-bar');
  const modR = mod && getComputedStyle(mod).position !== 'static' ? null : mod && mod.getBoundingClientRect();
  const btns = [...bar.querySelectorAll('.lvl-cb')].map((b) => {
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { title: b.title, cls: b.className, x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, hitIsBtn: !!(hit && (hit === b || b.contains(hit))) };
  });
  const br = bar.getBoundingClientRect();
  return {
    vw: innerWidth, vh: innerHeight, pane: { l: pane.left, r: pane.right, t: pane.top, b: pane.bottom },
    bar: { l: br.left, r: br.right, t: br.top, b: br.bottom, sw: bar.scrollWidth, cw: bar.clientWidth, sh: bar.scrollHeight, ch: bar.clientHeight },
    modTop: modR ? modR.top : null, btns,
  };
});

test.describe('TUX-036/041 multi-select strip', () => {
  test('every strip button fits the pane and the screen, is >= 44 px and hit-testable', async ({ page }, testInfo) => {
    await boot(page);
    const m = await measure(page);
    expect(m.btns.length, 'strip buttons present').toBeGreaterThanOrEqual(4);
    const bad = [];
    m.btns.forEach((b) => {
      if (b.x < m.pane.l - 0.5 || b.r > Math.min(m.pane.r, m.vw) + 0.5) bad.push(`${b.title}: x ${Math.round(b.x)}-${Math.round(b.r)} outside pane ${Math.round(m.pane.l)}-${Math.round(m.pane.r)} / screen ${m.vw}`);
      if (b.y < m.pane.t - 0.5 || b.b > Math.min(m.pane.b, m.vh) + 0.5) bad.push(`${b.title}: y ${Math.round(b.y)}-${Math.round(b.b)} outside pane/screen`);
      if (b.w < MIN - 0.5 || b.h < MIN - 0.5) bad.push(`${b.title}: ${Math.round(b.w)}x${Math.round(b.h)} < ${MIN}`);
      if (!b.hitIsBtn) bad.push(`${b.title}: centre hit-tests to another element`);
    });
    expect(bad, 'strip button problems').toEqual([]);
    expect(m.bar.sw, 'strip does not overflow sideways').toBeLessThanOrEqual(m.bar.cw + 1);
    expect(m.bar.sh, 'strip does not clip vertically').toBeLessThanOrEqual(m.bar.ch + 1);
    fs.mkdirSync(EVID, { recursive: true });
    await page.screenshot({ path: `${EVID}/${testInfo.project.name}.png` });
  });

  test('Delete keeps a gap of at least 8 px to Duplicate (TUX-036 req 5)', async ({ page }) => {
    await boot(page);
    const m = await measure(page);
    const dup = m.btns.find((b) => /^Duplicate/.test(b.title));
    const del = m.btns.find((b) => /^Delete/.test(b.title));
    const gapX = Math.max(del.x - dup.r, dup.x - del.r);
    const gapY = Math.max(del.y - dup.b, dup.y - del.b);
    expect(Math.max(gapX, gapY), 'gap between Duplicate and Delete').toBeGreaterThanOrEqual(8 - 0.5);
  });

  test('the ⋯ menu holds Hide, Lock and Group, opens inside the screen and runs an action', async ({ page }) => {
    await boot(page);
    await touch.tap(page, page.locator('#layer-status-bar .lvl-sb-more'));
    const m = await page.evaluate(() => {
      const el = document.querySelector('.menu-dropdown.open');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { labels: [...el.querySelectorAll('.menu-entry')].map((e) => e.textContent.trim()), l: r.left, t: r.top, r: r.right, b: r.bottom, vw: innerWidth, vh: innerHeight };
    });
    expect(m, 'the ⋯ menu opened').not.toBeNull();
    expect(m.labels.join('|')).toMatch(/Hide selected.*Lock selected.*Group selected/);
    expect(m.l).toBeGreaterThanOrEqual(-0.5);
    expect(m.t).toBeGreaterThanOrEqual(-0.5);
    expect(m.r).toBeLessThanOrEqual(m.vw + 0.5);
    expect(m.b).toBeLessThanOrEqual(m.vh + 0.5);
    const before = await page.evaluate(() => window.app.engine.layers.filter((l) => l.isGroup).length);
    await touch.tap(page, page.locator('.menu-dropdown.open .menu-entry', { hasText: 'Group selected' }));
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.app.engine.layers.filter((l) => l.isGroup).length), 'Group ran').toBe(before + 1);
  });

  test('every ⋯ menu row (Hide, Lock, Group, Expand) is at least 44 px', async ({ page }, testInfo) => {
    await boot(page);
    await touch.tap(page, page.locator('#layer-status-bar .lvl-sb-more'));
    await expect(page.locator('.menu-dropdown.open')).toBeVisible();
    const rows = await page.evaluate(() => [...document.querySelectorAll('.menu-dropdown.open .menu-entry')].map((e) => ({ t: e.textContent.trim(), h: e.getBoundingClientRect().height })));
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(rows.filter((r) => r.h < MIN - 0.5), `rows under ${MIN} px: ${JSON.stringify(rows)}`).toEqual([]);
    fs.mkdirSync('/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/batch3b', { recursive: true });
    await page.screenshot({ path: `/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/batch3b/strip-menu-${testInfo.project.name}.png` });
  });

  test('a tap on an ineligible strip button explains itself with a toast', async ({ page }) => {
    // A modifier group on top is not a clip source; find a top layer type that is ineligible.
    await boot(page, ['wavetable', 'wavetable']);
    const type = await page.evaluate(() => {
      const e = window.app.engine;
      for (const t of ['text', 'object3d', 'scene3d', 'sceneLight3d', 'petalisDesigner', 'svgDistort']) {
        try {
          const id = e.addLayer(t);
          const l = e.getLayerById(id);
          if (l && !(l.maskCapabilities && l.maskCapabilities.canSource) && !l.isGroup) return { t, id };
          e.removeLayer && e.removeLayer(id);
        } catch (_) { /* try next */ }
      }
      return null;
    });
    test.skip(!type, 'no ineligible layer type found');
    await page.evaluate((id) => {
      const first = [...window.app.renderer.selectedLayerIds];
      window.app.renderer.selectedLayerIds = new Set([...first, id]);
      window.app.ui.renderLayers();
    }, type.id);
    await page.waitForTimeout(300);
    const mask = page.locator('#layer-status-bar .mask-btn.ineligible');
    expect(await mask.count(), 'mask button is ineligible').toBe(1);
    expect(await page.locator('.vectura-toast').count()).toBe(0);
    await touch.tap(page, mask);
    await expect(page.locator('.vectura-toast').first()).toContainText(/clip|mask/i);
  });
});
