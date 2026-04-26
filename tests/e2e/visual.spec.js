const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('Visual snapshots', () => {
  test.skip(!process.env.ENABLE_SCREENSHOT_VISUALS, 'Set ENABLE_SCREENSHOT_VISUALS=1 to run screenshot snapshots.');
  const DEFAULT_VISUAL_SEED = 38225;

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

  const buildMirroredMaskedCircleScene = async (page) => {
    await page.evaluate(() => {
      const app = window.app;
      const { Layer, SETTINGS } = window.Vectura;
      SETTINGS.aboutVisible = false;
      const engine = app.engine;
      engine.layers = [];
      SETTINGS.globalLayerCount = 0;

      const modifierId = engine.addModifierLayer('mirror');
      const modifier = engine.layers.find((layer) => layer.id === modifierId);
      modifier.modifier.mirrors = [
        {
          ...modifier.modifier.mirrors[0],
          enabled: true,
          angle: 90,
          xShift: -18,
          yShift: 0,
          replacedSide: 'positive',
          guideVisible: false,
        },
      ];

      const circlePath = [];
      circlePath.meta = { kind: 'circle', cx: 176, cy: 110, r: 30 };
      const maskParent = new Layer('mirror-mask-parent', 'expanded', 'Mirror Mask');
      maskParent.parentId = modifierId;
      maskParent.params.curves = false;
      maskParent.sourcePaths = [circlePath];
      maskParent.mask.enabled = true;

      const waveform = new Layer('mirror-masked-wave', 'expanded', 'Mirror Wave');
      waveform.parentId = maskParent.id;
      waveform.params.curves = false;
      waveform.sourcePaths = [];
      for (let row = 0; row < 9; row += 1) {
        const y = 86 + row * 6;
        waveform.sourcePaths.push([
          { x: 148, y },
          { x: 160, y: y + (row % 2 === 0 ? -4 : 4) },
          { x: 176, y },
          { x: 192, y: y + (row % 2 === 0 ? 4 : -4) },
          { x: 204, y },
        ]);
      }

      engine.layers.push(maskParent, waveform);
      engine.generate(maskParent.id);
      engine.generate(waveform.id);
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

  const buildPrimitiveShapeCreationScene = async (page) => {
    await page.evaluate(() => {
      const app = window.app;
      const { SETTINGS } = window.Vectura;
      SETTINGS.aboutVisible = false;
      const engine = app.engine;
      engine.layers = [];
      SETTINGS.globalLayerCount = 0;

      const baseId = engine.addLayer('wavetable');
      const baseLayer = engine.layers.find((layer) => layer.id === baseId);
      baseLayer.visible = false;
      baseLayer.params.curves = true;
      engine.activeLayerId = baseId;

      const polygonShape = {
        type: 'polygon',
        cx: 96,
        cy: 112,
        radius: 36,
        rotation: -Math.PI / 2,
        sides: 6,
        cornerRadii: [0, 0, 0, 0, 0, 0],
      };
      const polygonPath = app.renderer.buildShapePath(polygonShape);
      app.ui.createManualLayerFromPath({ path: polygonPath, closed: true, shape: polygonShape });

      engine.activeLayerId = baseId;
      const rectShape = {
        type: 'rect',
        x1: 160,
        y1: 78,
        x2: 232,
        y2: 146,
        cornerRadii: [0, 0, 0, 0],
      };
      const rectPath = app.renderer.buildShapePath(rectShape);
      app.ui.createManualLayerFromPath({ path: rectPath, closed: true, shape: rectShape });

      app.renderer.setSelection([], null);
      engine.activeLayerId = null;
      app.ui.renderLayers();
      app.ui.buildControls();
      app.ui.updateFormula();
      app.render();
      app.updateStats();
    });
  };

  const buildRotatedPrimitiveSelectionScene = async (page, kind = 'polygon') => {
    await page.evaluate((shapeKind) => {
      const app = window.app;
      const { SETTINGS } = window.Vectura;
      SETTINGS.aboutVisible = false;
      const engine = app.engine;
      engine.layers = [];
      SETTINGS.globalLayerCount = 0;

      const baseId = engine.addLayer('wavetable');
      const baseLayer = engine.layers.find((layer) => layer.id === baseId);
      baseLayer.visible = false;
      baseLayer.params.curves = true;
      engine.activeLayerId = baseId;

      const shape = shapeKind === 'rect'
        ? {
            type: 'rect',
            x1: 96,
            y1: 74,
            x2: 188,
            y2: 148,
            cornerRadii: [0, 0, 0, 0],
          }
        : {
            type: 'polygon',
            cx: 142,
            cy: 112,
            radius: 44,
            rotation: -Math.PI / 2,
            sides: 6,
            cornerRadii: [0, 0, 0, 0, 0, 0],
          };
      const path = app.renderer.buildShapePath(shape);
      app.ui.createManualLayerFromPath({ path, closed: true, shape });
      const layer = engine.getActiveLayer();
      layer.params.rotation = shapeKind === 'rect' ? 29 : 33;
      engine.generate(layer.id);
      app.renderer.setSelection([layer.id], layer.id);
      engine.activeLayerId = layer.id;
      app.ui.renderLayers();
      app.ui.buildControls();
      app.ui.updateFormula();
      app.render();
      app.updateStats();
    }, kind);
  };

  test('main viewport shell snapshot', async ({ page }) => {
    await page.goto('/');
    await page.evaluate((seed) => {
      const app = window.app;
      const layer = app.engine.getActiveLayer();
      if (layer) {
        layer.params.seed = seed;
        app.engine.generate(layer.id);
      }
      app.engine.computeAllDisplayGeometry();
      app.ui.buildControls();
      app.ui.updateFormula();
      app.render();
      app.updateStats();
    }, DEFAULT_VISUAL_SEED);
    await expect(page.locator('main')).toHaveScreenshot('main-shell.png', {
      maxDiffPixelRatio: 0.03,
    });
  });

  test('document dimensions render as blueprint labels outside the canvas', async ({ page }) => {
    await page.goto('/');
    await page.evaluate((seed) => {
      const { SETTINGS } = window.Vectura;
      const app = window.app;
      SETTINGS.aboutVisible = false;
      SETTINGS.documentUnits = 'imperial';
      SETTINGS.showDocumentDimensions = true;
      SETTINGS.paperSize = 'custom';
      SETTINGS.paperWidth = 254;
      SETTINGS.paperHeight = 203.2;
      SETTINGS.paperOrientation = 'landscape';
      app.engine.setProfile('custom');
      const layer = app.engine.getActiveLayer();
      if (layer) {
        layer.params.seed = seed;
        app.engine.generate(layer.id);
      }
      app.engine.computeAllDisplayGeometry();
      app.renderer.center();
      app.ui.initSettingsValues();
      app.ui.buildControls();
      app.render();
      app.updateStats();
    }, DEFAULT_VISUAL_SEED);
    await expect(page.locator('#main-canvas')).toHaveScreenshot('document-dimensions-canvas.png', {
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

  test('mirror modifiers keep masked circle artwork mirrored as closed masked objects', async ({ page }) => {
    await page.goto('/');
    await buildMirroredMaskedCircleScene(page);
    await expect(page.locator('#main-canvas')).toHaveScreenshot('mirrored-masked-circles-canvas.png', {
      maxDiffPixelRatio: 0.03,
    });
  });

  test('fresh rectangle and polygon shapes render as cornered primitives', async ({ page }) => {
    await page.goto('/');
    await buildPrimitiveShapeCreationScene(page);
    await expect(page.locator('#main-canvas')).toHaveScreenshot('primitive-shape-creation-canvas.png', {
      maxDiffPixelRatio: 0.03,
    });
  });

  test('rotated polygon selection keeps handles aligned to the transformed shape', async ({ page }) => {
    await page.goto('/');
    await buildRotatedPrimitiveSelectionScene(page, 'polygon');
    await expect(page.locator('#main-canvas')).toHaveScreenshot('rotated-polygon-selection-canvas.png', {
      maxDiffPixelRatio: 0.03,
    });
  });

  test('rotated rectangle selection keeps handles aligned to the transformed shape', async ({ page }) => {
    await page.goto('/');
    await buildRotatedPrimitiveSelectionScene(page, 'rect');
    await expect(page.locator('#main-canvas')).toHaveScreenshot('rotated-rectangle-selection-canvas.png', {
      maxDiffPixelRatio: 0.03,
    });
  });
});
