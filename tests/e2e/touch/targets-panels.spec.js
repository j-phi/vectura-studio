const { evidenceDir, shoot } = require('../helpers/evidence');
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const core = require('../helpers/target-audit-core');
const touch = require('../helpers/touch');
const sweep = require('../helpers/target-sweep');
const { STATES } = require('./target-audit-states');

// TUX-041 batch B4 (side panels), strict slice. Every interactive target in the left pane (algorithm params, noise rack,
// modifiers, fill controls, text panel), the right pane (layers, pens) and their popups has a hit area of at least 44 x 44 CSS
// px on every touch project. hitArea() counts ::before extensions and returns what elementFromPoint really resolves to, so an
// extension that a neighbour covers does not count. Each target's centre must also resolve to itself.
// Scene3D, the Petal Designer and the Pattern designer (it reuses the Petal toolbar) belong to batch B5 and are not enumerated here.
// Screenshots go to test-results/evidence/B4/ (with VECTURA_E2E_EVIDENCE=1).
const MIN = 44;
const EVIDENCE = evidenceDir('B4');
const shot = async (page, name) => { fs.mkdirSync(EVIDENCE, { recursive: true }); await shoot(page, { path: path.join(EVIDENCE, `${name}.png`), scale: 'css' }); };
const TARGETS = 'button, input, select, textarea, summary, a[href], [role="button"], [role="tab"], [role="radio"], [role="option"], [role^="menuitem"], [tabindex="0"], label.sw-toggle, .lvl-algo-sub-item';
// Popups come first: a popup inside a pane is its own surface, so a pane row it covers is not stolen from a neighbour.
const POPUPS = ['#gm-module-menu', '#layer-add-menu', '.vtp-fontpick-pop', '.hg-preset-popover', '.lvl-ctx-menu', '.palette-menu', '[role="menu"]'];
// Every generator the left-pane picker offers, minus batch B5 (Petalis Designer, Scene3D, Pattern), plus the Text layer.
const ALGO_TYPES = ['attractor', 'boids', 'flowfield', 'grid', 'harmonograph', 'hyphae', 'lissajous', 'pendula', 'phylla', 'rainfall', 'rings',
  'shapePack', 'spiral', 'spirograph', 'svgDistort', 'topo', 'wavetable', 'polyhedron', 'rasterPlane', 'spiralizer', 'terrain', 'topoform',
  'halftone', 'imageWeave', 'text'];
const ROOTS = ['#gm-module-menu', '#layer-add-menu', '.vtp-fontpick-pop', '.hg-preset-popover', '.lvl-ctx-menu', '.palette-menu', '[role="menu"]', '#left-pane', '#right-pane', '#bottom-pane'];

async function boot(page, baseURL) {
  await core.bootApp(page, baseURL);
  await page.evaluate(() => {
    const { engine, ui } = window.app;
    if (!engine.layers.length) engine.addLayer('wavetable');
    if (ui.renderLayers) ui.renderLayers();
    if (ui.buildControls) ui.buildControls();
  });
}

const runState = async (page, id) => {
  const st = STATES.find((s) => s.id === id);
  await st.run(page);
  await expect.poll(() => st.post(page), { timeout: 10_000, message: `postcondition of ${id}` }).toBe(true);
  await core.waitLayoutSettled(page);
  await page.waitForTimeout(200);
};

// Open every collapsed section of the open pane so its controls are targets.
const expandAll = async (page) => {
  await page.evaluate(() => {
    document.querySelectorAll('#left-pane [aria-expanded="false"]:is(.left-panel-section-header, .global-section-header, .sect-hdr, .noise-list-header, [id$="-header"])').forEach((h) => h.click());
  });
  await page.waitForTimeout(350);
  await core.waitLayoutSettled(page);
};

async function enumerate(page) {
  return page.evaluate(({ roots, sel }) => {
    document.querySelectorAll('[data-b4-probe]').forEach((e) => e.removeAttribute('data-b4-probe'));
    let n = 0; const seen = new Set(); const out = [];
    for (const root of roots) {
      for (const host of document.querySelectorAll(root)) {
        if (!host.checkVisibility({ checkVisibilityCSS: true })) continue;
        for (const e of host.querySelectorAll(sel)) {
          if (seen.has(e)) continue; seen.add(e);
          const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
          if (!e.checkVisibility({ checkVisibilityCSS: true }) || r.width < 1 || r.height < 1 || cs.pointerEvents === 'none') continue;
          if (e.matches('input[type="hidden"], input[type="file"], .sr-only, [aria-hidden="true"][tabindex="-1"]')) continue;
          if (e.matches('input[type="checkbox"], input[type="radio"]') && (e.closest('label.sw-toggle') || cs.opacity === '0')) continue;
          if (e.closest('.sr-only')) continue;
          n += 1; e.setAttribute('data-b4-probe', String(n));
          const lbl = (e.id ? '#' + e.id : e.dataset.info ? `info[${e.dataset.info}]` : (e.getAttribute('aria-label') || e.getAttribute('data-tab') || e.getAttribute('title') || e.className || e.tagName)).toString().trim().replace(/\s+/g, '.').slice(0, 56);
          out.push({ i: n, label: `${e.tagName.toLowerCase()}${lbl.startsWith('#') ? lbl : '.' + lbl}`.slice(0, 70) });
        }
      }
    }
    return out;
  }, { roots: ROOTS, sel: TARGETS });
}

// In-page body of measure(): one page.evaluate per state (sweep.inPage) instead of ~7 round trips per target. Same steps and
// order as the per-target loop it replaced.
async function measureInPage({ items, roots, popups }, kit) {
  const out = [];
  for (const it of items) {
    const e = document.querySelector(`[data-b4-probe="${it.i}"]`);
    if (!e) { out.push({ i: it.i, missing: true }); continue; }
    e.scrollIntoView({ block: 'center', inline: 'nearest' }); for (let a = e.parentElement; a; a = a.parentElement) if (a.scrollLeft) a.scrollLeft = 0; // vertical scroll only: a control that overflows the pane sideways must not be rescued
    await kit.frame();
    // A control that a collapsed section or a scroller clips away entirely is not on screen: skip it.
    const clipped = (() => {
      const r = e.getBoundingClientRect();
      let l = r.left; let t = r.top; let rt = r.right; let b = r.bottom;
      for (let a = e.parentElement; a; a = a.parentElement) {
        const o = getComputedStyle(a);
        if (o.overflowX === 'visible' && o.overflowY === 'visible') continue;
        const c = a.getBoundingClientRect();
        if (!c.width && !c.height) continue; // display: contents has no box
        l = Math.max(l, c.left); t = Math.max(t, c.top); rt = Math.min(rt, c.right); b = Math.min(b, c.bottom);
      }
      l = Math.max(l, 0); t = Math.max(t, 0); rt = Math.min(rt, innerWidth); b = Math.min(b, innerHeight);
      return rt - l < 2 || b - t < 2;
    })();
    if (clipped) { out.push({ i: it.i, clipped: true }); continue; }
    // An open popup that does not contain the control covers part of it by design (it dismisses on an outside tap): it is not a
    // neighbour, so it is made transparent to hit tests while the control is probed.
    const ps = [...document.querySelectorAll(popups.join(','))].filter((m) => !m.contains(e) && m.checkVisibility());
    const prev = ps.map((m) => [m, m.style.pointerEvents]);
    ps.forEach((m) => { m.style.pointerEvents = 'none'; });
    const a = kit.hitArea(e);
    const own = (() => {
      const r = e.getBoundingClientRect();
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!t) return true;
      if (t === e || e.contains(t) || t.contains(e) || (t.tagName === 'LABEL' && t.control === e)) return true;
      // The two thumbs of a dual range sit on one track: the upper input owns the track, the lower one is the same control.
      if (e.closest('.dual-range') && t.closest('.dual-range') === e.closest('.dual-range')) return 'other-surface';
      // An overlay that belongs to another surface (a pane over the bottom-pane toggle) hides the control from the finger too:
      // it is not a neighbour stealing the tap, so it is not this panel's defect.
      const rootOf = (n) => roots.map((s) => n.closest(s)).find(Boolean) || null;
      return rootOf(t) !== rootOf(e) ? 'other-surface' : false;
    })();
    prev.forEach(([m, v]) => { m.style.pointerEvents = v; });
    out.push({ i: it.i, w: a.w, h: a.h, own });
  }
  return out;
}

async function measure(page) {
  const items = await enumerate(page);
  const res = await sweep.inPage(page, measureInPage, { items, roots: ROOTS, popups: POPUPS });
  const bad = []; const stolen = []; let skipped = 0; let clippedN = 0; const clippedL = []; let otherN = 0;
  res.forEach((m, k) => {
    const it = items[k];
    if (m.missing) { bad.push(`${it.label} left the DOM during the sweep`); return; }
    if (m.clipped) { skipped += 1; clippedN += 1; clippedL.push(it.label); return; }
    if (m.own === 'other-surface') { skipped += 1; otherN += 1; return; }
    if (m.w < MIN || m.h < MIN) bad.push(`${it.label} ${m.w}x${m.h}`);
    if (!m.own) stolen.push(it.label);
  });
  return { count: items.length - skipped, listed: items.length, clipped: clippedN, clippedL: process.env.B4_CLIP ? clippedL : undefined, other: otherN, bad, stolen };
}

const report = async (page, testInfo, id) => {
  const r = await measure(page);
  testInfo.annotations.push({ type: 'B4', description: `${id}: ${r.count} targets, ${r.bad.length} under ${MIN}` });
  if (process.env.B4_LOG) console.log('B4RED', testInfo.project.name, id, JSON.stringify(r));
  if (process.env.B4_SHOT) { fs.mkdirSync(process.env.B4_SHOT, { recursive: true }); await page.screenshot({ path: path.join(process.env.B4_SHOT, `${testInfo.project.name}-${id}.png`), scale: 'css' }); }
  expect(r.count, `${id}: has targets`).toBeGreaterThan(0);
  expect(r.bad, `${id} targets under ${MIN}`).toEqual([]);
  expect(r.stolen, `${id} targets whose centre a neighbour owns`).toEqual([]);
};

const SCENARIOS = {
  'left-pane-open': async (p) => { await runState(p, 'left-pane-open'); await expandAll(p); },
  'right-pane-layers': (p) => runState(p, 'right-pane-layers'),
  'right-pane-pens': (p) => runState(p, 'right-pane-pens'),
  'bottom-pane-open': (p) => runState(p, 'bottom-pane-open'),
  'layer-add-menu': (p) => runState(p, 'layer-add-menu'),
  'generator-picker': (p) => runState(p, 'generator-picker'),
  'text-panel': async (p) => { await runState(p, 'text-panel'); await expandAll(p); },
  'fill-controls': (p) => runState(p, 'fill-controls'),
  'noise-rack': async (p) => { await runState(p, 'noise-rack'); await expandAll(p); },
  'layer-selected-handles': (p) => runState(p, 'layer-selected-handles'),
  'preset-gallery': async (p) => {
    await p.evaluate(() => {
      const eng = window.app.engine;
      eng.layers.slice().forEach((l) => eng.removeLayer && eng.removeLayer(l.id));
      const id = eng.addLayer('harmonograph');
      eng.activeLayerId = id; window.app.renderer.setSelection([id], id);
      window.app.ui.renderLayers(); window.app.ui.buildControls();
    });
    const st = STATES.find((s) => s.id === 'left-pane-open');
    await st.run(p);
    await expect.poll(() => st.post(p), { timeout: 10_000 }).toBe(true);
    await core.waitLayoutSettled(p);
    await p.evaluate(() => document.querySelector('#left-pane .hg-preset-trigger')?.click());
    await p.waitForFunction(() => document.querySelector('.hg-preset-popover')?.checkVisibility());
    await p.waitForTimeout(250);
  },
  'layers-rich': async (p) => {
    await p.evaluate(() => {
      const eng = window.app.engine;
      eng.layers.slice().forEach((l) => eng.removeLayer && eng.removeLayer(l.id));
      const ids = ['wavetable', 'rings', 'text'].map((t) => eng.addLayer(t));
      eng.addModifierLayer && eng.addModifierLayer('mirror');
      eng.activeLayerId = ids[0]; window.app.renderer.setSelection([ids[0], ids[1]], ids[0]);
      window.app.ui.renderLayers(); window.app.ui.buildControls();
    });
    await runState(p, 'right-pane-layers');
  },
  'layer-row-menu': async (p) => {
    await runState(p, 'right-pane-layers');
    await p.evaluate(() => document.querySelector('#layer-list button[aria-label^="More actions for"]')?.click());
    await p.waitForFunction(() => document.querySelector('.lvl-ctx-menu')?.checkVisibility());
    await p.waitForTimeout(200);
  },
  'layer-filter-menu': async (p) => {
    await runState(p, 'right-pane-layers');
    await touch.tap(p, p.locator('#right-pane .lvl-filter-btn'));
    await p.waitForFunction(() => [...document.querySelectorAll('[role="menu"]')].some((m) => m.checkVisibility()));
    await p.waitForTimeout(250);
  },
  'pens-rich': async (p) => {
    await runState(p, 'right-pane-pens');
    await p.evaluate(() => { document.getElementById('btn-add-pen')?.click(); document.getElementById('btn-add-pen')?.click(); });
    await p.waitForTimeout(300);
    await p.evaluate(() => { const h = document.getElementById('auto-colorization-header'); if (h && h.getAttribute('aria-expanded') === 'false') h.click(); });
    await p.waitForTimeout(350);
  },
  'palette-menu': async (p) => {
    await runState(p, 'right-pane-pens');
    await p.evaluate(() => document.getElementById('palette-toggle')?.click());
    await p.waitForTimeout(300);
  },
  'noise-rack-entries': async (p) => {
    await runState(p, 'noise-rack');
    await p.evaluate(() => { const b = document.querySelector('#left-pane .noise-add'); b?.click(); b?.click(); });
    await p.waitForTimeout(300);
    await expandAll(p);
  },
  'multi-selection': async (p) => {
    await p.evaluate(() => {
      const eng = window.app.engine;
      eng.layers.slice().forEach((l) => eng.removeLayer && eng.removeLayer(l.id));
      const ids = ['wavetable', 'rings'].map((t) => eng.addLayer(t));
      eng.activeLayerId = ids[0]; window.app.renderer.setSelection(ids, ids[0]);
      window.app.ui.renderLayers(); window.app.ui.buildControls();
    });
    const st = STATES.find((s) => s.id === 'left-pane-open');
    await st.run(p);
    await expect.poll(() => st.post(p), { timeout: 10_000 }).toBe(true);
    await core.waitLayoutSettled(p);
    await expandAll(p);
  },
  'mirror-modifier': async (p) => {
    await p.evaluate(() => {
      const eng = window.app.engine;
      eng.activeLayerId = eng.addLayer('wavetable');
      const id = eng.addModifierLayer('mirror');
      eng.activeLayerId = id;
      window.app.ui.renderLayers(); window.app.ui.buildControls();
    });
    const st = STATES.find((s) => s.id === 'left-pane-open');
    await st.run(p);
    await expect.poll(() => st.post(p), { timeout: 10_000 }).toBe(true);
    await core.waitLayoutSettled(p);
    await p.waitForSelector('.mp-root .mp-dial');
    await expandAll(p);
  },
};

test.describe('TUX-041 B4 side panels', () => {
  test.use({ reducedMotion: 'reduce' });
  // Every test boots its own page and state, so the file runs fully parallel (the files share no state).
  test.describe.configure({ mode: 'parallel', retries: 0 });

  for (const [id, open] of Object.entries(SCENARIOS)) {
    test(`${id}: every panel target is at least 44 x 44`, async ({ page, baseURL }, testInfo) => {
      test.setTimeout(120_000);
      await boot(page, baseURL);
      await open(page);
      await report(page, testInfo, id);
    });
  }

  // Every tab of the Text panel (Type, Fill, Outline ... each page is a block of targets).
  test('text panel: every tab has only 44 x 44 targets', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(240_000);
    await boot(page, baseURL);
    await runState(page, 'text-panel');
    const n = await page.locator('.vtp-tab').count();
    expect(n, 'text panel tabs').toBeGreaterThan(2);
    const failures = [];
    for (let i = 0; i < n; i += 1) {
      const tab = page.locator('.vtp-tab').nth(i);
      if (await tab.evaluate((e) => e.classList.contains('disabled'))) continue;
      await tab.evaluate((e) => e.scrollIntoView({ block: 'center' }));
      await tab.click();
      await page.waitForTimeout(350);
      await expandAll(page);
      const r = await measure(page);
      if (process.env.B4_LOG) console.log('B4RED', testInfo.project.name, `text-tab:${i}`, JSON.stringify(r));
      if (r.bad.length || r.stolen.length) failures.push(`tab ${i}: under ${JSON.stringify(r.bad)} stolen ${JSON.stringify(r.stolen)}`);
    }
    expect(failures, 'text panel tabs with targets under 44').toEqual([]);
  });

  // Every generator's parameter panel (Petalis Designer and Scene3D are batch B5), one test per generator so none nears its
  // timeout. ALGO_TYPES is the static roster; the roster test below fails when the app's generator list drifts from it.
  test('every algorithm parameter panel: the roster matches the app generator list', async ({ page, baseURL }) => {
    await boot(page, baseURL);
    const all = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-algo-type]')].map((e) => e.dataset.algoType))].filter((t) => !/^(petalisDesigner|scene3d|pattern)$/.test(t)).concat('text'));
    expect(all.length).toBeGreaterThan(8);
    expect([...all].sort(), 'ALGO_TYPES in targets-panels.spec.js lists every generator the app offers').toEqual([...ALGO_TYPES].sort());
  });
  for (const type of ALGO_TYPES.filter((t) => !process.env.B4_ALGO || process.env.B4_ALGO.split(',').includes(t))) {
    test(`algorithm ${type}: every parameter panel target is at least 44 x 44`, async ({ page, baseURL }, testInfo) => {
      test.setTimeout(120_000);
      await boot(page, baseURL);
      await page.evaluate((type) => {
        const eng = window.app.engine;
        eng.layers.slice().forEach((l) => eng.removeLayer && eng.removeLayer(l.id));
        const id = eng.addLayer(type);
        eng.activeLayerId = id; window.app.renderer.setSelection([id], id);
        window.app.ui.renderLayers(); window.app.ui.buildControls();
      }, type);
      const st = STATES.find((s) => s.id === 'left-pane-open');
      await st.run(page);
      await expect.poll(() => st.post(page), { timeout: 10_000 }).toBe(true);
      await core.waitLayoutSettled(page);
      await expandAll(page);
      const r = await measure(page);
      if (process.env.B4_LOG) console.log('B4RED', testInfo.project.name, `algo:${type}`, JSON.stringify(r));
      expect(r.count, `${type}: has targets`).toBeGreaterThan(0);
      expect(r.bad, `${type} parameter panel targets under ${MIN}`).toEqual([]);
      expect(r.stolen, `${type} parameter panel targets whose centre a neighbour owns`).toEqual([]);
    });
  }

  // The draw-order icons keep an 18 px visual and a centred 44 px ::before. A blanket "grow every button" rule would give them a real
  // 44 px box that overlaps its neighbour (22 px hit area on the audit's probe), so they are asserted by name.
  test('right pane: the draw-order icons keep a 44 x 44 hit area', async ({ page, baseURL }) => {
    test.setTimeout(90_000);
    await boot(page, baseURL);
    await runState(page, 'right-pane-layers');
    const bad = [];
    for (const sel of ['#draw-order-settings', '.draw-order-overlay-toggle']) {
      const loc = page.locator(sel).first();
      if (!(await loc.count())) continue;
      await loc.evaluate((e) => { e.scrollIntoView({ block: 'center', inline: 'nearest' }); for (let a = e.parentElement; a; a = a.parentElement) if (a.scrollLeft) a.scrollLeft = 0; }); // vertical scroll only: a control that overflows the pane sideways must not be rescued
      const a = await touch.hitArea(page, loc);
      if (a.w < MIN || a.h < MIN) bad.push(`${sel} ${a.w}x${a.h}`);
    }
    expect(bad, 'draw-order icons under 44').toEqual([]);
  });

  // The open generator list (rows are a finger tall now) must fit the screen and must not cut the Reset / Randomize row.
  test('generator-picker: the open list stays on screen and clear of the Randomize row', async ({ page, baseURL }) => {
    test.setTimeout(90_000);
    await boot(page, baseURL);
    await runState(page, 'generator-picker');
    const g = await page.evaluate(() => {
      const m = document.getElementById('gm-module-menu').getBoundingClientRect();
      const rnd = document.getElementById('btn-randomize-params');
      const rr = rnd && rnd.checkVisibility() ? rnd.getBoundingClientRect() : null;
      return { top: m.top, bottom: m.bottom, ih: innerHeight, rndTop: rr ? rr.top : null, rndBottom: rr ? rr.bottom : null };
    });
    expect(g.bottom, `menu bottom ${g.bottom} inside the ${g.ih} px screen`).toBeLessThanOrEqual(g.ih);
    const rowsFit = g.rndTop !== null && g.rndTop - g.top >= 132;
    if (rowsFit) expect(g.bottom, 'menu ends above the Randomize row').toBeLessThanOrEqual(g.rndTop);
  });

  // Finger check: a tap that lands just outside a small visual but inside its 44 px hit area does the job.
  test('finger: pens headers, the fill variant grid and the pane toggle respond to a tap', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(90_000);
    await boot(page, baseURL);
    await runState(page, 'right-pane-pens');
    const hdr = page.locator('#pens-section-header');
    await hdr.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    const before = await hdr.getAttribute('aria-expanded');
    const hb = await hdr.boundingBox();
    expect(hb.height, 'pens header is a finger tall').toBeGreaterThanOrEqual(MIN - 0.5);
    await page.touchscreen.tap(hb.x + hb.width / 2, hb.y + hb.height - 3);
    await expect.poll(() => hdr.getAttribute('aria-expanded')).not.toBe(before);
    await shot(page, `${testInfo.project.name}-pens-finger`);
    await boot(page, baseURL);
    await runState(page, 'fill-controls');
    const btn = page.locator('#paint-bucket-variant-grid .pb-variant-btn').nth(3);
    await btn.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    const bb = await btn.boundingBox();
    expect(bb.height, 'variant button is a finger tall').toBeGreaterThanOrEqual(MIN - 0.5);
    expect(bb.width, 'variant button is a finger wide').toBeGreaterThanOrEqual(MIN - 0.5);
    await page.touchscreen.tap(bb.x + bb.width - 3, bb.y + bb.height - 3);
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await shot(page, `${testInfo.project.name}-fill-grid-finger`);
  });
  test('finger: the formula pane toggle, a generator row and a text stepper respond to a tap off their centre', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(120_000);
    await boot(page, baseURL);
    await runState(page, 'bottom-pane-open');
    const tog = page.locator('#btn-pane-toggle-bottom');
    const tb = await tog.boundingBox();
    expect(tb.width, 'pane toggle is a finger wide').toBeGreaterThanOrEqual(MIN - 0.5);
    expect(tb.height, 'pane toggle is a finger tall').toBeGreaterThanOrEqual(MIN - 0.5);
    await shot(page, `${testInfo.project.name}-bottom-pane-open`);
    await page.touchscreen.tap(tb.x + tb.width - 3, tb.y + tb.height - 3);
    await expect(page.locator('#bottom-pane')).toHaveClass(/bottom-pane-collapsed/);

    await boot(page, baseURL);
    await runState(page, 'generator-picker');
    const row = page.locator('#gm-module-menu .lvl-algo-sub-item:not(.gm-item-active)').nth(1);
    await row.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    const want = await row.getAttribute('data-algo-type');
    const rb = await row.boundingBox();
    expect(rb.height, 'generator row is a finger tall').toBeGreaterThanOrEqual(MIN - 0.5);
    await shot(page, `${testInfo.project.name}-generator-picker`);
    await page.touchscreen.tap(rb.x + rb.width / 2, rb.y + rb.height - 3);
    await expect.poll(() => page.evaluate(() => document.getElementById('generator-module').value)).toBe(want);

    await boot(page, baseURL);
    await runState(page, 'text-panel');
    const up = page.locator('.vtp-scrub[data-param="charRotation"] .vtp-scrub-steppers button[data-dir="1"]');
    await up.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    const ub = await up.boundingBox();
    expect(ub.height, 'stepper is a finger tall').toBeGreaterThanOrEqual(MIN - 0.5);
    expect(ub.width, 'stepper is a finger wide').toBeGreaterThanOrEqual(MIN - 0.5);
    const before = await page.evaluate(() => window.app.engine.getActiveLayer().params.charRotation || 0);
    await shot(page, `${testInfo.project.name}-text-panel`);
    await page.touchscreen.tap(ub.x + ub.width - 3, ub.y + ub.height - 3);
    await expect.poll(() => page.evaluate(() => window.app.engine.getActiveLayer().params.charRotation || 0)).toBeGreaterThan(before);
  });
});
