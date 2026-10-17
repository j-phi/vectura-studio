// Touch audit state openers (TUX-058).
//
// product lanes may edit openers here in the same commit that changes the ids.
// (TUX-001 moves btn-menu-* into the hamburger; TUX-010 changes the pane toggles. Edit the one
// small function below. Do not edit target-audit-core.js.)
//
// Entry shape: { id, fast, run(page), post(page) => Promise<true | string>, minItems }
//   fast      true = part of the default (fast) subset; all states run with TOUCH_AUDIT_FULL=1.
//   run       drives the UI into the state. Fresh page. Throwing fails the state.
//   post      the postcondition. true when the state is reached; otherwise a reason string.
//             The spec polls it (10 s). No fixed sleep stands in for it.
//   minItems  floor for the on-screen item count (50 % of the smallest measured count over the 7
//             non-chrome projects, v1.4.6 tree). A lower
//             count means the opener silently failed to open the state.
//
// Openers use DOM .click() on purpose: the audit measures LAYOUT, it does not prove a journey.
// The finger-only journey specs own tap reachability. A trigger that is clipped off-screen on a
// phone must still open here; its reachability is reported through its own hitState.
'use strict';

const touch = require('../helpers/touch');
const { waitLayoutSettled } = require('../helpers/target-audit-core');

const ok = (cond, why) => (cond ? true : why);

// ---- shared helpers ------------------------------------------------------

async function openPane(page, side) {
  await page.evaluate((side) => {
    const pane = document.getElementById(side === 'left' ? 'left-pane' : 'right-pane');
    const auto = document.body.classList.contains('auto-collapsed');
    const open = auto ? pane.classList.contains('pane-force-open') : !pane.classList.contains('pane-collapsed');
    if (open) return;
    const mob = document.getElementById(side === 'left' ? 'btn-mobile-pane-left' : 'btn-mobile-pane-right');
    const tog = document.getElementById(side === 'left' ? 'btn-pane-toggle-left' : 'btn-pane-toggle-right');
    const btn = (mob && mob.offsetParent) ? mob : tog;
    btn.click();
  }, side);
}

// Open a pane and wait until it is wide AND no transition runs. Use before any action that
// positions against the pane (menus anchor to their trigger at click time).
async function openPaneSettled(page, side) {
  await openPane(page, side);
  await page.waitForFunction((side) => document.getElementById(side === 'left' ? 'left-pane' : 'right-pane').getBoundingClientRect().width > 100, side, { timeout: 10000 });
  await waitLayoutSettled(page);
}

const paneOpen = (page, side) => page.evaluate((side) => {
  const pane = document.getElementById(side === 'left' ? 'left-pane' : 'right-pane');
  if (!pane) return 'pane missing';
  const auto = document.body.classList.contains('auto-collapsed');
  const open = auto ? pane.classList.contains('pane-force-open') : !pane.classList.contains('pane-collapsed');
  if (!open) return `${side} pane not open`;
  return pane.getBoundingClientRect().width > 100 ? true : `${side} pane still narrow`;
}, side);

// Runs fn in the page. An exception from the app (for example the negative renderer scale on
// iPhone landscape) is recorded in window.__auditErrors and counted by the pageErrors metric.
// It must not abort the opener: the audit still has to measure the state.
const guarded = (page, fn, arg) => page.evaluate(({ src, arg }) => {
  try { return (new Function(`return (${src})`))()(arg); } catch (e) {
    (window.__auditErrors = window.__auditErrors || []).push(String((e && e.message) || e).slice(0, 200));
    return null;
  }
}, { src: fn.toString(), arg });

async function addLayer(page, type) {
  const id = await guarded(page, (type) => window.app.engine.addLayer(type), type);
  await guarded(page, (id) => { window.app.renderer.setSelection([id], id); }, id);
  await guarded(page, () => { window.app.ui.renderLayers?.(); });
  await guarded(page, () => { window.app.ui.buildControls?.(); });
  await guarded(page, () => { window.app.render?.(); });
  return id;
}

const setTool = (page, name) => guarded(page, (n) => { window.app.ui.setActiveTool?.(n); }, name);

const hasLayer = (page, type) => page.evaluate((type) => (window.app.engine.layers || []).some((l) => (type ? l.type === type : l.visible !== false && !l.isGroup)), type);

// The app boots with an empty document; states that need content add a layer.
async function ensureLayer(page, type = 'wavetable') {
  if (!(await hasLayer(page))) await addLayer(page, type);
}

const clickId = (page, id) => page.evaluate((id) => document.getElementById(id).click(), id);

// TUX-001: in phone layout the menubar is a drill-down sheet behind the hamburger. A header menu
// trigger only opens once the sheet is open, so open the sheet first when the hamburger is shown.
const clickMenu = (page, id) => page.evaluate((id) => {
  const burger = document.getElementById('btn-menu-hamburger');
  if (burger && burger.checkVisibility() && !document.body.classList.contains('phone-menu-open')) burger.click();
  document.getElementById(id).click();
}, id);

const menuOpen = (id) => (page) => page.evaluate((id) => {
  const t = document.getElementById(id);
  const panel = t && t.parentElement && t.parentElement.querySelector('.top-menu-panel');
  if (!t || !panel) return `${id} or its panel missing`;
  return t.getAttribute('aria-expanded') === 'true' && panel.classList.contains('open') && panel.checkVisibility() ? true : `${id} menu not open`;
}, id);

const modalOpen = (titleRe) => (page) => page.evaluate((src) => {
  const o = document.getElementById('modal-overlay');
  if (!o || !o.checkVisibility()) return 'modal overlay not visible';
  const t = (document.getElementById('modal-title')?.textContent || '').trim();
  if (!t) return 'modal has no title yet';
  return new RegExp(src, 'i').test(t) ? true : `modal title "${t}" does not match ${src}`;
}, titleRe.source);

async function fileItem(page, itemId) {
  await clickMenu(page, 'btn-menu-file');
  await page.waitForFunction(() => document.querySelector('#btn-menu-file ~ .top-menu-panel.open'), null, { timeout: 10000 });
  await clickId(page, itemId);
}

const tool = (name) => (page) => page.evaluate((n) => (window.app.ui.activeTool === n ? true : `tool is ${window.app.ui.activeTool}, want ${n}`), name);

// ---- the states ----------------------------------------------------------

const STATES = [
  { id: 'default', fast: true, minItems: 13, run: async () => {}, post: (p) => p.evaluate(() => (window.app && window.app.renderer && window.app.ui ? true : 'app not ready')) },
  { id: 'left-pane-open', fast: true, minItems: 14, run: (p) => openPane(p, 'left'), post: (p) => paneOpen(p, 'left') },
  // Two layers on purpose: an inactive layer row exposes the invisible .lvl-acts action buttons
  // (opacity 0, still hit-testable), which the `ghost` metric counts (IPAD-004 / CODE-011).
  { id: 'right-pane-layers', fast: true, minItems: 16,
    run: async (p) => { await addLayer(p, 'wavetable'); await addLayer(p, 'wavetable'); await openPane(p, 'right'); },
    post: async (p) => {
      const r = await paneOpen(p, 'right');
      if (r !== true) return r;
      return ok(await p.evaluate(() => window.app.engine.layers.length >= 2), 'fewer than 2 layers');
    } },
  { id: 'right-pane-pens', fast: false, minItems: 22,
    run: async (p) => {
      await openPaneSettled(p, 'right');
      await p.evaluate(() => document.querySelector('.right-pane-tab[data-tab="pens"]')?.click());
    },
    post: (p) => p.evaluate(() => (document.querySelector('.right-pane-tab[data-tab="pens"]')?.classList.contains('active') ? true : 'pens tab not active')) },
  { id: 'bottom-pane-open', fast: false, minItems: 13,
    run: (p) => p.evaluate(() => {
      const bp = document.getElementById('bottom-pane');
      if (bp.classList.contains('bottom-pane-collapsed')) {
        const b = document.getElementById('btn-mobile-pane-bottom');
        ((b && b.offsetParent) ? b : document.getElementById('btn-pane-toggle-bottom')).click();
      }
    }),
    post: (p) => p.evaluate(() => (document.getElementById('bottom-pane').classList.contains('bottom-pane-collapsed') ? 'bottom pane still collapsed' : true)) },
  { id: 'menu-file', fast: true, minItems: 17, run: (p) => clickMenu(p, 'btn-menu-file'), post: menuOpen('btn-menu-file') },
  { id: 'menu-edit', fast: false, minItems: 16, run: (p) => clickMenu(p, 'btn-menu-edit'), post: menuOpen('btn-menu-edit') },
  { id: 'menu-object', fast: false, minItems: 19, run: (p) => clickMenu(p, 'btn-menu-object'), post: menuOpen('btn-menu-object') },
  { id: 'menu-view', fast: false, minItems: 15, run: (p) => clickMenu(p, 'btn-menu-view'), post: menuOpen('btn-menu-view') },
  { id: 'menu-insert', fast: false, minItems: 13, run: (p) => clickMenu(p, 'btn-menu-insert'), post: menuOpen('btn-menu-insert') },
  { id: 'menu-help', fast: false, minItems: 13, run: (p) => clickMenu(p, 'btn-menu-help'), post: menuOpen('btn-menu-help') },
  { id: 'layer-add-menu', fast: true, minItems: 18,
    run: async (p) => {
      await openPaneSettled(p, 'right');
      await clickId(p, 'btn-add-layer');
    },
    post: (p) => p.evaluate(() => { const m = document.getElementById('layer-add-menu'); return m && m.checkVisibility() && m.getBoundingClientRect().width > 20 ? true : 'layer add menu not visible'; }) },
  { id: 'generator-picker', fast: false, minItems: 28,
    run: async (p) => {
      await ensureLayer(p);
      await openPaneSettled(p, 'left');
      await p.waitForFunction(() => document.getElementById('generator-module-trigger')?.checkVisibility(), null, { timeout: 10000 });
      await p.evaluate(() => document.getElementById('generator-module-trigger').click());
    },
    post: (p) => p.evaluate(() => (document.getElementById('gm-module-menu')?.checkVisibility() ? true : 'generator module menu not open')) },
  { id: 'modal-document-setup', fast: false, minItems: 20, run: (p) => fileItem(p, 'btn-settings'),
    post: (p) => p.evaluate(() => (document.getElementById('settings-panel')?.checkVisibility() ? true : 'document setup panel not visible')) },
  { id: 'modal-export', fast: true, minItems: 19,
    run: async (p) => { await ensureLayer(p); await fileItem(p, 'btn-export'); },
    post: modalOpen(/export/) },
  { id: 'modal-help', fast: true, minItems: 18,
    run: async (p) => {
      await clickMenu(p, 'btn-menu-help');
      await p.waitForFunction(() => document.querySelector('#btn-menu-help ~ .top-menu-panel.open'), null, { timeout: 10000 });
      await clickId(p, 'btn-help');
    },
    post: modalOpen(/help|guide/) },
  { id: 'modal-preset-save', fast: false, minItems: 13,
    run: async (p) => {
      await ensureLayer(p);
      await p.evaluate(() => {
        const layer = window.app.engine.getActiveLayer?.() || window.app.engine.layers[0];
        window.Vectura.UI.PresetSaveModal.open({
          layerType: layer.type, params: { ...layer.params }, suggestedName: 'Touch audit',
          origin: { kind: 'scratch', preset: null }, devMode: false, onConfirm() {},
        });
      });
    },
    post: (p) => p.evaluate(() => { const o = document.getElementById('modal-overlay'); return o && o.checkVisibility() ? true : 'preset save modal not visible'; }) },
  // Inline designer lives in the left pane for a Petalis layer.
  { id: 'petal-designer-inline', fast: false, minItems: 22,
    run: async (p) => {
      await addLayer(p, 'petalisDesigner');
      await openPaneSettled(p, 'left');
      await p.waitForFunction(() => document.querySelector('.petal-designer-inline, [class*="petal-designer"]'), null, { timeout: 10000 });
      await p.evaluate(() => document.querySelector('.petal-designer-inline, [class*="petal-designer"]')?.scrollIntoView({ block: 'start' }));
    },
    post: async (p) => {
      const l = await paneOpen(p, 'left');
      if (l !== true) return l;
      return p.evaluate(() => (document.querySelector('.petal-designer-inline, [class*="petal-designer"]')?.checkVisibility() ? true : 'petal designer not visible'));
    } },
  // Pop-out floating Petal Designer window.
  { id: 'petal-designer-window', fast: false, minItems: 21,
    run: async (p) => {
      const id = await addLayer(p, 'petalisDesigner');
      await p.evaluate((id) => {
        const layer = window.app.engine.layers.find((l) => l.id === id);
        window.app.ui.openPetalDesigner({ layer, fromInline: true });
      }, id);
    },
    post: (p) => p.evaluate(() => {
      const w = [...document.querySelectorAll('.petal-designer, [class*="petal-designer-"]')].find((e) => e.checkVisibility() && e.getBoundingClientRect().width > 150 && !e.closest('#left-pane'));
      return w ? true : 'petal designer window not visible';
    }) },
  { id: 'text-panel', fast: true, minItems: 21,
    run: async (p) => { await addLayer(p, 'text'); await openPane(p, 'left'); },
    post: async (p) => {
      const l = await paneOpen(p, 'left');
      if (l !== true) return l;
      return ok(await hasLayer(p, 'text'), 'no text layer');
    } },
  { id: 'fill-controls', fast: false, minItems: 29,
    run: async (p) => {
      await ensureLayer(p);
      await setTool(p, 'fill');
      await openPaneSettled(p, 'left');
      await p.evaluate(() => {
        const b = document.getElementById('paint-bucket-expand-btn');
        if (b && b.offsetParent) b.click();
      });
    },
    post: async (p) => {
      const t = await tool('fill')(p);
      if (t !== true) return t;
      return paneOpen(p, 'left');
    } },
  { id: 'color-picker', fast: false, minItems: 24,
    run: async (p) => {
      await openPaneSettled(p, 'right');
      await p.evaluate(() => document.querySelector('.right-pane-tab[data-tab="pens"]')?.click());
      await p.waitForFunction(() => document.querySelector('#pen-list .pen-color'), null, { timeout: 10000 });
      await p.evaluate(() => {
        const input = document.querySelector('#pen-list .pen-color');
        const trig = input?.closest('.pen-item, li, div') || input;
        window.app.ui.openColorPickerAnchoredTo(input, trig, { title: 'Pen Color', uiInstance: window.app.ui });
      });
    },
    post: modalOpen(/pen color/) },
  { id: 'noise-rack', fast: false, minItems: 29,
    run: async (p) => {
      await ensureLayer(p);
      await openPaneSettled(p, 'left');
      await p.waitForFunction(() => document.querySelector('.noise-list-header, .noise-control'), null, { timeout: 10000 });
      await p.evaluate(() => document.querySelector('.noise-list-header, .noise-control')?.scrollIntoView({ block: 'start' }));
    },
    post: (p) => p.evaluate(() => (document.querySelector('.noise-list-header, .noise-control')?.checkVisibility() ? true : 'noise rack not visible')) },
  { id: 'scene3d-panel', fast: false, minItems: 23,
    run: async (p) => { await addLayer(p, 'scene3d'); await openPane(p, 'left'); },
    post: async (p) => {
      const l = await paneOpen(p, 'left');
      if (l !== true) return l;
      return ok(await hasLayer(p, 'scene3d'), 'no scene3d layer');
    } },
  { id: 'layer-selected-handles', fast: true, minItems: 13,
    run: async (p) => {
      await ensureLayer(p);
      await setTool(p, 'select');
      await guarded(p, () => {
        const app = window.app;
        const layer = app.engine.getActiveLayer?.() || app.engine.layers.find((l) => l.visible !== false);
        app.renderer.setSelection([layer.id], layer.id);
        app.render?.();
      });
    },
    post: (p) => p.evaluate(() => (window.app.renderer.selectedLayerIds && window.app.renderer.selectedLayerIds.size > 0 ? true : 'no selection')) },
  { id: 'pen-path-anchors', fast: false, minItems: 13,
    run: async (p) => {
      await setTool(p, 'pen');
      await p.waitForFunction(() => window.app.ui.activeTool === 'pen', null, { timeout: 10000 });
      const box = await p.evaluate(() => {
        const r = document.getElementById('main-canvas').getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      });
      const pts = [[0.35, 0.4], [0.6, 0.35], [0.65, 0.6], [0.4, 0.62]];
      const reachable = await p.evaluate((a) => a.every(([x, y]) => { const h = document.elementFromPoint(x, y); return !!h && (h.id === 'main-canvas' || h.id === 'viewport-container'); }), pts.map(([fx, fy]) => [box.x + box.w * fx, box.y + box.h * fy]));
      for (const [fx, fy] of pts) await touch.tap(p, { x: box.x + box.w * fx, y: box.y + box.h * fy });
      // touch-ok: audit setup only, journey spec owns finger-only. No finish affordance on touch yet.
      await p.keyboard.press('Enter');
      // On a layout where the canvas is covered (iPhone landscape today) the taps cannot reach
      // it, so no shape appears. Record that instead of failing; the postcondition checks it.
      const made = await p.waitForFunction(() => window.app.engine.layers.some((l) => l.type === 'shape'), null, { timeout: 3000 }).then(() => true, () => false);
      if (!made) await p.evaluate((r) => { window.__auditNotes = [r ? 'pen-taps-missed-reachable' : 'pen-taps-blocked']; }, reachable);
      await setTool(p, 'direct');
    },
    post: async (p) => {
      const t = await tool('direct')(p);
      if (t !== true) return t;
      if (await hasLayer(p, 'shape')) return true;
      // Allowed when the tap points were really not on the canvas (a covered canvas).
      // A reachable canvas at a positive scale that makes no shape is a stale opener.
      // Also allowed when the renderer scale is not positive (iPhone landscape today): the pen
      // cannot place anchors, and `scaleOk` already tracks that defect.
      const blocked = await p.evaluate(() => (window.__auditNotes || []).includes('pen-taps-blocked') || !(window.app.renderer.scale > 0));
      return ok(blocked, 'the pen taps did not create a shape layer although the canvas was reachable at the tap points');
    } },
];

module.exports = { STATES, openPane, addLayer, ensureLayer };
