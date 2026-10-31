const { test, expect } = require('@playwright/test');

// Launch flicker (fx-flicker). The editor must never paint before a Start Page launch, the cover's letters play the
// prototype's sequence (outline, then the art plots inside the glyphs) without a solid placeholder or a blank gap, a
// re-render with unchanged inputs keeps the mounted letters, and the first painted page is the final layout.

// Samples the page on every animation frame from the first script on (what is about to paint).
const SAMPLER = () => {
  const log = { editorFrames: 0, frames: 0, pre: 0, solid: 0, blankLetter: 0, mounts: 0, bootSeen: false, skins: [], bgs: [] };
  window.__flk = log;
  new MutationObserver((ms) => ms.forEach((m) => {
    m.addedNodes.forEach((n) => { if (n.nodeType === 1 && (n.matches?.('.sp-lt') || n.querySelector?.('.sp-lt'))) log.mounts += n.matches('.sp-lt') ? 1 : n.querySelectorAll('.sp-lt').length; });
    if (m.type === 'attributes' && m.target.classList && m.target.classList.contains('sp-vw') && m.target.classList.contains('sp-pre')) log.pre += 1;
  })).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  const step = () => {
    const html = document.documentElement;
    const body = document.body;
    log.frames += 1;
    const skin = (document.getElementById('active-skin') || {}).href || '';
    const bg = getComputedStyle(html).backgroundColor;
    if (!log.skins.includes(skin)) log.skins.push(skin);
    if (!log.bgs.includes(bg)) log.bgs.push(bg);
    if (html.hasAttribute('data-sp-boot')) log.bootSeen = true;
    const sp = document.getElementById('start-page');
    const pageUp = !!sp && !sp.hidden && !sp.dataset.settling && getComputedStyle(sp).visibility !== 'hidden';
    if (body && getComputedStyle(body).visibility !== 'hidden' && !pageUp && document.getElementById('app-header')) log.editorFrames += 1;
    document.querySelectorAll('#start-page .sp-vw').forEach((v) => {
      const t = v.querySelector('.sp-word-text');
      if (t && getComputedStyle(t).color !== 'rgba(0, 0, 0, 0)') log.solid += 1;
      if (getComputedStyle(v).opacity !== '1') log.blankLetter += 1;
    });
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

const letters = (page) => page.locator('#start-page .sp-lt');
const settled = async (page) => {
  await expect(page.locator('#start-page .sp-lt .sp-word-on')).toHaveCount(7, { timeout: 30000 });
  await page.waitForFunction(() => ![...document.querySelectorAll('#start-page .sp-vw')].some((v) => v._spWord && v._spWord.run) && !document.querySelector('#start-page .sp-ink-drawing') && !document.querySelector('#start-page[data-settling]'), null, { timeout: 30000 });
};

test.describe('Start Page launch flicker', () => {
  test('the editor is never painted before a launch that shows the page', async ({ page }) => {
    await page.addInitScript(SAMPLER);
    await page.goto('/?startPage=launch');
    await settled(page);
    const log = await page.evaluate(() => window.__flk);
    expect(log.bootSeen).toBe(true);
    expect(log.editorFrames).toBe(0);
    await expect(page.locator('html')).not.toHaveAttribute('data-sp-boot', /.*/);
  });

  test('no cover is left behind when the page does not open (automation rule and saved preference)', async ({ page }) => {
    await page.addInitScript(SAMPLER);
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.renderer));
    expect(await page.evaluate(() => window.__flk.bootSeen)).toBe(false);
    await expect(page.locator('#start-page')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveAttribute('data-sp-boot', /.*/);
    // saved "never show", even with ?startPage=launch
    const p2 = await page.context().newPage();
    await p2.addInitScript(() => { localStorage.setItem('vectura_prefs', JSON.stringify({ version: 1, data: { startPage: { showOnLaunch: false } } })); });
    await p2.addInitScript(SAMPLER);
    await p2.goto('/?startPage=launch');
    await p2.waitForFunction(() => !!(window.app && window.app.ui && window.app.renderer));
    expect(await p2.evaluate(() => window.__flk.bootSeen)).toBe(false);
    await expect(p2.locator('html')).not.toHaveAttribute('data-sp-boot', /.*/);
    await expect(p2.locator('#app-header')).toBeVisible();
  });

  test('a saved light theme paints light from the first frame (no dark flash)', async ({ page }) => {
    await page.addInitScript(() => { try { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.clear(); localStorage.setItem('vectura_prefs', JSON.stringify({ version: 1, data: { uiTheme: 'light' } })); } } catch (_) { /* noop */ } });
    await page.addInitScript(SAMPLER);
    await page.goto('/?startPage=launch');
    await settled(page);
    const log = await page.evaluate(() => window.__flk);
    // every frame, from the first: only the light skin is ever linked and the ground is never dark
    expect(log.skins.length).toBeGreaterThan(0);
    log.skins.forEach((href) => expect(href).toContain('meridian-light'));
    log.bgs.forEach((c) => expect(['rgba(0, 0, 0, 0)', 'rgb(239, 239, 239)']).toContain(c));
  });

  test('letters mount once, never show a solid placeholder and never blank', async ({ page }) => {
    await page.addInitScript(SAMPLER);
    await page.goto('/?startPage=launch');
    await settled(page);
    const log = await page.evaluate(() => window.__flk);
    expect(log.mounts).toBe(7);
    expect(log.pre).toBe(0);
    expect(log.solid).toBe(0);
    expect(log.blankLetter).toBe(0);
  });

  test('a cover re-render with unchanged inputs keeps the mounted letters', async ({ page }) => {
    await page.goto('/?startPage=launch');
    await settled(page);
    await page.evaluate(() => {
      window.__nodes = [...document.querySelectorAll('#start-page .sp-lt')];
      window.__words = window.__nodes.map((n) => n.querySelector('.sp-vw')._spWord);
      window.__blank = 0; window.__seen = 0;
      const step = () => {
        window.__seen += 1;
        document.querySelectorAll('#start-page .sp-vw').forEach((v) => {
          const cv = v.querySelector('.sp-word-fill');
          if (!v.classList.contains('sp-word-on') || !cv || !cv.width) { window.__blank += 1; return; }
          const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
          let any = false; for (let i = 3; i < d.length; i += 4 * 17) { if (d[i] > 20) { any = true; break; } }
          if (!any) window.__blank += 1;
        });
        if (!window.__stop) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    await page.evaluate(async () => { await window.app.startPage.render(); await window.app.startPage.render(); });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      window.__stop = true;
      const now = [...document.querySelectorAll('#start-page .sp-lt')];
      return { same: now.length === window.__nodes.length && now.every((n, i) => n === window.__nodes[i]), words: now.every((n, i) => n.querySelector('.sp-vw')._spWord === window.__words[i]), blank: window.__blank, seen: window.__seen };
    });
    expect(r.same).toBe(true);
    expect(r.words).toBe(true);
    expect(r.seen).toBeGreaterThan(3);
    expect(r.blank).toBe(0);
  });

  test('the draw-in is clipped to the glyphs: nothing outside the letter is painted mid-plot', async ({ page }) => {
    await page.goto('/?startPage=launch');
    await settled(page);
    await page.evaluate(() => { document.querySelectorAll('#start-page .sp-lt').forEach((b, i) => { if (i > 0) b.style.visibility = 'hidden'; }); });
    const box = await letters(page).first().boundingBox();
    const clip = { x: Math.floor(box.x) - 4, y: Math.floor(box.y) - 4, width: Math.ceil(box.width) + 8, height: Math.ceil(box.height) + 8 };
    await page.mouse.move(2, 2);
    const final = (await page.screenshot({ clip })).toString('base64');
    // replay the first letter's plot slowly and look at it a moment in
    await page.evaluate(() => { const vw = document.querySelector('#start-page .sp-lt .sp-vw'); window.Vectura.StartPageInk.drawIn(vw, { style: 'plot', duration: 12000 }); });
    await page.waitForTimeout(1800);
    const mid = (await page.screenshot({ clip })).toString('base64');
    const r = await page.evaluate(async ([a, b]) => {
      const load = async (b64) => { const bm = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob()); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const x = c.getContext('2d'); x.drawImage(bm, 0, 0); return x.getImageData(0, 0, c.width, c.height); };
      const F = await load(a); const M = await load(b); const W = F.width; const H = F.height;
      const g = [F.data[0], F.data[1], F.data[2]];
      const near = (d, i) => Math.abs(d[i] - g[0]) < 6 && Math.abs(d[i + 1] - g[1]) < 6 && Math.abs(d[i + 2] - g[2]) < 6;
      const ground = new Uint8Array(W * H); for (let p = 0; p < W * H; p++) ground[p] = near(F.data, p * 4) ? 1 : 0;
      let outsideBad = 0; let outside = 0; let fInk = 0; let mInk = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let allG = 1;
        for (let dy = -3; dy <= 3 && allG; dy++) for (let dx = -3; dx <= 3; dx++) { const xx = x + dx; const yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; if (!ground[yy * W + xx]) { allG = 0; break; } }
        const i = (y * W + x) * 4;
        if (allG) { outside += 1; if (!near(M.data, i)) outsideBad += 1; }
        if (!near(F.data, i)) fInk += 1;
        if (!near(M.data, i)) mInk += 1;
      }
      return { outside, outsideBad, fInk, mInk };
    }, [final, mid]);
    expect(r.outside).toBeGreaterThan(500);
    expect(r.outsideBad).toBe(0);
    expect(r.mInk).toBeGreaterThan(30); // something is drawn
    expect(r.mInk).toBeLessThan(r.fInk * 0.9); // and it is still part-way
  });
});
