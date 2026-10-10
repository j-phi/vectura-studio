const { test, expect } = require('@playwright/test');
const { tap, longPress, touchPhase, engineSupports } = require('../helpers/touch');

// TUX-039: a 500 ms touch hold on an icon-only button shows its name; the lift does not
// activate it; a quick tap still does. Mouse pointers never tip.
// Hand is the plain target. On phones Hand lives in the All Tools drawer (no rail button),
// so the spec falls back to Direct Selection, which is also a plain rail button.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const setup = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  await page.evaluate(() => window.app.ui.setActiveTool('select'));
};

// A rail button is "reachable" when it is the top element at its centre. On iPadP and iPhL the
// open left pane covers part of the rail (shell lane); the spec then collapses that pane first.
const reachableTools = async (page, group, min = 1) => {
  const pick = () => page.evaluate((g) => [...document.querySelectorAll('.tool-btn[data-tool]')]
    .filter((e) => !['select', 'algo-draw', 'light-source'].includes(e.dataset.tool))
    .filter((e) => (g === 'variant') === e.hasAttribute('data-has-submenu'))
    .filter((e) => {
      if (e.offsetParent === null) return false;
      const r = e.getBoundingClientRect();
      const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!h && (h === e || e.contains(h));
    })
    .map((e) => e.dataset.tool), group);
  let list = await pick();
  if (list.length < min) {
    await page.evaluate(() => { const b = document.getElementById('btn-pane-toggle-left'); if (b) b.click(); });
    await sleep(800);
    list = await pick();
  }
  const words = { hand: 'Hand', direct: 'Direct', lasso: 'Direct', type: 'Type', shape: 'Shape', pen: 'Pen', fill: 'Fill', scissor: 'Scissor' };
  return list.map((tool) => ({ tool, word: words[tool] || tool, sel: `.tool-btn[data-tool="${tool}"]` }));
};

const plainTarget = async (page) => {
  const list = await reachableTools(page, 'plain');
  if (!list.length) throw new Error('no reachable plain tool button');
  return list.find((t) => t.tool === 'hand') || list[0];
};

const plainPair = async (page) => {
  const list = await reachableTools(page, 'plain', 2);
  if (list.length < 2) throw new Error('need two reachable plain tool buttons');
  return list.slice(0, 2);
};

const centre = async (page, sel) => {
  const b = await page.locator(sel).first().boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

const tipFor = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  const id = el && el.getAttribute('aria-describedby');
  const tip = id && document.getElementById(id);
  if (!tip || tip.getAttribute('role') !== 'tooltip') return null;
  const cs = getComputedStyle(tip);
  const r = tip.getBoundingClientRect();
  if (cs.visibility === 'hidden' || r.width === 0) return null;
  return { text: tip.textContent, rect: { l: r.left, t: r.top, r: r.right, b: r.bottom } };
}, sel);

const anyTip = (page) => page.evaluate(() => [...document.querySelectorAll('[role=tooltip]')]
  .filter((t) => t.classList.contains('vectura-tooltip') && getComputedStyle(t).visibility !== 'hidden' && t.getBoundingClientRect().width > 0).length);

const activeTool = (page) => page.evaluate(() => window.app.ui.activeTool);

// WebKit synthetic touch has no compat click; replay the one a real tap-lift would send.
const compatClick = async (page, sel) => {
  if (engineSupports(page, 'nativeDefaultActions')) return;
  await page.evaluate((s) => document.querySelector(s).click(), sel);
};

// Holds a touch on the button for 600 ms, samples whether a sub-menu is open while the
// finger is still down, then lifts. Returns { openDuringHold }.
const longPressOpen = async (page, p) => {
  let openDuringHold = false;
  await Promise.all([
    longPress(page, p, 600),
    (async () => {
      for (let t = 0; t < 540 && !openDuringHold; t += 60) {
        await sleep(60);
        openDuringHold = await page.evaluate(() => !!document.querySelector('.tool-submenu.open'));
      }
    })(),
  ]);
  return { openDuringHold };
};

const paneOpen = (page) => page.evaluate(() => {
  const p = document.getElementById('right-pane');
  if (!p) return false;
  const r = p.getBoundingClientRect();
  const cs = getComputedStyle(p);
  return r.width > 100 && r.right > 0 && r.left < innerWidth && cs.visibility !== 'hidden' && cs.display !== 'none';
});

const openLayersPane = async (page) => {
  if (await paneOpen(page)) return;
  for (const id of ['btn-pane-toggle-right', 'btn-mobile-pane-right']) {
    // Programmatic click: on iPhP the All Tools button sits over #btn-pane-toggle-right (shell lane).
    if (await page.evaluate((i) => { const e = document.getElementById(i); if (!e || e.offsetParent === null) return false; e.click(); return true; }, id)) {
      await sleep(350);
      if (await paneOpen(page)) return;
    }
  }
  await page.evaluate(() => {
    const pane = document.getElementById('right-pane');
    if (document.body.classList.contains('auto-collapsed')) pane.classList.add('pane-force-open');
    else pane.classList.remove('pane-collapsed');
  });
  await sleep(350);
};

test.describe('TUX-039 touch tooltips', () => {
  test.beforeEach(async ({ page }) => { await setup(page); });

  test('(a) hold on a plain icon button shows its name and does not activate it', async ({ page }) => {
    const t = await plainTarget(page);
    const p = await centre(page, t.sel);
    await touchPhase(page, 'start', [{ ...p, id: 0 }]);
    await sleep(250);
    expect(await page.locator('[data-touch-hold-progress]').first().isVisible(), 'progress ring at 250 ms').toBe(true);
    await sleep(350);
    const during = await tipFor(page, t.sel);
    expect(during, 'tooltip (by aria-describedby) while the finger is down at 600 ms').not.toBeNull();
    await touchPhase(page, 'end', [{ ...p, id: 0 }]);
    await compatClick(page, t.sel);
    await sleep(80);
    const after = await tipFor(page, t.sel);
    expect(after, 'tooltip still visible after the lift').not.toBeNull();
    expect(after.text).toContain(t.word);
    expect(after.text, 'shortcut suffix is stripped').not.toMatch(/\([^)]*\)\s*$/);
    expect(await activeTool(page), 'lift must not activate the tool').toBe('select');
    const vp = page.viewportSize();
    const r = after.rect;
    expect(r.l).toBeGreaterThanOrEqual(0);
    expect(r.t).toBeGreaterThanOrEqual(0);
    expect(r.r).toBeLessThanOrEqual(vp.width);
    expect(r.b).toBeLessThanOrEqual(vp.height);
    const dx = Math.max(r.l - p.x, 0, p.x - r.r);
    const dy = Math.max(r.t - p.y, 0, p.y - r.b);
    expect(Math.hypot(dx, dy), 'clear of a 22 px disc around the finger').toBeGreaterThanOrEqual(22);
  });

  test('(b) tooltip hides after 1.5 s and on the next touch', async ({ page }) => {
    const t = await plainTarget(page);
    await longPress(page, await centre(page, t.sel), 600);
    await compatClick(page, t.sel);
    await sleep(100);
    expect(await tipFor(page, t.sel)).not.toBeNull();
    await sleep(1700);
    expect(await tipFor(page, t.sel), 'hidden 1.7 s after the lift').toBeNull();

    await longPress(page, await centre(page, t.sel), 600);
    await compatClick(page, t.sel);
    await sleep(100);
    expect(await tipFor(page, t.sel)).not.toBeNull();
    const empty = await page.evaluate(() => {
      const r = document.getElementById('main-canvas').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await tap(page, empty);
    await sleep(120);
    expect(await anyTip(page), 'a tap elsewhere hides the tooltip at once').toBe(0);
  });

  test('(c) a quick tap still activates and shows no tooltip', async ({ page }) => {
    const t = await plainTarget(page);
    await tap(page, page.locator(t.sel).first());
    await sleep(150);
    expect(await activeTool(page)).toBe(t.tool);
    expect(await anyTip(page)).toBe(0);
  });

  test('(d) moving past the slop cancels the hold', async ({ page }) => {
    const t = await plainTarget(page);
    const p = await centre(page, t.sel);
    await touchPhase(page, 'start', [{ ...p, id: 0 }]);
    await sleep(200);
    await touchPhase(page, 'move', [{ x: p.x + 15, y: p.y, id: 0 }]);
    await sleep(400);
    await touchPhase(page, 'end', [{ x: p.x + 15, y: p.y, id: 0 }]);
    await sleep(100);
    expect(await anyTip(page)).toBe(0);
  });

  test('(e) variant tool keeps its own hold menu and no tooltip (regression guard)', async ({ page }) => {
    const v = (await reachableTools(page, 'variant'))[0];
    expect(v, 'a reachable variant tool button').toBeTruthy();
    const sel = v.sel;
    const p = await centre(page, sel);
    await touchPhase(page, 'start', [{ ...p, id: 0 }]);
    await sleep(600);
    const open = await page.evaluate(() => [...document.querySelectorAll('.tool-submenu.open')]
      .some((m) => /subtools/.test(m.getAttribute('aria-label') || '') && m.getBoundingClientRect().width > 0));
    expect(open, `${v.tool} variant menu visible during the hold`).toBe(true);
    expect(await anyTip(page), 'no touch tooltip on a variant tool').toBe(0);
    await touchPhase(page, 'end', [{ ...p, id: 0 }]);
  });

  test('(f) non-toolbar icon buttons tip; innermost owner wins; history unchanged', async ({ page }) => {
    await page.evaluate(() => { window.app.engine.addLayer('flowfield'); window.app.ui.renderLayers(); });
    await openLayersPane(page);
    await page.evaluate(() => window.app.ui.renderLayers());
    const hist = () => page.evaluate(() => window.app.history.length);
    const h0 = await hist();

    // On phones the All Tools drawer can cover the filter button; only a reachable button is held.
    const filterVisible = await page.evaluate(() => {
      const e = document.getElementById('layer-filter-btn');
      if (!e) return false;
      const r = e.getBoundingClientRect();
      if (r.width === 0) return false;
      const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!h && (h === e || e.contains(h));
    });
    if (filterVisible) {
      await longPress(page, await centre(page, '#layer-filter-btn'), 600);
      await compatClick(page, '#layer-filter-btn');
      await sleep(100);
      const tip = await tipFor(page, '#layer-filter-btn');
      const dbg = await page.evaluate(() => {
        const e = document.getElementById('layer-filter-btn');
        const r = e.getBoundingClientRect();
        const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return `rect ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} hit=${h && (h.id || h.className)} describedby=${e.getAttribute('aria-describedby')}`;
      });
      expect(tip, `tooltip on #layer-filter-btn (${dbg})`).not.toBeNull();
      expect(tip.text).toContain('Filter by type');
      expect(await page.locator('#layer-filter-menu').isHidden()).toBe(true);
      expect(await page.evaluate(() => [...document.querySelectorAll('.menu-dropdown')].filter((m) => m.classList.contains('open')).length), 'filter dropdown closed').toBe(0);
      await sleep(1700);
    }

    const cardBtn = '.lvl-card button[aria-label]';
    expect(await page.locator(cardBtn).count()).toBeGreaterThan(0);
    const first = page.locator(cardBtn).first();
    await first.evaluate((e) => e.setAttribute('data-test-hold', '1'));
    await longPress(page, await centre(page, '[data-test-hold="1"]'), 600);
    await compatClick(page, '[data-test-hold="1"]');
    await sleep(100);
    const dbg2 = await page.evaluate(() => {
      const e = document.querySelector('[data-test-hold="1"]');
      const r = e.getBoundingClientRect();
      const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return `rect ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} hit=${h && (h.id || h.className)} label=${e.getAttribute('aria-label')}`;
    });
    expect(await tipFor(page, '[data-test-hold="1"]'), `tooltip on a layer-card icon button (${dbg2})`).not.toBeNull();
    const surfaces = await page.evaluate(() => [...document.querySelectorAll('.menu-dropdown')]
      .filter((m) => m.classList.contains('open') || getComputedStyle(m).visibility !== 'hidden' && m.getBoundingClientRect().width > 0).length);
    expect(surfaces, 'no layer context menu beside the tooltip').toBe(0);
    expect(await hist(), 'undo history unchanged').toBe(h0);
  });

  test('(g) clause 1 runtime ratchet: icon-only controls have names (layer + modifier rows present)', async ({ page }) => {
    await page.evaluate(() => {
      window.app.engine.addLayer('flowfield');
      window.app.engine.addModifierLayer('mirror');
      window.app.ui.renderLayers();
    });
    await openLayersPane(page);
    await page.evaluate(() => window.app.ui.renderLayers());
    const r = await page.evaluate(() => {
      const subs = document.querySelectorAll('.tool-sub-btn:not([aria-label])').length;
      const vis = (e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden'; };
      const unlabeled = [...document.querySelectorAll('button')].filter((b) => {
        if (!vis(b)) return false;
        const hasText = [...b.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        return !hasText && !b.hasAttribute('aria-label') && !b.hasAttribute('aria-labelledby');
      }).map((b) => b.id || b.className);
      return { subs, unlabeled, lvlIb: document.querySelectorAll('.lvl-ib').length };
    });
    expect(r.lvlIb, 'layer rows with eye/lock buttons are present').toBeGreaterThan(1);
    expect(r.subs, '.tool-sub-btn without aria-label').toBe(0);
    expect(r.unlabeled, `unlabeled visible icon buttons: ${r.unlabeled.join(',')}`).toEqual([]);

    // Selected-layer surfaces: context-bar pen chip + the Transform W/H link button (closed section by default).
    await page.evaluate(() => {
      const l = window.app.engine.layers.find((x) => !x.isGroup && !x.isModifier && x.type === 'flowfield') || window.app.engine.layers.find((x) => !x.isGroup);
      window.app.renderer.selectLayer(l.id);
      const h = document.getElementById('algorithm-transform-header');
      if (h && h.getAttribute('aria-expanded') !== 'true') h.click();
    });
    await sleep(500);
    const sel = await page.evaluate(() => {
      const vis = (e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden'; };
      const chip = [...document.querySelectorAll('.pen-chip')].find(vis) || null;
      if (chip) chip.setAttribute('data-test-chip', '1');
      const unlabeled = [...document.querySelectorAll('button')].filter((b) => {
        if (!vis(b)) return false;
        const hasText = [...b.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        return !hasText && !b.hasAttribute('aria-label') && !b.hasAttribute('aria-labelledby');
      }).map((b) => b.id || b.className);
      const link = document.getElementById('tk-link');
      return { chip: !!chip, link: !!link, linkVisible: !!link && vis(link), linkLabel: link && link.getAttribute('aria-label'), unlabeled };
    });
    const tablet = page.viewportSize().width >= 768;
    // Phones keep the pen chip inside the collapsed context bar; tablets must show it.
    if (tablet) expect(sel.chip, 'a visible .pen-chip with a layer selected').toBe(true);
    expect(sel.unlabeled, `unlabeled visible icon buttons with a layer selected: ${sel.unlabeled.join(',')}`).toEqual([]);
    expect(sel.link, '#tk-link exists').toBe(true);
    expect(sel.linkLabel, '#tk-link aria-label (also when hidden)').toBeTruthy();
    if (!sel.chip) return;
    // Tablet drawer layouts (shell lane, TUX-008) put a modal backdrop over the canvas and the
    // context bar while a pane is open. Close the drawer the way a user would before holding the chip.
    await page.evaluate(() => {
      const b = document.getElementById('mobile-pane-backdrop');
      if (b && b.classList.contains('visible')) b.click();
    });
    await sleep(400);
    const cc = await page.evaluate(() => {
      const c = document.querySelector('[data-test-chip="1"]');
      const r = c.getBoundingClientRect();
      const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, top: !!h && (h === c || c.contains(h)) };
    });
    expect(cc.top, 'pen chip is the top element at its centre').toBe(true);
    await longPress(page, { x: cc.x, y: cc.y }, 600);
    await compatClick(page, '[data-test-chip="1"]');
    await sleep(100);
    const tip = await tipFor(page, '[data-test-chip="1"]');
    expect(tip, 'hold on .pen-chip shows a tooltip').not.toBeNull();
    expect(tip.text, 'pen chip tip has touch wording').not.toMatch(/click/i);
    expect(tip.text.length, 'pen chip tip is short').toBeLessThanOrEqual(40);
    const picker = await page.evaluate(() => {
      const pop = document.querySelector('.pen-pick-pop');
      if (!pop) return false;
      const r = pop.getBoundingClientRect();
      return getComputedStyle(pop).visibility !== 'hidden' && !pop.classList.contains('hidden') && r.width > 0;
    });
    expect(picker, 'pen picker stays closed after the hold').toBe(false);
  });

  test('(i) hold on a layer eye button names it and does not toggle visibility', async ({ page }) => {
    await page.evaluate(() => { window.app.engine.addLayer('flowfield'); window.app.ui.renderLayers(); });
    await openLayersPane(page);
    await page.evaluate(() => window.app.ui.renderLayers());
    const id = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.lvl-card .lvl-ib')].find((e) => e.getAttribute('aria-label') === 'Hide');
      if (!b) return null;
      b.setAttribute('data-test-hold', '1');
      return window.app.engine.layers.find((l) => l.visible && !l.isGroup)?.id;
    });
    expect(id, 'a visible layer row with a Hide button (aria-label)').not.toBeNull();
    await longPress(page, await centre(page, '[data-test-hold="1"]'), 600);
    await compatClick(page, '[data-test-hold="1"]');
    await sleep(100);
    const tip = await tipFor(page, '[data-test-hold="1"]');
    expect(tip, 'tooltip on the eye button').not.toBeNull();
    expect(tip.text).toContain('Hide');
    expect(await page.evaluate((i) => window.app.engine.layers.find((l) => l.id === i).visible, id), 'layer.visible unchanged').toBe(true);
  });

  test('(j) phone modifier buttons (glyph only) tip; labelled modifier buttons do not', async ({ page }) => {
    const info = await page.evaluate(() => {
      const b = document.querySelector('.touch-mod-btn[data-touch-mod="shift"]');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      const label = b.querySelector('.touch-mod-label');
      return { shown: r.width > 0, labelShown: !!label && getComputedStyle(label).display !== 'none' };
    });
    expect(info && info.shown, 'modifier bar is visible').toBe(true);
    expect(info.labelShown, 'label hidden exactly on phone-width viewports').toBe(page.viewportSize().width > 540);
    const sel = '.touch-mod-btn[data-touch-mod="shift"]';
    await longPress(page, await centre(page, sel), 600);
    await compatClick(page, sel);
    await sleep(100);
    const tip = await tipFor(page, sel);
    if (info.labelShown) {
      expect(tip, 'visible text label: no tooltip').toBeNull();
    } else {
      expect(tip, 'glyph-only button: tooltip').not.toBeNull();
      expect(tip.text).toContain('Shift');
      expect(await page.evaluate(() => window.Vectura.SETTINGS.touchModifiers.shift), 'hold must not toggle the modifier').toBe(false);
    }
  });

  test('(h) desktop parity: a mouse hold never tips and the swallow does not eat mouse clicks', async ({ page }) => {
    const [t, other] = await plainPair(page);
    const p = await centre(page, t.sel);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await sleep(600);
    await page.mouse.up();
    await sleep(100);
    expect(await activeTool(page)).toBe(t.tool);
    expect(await anyTip(page)).toBe(0);

    await page.evaluate(() => window.app.ui.setActiveTool('select'));
    await longPress(page, await centre(page, t.sel), 600);
    await compatClick(page, t.sel);
    await sleep(100);
    expect(await activeTool(page), `hold did not activate ${t.tool}`).toBe('select');
    const l = await centre(page, other.sel);
    await page.mouse.click(l.x, l.y);
    await sleep(100);
    expect(await activeTool(page), 'mouse click right after a touch hold is not swallowed').toBe(other.tool);
  });
});

// TUX-039 clauses 2 and 3 on variant tools. Needs the TUX-014 sub-menu rework in toolbar.js
// (menu stays open after lift, rows show visible names). Owned by the TUX-014 lane.
// Ratchet: every precondition is asserted BEFORE test.fail(), so only the clause-2/3
// assertions (open after lift, visible labels, tool unchanged) can be the expected failure.
test.describe('TUX-039 variant tool hold (needs TUX-014)', () => {
  for (const tool of ['shape', 'pen', 'fill']) {
    test(`hold ${tool} keeps a labelled sub-menu open and leaves the tool unchanged`, async ({ page }) => {
      await setup(page);
      const sel = `.tool-btn[data-tool="${tool}"]`;
      const probe = () => page.evaluate((s) => {
        const b = document.querySelector(s);
        if (!b) return null;
        const r = b.getBoundingClientRect();
        const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return r.width > 0 && h && (h === b || b.contains(h)) ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
      }, sel);
      // Precondition 1: the button exists and is reachable. A pane may cover the rail
      // (iPadP / iPhL / phones); collapse it first, as reachableTools does. No skip.
      expect(await page.locator(sel).count(), `${tool} button exists`).toBe(1);
      let box = await probe();
      if (!box) {
        await page.evaluate(() => { const b = document.getElementById('btn-pane-toggle-left'); if (b) b.click(); });
        await sleep(800);
        box = await probe();
      }
      expect(box, `${tool} reachable on the rail at this viewport`).not.toBeNull();
      // Precondition 2: baseline tool is select.
      expect(await activeTool(page), 'baseline activeTool').toBe('select');
      // Precondition 3: the menu opens during the hold (finger still down).
      const hold = await longPressOpen(page, box);
      expect(hold.openDuringHold, 'sub-menu opens during the hold').toBe(true);
      // Only the clause-2/3 assertions below may fail until TUX-014 lands. Remove this line then
      // (Playwright reports "expected to fail but passed" once TUX-014 makes it green).
      test.fail(true, 'blocked on TUX-014: sub-menu closes on lift, rows are icon-only');
      await sleep(150);
      const st = await page.evaluate(() => {
        const m = [...document.querySelectorAll('.tool-submenu.open')][0];
        const labels = m ? [...m.querySelectorAll('.tool-sub-btn')].map((b) => (b.innerText || '').trim()).filter(Boolean) : [];
        return { open: !!m, labels, active: window.app.ui.activeTool };
      });
      expect(st.open, 'sub-menu stays open after lift').toBe(true);
      expect(st.labels.length, 'rows show visible text labels').toBeGreaterThan(0);
      if (tool === 'shape') expect(st.labels.join('|')).toMatch(/Rectangle/);
      expect(st.active, 'tool unchanged after lift').toBe('select');
    });
  }
});
