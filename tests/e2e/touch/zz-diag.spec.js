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
    const els = [...document.querySelectorAll('.settings-panel input.slider-val-inp')].slice(0, 6);
    const css = [
      '',
      '.v1::-webkit-inner-spin-button{display:none !important;-webkit-appearance:none !important;width:0 !important;margin:0 !important}',
      '.v2{-webkit-appearance:none !important;appearance:none !important}',
      '.v3{-webkit-appearance:none !important;appearance:none !important} .v3::-webkit-inner-spin-button,.v3::-webkit-outer-spin-button{display:none !important;-webkit-appearance:none !important;margin:0}',
      '.v4{field-sizing:content !important;width:auto !important}',
      '.v5{padding-right:0 !important;padding-left:0 !important;text-indent:0}',
    ];
    const st = document.createElement('style'); st.textContent = css.join('\n'); document.head.appendChild(st);
    return els.map((el, i) => { el.classList.add('v' + i); const cs = getComputedStyle(el); return { i, id: el.id, cw: el.clientWidth, ow: el.offsetWidth, sw: el.scrollWidth, w: cs.width, ap: cs.appearance }; });
  });
  expect(JSON.stringify(info)).toBe('DIAG');
});
