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
    // to strand. It must still read as worse, through `reachable` (the clipped header controls).
    expect(names, note).toContain('reachable');
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
