const { test, expect } = require('@playwright/test');

// Start Page accessibility (WCAG 2.1 AA): text contrast in all four Meridian/Classic skins, 2.5.8 target size at
// 400 px, and the structural fixes from the P4 audit (action vs toggle semantics, per-item names, focus order, toasts).
const TYPES = ['rings', 'topo', 'flowfield', 'rainfall', 'lissajous', 'wavetable', 'spiral'];
const THEMES = ['dark', 'light', 'classic-dark', 'classic-light'];

const boot = async (page) => {
  await page.goto('/?startPage=launch');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer && window.app.startPage));
};
const seed = async (page) => {
  await boot(page);
  await page.evaluate(() => { try { localStorage.clear(); ['vectura-start', 'vectura-start-plates', 'vectura-start-art'].forEach((n) => indexedDB.deleteDatabase(n)); } catch (_) { /* noop */ } });
  await boot(page);
  await page.evaluate(async (list) => {
    window.Vectura.SETTINGS.cookiePreferencesEnabled = true;
    for (const t of list) {
      window.app.engine.layers.length = 0;
      window.app.engine.addLayer(t);
      await window.app.recents.record({ name: `${t}-study.vectura`, source: 'save' });
    }
    window.app.engine.layers.length = 0;
    window.app.markDocumentClean();
  }, TYPES);
  await page.evaluate(() => window.app.startPage.show());
  await page.locator('#sp-plates .sp-pl:not([data-off]) .spl').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(1200);
};

// WCAG 1.4.3 over every visible text node under `rootSel`. Art (image-backed or clipped text), disabled controls and
// the knocked-out cover word (transparent text fill) are excluded. Returns the failures only.
const contrastFails = (page, rootSel) => page.evaluate((sel) => {
  const root = document.querySelector(sel);
  if (!root) return [{ sel: `missing ${sel}` }];
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] == null ? 1 : p[3] }; };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = (el) => {
    const chain = []; let n = el; let img = false;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') img = true;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { chain.push(c); if (c.a >= 1) break; }
      n = n.parentElement;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    if (chain.length && chain[chain.length - 1].a < 1) base = parse(getComputedStyle(document.body).backgroundColor) || base;
    for (let i = chain.length - 1; i >= 0; i--) base = chain[i].a >= 1 ? chain[i] : over(chain[i], base);
    return { c: base, img };
  };
  const out = []; const seen = new Set();
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const el = w.currentNode.parentElement;
    if (!w.currentNode.nodeValue.trim() || !el || seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (el.closest('[disabled],[aria-disabled="true"],[data-off],[hidden]')) continue;
    if (cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)' || el.closest('.spl-word-ko,[data-txfill]')) continue;
    let fg = parse(el instanceof SVGElement ? cs.fill : cs.color);
    if (!fg || fg.a === 0) continue;
    let op = 1;
    for (let n = el; n && n !== document.body; n = n.parentElement) { const o = parseFloat(getComputedStyle(n).opacity); if (!Number.isNaN(o)) op *= o; }
    const bg = bgOf(el);
    if (bg.img) continue;
    fg = over({ ...fg, a: fg.a * op }, bg.c);
    const rt = ratio(fg, bg.c);
    const size = parseFloat(cs.fontSize); const bold = parseInt(cs.fontWeight, 10) >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    if (rt < need) out.push(`${rt.toFixed(2)}<${need} ${el.tagName.toLowerCase()}.${String(el.className.baseVal ?? el.className).trim().split(/\s+/).slice(0, 2).join('.')} "${w.currentNode.nodeValue.trim().slice(0, 24)}"`);
  }
  return [...new Set(out)];
}, rootSel);

for (const theme of THEMES) {
  test(`contrast: Start Page text clears WCAG AA in ${theme}`, async ({ page }) => {
    test.setTimeout(240000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await seed(page);
    await page.evaluate((t) => window.app.applyTheme(t), theme);
    await page.waitForTimeout(800);
    await page.locator('#sp-pl-show').selectOption('all');
    await page.waitForTimeout(800);
    const fails = {};
    for (const m of ['curated', 'mono', 'basic', 'wildcard']) {
      await page.locator(`[data-sp-mode="${m}"]`).click();
      await page.waitForTimeout(600);
      // Plates mount lazily: walk the page so every plate and the picks are in the DOM.
      await page.evaluate(async () => { const s = document.getElementById('sp-scroll'); for (let y = 0; y < s.scrollHeight; y += 450) { s.scrollTop = y; await new Promise((r) => setTimeout(r, 120)); } s.scrollTop = 0; });
      fails[`page/${m}`] = await contrastFails(page, '#sp-main');
    }
    fails.rail = await contrastFails(page, '#sp-rail');
    await page.locator('[data-sp-mode="curated"]').click();
    await page.click('#sp-settings-btn');
    await page.waitForTimeout(300);
    fails.settings = await contrastFails(page, '.sp-settings');
    await page.keyboard.press('Escape');
    await page.click('[aria-label="Choose the cover word"]');
    await page.waitForTimeout(300);
    fails.wordpicker = await contrastFails(page, '#sp-word-menu');
    await page.keyboard.press('Escape');
    await page.locator('#sp-plates [data-act="edit"]').first().click();
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelectorAll('[data-plate-editor] details').forEach((d) => { d.open = true; }));
    fails.editor = await contrastFails(page, '[data-plate-editor]');
    await page.locator('[data-spe-done]').click();
    await page.waitForTimeout(300);
    await page.click('#sp-pl-arrange');
    await page.waitForTimeout(400);
    fails.arrange = await contrastFails(page, '#sp-plates');
    await page.keyboard.press('Escape');
    const bad = Object.fromEntries(Object.entries(fails).filter(([, v]) => v.length));
    expect(bad).toEqual({});
  });
}

test('example plates explainer: real text, clears contrast in all four skins, no overflow at 400 px', async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await boot(page);
  await page.evaluate(() => { try { localStorage.clear(); ['vectura-start', 'vectura-start-plates', 'vectura-start-art'].forEach((n) => indexedDB.deleteDatabase(n)); } catch (_) { /* noop */ } });
  await boot(page);
  await page.evaluate(() => window.app.startPage.show());
  const ex = page.locator('#sp-plates .sp-pl-explain');
  await expect(ex).toBeVisible({ timeout: 20000 });
  await expect(ex).toContainText('automatically when you save or open a file');
  for (const theme of THEMES) {
    await page.evaluate((t) => window.app.applyTheme(t), theme);
    await page.waitForTimeout(500);
    expect(await contrastFails(page, '#sp-plates .sp-pl-head'), `${theme} head`).toEqual([]);
    expect(await contrastFails(page, '#sp-plates .sp-pl-explain'), `${theme} explainer`).toEqual([]);
    expect(await contrastFails(page, '#sp-plates .sp-pl-empty'), `${theme} empty`).toEqual([]);
  }
  await page.setViewportSize({ width: 400, height: 900 });
  await page.waitForTimeout(400);
  const box = await ex.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(400);
  expect(await page.evaluate(() => document.getElementById('sp-scroll').scrollWidth <= document.getElementById('sp-scroll').clientWidth + 1)).toBe(true);
});

test('target size: recents Clear, Show all and editor links are at least 24x24 at 400 px (2.5.8)', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 400, height: 800 });
  await seed(page);
  const measure = () => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden],[inert]');
    const sel = ['[data-act="clear-recent"]', '.sp-pl-lnk', '.spe-lnk:not([disabled])'];
    const out = [];
    for (const s of sel) for (const e of document.querySelectorAll(s)) { if (!vis(e)) continue; const r = e.getBoundingClientRect(); if (r.width < 24 || r.height < 24) out.push(`${s} ${Math.round(r.width)}x${Math.round(r.height)} "${(e.textContent || '').trim().slice(0, 20)}"`); }
    return out;
  });
  const small = await measure();
  await page.locator('#sp-plates [data-act="edit"]').first().scrollIntoViewIfNeeded();
  await page.locator('#sp-plates [data-act="edit"]').first().click();
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelectorAll('[data-plate-editor] details').forEach((d) => { d.open = true; }));
  const inEditor = await measure();
  expect([...new Set([...small, ...inEditor])]).toEqual([]);
  expect(await page.locator('[data-plate-editor] .spe-lnk').count()).toBeGreaterThan(0);
});

test('semantics: dice is an action, Open buttons are named per item, toasts are reachable, focus order is sane', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await expect(page.locator('#sp-dice')).not.toHaveAttribute('aria-pressed', /.*/);
  const names = await page.evaluate(() => [...document.querySelectorAll('#sp-plates .spl-btn')].map((b) => b.getAttribute('aria-label') || b.textContent.trim()));
  expect(names.length).toBeGreaterThan(3);
  expect(new Set(names).size).toBe(names.length);
  expect(names.every((n) => /Rings|Topo|Flow|Rain|Lissajous|Wave|Spiral/i.test(n))).toBe(true);
  const picks = await page.evaluate(() => [...document.querySelectorAll('.sp-pick-btn')].map((b) => b.getAttribute('aria-label') || ''));
  expect(picks.length).toBeGreaterThan(1);
  expect(picks.every((n) => n.startsWith('Open'))).toBe(true);
  expect(new Set(picks).size).toBe(picks.length);
  // The page is not an aria-modal dialog (its toast host lives outside it), and the toast host stays live.
  expect(await page.evaluate(() => {
    window.Vectura.UI.overlays.Toast.show({ message: 'A11y probe toast' });
    const sp = document.querySelector('.sp');
    const host = document.getElementById('vectura-toast-host');
    const blocked = !host || !!host.closest('[aria-hidden="true"],[inert]') || host.hasAttribute('inert');
    return { modal: sp.getAttribute('aria-modal'), toastReachable: !blocked && host.textContent.includes('A11y probe toast') };
  })).toEqual({ modal: null, toastReachable: true });
  // A skip link leads the page; Tab never falls off the end onto <body>.
  const first = await page.evaluate(() => { const sp = document.querySelector('.sp'); return sp.querySelector('a,button,[tabindex="0"]')?.textContent.trim(); });
  expect(first).toBe('Skip to start actions');
  await page.locator('#sp-rail input[data-pref="showOnLaunch"]').focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement && document.activeElement !== document.body && !!document.activeElement.closest('.sp'))).toBe(true);
});
