const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-043: sliders are finger-sized, and scrolling or tapping over a slider never changes a value.
// Cheap group (a-d): all 11 touch projects. Gesture group (e-i): iPhone portrait + iPad landscape,
// both engines. (j): mouse parity on iPad landscape. Every coordinate comes from
// getBoundingClientRect at test time. Only the scrollTop assertion is guarded for WebKit
// (untrusted synthetic gestures do not scroll there); the value assertions run in every engine.

const GESTURE_PROJECTS = ['touch-iphone-portrait', 'webkit-iphone-portrait', 'touch-ipad-landscape', 'webkit-ipad-landscape'];
const IPHL_PROJECTS = ['touch-iphone-landscape', 'webkit-iphone-landscape'];
const MOUSE_PROJECTS = ['touch-ipad-landscape', 'webkit-ipad-landscape'];
const THUMB = 28;

const boot = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  await page.evaluate(() => {
    const id = window.app.engine.addLayer('wavetable');
    window.app.engine.activeLayerId = id;
    window.app.ui.renderLayers();
    if (window.app.ui.buildControls) window.app.ui.buildControls();
  });
  await page.waitForTimeout(500);
};

// DOM click (never a finger tap: TUX-010 owns the pane toggles). One click only: a second click
// during the open transition would close the pane again.
const openLeftPane = async (page) => {
  await page.evaluate(() => {
    const pane = document.getElementById('left-pane');
    const r = pane.getBoundingClientRect();
    if (r.width > 60 && r.right > 60 && r.left < innerWidth - 60) return;
    (document.getElementById('btn-pane-toggle-left') || document.getElementById('btn-mobile-pane-left')).click();
  });
  await page.waitForTimeout(700);
};

// Swap to the right pane (Pens tab) via DOM; the left pane would cover the draw-order footer.
const showRight = async (page, tab = 'pens') => {
  const isOpen = (id) => page.evaluate((i) => {
    const r = document.getElementById(i).getBoundingClientRect();
    return r.width > 60 && r.right > 60 && r.left < innerWidth - 60;
  }, id);
  const click = async (id) => { await page.evaluate((i) => document.getElementById(i).click(), id); await page.waitForTimeout(700); };
  // On phones the two panes overlap; close the left one first (DOM clicks, one per pane).
  if (await isOpen('left-pane') && await page.evaluate(() => innerWidth < 700)) await click('btn-pane-toggle-left');
  if (!(await isOpen('right-pane'))) await click('btn-pane-toggle-right');
  await page.evaluate((t) => document.querySelector(`#right-pane .right-pane-tab[data-tab="${t}"]`).click(), tab);
  await page.waitForTimeout(500);
};

const SCROLLER = `(el) => {
  let n = el.parentElement;
  while (n) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 4) return n;
    n = n.parentElement;
  }
  return null;
}`;

// Tag the first .ctrl-slider that sits fully inside its scroller's viewport, with scroll room below.
const pickSlider = async (page, { lowish = false } = {}) => {
  const ok = await page.evaluate(({ scrollerSrc, lowish }) => {
    const scrollerOf = eval(scrollerSrc); // eslint-disable-line no-eval
    document.querySelectorAll('[data-tux043]').forEach((e) => e.removeAttribute('data-tux043'));
    const cands = [...document.querySelectorAll('#left-pane input.ctrl-slider[type=range]')]
      .filter((el) => !el.matches('.is-dual-min, .is-dual-max') && el.offsetParent);
    for (const el of cands) {
      const sc = scrollerOf(el);
      if (!sc) continue;
      const s0 = sc.getBoundingClientRect();
      const want = lowish ? Math.min(innerHeight - 120, 400) : s0.top + s0.height / 2;
      const r0 = el.getBoundingClientRect();
      sc.scrollTop += r0.top + r0.height / 2 - want;
      const r = el.getBoundingClientRect();
      if (r.top < s0.top || r.bottom > s0.bottom || r.width < 80) continue;
      if (lowish && sc.scrollHeight - sc.clientHeight - sc.scrollTop < 120) continue;
      el.dataset.tux043 = '1';
      sc.dataset.tux043sc = '1';
      return true;
    }
    return false;
  }, { scrollerSrc: SCROLLER, lowish });
  expect(ok, 'a .ctrl-slider inside the scroller viewport').toBe(true);
  return page.locator('[data-tux043="1"]');
};

const geom = (loc) => loc.evaluate((el, thumb) => {
  const r = el.getBoundingClientRect();
  const min = Number(el.min); const max = Number(el.max); const v = Number(el.value);
  const track = r.width - thumb;
  const frac = max === min ? 0 : (v - min) / (max - min);
  return {
    left: r.left, width: r.width, cy: r.top + r.height / 2, h: r.height, track,
    thumbX: r.left + thumb / 2 + frac * track,
    min, max, step: Number(el.step) || 1, value: v,
  };
}, THUMB);

const watch = (loc) => loc.evaluate((el) => {
  const c = { input: 0, change: 0 };
  el.addEventListener('input', () => { c.input += 1; }, true);
  el.addEventListener('change', () => { c.change += 1; }, true);
  window.__tux043 = c;
});
const counts = (page) => page.evaluate(() => ({ ...window.__tux043 }));
const histLen = (page) => page.evaluate(() => window.app.history.length);
const scrollTopOf = (page) => page.evaluate(() => document.querySelector('[data-tux043sc]').scrollTop);
const valueOf = (loc) => loc.evaluate((el) => Number(el.value));

const drawOrderTrackHit = (page) => page.evaluate(() => {
  const el = document.getElementById('draw-order-input');
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return hit && (hit.id || hit.className);
});

const trackSetup = async (page, opts) => {
  await boot(page);
  await openLeftPane(page);
  const loc = await pickSlider(page, opts);
  await watch(loc);
  return loc;
};

test.describe('TUX-043 sliders: cheap group', () => {
  test('(a) hit size >= 44 on the input box and by hitArea', async ({ page }) => {
    const loc = await trackSetup(page);
    const g = await geom(loc);
    expect(g.h, 'ctrl-slider input height').toBeGreaterThanOrEqual(44);
    expect((await touch.hitArea(page, loc)).h, 'ctrl-slider hitArea').toBeGreaterThanOrEqual(44);

    // Pens pane.
    await showRight(page);
    const pen = page.locator('#right-pane input.pen-width[type=range]:visible, #right-pane input.pen-sld[type=range]:visible').first();
    await pen.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    expect((await geom(pen)).h, 'pen slider input height').toBeGreaterThanOrEqual(44);
    expect((await touch.hitArea(page, pen)).h, 'pen slider hitArea').toBeGreaterThanOrEqual(44);

    // Draw-order.
    await showRight(page, 'layers');
    const dro = page.locator('#draw-order-input');
    // iPhone landscape (380-520px tall) gets no scrollIntoView rescue: the footer must already sit
    // clear of the modifier bar. Taller viewports, and iPhone landscape with browser chrome
    // (330px: the pane scroller is 172px, less than the list plus the 44px slider), scroll first.
    if (await page.evaluate(() => innerHeight > 520 || innerHeight < 380)) await dro.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    expect((await geom(dro)).h, 'draw-order input height').toBeGreaterThanOrEqual(44);
    expect((await touch.hitArea(page, dro)).h, 'draw-order hitArea').toBeGreaterThanOrEqual(44);
    // The track centre must resolve to the input itself, not to the modifier bar or HUD.
    expect(await drawOrderTrackHit(page), 'elementFromPoint at the draw-order track centre').toBe('draw-order-input');
  });

  test('(b) thumb >= 28 px', async ({ page }) => {
    const loc = await trackSetup(page);
    const size = await loc.evaluate((el) => {
      const px = (s) => parseFloat(s);
      const pseudo = getComputedStyle(el, '::-webkit-slider-thumb');
      const token = getComputedStyle(document.documentElement).getPropertyValue('--touch-slider-thumb');
      return { w: px(pseudo.width), h: px(pseudo.height), token: px(token) };
    });
    // WebKit/Chromium can echo the input's own width for the pseudo, so the token is authoritative
    // and the pseudo only counts when it reports a plausible thumb size.
    const pseudoOk = Number.isFinite(size.w) && size.w > 0 && size.w < 100;
    const measured = pseudoOk ? Math.min(size.w, size.h, size.token || Infinity) : size.token;
    expect(measured, `thumb ${JSON.stringify(size)}`).toBeGreaterThanOrEqual(THUMB);
  });

  test('(c) touch-action is pan-y on ranges (cascade tripwire)', async ({ page }) => {
    const loc = await trackSetup(page);
    expect(await loc.evaluate((el) => getComputedStyle(el).touchAction), '.ctrl-slider').toBe('pan-y');
    await showRight(page);
    const pen = page.locator('#right-pane input.pen-width[type=range]:visible, #right-pane input.pen-sld[type=range]:visible').first();
    expect(await pen.evaluate((el) => getComputedStyle(el).touchAction), '.pen-sld').toBe('pan-y');
    await page.evaluate(() => window.app.ui.openExportModal());
    await page.waitForTimeout(400);
    const exp = page.locator('#export-legend-thickness, [id^="export-"][type=range], .modal-overlay input[type=range]').first();
    expect(await exp.evaluate((el) => getComputedStyle(el).touchAction), 'export modal range').toBe('pan-y');
    expect(await page.locator('#draw-order-input').evaluate((el) => getComputedStyle(el).touchAction), 'draw-order').toBe('pan-y');
  });

  test('(d) a track tap changes nothing', async ({ page }) => {
    const loc = await trackSetup(page);
    const g = await geom(loc);
    const h0 = await histLen(page);
    const x = g.thumbX + (g.thumbX + 40 < g.left + g.width - 8 ? 40 : -40);
    await touch.tap(page, { x, y: g.cy });
    await page.waitForTimeout(450);
    expect(await valueOf(loc), 'value after track tap').toBe(g.value);
    expect(await counts(page)).toEqual({ input: 0, change: 0 });
    expect(await histLen(page)).toBe(h0);

    await showRight(page, 'layers');
    const dro = page.locator('#draw-order-input');
    if (await page.evaluate(() => innerHeight > 520 || innerHeight < 380)) await dro.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    // Strict: park the handle mid-range (silently), tap 40px to either side of it. A tap may start
    // playback (kept), which only moves the handle forward from 50 at 35%/s, so the value must stay
    // within 50 .. 50 + 0.035 * elapsedMs (+3 slack). A jump to the finger lands outside that.
    for (const side of [-1, 1]) {
      // Let any playback from the previous tap finish (it ends at 100), then park at 50.
      await page.waitForFunction(() => Number(document.getElementById('draw-order-input').value) === 100, null, { timeout: 5000 }).catch(() => {});
      await dro.evaluate((el) => { el.value = '50'; });
      const dg = await geom(dro);
      expect(dg.value).toBe(50);
      const t0 = Date.now();
      await touch.tap(page, { x: dg.thumbX + 40 * side, y: dg.cy });
      const after = await valueOf(dro);
      const bound = 50 + 0.035 * (Date.now() - t0) + 3;
      const label = `draw-order after tap ${side < 0 ? 'left' : 'right'} of the handle`;
      expect(after, label).toBeGreaterThanOrEqual(50);
      expect(after, label).toBeLessThanOrEqual(bound);
    }
  });
});

test.describe('TUX-043 sliders: gesture group', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!GESTURE_PROJECTS.includes(testInfo.project.name), 'gesture group runs on iPhone portrait + iPad landscape');
  });

  const swipeUp = async (page, loc, offsetFromThumb) => {
    const g = await geom(loc);
    const h0 = await histLen(page);
    const st0 = await scrollTopOf(page);
    const fromX = g.thumbX + offsetFromThumb;
    const dy = -Math.min(260, g.cy - 10);
    await touch.drag(page, { x: fromX, y: g.cy }, { x: fromX, y: g.cy + dy }, { steps: 12 });
    await page.waitForTimeout(450);
    expect(await valueOf(loc), 'value after vertical swipe').toBe(g.value);
    expect(await counts(page)).toEqual({ input: 0, change: 0 });
    expect(await histLen(page)).toBe(h0);
    if (touch.engineSupports(page, 'nativeDefaultActions')) {
      expect(await scrollTopOf(page), 'panel scrolled').not.toBe(st0);
    }
  };

  test('(e) vertical swipe starting off the thumb scrolls, value unchanged', async ({ page }) => {
    const loc = await trackSetup(page, { lowish: true });
    const g = await geom(loc);
    await swipeUp(page, loc, g.thumbX + 12 < g.left + g.width - 8 ? 12 : -12);
  });

  test('(f) vertical swipe starting on the thumb scrolls, value unchanged', async ({ page }) => {
    const loc = await trackSetup(page, { lowish: true });
    await swipeUp(page, loc, 0);
  });

  test('(g) horizontal drag from the thumb tracks the finger; one change; one commit', async ({ page }) => {
    const loc = await trackSetup(page, { lowish: true });
    await loc.evaluate((el) => { el.value = String((Number(el.min) + Number(el.max)) / 2); });
    const g = await geom(loc);
    const h0 = await histLen(page);
    const dir = g.thumbX + 60 < g.left + g.width - 8 ? 1 : -1;
    await touch.drag(page, { x: g.thumbX, y: g.cy }, { x: g.thumbX + 60 * dir, y: g.cy }, { steps: 10 });
    await page.waitForTimeout(450);
    const v = await valueOf(loc);
    const expected = g.value + dir * (60 / g.track) * (g.max - g.min);
    expect(Math.abs(v - expected), `value ${v} vs ${expected}`).toBeLessThanOrEqual(2 * g.step + 1e-6);
    expect((await counts(page)).change, 'exactly one change').toBe(1);
    expect((await counts(page)).input, 'input events fire while dragging').toBeGreaterThan(1);
    // One native-equivalent commit adds one history entry in this app.
    expect(await histLen(page)).toBe(h0 + 1);
  });

  test('(h) horizontal drag from the band moves relatively, not to the finger', async ({ page }) => {
    const loc = await trackSetup(page, { lowish: true });
    // Park the value mid-range (silently) so a relative -60 px drag is not clamped at an end.
    await loc.evaluate((el) => { el.value = String((Number(el.min) + Number(el.max)) / 2); });
    const g = await geom(loc);
    const dir = g.thumbX + 40 + 20 < g.left + g.width - 8 ? 1 : -1;
    const startX = g.thumbX + 40 * dir;
    await touch.drag(page, { x: startX, y: g.cy }, { x: startX - 60 * dir, y: g.cy }, { steps: 10 });
    await page.waitForTimeout(450);
    const v = await valueOf(loc);
    const expected = g.value - dir * (60 / g.track) * (g.max - g.min);
    expect(Math.abs(v - expected), `value ${v} vs relative ${expected} (start ${g.value})`).toBeLessThanOrEqual(2 * g.step + 1e-6);
  });

  test('(i) dual range: the nearest thumb moves; coincident thumbs follow drag direction', async ({ page }) => {
    await boot(page);
    await openLeftPane(page);
    // Mount a UI.Slider dual instance inside the pane's scroller.
    await page.evaluate(() => {
      const host = document.createElement('div');
      host.id = 'tux043-dual-host';
      host.style.cssText = 'padding:8px 12px;';
      const target = document.querySelector('#left-pane input.ctrl-slider').closest('.slider-row').parentElement;
      target.insertBefore(host, target.firstChild);
      window.__dual = window.Vectura.UI.Slider(host, { dual: true, min: 0, max: 100, step: 1, value: { min: 20, max: 80 }, ariaLabel: 'tux043 dual' });
      host.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(300);
    const mn = page.locator('#tux043-dual-host .is-dual-min');
    const mx = page.locator('#tux043-dual-host .is-dual-max');
    const gm = await geom(mn);
    const gx = await geom(mx);
    // Drag starting nearer the max thumb: only max moves.
    await touch.drag(page, { x: gx.thumbX - 4, y: gx.cy }, { x: gx.thumbX - 4 - 40, y: gx.cy }, { steps: 8 });
    await page.waitForTimeout(250);
    expect(await valueOf(mn), 'min untouched').toBe(20);
    expect(await valueOf(mx), 'max moved down').toBeLessThan(80);
    // Bring thumbs together, then drag right: max moves; drag left: min moves.
    await page.evaluate(() => window.__dual.setValue({ min: 50, max: 50 }, { silent: true }));
    const gc = await geom(mx);
    await touch.drag(page, { x: gc.thumbX, y: gc.cy }, { x: gc.thumbX + 40, y: gc.cy }, { steps: 8 });
    await page.waitForTimeout(250);
    expect(await valueOf(mn), 'min stays at 50').toBe(50);
    expect(await valueOf(mx), 'max moves right').toBeGreaterThan(50);
    await page.evaluate(() => window.__dual.setValue({ min: 50, max: 50 }, { silent: true }));
    const gd = await geom(mx);
    await touch.drag(page, { x: gd.thumbX, y: gd.cy }, { x: gd.thumbX - 40, y: gd.cy }, { steps: 8 });
    await page.waitForTimeout(250);
    expect(await valueOf(mn), 'min moves left').toBeLessThan(50);
    expect(await valueOf(mx), 'max stays at 50').toBe(50);
    expect(gm.h).toBeGreaterThanOrEqual(44);
  });
});

test.describe('TUX-043 sliders: draw-order on iPhone landscape', () => {
  test('(k) a thumb drag on the draw-order slider changes its value', async ({ page }, testInfo) => {
    test.skip(!IPHL_PROJECTS.includes(testInfo.project.name), 'short-viewport footer check runs on iPhone landscape');
    await boot(page);
    await showRight(page, 'layers');
    const dro = page.locator('#draw-order-input');
    expect(await drawOrderTrackHit(page), 'track centre resolves to the input (no scroll rescue)').toBe('draw-order-input');
    const g = await geom(dro);
    expect(g.value).toBe(100);
    await touch.drag(page, { x: g.thumbX, y: g.cy }, { x: g.thumbX - 72, y: g.cy }, { steps: 10 });
    await page.waitForTimeout(250);
    const v = await valueOf(dro);
    const expected = 100 - (72 / g.track) * 100;
    expect(v, 'value after the thumb drag').toBeLessThan(100);
    expect(Math.abs(v - expected), `value ${v} vs ${expected}`).toBeLessThanOrEqual(3);
  });
});

const CANCEL_PROJECTS = ['touch-iphone-portrait', 'touch-ipad-landscape'];

test.describe('TUX-043 sliders: pointercancel after a sideways start', () => {
  test('(m) 8px sideways then 200px straight up: no value change when the panel scrolls; history grows by at most 1', async ({ page }, testInfo) => {
    test.skip(!CANCEL_PROJECTS.includes(testInfo.project.name), 'CDP touch (Chromium) only');
    const loc = await trackSetup(page, { lowish: true });
    await loc.evaluate((el) => { el.value = String((Number(el.min) + Number(el.max)) / 2); });
    const g = await geom(loc);
    const h0 = await histLen(page);
    const st0 = await scrollTopOf(page);
    const dir = g.thumbX + 8 < g.left + g.width - 8 ? 1 : -1;
    const x0 = g.thumbX;
    await touch.touchPhase(page, 'start', [{ x: x0, y: g.cy, id: 0 }]);
    await touch.touchPhase(page, 'move', [{ x: x0 + 8 * dir, y: g.cy - 4, id: 0 }]);
    const y1 = Math.max(10, g.cy - 204);
    for (let i = 1; i <= 12; i += 1) {
      await touch.touchPhase(page, 'move', [{ x: x0 + 8 * dir, y: (g.cy - 4) + ((y1 - (g.cy - 4)) * i) / 12, id: 0 }]);
      await page.waitForTimeout(16);
    }
    await touch.touchPhase(page, 'end', [{ x: x0 + 8 * dir, y: y1, id: 0 }]);
    await page.waitForTimeout(900);
    const scrolled = (await scrollTopOf(page)) !== st0;
    const v = await valueOf(loc);
    const h1 = await histLen(page);
    expect(h1 - h0, 'history growth for one gesture').toBeLessThanOrEqual(1);
    if (scrolled) {
      expect(v, 'value unchanged when the panel scrolled').toBe(g.value);
      expect(h1, 'history unchanged when the panel scrolled').toBe(h0);
    }
  });
});

test.describe('TUX-043 sliders: multi-select strip on short landscape', () => {
  test('(l) with 2 layers selected the status strip and the mask button stay visible and tappable', async ({ page }, testInfo) => {
    test.skip(!IPHL_PROJECTS.includes(testInfo.project.name), 'short-viewport check runs on iPhone landscape');
    await boot(page);
    await page.evaluate(() => {
      const e = window.app.engine;
      const a = e.addLayer('wavetable'); const b = e.addLayer('wavetable');
      window.app.renderer.selectedLayerIds = new Set([a, b]);
      window.app.ui.renderLayers();
    });
    await showRight(page, 'layers');
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const bar = document.getElementById('layer-status-bar');
      const pane = document.getElementById('right-pane');
      const mod = document.getElementById('touch-modifier-bar');
      const btn = bar.querySelector('.mask-btn');
      const b = bar.getBoundingClientRect(); const p = pane.getBoundingClientRect();
      const m = mod ? mod.getBoundingClientRect() : null;
      const br = btn ? btn.getBoundingClientRect() : null;
      const hit = br ? document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2) : null;
      return {
        barH: b.height, barTop: b.top, barBottom: b.bottom, paneTop: p.top, paneBottom: p.bottom,
        modTop: m ? m.top : null, hasBtn: !!btn, hitIsBtn: !!(hit && btn && (hit === btn || btn.contains(hit))),
        label: (bar.querySelector('.lvl-sb-sel-label') || {}).textContent || '',
      };
    });
    expect(r.barH, 'status bar height').toBeGreaterThan(0);
    expect(r.barTop).toBeGreaterThanOrEqual(r.paneTop - 1);
    expect(r.barBottom).toBeLessThanOrEqual(r.paneBottom + 1);
    if (r.modTop !== null) expect(r.barBottom, 'bar above the modifier bar').toBeLessThanOrEqual(r.modTop + 1);
    expect(r.hasBtn, 'mask button present').toBe(true);
    expect(r.hitIsBtn, 'elementFromPoint at the mask button centre returns the button').toBe(true);
    expect(r.label).toMatch(/2 layers selected/);
  });
});

test.describe('TUX-043 sliders: mouse parity', () => {
  test('(j) mouse click jumps the value; dblclick resets a UI.Slider default', async ({ page }, testInfo) => {
    test.skip(!MOUSE_PROJECTS.includes(testInfo.project.name), 'mouse parity runs on iPad landscape');
    const loc = await trackSetup(page);
    const g = await geom(loc);
    const dir = g.thumbX + 80 < g.left + g.width - 8 ? 1 : -1;
    await page.mouse.click(g.thumbX + 80 * dir, g.cy);
    await page.waitForTimeout(250);
    const jumped = await valueOf(loc);
    expect(jumped, 'native track jump for mouse').not.toBe(g.value);
    // dblclick resets to the default on a UI.Slider that has defaultValue.
    await page.evaluate(() => {
      const host = document.createElement('div');
      host.id = 'tux043-reset-host';
      host.style.cssText = 'padding:8px 12px;';
      const target = document.querySelector('#left-pane input.ctrl-slider').closest('.slider-row').parentElement;
      target.insertBefore(host, target.firstChild);
      window.__reset = window.Vectura.UI.Slider(host, { min: 0, max: 100, step: 1, value: 80, defaultValue: 30, ariaLabel: 'tux043 reset' });
      host.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(250);
    const r = page.locator('#tux043-reset-host input[type=range]');
    const rg = await geom(r);
    await page.mouse.dblclick(rg.thumbX, rg.cy);
    await page.waitForTimeout(250);
    expect(await valueOf(r), 'dblclick resets to default').toBe(30);
  });
});
