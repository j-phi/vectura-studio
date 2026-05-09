const { test, expect } = require('@playwright/test');

// Coverage for the smallest commonly-targeted phone viewport (iPhone 13 Mini at
// 375×812 logical pixels). Validates that the standard toolbar is anchored to
// the top of the screen and that its tool buttons remain reachable touch
// targets — so a future skin/layout regression can't silently push the toolbar
// off-screen, shrink hit areas, or stack buttons on top of each other.

// "Top of screen" on a phone is "just under the menubar" — the toolbar sits at
// the top of the workspace-shell (the flex column that holds toolbar →
// canvas → bottom pane → modifier bar). We pin it to that, allowing a small
// pixel tolerance for sub-pixel rounding.
const TOOLBAR_SHELL_TOP_TOLERANCE_PX = 2;
const MAX_MENUBAR_HEIGHT_PX = 64;       // sanity-cap on where the workspace can start
const MIN_TOUCH_TARGET_PX = 40;         // close to Apple HIG 44 — leave headroom for borders

test.describe('iPhone mini layout — standard toolbar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.body.classList.contains('mobile-layout'));
  });

  test('toolbar is anchored to the top of the screen with reachable, well-spaced buttons', async ({ page }) => {
    const viewport = page.viewportSize();
    expect(viewport.width).toBe(375);

    const toolbar = page.locator('#tool-bar');
    await expect(toolbar).toBeVisible();

    // 1. Anchored to the top of the workspace shell (the flex column that
    //    holds the toolbar → canvas → bottom pane → modifier bar). The shell
    //    starts immediately below the app menubar, so this gives us "top of
    //    screen, below the menubar" without hard-coding a header height.
    const tbBox = await toolbar.boundingBox();
    expect(tbBox).not.toBeNull();
    const shellBox = await page.locator('.workspace-shell').first().boundingBox();
    expect(shellBox).not.toBeNull();
    expect(tbBox.y - shellBox.y, 'toolbar offset within workspace shell').toBeLessThanOrEqual(TOOLBAR_SHELL_TOP_TOLERANCE_PX);
    expect(shellBox.y, 'workspace shell starts close to the top of the viewport').toBeLessThanOrEqual(MAX_MENUBAR_HEIGHT_PX);
    expect(tbBox.x, 'toolbar left edge flush to viewport').toBeLessThanOrEqual(2);
    expect(tbBox.width, 'toolbar spans the viewport').toBeGreaterThanOrEqual(viewport.width - 2);


    // 3. Every primary tool button is a reachable touch target. Two-row wrap
    //    is fine — we only require each button to be 40×40+ and visible.
    const toolButtons = await page.locator('#tool-bar .tool-btn[data-tool]').all();
    expect(toolButtons.length, 'standard tool buttons rendered').toBeGreaterThanOrEqual(8);

    const boxes = [];
    for (const btn of toolButtons) {
      const isHidden = await btn.evaluate((el) => el.classList.contains('hidden'));
      if (isHidden) continue;
      const box = await btn.boundingBox();
      expect(box, 'tool button has a layout box').not.toBeNull();
      expect(box.width, `tool button width (${await btn.getAttribute('data-tool')})`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
      expect(box.height, `tool button height (${await btn.getAttribute('data-tool')})`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
      boxes.push({ tool: await btn.getAttribute('data-tool'), ...box });
    }

    // 4. Adjacent visible buttons never overlap. Allow either horizontal-row or
    //    wrapped-rows layouts: same-row neighbors must have a positive x-gap;
    //    different-row neighbors must have a positive y-gap.
    const sameRow = (a, b) => Math.abs(a.y - b.y) < Math.min(a.height, b.height) / 2;
    for (let i = 1; i < boxes.length; i += 1) {
      const prev = boxes[i - 1];
      const curr = boxes[i];
      if (sameRow(prev, curr)) {
        const gap = curr.x - (prev.x + prev.width);
        expect(gap, `gap between ${prev.tool} and ${curr.tool} (same row)`).toBeGreaterThanOrEqual(2);
      } else {
        const gap = curr.y - (prev.y + prev.height);
        expect(gap, `gap between ${prev.tool} and ${curr.tool} (wrapped row)`).toBeGreaterThanOrEqual(2);
      }
    }

    // 5. The first standard tool button is reachable without horizontal-scroll
    //    (it sits inside the visible toolbar rect), so a fresh user can find
    //    the Selection tool the moment they open the app.
    const firstBtnBox = boxes[0];
    expect(firstBtnBox.x, 'first tool button x within viewport').toBeGreaterThanOrEqual(0);
    expect(firstBtnBox.x + firstBtnBox.width, 'first tool button right edge within viewport').toBeLessThanOrEqual(viewport.width);

    // 6. Each visible tool button is the topmost element at its center —
    //    nothing (drawer overlay, modifier bar, etc.) layers on top of the
    //    actual hit target, so taps actually reach the tool.
    const occluded = await page.evaluate((tools) =>
      tools.flatMap((tool) => {
        const btn = document.querySelector(`#tool-bar .tool-btn[data-tool="${tool}"]`);
        if (!btn) return [];
        if (btn.classList.contains('hidden')) return [];
        const r = btn.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return [];
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const top = document.elementFromPoint(cx, cy);
        if (!top) return [{ tool, reason: 'no element at center' }];
        if (top === btn || btn.contains(top)) return [];
        return [{ tool, blocker: top.id || top.className || top.tagName }];
      })
    , boxes.map((b) => b.tool));
    expect(occluded, 'tool button centers are not occluded').toEqual([]);
  });
});
