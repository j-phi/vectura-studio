const { evidenceDir, shoot } = require('../helpers/evidence');
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-024: the pen tool and the direct tool by finger. A finger closes a path by a tap near the start
// point, finishes it with a double-tap that adds no extra anchor, and grabs an anchor from 15 px off it.
// Finger only (tests/e2e/helpers/touch.js tap/drag). Tool setup uses page.evaluate.

const EVIDENCE_DIR = process.env.TUX_EVIDENCE_DIR || evidenceDir('TUX-024');
const SHOT_NAMES = {
  'touch-ipad-landscape': 'iPadL',
  'webkit-ipad-landscape': 'iPadL-webkit',
  'touch-iphone-portrait': 'iPhP',
  'webkit-iphone-portrait': 'iPhP-webkit',
};

// Anchor layout around a clear canvas centre c: A1 top-left, A2 top-right, A3 bottom-right.
const A1 = { x: -50, y: -40 };
const A2 = { x: 50, y: -40 };
const A3 = { x: 50, y: 40 };
// Every offset a test may tap, so the whole set is probed for "the canvas is the top element".
const PROBES = [A1, A2, A3, { x: -85, y: -40 }, { x: -50, y: -75 }, { x: 125, y: 40 }, { x: 50, y: 75 }, { x: 90, y: 40 }];

const findCentre = (page) => page.evaluate((probes) => {
  const cv = document.querySelector('#main-canvas');
  const box = cv.getBoundingClientRect();
  const vis = {
    l: Math.max(box.left, 0), t: Math.max(box.top, 0),
    r: Math.min(box.right, innerWidth), b: Math.min(box.bottom, innerHeight),
  };
  const cands = [];
  for (let y = vis.t + 20; y < vis.b - 20; y += 10) {
    for (let x = vis.l + 20; x < vis.r - 20; x += 10) cands.push({ x, y, d: Math.hypot(x - (vis.l + vis.r) / 2, y - (vis.t + vis.b) / 2) });
  }
  cands.sort((a, b) => a.d - b.d);
  const ok = (c) => probes.every((p) => document.elementFromPoint(c.x + p.x, c.y + p.y) === cv);
  const hit = cands.find(ok);
  return hit ? { x: hit.x, y: hit.y } : null;
}, PROBES);

const setupPen = async (page, testInfo) => {
  await page.evaluate(() => {
    const app = window.app;
    app.engine.layers.slice().forEach((l) => { try { app.engine.removeLayer(l.id); } catch (_) { /* noop */ } });
    const r = app.renderer;
    r.userHasManipulated = true;
    window.__penDone = [];
    if (!r.__tux024Wrapped) {
      const orig = r.onPenComplete;
      r.onPenComplete = (p) => {
        window.__penDone.push({ n: p.anchors.length, closed: !!p.closed });
        if (orig) orig(p);
      };
      r.__tux024Wrapped = true;
    }
    if (app.ui && app.ui.setActiveTool) app.ui.setActiveTool('pen');
    else r.setTool('pen');
    r.penMode = 'draw';
    r.penDraft = null;
  });
  await page.waitForTimeout(300);
  const c = await findCentre(page);
  // LAY-002 / TUX-007 (shell lane): the iPhone landscape canvas is ~124 px tall and the toolbar covers it,
  // so no clear tap area exists. Same dependency TUX-030 pen.spec.js records. Not a TUX-024 defect.
  test.fail(c === null && !!testInfo && testInfo.project.name === 'touch-iphone-landscape-chrome', 'LAY-002/TUX-007 dependency: no clear canvas area');
  expect(c).not.toBeNull();
  return c;
};

const at = (c, o) => ({ x: c.x + o.x, y: c.y + o.y });
const draft = (page) => page.evaluate(() => {
  const d = window.app.renderer.penDraft;
  return d ? { n: d.anchors.length, closed: !!d.closed } : null;
});
const done = (page) => page.evaluate(() => window.__penDone.slice());
const layerCount = (page) => page.evaluate(() => window.app.engine.layers.length);
const gap = (page, ms = 700) => page.waitForTimeout(ms);

// Place three anchors with gaps so no pair of taps counts as a double-tap.
const threeAnchors = async (page, c) => {
  await touch.tap(page, at(c, A1));
  await gap(page);
  await touch.tap(page, at(c, A2));
  await gap(page);
  await touch.tap(page, at(c, A3));
  await gap(page);
};

test.describe('TUX-024 pen and anchors by finger', () => {
  let errors;
  test.beforeEach(async ({ page }, testInfo) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/');
    await page.waitForFunction(() => !!(window.app && window.app.renderer && window.app.engine));
    await page.waitForTimeout(600);
  });
  test.afterEach(() => { if (errors) expect(errors).toEqual([]); });

  for (const d of [10, 20]) {
    test(`close by near tap: ${d} px from the start`, async ({ page }, testInfo) => {
      const c = await setupPen(page, testInfo);
      await threeAnchors(page, c);
      expect(await draft(page)).toEqual({ n: 3, closed: false });
      const shot = SHOT_NAMES[testInfo.project.name];
      if (d === 20 && shot) {
        fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
        await shoot(page, { path: `${EVIDENCE_DIR}/${shot}-pen-before-close.png` });
      }
      const before = await layerCount(page);
      await touch.tap(page, at(c, { x: A1.x - d, y: A1.y }));
      await gap(page, 300);
      expect(await draft(page)).toBeNull();
      expect(await done(page)).toEqual([{ n: 3, closed: true }]);
      expect(await layerCount(page)).toBe(before + 1);
      if (d === 20 && shot) await shoot(page, { path: `${EVIDENCE_DIR}/${shot}-pen-closed.png` });
    });
  }

  for (const d of [10, 18, 20]) {
    test(`jittered close tap ${d} px from the start closes with no in-handle`, async ({ page }, testInfo) => {
      const c = await setupPen(page, testInfo);
      await threeAnchors(page, c);
      const from = at(c, { x: A1.x - d, y: A1.y });
      // A finger jitters a few px between down and up.
      await touch.drag(page, from, { x: from.x + 2, y: from.y }, { steps: 1 });
      await gap(page, 300);
      expect(await draft(page)).toBeNull();
      expect(await done(page)).toEqual([{ n: 3, closed: true }]);
      const a0in = await page.evaluate(() => {
        const l = window.app.engine.layers[window.app.engine.layers.length - 1];
        const m = l.sourcePaths && l.sourcePaths[0] && l.sourcePaths[0].meta;
        return m && m.anchors ? m.anchors[0].in : 'no-meta';
      });
      expect(a0in).toBeNull();
    });
  }

  test('far tap does not close: 30 px from the start', async ({ page }, testInfo) => {
    const c = await setupPen(page, testInfo);
    await threeAnchors(page, c);
    await touch.tap(page, at(c, { x: A1.x - 30, y: A1.y }));
    await gap(page, 300);
    expect(await draft(page)).toEqual({ n: 4, closed: false });
    expect(await done(page)).toEqual([]);
  });

  for (const drift of [12, 22]) {
    test(`double-tap with ${drift} px drift finishes with no extra anchor`, async ({ page }, testInfo) => {
      const c = await setupPen(page, testInfo);
      await touch.tap(page, at(c, A1));
      await gap(page);
      await touch.tap(page, at(c, A2));
      await gap(page);
      // Third anchor and its double-tap, back to back.
      await touch.tap(page, at(c, A3));
      await touch.tap(page, at(c, { x: A3.x + drift, y: A3.y }));
      await gap(page, 300);
      expect(await done(page)).toEqual([{ n: 3, closed: false }]);
      expect(await draft(page)).toBeNull();
    });
  }

  test('fast taps far apart do not finish', async ({ page }, testInfo) => {
    const c = await setupPen(page, testInfo);
    await touch.tap(page, at(c, A1));
    await gap(page);
    await touch.tap(page, at(c, A2));
    await gap(page);
    await touch.tap(page, at(c, { x: A2.x + 0, y: A2.y + 80 }));
    await touch.tap(page, at(c, { x: A2.x + 40, y: A2.y + 80 }));
    await gap(page, 300);
    expect(await done(page)).toEqual([]);
    expect(await draft(page)).toEqual({ n: 4, closed: false });
  });

  test('anchor grab by finger from 15 px off', async ({ page }, testInfo) => {
    const c = await setupPen(page, testInfo);
    // Draw the path with the pen, finish with a double-tap, then edit it with the Direct tool.
    await touch.tap(page, at(c, A1));
    await gap(page);
    await touch.tap(page, at(c, A2));
    await gap(page);
    await touch.tap(page, at(c, A3));
    await touch.tap(page, at(c, { x: A3.x + 4, y: A3.y }));
    await gap(page, 300);
    expect(await done(page)).toEqual([{ n: 3, closed: false }]);
    const info = await page.evaluate(() => {
      const app = window.app;
      const r = app.renderer;
      const layer = app.engine.layers[app.engine.layers.length - 1];
      r.setSelection([layer.id], layer.id);
      if (app.ui && app.ui.setActiveTool) app.ui.setActiveTool('direct');
      else r.setTool('direct');
      r.setDirectSelection(layer, 0);
      r.draw();
      return layer.id;
    });
    await page.waitForTimeout(300);
    const anchorsPx = () => page.evaluate(() => {
      const r = window.app.renderer;
      const data = r.getDirectSelectionWorldAnchors();
      const box = document.querySelector('#main-canvas').getBoundingClientRect();
      return data.anchors.map((a) => {
        const p = r.worldToScreen(a.x, a.y);
        return { x: p.x + box.left, y: p.y + box.top };
      });
    });
    const before = await anchorsPx();
    expect(before).toHaveLength(3);
    const k = 15 / Math.SQRT2;
    const from = { x: before[0].x - k, y: before[0].y - k };
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y).id, from)).toBe('main-canvas');
    await touch.drag(page, from, { x: from.x + 30, y: from.y + 30 }, { steps: 10 });
    const after = await anchorsPx();
    expect(info).toBeTruthy();
    expect(Math.abs(after[0].x - (before[0].x + 30))).toBeLessThanOrEqual(2);
    expect(Math.abs(after[0].y - (before[0].y + 30))).toBeLessThanOrEqual(2);
    for (const i of [1, 2]) {
      expect(Math.abs(after[i].x - before[i].x)).toBeLessThanOrEqual(1);
      expect(Math.abs(after[i].y - before[i].y)).toBeLessThanOrEqual(1);
    }
    const shot = SHOT_NAMES[testInfo.project.name];
    if (shot) {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
      await shoot(page, { path: `${EVIDENCE_DIR}/${shot}-anchor-dragged.png` });
    }
  });
});
