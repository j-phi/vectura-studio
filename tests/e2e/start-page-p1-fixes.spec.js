const { test, expect } = require('@playwright/test');

// Start Page P1 review fixes (second pass), in a real browser. Opt in to the launch overlay with ?startPage=launch.
const TYPES = ['wavetable', 'lissajous', 'rings', 'spiral', 'topo', 'harmonograph', 'grid'];

const boot = async (page, query = '?startPage=launch') => {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer));
};
const resetStorage = async (page) => {
  await page.context().clearCookies();
  await page.evaluate(() => { try { localStorage.clear(); indexedDB.deleteDatabase('vectura-start'); } catch (_) { /* noop */ } });
};
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

test.describe('Start Page review fixes', () => {
  test('XSS: crafted art never executes when mounted in a tile', async ({ page }) => {
    await boot(page);
    const fired = await page.evaluate(async () => {
      window.__x = [];
      const payloads = [
        '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10"/><img src="x"onerror="window.__x.push(1)"></svg>',
        '<svg viewBox="0 0 10 10"><path d="M0 0L10 10"/><svg/onload=window.__x.push(3)></svg>',
        '<svg viewBox="0 0 10 10"><path d="M0 0L10 10"/><a href=javascript:window.__x.push(2)><path d="M0 0L5 5"/></a></svg>',
        '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10"/><img src="x" onerror="window.__x.push(4)"/><a href="javascript:window.__x.push(5)"><path d="M0 0L5 5"/></a></svg>',
        '<svg viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg><img src=x onerror=window.__x.push(6)>',
      ];
      const host = document.createElement('div');
      host.style.cssText = 'width:200px;height:200px;position:fixed;left:0;top:0;z-index:99999';
      document.body.appendChild(host);
      for (let i = 0; i < payloads.length; i++) {
        const el = document.createElement('div');
        el.style.cssText = 'width:100px;height:100px';
        host.appendChild(el);
        await window.Vectura.StartPageInk.mount(el, { id: `x${i}`, svg: payloads[i] }, { raster: false });
      }
      await new Promise((r) => setTimeout(r, 600));
      return { fired: window.__x, bad: host.querySelectorAll('img,script,iframe,a,[onerror],[onload]').length };
    });
    expect(fired.fired).toEqual([]);
    expect(fired.bad).toBe(0);
  });

  test('the Still toast never covers the header controls and the gear is clickable at once', async ({ page }) => {
    await bootWithWorks(page);
    await page.locator('#sp-motion-btn').click();
    const toast = page.locator('#vectura-toast-host .vectura-toast').first();
    await expect(toast).toBeVisible();
    const overlap = await page.evaluate(() => {
      const t = document.querySelector('#vectura-toast-host .vectura-toast').getBoundingClientRect();
      const hdr = document.querySelector('#start-page .sp-hdr').getBoundingClientRect();
      return t.bottom > hdr.top && t.top < hdr.bottom && t.right > hdr.left && t.left < hdr.right;
    });
    expect(overlap).toBe(false);
    await page.locator('#sp-settings-btn').click({ timeout: 1500 });
    await expect(page.locator('#sp-settings')).toBeVisible();
    // the normal auto-dismiss still applies
    await expect(toast).toBeHidden({ timeout: 9000 });
  });

  test('descenders: every letter\'s ink box lies inside its container, in every cover style', async ({ page }) => {
    test.setTimeout(240_000);
    await bootWithWorks(page);
    for (const style of ['mosaic', 'word']) {
      for (const word of ['Rings', 'Studies', 'Vectura']) {
        await page.evaluate(async ({ style: s, word: w }) => {
          const p = window.Vectura.SETTINGS.startPage;
          p.coverStyle = s; p.coverWord = 'custom'; p.customWord = w;
          await window.app.startPage.render({ animate: false });
        }, { style, word });
        await expect.poll(() => page.locator('#start-page .sp-word-fill').count()).toBeGreaterThan(0);
        await page.waitForFunction(() => {
          const fills = [...document.querySelectorAll('#start-page .sp-word')];
          return fills.length > 0 && fills.every((e) => e.classList.contains('sp-word-on'));
        }, null, { timeout: 60_000 });
        const out = await page.evaluate(() => {
          const bad = [];
          document.querySelectorAll('#start-page .sp-word').forEach((w) => {
            const c = w.querySelector('.sp-word-fill');
            if (!c) return;
            const r = c.getBoundingClientRect();
            const label = (w.textContent || '').trim().slice(0, 12) || w.className;
            for (let n = w; n && n.id !== 'start-page'; n = n.parentElement) {
              const cs = getComputedStyle(n);
              const clipX = ['hidden', 'clip', 'auto', 'scroll'].includes(cs.overflowX);
              const clipY = ['hidden', 'clip'].includes(cs.overflowY); // a scroller grows, it never clips a descender
              const isBtn = n.classList && n.classList.contains('sp-lt'); // the letter button: the descender must stay inside it
              if (!clipX && !clipY && !isBtn) continue;
              const b = n.getBoundingClientRect();
              const outX = (clipX && !isBtn) && (r.left < b.left - 1 || r.right > b.right + 1);
              const outY = (clipY || isBtn) && (r.top < b.top - 1 || r.bottom > b.bottom + 1);
              if (outX || outY) bad.push(`${label}: ink ${[r.left, r.top, r.right, r.bottom].map(Math.round)} outside ${n.className} ${[b.left, b.top, b.right, b.bottom].map(Math.round)}`);
            }
          });
          return bad;
        });
        expect(out, `${style} / ${word}`).toEqual([]);
      }
    }
  });

  test('Cover Specimen keeps the h1 heading and puts a button inside it', async ({ page }) => {
    await bootWithWorks(page);
    await page.evaluate(async () => { window.Vectura.SETTINGS.startPage.coverStyle = 'word'; await window.app.startPage.render({ animate: false }); });
    const heading = page.locator('#start-page h1').filter({ has: page.locator('button, a') }).first();
    await expect(heading).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    const btn = heading.locator('button, a').first();
    await expect(btn).toHaveAccessibleName(/Open|piece/i);
    await btn.focus();
    await expect(btn).toBeFocused();
  });

  test('Esc on the Settings gear closes only the popover; focus returns to the gear', async ({ page }) => {
    await bootWithWorks(page);
    await page.evaluate(() => window.app.engine.addLayer('wavetable'));
    await page.evaluate(() => window.app.startPage.render());
    await page.locator('#sp-settings-btn').click();
    await expect(page.locator('#sp-settings')).toBeVisible();
    await page.locator('#sp-settings-btn').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#sp-settings')).toBeHidden();
    await expect(page.locator('#start-page')).toBeVisible();
    await expect(page.locator('#sp-settings-btn')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#start-page')).toBeHidden();
  });

  test('the editor\'s idle rAF tickers park while the Start Page is open and resume on close', async ({ page }) => {
    await bootWithWorks(page);
    await page.evaluate(() => window.app.engine.addLayer('wavetable'));
    await page.evaluate(() => window.app.startPage.render());
    await page.waitForTimeout(1500);
    const count = (ms) => page.evaluate((span) => new Promise((res) => {
      let n = 0; const orig = window.requestAnimationFrame;
      window.requestAnimationFrame = (f) => { n += 1; return orig(f); };
      setTimeout(() => { window.requestAnimationFrame = orig; res(n); }, span);
    }), ms);
    const open = await count(1500);
    expect(open, 'rAF requests while the Start Page is open').toBeLessThanOrEqual(3);
    await page.locator('#start-page [data-act="back"]').click();
    await page.waitForTimeout(200);
    const closed = await count(1000);
    expect(closed, 'rAF requests once the editor is back').toBeGreaterThan(20);
  });
});
