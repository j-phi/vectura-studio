const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('Visual snapshots', () => {
  test.skip(!process.env.ENABLE_SCREENSHOT_VISUALS, 'Set ENABLE_SCREENSHOT_VISUALS=1 to run screenshot snapshots.');

  const buildMaskedHorizonScene = async (page) => {
    await page.evaluate(() => {
      const app = window.app;
      const { SETTINGS } = window.Vectura;
      SETTINGS.aboutVisible = false;
      const engine = app.engine;
      engine.layers = [];
      SETTINGS.globalLayerCount = 0;
      const wavetableId = engine.addLayer('wavetable');
      const ringsId = engine.addLayer('rings');
      const wavetable = engine.layers.find((layer) => layer.id === wavetableId);
      const rings = engine.layers.find((layer) => layer.id === ringsId);

      wavetable.name = 'Wavetable 01';
      wavetable.params.lineStructure = 'horizon';
      wavetable.params.seed = 12739;
      wavetable.params.horizonHeight = 29;
      wavetable.params.horizonHorizontalLines = 58;
      wavetable.params.horizonVerticalLines = 58;
      wavetable.params.horizonVanishingX = 50;
      wavetable.params.horizonVanishingPower = 72;
      wavetable.params.horizonFanReach = 42;
      wavetable.params.horizonRelief = 38;
      wavetable.params.horizonDepthPerspective = 100;
      wavetable.params.horizonCenterDampening = 94;
      wavetable.params.horizonCenterWidth = 44;
      wavetable.params.horizonCenterBasin = 62;
      wavetable.params.horizonShoulderLift = 48;
      wavetable.params.horizonMirrorBlend = 48;
      wavetable.params.horizonValleyProfile = 34;
      wavetable.params.noises = [
        { ...wavetable.params.noises[0], type: 'billow', amplitude: 13.8, zoom: 0.0048, freq: 1, angle: 0 },
        { ...wavetable.params.noises[0], type: 'ridged', amplitude: 3.8, zoom: 0.0076, freq: 1, angle: 0 },
        { ...wavetable.params.noises[0], type: 'simplex', amplitude: 0.7, zoom: 0.0132, freq: 1, angle: 0 },
      ];

      rings.name = 'Rings';
      rings.params.seed = 12739;
      rings.params.centerDiameter = 0;
      rings.mask.enabled = true;
      wavetable.parentId = rings.id;

      engine.generate(wavetable.id);
      engine.generate(rings.id);
      engine.computeAllDisplayGeometry();
      app.renderer.setSelection([], null);
      engine.activeLayerId = null;
      app.ui.renderLayers();
      app.ui.buildControls();
      app.ui.updateFormula();
      app.render();
      app.updateStats();
    });
  };

  const buildOvalMaskParentScene = async (page) => {
    await page.evaluate(() => {
      const app = window.app;
      const { Layer, SETTINGS } = window.Vectura;
      SETTINGS.aboutVisible = false;
      const engine = app.engine;
      engine.layers = [];
      SETTINGS.globalLayerCount = 0;

      const circlePath = [];
      const cx = 122;
      const cy = 112;
      const r = 76;
      for (let i = 0; i <= 96; i += 1) {
        const theta = (i / 96) * Math.PI * 2;
        circlePath.push({
          x: cx + Math.cos(theta) * r,
          y: cy + Math.sin(theta) * r,
        });
      }
      circlePath.meta = {
        kind: 'circle',
        cx,
        cy,
        r,
        shape: {
          type: 'oval',
          cx,
          cy,
          rx: r,
          ry: r,
          cornerRadii: [],
        },
      };

      const maskParent = new Layer('oval-mask-parent', 'expanded', 'Oval 03');
      maskParent.params.seed = 0;
      maskParent.params.posX = 0;
      maskParent.params.posY = 0;
      maskParent.params.scaleX = 1;
      maskParent.params.scaleY = 1;
      maskParent.params.rotation = 0;
      maskParent.params.curves = false;
      maskParent.params.smoothing = 0;
      maskParent.params.simplify = 0;
      maskParent.sourcePaths = [circlePath];
      maskParent.mask.enabled = true;

      const wavetable = new Layer('masked-wavetable', 'wavetable', 'Wavetable 01');
      wavetable.parentId = maskParent.id;
      wavetable.params.lineStructure = 'horizontal';
      wavetable.params.lines = 48;
      wavetable.params.gap = 3.1;
      wavetable.params.noises = [
        {
          ...(wavetable.params.noises?.[0] || {}),
          enabled: true,
          type: 'simplex',
          amplitude: 13,
          zoom: 0.013,
          freq: 1,
          angle: 0,
          shiftX: 0,
          shiftY: 0,
          seed: 23,
        },
      ];

      engine.layers.push(maskParent, wavetable);
      engine.generate(maskParent.id);
      engine.generate(wavetable.id);
      engine.computeAllDisplayGeometry();
      app.renderer.setSelection([], null);
      engine.activeLayerId = null;
      app.ui.renderLayers();
      app.ui.buildControls();
      app.ui.updateFormula();
      app.render();
      app.updateStats();
    });
  };

  test('main viewport shell snapshot', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('main')).toHaveScreenshot('main-shell.png', {
      maxDiffPixelRatio: 0.03,
    });
  });

  test('masked Horizon rings hug the final terrain contours', async ({ page }) => {
    await page.goto('/');
    await buildMaskedHorizonScene(page);
    await expect(page.locator('#main-canvas')).toHaveScreenshot('masking-horizon-rings-canvas.png', {
      maxDiffPixelRatio: 0.03,
    });
  });

  test('saved broken masking fixture keeps rings clipped to the visible terrain contour', async ({ page }) => {
    const fixturePath = path.resolve(__dirname, '../fixtures/broken-masking.vectura');
    const doc = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    await page.goto('/');
    await page.evaluate((state) => {
      const app = window.app;
      window.Vectura.SETTINGS.aboutVisible = false;
      app.applyState(state.state);
      app.ui.renderLayers();
      app.ui.buildControls();
      app.ui.updateFormula();
      app.render();
      app.updateStats();
    }, doc);
    await expect(page.locator('#main-canvas')).toHaveScreenshot('broken-masking-canvas.png', {
      maxDiffPixelRatio: 0.03,
    });
  });

  test('oval mask parent clips wavetable descendants inside the circle', async ({ page }) => {
    await page.goto('/');
    await buildOvalMaskParentScene(page);
    await expect(page.locator('#main-canvas')).toHaveScreenshot('oval-mask-parent-wavetable-canvas.png', {
      maxDiffPixelRatio: 0.03,
    });
  });
});
