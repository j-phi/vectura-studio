const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-044a: every panel list reorders by finger through pointer events (PointerReorder), and the
// angle dial owns its finger drag. Pointer input comes from helpers/touch.js only (no mouse).
// The layer list is TUX-044b (deferred). Modifier B (petal modifiers) and the shading list are
// not reachable from the current UI (the petalisDesigner filter removes them); their handlers use
// the same helper and are covered by the unit test.
// The optimization grip is not covered: export-svg.js removes it from the Export modal (each step
// is its own screen), so no grip is reachable. The handler is migrated and unit covered.
// Panes are opened in SETUP ONLY helpers (DOM clicks): finger reachability is TUX-010/008.

const { engineSupports, touchPhase, hitArea } = touch;

const SURFACES = {
  noise: { grip: '#left-panel-content .noise-header .noise-grip', ind: '.noise-drop-indicator', pane: 'left' },
  effect: { grip: '#left-panel-content .image-effect-header .noise-grip', ind: '.image-effect-drop-indicator', pane: 'left' },
  modifier: { grip: '#left-panel-content .noise-grip[aria-label="Reorder modifier"]', ind: '.noise-drop-indicator', pane: 'left' },
  mirror: { grip: '#left-panel-content .mp-row-grip', ind: '.mp-drop-indicator', pane: 'left' },
  pen: { grip: '#pen-list .pen-grip', ind: '.layer-drop-indicator', pane: 'right' },
};

const boot = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
};

// SETUP ONLY: fixtures built through engine/UI APIs, not part of the journey.
const buildFixture = async (page, key) => {
  await page.evaluate((k) => {
    const eng = window.app.engine;
    const ui = window.app.ui;
    const D = window.Vectura.UI.ControlDefsData;
    if (k === 'noise' || k === 'effect') {
      const id = eng.addLayer('wavetable');
      eng.activeLayerId = id;
      const l = eng.getActiveLayer();
      const n = l.params.noises;
      if (k === 'noise') {
        n.push({ ...JSON.parse(JSON.stringify(n[0])), id: 'noise-2' });
      } else {
        n[0].id = n[0].id || 'noise-1';
        n[0].type = 'image';
        const fx = JSON.parse(JSON.stringify((n[0].imageEffects && n[0].imageEffects[0]) || {}));
        n[0].imageEffects = [{ ...fx, id: 'effect-1' }, { ...fx, id: 'effect-2' }];
      }
      ui.storeLayerParams(l);
    } else if (k === 'modifier') {
      const id = eng.addLayer('petalisDesigner');
      eng.activeLayerId = id;
      const l = eng.getActiveLayer();
      l.params.centerModifiers = [D.createPetalisModifier('ripple'), D.createPetalisModifier('ripple')];
      l.params.centerModifiers[1].id = 'mod-b';
      ui.storeLayerParams(l);
    } else if (k === 'mirror') {
      eng.activeLayerId = eng.addLayer('wavetable');
      const id = eng.addModifierLayer('mirror');
      eng.activeLayerId = id;
      const l = eng.getActiveLayer();
      const m = l.modifier.mirrors;
      m.push({ ...JSON.parse(JSON.stringify(m[0])), id: 'mirror-b' });
    } else if (k === 'pen') {
      eng.activeLayerId = eng.addLayer('wavetable');
    }
    ui.renderLayers();
    if (ui.buildControls) ui.buildControls();
    if (ui.renderPens) ui.renderPens();
  }, key);
};

const paneOpen = (page, id) => page.evaluate((i) => {
  const r = document.getElementById(i).getBoundingClientRect();
  return r.width > 60 && r.right > 60 && r.left < innerWidth - 60;
}, id);
const domClick = async (page, id) => { await page.evaluate((i) => document.getElementById(i).click(), id); await page.waitForTimeout(700); };

// SETUP ONLY, not part of the journey: the pane toggles are not finger-reachable on iPhone yet (TUX-010).
const openLeftPaneForSetup = async (page) => {
  if (!(await paneOpen(page, 'left-pane'))) await domClick(page, 'btn-pane-toggle-left');
};
const openRightPaneForSetup = async (page) => {
  if (await paneOpen(page, 'left-pane') && await page.evaluate(() => innerWidth < 700)) await domClick(page, 'btn-pane-toggle-left');
  if (!(await paneOpen(page, 'right-pane'))) await domClick(page, 'btn-pane-toggle-right');
  await page.evaluate(() => document.querySelector('#right-pane .right-pane-tab[data-tab="pens"]').click());
  await page.waitForTimeout(400);
};

const setup = async (page, key) => {
  await boot(page);
  await buildFixture(page, key);
  const s = SURFACES[key];
  if (s.pane === 'left') await openLeftPaneForSetup(page);
  else await openRightPaneForSetup(page);
  await page.waitForTimeout(500);
  await expect(page.locator(s.grip).nth(1)).toBeAttached();
};

// Model order of a surface, as ids.
const modelOrder = (page, key) => page.evaluate((k) => {
  const eng = window.app.engine;
  const l = eng.getActiveLayer();
  if (k === 'noise') return l.params.noises.map((n) => n.id);
  if (k === 'effect') return l.params.noises[0].imageEffects.map((n) => n.id);
  if (k === 'modifier') return l.params.centerModifiers.map((n) => n.id);
  if (k === 'mirror') return l.modifier.mirrors.map((n) => n.id);
  return window.Vectura.SETTINGS.pens.map((p) => p.id);
}, key);

const historyLen = (page) => page.evaluate(() => (window.app.history || []).length);

const scrollGripIntoView = (page, sel, n) => page.evaluate(({ sel, n }) => {
  document.querySelectorAll(sel)[n].scrollIntoView({ block: 'center' });
}, { sel, n });

const center = async (page, sel, n) => {
  await scrollGripIntoView(page, sel, n);
  await page.waitForTimeout(150);
  const b = await page.locator(sel).nth(n).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

// In-page: nearest scroller of grip 0's container (same rule as PointerReorder).
const scrollerInfo = (page, sel) => page.evaluate((sel) => {
  let n = document.querySelectorAll(sel)[0].parentElement;
  while (n && n !== document.body) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) break;
    n = n.parentElement;
  }
  if (!n || n === document.body) return null;
  const r = n.getBoundingClientRect();
  const vv = window.visualViewport;
  return { top: Math.max(r.top, vv ? vv.offsetTop : 0), left: r.left, width: r.width, scrollTop: n.scrollTop };
}, sel);

const neutralizeBridge = (page) => page.evaluate(() => {
  window.__bridgedMouse = 0;
  window.__captured = [];
  const kill = (e) => { if (!e.isTrusted) { e.stopImmediatePropagation(); window.__bridgedMouse += 1; } };
  ['mousedown', 'mousemove', 'mouseup'].forEach((t) => {
    window.addEventListener(t, kill, true);
    document.addEventListener(t, kill, true);
  });
  document.addEventListener('gotpointercapture', (e) => window.__captured.push(e.target.className || e.target.tagName), true);
});

// Finger-drag grip 2 above card 1: scroll so grip 2 is visible, start, move into the scroller's
// top edge zone, hold with 1px moves (so WebKit gets moves), then end. Returns nothing.
const dragSecondToFirst = async (page, key, { end = true } = {}) => {
  const sel = SURFACES[key].grip;
  const info = await scrollerInfo(page, sel);
  const start = await center(page, sel, 1);
  await touchPhase(page, 'start', [{ ...start, id: 0 }]);
  const edgeY = (info ? info.top : 0) + 10;
  const x = start.x;
  for (let i = 1; i <= 10; i += 1) {
    await touchPhase(page, 'move', [{ x, y: start.y + (edgeY - start.y) * (i / 10), id: 0 }]);
  }
  for (let t = 0; t < 15; t += 1) {
    await page.waitForTimeout(100);
    await touchPhase(page, 'move', [{ x, y: edgeY + (t % 2), id: 0 }]);
  }
  if (end) await touchPhase(page, 'end', [{ x, y: edgeY, id: 0 }]);
  return { x, y: edgeY };
};

const KEYS = Object.keys(SURFACES);

test.describe('TUX-044 grip style and hit area', () => {
  for (const key of KEYS) {
    test(`${key} grip: touch-action none and a finger-sized hit area`, async ({ page }) => {
      await setup(page, key);
      const sel = SURFACES[key].grip;
      await scrollGripIntoView(page, sel, 0);
      const ta = await page.locator(sel).first().evaluate((el) => getComputedStyle(el).touchAction);
      expect(ta, `${key} touch-action`).toBe('none');
      const hit = await hitArea(page, page.locator(sel).first());
      expect(hit.w, `${key} hit width`).toBeGreaterThanOrEqual(44);
      expect(hit.h, `${key} hit height`).toBeGreaterThanOrEqual(44);
    });
  }
});

test.describe('TUX-044 off-bridge swap, cancel, auto-scroll', () => {
  for (const key of KEYS) {
    test(`${key}: finger drag swaps with the mouse bridge neutralized`, async ({ page }) => {
      await setup(page, key);
      const before = await modelOrder(page, key);
      expect(before.length).toBeGreaterThanOrEqual(2);
      await neutralizeBridge(page);
      await dragSecondToFirst(page, key);
      await page.waitForTimeout(300);
      const after = await modelOrder(page, key);
      expect(after, `${key} order`).toEqual([before[1], before[0], ...before.slice(2)]);
      const cap = await page.evaluate(() => window.__captured);
      expect(cap.length, 'gotpointercapture fired').toBeGreaterThan(0);
    });
  }

  for (const key of ['noise', 'mirror', 'pen']) {
    test(`${key}: pointercancel aborts the drag`, async ({ page }) => {
      await setup(page, key);
      const s = SURFACES[key];
      const before = await modelOrder(page, key);
      const h0 = await historyLen(page);
      await page.evaluate(() => { window.__regen = 0; const a = window.app; const o = a.regen.bind(a); a.regen = (...r) => { window.__regen += 1; return o(...r); }; });
      const start = await center(page, s.grip, 1);
      await touchPhase(page, 'start', [{ ...start, id: 0 }]);
      for (let i = 1; i <= 8; i += 1) await touchPhase(page, 'move', [{ x: start.x, y: start.y - i * 8, id: 0 }]);
      await expect(page.locator(s.ind)).toHaveCount(1);
      await touchPhase(page, 'cancel', [{ x: start.x, y: start.y - 64, id: 0 }]);
      await page.waitForTimeout(300);
      expect(await modelOrder(page, key)).toEqual(before);
      await expect(page.locator(s.ind)).toHaveCount(0);
      expect(await page.locator('.dragging').count()).toBe(0);
      expect(await historyLen(page)).toBe(h0);
      expect(await page.evaluate(() => window.__regen)).toBe(0);
    });
  }

  test('noise: no native scroll and no pointercancel during a grip drag', async ({ page }) => {
    await setup(page, 'noise');
    if (!engineSupports(page, 'nativeDefaultActions')) return;
    const sel = SURFACES.noise.grip;
    const start = await center(page, sel, 1);
    await page.evaluate((sel) => {
      window.__cancels = 0;
      document.querySelectorAll(sel)[1].addEventListener('pointercancel', () => { window.__cancels += 1; });
    }, sel);
    const info = await scrollerInfo(page, sel);
    await touchPhase(page, 'start', [{ ...start, id: 0 }]);
    for (let i = 1; i <= 8; i += 1) await touchPhase(page, 'move', [{ x: start.x, y: start.y + (i % 2 ? -4 : 4) * i, id: 0 }]);
    const mid = await scrollerInfo(page, sel);
    await touchPhase(page, 'end', [{ x: start.x, y: start.y, id: 0 }]);
    expect(await page.evaluate(() => window.__cancels)).toBe(0);
    expect(mid.scrollTop).toBe(info.scrollTop);
  });
});

test.describe('TUX-044 angle dial', () => {
  const dialSetup = async (page) => {
    await setup(page, 'noise');
    await page.evaluate(() => document.querySelector('#left-panel-content .angle-dial').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(200);
  };
  const angleOf = (page) => page.evaluate(() => document.querySelector('#left-panel-content .angle-dial').getAttribute('aria-valuenow'));

  test('dial: touch-action none and finger-sized', async ({ page }) => {
    await dialSetup(page);
    const loc = page.locator('#left-panel-content .angle-dial').first();
    expect(await loc.evaluate((el) => getComputedStyle(el).touchAction)).toBe('none');
    const hit = await hitArea(page, loc);
    expect(hit.w).toBeGreaterThanOrEqual(44);
    expect(hit.h).toBeGreaterThanOrEqual(44);
  });

  test('dial: pointercancel restores the start angle', async ({ page }) => {
    await dialSetup(page);
    const b = await page.locator('#left-panel-content .angle-dial').first().boundingBox();
    const cx = b.x + b.width / 2; const cy = b.y + b.height / 2;
    const a0 = await angleOf(page);
    // Left (270 deg) unless the dial already sits there, then right (90 deg).
    const to = a0 === '270' ? { x: cx + 12, y: cy } : { x: cx - 12, y: cy };
    await touchPhase(page, 'start', [{ x: cx, y: cy - 12, id: 0 }]);
    await touchPhase(page, 'move', [{ x: cx + 6, y: cy - 10, id: 0 }]);
    await touchPhase(page, 'move', [{ ...to, id: 0 }]);
    expect(await angleOf(page)).not.toBe(a0);
    await touchPhase(page, 'cancel', [{ ...to, id: 0 }]);
    await page.waitForTimeout(150);
    expect(await angleOf(page)).toBe(a0);
  });

  test('dial: a vertical finger drag turns it and does not scroll the pane', async ({ page }) => {
    await dialSetup(page);
    if (!engineSupports(page, 'nativeDefaultActions')) return;
    const sel = '#left-panel-content .angle-dial';
    const b = await page.locator(sel).first().boundingBox();
    const cx = b.x + b.width / 2; const cy = b.y + b.height / 2;
    const a0 = await angleOf(page);
    const s0 = (await scrollerInfo(page, sel)).scrollTop;
    await touchPhase(page, 'start', [{ x: cx + 12, y: cy, id: 0 }]);
    for (let i = 1; i <= 8; i += 1) await touchPhase(page, 'move', [{ x: cx + 12, y: cy + i * 10, id: 0 }]);
    await touchPhase(page, 'end', [{ x: cx + 12, y: cy + 80, id: 0 }]);
    expect(await angleOf(page)).not.toBe(a0);
    expect((await scrollerInfo(page, sel)).scrollTop).toBe(s0);
  });
});
