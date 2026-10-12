// The 12 finger-only core journeys (TUX-059), as data: { id, title, fixture, steps: [{ id, run, post, expect, ... }] }.
// The human-readable source is docs/touch-audit/journey-scripts.md. Both files carry the same step ids;
// journeys-static.spec.js fails when they drift.
//
// A step's routes are the §6.2 TARGET UX, not today's workaround. A step for UI that does not exist yet
// fails at that step until the owning lane ships. That is the point of the step-pinned ledger.
//
// Generic postconditions, checked after EVERY step (override per step with `expect`):
//   layers: 0        layerCount delta
//   history: 0       app.history.length delta
//   redo: 'same'     app.redoStack.length unchanged ('any' or a delta number otherwise)
//   selected: 'same' selectedIds equal to the ids before the step ('any' | [ids] | (now, pre) => bool otherwise)
//   renderer.scale > 0, the shell invariants (assertInvariants) and 0 page errors.
//
// `jrn` names the audit finding behind a step; the ledger reason carries it.
'use strict';

const P = require('./pages');


const S = P.SELECTORS;
const L = (c, sel) => c.page.locator(sel);
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

const layerOfType = (st, type) => st.layers.find((l) => l.type === type);
const newIds = (pre, now) => now.layerIds.filter((id) => !pre.layerIds.includes(id));

function boxOf(st, id) {
  const b = st.boxes[id];
  if (!b) throw new Error(`no screen box for layer ${String(id).slice(0, 6)}`);
  const xs = Object.values(b).map((p) => p[0]);
  const ys = Object.values(b).map((p) => p[1]);
  const minx = Math.min(...xs);
  const maxx = Math.max(...xs);
  const miny = Math.min(...ys);
  const maxy = Math.max(...ys);
  return { minx, maxx, miny, maxy, cx: (minx + maxx) / 2, cy: (miny + maxy) / 2, w: maxx - minx, h: maxy - miny, corners: b };
}

// World-space move checks (a screen box also moves when the VIEW pans, so it proves nothing about the object).
// A one-finger drag on a selected object that only pans the canvas changes renderer.offsetX/offsetY and leaves the
// object's world bounds and params alone: both checks below must reject that.
function worldCenter(st, id) {
  const b = st.worldBoxes[id];
  if (!b) throw new Error(`no world box for layer ${String(id).slice(0, 6)}`);
  const xs = Object.values(b).map((p) => p[0]);
  const ys = Object.values(b).map((p) => p[1]);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

// Records the object's world centre, params and the view offset before the move.
function rememberObject(c, st, id) {
  c.vars.wc = worldCenter(st, id);
  c.vars.off = { x: st.offsetX, y: st.offsetY };
  c.vars.oparams = JSON.stringify(st.activeParams);
}

const viewHeld = (c, now) => near(now.offsetX, c.vars.off.x, 0.5) && near(now.offsetY, c.vars.off.y, 0.5);

// The object moved by about (dx, dy) screen px in WORLD space and the view did not pan.
function assertObjectMoved(c, now, id, dx, dy) {
  if (!viewHeld(c, now)) throw new Error(`the view panned (${Math.round(now.offsetX - c.vars.off.x)},${Math.round(now.offsetY - c.vars.off.y)}) instead of the object moving`);
  const wc = worldCenter(now, id);
  const mx = (wc.x - c.vars.wc.x) * now.scale;
  const my = (wc.y - c.vars.wc.y) * now.scale;
  if (!(mx > dx * 0.55 && my > dy * 0.55)) throw new Error(`object world centre moved (${Math.round(mx)},${Math.round(my)}) px, want about (${dx},${dy})`);
  if (JSON.stringify(now.activeParams) === c.vars.oparams && now.activeParams.posX !== undefined) throw new Error('the object params did not change');
}

// The object is back at its recorded world position and the view held.
function assertObjectBack(c, now, id) {
  if (!viewHeld(c, now)) throw new Error('the view changed during the undo');
  const wc = worldCenter(now, id);
  if (Math.hypot(wc.x - c.vars.wc.x, wc.y - c.vars.wc.y) * now.scale > 8) throw new Error('the object is not back at its original world position');
}

const onCanvas = (c, x, y) => ({ x, y, within: L(c, S.canvas) });

// A spot on the canvas where the fingers of a pinch sit on empty canvas at the start AND at the end:
// clear of the selected object and of the floating overlays (toolbar, HUD, context bar).
// `opts.halves` lists the finger offsets from the centre to clear (startDist / 2 and endDist / 2).
// `opts.drag` {dx, dy} clears the start and end point of a one-finger drag.
function emptyPinchSpot(st, avoidBox, opts = {}) {
  const halves = opts.halves || [40];
  const half = Math.max(...halves);
  const cr = st.canvasRect;
  const pad = 16;
  const rects = [avoidBox, ...st.overlays];
  let best = null;
  for (let y = cr.y + 40; y < cr.y + cr.h - 40; y += 20) {
    for (let x = cr.x + half + 70; x <= cr.x + cr.w - half - 70; x += 20) {
      // drag + halves (a two-finger pan): clear both fingers at the start and at the end of the move.
      const dd = opts.drag;
      const pts = dd && !opts.halves ? [[x, y], [x + dd.dx, y + dd.dy]]
        : halves.flatMap((h) => [[x - h, y], [x + h, y], ...(dd ? [[x - h + dd.dx, y + dd.dy], [x + h + dd.dx, y + dd.dy]] : [])]);
      const clear = pts.every(([fx, fy]) => fx > cr.x && fx < cr.x + cr.w && fy > cr.y && fy < cr.y + cr.h && rects.every((r) => !(fx > r.minx - pad && fx < r.maxx + pad && fy > r.miny - pad && fy < r.maxy + pad)));
      if (!clear) continue;
      // opts.keepBox + opts.zoom: pick the pivot after which the zoomed object centre lies closest to the canvas centre, so the
      // pinch does not throw the object off the canvas (the next step pinches on it).
      let d = Math.hypot(x - (cr.x + cr.w / 2), y - (cr.y + cr.h / 2));
      if (opts.keepBox) {
        const k = opts.zoom || 1.8;
        d = Math.hypot(x + k * (opts.keepBox.cx - x) - (cr.x + cr.w / 2), y + k * (opts.keepBox.cy - y) - (cr.y + cr.h / 2));
      }
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  return best;
}

// A pinch centre where finger 1 (the left start point) lies on the visible part of the object and no start or end finger of
// either hand is under a floating overlay. Returns null when no such spot exists (the caller then fails with a message the
// ledger rejects, never a product reason).
function objectPinchSpot(st, box, startDist, endDist) {
  const cr = st.canvasRect;
  const pad = 16;
  const hs = startDist / 2;
  const he = endDist / 2;
  const free = (x, y) => x > cr.x && x < cr.x + cr.w && y > cr.y && y < cr.y + cr.h
    && st.overlays.every((r) => !(x > r.minx - pad && x < r.maxx + pad && y > r.miny - pad && y < r.maxy + pad));
  let best = null;
  for (let y = Math.max(box.miny, cr.y); y <= Math.min(box.maxy, cr.y + cr.h); y += 12) {
    for (let fx = Math.max(box.minx, cr.x); fx <= Math.min(box.maxx, cr.x + cr.w); fx += 12) {
      const cx = fx + hs; // finger 1 starts at fx, on the object
      const pts = [[fx, y], [cx + hs, y], [cx - he, y], [cx + he, y]];
      if (!pts.every(([px, py]) => free(px, py))) continue;
      const d = Math.hypot(fx - box.cx, y - box.cy);
      if (!best || d < best.d) best = { x: cx, y, d };
    }
  }
  return best;
}

function paneStates(c) {
  return Promise.all([P.paneOpen(c.page, 'left'), P.paneOpen(c.page, 'right')]);
}

async function visibleInside(c, sel) {
  const loc = L(c, sel).first();
  if (!(await loc.isVisible())) return 'not visible';
  const b = await loc.boundingBox();
  if (!b) return 'no box';
  const d = c.dev;
  if (b.x < -1 || b.y < -1 || b.x + b.width > d.width + 1 || b.y + b.height > d.height + 1) {
    return `box (${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.width)}x${Math.round(b.height)}) leaves the ${d.width}x${d.height} screen`;
  }
  return null;
}

// The layer list scrolls inside itself; on short screens (iPhone landscape: a 100 px list) a row can sit below its
// fold, under the draw-order bar. A finger scrolls the list first. No-op when the row is already in view.
const rowIntoView = (c, row) => P.fingerScrollInto(c.page, row, L(c, '#layer-list'), { topInset: 0 });

// ---- reusable step builders ------------------------------------------------------------------
const stepOpenLayers = (j) => ({
  id: `${j}.open-layers`, action: 'tap', route: 'tap the Layers drawer control (docked on touch-wide: nothing to tap)',
  selector: 'SELECTORS.paneToggle.right', expects: 'right pane open; no data change', jrn: 'JRN-001',
  run: (c) => P.openLayers(c.page),
  post: async (c) => { if (!(await P.paneOpen(c.page, 'right'))) throw new Error('right pane is not open'); },
});

const stepOpenGenerator = (j) => ({
  id: `${j}.open-generator`, action: 'tap', route: 'tap the Generator drawer control (docked on touch-wide: nothing to tap)',
  selector: 'SELECTORS.paneToggle.left', expects: 'left pane open; generator trigger visible', jrn: 'JRN-001',
  run: (c) => P.openGenerator(c.page),
  post: async (c) => { if (!(await P.paneOpen(c.page, 'left'))) throw new Error('left pane is not open'); },
});

const stepAddMenu = (j) => ({
  id: `${j}.add-menu`, action: 'tap', route: 'Layers pane > Add Layer (+)', selector: 'SELECTORS.addLayer',
  expects: 'add menu visible; layers +0; history +0',
  run: (c) => P.fingerTap(c.page, L(c, S.addLayer)),
  post: async (c) => { if (!(await L(c, S.addMenu).isVisible())) throw new Error('the add menu did not open'); },
});

const stepAlgoDrill = (j) => ({
  id: `${j}.algo-drill`, action: 'tap', route: 'Add Layer > Algorithm Layer drills down and adds nothing (TUX-035)', selector: 'SELECTORS.algoParent',
  expects: 'layers +0 (no stray default layer); submenu visible and inside the screen', jrn: 'JRN-007',
  run: (c) => P.fingerTap(c.page, L(c, S.algoParent)),
  post: async (c) => {
    const why = await visibleInside(c, S.algoSubmenu);
    if (why) throw new Error(`algorithm submenu: ${why}`);
  },
});

const stepPickAlgo = (j, type, extra = {}) => ({
  id: `${j}.pick-${type}`, action: 'tap', route: `Algorithm submenu > ${type}`, selector: `SELECTORS.algoItem('${type}')`,
  expects: `layers +1 of type ${type}; history +1; selected = the new layer`, jrn: 'JRN-007',
  expect: { layers: 1, history: 1, selected: (now, pre) => newIds(pre, now).length === 1 && sameSet(now.selectedIds, newIds(pre, now)) },
  run: async (c) => {
    // The drill list scrolls inside itself (TUX-035 req 2): bring the row into view with a finger first.
    await P.fingerScrollInto(c.page, L(c, S.algoItem(type)), L(c, S.algoSubmenu));
    await P.fingerTap(c.page, L(c, S.algoItem(type)));
  },
  post: async (c, pre, now) => {
    const id = newIds(pre, now)[0];
    const l = now.layers.find((x) => x.id === id);
    if (!l || l.type !== type) throw new Error(`new layer type is ${l && l.type}, want ${type}`);
  },
  ...extra,
});

const stepCanvasReady = (j, what) => ({
  id: `${j}.${what}`, action: 'tap', route: 'close any drawer that covers the canvas (same control as opening it)', selector: 'SELECTORS.paneToggle',
  expects: 'no open pane overlaps the canvas', jrn: 'JRN-001',
  run: (c) => P.dismissDrawers(c.page),
  post: () => {},
});

// J2 rename-open: the generous wait for the input to appear. The latency is not bounded: on the heavy document every
// layer tap costs the main thread 1-2 s in Chromium device emulation (more under machine load), so a latency bound
// would measure machine load, not the double-tap contract (TUX-038 req 5). No TUX sets a tap-latency limit.
const RENAME_WAIT_MS = 6000;

// ---- the journeys ----------------------------------------------------------------------------
const JOURNEYS = [];

// J1 ------------------------------------------------------------------------------------------
JOURNEYS.push({
  id: 'J1', title: 'Pick algorithm, change 3 sliders, pick a preset', fixture: null,
  steps: [
    stepOpenLayers('j1'),
    stepAddMenu('j1'),
    stepAlgoDrill('j1'),
    stepPickAlgo('j1', 'lissajous'),
    stepOpenGenerator('j1'),
    ...[0, 1, 2].map((i) => ({
      id: `j1.slider-${i + 1}`, action: 'drag', route: `scroll the Generator pane by finger, drag the thumb of slider ${i + 1}`, selector: `SELECTORS.slider nth(${i})`,
      expects: 'slider value moved in the dragged direction; the active layer param changed; history +1', jrn: 'JRN-013',
      expect: { history: 1 },
      run: async (c) => {
        const sl = L(c, S.slider).nth(i);
        await P.fingerScrollInto(c.page, sl, L(c, '#left-panel-content'));
        c.vars.slider = await P.fingerSlider(c.page, sl, 0.25);
      },
      post: async (c, pre, now) => {
        const { before, after, dir } = c.vars.slider;
        if (!(dir > 0 ? after > before : after < before)) throw new Error(`slider value ${before} -> ${after}, expected ${dir > 0 ? 'up' : 'down'}`);
        if (JSON.stringify(now.activeParams) === JSON.stringify(pre.activeParams)) throw new Error('the layer params did not change');
      },
    })),
    {
      id: 'j1.preset-open', action: 'tap', route: 'Generator pane > preset dropdown', selector: 'SELECTORS.presetTrigger',
      expects: 'preset list visible; history +0',
      run: async (c) => {
        await P.fingerScrollInto(c.page, L(c, S.presetTrigger), L(c, '#left-panel-content'));
        await P.fingerTap(c.page, L(c, S.presetTrigger));
      },
      post: async (c) => { if (!(await L(c, S.presetPopover).isVisible())) throw new Error('the preset list did not open'); },
    },
    {
      id: 'j1.preset-pick', action: 'tap', route: 'pick a preset other than the active one', selector: 'SELECTORS.presetOptionInactive',
      expects: 'the preset trigger names a different preset; the slider edits are replaced; history +1', expect: { history: 1 },
      run: async (c) => {
        c.vars.label = (await L(c, S.presetTrigger).textContent()).trim();
        c.vars.params = JSON.stringify((await P.readState(c.page)).activeParams);
        await P.fingerTap(c.page, L(c, S.presetOptionInactive).first());
      },
      post: async (c, pre, now) => {
        const label = (await L(c, S.presetTrigger).textContent()).trim();
        if (label === c.vars.label) throw new Error(`the preset trigger still reads "${label}"`);
        if (JSON.stringify(now.activeParams) === c.vars.params) throw new Error('the layer params did not change');
      },
    },
  ],
});

// J2 ------------------------------------------------------------------------------------------
JOURNEYS.push({
  id: 'J2', title: 'Add, rename (heavy document), reorder, hide/show, delete a layer', fixture: 'journey-heavy',
  // Both engines load the same heavy document. JRN-010 was a clock defect (rename timed by handler time, not by
  // event.timeStamp); TUX-038 req 5 fixed it, so a heavy document must still rename on a real double-tap.
  // The Chromium double-tap carries hardware touch times (helpers/touch.js doubleTap); WebKit cannot stamp a
  // touch, but runs this document ~20x faster, so its tap round trip stays inside the 350 ms window.
  // Every step on a heavy document is slow by design (JRN-010): a 5 s budget would pin cells on machine load, so J2 steps get 20 s.
  stepBudget: 20000,
  steps: [
    stepOpenLayers('j2'),
    stepAddMenu('j2'),
    {
      id: 'j2.add-empty', action: 'tap', route: 'Add Layer > Empty Layer', selector: 'SELECTORS.addItem(\'layer\')',
      expects: 'layers +1; history +1; selected = the new layer',
      expect: { layers: 1, history: 1, selected: (now, pre) => newIds(pre, now).length === 1 && sameSet(now.selectedIds, newIds(pre, now)) },
      run: (c) => P.fingerTap(c.page, L(c, S.addItem('layer'))),
      post: () => {},
    },
    {
      id: 'j2.rename-open', action: 'doubleTap', route: 'double-tap the name of a heavy layer (timestamp-based, TUX-038)', selector: 'SELECTORS.cardName',
      expects: `rename input appears within ${RENAME_WAIT_MS} ms of the double-tap and holds focus; layers +0`, jrn: 'JRN-010', expect: { selected: 'any' },
      // Own budget: the step waits up to RENAME_WAIT_MS for the input (the latency is recorded in c.vars.renameMs).
      // It is NOT pinned on exceeding the 5000 ms step budget.
      budget: RENAME_WAIT_MS + 40000,
      run: async (c) => {
        const st = await P.readState(c.page);
        c.vars.target = st.layers.find((l) => l.type === 'flowfield').id;
        await rowIntoView(c, L(c, `${S.layerCard(c.vars.target)} ${S.cardName}`));
        await P.fingerDoubleTap(c.page, L(c, `${S.layerCard(c.vars.target)} ${S.cardName}`));
        const t0 = Date.now();
        c.vars.renameMs = null;
        while (Date.now() - t0 < RENAME_WAIT_MS) {
          if (await L(c, S.renameInput).count()) { c.vars.renameMs = Date.now() - t0; break; }
          await P.sleep(50);
        }
      },
      post: (c) => {
        if (c.vars.renameMs === null) throw new Error(`the rename input never appeared within ${RENAME_WAIT_MS} ms of the double-tap`);
      },
    },
    {
      id: 'j2.rename-type', action: 'softType', route: 'type the new name with the soft keyboard', selector: 'focused rename input',
      expects: 'rename input holds the typed text',
      run: (c) => P.softType(c.page, 'Renamed'),
      post: async (c) => { if ((await L(c, S.renameInput).inputValue()) !== 'Renamed') throw new Error('the typed name is not in the field'); },
    },
    {
      id: 'j2.rename-commit', action: 'tap', route: 'tap a neutral spot in the pane to commit (the status bar; where it has no height, the already-active Layers tab)', selector: 'SELECTORS.layerStatusBar | SELECTORS.layersTab',
      expects: 'layer name = Renamed; history +1', expect: { history: 1, selected: 'any' },
      // The rename commits on blur, so any neutral tap commits it. On iPhone landscape the status bar is squeezed to
      // 0 px under the draw-order bar (recorded in docs/touch-audit/journey-triage.md); a finger taps what it can see.
      run: async (c) => {
        const bar = await L(c, S.layerStatusBar).boundingBox();
        await P.fingerTap(c.page, L(c, bar && bar.height >= 20 ? S.layerStatusBar : S.layersTab));
      },
      post: (c, pre, now) => { if (!now.layers.some((l) => l.name === 'Renamed')) throw new Error('no layer carries the new name'); },
    },
    {
      id: 'j2.reorder', action: 'drag', route: 'drag the row grip of row 1 below row 2, no hold (TUX-044)', selector: 'SELECTORS.cardGrip',
      expects: 'layer order changed (same ids); history +1', expect: { history: 1, selected: 'any' },
      run: async (c) => {
        const rows = L(c, S.layerCards);
        const second = await rows.nth(1).boundingBox();
        const grip = rows.nth(0).locator(S.cardGrip);
        const gb = await grip.boundingBox();
        c.vars.before = (await P.readState(c.page)).layerIds;
        // Row 2 may sit below the list's fold (iPhone landscape: a 100 px list). A finger then drags to the list's
        // bottom edge and rests there so the list auto-scrolls (TUX-044 req 5); it never drops outside the list.
        const lb = await L(c, '#layer-list').boundingBox();
        const want = second.y + second.height * 0.85;
        const edge = lb.y + lb.height - 6;
        await P.fingerDrag(c.page, grip, { x: gb.x + gb.width / 2, y: Math.min(want, edge) }, { steps: 14, stepDelayMs: 15, endHoldMs: want > edge ? 1500 : 0 });
      },
      post: (c, pre, now) => {
        if (!sameSet(now.layerIds, pre.layerIds)) throw new Error('the layer set changed');
        if (now.layerIds.join() === pre.layerIds.join()) throw new Error('the layer order did not change');
      },
    },
    {
      id: 'j2.hide', action: 'tap', route: 'tap the eye of the first row', selector: 'SELECTORS.cardEye',
      expects: 'that layer is hidden', expect: { history: 'any', selected: 'any' },
      run: async (c) => {
        c.vars.id = (await L(c, S.layerCards).first().getAttribute('data-lvl-id'));
        await P.fingerTap(c.page, L(c, `${S.layerCard(c.vars.id)} .lvl-ib[title="Hide"]`));
      },
      post: (c, pre, now) => { if (now.layers.find((l) => l.id === c.vars.id).visible) throw new Error('the layer is still visible'); },
    },
    {
      id: 'j2.show', action: 'tap', route: 'tap the eye again', selector: 'SELECTORS.cardEye',
      expects: 'that layer is visible again', expect: { history: 'any', selected: 'any' },
      run: (c) => P.fingerTap(c.page, L(c, `${S.layerCard(c.vars.id)} .lvl-ib[title="Show"]`)),
      post: (c, pre, now) => { if (!now.layers.find((l) => l.id === c.vars.id).visible) throw new Error('the layer is still hidden'); },
    },
    {
      id: 'j2.delete-menu', action: 'tap', route: 'tap the row ⋯ button (TUX-034)', selector: 'SELECTORS.cardMore',
      expects: 'layer menu visible; layers +0', expect: { selected: 'any' },
      run: async (c) => {
        c.vars.id = await L(c, S.layerCards).first().getAttribute('data-lvl-id');
        await P.fingerTap(c.page, L(c, `${S.layerCard(c.vars.id)} ${S.cardMore}`));
      },
      post: async (c) => { if (!(await L(c, S.layerMenuEntry).first().isVisible())) throw new Error('the layer menu did not open'); },
    },
    {
      id: 'j2.delete', action: 'tap', route: 'layer menu > Delete', selector: 'SELECTORS.layerMenuEntry Delete',
      expects: 'layers -1; history +1', expect: { layers: -1, history: 1, selected: 'any' },
      run: (c) => P.fingerTap(c.page, L(c, S.layerMenuEntry).filter({ hasText: /^Delete/ })),
      post: (c, pre, now) => { if (now.layerIds.includes(c.vars.id)) throw new Error('the layer is still there'); },
    },
  ],
});

// J3 ------------------------------------------------------------------------------------------
const selectOval = (j) => ({
  id: `${j}.select-object`, action: 'tap', route: 'tap the oval on the canvas (Selection tool)', selector: 'canvas point at the object centre',
  expects: 'selected = [oval]; history +0', expect: { selected: (now, pre) => now.selectedIds.length === 1 && now.layers.find((l) => l.id === now.selectedIds[0]).type === 'shape' },
  run: async (c) => {
    await P.dismissDrawers(c.page);
    const st = await P.readState(c.page);
    const o = boxOf(st, layerOfType(st, 'shape').id);
    c.vars.oval = layerOfType(st, 'shape').id;
    await P.fingerTap(c.page, onCanvas(c, o.cx, o.cy));
  },
  post: () => {},
});

JOURNEYS.push({
  id: 'J3', title: 'Select, move, scale by handle, rotate', fixture: 'journey-basic',
  steps: [
    selectOval('j3'),
    {
      id: 'j3.move', action: 'drag', route: 'quick drag on the selected object (Q4, 6 px slop, no hold)', selector: 'canvas point at the object centre',
      expects: 'object WORLD position moved by about the drag vector; view offset unchanged; history +1', jrn: 'JRN-003', expect: { history: 1 },
      run: async (c) => {
        const st = await P.readState(c.page);
        const o = boxOf(st, c.vars.oval);
        c.vars.box = o;
        rememberObject(c, st, c.vars.oval);
        await P.fingerDrag(c.page, onCanvas(c, o.cx, o.cy), { dx: 70, dy: 40 }, { steps: 12, stepDelayMs: 8 });
      },
      post: (c, pre, now) => assertObjectMoved(c, now, c.vars.oval, 70, 40),
    },
    {
      id: 'j3.scale', action: 'drag', route: 'drag the south-east resize handle outward', selector: 'canvas point at the SE corner',
      expects: 'object box wider and taller; history +1', jrn: 'JRN-011', expect: { history: 1 },
      run: async (c) => {
        const st = await P.readState(c.page);
        const o = boxOf(st, c.vars.oval);
        c.vars.box = o;
        await P.fingerDrag(c.page, onCanvas(c, o.corners.se[0], o.corners.se[1]), { dx: 50, dy: 50 }, { steps: 12, stepDelayMs: 8 });
      },
      post: (c, pre, now) => {
        const o = boxOf(now, c.vars.oval);
        if (!(o.w - c.vars.box.w > 20 && o.h - c.vars.box.h > 20)) throw new Error(`object grew by (${Math.round(o.w - c.vars.box.w)},${Math.round(o.h - c.vars.box.h)}), want about (50,50)`);
      },
    },
    {
      id: 'j3.rotate', action: 'drag', route: 'drag from just outside the north-east corner around the object', selector: 'canvas point outside the NE corner',
      expects: 'rotation param changed; history +1', jrn: 'JRN-011', expect: { history: 1 },
      run: async (c) => {
        const st = await P.readState(c.page);
        const o = boxOf(st, c.vars.oval);
        c.vars.rot = st.activeParams.rotation;
        const ne = o.corners.ne;
        // Start on the VISIBLE rotate affordance (it flips corner when chrome or the canvas edge covers NE).
        // Fallback: 24,-24 is 34 px from the NE corner, inside the 22..48 px touch rotate band.
        const aff = await P.readRotateAffordance(c.page, c.vars.oval);
        const start = aff || { x: ne[0] + 24, y: ne[1] - 24 };
        const v = { x: start.x - o.cx, y: start.y - o.cy };
        const a = (35 * Math.PI) / 180;
        const end = { x: o.cx + v.x * Math.cos(a) - v.y * Math.sin(a), y: o.cy + v.x * Math.sin(a) + v.y * Math.cos(a) };
        await P.fingerDrag(c.page, onCanvas(c, start.x, start.y), end, { steps: 14, stepDelayMs: 8 });
      },
      post: (c, pre, now) => { if (near(now.activeParams.rotation, c.vars.rot, 3)) throw new Error(`rotation stayed ${now.activeParams.rotation}`); },
    },
  ],
});

// J4 ------------------------------------------------------------------------------------------
JOURNEYS.push({
  id: 'J4', title: 'Pan, pinch-zoom (empty canvas and on the object), fit to view, undo/redo', fixture: 'journey-basic',
  steps: [
    selectOval('j4'),
    {
      id: 'j4.pinch-empty', action: 'pinch', route: 'pinch with the first finger on empty canvas (JRN-003)', selector: 'canvas point on empty canvas',
      expects: 'scale grows; selection kept; history +0; the object params are untouched', jrn: 'JRN-003',
      run: async (c) => {
        const st = await P.readState(c.page);
        const spot = emptyPinchSpot(st, boxOf(st, c.vars.oval), { halves: [40, 75], keepBox: boxOf(st, c.vars.oval), zoom: 150 / 80 });
        if (!spot) throw new Error('no empty canvas spot for the first finger');
        c.vars.scale = st.scale;
        c.vars.params = JSON.stringify(st.activeParams);
        await P.fingerPinch(c.page, onCanvas(c, spot.x, spot.y), { startDist: 80, endDist: 150, staggerMs: 40 });
      },
      post: (c, pre, now) => {
        if (!(now.scale > c.vars.scale * 1.15)) throw new Error(`scale ${c.vars.scale.toFixed(2)} -> ${now.scale.toFixed(2)}, want a zoom in`);
        if (JSON.stringify(now.activeParams) !== c.vars.params) throw new Error('the pinch changed the object params');
      },
    },
    {
      id: 'j4.pinch-object', action: 'pinch', route: 'pinch with the first finger on the selected object (JRN-003)', selector: 'canvas point on the object',
      expects: 'scale grows; selection kept; the object is not moved or resized', jrn: 'JRN-003',
      run: async (c) => {
        const st = await P.readState(c.page);
        const spot = objectPinchSpot(st, boxOf(st, c.vars.oval), 100, 150);
        if (!spot) throw new Error('no uncovered on-object spot: the oval has no visible part clear of the overlays for a two-finger pinch');
        c.vars.scale = st.scale;
        c.vars.params = JSON.stringify(st.activeParams);
        await P.fingerPinch(c.page, onCanvas(c, spot.x, spot.y), { startDist: 100, endDist: 150, staggerMs: 40 });
      },
      post: (c, pre, now) => {
        if (!(now.scale > c.vars.scale * 1.1)) throw new Error(`scale ${c.vars.scale.toFixed(2)} -> ${now.scale.toFixed(2)}, want a zoom in`);
        if (JSON.stringify(now.activeParams) !== c.vars.params) throw new Error('the pinch moved or resized the object');
      },
    },
    {
      id: 'j4.pan', action: 'twoFingerPan', route: 'two-finger pan on the canvas', selector: 'canvas point',
      expects: 'view offset changed; scale unchanged; history +0',
      run: async (c) => {
        const st = await P.readState(c.page);
        c.vars.view = { x: st.offsetX, y: st.offsetY, s: st.scale };
        const nowhere = { minx: 1e9, maxx: 1e9, miny: 1e9, maxy: 1e9 };
        const spot = emptyPinchSpot(st, nowhere, { halves: [50], drag: { dx: -80, dy: 0 } });
        if (!spot) throw new Error('no empty canvas spot for the two-finger pan');
        await P.fingerPan(c.page, onCanvas(c, spot.x, spot.y), { dx: -80, dy: 0, gap: 100 });
      },
      post: (c, pre, now) => {
        if (Math.abs(now.offsetX - c.vars.view.x) < 30) throw new Error(`view offset moved ${Math.round(now.offsetX - c.vars.view.x)} px, want about 80`);
        if (!near(now.scale, c.vars.view.s, c.vars.view.s * 0.02)) throw new Error('the pan changed the scale');
      },
    },
    {
      id: 'j4.fit', action: 'tap', route: 'tap Fit in the canvas HUD (TUX-020, TUX-009)', selector: 'SELECTORS.hudFit',
      expects: 'view transform changed; scale > 0; pane states unchanged', jrn: 'JRN-002',
      run: async (c) => {
        const st = await P.readState(c.page);
        c.vars.view = { x: st.offsetX, y: st.offsetY, s: st.scale };
        c.vars.panes = await paneStates(c);
        // No View > Reset View fallback (journey-scripts.md 'Forbidden routes'): a missing HUD Fit fails the step.
        const hud = await P.rendered(c.page, S.hudFit.map(P.visible));
        if (!(await hud.count() && await hud.boundingBox())) throw new Error(`TUX-020 missing direct control: ${S.hudFit.join(' | ')}`);
        await P.fingerTap(c.page, hud);
      },
      post: async (c, pre, now) => {
        if (near(now.scale, c.vars.view.s, 0.001) && near(now.offsetX, c.vars.view.x, 1)) throw new Error('the view did not change');
        const panes = await paneStates(c);
        if (panes.join() !== c.vars.panes.join()) throw new Error(`pane states changed ${c.vars.panes} -> ${panes}`);
      },
    },
    {
      id: 'j4.move', action: 'drag', route: 'quick drag the selected object', selector: 'canvas point at the object centre',
      expects: 'object WORLD position moved; view offset unchanged; history +1', jrn: 'JRN-003', expect: { history: 1 },
      run: async (c) => {
        const st = await P.readState(c.page);
        const o = boxOf(st, c.vars.oval);
        c.vars.box = o;
        rememberObject(c, st, c.vars.oval);
        await P.fingerDrag(c.page, onCanvas(c, o.cx, o.cy), { dx: 50, dy: 30 }, { steps: 10, stepDelayMs: 8 });
      },
      post: (c, pre, now) => assertObjectMoved(c, now, c.vars.oval, 50, 30),
    },
    {
      id: 'j4.undo', action: 'tap', route: 'tap the direct Undo button (TUX-020)', selector: 'SELECTORS.headerUndo',
      expects: 'history -1; redo +1; the object is back at its original world position', expect: { history: -1, redo: 1, selected: 'any' },
      run: (c) => P.undo(c.page),
      post: (c, pre, now) => assertObjectBack(c, now, c.vars.oval),
    },
    {
      id: 'j4.redo', action: 'tap', route: 'tap the direct Redo button (TUX-020)', selector: 'SELECTORS.headerRedo',
      expects: 'history +1; redo -1; the object is at its moved world position again', expect: { history: 1, redo: -1, selected: 'any' },
      run: (c) => P.redo(c.page),
      post: (c, pre, now) => assertObjectMoved(c, now, c.vars.oval, 50, 30),
    },
  ],
});

// J5 ------------------------------------------------------------------------------------------
JOURNEYS.push({
  id: 'J5', title: 'Draw a closed path, long-press the Shape group for Rectangle, edit an anchor', fixture: null,
  steps: [
    stepCanvasReady('j5', 'canvas-ready'),
    {
      id: 'j5.pen-tool', action: 'tap', route: 'tap the Pen tool', selector: 'SELECTORS.tool(\'pen\')',
      expects: 'active tool = pen',
      run: (c) => P.selectTool(c.page, 'pen'),
      post: (c, pre, now) => { if (now.activeTool !== 'pen') throw new Error(`active tool is ${now.activeTool}`); },
    },
    {
      id: 'j5.place-anchors', action: 'tap', route: 'tap three anchor points on the canvas', selector: 'canvas points',
      expects: 'three anchors placed; no stray layer', expect: { history: 'any' },
      run: async (c) => {
        const st = await P.readState(c.page);
        const cr = st.canvasRect;
        c.vars.pts = [[0.35, 0.35], [0.65, 0.35], [0.5, 0.65]].map(([fx, fy]) => ({ x: cr.x + cr.w * fx, y: cr.y + cr.h * fy }));
        for (const p of c.vars.pts) await P.fingerTap(c.page, onCanvas(c, p.x, p.y));
      },
      post: () => {},
    },
    {
      id: 'j5.close-path', action: 'tap', route: 'tap the first anchor to close the path', selector: 'canvas point at the first anchor',
      expects: 'layers +1; history +1', expect: { layers: 1, history: 1, selected: 'any' },
      run: (c) => P.fingerTap(c.page, onCanvas(c, c.vars.pts[0].x, c.vars.pts[0].y)),
      post: () => {},
    },
    {
      id: 'j5.shape-menu', action: 'longPress', route: 'long-press the Shape tool group; the variant menu stays open after the finger lifts (JRN-008)', selector: 'SELECTORS.tool(\'shape\')',
      expects: 'shape variant menu visible', jrn: 'JRN-008', expect: { selected: 'any' },
      run: async (c) => {
        await P.fingerLongPress(c.page, L(c, S.tool('shape')), { ms: 700 });
        await P.sleep(350);
      },
      post: async (c) => { if (!(await L(c, S.shapeMenu).isVisible())) throw new Error('the shape variant menu closed or never opened'); },
    },
    {
      id: 'j5.shape-pick', action: 'tap', route: 'tap Rectangle in the variant menu', selector: 'SELECTORS.shapeVariant(\'rect\')',
      expects: 'active tool = a rectangle shape tool', jrn: 'JRN-008', expect: { selected: 'any' },
      run: (c) => P.fingerTap(c.page, L(c, S.shapeVariant('rect'))),
      post: (c, pre, now) => { if (!/rect/.test(String(now.activeTool))) throw new Error(`active tool is ${now.activeTool}`); },
    },
    {
      id: 'j5.draw-rect', action: 'drag', route: 'drag a rectangle on the canvas', selector: 'canvas points',
      expects: 'layers +1; history +1; selected = the rectangle', expect: { layers: 1, history: 1, selected: 'any' },
      run: async (c) => {
        const st = await P.readState(c.page);
        const cr = st.canvasRect;
        await P.fingerDrag(c.page, onCanvas(c, cr.x + cr.w * 0.2, cr.y + cr.h * 0.7), { x: cr.x + cr.w * 0.5, y: cr.y + cr.h * 0.9 }, { steps: 10, stepDelayMs: 8 });
      },
      post: (c, pre, now) => { if (now.selectedIds.length !== 1) throw new Error('the new rectangle is not selected'); },
    },
    {
      id: 'j5.direct-tool', action: 'tap', route: 'tap the Direct Selection tool', selector: 'SELECTORS.tool(\'direct\')',
      expects: 'active tool = direct', expect: { selected: 'any' },
      run: (c) => P.selectTool(c.page, 'direct'),
      post: (c, pre, now) => { if (now.activeTool !== 'direct') throw new Error(`active tool is ${now.activeTool}`); },
    },
    {
      id: 'j5.drag-anchor', action: 'drag', route: 'drag the north-west corner anchor of the rectangle', selector: 'canvas point at the NW corner',
      expects: 'the rectangle box changed; history +1', expect: { history: 1, selected: 'any' },
      run: async (c) => {
        const st = await P.readState(c.page);
        const id = st.selectedIds[0];
        c.vars.id = id;
        const o = boxOf(st, id);
        c.vars.box = o;
        await P.fingerDrag(c.page, onCanvas(c, o.corners.nw[0], o.corners.nw[1]), { dx: -30, dy: -30 }, { steps: 10, stepDelayMs: 8 });
      },
      post: (c, pre, now) => { if (!(boxOf(now, c.vars.id).w - c.vars.box.w > 15)) throw new Error('the anchor did not move'); },
    },
  ],
});

// J6 ------------------------------------------------------------------------------------------
JOURNEYS.push({
  id: 'J6', title: 'Mirror modifier: add, change angle, apply a mask', fixture: 'journey-basic',
  steps: [
    stepOpenLayers('j6'),
    stepAddMenu('j6'),
    {
      id: 'j6.add-mirror', action: 'tap', route: 'Add Layer > Mirror Modifier Group', selector: 'SELECTORS.addItem(\'mirror\')',
      expects: 'layers +1 (the modifier group); history +1; selected = the group', jrn: 'JRN-006',
      expect: { layers: 1, history: 1, selected: (now, pre) => newIds(pre, now).length === 1 && sameSet(now.selectedIds, newIds(pre, now)) },
      run: (c) => P.fingerTap(c.page, L(c, S.addItem('mirror'))),
      post: (c, pre, now) => { if (now.activeType !== 'group') throw new Error(`active layer type is ${now.activeType}`); },
    },
    stepOpenGenerator('j6'),
    {
      id: 'j6.angle', action: 'drag', route: 'drag the mirror Angle slider thumb', selector: 'SELECTORS.slider nth(0)',
      expects: 'angle slider value changed; history +1', jrn: 'JRN-013', expect: { history: 1 },
      run: async (c) => {
        const sl = L(c, S.slider).first();
        await P.fingerScrollInto(c.page, sl, L(c, '#left-panel-content'));
        c.vars.slider = await P.fingerSlider(c.page, sl, 0.25);
      },
      post: (c) => { if (c.vars.slider.before === c.vars.slider.after) throw new Error('the angle value did not change'); },
    },
    // Only one drawer is open at a time (TUX-008): the Generator drawer replaced Layers, so reopen Layers by finger.
    { ...stepOpenLayers('j6'), id: 'j6.reopen-layers' },
    {
      id: 'j6.select-source', action: 'tap', route: 'tap the oval row (mask source)', selector: 'SELECTORS.cardName',
      expects: 'selected = [oval]', expect: { selected: (now) => now.selectedIds.length === 1 && now.layers.find((l) => l.id === now.selectedIds[0]).type === 'shape' },
      run: async (c) => {
        const st = await P.readState(c.page);
        c.vars.src = layerOfType(st, 'shape').id;
        c.vars.child = layerOfType(st, 'spiral').id;
        await rowIntoView(c, L(c, `${S.layerCard(c.vars.src)} ${S.cardName}`));
        await P.fingerTap(c.page, L(c, `${S.layerCard(c.vars.src)} ${S.cardName}`));
      },
      post: () => {},
    },
    {
      id: 'j6.multi-latch', action: 'tap', route: 'tap the Multi-select modifier (one-shot latch, TUX-045)', selector: 'SELECTORS.modifier(\'multiSelect\')',
      expects: 'the modifier shows as latched', jrn: 'JRN-016',
      run: (c) => P.fingerTap(c.page, L(c, S.modifier('multiSelect'))),
      post: async (c) => {
        const el = L(c, S.modifier('multiSelect'));
        const cls = (await el.getAttribute('class')) || '';
        if (!(/active|latched|on\b/.test(cls) || (await el.getAttribute('aria-pressed')) === 'true')) throw new Error('the modifier does not show as latched');
      },
    },
    {
      id: 'j6.select-second', action: 'tap', route: 'tap the spiral row', selector: 'SELECTORS.cardName',
      expects: 'selected = oval and spiral', expect: { selected: (now) => now.selectedIds.length === 2 },
      run: async (c) => {
        await rowIntoView(c, L(c, `${S.layerCard(c.vars.child)} ${S.cardName}`));
        await P.fingerTap(c.page, L(c, `${S.layerCard(c.vars.child)} ${S.cardName}`));
      },
      post: () => {},
    },
    {
      id: 'j6.apply-mask', action: 'tap', route: 'tap the visible mask control in the layer status bar', selector: 'SELECTORS.maskButton',
      expects: 'the spiral is a child of the oval; history +1', jrn: 'JRN-006', expect: { history: 1, selected: 'any' },
      run: (c) => P.fingerTap(c.page, L(c, S.maskButton)),
      post: (c, pre, now) => { if (now.layers.find((l) => l.id === c.vars.child).parentId !== c.vars.src) throw new Error('the mask was not applied'); },
    },
  ],
});

// J7 ------------------------------------------------------------------------------------------
JOURNEYS.push({
  id: 'J7', title: 'Add text, type a word with the soft keyboard, change font and size', fixture: null,
  steps: [
    stepCanvasReady('j7', 'canvas-ready'),
    {
      id: 'j7.type-tool', action: 'tap', route: 'tap the Type tool', selector: 'SELECTORS.tool(\'type\')',
      expects: 'active tool = type',
      run: (c) => P.selectTool(c.page, 'type'),
      post: (c, pre, now) => { if (now.activeTool !== 'type') throw new Error(`active tool is ${now.activeTool}`); },
    },
    {
      id: 'j7.tap-canvas', action: 'tap', route: 'tap the canvas; an editable proxy takes focus so the keyboard opens (TUX-028)', selector: 'canvas point',
      expects: 'layers +1 (text); an editable element has focus', jrn: 'JRN-004', expect: { layers: 1, history: 'any', selected: 'any' },
      run: async (c) => {
        const st = await P.readState(c.page);
        const cr = st.canvasRect;
        await P.fingerTap(c.page, onCanvas(c, cr.x + cr.w * 0.4, cr.y + cr.h * 0.4));
      },
      post: async (c) => { const why = await P.activeEditable(c.page); if (why) throw new Error(`soft keyboard: ${why}`); },
    },
    {
      id: 'j7.type-word', action: 'softType', route: 'type "Hello" with the soft keyboard', selector: 'focused editable',
      expects: 'the text layer text = Hello', jrn: 'JRN-004', expect: { history: 'any', selected: 'any' },
      run: (c) => P.softType(c.page, 'Hello'),
      post: (c, pre, now) => { if (now.activeParams.text !== 'Hello') throw new Error(`text param is "${now.activeParams.text}"`); },
    },
    stepOpenGenerator('j7'),
    {
      id: 'j7.font-open', action: 'tap', route: 'Text panel > font face', selector: '.vtp-fontpick-trigger',
      expects: 'font list visible',
      run: async (c) => {
        await P.fingerScrollInto(c.page, L(c, '.vtp-fontpick-trigger'), L(c, '#left-panel-content'));
        await P.fingerTap(c.page, L(c, '.vtp-fontpick-trigger'));
      },
      post: async (c) => { if (!(await L(c, '.vtp-fp-opt').first().isVisible())) throw new Error('the font list did not open'); },
    },
    {
      id: 'j7.font-pick', action: 'tap', route: 'tap another font', selector: '.vtp-fp-opt:not(.sel)',
      expects: 'font param changed; history +1', expect: { history: 1 },
      run: async (c) => {
        // On short screens the list opens below the fold or under the trigger: try each other option; none tappable is a product layout result.
        let landed = false;
        for (const o of await L(c, '.vtp-fp-opt:not(.sel)').all()) {
          try { await P.fingerTap(c.page, o); landed = true; break; } catch (e) { /* covered or off-screen: try the next option */ }
        }
        if (!landed) throw new Error('font list: no option can be tapped (all covered or off-screen)');
      },
      post: (c, pre, now) => { if (now.activeParams.font === pre.activeParams.font) throw new Error('the font did not change'); },
    },
    {
      id: 'j7.size-focus', action: 'tap', route: 'tap the size value; the whole value is selected (TUX-042)', selector: '[data-ref="slot-size"] input',
      expects: 'an editable numeric field has focus',
      run: async (c) => {
        const f = L(c, '[data-ref="slot-size"] input[inputmode="decimal"]');
        await P.fingerScrollInto(c.page, f, L(c, '#left-panel-content'));
        await P.fingerTap(c.page, f);
      },
      post: async (c) => { const why = await P.activeEditable(c.page); if (why) throw new Error(`soft keyboard: ${why}`); },
    },
    {
      id: 'j7.size-type', action: 'softType', route: 'type 72', selector: 'focused size field',
      expects: 'font size param = 72; history not asserted (the field commits on blur; the commit path is not measurable until the step is reachable)', expect: { history: 'any' },
      run: async (c) => {
        await P.softType(c.page, '72');
        // the field commits on blur: a tap on a neutral heading ends the edit
        // The finger scroll in j7.size-focus moves every heading off-screen: the sticky pane title is always on-screen and not focusable.
        await P.fingerTap(c.page, L(c, '#left-pane .pane-header-left .pane-title'));
      },
      post: (c, pre, now) => { if (now.activeParams.fontSize !== 72) throw new Error(`font size is ${now.activeParams.fontSize}, want 72`); },
    },
  ],
});

// J8 ------------------------------------------------------------------------------------------
JOURNEYS.push({
  id: 'J8', title: 'Paint-bucket fill a closed region', fixture: 'journey-basic',
  steps: [
    stepCanvasReady('j8', 'canvas-ready'),
    {
      id: 'j8.fill-tool', action: 'tap', route: 'tap the Fill tool', selector: 'SELECTORS.tool(\'fill\')',
      expects: 'active tool = fill', jrn: 'JRN-005',
      run: (c) => P.selectTool(c.page, 'fill'),
      post: (c, pre, now) => { if (now.activeTool !== 'fill') throw new Error(`active tool is ${now.activeTool}`); },
    },
    {
      id: 'j8.fill-tap', action: 'tap', route: 'tap inside the oval', selector: 'canvas point at the oval centre',
      expects: 'a fill was committed (history +1, no stray draw)', jrn: 'JRN-005', expect: { layers: 0, history: 1, selected: 'any' },
      run: async (c) => {
        const st = await P.readState(c.page);
        const o = boxOf(st, layerOfType(st, 'shape').id);
        await P.fingerTap(c.page, onCanvas(c, o.cx, o.cy));
      },
      post: (c, pre, now) => {
        // No stray draw: the same layers (ids and types) before and after; the fill rides on history +1.
        const sig = (st) => st.layers.map((l) => `${l.id}:${l.type}`).join('|');
        if (now.layerCount !== pre.layerCount || sig(now) !== sig(pre)) throw new Error(`the fill tap changed the layer set (${pre.layerCount} -> ${now.layerCount})`);
      },
    },
  ],
});

// J9 ------------------------------------------------------------------------------------------
JOURNEYS.push({
  id: 'J9', title: 'Save a named preset; set the paper size in Document Setup', fixture: 'journey-basic',
  steps: [
    {
      id: 'j9.select-layer', action: 'tap', route: 'tap the spiral on the canvas side: open Layers and tap its row', selector: 'SELECTORS.cardName',
      expects: 'selected = [spiral]', expect: { selected: (now) => now.selectedIds.length === 1 },
      run: async (c) => {
        await P.openLayers(c.page);
        const st = await P.readState(c.page);
        await rowIntoView(c, L(c, `${S.layerCard(layerOfType(st, 'spiral').id)} ${S.cardName}`));
        await P.fingerTap(c.page, L(c, `${S.layerCard(layerOfType(st, 'spiral').id)} ${S.cardName}`));
      },
      post: () => {},
    },
    stepOpenGenerator('j9'),
    {
      id: 'j9.preset-save-open', action: 'tap', route: 'Generator pane > save preset', selector: 'SELECTORS.presetSavePip',
      expects: 'the save-preset sheet opens', jrn: 'JRN-014',
      run: async (c) => {
        await P.fingerScrollInto(c.page, L(c, S.presetSavePip), L(c, '#left-panel-content'));
        await P.fingerTap(c.page, L(c, S.presetSavePip));
      },
      post: async (c) => { if (!(await L(c, '#preset-save-name').isVisible())) throw new Error('the save sheet did not open'); },
    },
    {
      id: 'j9.preset-name', action: 'softType', route: 'tap the name field and type with the soft keyboard', selector: '#preset-save-name',
      expects: 'the name field contains the typed text', jrn: 'JRN-014',
      run: async (c) => {
        await P.fingerTap(c.page, L(c, '#preset-save-name'));
        await P.softType(c.page, ' Touch59');
      },
      post: async (c) => { if (!/Touch59/.test(await L(c, '#preset-save-name').inputValue())) throw new Error('the typed text is not in the name field'); },
    },
    {
      id: 'j9.preset-confirm', action: 'tap', route: 'tap Save in the sheet', selector: '#modal-overlay Save button',
      expects: 'the sheet closes; the preset list names the new preset', expect: { history: 'any' },
      run: (c) => P.fingerTap(c.page, L(c, '.preset-save-confirm')),
      post: async (c, pre, now) => {
        if (now.modalOpen) throw new Error('the save sheet is still open');
        const names = await P.readSavedPresetNames(c.page);
        if (!names.some((n) => /Touch59/.test(n))) throw new Error(`the preset list does not name the new preset (${names.length} saved)`);
      },
    },
    {
      id: 'j9.menu-file', action: 'tap', route: 'File menu (phones: ☰ > File)', selector: 'SELECTORS.menuTrigger(\'file\') | SELECTORS.hamburger',
      expects: 'File menu panel open', jrn: 'JRN-006',
      run: (c) => P.openMenu(c.page, 'file'),
      post: async (c) => { if (!(await L(c, S.btnSettings).isVisible())) throw new Error('the File menu did not open'); },
    },
    {
      id: 'j9.doc-setup', action: 'tap', route: 'File > Document Setup', selector: 'SELECTORS.btnSettings',
      expects: 'Document Setup panel visible',
      run: (c) => P.fingerTap(c.page, L(c, S.btnSettings)),
      post: async (c) => { if (!(await L(c, S.settingsPanel).isVisible())) throw new Error('Document Setup did not open'); },
    },
    {
      id: 'j9.paper-section', action: 'tap', route: 'tap the Paper section header only when it is collapsed (it may open on touch)', selector: '#settings-panel .sect-hdr Paper',
      expects: 'Paper section expanded (aria-expanded true); the Size select is the topmost element at its centre', jrn: 'JRN-019',
      run: async (c) => {
        const hdr = L(c, '#settings-panel .sect-hdr').filter({ hasText: /Paper/ });
        // A tap toggles: tapping an already-open header would collapse it. Read the state first.
        if ((await hdr.first().getAttribute('aria-expanded')) !== 'true') await P.fingerTap(c.page, hdr);
      },
      post: async (c) => {
        const hdr = L(c, '#settings-panel .sect-hdr').filter({ hasText: /Paper/ });
        const open = await hdr.first().getAttribute('aria-expanded');
        if (open !== 'true') throw new Error(`the Paper section is not expanded (aria-expanded=${open})`);
        const blocker = await P.hitAtCenter(c.page, L(c, '#machine-profile'));
        if (blocker) throw new Error(`the Size select is covered by ${blocker}`);
      },
    },
    {
      id: 'j9.paper-size', action: 'pickOption', route: 'tap the Size select and choose A4', selector: '#machine-profile',
      expects: 'document paper size = a4', expect: { history: 'any' },
      run: (c) => P.pickOption(c.page, L(c, '#machine-profile'), 'a4'),
      post: (c, pre, now) => { if (now.paper.size !== 'a4') throw new Error(`paper size is ${now.paper.size}`); },
    },
  ],
});

// J10 -----------------------------------------------------------------------------------------
JOURNEYS.push({
  id: 'J10', title: 'Export SVG; save the .vectura project', fixture: 'journey-basic',
  steps: [
    {
      id: 'j10.export-open', action: 'tap', route: 'phones: direct header Export; tablets: File > Export SVG', selector: 'SELECTORS.headerExport | SELECTORS.btnExport',
      expects: 'the Export SVG modal is open', jrn: 'JRN-006',
      run: async (c) => {
        if (P.isPhone(c.dev)) await P.fingerTap(c.page, L(c, S.headerExport));
        else {
          await P.openMenu(c.page, 'file');
          await P.fingerTap(c.page, L(c, '#btn-export'));
        }
      },
      post: async (c) => { if (!(await L(c, '#export-modal-submit').isVisible())) throw new Error('the export modal did not open'); },
    },
    {
      id: 'j10.export-download', action: 'tap', route: 'tap Export SVG in the modal footer (it must lie on the screen)', selector: 'SELECTORS.exportSubmit',
      expects: 'an .svg download starts (share sheet on WebKit, TUX-054)', jrn: 'JRN-006',
      run: async (c) => {
        c.vars.file = await P.savedFileName(c.page, () => P.fingerTap(c.page, L(c, S.exportSubmit)));
      },
      post: (c) => { if (!/\.svg$/i.test(c.vars.file || '')) throw new Error(`download is ${c.vars.file}`); },
    },
    {
      id: 'j10.export-close', action: 'tap', route: 'tap Close in the modal footer', selector: 'SELECTORS.exportCancel',
      expects: 'the modal closes', jrn: 'JRN-006',
      run: async (c) => {
        // the export closes its modal itself once the download starts; tap Close only if it stays
        for (let i = 0; i < 10; i += 1) {
          if (!(await P.readState(c.page)).modalOpen) return;
          await P.sleep(100);
        }
        await P.fingerTap(c.page, L(c, S.exportCancel));
      },
      post: (c, pre, now) => { if (now.modalOpen) throw new Error('the export modal is still open'); },
    },
    {
      id: 'j10.menu-file', action: 'tap', route: 'File menu (phones: ☰ > File)', selector: 'SELECTORS.menuTrigger(\'file\') | SELECTORS.hamburger',
      expects: 'File menu panel open', jrn: 'JRN-006',
      run: (c) => P.openMenu(c.page, 'file'),
      post: async (c) => { if (!(await L(c, S.btnSaveVectura).isVisible())) throw new Error('the File menu did not open'); },
    },
    {
      id: 'j10.save-vectura', action: 'tap', route: 'File > Save .vectura', selector: 'SELECTORS.btnSaveVectura',
      expects: 'a .vectura download starts (share sheet on WebKit, TUX-054)',
      run: async (c) => {
        c.vars.file = await P.savedFileName(c.page, () => P.fingerTap(c.page, L(c, S.btnSaveVectura)));
      },
      post: (c) => { if (!/\.vectura$/i.test(c.vars.file || '')) throw new Error(`download is ${c.vars.file}`); },
    },
  ],
});

// J11 -----------------------------------------------------------------------------------------
JOURNEYS.push({
  id: 'J11', title: '3D scene: insert, orbit the camera with one finger on the gizmo', fixture: null,
  steps: [
    stepOpenLayers('j11'),
    stepAddMenu('j11'),
    stepAlgoDrill('j11'),
    {
      id: 'j11.pick-scene3d', action: 'tap', route: 'Algorithm submenu > 3D Scene', selector: 'SELECTORS.algoItem(\'scene3d\')',
      expects: 'one new root layer of type scene3d; history +1; selected = the scene', jrn: 'JRN-007',
      expect: { layers: 'any', history: 1, selected: 'any' },
      run: async (c) => {
        // The drill list scrolls inside itself (TUX-035 req 2); 3D Scene sits below the fold on every device.
        await P.fingerScrollInto(c.page, L(c, S.algoItem('scene3d')), L(c, S.algoSubmenu));
        await P.fingerTap(c.page, L(c, S.algoItem('scene3d')));
      },
      post: (c, pre, now) => {
        const added = now.layers.filter((l) => !pre.layerIds.includes(l.id));
        const roots = added.filter((l) => !l.parentId);
        if (roots.length !== 1 || roots[0].type !== 'scene3d') throw new Error(`added root layers: ${roots.map((l) => l.type).join(',') || 'none'}`);
        if (now.activeType !== 'scene3d') throw new Error(`active layer type is ${now.activeType}`);
      },
    },
    stepCanvasReady('j11', 'canvas-ready'),
    {
      id: 'j11.orbit-gizmo', action: 'drag', route: 'drag the orbit gizmo centre', selector: 'canvas point at the gizmo centre',
      expects: 'scene camera yaw or pitch changed; history +1', jrn: 'JRN-011', expect: { history: 1, selected: 'any' },
      run: async (c) => {
        const st = await P.readState(c.page);
        if (!st.gizmo) throw new Error('the scene shows no orbit gizmo');
        c.vars.cam = st.sceneCamera;
        await P.fingerDrag(c.page, onCanvas(c, st.gizmo.x, st.gizmo.y), { dx: 60, dy: 30 }, { steps: 12, stepDelayMs: 8 });
      },
      post: (c, pre, now) => {
        if (near(now.sceneCamera.yaw, c.vars.cam.yaw, 1) && near(now.sceneCamera.pitch, c.vars.cam.pitch, 1)) throw new Error('the camera did not orbit');
      },
    },
    // No j11.orbit-drag: a one-finger drag on empty canvas does not orbit the camera for ANY input (mouse included,
    // probed on touch-ipad-landscape), and no TUX asks for it. journeys.md J11 asks for "orbit camera"; the product
    // orbits through the gizmo, sized for touch by TUX-025. See docs/touch-audit/journey-triage.md (decision for Jay).
  ],
});

// J12 -----------------------------------------------------------------------------------------
JOURNEYS.push({
  id: 'J12', title: 'Recover from a mistake: hidden actions are inert, delete, undo, redo, two-finger undo', fixture: 'journey-basic',
  steps: [
    stepOpenLayers('j12'),
    {
      id: 'j12.hidden-actions', action: 'tap', route: 'tap where invisible card actions sit (JRN-009); none may exist', selector: 'readState().ghosts (opacity < 0.5, pointer events on)',
      expects: 'layers +0; history +0; no invisible-but-tappable button exists', jrn: 'JRN-009', expect: { selected: 'any' },
      run: async (c) => {
        const st = await P.readState(c.page);
        const list = L(c, '#layer-list');
        c.vars.ghosts = st.ghosts.length;
        for (const g of st.ghosts.filter((x) => x.x < c.dev.width - 2 && x.y < c.dev.height - 2).slice(0, 4)) await P.fingerTap(c.page, { x: g.x, y: g.y, within: list });
      },
      post: (c, pre, now) => { if (now.ghosts.length) throw new Error(`${now.ghosts.length} invisible but tappable button(s) in the layer list`); },
    },
    {
      id: 'j12.delete-menu', action: 'tap', route: 'tap the row ⋯ button', selector: 'SELECTORS.cardMore',
      expects: 'layer menu visible', expect: { selected: 'any' },
      run: async (c) => {
        c.vars.id = await L(c, S.layerCards).first().getAttribute('data-lvl-id');
        await P.fingerTap(c.page, L(c, `${S.layerCard(c.vars.id)} ${S.cardMore}`));
      },
      post: async (c) => { if (!(await L(c, S.layerMenuEntry).first().isVisible())) throw new Error('the layer menu did not open'); },
    },
    {
      id: 'j12.delete', action: 'tap', route: 'layer menu > Delete', selector: 'SELECTORS.layerMenuEntry Delete',
      expects: 'layers -1; history +1', expect: { layers: -1, history: 1, selected: 'any' },
      run: (c) => P.fingerTap(c.page, L(c, S.layerMenuEntry).filter({ hasText: /^Delete/ })),
      post: (c, pre, now) => { if (now.layerIds.includes(c.vars.id)) throw new Error('the layer is still there'); },
    },
    {
      id: 'j12.undo', action: 'tap', route: 'tap the direct Undo button (TUX-020)', selector: 'SELECTORS.headerUndo',
      expects: 'layers +1 (restored); history -1; redo +1', jrn: 'JRN-017', expect: { layers: 1, history: -1, redo: 1, selected: 'any' },
      run: (c) => P.undo(c.page),
      post: (c, pre, now) => { if (!now.layerIds.includes(c.vars.id)) throw new Error('the deleted layer did not come back'); },
    },
    {
      id: 'j12.redo', action: 'tap', route: 'tap the direct Redo button (TUX-020)', selector: 'SELECTORS.headerRedo',
      expects: 'layers -1; history +1; redo -1', jrn: 'JRN-017', expect: { layers: -1, history: 1, redo: -1, selected: 'any' },
      run: (c) => P.redo(c.page),
      post: (c, pre, now) => { if (now.layerIds.includes(c.vars.id)) throw new Error('the redo did not delete the layer again'); },
    },
    {
      id: 'j12.undo-gesture', action: 'twoFingerTap', route: 'two-finger tap on the canvas undoes once (Q9, TUX-020)', selector: 'canvas point',
      expects: 'layers +1; history -1; redo +1; scale unchanged', jrn: 'JRN-017', expect: { layers: 1, history: -1, redo: 1, selected: 'any' },
      run: async (c) => {
        await P.dismissDrawers(c.page);
        const st = await P.readState(c.page);
        c.vars.scale = st.scale;
        const cr = st.canvasRect;
        // A spot clear of the floating overlays (context bar, toolbar, HUD), else the canvas centre.
        const spot = emptyPinchSpot(st, { minx: 0, maxx: 0, miny: 0, maxy: 0 }, { halves: [30] }) || { x: cr.x + cr.w / 2, y: cr.y + cr.h / 2 };
        await P.fingerMultiTap(c.page, onCanvas(c, spot.x, spot.y), 2);
      },
      post: (c, pre, now) => { if (!near(now.scale, c.vars.scale, c.vars.scale * 0.01)) throw new Error('the tap changed the zoom'); },
    },
  ],
});

module.exports = { JOURNEYS, moveChecks: { rememberObject, assertObjectMoved, assertObjectBack } };
