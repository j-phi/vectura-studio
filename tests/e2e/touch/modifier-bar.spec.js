const { evidenceDir, shoot } = require('../helpers/evidence');
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { PROJECTS } = require('./viewports');
const touch = require('../helpers/touch');
const { openPane, addLayer } = require('./target-audit-states');
const core = require('../helpers/target-audit-core');

// TUX-045: modifier tasks (Multi-select, Constrain, Duplicate, Pan) as one-shot latches with a double-tap lock.
const EVIDENCE = evidenceDir('TUX-045');
const TASKS = ['multi-select', 'constrain', 'duplicate', 'pan'];

const gotoApp = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.Vectura.InputModifiers));
};
const st = (page, task) => page.evaluate((t) => window.Vectura.InputModifiers.getTaskState(t), task);
const btn = (page, task) => page.locator(`#touch-modifier-bar [data-touch-mod="${task}"]`);
const shot = async (page, testInfo, name) => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  await shoot(page, { path: `${EVIDENCE}/${testInfo.project.name}${name ? `-${name}` : ''}.png` });
};
const canvasPoint = (page) => page.evaluate(() => {
  const r = document.getElementById('main-canvas').getBoundingClientRect();
  // Sample for an uncovered canvas point, away from edges.
  for (const [fx, fy] of [[0.5, 0.5], [0.4, 0.6], [0.6, 0.4], [0.5, 0.7]]) {
    const x = r.left + r.width * fx;
    const y = r.top + r.height * fy;
    if (document.elementFromPoint(x, y)?.id === 'main-canvas') return { x, y };
  }
  return null;
});
const canvasTap = async (page) => {
  const p = await canvasPoint(page);
  expect(p, 'an uncovered canvas point').toBeTruthy();
  await page.touchscreen.tap(p.x, p.y);
};

test.describe('TUX-045 modifier bar', () => {
  test.beforeEach(async ({ page }) => { await gotoApp(page); });

  test('four named tasks, no keyboard-key buttons, 44 px targets, bar inside the viewport', async ({ page }, testInfo) => {
    const names = await page.evaluate(() => [...document.querySelectorAll('#touch-modifier-bar .touch-mod-btn')]
      .map((b) => (b.getAttribute('aria-label') || '').toLowerCase()));
    expect(names).toEqual(TASKS);
    const keys = await page.evaluate(() => [...document.querySelectorAll('#touch-modifier-bar .touch-mod-btn')]
      .map((b) => `${b.dataset.touchMod} ${b.getAttribute('aria-label')} ${b.title}`.toLowerCase()).join('|'));
    expect(keys).not.toMatch(/\b(cmd|ctrl|shift|alt|command|option)\b/);
    for (const t of ['multiSelect', 'constrain', 'duplicate', 'pan']) {
      const hit = await core.probeHit(page, await btn(page, t).elementHandle(), { stopAt: 44, radius: 48 });
      expect(Math.min(hit.w, hit.h), `${t} hit area ${hit.w}x${hit.h}`).toBeGreaterThanOrEqual(44);
    }
    const geo = await page.evaluate(() => {
      const r = document.getElementById('touch-modifier-bar').getBoundingClientRect();
      return { bottom: r.bottom, h: innerHeight, w: r.width, hh: r.height };
    });
    expect(geo.bottom).toBeLessThanOrEqual(geo.h + 0.5);
    await shot(page, testInfo, '');
  });

  test('a single tap latches; the next canvas tap releases it', async ({ page }) => {
    await touch.tap(page, btn(page, 'constrain'));
    await page.waitForTimeout(450);
    expect(await st(page, 'constrain')).toBe('latched');
    await canvasTap(page);
    await page.waitForTimeout(100);
    expect(await st(page, 'constrain')).toBe('off');
  });

  test('a slow second tap turns it off; a quick pair locks, shows the badge, and survives gestures', async ({ page }, testInfo) => {
    await touch.tap(page, btn(page, 'constrain'));
    await page.waitForTimeout(450);
    await touch.tap(page, btn(page, 'constrain'));
    expect(await st(page, 'constrain')).toBe('off');
    // Quick pair: dispatch two pointerups 120 ms apart on the real button (the tap helper's own latency varies by engine).
    await touch.tap(page, btn(page, 'duplicate'));
    await page.waitForTimeout(60);
    await touch.tap(page, btn(page, 'duplicate'));
    expect(await st(page, 'duplicate')).toBe('locked');
    const badge = page.locator('#touch-mod-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(/duplicate/i);
    const ov = await page.evaluate(() => {
      const b = document.getElementById('touch-mod-badge').getBoundingClientRect();
      const hit = (sel) => {
        const e = document.querySelector(sel);
        if (!e || e.offsetParent === null && getComputedStyle(e).position !== 'fixed') return false;
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top;
      };
      return { notif: hit('#notification-area:not(:empty)'), bar: hit('#touch-modifier-bar'), inside: b.left >= 0 && b.top >= 0 && b.right <= innerWidth };
    });
    expect(ov.notif, 'badge vs notification area').toBe(false);
    expect(ov.bar, 'badge vs modifier bar').toBe(false);
    expect(ov.inside, 'badge inside the viewport').toBe(true);
    await canvasTap(page);
    await canvasTap(page);
    await page.waitForTimeout(100);
    expect(await st(page, 'duplicate')).toBe('locked');
    await shot(page, testInfo, 'locked');
    await touch.tap(page, btn(page, 'duplicate'));
    expect(await st(page, 'duplicate')).toBe('off');
  });

  test('iPhone landscape: side column or one Modifiers button, and no covered targets', async ({ page }, testInfo) => {
    test.skip(PROJECTS[testInfo.project.name]?.device !== 'iPhL', 'iPhone landscape only');
    const shape = await page.evaluate(() => {
      const r = document.getElementById('touch-modifier-bar').getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    expect(shape.h, `bar ${shape.w}x${shape.h}`).toBeGreaterThan(shape.w);
    const covered = (sel) => page.evaluate((sel) => {
      const out = [];
      document.querySelectorAll(sel).forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (hit && hit.closest('.touch-mod-btn')) out.push(sel);
      });
      return out;
    }, sel);
    // s1: paint bucket with its context bar.
    await addLayer(page, 'wavetable');
    await page.evaluate(() => window.app.ui.setActiveTool('fill'));
    await page.waitForTimeout(400);
    expect(await covered('#paint-bucket-pen'), 's1 paint bucket pen').toEqual([]);
    await shot(page, testInfo, 's1');
    // s2: Noise Rack scrolled to the bottom.
    await page.evaluate(() => window.app.ui.setActiveTool('select'));
    await openPane(page, 'left');
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const pane = document.getElementById('left-pane');
      pane.querySelectorAll('*').forEach((e) => { if (e.scrollHeight > e.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(e).overflowY)) e.scrollTop = e.scrollHeight; });
    });
    await page.waitForTimeout(200);
    expect(await covered('#left-pane .info-btn'), 's2 info buttons').toEqual([]);
    // s3: Petal Designer window.
    const id = await addLayer(page, 'petalisDesigner');
    await page.evaluate((id) => {
      const layer = window.app.engine.layers.find((l) => l.id === id);
      window.app.ui.openPetalDesigner({ layer, fromInline: true });
    }, id);
    await page.waitForSelector('#petal-designer-window');
    await page.waitForTimeout(400);
    expect(await covered('#petal-designer-window input[data-petal-inner-outer-lock], #petal-designer-window .petal-close'), 's3 designer controls').toEqual([]);
    await shot(page, testInfo, 's3');
  });
});
