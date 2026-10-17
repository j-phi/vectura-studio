const { evidenceDir, shoot } = require('../helpers/evidence');
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const core = require('../helpers/target-audit-core');
const touch = require('../helpers/touch');
const { PROJECTS } = require('./viewports');
const { STATES } = require('./target-audit-states');

// TUX-041 batch B2 (canvas context bar), strict slice. Q19 (Jay, 2026-10-14): the bar may grow to 52 px on touch.
// In the states default, layer-selected-handles, pen-path-anchors and text-panel (and the pen draft), every visible
// button, field and chip in `.ctxbar.is-visible`, and the overflow button, has a hit area of at least 44 x 44 CSS px.
// hitArea() counts ::before extensions, so an invisible expansion passes only when no neighbour steals its pixels.
const MIN = 44;
const BAR_STATES = ['default', 'layer-selected-handles', 'pen-path-anchors', 'text-panel'];
const TARGETS = 'button, input, select, textarea, [role="button"], a[href], [contenteditable="true"]';

async function openState(page, baseURL, id) {
  await core.bootApp(page, baseURL);
  const st = STATES.find((s) => s.id === id);
  await st.run(page);
  await expect.poll(() => st.post(page), { timeout: 10_000, message: `postcondition of ${id}` }).toBe(true);
  await core.waitLayoutSettled(page);
  await core.waitGeometryStable(page);
  await page.waitForTimeout(250);
}

async function barTargets(page) {
  return page.evaluate((sel) => {
    const bar = document.querySelector('.ctxbar.is-visible');
    if (!bar || !bar.checkVisibility()) return null;
    let n = 0;
    return [...bar.querySelectorAll(sel)]
      .filter((e) => e.checkVisibility() && e.getBoundingClientRect().width > 0 && getComputedStyle(e).pointerEvents !== 'none')
      .map((e) => { n += 1; e.setAttribute('data-b2-probe', String(n)); return { i: n, label: (e.getAttribute('aria-label') || e.getAttribute('data-action') || e.className || e.tagName).toString().trim().slice(0, 48) }; });
  }, TARGETS);
}

async function measure(page) {
  const items = await barTargets(page);
  if (!items) return { shown: false, bad: [], count: 0 };
  const bad = []; const covered = [];
  for (const it of items) {
    const loc = page.locator(`[data-b2-probe="${it.i}"]`);
    const a = await touch.hitArea(page, loc);
    if (a.w === 0 && a.h === 0) { covered.push(it.label); continue; } // under an open pane: the audit `covered` metric owns that
    if (a.w < MIN || a.h < MIN) bad.push(`${it.label} ${a.w}x${a.h}`);
  }
  return { shown: true, bad, covered, count: items.length };
}

test.describe('TUX-041 B2 context bar', () => {
  test.use({ reducedMotion: 'reduce' });
  test.describe.configure({ retries: 0 });

  for (const id of BAR_STATES) {
    test(`${id}: every context bar target is at least 44 x 44`, async ({ page, baseURL }, testInfo) => {
      await openState(page, baseURL, id);
      const r = await measure(page);
      testInfo.annotations.push({ type: 'B2', description: `${id}: ${r.count} targets, shown ${r.shown}` });
      if (!r.shown) { test.info().annotations.push({ type: 'ctxbar-hidden', description: id }); return; }
      if (r.covered.length) testInfo.annotations.push({ type: 'covered', description: r.covered.join(', ') });
      if (r.covered.length === r.count) {
        // Every target is under an open pane or its drawer backdrop (iPad portrait and phone landscape overlay drawers).
        const by = await page.evaluate(() => { const b = document.querySelector('.ctxbar.is-visible').getBoundingClientRect(); const t = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return t && t.closest('.mobile-pane-backdrop, #left-pane, #right-pane') ? 'pane' : (t && (t.className || t.id || t.tagName)).toString(); });
        expect(by, 'a bar that no finger can reach must sit under an open drawer pane or its backdrop').toBe('pane');
        return;
      }
      expect(r.bad, `${id} ctxbar targets under ${MIN}`).toEqual([]);
      // the bar fits inside its host
      const fit = await page.evaluate(() => {
        const bar = document.querySelector('.ctxbar.is-visible'); const host = bar.parentElement;
        const b = bar.getBoundingClientRect(); const h = host.getBoundingClientRect();
        return { excess: bar.scrollWidth - bar.clientWidth, l: b.left - h.left, r: h.right - b.right, t: b.top - h.top, b: h.bottom - b.bottom };
      });
      expect(fit.excess, 'bar content overflows the bar').toBeLessThanOrEqual(1);
      expect(Math.min(fit.l, fit.r, fit.t, fit.b), `bar inside host ${JSON.stringify(fit)}`).toBeGreaterThanOrEqual(-1);
    });
  }
  // Finger check: a real touch tap opens the More menu, and a neighbour tap never lands on the wrong control.
  // Screenshots go to test-results/evidence/B2/ (with VECTURA_E2E_EVIDENCE=1).
  test('finger taps: More opens its menu and each bar button is hit by its own centre', async ({ page, baseURL }, testInfo) => {
    await openState(page, baseURL, 'layer-selected-handles');
    const shown = await page.evaluate(() => (() => { const b = document.querySelector('.ctxbar.is-visible'); return !!b && b.checkVisibility(); })());
    test.skip(!shown, 'the context bar is hidden on this layout');
    const wrong = await page.evaluate(() => [...document.querySelectorAll('.ctxbar.is-visible .ctxbar-btn, .ctxbar.is-visible .pen-chip, .ctxbar.is-visible .ctxbar-handle')]
      .filter((e) => e.checkVisibility()).map((e) => { const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return t && (t === e || e.contains(t)) ? null : (e.className || e.tagName).toString(); }).filter(Boolean));
    expect(wrong, 'bar controls whose centre belongs to another element').toEqual([]);
    const dir = evidenceDir('B2');
    fs.mkdirSync(dir, { recursive: true });
    const name = testInfo.project.name;
    await shoot(page, { path: path.join(dir, `${name}-bar.png`), scale: 'css' });
    const more = page.locator('.ctxbar.is-visible .ctxbar-overflow');
    if (await more.count()) {
      await touch.tap(page, more.first());
      await expect.poll(() => page.evaluate(() => !!document.querySelector('.ctxbar-menu.is-open')), { timeout: 5000 }).toBe(true);
      await shoot(page, { path: path.join(dir, `${name}-more-open.png`), scale: 'css' });
    }
  });
  // Q19b: on touch-wide the bar is 44 px tall (controls fill it). No control may overlap a neighbour or leave the bar.
  test('touch-wide: the 44 px bar keeps 44 x 44 controls that do not overlap each other or the canvas bar edge', async ({ page, baseURL }) => {
    await openState(page, baseURL, 'layer-selected-handles');
    const r = await page.evaluate(() => {
      if (!document.body.classList.contains('touch-wide-layout')) return null;
      const bar = document.querySelector('.ctxbar.is-visible');
      if (!bar || !bar.checkVisibility()) return null;
      const b = bar.getBoundingClientRect();
      const els = [...bar.querySelectorAll('.ctxbar-btn, .ctxbar-handle, .ctxbar-overflow, .pen-chip, .ctxbar-stepper, .ctxbar-field')].filter((e) => e.checkVisibility());
      const rects = els.map((e) => ({ n: String(e.className).slice(0, 40), r: e.getBoundingClientRect() }));
      const overlaps = []; const outside = []; const small = [];
      rects.forEach((a, i) => {
        if (a.r.width < 44 - 0.5 || a.r.height < 44 - 0.5) small.push(`${a.n} ${a.r.width.toFixed(1)}x${a.r.height.toFixed(1)}`);
        if (a.r.left < b.left - 0.5 || a.r.right > b.right + 0.5 || a.r.top < b.top - 0.5 || a.r.bottom > b.bottom + 0.5) outside.push(a.n);
        rects.slice(i + 1).forEach((c) => {
          if (a.r.left < c.r.right - 0.5 && c.r.left < a.r.right - 0.5 && a.r.top < c.r.bottom - 0.5 && c.r.top < a.r.bottom - 0.5) {
            const pa = els[i]; const pc = els[rects.indexOf(c)];
            if (!pa.contains(pc) && !pc.contains(pa)) overlaps.push(`${a.n} / ${c.n}`);
          }
        });
      });
      // elementFromPoint at each control centre must belong to that control.
      const stolen = els.filter((e) => { const q = e.getBoundingClientRect(); const t = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2); return !(t && (t === e || e.contains(t))); }).map((e) => String(e.className).slice(0, 40));
      return { h: b.height, overlaps, outside, small, stolen, n: els.length };
    });
    test.skip(!r, 'touch-wide only');
    expect(r.n, 'controls probed').toBeGreaterThan(0);
    expect(r.h, 'bar height').toBeLessThanOrEqual(52);
    expect(r.small, 'controls under 44').toEqual([]);
    expect(r.overlaps, 'overlapping controls').toEqual([]);
    expect(r.outside, 'controls outside the bar').toEqual([]);
    expect(r.stolen, 'controls whose centre belongs to another element').toEqual([]);
  });
});
