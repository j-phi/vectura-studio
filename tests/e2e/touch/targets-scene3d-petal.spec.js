const { evidenceDir, shoot } = require('../helpers/evidence');
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const core = require('../helpers/target-audit-core');
const touch = require('../helpers/touch');
const sweep = require('../helpers/target-sweep');
const { STATES } = require('./target-audit-states');

// TUX-041 batch B5 (Scene3D, Petal Designer, Pattern designer), strict slice. Every interactive target on these surfaces has a hit
// area of at least 44 x 44 CSS px on every touch project, and its centre resolves to itself (no neighbour owns it).
// B5_LOG=1 prints the measured offenders per scenario. B5_SHOT=<dir> saves a screenshot per scenario.
// Finger-tap screenshots go to test-results/evidence/B5/ (with VECTURA_E2E_EVIDENCE=1).
const MIN = sweep.MIN;
const EVIDENCE = evidenceDir('B5');
const shot = async (page, name) => { fs.mkdirSync(EVIDENCE, { recursive: true }); await shoot(page, { path: path.join(EVIDENCE, `${name}.png`), scale: 'css' }); };
const ROOTS = ['.vs3-more-menu', '.petal-designer-window', '#left-pane', '#right-pane', '#bottom-pane'];
const POPUPS = ['.vs3-more-menu', '.hg-preset-popover', '.lvl-ctx-menu', '[role="menu"]'];

async function boot(page, baseURL) { await core.bootApp(page, baseURL); }

const runState = async (page, id) => {
  const st = STATES.find((s) => s.id === id);
  await st.run(page);
  await expect.poll(() => st.post(page), { timeout: 10_000, message: `postcondition of ${id}` }).toBe(true);
  await core.waitLayoutSettled(page);
  await page.waitForTimeout(200);
};

const expandAll = async (page) => {
  await page.evaluate(() => {
    document.querySelectorAll('#left-pane [aria-expanded="false"]:is(.left-panel-section-header, .global-section-header, .sect-hdr, .noise-list-header, [id$="-header"]), .petal-designer-window [aria-expanded="false"]').forEach((h) => h.click());
  });
  await page.waitForTimeout(350);
  await core.waitLayoutSettled(page);
};

const report = async (page, testInfo, id, roots = ROOTS) => {
  const r = await sweep.measure(page, { roots, popups: POPUPS });
  testInfo.annotations.push({ type: 'B5', description: `${id}: ${r.count} targets, ${r.bad.length} under ${MIN}` });
  if (process.env.B5_LOG) console.log('B5RED', testInfo.project.name, id, JSON.stringify(r));
  if (process.env.B5_SHOT) { fs.mkdirSync(process.env.B5_SHOT, { recursive: true }); await page.screenshot({ path: path.join(process.env.B5_SHOT, `${testInfo.project.name}-${id}.png`), scale: 'css' }); }
  expect(r.count, `${id}: has targets`).toBeGreaterThan(0);
  expect(r.bad, `${id} targets under ${MIN}`).toEqual([]);
  expect(r.stolen, `${id} targets whose centre a neighbour owns`).toEqual([]);
  expect(r.overflow, `${id} targets that run past the edge that clips them`).toEqual([]);
};

const tab = async (page, name) => {
  await page.waitForFunction((name) => [...document.querySelectorAll('.vs3-panel .tab-bar .tab-btn')].some((x) => x.textContent.trim().toLowerCase() === name), name);
  await page.evaluate((name) => [...document.querySelectorAll('.vs3-panel .tab-bar .tab-btn')].find((x) => x.textContent.trim().toLowerCase() === name).click(), name);
  await page.waitForTimeout(300);
};

// A scene with primitives, every light kind, a boolean group and a selected object, so the tree rows and their toggles exist.
const richScene = async (page) => {
  await runState(page, 'scene3d-panel');
  await page.evaluate(() => {
    const click = (s, n) => { const b = [...document.querySelectorAll(s)]; (n === undefined ? b : [b[n]]).forEach((x) => x && x.click()); };
    click('.vs3-shelf-btn:not(.vs3-more-btn)', 0); click('.vs3-shelf-btn:not(.vs3-more-btn)', 1);
    document.querySelectorAll('.vs3-tree-addbtn').forEach((b) => b.click());
    document.querySelector('.vs3-grp-new')?.click();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('.vs3-tree-row:not(.vs3-tree-ground):not(.vs3-tree-light) .vs3-tree-name')?.click());
  await page.waitForTimeout(400);
  await core.waitLayoutSettled(page);
};

const SCENARIOS = {
  'scene3d-scene': (p) => runState(p, 'scene3d-panel'),
  'scene3d-rich': richScene,
  'scene3d-style': async (p) => { await richScene(p); await tab(p, 'style'); },
  'scene3d-style-scene': async (p) => { await runState(p, 'scene3d-panel'); await tab(p, 'style'); },
  'scene3d-output': async (p) => { await runState(p, 'scene3d-panel'); await tab(p, 'output'); },
  'scene3d-more-menu': async (p) => {
    await runState(p, 'scene3d-panel');
    await p.locator('.vs3-more-caret').evaluate((e) => { e.scrollIntoView({ block: 'center' }); e.click(); });
    await p.waitForTimeout(300);
  },
  // The caret is below the fold of a short pane and is clicked unseen: the flyout must still sit inside the screen.
  'scene3d-more-menu-clamped': async (p) => {
    await runState(p, 'scene3d-panel');
    await p.evaluate(() => document.querySelector('.vs3-more-caret')?.click());
    await p.waitForTimeout(300);
    const m = await p.evaluate(() => { const r = document.querySelector('.vs3-more-menu').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vh: innerHeight }; });
    expect(m.top, 'flyout top inside the screen').toBeGreaterThanOrEqual(0);
    expect(m.bottom, 'flyout bottom inside the screen').toBeLessThanOrEqual(m.vh);
  },
  'petal-inline': async (p) => { await runState(p, 'petal-designer-inline'); await expandAll(p); },
  'petal-window': async (p) => { await runState(p, 'petal-designer-window'); await expandAll(p); },
  'pattern-inline': async (p) => {
    await p.evaluate(() => {
      const eng = window.app.engine;
      const id = eng.addLayer('pattern');
      eng.activeLayerId = id; window.app.renderer.setSelection([id], id);
      window.app.ui.renderLayers(); window.app.ui.buildControls();
    });
    const st = STATES.find((s) => s.id === 'left-pane-open');
    await st.run(p);
    await expect.poll(() => st.post(p), { timeout: 10_000 }).toBe(true);
    await core.waitLayoutSettled(p);
    await p.waitForSelector('.pattern-designer-inline');
    await expandAll(p);
    await p.evaluate(() => document.querySelector('.pattern-designer-inline').scrollIntoView({ block: 'start' }));
  },
};

test.describe('TUX-041 B5 Scene3D, Petal and Pattern designers', () => {
  test.use({ reducedMotion: 'reduce' });
  // Every test boots its own page, so the file runs fully parallel.
  test.describe.configure({ mode: 'parallel', retries: 0 });

  for (const [id, open] of Object.entries(SCENARIOS)) {
    test(`${id}: every target is at least 44 x 44`, async ({ page, baseURL }, testInfo) => {
      test.setTimeout(180_000);
      await boot(page, baseURL);
      await open(page);
      await report(page, testInfo, id);
    });
  }

  // Followup (a) from B3: the Document Setup drawer slid over the left 14 px of the tool rail and took 5 px of every rail button.
  test('document-setup drawer: the tool rail and the drawer controls keep 44 x 44', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(120_000);
    await boot(page, baseURL);
    await runState(page, 'modal-document-setup');
    await report(page, testInfo, 'document-setup-rail', ['#tool-bar', '#settings-panel', '.settings-panel']);
  });

  // Finger checks: a tap that lands near the corner of a small visual, inside its 44 px box, does the job.
  test('finger: add-light chips, a tree toggle and the More caret respond to a tap off their centre', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(120_000);
    await boot(page, baseURL);
    await runState(page, 'scene3d-panel');
    const chip = page.locator('.vs3-tree-addbtn').first();
    await chip.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    const cb = await chip.boundingBox();
    expect(cb.height, 'add-light chip is a finger tall').toBeGreaterThanOrEqual(MIN - 0.5);
    const lights = () => page.evaluate(() => (window.app.engine.getActiveLayer().params.lights || []).length);
    const before = await lights();
    await shot(page, `${testInfo.project.name}-scene3d-lights`);
    await page.touchscreen.tap(cb.x + cb.width - 3, cb.y + cb.height - 3);
    await expect.poll(lights).toBeGreaterThan(before);
    const caret = page.locator('.vs3-more-caret');
    await caret.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    const kb = await caret.boundingBox();
    expect(kb.width, 'caret is a finger wide').toBeGreaterThanOrEqual(MIN - 0.5);
    await page.touchscreen.tap(kb.x + kb.width - 3, kb.y + 3);
    await expect(page.locator('.vs3-more-menu.open')).toBeVisible();
    await shot(page, `${testInfo.project.name}-scene3d-more-menu`);
  });

  test('finger: Petal profile side switch and a Pattern tool respond to a tap off their centre', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(120_000);
    await boot(page, baseURL);
    await runState(page, 'petal-designer-window');
    const side = await page.locator('#petal-designer-window .petal-profile-side-btn:not(.is-active)').first().getAttribute('data-petal-profile-side');
    const btn = page.locator(`#petal-designer-window [data-petal-profile-side="${side}"]`).first();
    await btn.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    const bb = await btn.boundingBox();
    expect(bb.height, 'side button is a finger tall').toBeGreaterThanOrEqual(MIN - 0.5);
    await shot(page, `${testInfo.project.name}-petal-window`);
    await page.touchscreen.tap(bb.x + bb.width - 3, bb.y + bb.height - 3);
    await expect(btn).toHaveClass(/is-active/);

    await boot(page, baseURL);
    await SCENARIOS['pattern-inline'](page);
    const tool = page.locator('.pattern-designer-inline [data-pd-tool="fill-erase"]');
    await tool.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    const tb = await tool.boundingBox();
    const pane = await page.locator('#left-pane').boundingBox();
    expect(tb.x + tb.width, 'last Pattern tool sits inside the pane').toBeLessThanOrEqual(pane.x + pane.width + 0.5);
    await shot(page, `${testInfo.project.name}-pattern-tools`);
    await page.touchscreen.tap(tb.x + tb.width - 3, tb.y + tb.height - 3);
    await expect(tool).toHaveClass(/active/);
  });

  // B4 review: a picker that scrolls (short screen, 27 rows) marks the edge that still hides rows, and a picker that fits shows no cue.
  test('generator picker: a scrolling list shows a scroll cue, a list that fits shows none', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(90_000);
    await boot(page, baseURL);
    await runState(page, 'generator-picker');
    const m = await page.evaluate(() => { const e = document.getElementById('gm-module-menu'); return { scrolls: e.scrollHeight > e.clientHeight + 1, cue: e.dataset.scrollCue || '' }; });
    if (/iphone-landscape/.test(testInfo.project.name)) expect(m.scrolls, 'the list scrolls on the short iPhone landscape screen').toBe(true);
    if (m.scrolls) expect(m.cue, 'a scrolling list names the hidden edge').toContain('below');
    else expect(m.cue, 'a list that fits has no cue').toBe('');
    await shot(page, `${testInfo.project.name}-generator-picker-cue`);
  });
});
