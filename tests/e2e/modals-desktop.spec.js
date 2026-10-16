const { test, expect } = require('@playwright/test');

// TUX-046 D6: desktop parity for the legacy #modal-overlay (fine pointer, mouse).
const openExport = async (page) => {
  await page.click('#btn-menu-file');
  await page.click('#btn-export');
  await page.waitForSelector('#modal-overlay.open');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(300);
};

test.describe('TUX-046 modals on desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
    await page.evaluate(() => {
      const { engine, ui } = window.app;
      engine.addLayer('spiral');
      if (ui.renderLayers) ui.renderLayers();
      if (ui.buildControls) ui.buildControls();
    });
    await page.waitForFunction(() => { const b = document.getElementById('btn-export'); return b && !b.disabled; });
  });

  test('1280x700: the header does not cover the Export card top', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    await openExport(page);
    const probe = await page.evaluate(() => {
      const r = document.querySelector('#modal-overlay .modal-card').getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + 40, r.top + 4);
      return { inCard: !!hit && !!hit.closest('#modal-overlay .modal-card'), hit: hit ? `${hit.tagName}.${hit.className}` : 'null', top: r.top };
    });
    expect(probe.inCard, `hit ${probe.hit} at card top ${probe.top}`).toBe(true);
  });

  test('1600x1000: Export card size, close size and focus are unchanged', async ({ page }) => {
    await openExport(page);
    const m = await page.evaluate(() => {
      const card = document.querySelector('#modal-overlay .modal-card');
      const cs = getComputedStyle(card);
      const close = document.querySelector('.modal-card .modal-close').getBoundingClientRect();
      const a = document.activeElement;
      const first = Array.from(card.querySelectorAll('button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')).find((el) => !el.classList.contains('modal-close'));
      return { w: parseFloat(cs.width), h: parseFloat(cs.height), cw: close.width, ch: close.height, focusIsFirst: a === first, active: a ? `${a.tagName}.${a.className}` : 'null' };
    });
    expect(m.w).toBeCloseTo(Math.min(Math.max(0.8 * 1600, 1080), 1600 - 32), 0);
    expect(m.h).toBeCloseTo(Math.min(Math.max(0.8 * 1000, 720), 1000 - 32), 0);
    expect(m.cw).toBe(24);
    expect(m.ch).toBe(24);
    expect(m.focusIsFirst, `active ${m.active}`).toBe(true);
  });

  test('1600x1000: Help and colour picker open with the 24px close', async ({ page }) => {
    await page.click('#btn-menu-help');
    await page.click('#btn-help');
    await page.waitForSelector('#modal-overlay.open');
    expect((await page.locator('.modal-card .modal-close').boundingBox()).width).toBe(24);
    await page.evaluate(() => window.app.ui.closeModal());
    await page.evaluate(() => window.app.ui.openColorModal({ title: 'Pen Color', value: '#ff0000', onApply: () => {} }));
    await page.waitForSelector('#modal-overlay.open');
    expect((await page.locator('.modal-card .modal-close').boundingBox()).height).toBe(24);
  });
});

// TUX-047 D6: desktop parity. Wheel factors, mouse pan and immediate mouse pour are unchanged.
test.describe('TUX-047 zoom surfaces on desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
    await page.evaluate(() => {
      const { engine, ui } = window.app;
      engine.addLayer('spiral');
      if (ui.renderLayers) ui.renderLayers();
      if (ui.buildControls) ui.buildControls();
    });
    await page.waitForFunction(() => { const b = document.getElementById('btn-export'); return b && !b.disabled; });
  });

  const raf2 = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  test('export preview: wheel factors, left-drag pan, 1600x1000 shot', async ({ page }) => {
    await openExport(page);
    await raf2(page);
    const view = () => page.evaluate(() => ({ ...window.app.ui.exportModalState.view }));
    const box = await page.locator('#export-preview-canvas-wrap').boundingBox();
    const cx = box.x + box.width / 2; const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    const v0 = await view();
    await page.mouse.wheel(0, -100);
    await raf2(page);
    const v1 = await view();
    expect(v1.scale / v0.scale).toBeCloseTo(1.08, 5);
    await page.mouse.wheel(0, 100);
    await raf2(page);
    const v2 = await view();
    expect(v2.scale / v1.scale).toBeCloseTo(0.92, 5);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 40, cy + 25, { steps: 5 });
    await page.mouse.up();
    const v3 = await view();
    expect(v3.offsetX - v2.offsetX).toBeCloseTo(40, 0);
    expect(v3.offsetY - v2.offsetY).toBeCloseTo(25, 0);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('export-preview-canvas-wrap')).cursor)).toBe('grab');
    await page.screenshot({ path: '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-047/desktop-export-1600x1000.png' });
  });

  const openPd = async (page) => {
    await page.evaluate(() => {
      const id = window.app.engine.addLayer('pattern');
      const L = window.app.engine.layers.find((l) => l.id === id);
      window.__L = L;
      window.app.ui.openPatternDesigner(L);
    });
    await page.waitForSelector('#pattern-designer-window [data-pd-canvas]');
    await raf2(page);
    await page.waitForTimeout(300);
  };

  test('Pattern Designer: wheel 1.15, middle-drag pan, mouse click pours immediately', async ({ page }) => {
    await openPd(page);
    const box = await page.locator('#pattern-designer-window [data-pd-canvas]').boundingBox();
    const cx = box.x + box.width / 2; const cy = box.y + box.height / 2;
    const view = () => page.evaluate(() => ({ ...window.app.ui.patternDesigner.view }));
    await page.mouse.move(cx, cy);
    const v0 = await view();
    await page.mouse.wheel(0, -100);
    await raf2(page);
    const v1 = await view();
    expect(v1.zoom / v0.zoom).toBeCloseTo(1.15, 5);
    await page.mouse.wheel(0, 100);
    await raf2(page);
    expect((await view()).zoom / v1.zoom).toBeCloseTo(1 / 1.15, 5);
    const v2 = await view();
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(cx + 30, cy + 20, { steps: 4 });
    await page.mouse.up({ button: 'middle' });
    const v3 = await view();
    expect(v3.offsetX - v2.offsetX).toBeCloseTo(30, 0);
    expect(v3.offsetY - v2.offsetY).toBeCloseTo(20, 0);
    // Left click with the fill tool pours with no deferral.
    const pt = await page.evaluate(() => {
      const ui = window.app.ui; const pd = ui.patternDesigner;
      const canvas = pd.root.querySelector('[data-pd-canvas]'); const r = canvas.getBoundingClientRect();
      const reg = window.Vectura.AlgorithmRegistry;
      for (let y = r.top + 6; y < r.bottom - 6; y += 8) {
        for (let x = r.left + 6; x < r.right - 6; x += 8) {
          if (document.elementFromPoint(x, y) !== canvas) continue;
          const sel = reg.patternGetFillTargetsAtPoint(pd.layer.params.patternId, (x - r.left - pd.view.offsetX) / pd.view.zoom, (y - r.top - pd.view.offsetY) / pd.view.zoom, { cache: true });
          if (sel && sel.smallest) return { x, y };
        }
      }
      return null;
    });
    expect(pt).toBeTruthy();
    await page.mouse.move(pt.x, pt.y);
    await page.mouse.down();
    const during = await page.evaluate(() => window.app.ui.patternDesigner.fills.length);
    await page.mouse.up();
    expect(during, 'fill poured on mousedown, before mouseup').toBe(1);
  });

  test('Pattern Designer: a pointercancel from another touch pointer does not kill a mouse drag', async ({ page }) => {
    await openPd(page);
    await page.evaluate(() => { const pd = window.app.ui.patternDesigner; pd.tool = 'shape-rect'; window.app.ui._syncPdToolActive?.(pd); });
    const box = await page.locator('#pattern-designer-window [data-pd-canvas]').boundingBox();
    const cx = box.x + box.width / 2; const cy = box.y + box.height / 2;
    const hist = () => page.evaluate(() => window.app.ui.patternDesigner.history.length);
    const h0 = await hist();
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 40, cy + 30, { steps: 4 });
    expect(await page.evaluate(() => !!window.app.ui.patternDesigner.dragShape)).toBe(true);
    // Unrelated touch pointer cancelled elsewhere (e.g. the left panel).
    await page.evaluate(() => {
      document.body.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 77, pointerType: 'touch', bubbles: true }));
    });
    expect(await page.evaluate(() => !!window.app.ui.patternDesigner.dragShape), 'drag survives foreign pointercancel').toBe(true);
    await page.mouse.up();
    expect(await hist(), 'commit adds exactly one history entry').toBe(h0 + 1);
  });
  test('TUX-052: mouse click keeps Click hints and Help opens on mac or win', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.mouse.click(640, 400);
    await expect(page.locator('body')).toHaveAttribute('data-last-input', 'mouse');
    await expect(page.locator('#status-bar')).toContainText(/Click/);
    await page.click('#btn-menu-help');
    await page.click('#btn-help');
    await page.waitForSelector('#modal-overlay.open');
    const active = await page.locator('.help-platform-btn.active').getAttribute('data-platform');
    expect(['mac', 'win']).toContain(active);
  });
});
