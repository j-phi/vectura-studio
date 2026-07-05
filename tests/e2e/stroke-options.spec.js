const { test, expect } = require('@playwright/test');

// STR-2 / STR-1 / STR-5 — the Stroke Options panel is operable in a real
// browser and its edits flow through to the SVG export pipeline.
//
// The panel's scripts (config vocabulary, stroke-model API, panel component)
// are not yet wired into index.html (Lane F owns the shell). This e2e injects
// them the way the integrator's <script> tags will, then drives the mounted
// panel and exports — proving the whole Lane B surface works end-to-end.

const inject = async (page) => {
  for (const src of [
    '/src/config/stroke-options.js',
    '/src/core/stroke-model.js',
    '/src/ui/panels/stroke-options.js',
  ]) {
    await page.addScriptTag({ url: src });
  }
};

test('Stroke Options panel is operable and drives the layer stroke model', async ({ page }) => {
  // Only JS exceptions matter here; ignore optional-asset network 404s the app
  // shell logs (favicon/profile probes) that the smoke suite also tolerates.
  const jsErrors = [];
  page.on('pageerror', (err) => jsErrors.push(`${err}`));

  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.app && window.app.engine));
  await inject(page);
  await page.waitForFunction(() => Boolean(window.Vectura.UI.StrokeOptionsPanel));

  // Create a real closed shape layer and mount the panel against it.
  await page.evaluate(() => {
    const app = window.app;
    const id = app.engine.addLayer('shape');
    const layer = app.engine.getLayerById(id);
    const square = [
      { x: 60, y: 60 }, { x: 140, y: 60 }, { x: 140, y: 140 }, { x: 60, y: 140 }, { x: 60, y: 60 },
    ];
    square.meta = { closed: true };
    layer.sourcePaths = [square];
    app.engine.generate(id);
    window.__strokeLayerId = id;
    const host = document.createElement('div');
    host.id = 'e2e-stroke-host';
    document.body.appendChild(host);
    window.__strokePanel = window.Vectura.UI.StrokeOptionsPanel.render(host, {
      app,
      layerIds: [id],
    });
  });

  // Every section renders top-to-bottom.
  await expect(page.locator('#e2e-stroke-host [data-stroke-section]')).toHaveCount(5);

  // Cap → Projecting.
  await page.locator('#e2e-stroke-host [data-stroke-cap="projecting"]').click();
  // Corner → Miter enables the Limit field.
  await page.locator('#e2e-stroke-host [data-stroke-join="miter"]').click();
  await expect(page.locator('#e2e-stroke-host [data-stroke-limit-field]')).toBeEnabled();
  // Align → Outside.
  await page.locator('#e2e-stroke-host [data-stroke-align="outside"]').click();
  // Dashed line on.
  await page.locator('#e2e-stroke-host [data-stroke-dash-toggle]').check();
  await expect(page.locator('#e2e-stroke-host [data-stroke-dash-field]').first()).toBeEnabled();

  const model = await page.evaluate(() => {
    const l = window.app.engine.getLayerById(window.__strokeLayerId);
    return { lineCap: l.lineCap, lineJoin: l.lineJoin, strokeAlign: l.strokeAlign, dashEnabled: l.dash.enabled };
  });
  expect(model).toEqual({ lineCap: 'projecting', lineJoin: 'miter', strokeAlign: 'outside', dashEnabled: true });

  expect(jsErrors, `page errors: ${jsErrors.join('\n')}`).toEqual([]);
});

test('panel stroke edits reach the SVG export attributes', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.app && window.app.engine));
  await inject(page);

  const svg = await page.evaluate(async () => {
    const app = window.app;
    const id = app.engine.addLayer('shape');
    const layer = app.engine.getLayerById(id);
    const square = [
      { x: 60, y: 60 }, { x: 140, y: 60 }, { x: 140, y: 140 }, { x: 60, y: 140 }, { x: 60, y: 60 },
    ];
    square.meta = { closed: true };
    layer.sourcePaths = [square];
    app.engine.generate(id);
    const host = document.createElement('div');
    document.body.appendChild(host);
    window.Vectura.UI.StrokeOptionsPanel.render(host, { app, layerIds: [id] });
    host.querySelector('[data-stroke-join="miter"]').click();
    host.querySelector('[data-stroke-dash-toggle]').checked = true;
    host.querySelector('[data-stroke-dash-toggle]').dispatchEvent(new Event('change'));

    // Capture the exported SVG string without a real download.
    let captured = null;
    const origCreate = URL.createObjectURL;
    URL.createObjectURL = (blob) => { captured = blob; return 'blob:e2e'; };
    const origText = Blob.prototype.text;
    await app.ui.exportSVG();
    const text = captured ? await captured.text() : '';
    URL.createObjectURL = origCreate;
    Blob.prototype.text = origText;
    return text;
  });

  expect(svg).toContain('stroke-linejoin="miter"');
  expect(svg).toContain('stroke-miterlimit=');
  expect(svg).toContain('stroke-dasharray=');
});
