const { test, expect } = require('@playwright/test');

// TUX-020 / TUX-026 desktop parity (batch R3): mouse edits inside the pop-out Petal Designer window push
// one history step per gesture, and the Undo shortcut reverts exactly that edit and refreshes the window.
test('desktop: a mouse anchor drag and a slider edit in the Petal Designer window each undo by themselves', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  await page.evaluate(() => {
    const { engine, ui } = window.app;
    engine.addLayer('petalisDesigner');
    ui.renderLayers();
    ui.buildControls();
    const layer = engine.layers.find((l) => l.type === 'petalisDesigner');
    ui.openPetalDesigner({ layer, fromInline: true });
  });
  await page.waitForSelector('#petal-designer-window');
  await page.waitForTimeout(400);
  const probe = () => page.evaluate(() => {
    const { app } = window;
    const pd = app.ui.petalDesigner;
    const layer = app.engine.layers.find((l) => l.type === 'petalisDesigner');
    const side = pd.state.activeTarget === 'outer' ? 'outer' : 'inner';
    return {
      history: app.history.length,
      layers: app.engine.layers.length,
      innerCount: layer.params.innerCount,
      stateInnerCount: pd.state.innerCount,
      stateAnchors: JSON.stringify(pd.state[side].anchors),
    };
  });
  const start = await probe();
  const from = await page.evaluate(() => {
    const ui = window.app.ui;
    const pd = ui.petalDesigner;
    const canvas = [...pd.root.querySelectorAll('canvas[data-petal-canvas]')].find((c) => c.getBoundingClientRect().width > 0);
    const side = ui.getPetalDesignerTarget(pd.state);
    const view = ui.getPetalDesignerView(pd.state, side);
    const sym = ui.getPetalDesignerSymmetryForSide(pd.state, side);
    const rect = canvas.getBoundingClientRect();
    const a = ui.sampleDesignerControls(pd.state[side], canvas, view, sym).find((c) => c.kind === 'anchor' && c.index === 1 && !c.mirror);
    return { x: rect.left + a.point.x, y: rect.top + a.point.y };
  });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y, { steps: 8 });
  await page.mouse.up();
  const dragged = await probe();
  expect(dragged.stateAnchors).not.toBe(start.stateAnchors);
  expect(dragged.history, 'one history step for the drag').toBe(start.history + 1);
  await page.keyboard.press('ControlOrMeta+z');
  await page.waitForTimeout(200);
  const afterUndo = await probe();
  expect(afterUndo.history).toBe(start.history);
  expect(afterUndo.layers).toBe(start.layers);
  expect(afterUndo.stateAnchors, 'the window shows the restored anchors').toBe(start.stateAnchors);

  const slider = page.locator('#petal-designer-window [data-petal-inner-count]');
  await slider.scrollIntoViewIfNeeded();
  const box = await slider.boundingBox();
  const before = await probe();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  const slid = await probe();
  expect(slid.innerCount).not.toBe(before.innerCount);
  expect(slid.history, 'one history step for the slider').toBe(before.history + 1);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('ControlOrMeta+z');
  await page.waitForTimeout(200);
  const afterSlider = await probe();
  expect(afterSlider.innerCount).toBe(before.innerCount);
  expect(afterSlider.stateInnerCount).toBe(before.innerCount);
  expect(afterSlider.history).toBe(before.history);
});
