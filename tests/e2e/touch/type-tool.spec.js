const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-028: Type tool opens the soft keyboard. Finger-only (no mouse). The hidden
// proxy textarea is selected by [data-text-proxy] only, never a generic selector.
const PROXY = '[data-text-proxy]';

const layerText = (page) => page.evaluate(() => {
  const l = window.app.engine.getActiveLayer();
  return l && l.params ? l.params.text : null;
});
const textState = (page) => page.evaluate(() => {
  const l = window.app.engine.getActiveLayer();
  return { text: l ? l.params.text : null, caret: window.app.textEdit.getCaretIndex(), active: window.app.textEdit.isActive() };
});

// First point of a 7x7 grid over #main-canvas that really hits the canvas.
const canvasPoint = (page) => page.evaluate(() => {
  const c = document.getElementById('main-canvas');
  const r = c.getBoundingClientRect();
  for (let j = 1; j <= 7; j += 1) {
    for (let i = 1; i <= 7; i += 1) {
      const x = r.left + (r.width * i) / 8;
      const y = r.top + (r.height * j) / 8;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      if (document.elementFromPoint(x, y) === c) return { x, y };
    }
  }
  return null;
});

// Screen point over the first glyph of the active text layer that really hits the
// canvas (the context bar can float over the layer on short viewports).
const glyphPoint = async (page, selectHit = true) => {
  await page.waitForTimeout(250); // let the context bar settle before probing
  const pt = await page.evaluate((selectHit) => {
    const l = window.app.engine.getActiveLayer();
    const q = l.glyphs[0].quad;
    const r = document.getElementById('main-canvas').getBoundingClientRect();
    const c = document.getElementById('main-canvas');
    const xs = q.map((p) => p.x); const ys = q.map((p) => p.y);
    const x0 = Math.min(...xs); const x1 = Math.max(...xs); const y0 = Math.min(...ys); const y1 = Math.max(...ys);
    const cand = [];
    const N = 9;
    for (let j = 0; j < N; j += 1) for (let i = 0; i < N; i += 1) cand.push([i, j]);
    const mid = (N - 1) / 2;
    cand.sort((a, b) => (Math.abs(a[0] - mid) + Math.abs(a[1] - mid)) - (Math.abs(b[0] - mid) + Math.abs(b[1] - mid)));
    for (const [i, j] of cand) {
      const w = { x: x0 + ((x1 - x0) * (i + 0.5)) / N, y: y0 + ((y1 - y0) * (j + 0.5)) / N };
      const s = window.app.renderer.worldToScreen(w.x, w.y);
      const x = r.left + s.x; const y = r.top + s.y;
      const hit = window.app.renderer.findLayerAtPoint(w);
      if ((!selectHit || (hit && hit.id === l.id)) && document.elementFromPoint(x, y) === c) return { x, y };
    }
    return null;
  }, selectHit);
  if (!pt) throw new Error('no reachable text-layer point (TUX-007 layout dependency)');
  return pt;
};

// Tap a tool button with a finger. When the button is covered by another panel
// (TUX-007 layout dependency: on iPadP the Select button sits under the left
// panel), fall back to the app's own tool API so the test still exercises the
// session lifecycle rather than the toolbar layout.
const switchTool = async (page, tool) => {
  const btn = page.locator(`.tool-btn[data-tool="${tool}"]`);
  const reachable = await btn.evaluate((b) => {
    const r = b.getBoundingClientRect();
    const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!e && (e === b || b.contains(e));
  });
  if (reachable) await touch.tap(page, btn);
  // Renderer draw can throw IndexSizeError (arc radius < 0) on a tiny canvas after the
  // tool change (iPhL, renderer.js, outside TUX-028); the tool state is already set.
  else await page.evaluate((t) => { try { window.app.ui.setActiveTool(t); } catch (_) { /* see above */ } }, tool);
};

const openSession = async (page) => {
  await touch.tap(page, page.locator('.tool-btn[data-tool="type"]'));
  const pt = await canvasPoint(page);
  if (!pt) throw new Error('no reachable canvas point (TUX-007 layout dependency)');
  await touch.tap(page, pt);
  return pt;
};

test.describe('TUX-028 Type tool soft keyboard', () => {
  // TUX-007 landed: the iPhL-chrome expected-fail mark (covered canvas) is gone.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__focusLog = [];
      const orig = HTMLElement.prototype.focus;
      HTMLElement.prototype.focus = function focus(...args) {
        window.__focusLog.push({
          tag: this.tagName,
          hasProxyAttr: this.hasAttribute('data-text-proxy'),
          evtType: window.event ? window.event.type : null,
        });
        return orig.apply(this, args);
      };
    });
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.textEdit));
  });

  test('(a) tap focuses the hidden proxy in-gesture, 16px, no scroll, invisible', async ({ page }) => {
    await touch.tap(page, page.locator('.tool-btn[data-tool="type"]'));
    const pt = await canvasPoint(page);
    expect(pt, 'no reachable canvas point (TUX-007 layout dependency)').toBeTruthy();
    const before = await page.evaluate(() => ({ sx: scrollX, sy: scrollY, vx: visualViewport.offsetLeft, vy: visualViewport.offsetTop }));
    await touch.tap(page, pt);
    const info = await page.evaluate((sel) => {
      const el = document.activeElement;
      const proxy = document.querySelector(sel);
      const cr = document.getElementById('main-canvas').getBoundingClientRect();
      const pr = proxy ? proxy.getBoundingClientRect() : null;
      return {
        activeDesc: el ? `${el.tagName}${el.className ? `.${String(el.className).split(' ')[0]}` : ''}` : null,
        matches: !!(el && el.matches && el.matches(sel)),
        tag: el && el.tagName,
        fontSize: el ? parseFloat(getComputedStyle(el).fontSize) : 0,
        inputmode: el && el.getAttribute('inputmode'),
        autocapitalize: el && el.getAttribute('autocapitalize'),
        autocorrect: el && el.getAttribute('autocorrect'),
        active: window.app.textEdit.isActive(),
        log: window.__focusLog.filter((f) => f.hasProxyAttr),
        sx: scrollX, sy: scrollY, vx: visualViewport.offsetLeft, vy: visualViewport.offsetTop,
        inside: !!pr && pr.left >= cr.left - 1 && pr.top >= cr.top - 1 && pr.right <= cr.right + 1 && pr.bottom <= cr.bottom + 1,
        visible: proxy ? proxy.checkVisibility({ opacityProperty: true }) : null,
      };
    }, PROXY);
    expect(info.matches, `activeElement is ${info.activeDesc}, expected ${PROXY}`).toBe(true);
    expect(info.tag).toBe('TEXTAREA');
    expect(info.fontSize).toBeGreaterThanOrEqual(16);
    expect(info.inputmode).toBe('text');
    expect(info.autocapitalize).toBe('off');
    expect(info.autocorrect).toBe('off');
    expect(info.active).toBe(true);
    expect(info.log.length).toBeGreaterThan(0);
    expect(['pointerdown', 'pointerup', 'touchend', 'touchstart', 'click']).toContain(info.log[0].evtType);
    expect(Math.abs(info.sx - before.sx)).toBeLessThanOrEqual(1);
    expect(Math.abs(info.sy - before.sy)).toBeLessThanOrEqual(1);
    expect(Math.abs(info.vx - before.vx)).toBeLessThanOrEqual(1);
    expect(Math.abs(info.vy - before.vy)).toBeLessThanOrEqual(1);
    expect(info.inside).toBe(true);
    expect(info.visible).toBe(false);
  });

  test('(b)-(e) soft-keyboard input: insert, type, backspace, enter, emoji', async ({ page }) => {
    await openSession(page);
    await page.keyboard.insertText('Hi');
    expect(await layerText(page)).toBe('Hi');
    await page.keyboard.type('Yo');
    expect(await layerText(page)).toBe('HiYo');
    await page.keyboard.press('Backspace');
    expect(await layerText(page)).toBe('HiY');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('Z');
    expect(await layerText(page)).toBe('HiY\nZ');
    await page.keyboard.insertText('\u{1F44D}');
    const s = await textState(page);
    expect(s.text).toBe('HiY\nZ\u{1F44D}');
    expect(s.caret).toBe(s.text.length);
  });

  test('(f) IME composition commits once', async ({ page }) => {
    await openSession(page);
    await page.keyboard.insertText('A');
    if (touch.engineSupports(page, 'cdp')) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.imeSetComposition', { text: 'か', selectionStart: 1, selectionEnd: 1 });
      await cdp.send('Input.insertText', { text: '漢' });
    } else {
      await page.evaluate(() => {
        const p = document.querySelector('[data-text-proxy]');
        p.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
        const base = p.value;
        p.value = `${base}か`;
        p.setSelectionRange(p.value.length, p.value.length);
        p.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: 'か', isComposing: true }));
        p.value = `${base}漢`;
        p.setSelectionRange(p.value.length, p.value.length);
        p.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '漢' }));
        p.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: '漢', isComposing: false }));
      });
    }
    const t = await layerText(page);
    expect(t).toBe('A漢');
    expect(t.split('漢').length - 1).toBe(1);
  });

  test('(g) tapping the Select tool ends the session and blurs the proxy', async ({ page }) => {
    await openSession(page);
    await page.keyboard.insertText('Hi');
    await switchTool(page, 'select');
    const s = await page.evaluate((sel) => ({
      onProxy: !!(document.activeElement && document.activeElement.matches(sel)),
      active: window.app.textEdit.isActive(),
    }), PROXY);
    expect(s.onProxy).toBe(false);
    expect(s.active).toBe(false);
  });

  test('(h) Select double-tap on a text layer focuses the proxy', async ({ page }, testInfo) => {
    await openSession(page);
    await page.keyboard.insertText('Hi');
    await switchTool(page, 'select');
    expect(await page.evaluate(() => window.app.textEdit.isActive())).toBe(false);
    const g = await glyphPoint(page);
    // Wider double-tap drift tolerance is TUX-023; 5 px apart here.
    await touch.tap(page, g);
    // The first tap selects the layer and the context bar may then float over it.
    const covered = await page.evaluate(({ x, y }) => document.elementFromPoint(x + 5, y) !== document.getElementById('main-canvas'), g);
    if (covered) throw new Error('second tap point covered after selection (TUX-007/TUX-030 layout dependency)');
    await touch.tap(page, { x: g.x + 5, y: g.y });
    const s = await page.evaluate((sel) => ({
      onProxy: !!(document.activeElement && document.activeElement.matches(sel)),
      active: window.app.textEdit.isActive(),
    }), PROXY);
    expect(s.active).toBe(true);
    expect(s.onProxy).toBe(true);
  });

  test('(i) blur keeps the session; tapping the text with Type refocuses', async ({ page }) => {
    await openSession(page);
    await page.keyboard.insertText('Hi');
    await page.evaluate((sel) => document.querySelector(sel).blur(), PROXY);
    expect(await page.evaluate(() => window.app.textEdit.isActive())).toBe(true);
    const g = await glyphPoint(page, false);
    await touch.tap(page, g);
    const onProxy = await page.evaluate((sel) => !!(document.activeElement && document.activeElement.matches(sel)), PROXY);
    expect(onProxy).toBe(true);
  });

  test('(j) gated layer: input is rejected and the proxy resyncs', async ({ page }) => {
    await openSession(page);
    await page.keyboard.insertText('abc');
    await page.evaluate(() => {
      const l = window.app.engine.getActiveLayer();
      // Web faces are only mutable with ligatures off (canMutate); turning them
      // back on mid-session gates mutation while the session stays active.
      l.params.otLigatures = true;
    });
    await page.keyboard.insertText('Q');
    const s = await page.evaluate((sel) => ({
      text: window.app.engine.getActiveLayer().params.text,
      value: document.querySelector(sel).value,
    }), PROXY);
    expect(s.text).toBe('abc');
    expect(s.value).toBe('abc');
  });

  test('(k) undo chord with the proxy focused ends the session and undoes exactly once', async ({ page }) => {
    await openSession(page);
    await page.keyboard.insertText('Hi');
    const before = await page.evaluate(() => window.app.history.length);
    await page.keyboard.press('Control+z');
    const s = await page.evaluate((sel) => ({
      active: window.app.textEdit.isActive(),
      h: window.app.history.length,
      onProxy: !!(document.activeElement && document.activeElement.matches(sel)),
    }), PROXY);
    expect(s.active).toBe(false);
    expect(s.onProxy).toBe(false);
    expect(s.h).toBe(before - 1);
  });

  test('(l) app chord (Ctrl/Cmd+S) reaches the app and is default-prevented with the proxy focused', async ({ page }) => {
    await openSession(page);
    await page.keyboard.insertText('Hi');
    await page.evaluate((sel) => {
      window.__chords = [];
      const orig = window.app.ui.triggerTopMenuAction;
      window.app.ui.triggerTopMenuAction = function trigger(id) { window.__chords.push(id); return true; };
      window.__origTrigger = orig;
      window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 's') window.__chordPrevented = e.defaultPrevented;
      }, true);
      if (!document.activeElement || !document.activeElement.matches(sel)) throw new Error('proxy not focused');
    }, PROXY);
    await page.keyboard.press('ControlOrMeta+s');
    const r = await page.evaluate(() => ({
      chords: window.__chords, prevented: window.__chordPrevented, active: window.app.textEdit.isActive(),
      text: window.app.engine.getActiveLayer().params.text,
    }));
    expect(r.chords).toEqual(['btn-save-vectura']);
    expect(r.prevented).toBe(true);
    expect(r.text).toBe('Hi');
  });
});
