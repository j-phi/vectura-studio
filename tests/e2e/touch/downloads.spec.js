const fs = require('fs');
const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');
const rec = require('../helpers/share-recorder');
const { PROJECTS } = require('./viewports');

// TUX-054: Save and Export Do the right thing on iOS.
//  - Where the engine has navigator.share + canShare and the pointer is coarse, the share
//    sheet opens directly, inside the tap's user activation, with a correctly named File.
//  - Otherwise an anchor download runs and its blob URL is revoked no sooner than 30 s later.
//  - A cancelled share sheet shows no toast; a NotAllowedError falls back to a download.
// Headless WebKit resolves navigator.share in ~3 ms with no sheet, so the recorder stores the
// File's name/type/size and the user-activation state; a bare "share was called" proves nothing.
// The trigger is a fixed 64x64 button so these tests do not depend on menu reachability.
const EVIDENCE = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-054';
const SAVE_NAME = /^vectura-\d{4}-\d{2}-\d{2}\.vectura$/;
const SAVE = { method: 'saveVecturaFile', filename: SAVE_NAME, type: 'application/json', toast: /Saved vectura-/ };
const EXPORT = { method: 'exportSVG', filename: 'vectura.svg', type: 'image/svg+xml', toast: /Exported vectura\.svg/ };

const nameMatches = (pattern, name) => (pattern instanceof RegExp ? pattern.test(name) : pattern === name);
const spec = (testInfo) => PROJECTS[testInfo.project.name];

const boot = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
  await page.evaluate(() => { window.app.engine.addLayer('wavetable'); });
};

// Activation-safe trigger: a finger tap on this button runs the app's save entry point.
const addTrigger = (page, method) => page.evaluate((m) => {
  const b = document.createElement('button');
  b.id = 'tux054-trigger';
  b.textContent = m;
  b.style.cssText = 'position:fixed;left:100px;top:100px;width:64px;height:64px;z-index:99999;';
  b.addEventListener('click', () => { window.app.ui[m](); });
  document.body.appendChild(b);
}, method);

const tapTrigger = (page) => touch.tap(page, page.locator('#tux054-trigger'));

const successToast = (page, re) => page.locator('.vectura-toast-success', { hasText: re });

for (const flow of [SAVE, EXPORT]) {
  test(`native capability path: ${flow.method}`, async ({ page }, testInfo) => {
    await rec.installRecorder(page);
    await boot(page);
    await addTrigger(page, flow.method);
    const native = await rec.hasNativeShare(page);
    const downloadP = native ? null : page.waitForEvent('download');
    await tapTrigger(page);

    if (!native) {
      // No navigator.share (Chromium today): anchor download, revoke deferred.
      const dl = await downloadP;
      expect(nameMatches(flow.filename, dl.suggestedFilename())).toBe(true);
      await page.waitForTimeout(1000);
      const r = await rec.readRecorder(page);
      expect(r.revoked, 'blob URL revoked within 1 s of the download').toHaveLength(0);
      expect(r.shareCalls).toHaveLength(0);
    } else {
      // navigator.share present (WebKit today): the sheet opens, no anchor download.
      await expect.poll(async () => (await rec.readRecorder(page)).shareCalls.length).toBe(1);
      const r = await rec.readRecorder(page);
      const call = r.shareCalls[0];
      expect(nameMatches(flow.filename, call.name), `shared file name ${call.name}`).toBe(true);
      expect(call.type).toBe(flow.type);
      expect(call.size).toBeGreaterThan(0);
      if (call.activeAtCall !== null) expect(call.activeAtCall, 'share called inside the tap activation').toBe(true);
      await page.waitForTimeout(1000);
      expect((await rec.readRecorder(page)).downloads, 'anchor download ran as well as share').toHaveLength(0);
    }
    await expect(successToast(page, flow.toast)).toBeVisible();

    if (flow === SAVE) {
      const s = spec(testInfo);
      fs.mkdirSync(EVIDENCE, { recursive: true });
      await page.screenshot({ path: `${EVIDENCE}/${s.device}-${s.engine}.png` });
    }
  });
}

test('stubbed share (both engines): resolve shows the toast and shares the named File', async ({ page }) => {
  await rec.installShareStub(page, 'resolve');
  await boot(page);
  await addTrigger(page, EXPORT.method);
  await tapTrigger(page);
  await expect(successToast(page, EXPORT.toast)).toBeVisible();
  const r = await rec.readRecorder(page);
  expect(r.shareCalls).toHaveLength(1);
  expect(r.shareCalls[0]).toMatchObject({ name: 'vectura.svg', type: 'image/svg+xml' });
  if (r.shareCalls[0].activeAtCall !== null) expect(r.shareCalls[0].activeAtCall).toBe(true);
  expect(r.downloads).toHaveLength(0);
});

test('stubbed share (both engines): AbortError shows no toast and no download', async ({ page }) => {
  await rec.installShareStub(page, 'abort');
  await boot(page);
  await addTrigger(page, SAVE.method);
  await tapTrigger(page);
  await expect.poll(async () => (await rec.readRecorder(page)).shareCalls.length).toBe(1);
  await page.waitForTimeout(1200);
  const r = await rec.readRecorder(page);
  expect(r.downloads).toHaveLength(0);
  await expect(page.locator('.vectura-toast-success')).toHaveCount(0);
  await expect(page.locator('.vectura-toast-danger')).toHaveCount(0);
});

test('stubbed share (both engines): NotAllowedError falls back to a download, then toasts', async ({ page }) => {
  await rec.installShareStub(page, 'notallowed');
  await boot(page);
  await addTrigger(page, SAVE.method);
  const downloadP = page.waitForEvent('download');
  await tapTrigger(page);
  const dl = await downloadP;
  expect(SAVE_NAME.test(dl.suggestedFilename())).toBe(true);
  await expect(successToast(page, SAVE.toast)).toBeVisible();
  const r = await rec.readRecorder(page);
  expect(r.shareCalls).toHaveLength(1);
  expect(r.revoked, 'revoke deferred after fallback download').toHaveLength(0);
});

// Real menu path: File menu -> Save, tapped with a finger.
test('File menu > Save by finger tap saves the project', async ({ page }) => {
  await rec.installRecorder(page);
  await boot(page);
  const phone = await page.evaluate(() => document.body.classList.contains('phone-layout'));
  if (phone) {
    await touch.tap(page, page.locator('#btn-menu-hamburger'));
    await page.waitForTimeout(150);
  }
  const trigger = page.locator('#btn-menu-file');
  await trigger.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await touch.tap(page, trigger);
  await page.waitForTimeout(200);
  const save = page.locator('#btn-save-vectura');
  await save.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await touch.tap(page, save);
  await rec.expectSaved(page, { filename: SAVE_NAME, type: SAVE.type });
  await expect(successToast(page, SAVE.toast)).toBeVisible();
});
