// Durable regression fixtures for the two ratchet blind spots (TUX-058 fix round 2).
// Each test boots the real app, measures the `default` state clean, injects a CSS hack, measures
// again and asserts that compareCell(clean, hacked) reports the guard metric as WORSE:
//   1. Clipping the overflow away (html,body overflow-x:hidden + clipped header) zeroes
//      hOverflow/vOverflow/innerWidthExcess but strands controls off-screen -> `stranded` rises.
//   2. Removing controls (display:none) lowers every under-N count and raises canvasPct, but
//      `reachable` falls -> worse (a drop needs TOUCH_BASELINE=update-any + a TUX-WAIVER line).
// The clipping hack is project-independent: the header gets a 120 px width cap so its children
// overflow in every viewport, not only on iPhone portrait where the app overflows today.
const { test, expect } = require('@playwright/test');
const core = require('../helpers/target-audit-core');
const { STATES } = require('./target-audit-states');
const { PROJECTS } = require('./viewports');

test.use({ reducedMotion: 'reduce' });
test.describe.configure({ retries: 0 });

const measure = async (page, spec, project) => {
  const raw = await core.measurePage(page, { W: spec.width, H: spec.height, safe: core.SAFE_BANDS[spec.device], allow: [] });
  raw.pageErrors = [];
  return { raw, m: core.summarizeState(raw) };
};

const boot = async (page, baseURL) => {
  await core.bootApp(page, baseURL);
  const st = STATES.find((s) => s.id === 'default');
  await st.run(page);
  await expect.poll(() => st.post(page), { timeout: 10_000 }).toBe(true);
  await core.waitLayoutSettled(page);
  await core.waitGeometryStable(page);
  await page.waitForTimeout(150);
};

test('guard: clipping overflow away is reported as worse via stranded @audit-extra', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(90_000);
  const project = testInfo.project.name;
  const spec = PROJECTS[project];
  await boot(page, baseURL);
  const clean = await measure(page, spec, project);
  const css = 'html,body{overflow-x:hidden !important;overflow-y:hidden !important} #app-header{overflow:hidden !important;max-width:120px !important}';
  await page.addStyleTag({ content: css });
  await core.waitLayoutSettled(page);
  const hacked = await measure(page, spec, project);
  const cmp = core.compareCell(clean.m, hacked.m);
  const names = cmp.worse.map((w) => w.metric);
  const note = `worse metrics: ${JSON.stringify(cmp.worse)} (strandedSel ${JSON.stringify(hacked.raw.strandedSel)})`;
  if (clean.m.hOverflow === 0 && clean.m.innerWidthExcess === 0 && !clean.raw.items.some((i) => i.onscreen && i.clipped)) {
    // TUX-007: the iPhone-landscape header now fits (nothing overflows), so the hack has nothing
    // to strand. It must still read as worse: which metric moves (reachable, under44, covered)
    // depends on which header controls the 120 px clip catches, so accept any worse metric.
    expect(names.length, note).toBeGreaterThan(0);
    expect(hacked.m.stranded).toBeGreaterThanOrEqual(clean.m.stranded);
  } else {
    expect(names, note).toContain('stranded');
    expect(hacked.m.stranded).toBeGreaterThan(clean.m.stranded);
  }
  // The overflow metrics alone would have called this a win (never worse).
  expect(hacked.m.hOverflow).toBeLessThanOrEqual(clean.m.hOverflow);
  expect(hacked.m.innerWidthExcess).toBeLessThanOrEqual(clean.m.innerWidthExcess);
});

test('guard: the exact iPhone-portrait overflow-hide hack is reported as worse @audit-extra', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(90_000);
  const project = testInfo.project.name;
  const spec = PROJECTS[project];
  await boot(page, baseURL);
  const clean = await measure(page, spec, project);
  await page.addStyleTag({ content: 'html,body{overflow-x:hidden} #app-header{overflow:hidden}' });
  await core.waitLayoutSettled(page);
  const hacked = await measure(page, spec, project);
  const cmp = core.compareCell(clean.m, hacked.m);
  if (clean.m.innerWidthExcess > 0) {
    // Chromium iPhone portrait: the layout viewport widens to 544, so Insert/Help are pannable.
    // The hack shrinks it back to 402: every overflow metric reads 0 but they are stranded.
    expect(hacked.m.hOverflow + hacked.m.innerWidthExcess).toBeLessThan(clean.m.hOverflow + clean.m.innerWidthExcess);
    expect(cmp.worse.map((w) => w.metric), JSON.stringify({ clean: clean.m, hacked: hacked.m })).toContain('stranded');
    expect(hacked.m.stranded).toBeGreaterThan(clean.m.stranded);
  } else {
    // Other viewports: the hack must never look like an improvement through the overflow metrics
    // alone, i.e. no metric may be reported better than stranded/reachable allow.
    expect(hacked.m.stranded).toBeGreaterThanOrEqual(clean.m.stranded);
  }
});

test('guard: removing controls (display:none) is reported as worse via reachable @audit-extra', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(90_000);
  const project = testInfo.project.name;
  const spec = PROJECTS[project];
  await boot(page, baseURL);
  const clean = await measure(page, spec, project);
  await page.addStyleTag({ content: '#touch-modifier-bar,.toolbar-footer{display:none !important}' });
  await core.waitLayoutSettled(page);
  const hacked = await measure(page, spec, project);
  const cmp = core.compareCell(clean.m, hacked.m);
  expect(cmp.worse.map((w) => w.metric), `clean reachable ${clean.m.reachable}, hacked ${hacked.m.reachable}`).toContain('reachable');
  expect(hacked.m.reachable).toBeLessThan(clean.m.reachable);
});

// TUX-058 batch 3: a target under an OPEN MENU is inert for that state (popup-covered), not `covered`; the same target
// under any other overlay still counts as `covered`. Both halves, so the exemption cannot swallow real occlusion.
test('guard: popup-covered is exempt only for an open menu @audit-extra', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(90_000);
  const spec = PROJECTS[testInfo.project.name];
  test.skip(spec.width < 1000, 'the File panel only reaches the tools on iPad landscape width');
  await core.bootApp(page, baseURL);
  const st = STATES.find((s) => s.id === 'menu-file');
  await st.run(page);
  await expect.poll(() => st.post(page), { timeout: 10_000 }).toBe(true);
  await core.waitLayoutSettled(page);
  await page.waitForTimeout(300);
  const menu = await measure(page, spec, testInfo.project.name);
  const popup = menu.raw.items.filter((i) => i.hitState === 'popup-covered');
  expect(popup.length, 'targets under the open File menu are classed popup-covered').toBeGreaterThan(0);
  expect(menu.raw.items.filter((i) => i.hitState === 'covered' && /open menu/.test(i.coveredBy || '')).length).toBe(0);
  // A non-menu overlay over the same targets is still `covered`.
  await page.evaluate(() => { const d = document.createElement('div'); d.id = 'zz-cover'; d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:transparent'; document.body.appendChild(d); document.querySelectorAll('.top-menu-panel.open').forEach((p) => p.classList.remove('open')); });
  await page.waitForTimeout(150);
  const hacked = await measure(page, spec, testInfo.project.name);
  expect(hacked.m.covered, 'a plain overlay still raises covered').toBeGreaterThan(menu.m.covered);
});

// TUX-058 batch 3b (review of 5a2bce44): the exemption applies only when the target is OUTSIDE the covering layer.
// (1) the visible drawer backdrop is exempt like an open menu; a plain overlay in its place is not.
test('guard: popup-covered covers the drawer backdrop, and a plain overlay still counts @audit-extra', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(90_000);
  const spec = PROJECTS[testInfo.project.name];
  await core.bootApp(page, baseURL);
  const st = STATES.find((s) => s.id === 'left-pane-open');
  await st.run(page);
  await expect.poll(() => st.post(page), { timeout: 10_000 }).toBe(true);
  await core.waitLayoutSettled(page);
  await page.waitForTimeout(400);
  const hasBackdrop = await page.evaluate(() => !!document.querySelector('#mobile-pane-backdrop.visible'));
  test.skip(!hasBackdrop, 'no drawer backdrop in this layout (docked pane)');
  const withBackdrop = await measure(page, spec, testInfo.project.name);
  const popup = withBackdrop.raw.items.filter((i) => i.hitState === 'popup-covered');
  expect(popup.length, 'targets under the drawer backdrop are classed popup-covered').toBeGreaterThan(0);
  await page.evaluate(() => {
    document.querySelector('#mobile-pane-backdrop').classList.remove('visible');
    const d = document.createElement('div'); d.id = 'zz-cover';
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:transparent'; document.body.appendChild(d);
  });
  await page.waitForTimeout(150);
  const plain = await measure(page, spec, testInfo.project.name);
  expect(plain.m.covered, 'a plain overlay over the same targets raises covered').toBeGreaterThan(withBackdrop.m.covered);
});

// (2) a menu item hidden inside its OWN menu is still covered (the hit is inside the layer, so no exemption).
test('guard: a menu item covered by an element inside its own menu still counts as covered @audit-extra', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(90_000);
  const spec = PROJECTS[testInfo.project.name];
  test.skip(spec.width < 600, 'the menubar dropdown is the phone sheet here');
  await core.bootApp(page, baseURL);
  const st = STATES.find((s) => s.id === 'menu-file');
  await st.run(page);
  await expect.poll(() => st.post(page), { timeout: 10_000 }).toBe(true);
  await core.waitLayoutSettled(page);
  await page.waitForTimeout(300);
  const clean = await measure(page, spec, testInfo.project.name);
  const injected = await page.evaluate(() => {
    const panel = document.querySelector('.top-menu-panel.open, .menu-dropdown.open');
    if (!panel) return false;
    const d = document.createElement('div'); d.id = 'zz-inner';
    d.style.cssText = 'position:absolute;inset:0;z-index:99999;background:transparent';
    panel.appendChild(d);
    return true;
  });
  expect(injected, 'an open menu panel exists').toBe(true);
  await page.waitForTimeout(150);
  const hacked = await measure(page, spec, testInfo.project.name);
  const own = hacked.raw.items.filter((i) => i.hitState === 'covered' && !/open menu/.test(i.coveredBy || ''));
  expect(own.length, 'items hidden inside their own menu are covered, not popup-covered').toBeGreaterThan(0);
  expect(hacked.m.covered).toBeGreaterThan(clean.m.covered);
});

// TUX-058 batch 3b (orchestrator decisions 2026-10-12, Jay may override; requirements §7).
// (a) a control PARTLY covered by an open menu is popup-covered (not reachable) while the menu is open.
test('guard: a control partly covered by an open menu is popup-covered @audit-extra', async ({ page, baseURL }, testInfo) => {
  const spec = PROJECTS[testInfo.project.name];
  await boot(page, baseURL);
  await page.evaluate(() => {
    const b = document.createElement('button'); b.id = 'zz-btn'; b.textContent = 'zz';
    b.style.cssText = 'position:fixed;left:100px;top:300px;width:100px;height:44px;z-index:50;padding:0';
    document.body.appendChild(b);
    const m = document.createElement('div'); m.className = 'menu-dropdown open'; m.id = 'zz-menu';
    m.style.cssText = 'position:fixed;left:0;top:300px;width:130px;min-width:0;height:60px;z-index:60;display:block;background:#222';
    document.body.appendChild(m);
  });
  const r = await measure(page, spec, testInfo.project.name);
  const it = r.raw.items.find((i) => /zz-btn/.test(i.sel));
  expect(it, 'the probe button is listed').toBeTruthy();
  expect(it.hitState, `centre is clear of the menu but its left 30 px is covered (${JSON.stringify(it)})`).toBe('popup-covered');
  expect(it.reach).toBe(false);
});

// (b) a row cut by its own scroll container is measured at full size on the cut axis.
test('guard: a row clipped by its own scroll container is measured at full size @audit-extra', async ({ page, baseURL }, testInfo) => {
  const spec = PROJECTS[testInfo.project.name];
  await boot(page, baseURL);
  await page.evaluate(() => {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:100px;top:300px;width:200px;height:80px;overflow-y:auto;z-index:50;background:#222';
    box.innerHTML = '<div style="height:60px"></div><button id="zz-row" style="display:block;width:150px;height:40px;padding:0">row</button><div style="height:200px"></div>';
    document.body.appendChild(box);
  });
  const r = await measure(page, spec, testInfo.project.name);
  const it = r.raw.items.find((i) => /zz-row/.test(i.sel));
  expect(it, 'the probe row is listed').toBeTruthy();
  expect(it.clipped, 'the row is cut by its scroller').toBe(true);
  expect(it.ph, `row height probed at ${it.ph} px, CSS box is 40 px`).toBeGreaterThanOrEqual(40);
});
