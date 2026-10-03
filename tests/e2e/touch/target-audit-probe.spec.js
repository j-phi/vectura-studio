// Synthetic-fixture regression tests for the hit-area probe (TUX-058 fix round).
// No app boot: a bare page with positioned boxes. The probe must
//   - report a partly occluded 44x44 target as < 44 (no rect shortcut),
//   - never overestimate: 43x43 < 44 and 23x23 < 24,
//   - still report a clean 44x44 and 48x48 target as >= 44.
const { test, expect } = require('@playwright/test');
const core = require('../helpers/target-audit-core');

const page_html = (body) => `<!doctype html><meta name="viewport" content="width=device-width"><body style="margin:0;background:#fff">${body}</body>`;
const box = (id, x, y, w, h, extra = '') => `<button id="${id}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;padding:0;border:0;${extra}"></button>`;
const probe = async (page, id) => core.probeHit(page, await page.locator(`#${id}`).elementHandle(), { probe: 2, radius: 24, stopAt: 44 });

test.describe('hitAreaInPage', () => {
  test('clean 44x44 and 48x48 targets report >= 44', async ({ page }) => {
    await page.setContent(page_html(box('a', 100, 100, 44, 44) + box('b', 200, 100, 48, 48)));
    for (const id of ['a', 'b']) {
      const r = await probe(page, id);
      expect(r.w, `${id} w`).toBeGreaterThanOrEqual(44);
      expect(r.h, `${id} h`).toBeGreaterThanOrEqual(44);
    }
  });

  test('44x44 button with a 12 px overlay on one edge is under 44', async ({ page }) => {
    await page.setContent(page_html(
      box('a', 100, 100, 44, 44) + '<div style="position:absolute;left:100px;top:100px;width:12px;height:44px;background:rgba(255,0,0,.2)"></div>',
    ));
    const rect = await page.locator('#a').boundingBox();
    expect(rect.width).toBeGreaterThanOrEqual(44); // the bbox alone would pass it
    const r = await probe(page, 'a');
    expect(r.w).toBeLessThan(44);
    // And through the full measurement: hig44 must be false.
    const raw = await core.measurePage(page, { W: 600, H: 400, safe: { top: 0, bottom: 0, left: 0, right: 0 }, allow: [] });
    const it = raw.items.find((i) => i.sel.includes('#a') || i.sel === 'button#a');
    expect(it, 'button measured').toBeTruthy();
    expect(it.hig44).toBe(false);
  });

  test('43x43 reports < 44 and 23x23 reports < 24', async ({ page }) => {
    await page.setContent(page_html(box('a', 100, 100, 43, 43) + box('b', 200, 100, 23, 23) + box('c', 300, 100, 24, 24)));
    const a = await probe(page, 'a');
    expect(a.w).toBeLessThan(44);
    expect(a.h).toBeLessThan(44);
    const b = await probe(page, 'b');
    expect(b.w).toBeLessThan(24);
    expect(b.h).toBeLessThan(24);
    const c = await probe(page, 'c');
    expect(c.w).toBeGreaterThanOrEqual(24);
    const raw = await core.measurePage(page, { W: 600, H: 400, safe: { top: 0, bottom: 0, left: 0, right: 0 }, allow: [] });
    const get = (id) => raw.items.find((i) => i.sel.includes(`#${id}`));
    expect(get('a').hig44).toBe(false);
    expect(get('b').min24).toBe(false);
    expect(get('c').min24).toBe(true);
  });
});

test.describe('item selectors', () => {
  test('sibling buttons get distinct selectors that each match exactly one element', async ({ page }) => {
    const btns = [0, 1, 2, 3, 4].map((i) => `<button class="b" style="position:absolute;left:${10 + i * 60}px;top:10px;width:50px;height:50px">${i}</button>`).join('');
    await page.setContent(page_html(`<div id="bar">${btns}</div><div><span><button style="position:absolute;left:10px;top:100px;width:50px;height:50px">x</button><button style="position:absolute;left:70px;top:100px;width:50px;height:50px">y</button></span></div>`));
    const raw = await core.measurePage(page, { W: 600, H: 400, safe: { top: 0, bottom: 0, left: 0, right: 0 }, allow: [] });
    const sels = raw.items.map((i) => i.sel);
    expect(sels.length).toBe(7);
    expect(new Set(sels).size).toBe(sels.length);
    for (const sel of sels) expect(await page.locator(sel).count(), sel).toBe(1);
  });
});
