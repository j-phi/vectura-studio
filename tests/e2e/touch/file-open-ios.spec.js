const fs = require('fs');
const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');
const { PROJECTS } = require('./viewports');

// TUX-053: File > Open must hand iOS Files an accept list it can match (adds
// application/octet-stream on iOS only), and the chosen .vectura must load.
// Finger-only. Desktop parity lives in tests/e2e/file-open-desktop.spec.js.
const EVIDENCE = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-053';
const OCTET = 'application/octet-stream';

const spec = (testInfo) => PROJECTS[testInfo.project.name];
const phoneLayout = (page) => page.evaluate(() => document.body.classList.contains('phone-layout'));

const boot = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
};

const openFileMenu = async (page) => {
  const click = (loc) => touch.tap(page, loc);
  if (await phoneLayout(page)) {
    await click(page.locator('#btn-menu-hamburger'));
    await page.waitForTimeout(150);
  }
  const trigger = page.locator('#btn-menu-file');
  await trigger.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await click(trigger);
  await page.waitForTimeout(200);
};

test('File > Open takes a .vectura through the picker and loads it', async ({ page }, testInfo) => {
  const s = spec(testInfo);
  // iPhone portrait reaches File > Open through the hamburger (probed: reachable in both engines), so no fixme.

  await boot(page);
  const fixture = await page.evaluate(() => {
    const a = window.app;
    a.engine.addLayer('wavetable');
    a.engine.addLayer('lissajous');
    return JSON.stringify({ type: 'vectura', version: 'x', state: a.captureState(), images: {} });
  });
  const expected = JSON.parse(fixture).state.engine.layers.map((l) => l.type);

  await page.evaluate(() => { try { localStorage.clear(); } catch (_) { /* noop */ } });
  await boot(page);
  const before = await page.evaluate(() => window.app.engine.layers.map((l) => l.type));
  expect(before, 'clean reload differs from the fixture').not.toEqual(expected);

  await openFileMenu(page);
  const open = page.locator('#btn-open-vectura');
  await open.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const chooserP = page.waitForEvent('filechooser');
  await touch.tap(page, open);
  const chooser = await chooserP;
  const accept = await page.evaluate(() => document.getElementById('file-open-vectura').accept);
  expect(accept.split(',')).toContain(OCTET);
  await chooser.setFiles({ name: 'proj.vectura', mimeType: OCTET, buffer: Buffer.from(fixture) });

  await page.waitForFunction((n) => window.app.engine.layers.length === n, expected.length, { timeout: 10000 });
  const after = await page.evaluate(() => window.app.engine.layers.map((l) => l.type));
  expect(after).toEqual(expected);
  await expect(page.locator('.vectura-toast', { hasText: 'Project loaded' })).toBeVisible();

  fs.mkdirSync(EVIDENCE, { recursive: true });
  const tag = `${s.device}-${s.engine}`;
  await page.screenshot({ path: `${EVIDENCE}/${tag}.png` });
});
