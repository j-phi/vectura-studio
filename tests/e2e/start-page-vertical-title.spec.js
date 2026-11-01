const { test, expect } = require('@playwright/test');
const { resetStorage } = require('./helpers/start-page');

// The vertical display word (Vertical word / Spec sheet / Words both sides layouts) must keep a real column of its own.
// On iPad Safari the `auto` grid column collapsed to 0 (the SVG sized itself with `height:100%; width:auto`, which WebKit
// cannot resolve while sizing the column), so the letters spilled out behind the art frame and only fragments showed.
const VIEWPORTS = [
  { name: 'ipad landscape', width: 1210, height: 834 },
  { name: 'ipad landscape 1024', width: 1024, height: 768 },
  { name: 'ipad portrait', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
];

const boot = async (page) => {
  await page.goto('/?startPage=launch');
  await page.waitForFunction(() => !!(window.app && window.app.startPage));
  await page.evaluate(() => window.app.startPage.show());
  await expect(page.locator('#sp-plates .sp-pl[data-example]')).toHaveCount(10);
};

// Everything measured in the page: each vertical word's column, glyph ink and what the art frame covers.
const measure = (plate) => plate.evaluate((pl) => {
  const rect = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const out = [];
  pl.querySelectorAll('.spl-vw').forEach((vw) => {
    if (vw.getClientRects().length === 0) return; // hidden on phones (the second word of Words both sides)
    const svg = vw.querySelector('svg'); const txt = svg.querySelector('text');
    const spl = pl.querySelector('.spl'); const prints = [...pl.querySelectorAll('.spl-print')].map(rect);
    const t = rect(txt);
    // the middle of the column, top to bottom: the word (not the art frame) must be what is on top there
    const sv = rect(svg); const x = sv.x + sv.w / 2;
    const hitIsWord = [0.2, 0.5, 0.8].every((f) => { const hit = document.elementFromPoint(x, sv.y + sv.h * f); return !!(hit && svg.contains(hit)); });
    out.push({ vw: rect(vw), svg: rect(svg), ink: t, spl: rect(spl), prints, hitIsWord });
  });
  return out;
});

for (const vp of VIEWPORTS) {
  test(`vertical titles keep their own column and show in full at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await resetStorage(page);
    await boot(page);
    let checked = 0;
    for (let i = 0; i < 10; i++) {
      const plate = page.locator('#sp-plates .sp-pl[data-example]').nth(i);
      await plate.scrollIntoViewIfNeeded();
      await expect(plate.locator('.spl').first()).toBeVisible({ timeout: 20000 });
      if (!(await plate.locator('.spl-vw').count())) continue;
      for (const m of await measure(plate)) {
        checked++;
        // a real column: wide enough to read, glyphs fully inside their own box and inside the plate
        expect(m.vw.w, `plate ${i + 1}: word column collapsed`).toBeGreaterThan(40);
        expect(m.svg.x, `plate ${i + 1}: word left of its column`).toBeGreaterThanOrEqual(m.vw.x - 1);
        expect(m.svg.r, `plate ${i + 1}: word right of its column`).toBeLessThanOrEqual(m.vw.r + 1);
        expect(m.svg.h, `plate ${i + 1}: word shorter than its column`).toBeGreaterThanOrEqual(m.vw.h - 1);
        expect(m.svg.x, `plate ${i + 1}: word outside the plate`).toBeGreaterThanOrEqual(m.spl.x);
        // the art frame never covers the word
        for (const p of m.prints) {
          const overlapX = Math.min(m.vw.r, p.r) - Math.max(m.vw.x, p.x);
          const overlapY = Math.min(m.vw.b, p.b) - Math.max(m.vw.y, p.y);
          expect(overlapX > 1 && overlapY > 1, `plate ${i + 1}: art frame overlaps the vertical title`).toBe(false);
        }
        expect(m.hitIsWord, `plate ${i + 1}: something else is on top of the title`).toBe(true);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(2); // Cybersigil (spec sheet) and Downpour (vertical word)
  });
}
