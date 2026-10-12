// Page-object and guard layer for the finger-only journey specs (TUX-059).
//
// Every user-facing action in a journey goes through a guarded primitive from this file:
//   fingerTap / fingerDoubleTap / fingerLongPress / fingerDrag / fingerPinch / fingerPan,
//   pickOption, softType, and the finger scroll. Each primitive asserts, BEFORE the touch:
//     (a) the centre lies inside the DEVICE screen [vv.offsetLeft, +DEVICES[dev].width) x
//         [vv.offsetTop, +DEVICES[dev].height) in client CSS px. The device constants from
//         viewports.js are used, never innerWidth: Chromium inflates the layout viewport on
//         iPhone portrait (544), WebKit does not (402), and elementFromPoint still resolves
//         targets that sit off the screen.
//     (b) document.elementFromPoint(centre) is the target or one of its descendants.
//     (c) the target and its ancestors are visible (opacity > 0, visibility not hidden).
//
// `readState` is the ONLY read the journeys may use. `loadFixture` is SETUP ONLY. The static scan
// in journeys-static.spec.js enforces both (and every other forbidden API) by reading this file as text.
//
// Keep top-level declarations at column 0: the static scan locates the enclosing function by that.
'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECTS } = require('./viewports');
const touch = require('../helpers/touch');

// ---------------------------------------------------------------------------------------------
// SELECTORS: the pinned contract. Proposed ids (UI that does not exist yet) are marked PROPOSED
// and are listed as interface requests in docs/touch-audit/changelog-fragments/TUX-059.md. The
// lane that ships the UI edits the id here in the same commit. A comma list means "any of these";
// the first one that renders is used (see `rendered`).
// ---------------------------------------------------------------------------------------------
const SELECTORS = {
  canvas: '#main-canvas',
  leftPane: '#left-pane',
  rightPane: '#right-pane',
  // Pane controls. TUX-001/TUX-010 ship the phone header buttons and tablet edge handles (PROPOSED ids first).
  paneToggle: {
    left: ['#btn-header-pane-left', '#btn-mobile-pane-left', '#btn-pane-toggle-left'],
    right: ['#btn-header-pane-right', '#btn-mobile-pane-right', '#btn-pane-toggle-right'],
  },
  // Header (TUX-001 / TUX-020): PROPOSED ids. HUD twins serve tablet and touch-wide layouts.
  hamburger: '#btn-menu-hamburger',
  // TUX-001 shipped rows as '#top-menubar #btn-menu-<name>'; [data-menu-row] stays as the proposed id.
  hamburgerRow: (name) => `[data-menu-row="${name}"], #top-menubar #btn-menu-${name}`,
  headerUndo: ['#btn-header-undo', '#btn-hud-undo'],
  headerRedo: ['#btn-header-redo', '#btn-hud-redo'],
  headerExport: '#btn-header-export',
  hudFit: ['#btn-hud-fit', '#btn-header-fit'],
  menuTrigger: (name) => `#btn-menu-${name}`,
  // Layers panel
  addLayer: '#btn-add-layer',
  addMenu: '#layer-add-menu',
  addItem: (kind) => `#layer-add-menu .lvl-add-item[data-add="${kind}"]`,
  algoParent: '#layer-add-menu .lvl-add-has-sub[data-add="algo-parent"]',
  algoSubmenu: '#lvl-algo-submenu',
  algoItem: (type) => `#lvl-algo-submenu .lvl-algo-sub-item[data-algo-type="${type}"]`,
  layerCards: '#layer-list .lvl-card',
  layerCard: (id) => `#layer-list .lvl-card[data-lvl-id="${id}"]`,
  cardName: '.lvl-name',
  cardGrip: '.lvl-grip',
  cardMore: '.lvl-more',
  cardEye: '.lvl-ib[title="Hide"], .lvl-ib[title="Show"]',
  renameInput: '#layer-list .lvl-ren-inp',
  layerMenuEntry: '.lvl-ctx-menu.open .menu-entry',
  layerStatusBar: '#layer-status-bar',
  maskButton: '#layer-status-bar .lvl-cb.mask-btn',
  // Touch modifier bar. TUX-045 relabels the buttons; the data attribute is the contract.
  modifier: (name) => `#touch-modifier-bar [data-touch-mod="${name}"]`,
  // Toolbar
  tool: (id) => `#tool-bar .tool-btn[data-tool="${id}"]`,
  shapeVariant: (v) => `#tool-bar .tool-submenu[data-menu="shape"] .tool-sub-btn[data-shape="${v}"]`,
  // Generator pane
  generatorTrigger: '#generator-module-trigger',
  slider: '#left-pane .ctrl-slider',
  presetTrigger: '#left-pane .hg-preset-trigger',
  presetPopover: '#left-pane .hg-preset-popover',
  presetOptionInactive: '#left-pane .hg-preset-popover .hg-preset-option:not(.is-active)',
  presetSavePip: '#left-pane .hg-preset-save-pip',
  // Modals
  modal: '#modal-overlay',
  modalClose: '#modal-overlay .modal-close',
  exportSubmit: '#export-modal-submit',
  exportCancel: '#export-modal-cancel',
  btnSaveVectura: '#btn-save-vectura',
  btnSettings: '#btn-settings',
  settingsPanel: '#settings-panel',
};

const STEP_BUDGET_MS = 5000;
// Boot (page load, app init, fixture deserialise) has its own budget: a heavy fixture must not make a slow
// machine fail `boot` or move a pinned failure. The 5 s per-step budget starts after boot.
const BOOT_BUDGET_MS = 45000;
const LOCATE_MS = 3500;
// ResizeObserver 'loop completed with undelivered notifications' is benign browser noise: it is dropped from
// console errors AND page errors, so no cell is pinned on it.
const ERROR_NOISE = /Failed to load resource|favicon|net::ERR_|Download the React DevTools|ResizeObserver loop/i;

// ---------------------------------------------------------------------------------------------
// Binding and error collection
// ---------------------------------------------------------------------------------------------
function bindJourney(page, projectName) {
  const spec = PROJECTS[projectName];
  if (!spec) throw new Error(`unknown project ${projectName}`);
  const j = { project: projectName, dev: spec, errors: [], stepId: 'boot' };
  page.__j = j;
  page.on('pageerror', (e) => {
    const msg = String((e && e.message) || e);
    if (!ERROR_NOISE.test(msg)) j.errors.push(`pageerror: ${msg.slice(0, 160)}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && !ERROR_NOISE.test(m.text())) j.errors.push(`console.error: ${m.text().slice(0, 160)}`);
  });
  return j;
}

const jOf = (page) => {
  if (!page.__j) throw new Error('page is not bound: call bindJourney(page, project) first');
  return page.__j;
};

const takeErrors = (page) => {
  const j = jOf(page);
  const out = j.errors.slice();
  j.errors.length = 0;
  return out;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const firstLine = (e) => String((e && e.message) || e).split('\n')[0].slice(0, 200);
const isPhone = (dev) => Math.min(dev.width, dev.height) < 500;

// `:visible` on each part of a comma list (Playwright CSS extension).
const visible = (sel) => String(sel).split(',').map((s) => `${s.trim()}:visible`).join(', ');

// ---------------------------------------------------------------------------------------------
// Locating and guarding
// ---------------------------------------------------------------------------------------------
async function handleOf(page, loc, what) {
  try {
    return await loc.first().elementHandle({ timeout: LOCATE_MS });
  } catch (e) {
    throw new Error(`not found: ${what || String(loc)}`);
  }
}

// Wait until the box stops moving (menus and drawers animate in).
async function stableBox(page, handle) {
  let prev = await handle.boundingBox();
  for (let i = 0; i < 12; i += 1) {
    await sleep(40);
    const next = await handle.boundingBox();
    if (prev && next && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5
      && Math.abs(prev.width - next.width) < 0.5 && Math.abs(prev.height - next.height) < 0.5) return next;
    prev = next;
  }
  return prev;
}

// The on-screen guard. Returns null when the touch may land, else a deterministic reason.
async function guardTarget(page, handle, pt, onScreenOnly = false) {
  const dev = jOf(page).dev;
  return page.evaluate(([el, x, y, d, screenOnly]) => {
    const vv = window.visualViewport;
    const left = vv ? vv.offsetLeft : 0;
    const top = vv ? vv.offsetTop : 0;
    const name = (n) => {
      if (!n || !n.tagName) return 'nothing';
      if (n.id) return `#${n.id}`;
      const c = n.classList && n.classList.length ? `.${n.classList[0]}` : '';
      return `${n.tagName.toLowerCase()}${c}`;
    };
    if (!(x >= left && x < left + d.width && y >= top && y < top + d.height)) {
      return `off-screen: (${Math.round(x)},${Math.round(y)}) is outside the ${d.width}x${d.height} device screen`;
    }
    if (screenOnly) return null;
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(hit === el || el.contains(hit))) return `covered by ${name(hit)} (target ${name(el)})`;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden') return `invisible: visibility hidden on ${name(n)}`;
      if (parseFloat(cs.opacity) === 0) return `invisible: opacity 0 on ${name(n)}`;
    }
    return null;
  }, [handle, pt.x, pt.y, { width: dev.width, height: dev.height }, onScreenOnly]);
}

// target: Locator, or { x, y, within: Locator } for a point inside an element (the canvas).
// opts.at: absolute client point for a Locator target (default: its centre).
async function resolveTarget(page, target, opts = {}) {
  if (target && typeof target.x === 'number') {
    const handle = await handleOf(page, target.within, 'point container');
    return { handle, pt: { x: target.x, y: target.y }, what: String(target.within) };
  }
  const handle = await handleOf(page, target);
  const box = await stableBox(page, handle);
  if (!box) throw new Error(`not rendered: ${String(target)} has no box`);
  const pt = opts.at || { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  return { handle, pt, box, what: String(target) };
}

async function assertLands(page, handle, pt, what) {
  const reason = await guardTarget(page, handle, pt);
  if (reason) throw new Error(reason);
}

async function fingerTap(page, target, opts = {}) {
  const r = await resolveTarget(page, target, opts);
  await assertLands(page, r.handle, r.pt, r.what);
  await touch.tap(page, r.pt);
  return r.pt;
}

// Two taps ~110 ms apart on the same point (the real double-tap path).
async function fingerDoubleTap(page, target, opts = {}) {
  const r = await resolveTarget(page, target, opts);
  await assertLands(page, r.handle, r.pt, r.what);
  await touch.tap(page, r.pt);
  await sleep(opts.gapMs || 110);
  await touch.tap(page, r.pt);
  return r.pt;
}

async function fingerLongPress(page, target, opts = {}) {
  const r = await resolveTarget(page, target, opts);
  await assertLands(page, r.handle, r.pt, r.what);
  await touch.longPress(page, r.pt, opts.ms || 650);
  return r.pt;
}

// to: { x, y } absolute, or { dx, dy } relative to the start. opts: steps, holdMs, stepDelayMs.
async function fingerDrag(page, from, to, opts = {}) {
  const r = await resolveTarget(page, from, opts);
  await assertLands(page, r.handle, r.pt, r.what);
  const end = typeof to.dx === 'number' ? { x: r.pt.x + to.dx, y: r.pt.y + (to.dy || 0) } : to;
  // The end point must lie on the device screen: a finger cannot lift off beyond the glass.
  const endWhy = await guardTarget(page, r.handle, end, true);
  if (endWhy) throw new Error(`drag end: ${endWhy}`);
  await touch.drag(page, r.pt, end, { steps: opts.steps || 10, holdMs: opts.holdMs || 0, stepDelayMs: opts.stepDelayMs || 0 });
  return { from: r.pt, to: end };
}

// Two fingers around `center` (a point inside `center.within`). Guards BOTH start points.
async function guardPair(page, center, startDist, end = {}) {
  const handle = await handleOf(page, center.within, 'gesture container');
  for (const sign of [-1, 1]) {
    const pt = { x: center.x + sign * startDist / 2, y: center.y };
    const reason = await guardTarget(page, handle, pt);
    if (reason) throw new Error(`finger ${sign < 0 ? 1 : 2}: ${reason}`);
  }
  // End points: on the device screen and still over the gesture container (not slid under an overlay).
  const endDist = end.dist === undefined ? startDist : end.dist;
  for (const sign of [-1, 1]) {
    const pt = { x: center.x + (end.dx || 0) + sign * endDist / 2, y: center.y + (end.dy || 0) };
    const reason = await guardTarget(page, handle, pt);
    if (reason) throw new Error(`finger ${sign < 0 ? 1 : 2} end: ${reason}`);
  }
}

async function fingerPinch(page, center, opts = {}) {
  const startDist = opts.startDist || 80;
  const endDist = opts.endDist || 240;
  await guardPair(page, center, startDist, { dist: endDist });
  await touch.pinch(page, { x: center.x, y: center.y }, { startDist, endDist, steps: opts.steps || 10, staggerMs: opts.staggerMs || 0 });
}

async function fingerPan(page, center, opts = {}) {
  const gap = opts.gap || 100;
  await guardPair(page, center, gap, { dx: opts.dx || 0, dy: opts.dy || 0 });
  await touch.twoFingerPan(page, { x: center.x, y: center.y }, { dx: opts.dx || 0, dy: opts.dy || 0, gap, steps: opts.steps || 10 });
}

// Two fingers tap together (both down and up inside 250 ms): the undo gesture (TUX-020).
async function fingerMultiTap(page, center, fingers = 2) {
  await guardPair(page, center, 60);
  const pts = Array.from({ length: fingers }, (_, i) => ({ x: center.x + (i - (fingers - 1) / 2) * 60, y: center.y, id: i }));
  await touch.touchPhase(page, 'start', pts);
  await sleep(60);
  await touch.touchPhase(page, 'end', pts);
}

// A native <select>: tap it, then choose the value (the OS picker cannot be driven), then check the page held still.
async function pickOption(page, select, value) {
  await fingerTap(page, select);
  await select.selectOption(value);
  await assertInvariants(page);
}

// Text goes in only when a real editable element holds focus and the OS keyboard may open for it.
async function softType(page, text) {
  const why = await activeEditable(page);
  if (why) throw new Error(`soft keyboard: ${why}`);
  await page.keyboard.insertText(text);
  await assertInvariants(page);
}

async function activeEditable(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return 'no element has focus, so iOS would not open the keyboard';
    const tag = el.tagName;
    const editable = tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
    if (!editable) return `focus is on <${tag.toLowerCase()}${el.id ? `#${el.id}` : ''}>, not an editable element`;
    if (el.readOnly) return 'the focused field is read-only';
    if (el.inputMode === 'none') return 'the focused field has inputmode=none';
    return null;
  });
}

// ---------------------------------------------------------------------------------------------
// Invariants and state
// ---------------------------------------------------------------------------------------------
async function assertInvariants(page) {
  const bad = await page.evaluate(() => {
    const vv = window.visualViewport;
    const se = document.scrollingElement || document.documentElement;
    const out = [];
    if (window.scrollX !== 0 || window.scrollY !== 0) out.push(`window scrolled (${window.scrollX},${window.scrollY})`);
    if (se.scrollTop !== 0 || se.scrollLeft !== 0) out.push(`document scrolled (${se.scrollLeft},${se.scrollTop})`);
    if (vv && (vv.offsetLeft !== 0 || vv.offsetTop !== 0)) out.push(`visual viewport panned (${vv.offsetLeft},${vv.offsetTop})`);
    if (vv && vv.scale !== 1) out.push(`page zoomed (scale ${vv.scale})`);
    return out;
  });
  if (bad.length) throw new Error(`invariant: ${bad.join('; ')}`);
}

async function readState(page) {
  return page.evaluate(() => {
    const app = window.app;
    const eng = app.engine;
    const r = app.renderer;
    const cv = document.getElementById('main-canvas');
    const cr = cv.getBoundingClientRect();
    const prim = (o) => {
      const out = {};
      if (!o) return out;
      Object.entries(o).forEach(([k, v]) => {
        if (v === null || ['number', 'string', 'boolean'].includes(typeof v)) out[k] = v;
      });
      return out;
    };
    const active = eng.getActiveLayer ? eng.getActiveLayer() : null;
    const boxes = {};
    const worldBoxes = {};
    eng.layers.forEach((l) => {
      try {
        const b = r.getLayerBounds(l);
        if (!b || !b.corners) return;
        const wc = {};
        Object.entries(b.corners).forEach(([k, p]) => { wc[k] = [p.x, p.y]; });
        worldBoxes[l.id] = wc;
        const c = {};
        Object.entries(b.corners).forEach(([k, p]) => {
          const s = r.worldToScreen(p.x, p.y);
          c[k] = [s.x + cr.left, s.y + cr.top];
        });
        boxes[l.id] = c;
      } catch (e) { /* layers without bounds */ }
    });
    const ghosts = [];
    document.querySelectorAll('#layer-list button, #layer-list [role="button"]').forEach((b) => {
      const rect = b.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      let op = 1;
      for (let n = b; n && n.nodeType === 1; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity);
      const cs = getComputedStyle(b);
      if (op < 0.5 && cs.pointerEvents !== 'none' && cs.visibility !== 'hidden') {
        ghosts.push({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, label: (b.getAttribute('aria-label') || b.title || b.className || '').toString().slice(0, 40) });
      }
    });
    const overlays = [];
    ['#tool-bar', '.ctxbar', '#hud-bar', '#touch-modifier-bar', '#status-bar', '#canvas-toast', '.hint-bar'].forEach((sel) => {
      document.querySelectorAll(sel).forEach((e) => {
        if (!e.checkVisibility()) return;
        const b = e.getBoundingClientRect();
        if (b.width > 0 && b.height > 0) overlays.push({ sel, minx: b.left, miny: b.top, maxx: b.right, maxy: b.bottom });
      });
    });
    const S = (window.Vectura && window.Vectura.SETTINGS) || {};
    return {
      appReady: !!(app && app.ui && eng && r),
      layerCount: eng.layers.length,
      rootCount: eng.layers.filter((l) => !l.parentId).length,
      layerIds: eng.layers.map((l) => l.id),
      layers: eng.layers.map((l) => ({ id: l.id, type: l.type, name: l.name, visible: l.visible !== false, parentId: l.parentId || null })),
      selectedIds: Array.from(r.selectedLayerIds || []),
      activeLayerId: eng.activeLayerId || null,
      activeType: active ? active.type : null,
      activeParams: prim(active && active.params),
      activePreset: active && active.params ? active.params.preset || null : null,
      sceneCamera: (() => { const sc = eng.layers.find((l) => l.type === 'scene3d'); return sc && sc.params.camera ? prim(sc.params.camera) : null; })(),
      gizmo: (() => {
        try {
          if (!active) return null;
          const ctl = r.get3DRotationControl(active, r.getSelectionBounds([active]));
          if (!ctl || !ctl.center) return null;
          const s = r.worldToScreen(ctl.center.x, ctl.center.y);
          return { x: s.x + cr.left, y: s.y + cr.top };
        } catch (e) { return null; }
      })(),
      historyLen: app.history.length,
      redoLen: app.redoStack.length,
      maxHistory: app.maxHistory,
      scale: r.scale,
      offsetX: r.offsetX,
      offsetY: r.offsetY,
      activeTool: app.ui.activeTool,
      boxes,
      worldBoxes,
      canvasRect: { x: cr.left, y: cr.top, w: cr.width, h: cr.height },
      ghosts,
      overlays,
      paper: { size: S.paperSize, orientation: S.paperOrientation, width: S.paperWidth, height: S.paperHeight },
      modalOpen: !!(document.getElementById('modal-overlay') && document.getElementById('modal-overlay').classList.contains('open')),
    };
  });
}

// SETUP ONLY, before `boot` completes. Uses the File > Open handler's own deserialize path
// (ui.openVecturaFile on a File). Clears page errors afterwards.
async function loadFixture(page, name) {
  const file = path.join(__dirname, '..', '..', 'fixtures', 'touch', `${name}.vectura`);
  const text = fs.readFileSync(file, 'utf8');
  const expected = JSON.parse(text).state.engine.layers.length;
  await page.evaluate(([body, fname]) => {
    window.app.ui.openVecturaFile(new File([body], fname, { type: 'application/json' }));
  }, [text, `${name}.vectura`]);
  await page.waitForFunction((n) => window.app.engine.layers.length === n && !window.app.isRestoring, expected, { timeout: BOOT_BUDGET_MS });
  await waitNoToast(page);
  takeErrors(page);
}

// SETUP: raise the undo limit so the history shift never hides a delta (default 20).
async function raiseUndoLimit(page) {
  await page.evaluate(() => { window.app.setUndoLimit(200); });
}

async function waitAppReady(page) {
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.renderer), null, { timeout: BOOT_BUDGET_MS });
}

// Poll readState until pred(state) returns true (or a string reason keeps it pending).
async function waitState(page, pred, what, timeout = STEP_BUDGET_MS) {
  const t0 = Date.now();
  let last = null;
  let s = null;
  for (;;) {
    s = await readState(page);
    last = pred(s);
    if (last === true) return s;
    if (Date.now() - t0 > timeout) throw new Error(`${what}${typeof last === 'string' ? `: ${last}` : ''}`);
    await sleep(80);
  }
}

// ---------------------------------------------------------------------------------------------
// Page-object routes. Each is built only from the guarded primitives above.
// ---------------------------------------------------------------------------------------------
// The first candidate that renders a box (CSS may hide the others).
async function rendered(page, list) {
  const sels = Array.isArray(list) ? list : [list];
  for (const sel of sels) {
    const loc = page.locator(sel).first();
    if (await loc.count() && await loc.boundingBox()) return loc;
  }
  return page.locator(sels[sels.length - 1]).first();
}

async function paneOpen(page, side) {
  const box = await page.locator(side === 'left' ? SELECTORS.leftPane : SELECTORS.rightPane).boundingBox();
  const dev = jOf(page).dev;
  return !!box && box.width > 100 && box.x + box.width > 1 && box.x < dev.width - 1;
}

// Read-only DOM wait (no input): lets a toast over a header control expire.
async function waitNoToast(page) {
  await page.waitForFunction(() => !document.querySelector('.vectura-toast'), null, { timeout: 8000 }).catch(() => {});
}

// Setup: where the engine has navigator.share (WebKit), record the shared file names and skip the
// native sheet. The export then ends in a share, not an anchor download (see downloads.spec.js).
async function spyShare(page) {
  return page.evaluate(() => {
    if (typeof navigator.share !== 'function') return false;
    window.__sharedFiles = [];
    navigator.share = async (d) => { (d && d.files ? d.files : []).forEach((f) => window.__sharedFiles.push(f.name)); };
    return true;
  });
}

async function sharedFiles(page) {
  return page.evaluate(() => window.__sharedFiles || []);
}

// Names of the presets saved in this browser (read-only state read).
async function readSavedPresetNames(page) {
  return page.evaluate(() => {
    const names = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (!/preset/i.test(k) || /deleted/i.test(k)) continue;
        const v = JSON.parse(localStorage.getItem(k) || '[]');
        (Array.isArray(v) ? v : []).forEach((p) => p && p.name && names.push(p.name));
      }
    } catch (e) { /* storage unavailable */ }
    return names;
  });
}

async function openPane(page, side) {
  if (await paneOpen(page, side)) return;
  // TUX-008: at most one drawer is open, and the backdrop covers the other pane's control. Close the
  // other drawer first, as a person does. A toast (top right, z 9000) can also sit over a header
  // opener for a few seconds: wait it out.
  await waitNoToast(page);
  await dismissDrawers(page);
  const ctl = await rendered(page, SELECTORS.paneToggle[side]);
  await fingerTap(page, ctl);
  const t0 = Date.now();
  while (Date.now() - t0 < 3000) {
    if (await paneOpen(page, side)) return;
    await sleep(80);
  }
  throw new Error(`${side} pane did not open after the tap`);
}

async function openLayers(page) { return openPane(page, 'right'); }
// TUX-054: on a coarse pointer with navigator.share + canShare (WebKit), Save and Export open the share
// sheet instead of a download. Record share calls without a sheet and accept either path; returns the file name.
async function savedFileName(page, tap) {
  await page.evaluate(() => {
    if (window.__jrnShare || typeof navigator.share !== 'function') return;
    window.__jrnShare = [];
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      writable: true,
      value: (d) => { const f = d && d.files && d.files[0]; window.__jrnShare.push(f ? f.name : null); return Promise.resolve(); },
    });
  });
  const before = await page.evaluate(() => (window.__jrnShare ? window.__jrnShare.length : 0));
  const dl = page.waitForEvent('download', { timeout: 4000 }).then((d) => d.suggestedFilename());
  dl.catch(() => {});
  const shared = page.waitForFunction((n) => window.__jrnShare && window.__jrnShare.length > n, before, { timeout: 4000 })
    .then(() => page.evaluate(() => window.__jrnShare[window.__jrnShare.length - 1]));
  shared.catch(() => {});
  await tap();
  return Promise.any([dl, shared]).catch(() => { throw new Error('neither a download nor a share sheet within 4000 ms'); });
}

async function openGenerator(page) { return openPane(page, 'left'); }

// A drawer that overlays the canvas is closed with the same control (TUX-010). Docked panes stay.
async function dismissDrawers(page) {
  const cv = await page.locator(SELECTORS.canvas).boundingBox();
  for (const side of ['left', 'right']) {
    if (!(await paneOpen(page, side))) continue;
    const pb = await page.locator(side === 'left' ? SELECTORS.leftPane : SELECTORS.rightPane).boundingBox();
    const overlap = Math.min(pb.x + pb.width, cv.x + cv.width) - Math.max(pb.x, cv.x);
    if (overlap > 40) {
      const ctl = await rendered(page, SELECTORS.paneToggle[side]);
      await fingerTap(page, ctl);
      const t0 = Date.now();
      while (Date.now() - t0 < 3000 && await paneOpen(page, side)) await sleep(80);
      if (await paneOpen(page, side)) throw new Error(`${side} drawer did not close after the tap`);
    }
  }
}

async function selectTool(page, id) {
  await fingerTap(page, page.locator(SELECTORS.tool(id)));
}

async function openMenu(page, name) {
  if (isPhone(jOf(page).dev)) {
    await fingerTap(page, page.locator(SELECTORS.hamburger));
    await fingerTap(page, page.locator(SELECTORS.hamburgerRow(name)));
  } else {
    await fingerTap(page, page.locator(SELECTORS.menuTrigger(name)));
  }
}

// Direct Undo/Redo (TUX-020). No Edit-menu fallback: journey-scripts.md 'Forbidden routes'.
async function historyTap(page, list) {
  const direct = await rendered(page, list.map(visible));
  if (!(await direct.count() && await direct.boundingBox())) throw new Error(`TUX-020 missing direct control: ${list.join(' | ')}`);
  await fingerTap(page, direct);
}
async function undo(page) { await historyTap(page, SELECTORS.headerUndo); }
async function redo(page) { await historyTap(page, SELECTORS.headerRedo); }

// Taps via `tapFn` and returns the saved file name: an anchor download, or (WebKit) the share-sheet file.
async function captureFile(page, tapFn) {
  const shares = await spyShare(page);
  const dl = page.waitForEvent('download', { timeout: 4000 });
  dl.catch(() => {});
  await tapFn();
  if (!shares) return (await dl).suggestedFilename();
  const t0 = Date.now();
  let names = [];
  while (Date.now() - t0 < 4000 && !names.length) { names = await sharedFiles(page); if (!names.length) await sleep(100); }
  return names[0];
}

async function addAlgorithmLayer(page, type) {
  await openLayers(page);
  await fingerTap(page, page.locator(SELECTORS.addLayer));
  await fingerTap(page, page.locator(SELECTORS.algoParent));
  await fingerTap(page, page.locator(SELECTORS.algoItem(type)));
}

// Scroll a pane by finger until `target` sits fully inside `container`. A native scroll needs the
// browser's default action, so WebKit (synthetic touches) fails this honestly.
async function swipeStart(page, container) {
  return page.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x0 = r.left + 4;
    const interactive = (n) => !!n.closest('input,button,select,textarea,canvas,a,[role="button"],[role="slider"],.ctrl-slider');
    for (let fx = 0.04; fx < 0.96; fx += 0.04) {
      const x = r.left + r.width * fx;
      const y = r.top + r.height * 0.5;
      const hit = document.elementFromPoint(x, y);
      if (hit && el.contains(hit) && !interactive(hit)) return { x, y };
    }
    return { x: x0, y: r.top + r.height * 0.5 };
  }, container);
}

// State read: does the element at the centre of `loc` resolve to `loc` itself (or a child)? Returns null when yes, else the blocker's name.
async function hitAtCenter(page, loc) {
  const handle = await handleOf(page, loc);
  return page.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (hit && (hit === el || el.contains(hit))) return null;
    return hit ? `${hit.tagName.toLowerCase()}${hit.id ? `#${hit.id}` : ''}` : 'nothing';
  }, handle);
}

// SANCTIONED PROGRAMMATIC SCROLL (WebKit only). WebKit does not run native default actions (scrolling) for synthetic
// touches (helpers/touch.js: nativeDefaultActions=false), so a finger drag cannot scroll a pane there. This only brings the
// target into view; every tap after it stays a guarded finger tap. The finger-scroll proof lives in the Chromium twins.
async function webkitProgrammaticScroll(page, target) {
  const handle = await handleOf(page, target, 'scroll target');
  await page.evaluate((el) => el.scrollIntoView({ block: 'center' }), handle);
  await sleep(120);
}

async function fingerScrollInto(page, target, container) {
  if (!touch.engineSupports(page, 'nativeDefaultActions')) {
    await webkitProgrammaticScroll(page, target);
    return;
  }
  const cHandle = await handleOf(page, container, 'scroll container');
  let lastY = null;
  for (let i = 0; i < 8; i += 1) {
    const tb = await target.first().boundingBox();
    const cb = await cHandle.boundingBox();
    const dev = jOf(page).dev;
    if (tb && cb) {
      const top = Math.max(cb.y, 0) + Math.min(48, cb.height * 0.15); // clear of a sticky pane header
      const bottom = Math.min(cb.y + cb.height, dev.height) - 4;
      if (tb.y >= top && tb.y + tb.height <= bottom) return;
    }
    if (!tb) throw new Error(`not found: ${String(target)}`);
    // No progress after a full finger drag is a deterministic stop: fail with the real reason, not the 5000 ms step budget.
    if (lastY !== null && Math.abs(tb.y - lastY) < 1) throw new Error(`the finger scroll never brought the target into view (it stayed at y=${Math.round(tb.y)}; container y=${Math.round(cb.y)} h=${Math.round(cb.height)})`);
    lastY = tb.y;
    const start = await swipeStart(page, cHandle);
    const dir = tb.y > (cb.y + cb.height / 2) ? -1 : 1;
    const span = Math.min(cb.height * 0.8, 520);
    await fingerDrag(page, { x: start.x, y: start.y + (dir < 0 ? span / 2 : -span / 2), within: container }, { dx: 0, dy: dir * span }, { steps: 12, stepDelayMs: 12 });
    await sleep(120);
  }
  throw new Error('the finger scroll never brought the target into view');
}

// Drag a native range slider's thumb by a fraction of its track. Returns { before, after }.
async function fingerSlider(page, slider, fraction) {
  const handle = await handleOf(page, slider);
  const box = await stableBox(page, handle);
  if (!box) throw new Error(`not rendered: ${String(slider)}`);
  const before = parseFloat(await slider.first().inputValue());
  const min = parseFloat((await slider.first().getAttribute('min')) || '0');
  const max = parseFloat((await slider.first().getAttribute('max')) || '100');
  const t = (before - min) / (max - min || 1);
  const thumb = 8;
  const x0 = box.x + thumb + t * (box.width - 2 * thumb);
  const y0 = box.y + box.height / 2;
  const dir = t > 0.6 ? -1 : 1;
  await fingerDrag(page, slider, { dx: dir * Math.abs(fraction) * box.width, dy: 0 }, { at: { x: x0, y: y0 }, steps: 8, stepDelayMs: 10 });
  const after = parseFloat(await slider.first().inputValue());
  return { before, after, dir };
}

// TUX-023: client-space centre of the visible touch rotate affordance for a layer (null if none). State read.
async function readRotateAffordance(page, layerId) {
  return page.evaluate((id) => {
    const r = window.app.renderer;
    const layer = window.app.engine.layers.find((l) => l.id === id);
    const a = layer && r.getRotateAffordance(r.getSelectionBounds([layer]));
    const cr = document.querySelector('#main-canvas').getBoundingClientRect();
    return a ? { x: a.x + cr.left, y: a.y + cr.top } : null;
  }, layerId);
}

module.exports = {
  SELECTORS,
  readSavedPresetNames,
  captureFile,
  readRotateAffordance,
  STEP_BUDGET_MS,
  BOOT_BUDGET_MS,
  bindJourney,
  takeErrors,
  jOf,
  isPhone,
  visible,
  sleep,
  firstLine,
  rendered,
  guardTarget,
  fingerTap,
  fingerDoubleTap,
  fingerLongPress,
  fingerDrag,
  fingerPinch,
  fingerPan,
  fingerMultiTap,
  fingerScrollInto,
  hitAtCenter,
  fingerSlider,
  pickOption,
  softType,
  activeEditable,
  assertInvariants,
  readState,
  loadFixture,
  raiseUndoLimit,
  waitAppReady,
  waitState,
  paneOpen,
  openPane,
  openLayers,
  openGenerator,
  dismissDrawers,
  selectTool,
  openMenu,
  undo,
  redo,
  addAlgorithmLayer,
  savedFileName,
};
