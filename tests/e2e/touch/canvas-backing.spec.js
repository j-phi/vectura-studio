const { test, expect } = require('@playwright/test');

// TUX-056: the main canvas backing store is capped at 2x on coarse pointers, resize() is a
// no-op when nothing changed, and draw() covers the full backing store.
const gotoApp = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.engine && window.app.renderer));
  await page.waitForTimeout(600);
};

test('canvas backing is capped at 2x and fully painted', async ({ page }) => {
  await gotoApp(page);
  const r = await page.evaluate(() => {
    const rn = window.app.renderer;
    const c = rn.canvas;
    const pr = c.parentElement.getBoundingClientRect();
    let allocs = 0;
    const desc = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
    Object.defineProperty(c, 'width', { get() { return desc.get.call(this); }, set(v) { allocs++; desc.set.call(this, v); }, configurable: true });
    rn.resize(); rn.resize(); rn.resize();
    delete c.width;
    rn.draw();
    const px = c.getContext('2d').getImageData(c.width - 3, c.height - 3, 1, 1).data;
    const tok = getComputedStyle(document.documentElement).getPropertyValue('--render-canvas').trim();
    const probe = document.createElement('canvas').getContext('2d');
    probe.fillStyle = tok || '#121214'; probe.fillRect(0, 0, 1, 1);
    const exp = probe.getImageData(0, 0, 1, 1).data;
    return {
      w: c.width, h: c.height, pw: pr.width, ph: pr.height, a: c.getContext('2d').getTransform().a,
      allocs, px: Array.from(px), exp: Array.from(exp), dpr: rn.getBackingDpr(),
    };
  });
  expect(r.dpr).toBe(2);
  expect(r.w).toBe(Math.round(r.pw * 2));
  expect(r.h).toBe(Math.round(r.ph * 2));
  expect(r.a).toBe(2);
  expect(r.allocs).toBe(0);
  expect(r.px[3]).toBe(255);
  for (let i = 0; i < 3; i += 1) expect(Math.abs(r.px[i] - r.exp[i])).toBeLessThanOrEqual(3);
});
