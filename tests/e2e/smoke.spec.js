const { test, expect } = require('@playwright/test');

test.describe('Vectura smoke interactions', () => {
  test('core interactions remain functional on desktop and touch tablet', async ({ page }, testInfo) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    await expect(page.locator('#status-bar')).toBeVisible();
    await expect(page.locator('#generator-module')).toBeVisible();
    await expect(page.locator('#layer-list .layer-item').first()).toBeVisible();
    await expect
      .poll(async () => (await page.locator('#formula-display').innerText()).trim().length)
      .toBeGreaterThan(0);
    await expect
      .poll(async () => (await page.locator('#algo-desc').innerText()).trim().length)
      .toBeGreaterThan(0);

    const initialLayers = await page.locator('#layer-list .layer-item').count();
    await page.click('#btn-add-layer');
    await expect(page.locator('#layer-list .layer-item')).toHaveCount(initialLayers + 1);

    await page.selectOption('#generator-module', 'lissajous');
    await page.getByRole('button', { name: 'Randomize Params' }).click();

    const linesText = (await page.locator('#stat-lines').innerText()).trim();
    const lineCount = Number(linesText.replace(/[^0-9.-]/g, ''));
    expect(Number.isFinite(lineCount)).toBe(true);
    expect(lineCount).toBeGreaterThan(0);

    const canvas = page.locator('#main-canvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    if (testInfo.project.name.includes('tablet-touch')) {
      const startX = Math.floor(box.x + box.width * 0.4);
      const startY = Math.floor(box.y + box.height * 0.45);
      const endX = Math.floor(box.x + box.width * 0.62);
      const endY = Math.floor(box.y + box.height * 0.55);

      await page.dispatchEvent('#main-canvas', 'pointerdown', {
        pointerType: 'touch',
        pointerId: 1,
        isPrimary: true,
        clientX: startX,
        clientY: startY,
        buttons: 1,
      });
      await page.dispatchEvent('#main-canvas', 'pointermove', {
        pointerType: 'touch',
        pointerId: 1,
        isPrimary: true,
        clientX: endX,
        clientY: endY,
        buttons: 1,
      });
      await page.dispatchEvent('#main-canvas', 'pointerup', {
        pointerType: 'touch',
        pointerId: 1,
        isPrimary: true,
        clientX: endX,
        clientY: endY,
        buttons: 0,
      });
    } else {
      await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.45);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.58);
      await page.mouse.up();
    }

    await page.keyboard.press('Control+z');
    expect(pageErrors).toEqual([]);
  });

  test('auto-colorization reapplies across modes and continuous mode updates live', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');
    await page.click('#auto-colorization-header');

    const layerCount = await page.locator('#layer-list .layer-item').count();
    for (let i = layerCount; i < 4; i += 1) {
      await page.click('#btn-add-layer');
    }

    const readPenAssignments = () =>
      page.evaluate(() =>
        (window.app?.engine?.layers || [])
          .filter((layer) => layer && !layer.isGroup)
          .map((layer) => layer.penId || null)
      );

    const enabledToggle = page.locator('#auto-colorization-enabled');
    const modeSelect = page.locator('#auto-colorization-mode');
    const applyBtn = page.locator('#auto-colorization-apply');

    if (await enabledToggle.isChecked()) {
      await enabledToggle.uncheck();
    }

    await modeSelect.selectOption('order');
    await applyBtn.click();
    const orderManual = await readPenAssignments();

    await modeSelect.selectOption('reverse');
    await applyBtn.click();
    const reverseManual = await readPenAssignments();
    expect(reverseManual).not.toEqual(orderManual);

    await enabledToggle.check();
    await modeSelect.selectOption('order');
    const orderContinuous = await readPenAssignments();

    await modeSelect.selectOption('reverse');
    await expect
      .poll(async () => JSON.stringify(await readPenAssignments()))
      .not.toBe(JSON.stringify(orderContinuous));

    expect(pageErrors).toEqual([]);
  });

  test('top menus open settings and help actions', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    await page.getByRole('button', { name: 'File' }).click();
    await page.click('#btn-settings');
    await expect(page.locator('#settings-panel')).toHaveClass(/open/);

    await page.click('#btn-close-settings');
    await expect(page.locator('#settings-panel')).not.toHaveClass(/open/);

    await page.getByRole('button', { name: 'Help' }).click();
    await page.click('#btn-help');
    await expect(page.locator('#modal-overlay')).toHaveClass(/open/);
    await expect(page.locator('#modal-overlay .modal-title')).toHaveText(/Help Guide/);

    expect(pageErrors).toEqual([]);
  });

  test('insert menu creates a mirror modifier, reparents the current selection, and opens modifier controls', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    const initialLayers = await page.locator('#layer-list .layer-item').count();
    await page.getByRole('button', { name: 'Insert' }).click();
    await page.click('#btn-insert-mirror-modifier');

    await expect(page.locator('#layer-list .layer-item')).toHaveCount(initialLayers + 1);
    await expect(page.locator('#left-section-primary-title')).toHaveText('Modifier');
    await expect(page.locator('#left-section-secondary-title')).toHaveText('Modifier Configuration');
    await expect(page.locator('#generator-module')).toHaveValue('mirror');
    await expect(page.getByText('Mirror Stack')).toBeVisible();

    const modifierState = await page.evaluate(() => {
      const app = window.app;
      const modifier = app.engine.getActiveLayer();
      const child = app.engine.layers.find((layer) => !layer.isGroup && layer.parentId === modifier.id);
      return {
        modifierIsContainer: modifier?.containerRole === 'modifier',
        childParentMatches: child?.parentId === modifier?.id,
        childPathCount: child?.paths?.length || 0,
        childEffectivePathCount: child?.effectivePaths?.length || 0,
      };
    });

    expect(modifierState.modifierIsContainer).toBe(true);
    expect(modifierState.childParentMatches).toBe(true);
    expect(modifierState.childEffectivePathCount).toBeGreaterThan(modifierState.childPathCount);

    expect(pageErrors).toEqual([]);
  });

  test('selected modifiers add remembered drawable children and preserve children when deleted', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    await page.selectOption('#generator-module', 'rings');
    await page.getByRole('button', { name: 'Insert' }).click();
    await page.click('#btn-insert-mirror-modifier');

    await page.click('#btn-add-layer');
    await expect(page.locator('#left-section-primary-title')).toHaveText('Algorithm');
    await expect(page.locator('#generator-module')).toHaveValue('rings');

    const addState = await page.evaluate(() => {
      const app = window.app;
      const child = app.engine.getActiveLayer();
      const parent = app.engine.layers.find((layer) => layer.id === child.parentId);
      return {
        childType: child?.type || null,
        parentIsModifier: parent?.containerRole === 'modifier',
      };
    });

    expect(addState.childType).toBe('rings');
    expect(addState.parentIsModifier).toBe(true);

    await page.evaluate(() => {
      const app = window.app;
      const modifier = app.engine.layers.find((layer) => layer.containerRole === 'modifier');
      app.renderer.setSelection([modifier.id], modifier.id);
      app.engine.activeLayerId = modifier.id;
      app.ui.renderLayers();
      app.ui.buildControls();
    });

    await page.keyboard.press('Delete');

    const deleteState = await page.evaluate(() => {
      const app = window.app;
      const modifier = app.engine.layers.find((layer) => layer.containerRole === 'modifier');
      const orphanedChild = app.engine.layers.find((layer) => !layer.isGroup && layer.parentId == null && layer.type === 'rings');
      return {
        modifierExists: Boolean(modifier),
        orphanedChildExists: Boolean(orphanedChild),
      };
    });

    expect(deleteState.modifierExists).toBe(false);
    expect(deleteState.orphanedChildExists).toBe(true);
    expect(pageErrors).toEqual([]);
  });

  test('shape tool shortcuts create ovals and configurable polygons', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('tablet-touch'), 'Tablet emulation does not reliably synthesize shape-drag mouse input.');
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    const canvas = page.locator('#main-canvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const initialLayers = await page.locator('#layer-list .layer-item').count();

    await page.evaluate(() => window.app.ui.setActiveTool('shape-oval'));
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.35);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.52);
    await page.mouse.up();

    await expect(page.locator('#layer-list .layer-item')).toHaveCount(initialLayers + 1);

    const circleMeta = await page.evaluate(() => {
      const layer = window.app.engine.getActiveLayer();
      return layer?.sourcePaths?.[0]?.meta?.shape || null;
    });
    expect(circleMeta?.type).toBe('oval');
    expect(Math.abs((circleMeta?.rx || 0) - (circleMeta?.ry || 0))).toBeGreaterThan(0.01);

    await page.evaluate(() => window.app.ui.setActiveTool('shape-polygon'));
    await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.42);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.58);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.mouse.up();

    await expect(page.locator('#layer-list .layer-item')).toHaveCount(initialLayers + 2);

    const polygonMeta = await page.evaluate(() => {
      const layer = window.app.engine.getActiveLayer();
      return layer?.sourcePaths?.[0]?.meta?.shape || null;
    });
    expect(polygonMeta?.type).toBe('polygon');
    expect(polygonMeta?.sides).toBe(8);

    expect(pageErrors).toEqual([]);
  });

  test('circular mask parents clip descendant geometry to the visible silhouette', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    const maskState = await page.evaluate(() => {
      const app = window.app;
      const { Layer, SETTINGS } = window.Vectura;
      SETTINGS.aboutVisible = false;

      const engine = app.engine;
      engine.layers = [];
      SETTINGS.globalLayerCount = 0;

      const circlePath = [];
      const cx = 120;
      const cy = 110;
      const r = 74;
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

      const maskParent = new Layer('mask-parent-oval', 'expanded', 'Oval Mask');
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

      const child = new Layer('masked-child-wavetable', 'wavetable', 'Wavetable 01');
      child.parentId = maskParent.id;
      child.params.lineStructure = 'horizontal';
      child.params.lines = 44;
      child.params.gap = 3.2;
      child.params.noises = [
        {
          ...(child.params.noises?.[0] || {}),
          enabled: true,
          type: 'simplex',
          amplitude: 12,
          zoom: 0.014,
          freq: 1,
          angle: 0,
          shiftX: 0,
          shiftY: 0,
          seed: 17,
        },
      ];

      engine.layers.push(maskParent, child);
      engine.activeLayerId = child.id;
      engine.generate(maskParent.id);
      engine.generate(child.id);
      engine.computeAllDisplayGeometry();
      app.renderer.setSelection([], null);
      app.ui.renderLayers();
      app.ui.buildControls();
      app.ui.updateFormula();
      app.render();
      app.updateStats();

      const flatten = (paths) =>
        (paths || []).flatMap((path) =>
          Array.isArray(path)
            ? path
                .filter((pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y))
                .map((pt) => ({ x: pt.x, y: pt.y }))
            : []
        );
      const isOutsideCircle = (pt, epsilon = 0.6) => Math.hypot(pt.x - cx, pt.y - cy) > r + epsilon;

      const rawPoints = flatten(child.paths);
      const displayPoints = flatten(child.displayPaths);
      const rawOutsideCount = rawPoints.filter((pt) => isOutsideCircle(pt, 1.2)).length;
      const displayOutsideCount = displayPoints.filter((pt) => isOutsideCircle(pt)).length;
      const parentRow = document.querySelector('[data-layer-id="mask-parent-oval"]');
      const childRow = document.querySelector('[data-layer-id="masked-child-wavetable"]');

      return {
        rawPointCount: rawPoints.length,
        displayPointCount: displayPoints.length,
        rawOutsideCount,
        displayOutsideCount,
        childSegmentCount: child.displayPaths?.length || 0,
        maskEnabled: Boolean(maskParent.mask?.enabled),
        parentStillVisible: Boolean(maskParent.paths?.length),
        childIndented: parentRow && childRow
          ? parseFloat(window.getComputedStyle(childRow).marginLeft || '0') > parseFloat(window.getComputedStyle(parentRow).marginLeft || '0')
          : false,
      };
    });

    expect(maskState.maskEnabled).toBe(true);
    expect(maskState.parentStillVisible).toBe(true);
    expect(maskState.rawPointCount).toBeGreaterThan(0);
    expect(maskState.displayPointCount).toBeGreaterThan(0);
    expect(maskState.rawOutsideCount).toBeGreaterThan(0);
    expect(maskState.displayOutsideCount).toBe(0);
    expect(maskState.childSegmentCount).toBeGreaterThan(0);
    expect(maskState.childIndented).toBe(true);
    expect(pageErrors).toEqual([]);
  });

  test('mask editor can hide the mask parent artwork while keeping descendant clipping active', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    await page.evaluate(() => {
      const app = window.app;
      const { Layer, SETTINGS } = window.Vectura;
      SETTINGS.aboutVisible = false;

      const engine = app.engine;
      engine.layers = [];
      SETTINGS.globalLayerCount = 0;

      const circlePath = [];
      const cx = 120;
      const cy = 110;
      const r = 74;
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

      const maskParent = new Layer('mask-parent-hidden-ui', 'expanded', 'Hidden Mask');
      maskParent.sourcePaths = [circlePath];
      maskParent.mask.enabled = true;

      const child = new Layer('masked-child-hidden-ui', 'wavetable', 'Masked Child');
      child.parentId = maskParent.id;
      child.params.lineStructure = 'horizontal';
      child.params.lines = 44;
      child.params.gap = 3.2;
      child.params.noises = [
        {
          ...(child.params.noises?.[0] || {}),
          enabled: true,
          type: 'simplex',
          amplitude: 12,
          zoom: 0.014,
          freq: 1,
          angle: 0,
          shiftX: 0,
          shiftY: 0,
          seed: 17,
        },
      ];

      engine.layers.push(maskParent, child);
      engine.activeLayerId = child.id;
      engine.generate(maskParent.id);
      engine.generate(child.id);
      engine.computeAllDisplayGeometry();
      app.ui.renderLayers();
      app.ui.buildControls();
      app.ui.updateFormula();
      app.render();
      app.updateStats();
    });

    await page.locator('[data-layer-id="mask-parent-hidden-ui"] .layer-mask-trigger').click();
    await page.getByLabel('Hide Mask Layer').check();

    const state = await page.evaluate(() => {
      const app = window.app;
      const parent = app.engine.layers.find((layer) => layer.id === 'mask-parent-hidden-ui');
      const child = app.engine.layers.find((layer) => layer.id === 'masked-child-hidden-ui');
      const cx = 120;
      const cy = 110;
      const r = 74;
      const displayPoints = (child.displayPaths || [])
        .flatMap((path) => (Array.isArray(path) ? path : []))
        .filter((pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y));
      const outsideCount = displayPoints.filter((pt) => Math.hypot(pt.x - cx, pt.y - cy) > r + 0.6).length;
      return {
        hideLayer: Boolean(parent.mask?.hideLayer),
        parentRenderableCount: app.engine.getRenderablePaths(parent).length,
        childOutsideCount: outsideCount,
        badgeText: document.querySelector('[data-layer-id="mask-parent-hidden-ui"] .layer-mini-badge')?.textContent?.trim() || '',
      };
    });

    expect(state.hideLayer).toBe(true);
    expect(state.parentRenderableCount).toBe(0);
    expect(state.childOutsideCount).toBe(0);
    expect(state.badgeText).toContain('MASK HIDDEN');
    expect(pageErrors).toEqual([]);
  });
});
