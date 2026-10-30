const { test, expect } = require('@playwright/test');

// Start Page cover (P1). Opt in to the launch overlay with ?startPage=launch.
const TYPES = ['wavetable', 'lissajous', 'rings', 'spiral', 'topo', 'harmonograph', 'grid'];

const boot = async (page, query = '?startPage=launch') => {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
};

const { resetStorage } = require('./helpers/start-page');

// Seven real works in the recents store, each a different algorithm (real export thumbnails).
const seedWorks = async (page, types = TYPES) => {
  await page.evaluate(async (list) => {
    for (const t of list) {
      window.app.engine.layers.length = 0;
      window.app.engine.addLayer(t);
      await window.app.recents.record({ name: `${t}.vectura`, source: 'open' });
    }
    window.app.engine.layers.length = 0;
  }, types);
};

const bootWithWorks = async (page) => {
  await boot(page);
  await resetStorage(page);
  await boot(page);
  await seedWorks(page);
  await page.evaluate(() => window.app.startPage.render());
};

test.describe('Start Page cover', () => {
  test('Vectura is seven letters, each a button with distinct art', async ({ page }) => {
    await bootWithWorks(page);
    const letters = page.locator('#start-page .sp-lt');
    await expect(letters).toHaveCount(7);
    const ids = await letters.evaluateAll((els) => els.map((e) => e.dataset.artId));
    expect(new Set(ids).size).toBe(7);
    await expect(letters.first()).toHaveAttribute('aria-label', /^V, /);
    await expect(page.locator('#start-page .sp-lt .sp-word-on').first()).toBeVisible();
  });

  test('switching color mode recolors without re-plotting', async ({ page }) => {
    await bootWithWorks(page);
    await expect(page.locator('#start-page .sp-lt .sp-word-on')).toHaveCount(7);
    const handles = await page.evaluate(() => { window.__h = [...document.querySelectorAll('#start-page .sp-lt .sp-vw')].map((e) => e._spWord); return window.__h.length; });
    expect(handles).toBe(7);
    const before = await page.locator('#start-page .sp-lt .sp-vw').evaluateAll((els) => els.map((e) => e.dataset.spKey));
    await page.locator('#start-page [data-sp-mode="wildcard"]').click();
    await expect.poll(async () => page.locator('#start-page .sp-lt .sp-vw').evaluateAll((els) => els.map((e) => e.dataset.spKey).join('|'))).not.toBe(before.join('|'));
    const same = await page.evaluate(() => [...document.querySelectorAll('#start-page .sp-lt .sp-vw')].every((e, i) => e._spWord === window.__h[i]));
    expect(same).toBe(true);
  });

  test('Still persists across a reload (cookie saving auto-enabled)', async ({ page }) => {
    await bootWithWorks(page);
    await page.locator('#sp-motion-btn').click();
    await expect(page.locator('#sp-motion-btn')).toHaveAttribute('aria-pressed', 'true');
    await boot(page);
    await expect(page.locator('#sp-motion-btn')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-sp-motion'))).toBe('still');
  });

  test('rail collapse persists across a reload', async ({ page }) => {
    await bootWithWorks(page);
    await page.locator('#sp-rail-toggle').click();
    await expect(page.locator('#start-page')).toHaveAttribute('data-rail', 'closed');
    await expect(page.locator('#sp-colo')).toBeVisible();
    await page.evaluate(() => { window.app.persistPreferences({ force: true }); });
    await boot(page);
    await expect(page.locator('#start-page')).toHaveAttribute('data-rail', 'closed');
  });

  test('keyboard path: header, settings, cover letters, color controls', async ({ page }) => {
    await bootWithWorks(page);
    await page.locator('#sp-settings-btn').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#sp-settings')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#sp-settings')).toBeHidden();
    await expect(page.locator('#sp-settings-btn')).toBeFocused();
    await page.locator('#start-page .sp-lt').first().focus();
    await expect(page.locator('#start-page .sp-key-row .sp-kk.on')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator('#start-page .sp-lt').nth(1)).toBeFocused();
    await page.locator('#start-page [data-sp-mode="curated"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#start-page [data-sp-mode="mono"]')).toHaveAttribute('aria-checked', 'true');
  });

  for (const word of ['Rings', 'Studies']) {
    test(`no clipped descenders in the cover word "${word}"`, async ({ page }) => {
      await bootWithWorks(page);
      await page.evaluate((w) => {
        window.Vectura.SETTINGS.startPage.coverStyle = 'word';
        window.Vectura.SETTINGS.startPage.coverWord = 'custom';
        window.Vectura.SETTINGS.startPage.customWord = w;
        window.app.startPage.render();
      }, word);
      const box = page.locator('#start-page .sp-xc-word .sp-word-fill');
      await expect(box).toBeVisible();
      const inside = await page.evaluate(() => {
        const host = document.querySelector('#start-page .sp-xc-word');
        const cv = host.querySelector('.sp-word-fill');
        const h = host.getBoundingClientRect(); const c = cv.getBoundingClientRect();
        return { top: c.top - h.top, bottom: h.bottom - c.bottom, hostH: h.height, canvasH: c.height };
      });
      expect(inside.bottom).toBeGreaterThanOrEqual(-0.5);
      expect(inside.top).toBeGreaterThanOrEqual(-0.5);
    });
  }

  test('cover Colorways fan: opens in the chosen colorway through StartPageOpenArt, Esc returns focus, Still stills it', async ({ page }) => {
    await bootWithWorks(page);
    await page.evaluate(() => { window.Vectura.SETTINGS.startPage.coverStyle = 'band'; window.app.startPage.render(); });
    const btn = page.locator('#start-page .sp-cv-fan');
    await expect(btn).toBeVisible();
    await btn.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.sp-fan .sp-fan-card')).toHaveCount(4);
    await page.keyboard.press('Escape');
    await expect(page.locator('.sp-fan')).toHaveCount(0);
    await expect(btn).toBeFocused();
    await page.evaluate(() => window.Vectura.StartPageInk.setMotion({ still: true }));
    await btn.click();
    await expect(page.locator('.sp-fan.still')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.Vectura.StartPageInk.setMotion({ still: false }));
    await page.evaluate(() => {
      const O = window.Vectura.StartPageOpenArt; const orig = O.open;
      window.__picked = null;
      O.open = (art, cw, o) => { window.__picked = cw; return orig.call(O, art, cw, o); };
    });
    await btn.click();
    await page.locator('.sp-fan .sp-fan-card').nth(2).click();
    // The seeded canvas is unsaved, so opening asks before replacing it.
    await page.locator('.vectura-modal-backdrop button', { hasText: /^Open$/ }).click();
    await expect(page.locator('#start-page')).toBeHidden({ timeout: 15000 });
    const got = await page.evaluate(() => ({ picked: window.__picked, paper: (window.Vectura.SETTINGS.paper || {}).color, ink: window.Vectura.SETTINGS.pens[0].color }));
    expect(got.picked).toBeTruthy();
    expect(got.paper.toLowerCase()).toBe(got.picked.paper.toLowerCase());
    expect(got.ink.toLowerCase()).toBe(got.picked.ink.toLowerCase());
  });

  test('fan captions and heading are fully readable at 400 px', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 800 });
    await bootWithWorks(page);
    await page.evaluate(() => { window.Vectura.SETTINGS.startPage.coverStyle = 'band'; window.app.startPage.render(); });
    await page.locator('#start-page .sp-cv-fan').click();
    await expect(page.locator('.sp-fan .sp-fan-card')).toHaveCount(4);
    await page.waitForTimeout(700);
    const m = await page.evaluate(() => ({
      caps: [...document.querySelectorAll('.sp-fan-cap')].map((c) => ({ w: c.scrollWidth - c.clientWidth, h: c.scrollHeight - c.clientHeight, ell: getComputedStyle(c).textOverflow })),
      head: (() => { const r = document.querySelector('.sp-fan-head').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top }; })(),
    }));
    m.caps.forEach((c) => { expect(c.w).toBeLessThanOrEqual(1); expect(c.h).toBeLessThanOrEqual(1); expect(c.ell).not.toBe('ellipsis'); });
    expect(m.head.l).toBeGreaterThanOrEqual(0);
    expect(m.head.r).toBeLessThanOrEqual(400.5);
    expect(m.head.t).toBeGreaterThanOrEqual(0);
  });

  test('narrow: colophon scrolls with the page, hints hidden, Tab starts at the top', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 800 });
    await bootWithWorks(page);
    await expect.poll(() => page.evaluate(() => document.querySelector('#sp-colo-wrap').parentElement.id)).toBe('sp-scroll');
    await expect(page.locator('#sp-colo-wrap .sp-co-btn kbd').first()).toBeHidden();
    const hdr = await page.evaluate(() => document.querySelector('.sp-hdr').getBoundingClientRect().bottom);
    expect(hdr).toBeLessThan(60);
  });

  test('wide: initial focus is at the top of the page and Tab visits header before cover before rail', async ({ page }) => {
    await bootWithWorks(page);
    await page.evaluate(() => { window.app.startPage.hide({ restoreFocus: false }); window.app.startPage.show(); });
    await expect.poll(() => page.evaluate(() => !!document.activeElement.closest('.sp-hdr'))).toBe(true);
    const order = await page.evaluate(() => { const r = document.querySelector('#start-page'); const a = [...r.querySelectorAll('button')].filter((b) => b.getClientRects().length && !b.closest('[inert]')); const idx = (sel) => a.findIndex((b) => b.matches(sel) || b.closest(sel)); return { skip: [...r.querySelectorAll('button')][0].dataset.act, hdr: idx('.sp-hdr'), cover: idx('#sp-cover'), rail: idx('#sp-rail') }; });
    expect(order.skip).toBe('skip');
    expect(order.hdr).toBeLessThan(order.cover);
    expect(order.cover).toBeLessThan(order.rail);
  });
});
