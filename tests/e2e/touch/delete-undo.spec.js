const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-037: deleting a layer shows an Undo toast that a finger can reach and use.
// Pane reachability on iPhone is TUX-010; this spec triggers the delete through the shared
// command path (Edit > Delete -> CanvasContextMenu.runCommand('delete')) and exercises the
// toast itself by finger. The finger-only path (long-press row menu) runs on iPad landscape.
const EVID = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-037';

const boot = async (page, { clock = false } = {}) => {
  if (clock) await page.clock.install();
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  // SETUP through the app API (not the gesture under test).
  return page.evaluate(() => {
    const { engine, ui, renderer } = window.app;
    const a = engine.addLayer('spiral');
    const b = engine.addLayer('flowfield');
    window.app.pushHistory();
    renderer.setSelection([b], b);
    engine.activeLayerId = b;
    ui.renderLayers();
    return { a, b, order: engine.layers.map((l) => l.id) };
  });
};

const toastRect = (page) => page.evaluate(() => {
  const el = document.querySelector('#vectura-toast-host .vectura-toast');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
});

test('toast geometry + undo by finger', async ({ page }, testInfo) => {
  const ids = await boot(page, { clock: true });
  // Freeze page time so slow CI probes (hitArea) cannot eat the 6 s timer; runFor() drives it.
  await page.clock.pauseAt(new Date(Date.now() + 60_000));
  await page.evaluate(() => window.Vectura.UI.CanvasContextMenu.runCommand('delete'));
  const undo = page.locator('#vectura-toast-host [data-action="undo"]');
  await expect(undo).toBeVisible();

  const hit = await touch.hitArea(page, undo);
  const box = await undo.boundingBox();
  expect(Math.min(box.width, hit.w), `undo target ${box.width}x${box.height}, hit ${hit.w}x${hit.h}`).toBeGreaterThanOrEqual(44);
  expect(Math.min(box.height, hit.h)).toBeGreaterThanOrEqual(44);

  const geo = await page.evaluate(() => {
    const toast = document.querySelector('#vectura-toast-host .vectura-toast').getBoundingClientRect();
    const rect = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? r : null; };
    const hits = (a, b) => b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;bottom:0;height:var(--tux-safe-bottom);width:1px;visibility:hidden';
    document.body.appendChild(probe);
    const safe = probe.getBoundingClientRect().height;
    probe.remove();
    const modbar = document.querySelector('#touch-modifier-bar:not(.hidden)');
    return {
      toast: { l: toast.left, t: toast.top, r: toast.right, b: toast.bottom },
      vw: innerWidth, vh: innerHeight, safe,
      header: hits(toast, rect('#app-header')),
      modbar: modbar ? hits(toast, modbar.getBoundingClientRect()) : false,
    };
  });
  expect(geo.toast.l).toBeGreaterThanOrEqual(0);
  expect(geo.toast.t).toBeGreaterThanOrEqual(0);
  expect(geo.toast.r).toBeLessThanOrEqual(geo.vw);
  expect(geo.toast.b).toBeLessThanOrEqual(geo.vh - geo.safe);
  expect(geo.header, 'toast overlaps #app-header').toBe(false);
  expect(geo.modbar, 'toast overlaps #touch-modifier-bar').toBe(false);
  await page.screenshot({ path: `${EVID}/${testInfo.project.name}.png` }).catch(() => {});

  // Still visible at 4.9 s (default is 6 s with an action).
  await page.clock.runFor(4900);
  await expect(undo).toBeVisible();

  await touch.tap(page, undo);
  await expect(page.locator('#vectura-toast-host .vectura-toast')).toHaveCount(0);
  const after = await page.evaluate(() => window.app.engine.layers.map((l) => l.id));
  expect(after).toEqual(ids.order);
});

test('finger-only path: long-press row menu -> Delete -> Undo', async ({ page }, testInfo) => {
  test.skip(!/^(touch|webkit)-ipad-landscape$/.test(testInfo.project.name), 'finger-only path runs on iPad landscape');
  const ids = await boot(page);
  const pt = await page.evaluate((id) => {
    const card = document.querySelector(`#layer-list [data-layer-id="${id}"]`);
    const name = card.querySelector('.lvl-name, .lvl-grp-name');
    const r = name.getBoundingClientRect();
    return { x: r.left + Math.min(r.width / 2, 60), y: r.top + r.height / 2 };
  }, ids.b);
  await touch.longPress(page, pt);
  const del = page.locator('.menu-dropdown.is-context-menu.open .menu-entry[data-key="delete"]');
  await expect(del).toBeVisible();
  await touch.tap(page, del);
  const undo = page.locator('#vectura-toast-host [data-action="undo"]');
  await expect(undo).toBeVisible();
  await touch.tap(page, undo);
  const after = await page.evaluate(() => window.app.engine.layers.map((l) => l.id));
  expect(after).toEqual(ids.order);
  await expect(page.locator('#vectura-toast-host .vectura-toast')).toHaveCount(0);
});

test('safe-area simulation moves the toast up by the safe inset', async ({ page }, testInfo) => {
  test.skip(!/^(touch|webkit)-iphone-portrait$/.test(testInfo.project.name), 'safe-area case runs on iPhone portrait');
  await boot(page);
  await page.evaluate(() => window.Vectura.UI.CanvasContextMenu.runCommand('delete'));
  await expect(page.locator('#vectura-toast-host [data-action="undo"]')).toBeVisible();
  const before = (await toastRect(page)).bottom;
  await page.addStyleTag({ content: ':root{--safe-bottom:34px}' });
  const after = (await toastRect(page)).bottom;
  expect(before - after).toBeGreaterThanOrEqual(34);
});

test('a plain toast stacks bottom-centre above an Undo toast and never covers the save field', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.Vectura.UI.CanvasContextMenu.runCommand('delete'));
  await expect(page.locator('#vectura-toast-host [data-action="undo"]')).toBeVisible();
  await page.evaluate(() => window.Vectura.UI.overlays.Toast.show({ message: 'Preset saved', duration: 0 }));
  const geo = await page.evaluate(() => {
    const toasts = [...document.querySelectorAll('#vectura-toast-host .vectura-toast')];
    const plain = toasts.find((t) => !t.querySelector('.vectura-toast-action'));
    const undo = toasts.find((t) => t.querySelector('.vectura-toast-action'));
    const pr = plain.getBoundingClientRect();
    const ur = undo.getBoundingClientRect();
    const f = document.querySelector('#preset-save-name');
    const fr = f && f.getBoundingClientRect();
    const hit = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    return {
      vw: innerWidth, vh: innerHeight, plain: { top: pr.top, right: pr.right, left: pr.left },
      undoMid: (ur.left + ur.right) / 2, undoTop: ur.top, plainBottom: pr.bottom,
      field: fr && fr.width > 0 ? hit(pr, fr) : false,
      maxW: getComputedStyle(undo).maxWidth,
    };
  });
  // TUX-048 supersedes TUX-037 fix round 2: every touch toast is bottom-centre (the host stacks them).
  expect(geo.plain.top).toBeGreaterThan(geo.vh / 2 - 0.5);
  expect(Math.abs((geo.plain.left + geo.plain.right) / 2 - geo.vw / 2)).toBeLessThan(2);
  expect(geo.plainBottom).toBeLessThan(geo.undoTop);
  expect(Math.abs(geo.undoMid - geo.vw / 2)).toBeLessThan(2);
  expect(geo.field).toBe(false);
  expect(parseFloat(geo.maxW)).toBeLessThanOrEqual(geo.vw - 32 + 0.5);
});

test('a finger tap on the Undo toast body does not stop auto-dismiss', async ({ page }, testInfo) => {
  test.skip(!/^(touch|webkit)-ipad-landscape$/.test(testInfo.project.name), 'timing case runs on iPad landscape');
  test.setTimeout(30000);
  await boot(page);
  await page.evaluate(() => window.Vectura.UI.CanvasContextMenu.runCommand('delete'));
  const msg = page.locator('#vectura-toast-host .vectura-toast-msg');
  await expect(msg).toBeVisible();
  await touch.tap(page, msg);
  await expect(page.locator('#vectura-toast-host .vectura-toast')).toHaveCount(0, { timeout: 7000 });
});
