// Finger-only journey specs J1-J12 (TUX-059) with a step-pinned ledger.
//
// TUX-059 req 3 amended: expected failures are step-pinned, not plain test.fail().
//   The ledger tests/e2e/touch/journey-status.json lists, per currently failing cell
//   { project, journey, failsAt, reason }. A cell passes only when it fails at EXACTLY `failsAt`:
//     - fails at a different step      -> FAIL "failure moved from X to Y" (regression or progress)
//     - passes with an entry           -> FAIL "unexpectedly passed: remove ledger entry"
//     - fails with no entry            -> FAIL
//   A plain test.fail() would hide a cell that regresses from step 9 to step 2.
// Projects that are not in the ledger's `projects` list (-chrome, coarse-wide) run the same steps
// as measurements: they are annotated and never fail. There is no .skip, .only or engine guard here:
// a WebKit step that cannot work (a synthetic drag does not move a range input) fails honestly
// and sits in the ledger.
//
// Regenerate after a lane merge: npm run test:e2e:touch:journeys:ledger
// Step table (human-readable source): docs/touch-audit/journey-scripts.md
'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const P = require('./pages');
const { PROJECTS } = require('./viewports');
const { JOURNEYS, moveChecks } = require('./journey-defs');

test.describe.configure({ retries: 0 });

const LEDGER_FILE = path.join(__dirname, 'journey-status.json');
const WRITE = process.env.JOURNEY_LEDGER_WRITE === '1';
const SHOTS = process.env.JOURNEY_SHOTS_DIR || '';
const RESULTS_DIR = path.join(process.cwd(), 'test-results', 'journey-ledger');

// Debug knobs (never set in CI): JOURNEY_RELAX=id,id lets those steps fail their postconditions and go on;
// JOURNEY_CONTINUE=1 keeps running after a failure and lists every failing step in the result file.
const RELAX = new Set((process.env.JOURNEY_RELAX || '').split(',').filter(Boolean));
const CONTINUE = process.env.JOURNEY_CONTINUE === '1';

const readLedger = () => JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));

// ---------------------------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------------------------
const withBudget = (promise, ms, what) => {
  let timer;
  const guard = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what}: exceeded the ${ms} ms step budget`)), ms); });
  promise.catch(() => {});
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
};

const idsEqual = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

// Generic stray-side-effect checks, after every step.
function verify(step, pre, now) {
  const e = { layers: 0, history: 0, redo: 'same', selected: 'same', ...(step.expect || {}) };
  const dLayers = now.layerCount - pre.layerCount;
  if (e.layers !== 'any' && dLayers !== e.layers) throw new Error(`layerCount delta ${dLayers}, expected ${e.layers}`);
  const dHist = now.historyLen - pre.historyLen;
  if (e.history !== 'any' && dHist !== e.history) throw new Error(`historyLen delta ${dHist}, expected ${e.history}`);
  const dRedo = now.redoLen - pre.redoLen;
  if (e.redo === 'same' && dRedo !== 0) throw new Error(`redoLen delta ${dRedo}, expected 0`);
  if (typeof e.redo === 'number' && dRedo !== e.redo) throw new Error(`redoLen delta ${dRedo}, expected ${e.redo}`);
  if (e.selected === 'same' && !idsEqual(now.selectedIds, pre.selectedIds)) throw new Error(`selection changed (${pre.selectedIds.length} -> ${now.selectedIds.length} ids)`);
  if (Array.isArray(e.selected) && !idsEqual(now.selectedIds, e.selected)) throw new Error('selection is not the expected ids');
  if (typeof e.selected === 'function' && !e.selected(now, pre)) throw new Error(`selection does not match (${now.selectedIds.length} ids)`);
  if (!step.selfTest && !(now.scale > 0)) throw new Error(`renderer.scale is ${now.scale}`);
  if (now.historyLen >= now.maxHistory) throw new Error('history cap reached, a delta would be hidden');
}

async function runStep(c, step) {
  const page = c.page;
  P.takeErrors(page);
  page.__j.stepId = step.id;
  const pre = await P.readState(page);
  const budget = step.budget || c.stepBudget || P.STEP_BUDGET_MS;
  await withBudget(Promise.resolve(step.run(c)), budget, step.id);
  const t0 = Date.now();
  let last = null;
  for (;;) {
    try {
      const now = await P.readState(page);
      // The step's own postcondition first: it names the real defect (the object did not move) before the
      // generic side-effect checks (history delta) can attribute it to something else.
      if (step.post) await step.post(c, pre, now);
      verify(step, pre, now);
      last = null;
      break;
    } catch (e) {
      last = e;
      if (Date.now() - t0 > budget) break;
      await P.sleep(100);
    }
  }
  if (last && !RELAX.has(step.id)) throw last;
  await P.assertInvariants(page);
  const errs = P.takeErrors(page);
  if (errs.length) throw new Error(errs[0]);
}

// Runs steps in order; the first failure ends the run.
async function runSteps(c, steps) {
  const passed = [];
  let first = null;
  const all = [];
  for (const step of steps) {
    try {
      await runStep(c, step);
      passed.push(step.id);
    } catch (e) {
      const f = { failedStep: step.id, message: P.firstLine(e), jrn: step.jrn || '' };
      all.push(`${f.failedStep}: ${f.message}`);
      if (!first) first = f;
      if (!CONTINUE) break;
    }
  }
  return first ? { ...first, passed, all } : { failedStep: null, message: '', jrn: '', passed, all };
}

// Compares a run with the ledger entry for the cell.
// A reason class: digits and element ids/classes vary run to run, so they are blanked.
const reasonClass = (r) => String(r || '').replace(/^JRN-\d+ /, '').replace(/[0-9.,-]+/g, '#').replace(/\s+/g, ' ').trim().slice(0, 50);

function judge({ entry, failedStep, message }) {
  if (entry) {
    if (failedStep === entry.failsAt) {
      if (entry.reason && reasonClass(message) !== reasonClass(entry.reason)) {
        return { ok: false, note: `failure reason changed at ${entry.failsAt}: ledger "${entry.reason}", now "${message}"` };
      }
      return { ok: true, note: `expected failure at ${entry.failsAt}` };
    }
    if (failedStep) return { ok: false, note: `failure moved from ${entry.failsAt} to ${failedStep} (${message})` };
    return { ok: false, note: `unexpectedly passed: remove ledger entry ${entry.project}|${entry.journey} (failsAt ${entry.failsAt})` };
  }
  if (failedStep) return { ok: false, note: `failed at ${failedStep}: ${message}` };
  return { ok: true, note: 'passed' };
}

const bootStep = (J) => ({
  id: 'boot',
  expect: { layers: 'any', history: 'any', redo: 'any', selected: 'any' },
  run: async (c) => {
    await c.page.goto('/');
    await P.waitAppReady(c.page);
    const fixture = c.project.startsWith('webkit-') && J.fixtureWebkit ? J.fixtureWebkit : J.fixture;
    if (fixture) await P.loadFixture(c.page, fixture);
    await P.raiseUndoLimit(c.page);
    c.preBoot = true;
  },
  post: async (c, pre, now) => {
    if (!now.appReady) throw new Error('app not ready');
    if (!(now.maxHistory >= 30)) throw new Error(`maxHistory is ${now.maxHistory}, history deltas could hide`);
  },
});

// boot has no meaningful "pre": its checks run on the first poll against itself.
async function runBoot(c, J) {
  const page = c.page;
  const step = bootStep(J);
  page.__j.stepId = 'boot';
  try {
    await withBudget(step.run(c), P.BOOT_BUDGET_MS, 'boot');
    const t0 = Date.now();
    let last = null;
    for (;;) {
      try {
        const now = await P.readState(page);
        await step.post(c, now, now);
        if (!(now.scale > 0)) throw new Error(`renderer.scale is ${now.scale}`);
        last = null;
        break;
      } catch (e) {
        last = e;
        if (Date.now() - t0 > P.BOOT_BUDGET_MS) break;
        await P.sleep(100);
      }
    }
    if (last) throw last;
    await P.assertInvariants(page);
    const errs = P.takeErrors(page);
    if (errs.length) throw new Error(errs[0]);
    return null;
  } catch (e) {
    return { failedStep: 'boot', message: P.firstLine(e), jrn: '', passed: [] };
  }
}

const reasonOf = (r) => `${r.jrn ? `${r.jrn} ` : ''}${r.message}`.slice(0, 170);

// ---------------------------------------------------------------------------------------------
// Journeys
// ---------------------------------------------------------------------------------------------
test.describe('finger-only journeys', () => {
  for (const J of JOURNEYS) {
    test(J.id, async ({ page }, testInfo) => {
      test.setTimeout(240000);
      const project = testInfo.project.name;
      const dev = PROJECTS[project];
      expect(dev, `unknown project ${project}`).toBeTruthy();
      P.bindJourney(page, project);
      const ctx = { page, dev, project, stepBudget: J.stepBudget, vars: {} };

      let result = await runBoot(ctx, J);
      if (!result) result = await runSteps(ctx, J.steps);

      if (result.failedStep && SHOTS) {
        fs.mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({ path: path.join(SHOTS, `${project}__${J.id}.png`) }).catch(() => {});
      }
      if (WRITE) {
        fs.mkdirSync(RESULTS_DIR, { recursive: true });
        fs.writeFileSync(path.join(RESULTS_DIR, `${project}__${J.id}.json`), JSON.stringify({
          project, journey: J.id, failsAt: result.failedStep, reason: result.failedStep ? reasonOf(result) : '', reached: result.passed.length, all: result.all,
        }));
      }

      const ledger = readLedger();
      const pinned = ledger.projects.includes(project);
      const entry = pinned ? ledger.entries.find((x) => x.project === project && x.journey === J.id) : null;
      const verdict = judge({ entry, failedStep: result.failedStep, message: result.message });

      if (!pinned) {
        testInfo.annotations.push({ type: 'informational', description: result.failedStep ? `fails at ${result.failedStep}: ${result.message}` : 'all steps pass' });
        return;
      }
      if (verdict.ok && entry) testInfo.annotations.push({ type: 'expected-fail', description: entry.failsAt });
      expect(verdict.ok, verdict.note).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Harness self-tests: the guards and the ledger logic must really reject. Every project runs them.
// ---------------------------------------------------------------------------------------------
test.describe('harness self-test', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    P.bindJourney(page, testInfo.project.name);
    await page.goto('/');
    await P.waitAppReady(page);
  });

  const probe = (page, css) => page.evaluate((style) => { // journey-eval-ok
    const b = document.createElement('button');
    b.id = 'probe';
    b.textContent = 'probe';
    b.style.cssText = style;
    document.body.appendChild(b);
  }, css);

  test('(i) fingerTap rejects a target beyond the device width', async ({ page }, testInfo) => {
    const dev = PROJECTS[testInfo.project.name];
    await probe(page, `position:fixed;top:120px;left:${dev.width + 40}px;width:80px;height:50px;z-index:99999`);
    await expect(P.fingerTap(page, page.locator('#probe'))).rejects.toThrow(/off-screen/);
  });

  test('(ii) fingerTap rejects a covered target', async ({ page }) => {
    await probe(page, 'position:fixed;top:300px;left:40px;width:80px;height:50px;z-index:99990');
    await page.evaluate(() => { // journey-eval-ok
      const o = document.createElement('div');
      o.style.cssText = 'position:fixed;top:290px;left:30px;width:120px;height:80px;z-index:99999;background:#f00';
      document.body.appendChild(o);
    });
    await expect(P.fingerTap(page, page.locator('#probe'))).rejects.toThrow(/covered/);
  });

  // (ii-b) visibility inherits but a descendant can set visibility:visible again: the guard must read the
  // target's OWN computed visibility (plus the hit test), never reject on a hidden ancestor.
  const probeInHidden = (page, childCss) => page.evaluate((css) => { // journey-eval-ok
    const wrap = document.createElement('div');
    wrap.id = 'probe-wrap';
    wrap.style.cssText = 'visibility:hidden;position:fixed;top:120px;left:40px;width:120px;height:80px;z-index:99999';
    const b = document.createElement('button');
    b.id = 'probe';
    b.textContent = 'probe';
    b.style.cssText = `position:absolute;top:10px;left:10px;width:80px;height:50px;${css}`;
    wrap.appendChild(b);
    document.body.appendChild(wrap);
  }, childCss);

  test('(ii-b) fingerTap accepts a visible target under a visibility:hidden ancestor', async ({ page }) => {
    await probeInHidden(page, 'visibility:visible');
    expect(await P.fingerTap(page, page.locator('#probe'))).toBeTruthy();
  });

  test('(ii-b) fingerTap rejects a target that is itself hidden', async ({ page }) => {
    await probeInHidden(page, '');
    await expect(P.fingerTap(page, page.locator('#probe'))).rejects.toThrow(/invisible|covered/);
  });

  // (v) the end points of a drag, pinch and pan must lie on the device screen too.
  const probeBand = (page, dev) => page.evaluate((w) => { // journey-eval-ok
    const d = document.createElement('div');
    d.id = 'probe-band';
    d.style.cssText = `position:fixed;top:120px;left:0;width:${w}px;height:300px;z-index:99999;background:#0a0`;
    document.body.appendChild(d);
  }, dev.width);

  test('(v) fingerDrag, fingerPinch and fingerPan reject an end point beyond the device width', async ({ page }, testInfo) => {
    const dev = PROJECTS[testInfo.project.name];
    await probeBand(page, dev);
    const band = page.locator('#probe-band');
    await expect(P.fingerDrag(page, { x: 30, y: 200, within: band }, { x: dev.width + 40, y: 200 })).rejects.toThrow(/drag end: off-screen/);
    await expect(P.fingerPinch(page, { x: dev.width - 30, y: 250, within: band }, { startDist: 40, endDist: 200 })).rejects.toThrow(/end: off-screen/);
    await expect(P.fingerPan(page, { x: dev.width - 60, y: 250, within: band }, { dx: 80, dy: 0, gap: 40 })).rejects.toThrow(/end: off-screen/);
  });

  test('(v) an end point on the screen is accepted', async ({ page }, testInfo) => {
    const dev = PROJECTS[testInfo.project.name];
    await probeBand(page, dev);
    const r = await P.fingerDrag(page, { x: 30, y: 200, within: page.locator('#probe-band') }, { x: 90, y: 260 });
    expect(r.to.x).toBe(90);
    void dev;
  });

  // (vi) the move check is world-space: a drag that only PANS the view must fail it, even with history pushed.
  test('(vi) the object-move check rejects a pan-only drag and accepts a real move', async () => {
    const box = (dx, dy) => ({ nw: [10 + dx, 10 + dy], ne: [30 + dx, 10 + dy], se: [30 + dx, 30 + dy], sw: [10 + dx, 30 + dy] });
    const st = (o) => ({ worldBoxes: { A: box(o.wx || 0, o.wy || 0) }, offsetX: o.ox || 0, offsetY: o.oy || 0, scale: 2, activeParams: { posX: o.wx || 0, posY: o.wy || 0 }, historyLen: o.h || 0 });
    const c = { vars: {} };
    moveChecks.rememberObject(c, st({}), 'A');
    // observed today: view offset +58,+33, params unchanged, history pushed
    expect(() => moveChecks.assertObjectMoved(c, st({ ox: 58, oy: 33, h: 1 }), 'A', 70, 40)).toThrow(/the view panned/);
    // object params and world bounds unchanged, view held: not a move either
    expect(() => moveChecks.assertObjectMoved(c, st({ h: 1 }), 'A', 70, 40)).toThrow(/world centre moved/);
    // a real move: world centre +40,+25 at scale 2 = 80,50 px
    expect(() => moveChecks.assertObjectMoved(c, st({ wx: 40, wy: 25, h: 1 }), 'A', 70, 40)).not.toThrow();
    expect(() => moveChecks.assertObjectBack(c, st({}), 'A')).not.toThrow();
    expect(() => moveChecks.assertObjectBack(c, st({ wx: 40, wy: 25 }), 'A')).toThrow(/not back/);
  });

  const fakeSteps = (failAt) => ['s1', 's2'].map((id) => ({
    id,
    selfTest: true,
    run: async () => { if (id === failAt) throw new Error('boom'); },
    post: () => {},
  }));

  test('(iii) a failure that moves off the pinned step is reported', async ({ page }) => {
    const r = await runSteps({ page, dev: PROJECTS.x, vars: {} }, fakeSteps('s2'));
    expect(r.failedStep).toBe('s2');
    const v = judge({ entry: { project: 'p', journey: 'JX', failsAt: 's1' }, failedStep: r.failedStep, message: r.message });
    expect(v.ok).toBe(false);
    expect(v.note).toMatch(/failure moved from s1 to s2/);
    const same = judge({ entry: { project: 'p', journey: 'JX', failsAt: 's2' }, failedStep: r.failedStep, message: r.message });
    expect(same.ok).toBe(true);
  });

  test('(iv) a ledger entry on a passing journey is reported', async ({ page }) => {
    const r = await runSteps({ page, dev: PROJECTS.x, vars: {} }, fakeSteps(null));
    expect(r.failedStep).toBeNull();
    const v = judge({ entry: { project: 'p', journey: 'JX', failsAt: 's1' }, failedStep: r.failedStep, message: r.message });
    expect(v.ok).toBe(false);
    expect(v.note).toMatch(/unexpectedly passed/);
    expect(judge({ entry: null, failedStep: 's1', message: 'x' }).ok).toBe(false);
  });

  test('(v) the ledger reason is judged: same class passes, a different class is reported', async () => {
    const entry = { project: 'p', journey: 'JX', failsAt: 's1', reason: 'JRN-003 scale 2.11 -> 2.11, want a zoom in' };
    const same = judge({ entry, failedStep: 's1', message: 'scale 1.23 -> 1.23, want a zoom in' });
    expect(same.ok).toBe(true);
    const changed = judge({ entry, failedStep: 's1', message: 'covered by div.ctxbar-overflow-wrap (target #main-canvas)' });
    expect(changed.ok).toBe(false);
    expect(changed.note).toMatch(/failure reason changed/);
  });
});
