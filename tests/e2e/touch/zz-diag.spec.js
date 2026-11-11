const { test, expect } = require('@playwright/test');
test('diag value chip', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  await page.evaluate(() => {
    document.getElementById('left-pane').classList.add('pane-force-open');
    const sp = document.getElementById('settings-panel');
    sp.classList.add('open');
    sp.querySelectorAll('[data-sect-body]').forEach((b) => { b.style.maxHeight = 'none'; b.style.overflow = 'visible'; b.style.visibility = ''; });
  });
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => {
    const el = document.getElementById('set-margin-line-weight');
    const cs = getComputedStyle(el);
    const pick = (c) => ({ w: c.width, pl: c.paddingLeft, pr: c.paddingRight, bl: c.borderLeftWidth, br: c.borderRightWidth, bs: c.boxSizing, ff: c.fontFamily, fs: c.fontSize, ap: c.appearance, ls: c.letterSpacing, ox: c.overflowX, sbw: c.scrollbarWidth });
    const sp = getComputedStyle(el, '::-webkit-inner-spin-button');
    const ctx = document.createElement('canvas').getContext('2d');
    const m = {};
    ['16px "JetBrains Mono", monospace', '16px monospace', '16px sans-serif'].forEach((f) => { ctx.font = f; m[f] = ctx.measureText('0.125').width; });
    return { type: el.type, el: pick(cs), cw: el.clientWidth, ow: el.offsetWidth, rw: el.getBoundingClientRect().width, spin: { d: sp.display, w: sp.width, ap: sp.appearance }, m, fontsOK: document.fonts.check('16px "JetBrains Mono"'), fonts: [...document.fonts].map((f) => f.family + ':' + f.status), html: el.outerHTML.slice(0, 300), parent: el.parentElement.className, pw: el.parentElement.getBoundingClientRect().width };
  });
  expect(JSON.stringify(info, null, 1)).toBe('DIAG');
});
