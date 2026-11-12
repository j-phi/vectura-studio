const { test, expect } = require('@playwright/test');

// Start Page P3 review fixes in a real browser: recents thumbnails keep their ink (SVG and PNG thumbs, dark and light
// papers), studio picks fill their cards, the 3D plate idles cheaply and is keyboard operable.
const boot = async (page, query = '?startPage=launch') => {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer && window.app.startPage));
};
const wipe = async (page) => {
  await page.context().clearCookies();
  await page.evaluate(async () => {
    try { localStorage.clear(); } catch (_) { /* noop */ }
    await Promise.all(['vectura-start', 'vectura-start-plates', 'vectura-start-art'].map((n) => new Promise((res) => {
      const r = indexedDB.deleteDatabase(n); r.onsuccess = r.onerror = r.onblocked = () => res();
    })));
  });
};
const fresh = async (page, query) => { await boot(page, query); await wipe(page); await boot(page, query); };

// One recent per case: paper + ink + thumb kind. The PNG case forces the > 250 KB path (a 512 px PNG with no readable ground).
const CASES = [
  { name: 'svg-light', paper: '#f4efe4', ink: '#1d3a8a', kind: 'svg' },
  { name: 'png-light', paper: '#f4efe4', ink: '#8a1d1d', kind: 'png' },
  { name: 'svg-dark', paper: '#14181f', ink: '#f2d27a', kind: 'svg' },
  { name: 'png-dark', paper: '#14181f', ink: '#7fd1b9', kind: 'png' },
  { name: 'resume-newest', paper: '#f4efe4', ink: '#2a2a2a', kind: 'svg' },
];
const seed = async (page, cases) => {
  await page.evaluate(async (list) => {
    const V = window.Vectura; V.SETTINGS.cookiePreferencesEnabled = true;
    for (const c of list) {
      window.app.engine.layers.length = 0; window.app.engine.addLayer('rings');
      V.SETTINGS.paper = Object.assign({}, V.SETTINGS.paper, { color: c.paper });
      V.SETTINGS.pens[0].color = c.ink;
      let thumb; // undefined = the real thumbnail
      if (c.kind === 'png') {
        const R = V.UI.RecentsController; const doc = window.app.ui.buildSvgDocument();
        const png = await R.svgToPng(R.thumbSvg(doc.svg, c.paper));
        thumb = { kind: 'png', data: png };
      }
      await window.app.recents.record({ name: `${c.name}.vectura`, source: 'save', forceNew: true, thumb });
    }
    window.app.engine.layers.length = 0; window.app.markDocumentClean();
  }, cases);
};

// Pixel facts of a tinted rail thumbnail: ink coverage and ink-vs-paper luminance contrast of what is actually painted.
const probeTint = (host, inkHex) => host.evaluate((el, ink0) => {
  const cv = el.querySelector('canvas.sp-tint'); if (!cv) return null;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let ink = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 30) ink++;
  const lum = (c) => { const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(c); const v = [1, 2, 3].map((k) => { const x = +m[k] / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const inkRGB = `rgb(${[1, 3, 5].map((i) => parseInt(ink0.slice(i, i + 2), 16)).join(',')})`; // the tint paints every pixel in the ink color; only alpha varies
  const L1 = lum(inkRGB); const L2 = lum(getComputedStyle(el).backgroundColor);
  return { w: cv.width, h: cv.height, inkFrac: ink / (d.length / 4), contrast: (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05) };
}, inkHex);

test.describe('Start Page P3 fixes', () => {
  test('rail thumbnails keep visible ink: SVG and PNG thumbs on light and dark papers, drawn at 512 px from the viewBox', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await fresh(page);
    await seed(page, CASES);
    await page.evaluate(() => window.app.startPage.show());
    const rows = page.locator('#sp-list .sp-row .sp-thumb');
    await expect(rows).toHaveCount(4);
    await expect(page.locator('#sp-list .sp-row .sp-thumb canvas.sp-tint')).toHaveCount(4, { timeout: 15000 });
    for (let i = 0; i < 4; i++) {
      const name = await page.locator('#sp-list .sp-row').nth(i).getAttribute('title');
      const c = CASES.find((k) => name.startsWith(k.name));
      const r = await probeTint(rows.nth(i), c.ink);
      expect(r, name).not.toBeNull();
      expect(Math.max(r.w, r.h), `${name} canvas size`).toBeGreaterThanOrEqual(500); // never the 194 x 150 default raster
      expect(r.inkFrac, `${name} ink coverage`).toBeGreaterThan(0.02);
      expect(r.contrast, `${name} ink/paper contrast`).toBeGreaterThan(3);
      const paper = await rows.nth(i).evaluate((e) => e.style.background || getComputedStyle(e).backgroundColor);
      expect(paper, name).not.toBe('');
    }
  });

  test('the PNG thumbnail case reads the recorded paper, not a missing SVG ground', async ({ page }) => {
    await fresh(page);
    await seed(page, CASES.filter((c) => c.kind === 'png'));
    const own = await page.evaluate(async () => (await window.Vectura.StartPageArtSource.listRecentFirst()).filter((a) => a.kind === 'work').map((a) => [a.name, a.ownColors.paper, a.ownColors.ink]));
    expect(own).toEqual([['png-dark', '#14181f', '#7fd1b9'], ['png-light', '#f4efe4', '#8a1d1d']]);
  });

  test('studio picks fill their cards: the Chrysanthemum ink box takes at least 70 % of the card', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await fresh(page);
    await page.evaluate(() => window.app.startPage.show());
    const pick = page.locator('#sp-picks .sp-pick', { hasText: 'Chrysanthemum' });
    await pick.scrollIntoViewIfNeeded();
    const art = pick.locator('.sp-pick-art');
    await expect.poll(() => art.evaluate((e) => !!(e._spInk && e._spInk.parsed && e._spInk.win)), { timeout: 20000 }).toBe(true);
    const fill = await art.evaluate((e) => {
      const h = e._spInk; const G = window.Vectura.StartPageArtGeometry; const [, , iw, ih] = G.inkInfo(h.parsed).box;
      const s = h.w / h.win[2];
      return Math.max(iw * s / e.clientWidth, ih * s / e.clientHeight);
    });
    expect(fill).toBeGreaterThanOrEqual(0.7);
    expect(fill).toBeLessThanOrEqual(1.0001); // and nothing is cut off
  });

  test('a pointer that arrives before the art is parsed still gets the hover effect once it is ready', async ({ page }) => {
    await fresh(page);
    const r = await page.evaluate(async () => {
      const V = window.Vectura; const svg = await (await fetch('/tests/fixtures/start-page/lissajous-trefoil.svg')).text();
      const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:0;top:0;width:300px;height:300px;z-index:99999';
      document.body.appendChild(host);
      let calls = 0; const orig = V.StartPageHoverFx.attach; V.StartPageHoverFx.attach = function () { calls += 1; return orig.apply(this, arguments); };
      const p = V.StartPageInk.mount(host, { id: 'early', svg }, { colorway: { paper: '#f4efe4', ink: '#222222', ink2: null, key: 'k' } });
      V.StartPageMotion.bindArt(host, { handle: () => host._spInk, hover: () => 'ripple', animateIn: () => 'plot', kind: 'plate' });
      host.dispatchEvent(new PointerEvent('pointerenter'));
      const early = { parsed: host._spInk.parsed, calls };
      await p;
      await new Promise((res) => setTimeout(res, 0));
      const out = { early, calls };
      V.StartPageHoverFx.attach = orig; host.remove();
      return out;
    });
    expect(r.early).toEqual({ parsed: null, calls: 0 });
    expect(r.calls).toBe(1);
  });

  test('a 3D plate is a still drawing: no live model, no drag surface, no hint, drawn through the normal ink path', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await fresh(page);
    await seed(page, [{ name: 'torus', paper: '#f4efe4', ink: '#222222', kind: 'svg' }]);
    await page.evaluate(() => { window.app.engine.layers.length = 0; window.app.engine.addLayer('topoform'); return window.app.recents.record({ name: 'topo.vectura', source: 'save', forceNew: true }); });
    await page.evaluate(() => { window.app.engine.layers.length = 0; window.app.startPage.show(); });
    const m = page.locator('.sp-pl .spl-print[data-3d]').first();
    await expect(m).toBeAttached({ timeout: 15000 });
    await m.scrollIntoViewIfNeeded();
    await expect.poll(() => m.evaluate((e) => !!(e._spInk && e._spInk.parsed && e.classList.contains('sp-ink-ready'))), { timeout: 15000 }).toBe(true);
    expect(await m.evaluate((e) => e._spInk.fit)).toBe('focus');
    await expect(page.locator('.sp-pl .vorbit, .sp-pl .sp-scene-orbit, .sp-pl .spl-3dhint')).toHaveCount(0);
    expect(await m.evaluate((e) => ({ vorbit: !!e._vorbit, scene: !!e._spScene, app: !!e.querySelector('canvas[role="application"]'), hint: e.dataset.hint || null }))).toEqual({ vorbit: false, scene: false, app: false, hint: null });
    await expect(page.locator('.sp-pl').filter({ hasText: /drag it to turn it|drag to rotate/i })).toHaveCount(0);
  });
});
