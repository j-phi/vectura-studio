const { test, expect } = require('@playwright/test');
const { PROJECTS } = require('./viewports');
const touch = require('../helpers/touch');

// TUX-050: Document Setup sections. Paper starts expanded on touch; collapsed
// bodies are visibility:hidden (not hit-testable, not focusable); only the
// header toggles a section. Fingers only. Document Setup is opened the way a
// user does it: (hamburger >) File > Document Setup, all by tap.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const phoneLayout = (page) => page.evaluate(() => document.body.classList.contains('phone-layout'));

const tapMenuItem = async (page, triggerId, itemId) => {
  if (await phoneLayout(page)) {
    await touch.tap(page, page.locator('#btn-menu-hamburger'));
    await page.waitForTimeout(150);
  }
  const trigger = page.locator(`#${triggerId}`);
  await trigger.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await touch.tap(page, trigger);
  await page.waitForTimeout(200);
  const item = page.locator(`#${itemId}`);
  await item.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await touch.tap(page, item);
};

const openDocSetup = async (page) => {
  await tapMenuItem(page, 'btn-menu-file', 'btn-settings');
  await page.waitForSelector('#settings-panel.open', { timeout: 5000 });
  await page.waitForTimeout(600); // drawer slide / scale animation
};

const snapshot = (page) => page.evaluate(() => Object.fromEntries(
  [...document.querySelectorAll('#settings-panel [data-sect-toggle]')].map((h, i) => [`${i}:${h.textContent.trim()}`, h.getAttribute('aria-expanded')]),
));

const PAPER = '#settings-panel .sect--color-paper [data-sect-toggle]';
const centreOf = (page, sel) => page.evaluate((s) => {
  const r = document.querySelector(s).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, sel);

test.beforeEach(async ({ page }, testInfo) => {
  const s = PROJECTS[testInfo.project.name];
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  const iw = await page.evaluate(() => innerWidth);
  expect(iw, 'innerWidth (no viewport inflation)').toBe(s.width);
  await openDocSetup(page);
});

test('A: Paper starts expanded on touch and the size select takes the first tap', async ({ page }) => {
  // Measured: on touch-iphone-landscape-chrome (innerHeight 330, browser chrome) the select rect
  // [12,295,862,339] extends past the window bottom (330). Needs TUX-007 layout; no scroll hacks here.
  test.fail(test.info().project.name === 'touch-iphone-landscape-chrome', 'select below 330px chrome viewport (TUX-007)');
  const hdr = page.locator(PAPER);
  expect(await hdr.getAttribute('aria-expanded'), 'Paper aria-expanded').toBe('true');
  expect(await hdr.evaluate((e) => e.classList.contains('is-open'))).toBe(true);
  const s0 = await snapshot(page);

  const vis = await page.evaluate(() => {
    const sel = document.getElementById('machine-profile');
    const r = sel.getBoundingClientRect();
    const body = sel.closest('.sect-body').getBoundingClientRect();
    const sc = (document.querySelector('.settings-panel-body') || sel.closest('form')).getBoundingClientRect();
    const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
    return {
      cx, cy, w: r.width, h: r.height,
      inBody: inside(r, body), inScroll: inside(r, sc), inWin: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
      hit: hit ? `${hit.tagName}#${hit.id}.${hit.className} "${(hit.textContent || '').trim().slice(0, 20)}"` : 'null',
      hitOk: !!hit && (hit === sel || sel.contains(hit)),
      rect: JSON.stringify([r.left, r.top, r.right, r.bottom]), sc: JSON.stringify([sc.left, sc.top, sc.right, sc.bottom]), ih: innerHeight,
    };
  });
  const msg = JSON.stringify(vis);
  expect(vis.w > 0 && vis.h > 0, `select has size ${msg}`).toBe(true);
  expect(vis.inBody, `inside .sect-body ${msg}`).toBe(true);
  expect(vis.inScroll, `inside scroll container ${msg}`).toBe(true);
  expect(vis.inWin, `inside window ${msg}`).toBe(true);
  expect(vis.hitOk, `elementFromPoint hit ${vis.hit}`).toBe(true);

  await touch.tap(page, { x: vis.cx, y: vis.cy });
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id), 'focused element after one tap').toBe('machine-profile');
  expect(await snapshot(page), 'no section changed state').toEqual(s0);

  await page.waitForTimeout(400);
  const final = await page.evaluate(() => {
    const b = document.querySelector('#settings-panel .sect--color-paper .sect-body');
    const cs = getComputedStyle(b);
    return { mh: cs.maxHeight, sh: b.scrollHeight, ch: b.clientHeight, ov: cs.overflow, vis: cs.visibility };
  });
  expect(final.vis).toBe('visible');
  expect(final.mh === 'none' || parseFloat(final.mh) >= final.sh, `max-height final ${JSON.stringify(final)}`).toBe(true);
  expect(final.ch >= final.sh - 1, `not clipped ${JSON.stringify(final)}`).toBe(true);
});

test('B: only the header toggles a section', async ({ page }) => {
  const s0 = await snapshot(page);
  const paperKey = Object.keys(s0).find((k) => /Paper/.test(k));
  await touch.tap(page, page.locator(PAPER));
  await page.waitForTimeout(500);
  const s1 = await snapshot(page);
  expect(s1[paperKey]).toBe('false');
  expect({ ...s1, [paperKey]: s0[paperKey] }, 'other headers unchanged').toEqual(s0);
  await touch.tap(page, page.locator(PAPER));
  await page.waitForTimeout(500);
  expect((await snapshot(page))[paperKey]).toBe('true');

  const before = await snapshot(page);
  for (const id of ['theme-family-classic', 'theme-family-modern']) {
    const loc = page.locator(`#${id}`);
    await loc.scrollIntoViewIfNeeded();
    await touch.tap(page, loc);
    await page.waitForTimeout(200);
    expect(await snapshot(page), `after tapping #${id}`).toEqual(before);
  }
});

test('C: collapsed section controls are not hit-testable or focusable', async ({ page }) => {
  const old = await centreOf(page, '#machine-profile');
  await touch.tap(page, page.locator(PAPER));
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#settings-panel .sect--color-paper .sect-body')).visibility === 'hidden', null, { timeout: 1500 }).catch(() => {});
  const r = await page.evaluate((o) => {
    const body = document.querySelector('#settings-panel .sect--color-paper .sect-body');
    const sel = document.getElementById('machine-profile');
    sel.focus();
    const focused = document.activeElement === sel;
    sel.blur();
    const hit = document.elementFromPoint(o.x, o.y);
    return { vis: getComputedStyle(body).visibility, focused, hitSel: !!hit && (hit === sel || sel.contains(hit)) };
  }, old);
  expect(r.vis, 'collapsed body visibility').toBe('hidden');
  expect(r.focused, 'collapsed select took focus').toBe(false);
  expect(r.hitSel, 'elementFromPoint at the old select centre is the select').toBe(false);

  await touch.tap(page, page.locator(PAPER));
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('#settings-panel .sect--color-paper .sect-body')).visibility)).toBe('visible');
  const c = await centreOf(page, '#machine-profile');
  await touch.tap(page, c);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('machine-profile');
});

// Open-then-close inside the transition must leave the section closed AND
// collapsed (no invisible full-height body under a closed header).
test('D: double-tap on one header leaves the section closed with a ~0 height body', async ({ page }) => {
  // Start from collapsed so the first tap is an open, the second a close.
  await touch.tap(page, page.locator(PAPER));
  await page.waitForTimeout(700);
  expect(await page.evaluate((s) => document.querySelector(s).getAttribute('aria-expanded'), PAPER)).toBe('false');
  const c = await centreOf(page, PAPER);
  const t0 = Date.now();
  await page.touchscreen.tap(c.x, c.y);
  await page.touchscreen.tap(c.x, c.y);
  const gap = Date.now() - t0;
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => {
    const hdr = document.querySelector('#settings-panel .sect--color-paper [data-sect-toggle]');
    const body = hdr.nextElementSibling;
    return { exp: hdr.getAttribute('aria-expanded'), h: body.getBoundingClientRect().height, maxH: body.style.maxHeight, vis: getComputedStyle(body).visibility };
  });
  expect(r.exp, `aria-expanded (two taps took ${gap} ms)`).toBe('false');
  expect(r.h, `body height ${JSON.stringify(r)}`).toBeLessThan(2);
});
