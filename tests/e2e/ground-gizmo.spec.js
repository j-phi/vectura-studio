const { test, expect } = require('@playwright/test');

/*
 * e2e — the on-canvas ground gizmo: with the floor selected the user can drag a
 * Y arrow to raise / lower it, drag corners and edges to resize it, and press the
 * floor body to move it, with one undo step per drag and Escape to cancel. Driven
 * through the real canvas pointer path (mouse), plus a touch-pointer pass.
 */

const bag = (page) => page.evaluate(() => {
  const l = window.app.engine.layers.find((x) => x.type === 'sceneGround3d');
  return { y: l.params.y ?? 0, x: l.params.scaleX, z: l.params.scaleZ, hist: window.app.history.length };
});

// Floor handles in page coordinates (viewport px), from the renderer's own gizmo.
const gizmo = (page) => page.evaluate(() => {
  const r = window.app.renderer;
  const g = r.getSceneGroundGizmo();
  const rect = r.canvas.getBoundingClientRect();
  const abs = (p) => { const q = r.worldToScreen(p.x, p.y); return { x: q.x + rect.left, y: q.y + rect.top }; };
  return {
    tip: abs(g.arrow.tip),
    up: { x: g.up.x, y: g.up.y, perMm: g.up.perMm * r.scale },
    corners: g.corners.map((c) => ({ ...abs(c.pt), sgx: c.sgx, sgz: c.sgz })),
    edges: g.edges.map((e) => ({ ...abs(e.pt), axis: e.axis, sgx: e.sgx })),
    box: abs(g.boxX),
    centre: abs(g.centre),
    floorPoint: abs(g.proj(g.Sx * 0.45, g.gy, -g.Sz * 0.45)),
    view: { w: rect.width, h: rect.height, l: rect.left, t: rect.top },
  };
});

const settle = async (page) => {
  let prev = '';
  for (let i = 0; i < 40; i += 1) {
    const cur = await page.evaluate(() => {
      const c = window.app.renderer.canvas; const r = c.getBoundingClientRect();
      return `${r.width}x${r.height}@${window.app.renderer.scale}`;
    });
    if (cur === prev) return;
    prev = cur;
    await page.waitForTimeout(200);
  }
};

const openGround = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.engine);
  await page.evaluate(() => {
    window.app.engine.addSceneTree();
    window.app.ui.renderLayers();
    window.app.ui.buildControls();
    window.app.regen();
  });
  await page.locator('#layer-list >> text=Ground').first().click();
  await expect(page.locator('.vs3-linked')).toBeVisible();
  await settle(page);
};

const inView = (g, p) => p.x > g.view.l + 20 && p.x < g.view.l + g.view.w - 20 && p.y > g.view.t + 20 && p.y < g.view.t + g.view.h - 20;

test.describe('Ground gizmo', () => {
  test('dragging the Y arrow raises the floor; one undo step restores it', async ({ page }) => {
    await openGround(page);
    const before = await bag(page);
    const g = await gizmo(page);
    const dy = -g.up.perMm * 20 * -g.up.y; // 20 mm up along projected world-up
    await page.mouse.move(g.tip.x, g.tip.y);
    await page.mouse.down();
    await page.mouse.move(g.tip.x, g.tip.y + dy / 2, { steps: 4 });
    await page.mouse.move(g.tip.x, g.tip.y + dy, { steps: 4 });
    await page.mouse.up();
    const after = await bag(page);
    expect(after.y).toBeGreaterThan(10);
    expect(after.hist).toBe(before.hist + 1);
    await page.evaluate(() => window.app.undo());
    expect((await bag(page)).y).toBe(0);
  });

  test('Escape mid-drag restores the floor and leaves no history entry', async ({ page }) => {
    await openGround(page);
    const before = await bag(page);
    const g = await gizmo(page);
    await page.mouse.move(g.tip.x, g.tip.y);
    await page.mouse.down();
    await page.mouse.move(g.tip.x, g.tip.y - 50, { steps: 5 });
    expect((await bag(page)).y).toBeGreaterThan(5);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    const after = await bag(page);
    expect(after.y).toBe(0);
    expect(after.hist).toBe(before.hist);
  });

  test('corner resizes proportionally; Shift on an edge resizes one axis', async ({ page }) => {
    await openGround(page);
    let g = await gizmo(page);
    const corner = g.corners.find((c) => inView(g, c));
    expect(corner).toBeTruthy();
    // Pull the corner toward the floor's centre: a clear, proportional shrink.
    const toward = { x: (g.centre.x - corner.x) * 0.25, y: (g.centre.y - corner.y) * 0.25 };
    await page.mouse.move(corner.x, corner.y);
    await page.mouse.down();
    await page.mouse.move(corner.x + toward.x, corner.y + toward.y, { steps: 6 });
    await page.mouse.up();
    const a = await bag(page);
    expect(a.x).toBeLessThan(0.95);
    expect(a.z).toBeCloseTo(a.x, 2);

    await settle(page);
    g = await gizmo(page);
    const edge = g.edges.find((e) => inView(g, e));
    expect(edge).toBeTruthy();
    const tw = { x: (g.centre.x - edge.x) * 0.2, y: (g.centre.y - edge.y) * 0.2 };
    await page.keyboard.down('Shift');
    await page.mouse.move(edge.x, edge.y);
    await page.mouse.down();
    await page.mouse.move(edge.x + tw.x, edge.y + tw.y, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    const b = await bag(page);
    // exactly one axis moved
    expect([b.x !== a.x, b.z !== a.z].filter(Boolean).length).toBe(1);
  });

  test('pressing the selected floor body and dragging moves its height', async ({ page }) => {
    await openGround(page);
    const g = await gizmo(page);
    expect(inView(g, g.floorPoint)).toBe(true);
    const dy = -g.up.perMm * 15 * -g.up.y;
    await page.mouse.move(g.floorPoint.x, g.floorPoint.y);
    await page.mouse.down();
    await page.mouse.move(g.floorPoint.x, g.floorPoint.y + dy, { steps: 6 });
    await page.mouse.up();
    expect((await bag(page)).y).toBeGreaterThan(5);
  });

  test('touch: a finger-sized reach grabs the Y arrow', async ({ page }) => {
    await openGround(page);
    const g = await gizmo(page);
    const dy = -g.up.perMm * 20 * -g.up.y;
    const result = await page.evaluate(({ tip, dy }) => {
      const c = window.app.renderer.canvas;
      const fire = (type, x, y) => c.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 41, pointerType: 'touch', isPrimary: true,
        clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1,
      }));
      // 16 px off the tip: outside the mouse radius (9), inside the touch radius (22).
      fire('pointerdown', tip.x + 16, tip.y);
      for (let i = 1; i <= 6; i += 1) fire('pointermove', tip.x + 16, tip.y + (dy * i) / 6);
      fire('pointerup', tip.x + 16, tip.y + dy);
      const l = window.app.engine.layers.find((x) => x.type === 'sceneGround3d');
      return l.params.y ?? 0;
    }, { tip: g.tip, dy });
    expect(result).toBeGreaterThan(5);
  });
});
