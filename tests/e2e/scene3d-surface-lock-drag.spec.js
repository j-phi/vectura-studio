const { test, expect } = require('@playwright/test');

/*
 * e2e — Level S drag path (docs/surface-lock-contract.md §13, W2-B1). The default sphere with ground and shadow, every fill
 * surface-locked: a free-orbit drag runs the FULL tier (no pose warp, no spin ring), and the release settles to the same ink
 * as a fresh compose at that camera, from the compose memo (no recompose).
 */

const sig = (paths) => JSON.stringify((paths || []).map((p) => (Array.isArray(p) ? p.map((pt) => [Math.round(pt.x * 1e6) / 1e6, Math.round(pt.y * 1e6) / 1e6]) : [])));

test('Level S free-orbit drag: full tier, no ring, release equals a fresh compose', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer);
  const centre = await page.evaluate(() => {
    const app = window.app; const eng = app.engine; eng.layers = [];
    const gid = eng.addSceneTree();
    const leaf = eng.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    leaf.params.style = leaf.params.style || { penId: null, mapper: 'hatch', params: {} };
    leaf.params.style.mapper = 'hatch';
    leaf.params.style.params = { ...(leaf.params.style.params || {}), markSpace: 'surface' };
    app.regen();
    const r = app.renderer; const g = eng.getLayerById(gid);
    r.selectedLayerIds = new Set([gid]); r.selectedLayerId = gid; r.draw();
    window.__gid = gid;
    const ctl = r.get3DRotationControl(g, null);
    const s = r.worldToScreen(ctl.center.x, ctl.center.y);
    const rect = r.canvas.getBoundingClientRect();
    return { x: rect.left + s.x, y: rect.top + s.y, levelS: g._sceneLevelS };
  });
  expect(centre.levelS).toBe(true);

  const raf2 = () => page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
  const state = () => page.evaluate(() => {
    const g = window.app.engine.getLayerById(window.__gid); const st = window.app.engine.sceneComposeStats;
    return { tier: st.lastTier, warps: st.warps, composes: st.composes, blit: !!g._spinBlit, ring: !!window.app.renderer._spin, pose: g._scenePose || null };
  });
  const warps0 = (await state()).warps;

  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(centre.x + i * 6, centre.y + i * 2);
    await raf2();
    const s = await state();
    expect(s.tier, `move ${i}`).toBe('full');
    expect(s.blit, `move ${i}`).toBe(false);
    expect(s.pose, `move ${i}`).toBeNull();
  }
  const dragging = await state();
  expect(dragging.warps).toBe(warps0);
  const before = await page.evaluate(() => window.app.engine.sceneComposeStats.composes);
  await page.mouse.up();

  await page.waitForTimeout(1000);
  const after = await state();
  expect(after.ring).toBe(false);
  const result = await page.evaluate((fn) => {
    const eng = window.app.engine; const g = eng.getLayerById(window.__gid);
    const settled = g.scenePaths; const composes = eng.sceneComposeStats.composes;
    const settledSig = (0, eval)(fn)(settled);
    eng.invalidateSceneCompose(g); eng.computeAllDisplayGeometry();
    return { settledSig, freshSig: (0, eval)(fn)(g.scenePaths), composesAtSettle: composes };
  }, sig.toString());
  expect(result.settledSig).toBe(result.freshSig);
  // the release was a memo hit: the settled compose did not add one beyond what the last drag frame had
  expect(result.composesAtSettle).toBe(before);
});
