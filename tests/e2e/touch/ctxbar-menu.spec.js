const { test, expect } = require('@playwright/test');
const core = require('../helpers/target-audit-core');
const touch = require('../helpers/touch');
const { STATES } = require('./target-audit-states');

// B2 review items: the context bar More menu stays on screen on a short screen (iPhone landscape with browser chrome,
// 874 x 330) and shows a scroll cue while rows hide below the fold (utils.scrollCue, TUX-012).
async function openMore(page, baseURL) {
  await core.bootApp(page, baseURL);
  const st = STATES.find((s) => s.id === 'layer-selected-handles');
  await st.run(page);
  await expect.poll(() => st.post(page), { timeout: 10_000 }).toBe(true);
  await core.waitLayoutSettled(page);
  await core.waitGeometryStable(page);
  await page.waitForTimeout(250);
  const more = page.locator('.ctxbar.is-visible .ctxbar-overflow');
  test.skip(!(await more.count()) || !(await more.first().isVisible()), 'context bar hidden on this layout');
  await touch.tap(page, more.first());
  await expect.poll(() => page.evaluate(() => !!document.querySelector('.ctxbar-menu.is-open')), { timeout: 5000 }).toBe(true);
  await page.waitForTimeout(300);
}

test.describe('B2 review: ctxbar More menu', () => {
  test.use({ reducedMotion: 'reduce' });
  test.describe.configure({ retries: 0 });

  test('the open menu stays inside the viewport', async ({ page, baseURL }) => {
    await openMore(page, baseURL);
    const m = await page.evaluate(() => {
      const e = document.querySelector('.ctxbar-menu.is-open'); const r = e.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, ih: innerHeight, sh: e.scrollHeight, ch: e.clientHeight };
    });
    expect(m.top, `menu top ${JSON.stringify(m)}`).toBeGreaterThanOrEqual(-0.5);
    expect(m.bottom, `menu bottom ${JSON.stringify(m)}`).toBeLessThanOrEqual(m.ih + 0.5);
  });

  test('a scrolling menu carries a scroll cue, and a fitting menu carries none', async ({ page, baseURL }) => {
    await openMore(page, baseURL);
    const m = await page.evaluate(() => {
      const e = document.querySelector('.ctxbar-menu.is-open');
      return { scrolls: e.scrollHeight - e.clientHeight > 1, cue: e.dataset.scrollCue || null };
    });
    if (m.scrolls) expect(m.cue, 'data-scroll-cue on a scrolling menu').toContain('below');
    else expect(m.cue, 'data-scroll-cue on a fitting menu').toBeNull();
    if (m.scrolls) {
      await page.evaluate(() => { const e = document.querySelector('.ctxbar-menu.is-open'); e.scrollTop = e.scrollHeight; });
      await expect.poll(() => page.evaluate(() => document.querySelector('.ctxbar-menu.is-open').dataset.scrollCue || ''), { timeout: 3000 }).toContain('above');
    }
  });
});
