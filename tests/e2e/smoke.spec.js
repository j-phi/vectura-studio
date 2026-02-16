const { test, expect } = require('@playwright/test');

test.describe('Vectura smoke interactions', () => {
  test('core interactions remain functional on desktop and touch tablet', async ({ page }, testInfo) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    await expect(page.locator('#status-bar')).toBeVisible();
    await expect(page.locator('#generator-module')).toBeVisible();

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

    await page.getByRole('button', { name: 'Edit' }).click();
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
});
