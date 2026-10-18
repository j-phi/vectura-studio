const { evidenceDir, shoot } = require('../helpers/evidence');
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-012 review (batch 3b): a context menu that scrolls shows a visible fade at the scroll edge where more rows exist.
// iOS overlay scrollbars are hidden, so at 874x330 "Make Clipping Mask" sat 46 px below the fold with no cue.
// The cue is a ::after (more below) / ::before (more above) fade, driven by data-scroll-cue on the menu.
const EVID = evidenceDir('batch3b');

const boot = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  const id = await page.evaluate(() => {
    const { engine, ui } = window.app;
    ['spiral', 'flowfield'].forEach((t) => engine.addLayer(t));
    const pid = engine.addLayer('polyhedron');
    ui.renderLayers();
    return pid;
  });
  await page.evaluate(() => {
    const pane = document.getElementById('right-pane');
    if (document.body.classList.contains('auto-collapsed')) pane.classList.add('pane-force-open');
    else pane.classList.remove('pane-collapsed');
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.app.ui.renderLayers());
  return id;
};

const cue = (page) => page.evaluate(() => {
  const m = document.querySelector('.menu-dropdown.is-context-menu.open');
  if (!m) return null;
  const a = getComputedStyle(m, '::after');
  const b = getComputedStyle(m, '::before');
  const vis = (cs) => cs.content !== 'none' && parseFloat(cs.opacity) > 0.5 && parseFloat(cs.height) >= 12;
  return {
    overflow: m.scrollHeight - m.clientHeight > 1, scrollTop: m.scrollTop, attr: m.dataset.scrollCue || '',
    below: vis(a), above: vis(b), maxScroll: m.scrollHeight - m.clientHeight,
    pe: [a.pointerEvents, b.pointerEvents],
  };
});

test('(cue) an overflowing layer menu shows a fade where rows are hidden; a fitting menu shows none', async ({ page }, testInfo) => {
  const id = await boot(page);
  const more = page.locator(`#layer-list [data-layer-id="${id}"] .lvl-more`);
  await more.scrollIntoViewIfNeeded();
  await touch.tap(page, more);
  await expect(page.locator('.menu-dropdown.is-context-menu.open')).toBeVisible();
  await page.waitForTimeout(350);
  const c0 = await cue(page);
  fs.mkdirSync(EVID, { recursive: true });
  await shoot(page, { path: `${EVID}/menu-cue-${testInfo.project.name}.png` });
  if (!c0.overflow) {
    expect(c0.below, `a menu that fits shows no cue ${JSON.stringify(c0)}`).toBe(false);
    expect(c0.above).toBe(false);
    expect(c0.attr).toBe('');
    return;
  }
  expect(c0.below, `more rows below: the bottom fade is visible ${JSON.stringify(c0)}`).toBe(true);
  expect(c0.above, 'at the top there is no top fade').toBe(false);
  expect(c0.pe, 'the fade never takes taps').toEqual(['none', 'none']);
  // Scroll to the end: the bottom fade goes, the top fade appears.
  await page.evaluate(() => { const m = document.querySelector('.menu-dropdown.is-context-menu.open'); m.scrollTop = m.scrollHeight; });
  await expect.poll(async () => { const c = await cue(page); return `${c.below}/${c.above}`; }, { timeout: 3000 }).toBe('false/true');
});

// Q22: a pane body that hides controls below its fold carries a scroll cue (data-scroll-cue) and draws the fade on touch.
test('Q22: the left pane body marks the hidden edge and the fade shows', async ({ page, baseURL }) => {
  const core = require('../helpers/target-audit-core');
  const { STATES } = require('./target-audit-states');
  await core.bootApp(page, baseURL);
  const st = STATES.find((s) => s.id === 'text-panel');
  await st.run(page);
  await core.waitLayoutSettled(page);
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => {
    const el = document.getElementById('left-panel-content');
    const max = el.scrollHeight - el.clientHeight;
    const fade = (side) => { const cs = getComputedStyle(el, side); return { opacity: cs.opacity, h: cs.height, pe: cs.pointerEvents }; };
    const top = { cue: el.dataset.scrollCue || '', max, after: fade('::after'), before: fade('::before') };
    el.scrollTop = max;
    return new Promise((res) => setTimeout(() => res({ top, bottom: { cue: el.dataset.scrollCue || '', before: fade('::before'), after: fade('::after') } }), 250));
  });
  expect(info.top.max, 'the text panel scrolls').toBeGreaterThan(1);
  expect(info.top.cue).toContain('below');
  expect(info.top.cue).not.toContain('above');
  expect(info.top.after.opacity).toBe('1');
  expect(info.top.after.pe).toBe('none');
  expect(info.bottom.cue).toContain('above');
  expect(info.bottom.cue).not.toContain('below');
  expect(info.bottom.before.opacity).toBe('1');
  expect(info.bottom.after.opacity).toBe('0');
});
