const { test, expect } = require('@playwright/test');

// TUX-044 D6 parity: a desktop mouse still reorders every panel list by grip and turns the angle
// dial. This file passed on the pre-TUX-044 handlers (mousedown) and passes on PointerReorder.
// Tall viewport so two ~700 px noise cards are both on screen (the legacy handlers had no auto-scroll).

test.use({ viewport: { width: 1600, height: 2400 } });

const boot = async (page, key) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  await page.evaluate((k) => {
    const eng = window.app.engine;
    const ui = window.app.ui;
    const D = window.Vectura.UI.ControlDefsData;
    if (k === 'noise' || k === 'effect' || k === 'dial') {
      eng.activeLayerId = eng.addLayer('wavetable');
      const l = eng.getActiveLayer();
      const n = l.params.noises;
      if (k === 'noise') n.push({ ...JSON.parse(JSON.stringify(n[0])), id: 'noise-2' });
      if (k === 'effect') {
        n[0].id = n[0].id || 'noise-1';
        n[0].type = 'image';
        const fx = JSON.parse(JSON.stringify((n[0].imageEffects && n[0].imageEffects[0]) || {}));
        n[0].imageEffects = [{ ...fx, id: 'effect-1' }, { ...fx, id: 'effect-2' }];
      }
      ui.storeLayerParams(l);
    } else if (k === 'modifier') {
      eng.activeLayerId = eng.addLayer('petalisDesigner');
      const l = eng.getActiveLayer();
      l.params.centerModifiers = [D.createPetalisModifier('ripple'), D.createPetalisModifier('ripple')];
      l.params.centerModifiers[1].id = 'mod-b';
      ui.storeLayerParams(l);
    } else if (k === 'mirror') {
      eng.activeLayerId = eng.addLayer('wavetable');
      eng.activeLayerId = eng.addModifierLayer('mirror');
      const m = eng.getActiveLayer().modifier.mirrors;
      m.push({ ...JSON.parse(JSON.stringify(m[0])), id: 'mirror-b' });
    } else if (k === 'pen') {
      eng.activeLayerId = eng.addLayer('wavetable');
    }
    ui.renderLayers();
    if (ui.buildControls) ui.buildControls();
    if (ui.renderPens) ui.renderPens();
  }, key);
  if (key === 'pen') {
    await page.evaluate(() => {
      const rp = document.getElementById('right-pane').getBoundingClientRect();
      if (!(rp.width > 60 && rp.right > 60 && rp.left < innerWidth - 60)) document.getElementById('btn-pane-toggle-right').click();
      // At the default 258 px the pen name/controls squeeze the grip row to 0 px wide (pre-existing
      // desktop layout); widen the pane so the grip is hittable.
      document.getElementById('right-pane').style.width = '440px';
      const tab = document.querySelector('#right-pane .right-pane-tab[data-tab="pens"]');
      if (tab) tab.click();
      const hdr = document.getElementById('pens-section-header');
      if (hdr && hdr.getAttribute('aria-expanded') === 'false') hdr.click();
    });
  }
  await page.waitForTimeout(key === 'pen' ? 1200 : 600);
};

const order = (page, key) => page.evaluate((k) => {
  const l = window.app.engine.getActiveLayer();
  if (k === 'noise') return l.params.noises.map((n) => n.id);
  if (k === 'effect') return l.params.noises[0].imageEffects.map((n) => n.id);
  if (k === 'modifier') return l.params.centerModifiers.map((n) => n.id);
  if (k === 'mirror') return l.modifier.mirrors.map((n) => n.id);
  return window.Vectura.SETTINGS.pens.map((p) => p.id);
}, key);

// Grip 2 dragged above the vertical midpoint of item 1 (upward move).
const gripSwap = async (page, grip, item) => {
  await page.locator(grip).nth(1).scrollIntoViewIfNeeded();
  const g = await page.locator(grip).nth(1).boundingBox();
  const first = await page.locator(item).first().boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2, g.y - 10, { steps: 4 });
  await page.mouse.move(g.x + g.width / 2, first.y + 6, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
};

const CASES = [
  ['noise', '#left-panel-content .noise-header .noise-grip', '#left-panel-content .noise-card'],
  ['effect', '#left-panel-content .image-effect-header .noise-grip', '#left-panel-content .image-effect-card'],
  ['modifier', '#left-panel-content .noise-grip[aria-label="Reorder modifier"]', '#left-panel-content .noise-card'],
  ['pen', '#pen-list .pen-grip', '#pen-list .pen-item'],
];

test.describe('TUX-044 desktop mouse parity', () => {
  for (const [key, grip, item] of CASES) {
    test(`${key}: mouse grip drag swaps the first two`, async ({ page }) => {
      await boot(page, key);
      const before = await order(page, key);
      expect(before.length).toBeGreaterThanOrEqual(2);
      await page.evaluate(() => { window.__dragstarts = 0; document.addEventListener('dragstart', () => { window.__dragstarts += 1; }, true); });
      await gripSwap(page, grip, item);
      expect(await order(page, key)).toEqual([before[1], before[0], ...before.slice(2)]);
      expect(await page.evaluate(() => window.__dragstarts), 'no HTML5 drag from a grip').toBe(0);
    });
  }

  test('mirror: row drag and drop still reorders (desktop HTML5 DnD kept)', async ({ page }) => {
    await boot(page, 'mirror');
    const before = await order(page, 'mirror');
    const rows = page.locator('#left-panel-content .mp-row');
    await rows.nth(1).dragTo(rows.nth(0), { targetPosition: { x: 40, y: 4 } });
    await page.waitForTimeout(300);
    expect(await order(page, 'mirror')).toEqual([before[1], before[0]]);
  });

  // New in TUX-044 (the grip did not exist before): a mouse drag on the mirror grip reorders too.
  test('mirror: the new row grip reorders with the mouse', async ({ page }) => {
    await boot(page, 'mirror');
    const before = await order(page, 'mirror');
    await gripSwap(page, '#left-panel-content .mp-row-grip', '#left-panel-content .mp-row');
    expect(await order(page, 'mirror')).toEqual([before[1], before[0]]);
  });

  test('dial: a mouse drag turns the angle dial', async ({ page }) => {
    await boot(page, 'dial');
    const dial = page.locator('#left-panel-content .angle-dial').first();
    await dial.scrollIntoViewIfNeeded();
    const b = await dial.boundingBox();
    const cx = b.x + b.width / 2; const cy = b.y + b.height / 2;
    const a0 = await dial.getAttribute('aria-valuenow');
    await page.mouse.move(cx, cy - 12);
    await page.mouse.down();
    await page.mouse.move(cx + 12, cy, { steps: 4 });
    await page.mouse.up();
    expect(await dial.getAttribute('aria-valuenow')).not.toBe(a0);
  });
});
