const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-012: layer, group, modifier and scene rows stay legible and inside the pane on touch.
// Fixture: tests/fixtures/touch/layers-mixed.vectura (generated through the real engine +
// app.captureState(); locked state is UI-only, so the spec locks "Locked Spiral" after load).
// iPhP is PROVISIONAL until TUX-010 / TUX-001 land: the pane may be opened programmatically
// and the layout viewport may be wider than the device viewport.
const FIXTURE = path.join(__dirname, '..', '..', 'fixtures', 'touch', 'layers-mixed.vectura');
const NAME_MIN = 96;
const HIT_MIN = 44;

const loadFixture = async (page) => {
  const doc = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
  await page.evaluate((state) => {
    window.app.applyState(state);
    const locked = window.app.engine.layers.find((l) => l.name === 'Locked Spiral');
    if (locked) window.app.ui.layerLockedIds.add(locked.id);
    window.app.ui.renderLayers();
  }, doc.state);
};

const paneOpen = (page) => page.evaluate(() => {
  const p = document.getElementById('right-pane');
  if (!p) return false;
  const r = p.getBoundingClientRect();
  const cs = getComputedStyle(p);
  return r.width > 100 && r.right > 0 && r.left < innerWidth && cs.visibility !== 'hidden' && cs.display !== 'none';
});

const openLayersPane = async (page, testInfo) => {
  if (await paneOpen(page)) return;
  for (const id of ['btn-pane-toggle-right', 'btn-mobile-pane-right']) {
    const btn = page.locator(`#${id}`);
    if (await btn.isVisible().catch(() => false)) {
      await touch.tap(page, btn);
      await page.waitForTimeout(350);
      if (await paneOpen(page)) return;
    }
  }
  await page.evaluate(() => {
    const pane = document.getElementById('right-pane');
    if (document.body.classList.contains('auto-collapsed')) pane.classList.add('pane-force-open');
    else pane.classList.remove('pane-collapsed');
  });
  await page.waitForTimeout(350);
  testInfo.annotations.push({ type: 'provisional', description: 'pane opened programmatically – TUX-010 not landed' });
  expect(await paneOpen(page)).toBe(true);
};

const setup = async (page, testInfo) => {
  await loadFixture(page);
  await openLayersPane(page, testInfo);
  await page.evaluate(() => window.app.ui.renderLayers());
};

// Fixture sanity: the doc really holds every row kind the contract names.
const assertFixture = async (page) => {
  const facts = await page.evaluate(() => {
    const L = window.app.engine.layers;
    const byId = new Map(L.map((l) => [l.id, l]));
    const depth = (l) => { let d = 0; let p = l; while (p && p.parentId) { d += 1; p = byId.get(p.parentId); } return d; };
    return {
      types: [...new Set(L.map((l) => l.type))],
      groupTypes: [...new Set(L.filter((l) => l.isGroup).map((l) => l.groupType))],
      maskSrc: L.some((l) => l.mask && l.mask.enabled && l.maskCapabilities && l.maskCapabilities.canSource),
      maskedChild: L.some((l) => l.parentId && byId.get(l.parentId) && byId.get(l.parentId).mask && byId.get(l.parentId).mask.enabled),
      maxDepth: Math.max(...L.map(depth)),
      fills: L.some((l) => l.type === 'shape' && Array.isArray(l.fills) && l.fills.length),
      baked: L.some((l) => l.type === 'shape' && l.sourceFillRecord && l.paths && l.paths.length),
      longName: L.some((l) => (l.name || '').length === 40),
      locked: window.app.ui.layerLockedIds.size >= 1,
    };
  });
  ['spiral', 'flowfield', 'text', 'petalisDesigner', 'object3d'].forEach((t) => expect(facts.types).toContain(t));
  ['modifier', 'scene', 'boolean', 'layer'].forEach((g) => expect(facts.groupTypes).toContain(g));
  expect(facts.maskSrc).toBe(true);
  expect(facts.maskedChild).toBe(true);
  expect(facts.maxDepth).toBeGreaterThanOrEqual(2);
  expect(facts.fills && facts.baked && facts.longName && facts.locked).toBe(true);
};

const INLINE_SEL = 'button, [role=button], .lvl-pen-dot, .lvl-grip, .lvl-more';

// Measure every row (or one row) in the page. Returns plain data; assertions run in node.
const measureRows = (page, { onlyId = null, activate = false, nameMin = true } = {}) => page.evaluate(({ onlyId, activate, INLINE_SEL }) => {
  const app = window.app;
  const list = document.getElementById('layer-list');
  const pane = document.getElementById('right-pane');
  const VW = window.__VW;
  const out = [];
  const ids = [...list.querySelectorAll('[data-lvl-id]')].map((e) => e.dataset.lvlId).filter((id) => !onlyId || id === onlyId);
  ids.forEach((id) => {
    if (activate) {
      app.engine.setActiveLayerId(id);
      app.ui.renderLayers();
    }
    const row = list.querySelector(`[data-lvl-id="${id}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'nearest' });
    const layer = app.engine.getLayerById(id);
    let depth = 0;
    for (let p = row.parentElement; p && p !== list; p = p.parentElement) if (p.classList.contains('lvl-tree-children')) depth += 1;
    const paneR = pane.getBoundingClientRect();
    const listR = list.getBoundingClientRect();
    const right = Math.min(listR.left + list.clientLeft + list.clientWidth, VW);
    const name = row.querySelector('.lvl-name, .lvl-grp-name');
    const nr = name ? name.getBoundingClientRect() : null;
    const ncy = nr ? nr.top + nr.height / 2 : 0;
    // A name clipped out of a very short list (iPhone landscape chrome, TUX-007) cannot be hit-tested.
    const clipped = !!nr && (ncy < listR.top || ncy > listR.bottom);
    const hit = nr ? document.elementFromPoint(nr.left + nr.width / 2, ncy) : null;
    const overflow = [];
    row.querySelectorAll(INLINE_SEL).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width * r.height <= 0) return;
      if (r.left < paneR.left - 0.5 || r.right > right + 0.5) {
        overflow.push({ cls: el.className, title: el.title || el.getAttribute('aria-label') || '', left: Math.round(r.left), right: Math.round(r.right), limit: Math.round(right) });
      }
    });
    out.push({
      id,
      name: layer && layer.name,
      depth,
      active: app.engine.activeLayerId === id,
      kind: row.classList.contains('lvl-grp-hdr') ? 'group' : 'card',
      nameW: name ? name.clientWidth : -1,
      nameFont: name ? parseFloat(getComputedStyle(name).fontSize) : 0,
      nameHit: clipped || !!(name && hit && (hit === name || name.contains(hit))),
      overflow,
      hasGrip: !!row.querySelector('.lvl-grip'),
      hasMore: !!row.querySelector('.lvl-more'),
    });
  });
  return out;
}, { onlyId, activate, INLINE_SEL });

const prepViewport = async (page, testInfo) => {
  const vp = page.viewportSize();
  const inner = await page.evaluate(() => innerWidth);
  let VW = vp.width;
  if (inner > vp.width) {
    VW = inner;
    testInfo.annotations.push({ type: 'provisional', description: `innerWidth ${inner} > viewport ${vp.width} – TUX-001 not landed` });
  }
  await page.evaluate((w) => { window.__VW = w; }, VW);
  return VW;
};

const HIT_TARGETS = ['.lvl-grip', '.lvl-more', '.lvl-ib', '.lvl-pen-dot', '.lvl-caret'];

// Desktop WebKit paints a transient overlay scrollbar over the list's right edge, and it
// steals elementFromPoint there (iOS indicators do not). Hide it so only OUR hit areas count.
const hideOverlayScrollbar = (page) => page.addStyleTag({
  content: '#layer-list{scrollbar-width:none}#layer-list::-webkit-scrollbar{display:none}',
});

const checkHitAreas = async (page, id) => {
  const bad = [];
  const row = page.locator(`#layer-list [data-lvl-id="${id}"]`).first();
  await row.scrollIntoViewIfNeeded();
  // Centre the row in the list: "if needed" can stop at a fractional scroll offset that leaves the
  // last row 0.5 px under the list edge (pane layout after TUX-051), which reads as a 43 px hit area.
  await row.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  for (const sel of HIT_TARGETS) {
    const els = row.locator(sel);
    const n = await els.count();
    for (let i = 0; i < n; i += 1) {
      const el = els.nth(i);
      const box = await el.boundingBox();
      if (!box || box.width * box.height <= 0) continue;
      // own-row controls only: skip children of nested rows
      const own = await el.evaluate((e, rid) => e.closest('[data-lvl-id]').dataset.lvlId === rid, id);
      if (!own) continue;
      // A list shorter than one full row (iPhone landscape chrome, TUX-007) clips controls.
      const clipped = await el.evaluate((e) => {
        const lr = document.getElementById('layer-list').getBoundingClientRect();
        const r = e.getBoundingClientRect();
        return lr.height < 140 && (r.top < lr.top || r.bottom > lr.bottom);
      });
      if (clipped) continue;
      const h = await touch.hitArea(page, el);
      if (h.w < HIT_MIN || h.h < HIT_MIN) bad.push(`${sel} ${h.w}x${h.h} box=${JSON.stringify(box)}`);
    }
  }
  return bad;
};

const summarize = (rows, pick) => rows.filter(pick).map((r) => `${r.name}[d${r.depth} ${r.kind}${r.active ? ' active' : ''}] w=${r.nameW} font=${r.nameFont} hit=${r.nameHit} ovf=${JSON.stringify(r.overflow)}`);

test.describe('TUX-012 layers panel on touch', () => {
  test('names and actions fit', async ({ page }, testInfo) => {
    await setup(page, testInfo);
    await assertFixture(page);
    await prepViewport(page, testInfo);

    // Inactive pass: every row at once (one row active so the active styling exists).
    await page.evaluate(() => {
      const first = document.querySelector('#layer-list [data-lvl-id]');
      window.app.engine.setActiveLayerId(first.dataset.lvlId);
      window.app.ui.renderLayers();
    });
    const inactive = await measureRows(page);
    const depths = new Set(inactive.map((r) => r.depth));
    [0, 1, 2].forEach((d) => expect(depths.has(d), `fixture renders depth ${d}`).toBe(true));
    const fail = [];
    const names = (rows) => rows.filter((r) => r.nameW < NAME_MIN || r.nameFont < 14 || !r.nameHit || r.overflow.length);
    fail.push(...summarize(names(inactive), () => true));

    // Active pass: each row active in turn.
    const active = await measureRows(page, { activate: true });
    fail.push(...summarize(names(active.filter((r) => r.active)), () => true).map((s) => `ACTIVE ${s}`));
    expect(fail, `name/overflow violations:\n${fail.join('\n')}`).toEqual([]);

    // Hit areas for every inline control at depths 0, 1, 2 (active + inactive rows).
    await hideOverlayScrollbar(page);
    const badHit = [];
    for (const r of inactive) {
      const bad = await checkHitAreas(page, r.id);
      if (bad.length) badHit.push(`${r.name}[d${r.depth}] ${bad.join(', ')}`);
      expect(r.hasGrip, `${r.name} has .lvl-grip`).toBe(true);
      expect(r.hasMore, `${r.name} has .lvl-more`).toBe(true);
    }
    expect(badHit, `hit area < 44:\n${badHit.join('\n')}`).toEqual([]);
  });

  test('narrow pane', async ({ page }, testInfo) => {
    await setup(page, testInfo);
    await prepViewport(page, testInfo);
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--pane-right-width', '200px');
      window.app.ui.renderLayers();
    });
    await page.waitForTimeout(200);
    const rows = await measureRows(page);
    const bad = rows.filter((r) => r.overflow.length || r.nameW <= 0)
      .map((r) => `${r.name}[d${r.depth}] w=${r.nameW} ovf=${JSON.stringify(r.overflow)}`);
    expect(bad, `200px pane:\n${bad.join('\n')}`).toEqual([]);
  });

  test('every desktop action reachable on touch', async ({ page }, testInfo) => {
    await setup(page, testInfo);
    await prepViewport(page, testInfo);
    const VW = await page.evaluate(() => window.__VW);
    const rowIds = await page.evaluate(() => [...document.querySelectorAll('#layer-list [data-lvl-id]')].map((e) => e.dataset.lvlId));

    const expectedName = (id) => id.slice(0, 8);
    for (const id of rowIds) {
      // Titles the DESKTOP template renders inline for this row, as keys.
      const expected = await page.evaluate((rid) => {
        const app = window.app; const eng = app.engine;
        const l = eng.getLayerById(rid);
        const keys = [];
        const masked = !!(l.parentId && eng.getLayerById(l.parentId)?.mask?.enabled && eng.getLayerById(l.parentId)?.maskCapabilities?.canSource);
        if (l.isGroup) {
          if (l.groupType === 'scene') {
            keys.push('scene-add-object');
            if (typeof eng.addLightToScene === 'function') keys.push('scene-add-light');
            if (!eng.getLayerDescendants(l.id).some((d) => d.type === 'sceneGround3d')) keys.push('scene-add-ground');
          }
          if (l.groupType === 'modifier') keys.push('expand-modifier');
          keys.push('ungroup', 'duplicate', 'delete');
          return keys;
        }
        if (!masked && l.maskCapabilities && l.maskCapabilities.canSource) {
          keys.push('mask-toggle');
          if (l.mask && l.mask.enabled) keys.push('mask-outline');
        }
        const leaf = l.type === 'sceneLight3d' || l.type === 'sceneGround3d';
        if (l.type !== 'shape' && !(leaf && !masked)) keys.push('expand-into-group');
        if (l.type === 'shape' && Array.isArray(l.fills) && l.fills.length) keys.push('expand-fill');
        if (l.type === 'shape' && l.sourceFillRecord && l.paths && l.paths.length) keys.push('explode-fill');
        keys.push('duplicate', 'delete');
        return keys;
      }, id);
      const more = page.locator(`#layer-list [data-lvl-id="${id}"] .lvl-more`).first();
      expect(await more.count(), `${expectedName(id)} row has a ⋯ button`).toBeGreaterThan(0);
      await more.scrollIntoViewIfNeeded();
      await touch.tap(page, more);
      await page.waitForTimeout(80);
      const menu = await page.evaluate(() => {
        const el = document.querySelector('.menu-dropdown.open');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { keys: [...el.querySelectorAll('.menu-entry')].map((e) => e.dataset.key), left: r.left, top: r.top, right: r.right, bottom: r.bottom, vh: innerHeight };
      });
      const label = await page.evaluate((rid) => window.app.engine.getLayerById(rid).name, id);
      expect(menu, `${label}: ⋯ opens the menu`).not.toBeNull();
      expect(menu.left, `${label} menu inside viewport`).toBeGreaterThanOrEqual(-0.5);
      expect(menu.top).toBeGreaterThanOrEqual(-0.5);
      expect(menu.right).toBeLessThanOrEqual(VW + 0.5);
      expect(menu.bottom).toBeLessThanOrEqual(menu.vh + 0.5);
      const missing = expected.filter((k) => !menu.keys.includes(k));
      expect(missing, `${label}: keys missing from ⋯ menu`).toEqual([]);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(50);
    }

    // Ungroup from the menu re-parents the children.
    const grp = await page.evaluate(() => {
      const g = window.app.engine.layers.find((l) => l.name === 'Layer Group');
      return { id: g.id, kids: window.app.engine.layers.filter((l) => l.parentId === g.id).map((l) => l.id) };
    });
    const grpMore = page.locator(`#layer-list [data-lvl-id="${grp.id}"] .lvl-more`).first();
    await grpMore.scrollIntoViewIfNeeded();
    await touch.tap(page, grpMore);
    await page.locator('.menu-dropdown.open .menu-entry[data-key="ungroup"]').waitFor({ timeout: 5000 });
    await touch.tap(page, page.locator('.menu-dropdown.open .menu-entry[data-key="ungroup"]'));
    await page.waitForTimeout(120);
    const after = await page.evaluate((g) => ({
      gone: !window.app.engine.getLayerById(g.id),
      kidsParent: g.kids.map((k) => window.app.engine.getLayerById(k)?.parentId ?? null),
    }), grp);
    expect(after.gone).toBe(true);
    expect(after.kidsParent.every((p) => p === null)).toBe(true);

    // Make clipping mask from the menu on an eligible row.
    const target = await page.evaluate(() => {
      const l = window.app.engine.layers.find((x) => x.name === 'Filled Shape');
      return { id: l.id, can: !!(l.maskCapabilities && l.maskCapabilities.canSource) };
    });
    expect(target.can).toBe(true);
    const tgtMore = page.locator(`#layer-list [data-lvl-id="${target.id}"] .lvl-more`).first();
    await tgtMore.scrollIntoViewIfNeeded();
    await touch.tap(page, tgtMore);
    await page.locator('.menu-dropdown.open .menu-entry[data-key="mask-toggle"]').waitFor({ timeout: 5000 });
    await touch.tap(page, page.locator('.menu-dropdown.open .menu-entry[data-key="mask-toggle"]'));
    await page.waitForTimeout(120);
    expect(await page.evaluate((id) => window.app.engine.getLayerById(id).mask.enabled, target.id)).toBe(true);
  });

  test('grip reorders at once', async ({ page }, testInfo) => {
    await setup(page, testInfo);
    await prepViewport(page, testInfo);
    const order = () => page.evaluate(() => [...document.querySelectorAll('#layer-list > [data-lvl-id]')]
      .map((e) => e.querySelector('.lvl-name, .lvl-grp-name')?.textContent));
    const SIB = ['Spiral', 'Flowfield', 'Text'];
    const before = (await order()).filter((n) => SIB.includes(n));
    expect(before.length).toBe(3);
    const rowOf = (n) => page.locator('#layer-list > [data-lvl-id]').filter({ has: page.locator('.lvl-name', { hasText: new RegExp(`^${n}$`) }) }).first();
    // Put row 1 at the top of the visible list; pick the lowest sibling that is fully visible
    // with it. Auto-scroll while dragging is TUX-044, so on a short list (iPhone landscape)
    // the target can be row 2 instead of row 3.
    const plan = await page.evaluate((names) => {
      const list = document.getElementById('layer-list');
      const rows = names.map((n) => [...list.querySelectorAll(':scope > [data-lvl-id]')]
        .find((e) => e.querySelector('.lvl-name')?.textContent === n));
      list.scrollTop = rows[0].offsetTop - list.offsetTop;
      const lr = list.getBoundingClientRect();
      const vis = rows.map((r) => { const b = r.getBoundingClientRect(); return b.top >= lr.top - 0.5 && b.bottom <= lr.bottom + 0.5; });
      return { vis };
    }, before);
    if (!plan.vis[0] || !plan.vis[1]) {
      // List too short for a second row (iPhone landscape, TUX-007): prove the grip arms at once.
      testInfo.annotations.push({ type: 'provisional', description: 'only one row visible – grip arming checked without a drop (TUX-007 / TUX-044)' });
      const g = rowOf(before[0]).locator('.lvl-grip').first();
      const gb = await g.boundingBox();
      if (!plan.vis[0]) {
        testInfo.annotations.push({ type: 'provisional', description: 'row 1 clipped by a very short list – grip arming not exercised (TUX-007)' });
        return;
      }
      const pt = { x: gb.x + gb.width / 2, y: gb.y + gb.height / 2, id: 0 };
      await touch.touchPhase(page, 'start', [pt]);
      // TUX-034a: the grip arms after TOUCH_HOLD.gripDragPx (4 px) of movement, not on touchstart.
      await touch.touchPhase(page, 'move', [{ ...pt, y: pt.y + 20 }]);
      const armed = await rowOf(before[0]).evaluate((e) => e.classList.contains('dragging'));
      await touch.touchPhase(page, 'end', [{ ...pt, y: pt.y + 20 }]);
      expect(armed, 'grip drag armed with no hold').toBe(true);
      expect(await page.locator('.menu-dropdown.open').count()).toBe(0);
      return;
    }
    const targetIdx = plan.vis[2] ? 2 : 1;
    if (targetIdx === 1) {
      testInfo.annotations.push({ type: 'provisional', description: 'row 3 not visible with row 1 – dragged below row 2 (auto-scroll is TUX-044)' });
    }
    const grip = rowOf(before[0]).locator('.lvl-grip').first();
    await expect(grip).toBeVisible();
    const gripBox = await grip.boundingBox();
    const tBox = await rowOf(before[targetIdx]).boundingBox();
    const from = { x: gripBox.x + gripBox.width / 2, y: gripBox.y + gripBox.height / 2 };
    const to = { x: tBox.x + tBox.width / 2, y: tBox.y + tBox.height * 0.8 };
    await touch.drag(page, from, to, { holdMs: 0, steps: 12 });
    await page.waitForTimeout(150);
    const afterNames = (await order()).filter((n) => SIB.includes(n));
    const expected = targetIdx === 2 ? [before[1], before[2], before[0]] : [before[1], before[0], before[2]];
    expect(afterNames, 'first row moved below the target').toEqual(expected);
    expect(await page.locator('.menu-dropdown.open').count()).toBe(0);
  });

  // D5 evidence (untracked PNGs). Run with TUX_EVIDENCE=1.
  test('evidence screenshot', async ({ page }, testInfo) => {
    if (!process.env.TUX_EVIDENCE) return; // evidence-only run
    await setup(page, testInfo);
    const dir = '/Users/jayphi/Documents/github/vectura-studio/docs/touch-audit/evidence/after/TUX-012';
    fs.mkdirSync(dir, { recursive: true });
    await page.evaluate(() => { document.getElementById('layer-list').scrollTop = 0; });
    await page.screenshot({ path: path.join(dir, `${testInfo.project.name}.png`) });
  });
});
