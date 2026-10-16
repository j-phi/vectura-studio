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
// (a) Q14 applies to the phone menu sheet only (body.phone-menu-open). Elsewhere a tap on the uncovered part activates it.
const partCovered = async (page) => page.evaluate(() => {
  const b = document.createElement('button'); b.id = 'zz-btn'; b.textContent = 'zz';
  b.style.cssText = 'position:fixed;left:100px;top:300px;width:100px;height:44px;z-index:50;padding:0';
  document.body.appendChild(b);
  const m = document.createElement('div'); m.className = 'menu-dropdown open'; m.id = 'zz-menu';
  m.style.cssText = 'position:fixed;left:0;top:300px;width:130px;min-width:0;height:60px;z-index:60;display:block;background:#222';
  document.body.appendChild(m);
});
test('guard: a control partly covered by an open menu is popup-covered on the phone sheet only @audit-extra', async ({ page, baseURL }, testInfo) => {
  const spec = PROJECTS[testInfo.project.name];
  test.skip(!/iphone/.test(testInfo.project.name), 'the phone menu sheet exists on phone layouts only');
  await boot(page, baseURL);
  await partCovered(page);
  // The layout classifier rewrites body classes on settle; pin the phone-sheet class for the measurement.
  await page.evaluate(() => { document.body.classList.add('phone-menu-open'); window.__zzPin = setInterval(() => document.body.classList.add('phone-menu-open'), 5); });
  const r = await measure(page, spec, testInfo.project.name);
  const it = r.raw.items.find((i) => /zz-btn/.test(i.sel));
  expect(it, 'the probe button is listed').toBeTruthy();
  // On a phone the open sheet itself can also cover the probe at its centre ('covered'); either way it is not reachable.
  expect(['popup-covered', 'covered'], `phone sheet: ${JSON.stringify(it)}`).toContain(it.hitState);
  expect(it.reach).toBe(false);
});
test('guard: a control partly covered by an open menu stays reachable off the phone sheet @audit-extra', async ({ page, baseURL }, testInfo) => {
  const spec = PROJECTS[testInfo.project.name];
  await boot(page, baseURL);
  await partCovered(page);
  await page.evaluate(() => document.body.classList.remove('phone-menu-open'));
  const r = await measure(page, spec, testInfo.project.name);
  const it = r.raw.items.find((i) => /zz-btn/.test(i.sel));
  expect(it, 'the probe button is listed').toBeTruthy();
  expect(it.reach, `no phone sheet: a finger tap on the uncovered part activates it (${JSON.stringify(it)})`).toBe(true);
  expect(it.pw, 'probed at the uncovered width, not the CSS width').toBeLessThan(100);
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

// Q15 rescue uses the EFFECTIVE hit height (own box plus any ::before/::after expansion), not the bare box height.
// A 16 px button with a 44 px ::before expansion, cut by its scroller, is a 44 px target once scrolled into view.
test('guard: Q15 rescue counts a ::before hit expansion @audit-extra', async ({ page, baseURL }, testInfo) => {
  const spec = PROJECTS[testInfo.project.name];
  await boot(page, baseURL);
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = '#zz-exp{position:relative;display:block;width:150px;height:16px;padding:0;border:0}#zz-exp::before{content:"";position:absolute;left:0;right:0;top:-14px;height:44px}';
    document.head.appendChild(st);
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:100px;top:300px;width:200px;height:80px;overflow-y:auto;z-index:50;background:#222';
    box.innerHTML = '<div style="height:74px"></div><button id="zz-exp">row</button><div style="height:200px"></div>';
    document.body.appendChild(box);
  });
  const r = await measure(page, spec, testInfo.project.name);
  const it = r.raw.items.find((i) => /zz-exp/.test(i.sel));
  expect(it, 'the probe button is listed').toBeTruthy();
  expect(it.clipped, 'the button is cut by its scroller').toBe(true);
  expect(it.min24, `probed ${it.pw}x${it.ph}: the ::before makes the hit area 44 px once scrolled into view`).toBe(true);
  expect(it.ph, 'effective height 44').toBeGreaterThanOrEqual(44);
});

// Q15 rescue must measure the real hit area once the row is scrolled into view: stacked 16 px rows whose ::before reaches
// 44 px are covered by the next row, so elementFromPoint finds only 16 px. The CSS box alone would say 44.
test('guard: Q15 rescue reports the true 16 px for stacked rows with overlapping ::before @audit-extra', async ({ page, baseURL }, testInfo) => {
  const spec = PROJECTS[testInfo.project.name];
  await boot(page, baseURL);
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = '.zz-ov{position:relative;display:block;width:150px;height:16px;padding:0;border:0;margin:0}.zz-ov::before{content:"";position:absolute;left:0;right:0;top:0;height:44px}';
    document.head.appendChild(st);
    const box = document.createElement('div');
    box.id = 'zz-ov-box';
    box.style.cssText = 'position:fixed;left:100px;top:300px;width:200px;height:80px;overflow-y:auto;z-index:50;background:#222';
    box.innerHTML = '<div style="height:74px"></div>' + [1, 2, 3, 4, 5, 6].map((n) => `<button class="zz-ov" id="zz-ov${n}">r${n}</button>`).join('') + '<div style="height:200px"></div>';
    document.body.appendChild(box);
  });
  const r = await measure(page, spec, testInfo.project.name);
  const it = r.raw.items.find((i) => /zz-ov1/.test(i.sel));
  expect(it, 'the first stacked row is listed').toBeTruthy();
  expect(it.clipped, 'the row is cut by its scroller').toBe(true);
  expect(it.ph, `stacked row probed at ${it.ph} px: the next row covers the ::before, the true hit height is 16`).toBeLessThanOrEqual(17);
  expect(await page.evaluate(() => document.getElementById('zz-ov-box').scrollTop), 'scrollTop restored').toBe(0);
});

// Q15 rescue scrolls the row to the nearest edge only and ignores unrelated open menus: a popup that covers the middle of the scroller (the open
// generator picker covers the middle of the left pane) must not hide a control whose ::before is a real 44 px target.
test('guard: Q15 rescue measures the true hit area when an unrelated open menu covers the scroller centre @audit-extra', async ({ page, baseURL }, testInfo) => {
  const spec = PROJECTS[testInfo.project.name];
  await boot(page, baseURL);
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = '#zz-edge{position:relative;display:block;width:150px;height:16px;padding:0;border:0;margin:0}#zz-edge::before{content:"";position:absolute;left:0;right:0;top:-14px;height:44px}';
    document.head.appendChild(st);
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:100px;top:100px;width:200px;height:200px;overflow-y:auto;z-index:50;background:#222';
    box.innerHTML = '<div style="height:190px"></div><button id="zz-edge">row</button><div style="height:400px"></div>';
    document.body.appendChild(box);
    const pop = document.createElement('div');
    pop.setAttribute('role', 'menu');
    pop.style.cssText = 'position:fixed;left:90px;top:170px;width:240px;height:60px;z-index:60;background:#555';
    document.body.appendChild(pop);
  });
  const r = await measure(page, spec, testInfo.project.name);
  const it = r.raw.items.find((i) => /zz-edge/.test(i.sel));
  expect(it, 'the edge button is listed').toBeTruthy();
  expect(it.clipped, 'the button is cut by its scroller').toBe(true);
  expect(it.ph, `probed ${it.pw}x${it.ph}: an unrelated menu is not a neighbour, so the ::before is a 44 px target`).toBeGreaterThanOrEqual(44);
});

// B3 review: the rescue ignores an unrelated menu only when the menu covers the row solely because of the rescue scroll. A menu that
// covers the top of the row's 44 px ::before where the row sits now (and after the scroll) is a real neighbour: the finger hit is about 26 px.
test('guard: Q15 rescue keeps an open menu opaque when it covers the row ::before in both scroll positions @audit-extra', async ({ page, baseURL }, testInfo) => {
  const spec = PROJECTS[testInfo.project.name];
  await boot(page, baseURL);
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = '#zz-cov{position:relative;display:block;width:150px;height:16px;padding:0;border:0;margin:0}#zz-cov::before{content:"";position:absolute;left:0;right:0;top:-14px;height:44px}';
    document.head.appendChild(st);
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:100px;top:100px;width:200px;height:200px;overflow-y:auto;z-index:50;background:#222';
    box.innerHTML = '<div style="height:190px"></div><button id="zz-cov">row</button><div style="height:400px"></div>';
    document.body.appendChild(box);
    const pop = document.createElement('div');
    pop.setAttribute('role', 'menu');
    pop.style.cssText = 'position:fixed;left:90px;top:255px;width:240px;height:30px;z-index:60;background:#555';
    document.body.appendChild(pop);
  });
  const r = await measure(page, spec, testInfo.project.name);
  const it = r.raw.items.find((i) => /zz-cov/.test(i.sel));
  expect(it, 'the covered button is listed').toBeTruthy();
  expect(it.clipped, 'the button is cut by its scroller').toBe(true);
  expect(it.ph, `probed ${it.pw}x${it.ph}: the menu covers the top of the ::before, so the true hit height is under 44`).toBeLessThan(44);
});

// A modal control below the fold of the modal's own scrolling body is reachable by scrolling and counts in `reachable`. The same control
// cut away by an overflow:hidden box (no scrolling) does not.
test('guard: a modal control below its scroll fold counts as reachable, a hidden-overflow one does not @audit-extra', async ({ page, baseURL }, testInfo) => {
  const spec = PROJECTS[testInfo.project.name];
  await boot(page, baseURL);
  const base = await measure(page, spec, testInfo.project.name);
  await page.evaluate(() => {
    const modal = document.createElement('div');
    modal.className = 'vectura-modal';
    modal.style.cssText = 'position:fixed;left:100px;top:100px;width:300px;z-index:50;background:#222';
    modal.innerHTML = '<div id="zz-scroll" style="height:80px;overflow-y:auto"><div style="height:200px"></div><button id="zz-below" style="height:44px;width:120px">below</button><div style="height:50px"></div></div>'
      + '<div id="zz-hid" style="height:80px;overflow:hidden"><div style="height:200px"></div><button id="zz-lost" style="height:44px;width:120px">lost</button></div>';
    document.body.appendChild(modal);
  });
  const r = await measure(page, spec, testInfo.project.name);
  const below = r.raw.items.find((i) => /zz-below/.test(i.sel));
  const lost = r.raw.items.find((i) => /zz-lost/.test(i.sel));
  expect(below && !below.onscreen && below.scrollReach, 'the scrolling control is scroll-reachable').toBeTruthy();
  expect(lost ? lost.scrollReach : false, 'the overflow:hidden control is not').toBeFalsy();
  const onscreenReach = r.raw.items.filter((i) => i.onscreen && i.reach !== false && (i.hitState === 'ok' || i.hitState === 'ok-ancestor')).length;
  expect(r.m.reachable, 'reachable counts the on-screen reachable controls plus the scrolling one only').toBe(onscreenReach + 1);
  expect(base.m.reachable).toBeGreaterThan(0);
});

// Q15 hardening: a row taller than its scroller can never scroll fully into view, so it keeps its probed (clipped) size.
test('guard: a row taller than its scroll container is not measured at full size @audit-extra', async ({ page, baseURL }, testInfo) => {
  const spec = PROJECTS[testInfo.project.name];
  await boot(page, baseURL);
  await page.evaluate(() => {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:100px;top:300px;width:200px;height:30px;overflow-y:auto;z-index:50;background:#222';
    box.innerHTML = '<button id="zz-tall" style="display:block;width:150px;height:44px;padding:0">row</button><div style="height:200px"></div>';
    document.body.appendChild(box);
  });
  const r = await measure(page, spec, testInfo.project.name);
  const it = r.raw.items.find((i) => /zz-tall/.test(i.sel));
  expect(it, 'the probe row is listed').toBeTruthy();
  expect(it.ph, `row probed at ${it.ph} px: the 30 px scroller never shows all 44 px`).toBeLessThan(40);
});

// Q22: a control below the fold of ANY scrollable pane body is reachable by scrolling when its real hit area after a minimal scroll is
// at least 44 px. A non-scrolling overflow:hidden clip, or a control that stays covered after the scroll, is not.
test('guard: Q22 pane scroll reach counts only a scrollable, uncovered, 44 px control @audit-extra', async ({ page, baseURL }, testInfo) => {
  const spec = PROJECTS[testInfo.project.name];
  await boot(page, baseURL);
  await page.evaluate(() => {
    const pane = document.createElement('div');
    pane.id = 'zz-pane';
    pane.style.cssText = 'position:fixed;left:20px;top:120px;width:260px;z-index:50;background:#222';
    pane.innerHTML = '<div id="zz-body" style="height:90px;overflow-y:auto"><div style="height:200px"></div>'
      + '<button id="zz-ok" style="display:block;height:44px;width:140px;padding:0">ok</button><div style="height:60px"></div></div>'
      + '<div id="zz-clip" style="height:90px;overflow:hidden"><div style="height:200px"></div><button id="zz-lost" style="display:block;height:44px;width:140px;padding:0">lost</button></div>'
      + '<div id="zz-body2" style="height:90px;overflow-y:auto"><div style="height:200px"></div><button id="zz-cov" style="display:block;height:44px;width:140px;padding:0">cov</button><div style="height:60px"></div></div>';
    document.body.appendChild(pane);
    // A layer over the whole second scroller covers its control whatever the scroll position.
    const rc = document.getElementById('zz-body2').getBoundingClientRect();
    const cover = document.createElement('div');
    cover.id = 'zz-cover';
    cover.style.cssText = `position:fixed;left:${rc.left}px;top:${rc.top}px;width:${rc.width}px;height:${rc.height}px;z-index:60;background:#444`;
    document.body.appendChild(cover);
  });
  const r = await measure(page, spec, testInfo.project.name);
  const get = (id) => r.raw.items.find((i) => new RegExp(id).test(i.sel));
  expect(get('zz-ok') && !get('zz-ok').onscreen && get('zz-ok').scrollReach, 'the scrollable, uncovered 44 px control counts').toBeTruthy();
  expect(get('zz-lost') ? get('zz-lost').scrollReach : false, 'a control in a non-scrolling overflow:hidden clip stays unreachable').toBeFalsy();
  expect(get('zz-cov') ? get('zz-cov').scrollReach : false, 'a control covered after the scroll stays unreachable').toBeFalsy();
});

// B4 review: the Q22 probe runs on a row that is OFF screen before the scroll, so an open menu must stay opaque. A menu that covers the
// row's scrolled-in position means no finger can reach the row while the menu is open: it must not count as scroll-reachable.
test('guard: Q22 keeps an open menu opaque when it covers the scrolled-in position @audit-extra', async ({ page, baseURL }, testInfo) => {
  const spec = PROJECTS[testInfo.project.name];
  await boot(page, baseURL);
  await page.evaluate(() => {
    const pane = document.createElement('div');
    pane.style.cssText = 'position:fixed;left:20px;top:120px;width:260px;z-index:50;background:#222';
    pane.innerHTML = '<div id="zz-body3" style="height:90px;overflow-y:auto"><div style="height:200px"></div>'
      + '<button id="zz-under" style="display:block;height:44px;width:140px;padding:0">under</button><div style="height:60px"></div></div>';
    document.body.appendChild(pane);
    const rc = document.getElementById('zz-body3').getBoundingClientRect();
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    menu.style.cssText = `position:fixed;left:${rc.left}px;top:${rc.top}px;width:${rc.width}px;height:${rc.height}px;z-index:60;background:#444`;
    document.body.appendChild(menu);
  });
  const r = await measure(page, spec, testInfo.project.name);
  const it = r.raw.items.find((i) => /zz-under/.test(i.sel));
  expect(it, 'the probe row is listed').toBeTruthy();
  expect(it.scrollReach, 'a row under an open menu is not reachable by finger').toBeFalsy();
});
