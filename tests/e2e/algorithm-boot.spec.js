/**
 * Every algorithm boots (R-37).
 *
 * In a real Chromium page, select each algorithm the Algorithm control offers,
 * once, through the control's own change handler. After each switch: the
 * active layer is that type, it drew something on the main canvas (pixels
 * differ from the same frame with every layer hidden), and the page logged no
 * error. Errors are checked per algorithm so a failure names the culprit.
 */
const { test, expect } = require('@playwright/test');

const EXPECTED_404 = [/\/favicon\.ico$/, /\/src\/config\/petal-profiles\/$/];
// SVG Distort distorts an imported SVG; with no import it legitimately draws nothing.
const EMPTY_BY_DESIGN = new Set(['svgDistort']);
// Registered types reached by other entry points, not the Algorithm control: text is made
// with the Type tool; object / boolean group / light / ground are children of a 3D scene.
const NOT_IN_CONTROL = ['text', 'object3d', 'booleanGroup3d', 'sceneLight3d', 'sceneGround3d'];

test('every algorithm in the Algorithm control boots without errors and draws', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const where = msg.location()?.url ? ` (${msg.location().url})` : '';
    // Network 404s the app expects: the browser's favicon probe (no favicon.ico ships),
    // and the Petal Designer's optional directory-listing probe of
    // src/config/petal-profiles/ (it falls back to index.json and the bundle; hosts
    // without directory listings answer 404, which Chromium logs as an error).
    if (EXPECTED_404.some((re) => re.test(msg.location()?.url || ''))) return;
    errors.push(`console.error: ${msg.text()}${where}`);
  });

  await page.goto('/');
  await expect(page.locator('#main-canvas')).toBeVisible();
  await page.click('#btn-add-layer');
  await page.click('.lvl-add-item[data-add="algo-parent"]');
  await expect.poll(() => page.evaluate(() => window.app?.engine?.getActiveLayer?.()?.paths?.length || 0)).toBeGreaterThan(0);
  expect(errors, 'errors while booting').toEqual([]);

  const control = page.locator('#generator-module');
  const types = (await control.locator('option').evaluateAll((els) => els.map((el) => el.value))).filter(Boolean);
  // The control must offer every registered drawable algorithm the defaults
  // describe (a type missing from the menu is unreachable for users).
  const registered = await page.evaluate(() => {
    const { Algorithms, ALGO_DEFAULTS } = window.Vectura;
    return Object.keys(ALGO_DEFAULTS).filter((t) => Algorithms[t] && typeof Algorithms[t].generate === 'function');
  });
  expect(types.length).toBeGreaterThan(10);
  const missing = registered.filter((t) => !types.includes(t) && !NOT_IN_CONTROL.includes(t));

  const failures = [];
  for (const type of types) {
    errors.length = 0;
    await control.selectOption(type);
    await expect.poll(() => page.evaluate(() => window.app?.engine?.getActiveLayer?.()?.type)).toBe(type);
    const drawn = await page.evaluate(() => {
      const { app } = window;
      const canvas = document.getElementById('main-canvas');
      const ctx = canvas.getContext('2d');
      const read = () => ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      app.renderer.draw();
      const withInk = read();
      const layers = app.engine.layers;
      const visible = layers.map((l) => l.visible);
      try {
        layers.forEach((l) => { l.visible = false; });
        app.renderer.draw();
        const without = read();
        let changed = 0;
        for (let i = 0; i < withInk.length; i += 4) {
          if (withInk[i] !== without[i] || withInk[i + 1] !== without[i + 1] || withInk[i + 2] !== without[i + 2]) changed += 1;
        }
        return changed;
      } finally {
        layers.forEach((l, i) => { l.visible = visible[i]; });
        app.renderer.draw();
      }
    });
    if (errors.length) failures.push(`${type}: ${errors.join(' | ')}`);
    if (EMPTY_BY_DESIGN.has(type)) continue;
    if (!(drawn > 0)) failures.push(`${type}: drew nothing on the canvas`);
  }
  expect(failures, 'algorithms that failed to boot').toEqual([]);
  expect(missing, 'registered algorithms missing from the Algorithm control').toEqual([]);
});
