#!/usr/bin/env node
/*
 * Vectura Studio — touch target + responsive layout audit (Playwright, Chromium).
 *
 * Re-runnable seed for regression tests. Read-only against the app: it only
 * drives the UI and measures it.
 *
 * Run:
 *   node scripts/dev-server.js 8414 &          # or any port
 *   node docs/touch-audit/scripts/target-audit.js [--port 8414] [--only ipad-portrait,iphone-portrait] [--states default,menu-file] [--no-shots]
 *
 * Output:
 *   docs/touch-audit/findings/target-audit.json      raw per-viewport/per-state data
 *   docs/touch-audit/evidence/layout/<vp>__<state>.png  screenshots (CSS-px scale)
 *
 * Thresholds: Apple HIG 44x44 CSS px; WCAG 2.2 AA 2.5.8 24x24 (with spacing
 * exception); crowding = nearest non-nested neighbour edge gap < 8 px; iOS
 * focus-zoom = text-entry control computed font-size < 16 px.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT_JSON = path.join(ROOT, 'docs/touch-audit/findings/target-audit.json');
const SHOT_DIR = path.join(ROOT, 'docs/touch-audit/evidence/layout');

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const PORT = Number(arg('port', process.env.PORT || 8414));
const BASE = `http://127.0.0.1:${PORT}/`;
const ONLY = arg('only', '') ? arg('only').split(',') : null;
const ONLY_STATES = arg('states', '') ? arg('states').split(',') : null;
const SHOTS = !argv.includes('--no-shots');

const UA_IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

// Safe-area insets the real device reports under viewport-fit=cover.
// (Chromium cannot emulate env(safe-area-inset-*): it always resolves to 0, so
// we measure geometry against these bands and separately detect whether the
// element is under a CSS rule that pads with env(safe-area-inset-<side>).)
const VIEWPORTS = [
  { id: 'ipad-portrait', width: 834, height: 1210, dpr: 2, ua: UA_IPAD, safe: { top: 24, bottom: 20, left: 0, right: 0 } },
  { id: 'ipad-landscape', width: 1210, height: 834, dpr: 2, ua: UA_IPAD, safe: { top: 24, bottom: 20, left: 0, right: 0 } },
  { id: 'iphone-portrait', width: 402, height: 874, dpr: 3, ua: UA_IPHONE, safe: { top: 59, bottom: 34, left: 0, right: 0 } },
  { id: 'iphone-landscape', width: 874, height: 402, dpr: 3, ua: UA_IPHONE, safe: { top: 0, bottom: 21, left: 59, right: 59 } },
];

// ---------------------------------------------------------------------------
// State openers. Each runs on a fresh page. Throwing marks the state "error".
// ---------------------------------------------------------------------------
const settle = (page, ms = 350) => page.waitForTimeout(ms);

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
  await settle(page, 450);
}

async function addLayer(page, type) {
  return page.evaluate((type) => {
    const app = window.app;
    const id = app.engine.addLayer(type);
    app.renderer.setSelection([id], id);
    app.ui.renderLayers?.();
    app.ui.buildControls?.();
    app.render?.();
    return id;
  }, type);
}

// Opens via DOM click (not a pointer click) so a trigger that is clipped
// off-screen on a phone still opens; its reachability is reported separately
// through the trigger's own hitState in the item list.
async function topMenu(page, id) {
  await page.evaluate((id) => document.getElementById(id).click(), id);
  await settle(page);
}

// The app boots with an empty document; states that need content add a layer.
async function ensureLayer(page, type = 'wavetable') {
  const has = await page.evaluate(() => (window.app.engine.layers || []).some((l) => l.visible !== false && !l.isGroup));
  if (!has) await addLayer(page, type);
  await settle(page, 500);
}

async function fileItem(page, itemId) {
  await page.evaluate(() => document.getElementById('btn-menu-file').click());
  await settle(page, 200);
  await page.evaluate((itemId) => document.getElementById(itemId).click(), itemId);
  await settle(page, 600);
}

const STATES = [
  { id: 'default', run: async () => {} },
  { id: 'left-pane-open', run: (p) => openPane(p, 'left') },
  { id: 'right-pane-layers', run: (p) => openPane(p, 'right') },
  { id: 'right-pane-pens', run: async (p) => {
    await openPane(p, 'right');
    await p.evaluate(() => document.querySelector('.right-pane-tab[data-tab="pens"]')?.click());
    await settle(p);
  } },
  { id: 'bottom-pane-open', run: async (p) => {
    await p.evaluate(() => {
      const bp = document.getElementById('bottom-pane');
      if (bp.classList.contains('bottom-pane-collapsed')) {
        const b = document.getElementById('btn-mobile-pane-bottom');
        ((b && b.offsetParent) ? b : document.getElementById('btn-pane-toggle-bottom')).click();
      }
    });
    await settle(p, 450);
  } },
  { id: 'menu-file', run: (p) => topMenu(p, 'btn-menu-file') },
  { id: 'menu-edit', run: (p) => topMenu(p, 'btn-menu-edit') },
  { id: 'menu-object', run: (p) => topMenu(p, 'btn-menu-object') },
  { id: 'menu-view', run: (p) => topMenu(p, 'btn-menu-view') },
  { id: 'menu-insert', run: (p) => topMenu(p, 'btn-menu-insert') },
  { id: 'menu-help', run: (p) => topMenu(p, 'btn-menu-help') },
  { id: 'layer-add-menu', run: async (p) => {
    await openPane(p, 'right');
    await p.evaluate(() => document.getElementById('btn-add-layer').click());
    await settle(p);
  } },
  { id: 'generator-picker', run: async (p) => {
    await openPane(p, 'left');
    await p.evaluate(() => document.getElementById('generator-module-trigger')?.click());
    await settle(p, 500);
  } },
  { id: 'modal-document-setup', run: (p) => fileItem(p, 'btn-settings') },
  { id: 'modal-export', run: async (p) => { await ensureLayer(p); await fileItem(p, 'btn-export'); } },
  { id: 'modal-help', run: async (p) => {
    await p.evaluate(() => document.getElementById('btn-menu-help').click());
    await settle(p, 200);
    await p.evaluate(() => document.getElementById('btn-help').click());
    await settle(p, 600);
  } },
  { id: 'modal-preset-save', run: async (p) => {
    await ensureLayer(p);
    await p.evaluate(() => {
      const layer = window.app.engine.getActiveLayer?.() || window.app.engine.layers[0];
      window.Vectura.UI.PresetSaveModal.open({
        layerType: layer.type, params: { ...layer.params }, suggestedName: 'Touch audit',
        origin: { kind: 'scratch', preset: null }, devMode: false, onConfirm() {},
      });
    });
    await settle(p, 600);
  } },
  // Inline designer lives in the left pane for a Petalis layer.
  { id: 'petal-designer-inline', run: async (p) => {
    await addLayer(p, 'petalisDesigner');
    await settle(p, 800);
    await openPane(p, 'left');
    await p.evaluate(() => document.querySelector('.petal-designer-inline, [class*="petal-designer"]')?.scrollIntoView({ block: 'start' }));
    await settle(p, 400);
  } },
  // Pop-out floating Petal Designer window.
  { id: 'petal-designer-window', run: async (p) => {
    const id = await addLayer(p, 'petalisDesigner');
    await settle(p, 800);
    await p.evaluate((id) => {
      const layer = window.app.engine.layers.find((l) => l.id === id);
      window.app.ui.openPetalDesigner({ layer, fromInline: true });
    }, id);
    await settle(p, 900);
  } },
  { id: 'text-panel', run: async (p) => {
    await addLayer(p, 'text');
    await settle(p, 800);
    await openPane(p, 'left');
  } },
  { id: 'fill-controls', run: async (p) => {
    await ensureLayer(p);
    await p.evaluate(() => window.app.ui.setActiveTool?.('fill'));
    await settle(p);
    await openPane(p, 'left');
    await p.evaluate(() => {
      const b = document.getElementById('paint-bucket-expand-btn');
      if (b && b.offsetParent) b.click();
    });
    await settle(p, 500);
  } },
  { id: 'color-picker', run: async (p) => {
    await openPane(p, 'right');
    await p.evaluate(() => document.querySelector('.right-pane-tab[data-tab="pens"]')?.click());
    await settle(p);
    await p.evaluate(() => {
      const input = document.querySelector('#pen-list .pen-color');
      const trig = input?.closest('.pen-item, li, div') || input;
      window.app.ui.openColorPickerAnchoredTo(input, trig, { title: 'Pen Color', uiInstance: window.app.ui });
    });
    await settle(p, 600);
  } },
  { id: 'noise-rack', run: async (p) => {
    await ensureLayer(p);
    await openPane(p, 'left');
    await p.evaluate(() => {
      const el = document.querySelector('.noise-list-header, .noise-control');
      el?.scrollIntoView({ block: 'start' });
    });
    await settle(p, 400);
  } },
  { id: 'scene3d-panel', run: async (p) => {
    await addLayer(p, 'scene3d');
    await settle(p, 1500);
    await openPane(p, 'left');
  } },
  { id: 'layer-selected-handles', run: async (p) => {
    await ensureLayer(p);
    await p.evaluate(() => {
      const app = window.app;
      app.ui.setActiveTool?.('select');
      const layer = app.engine.getActiveLayer?.() || app.engine.layers.find((l) => l.visible !== false);
      app.renderer.setSelection([layer.id], layer.id);
      app.render?.();
    });
    await settle(p, 400);
  } },
  { id: 'pen-path-anchors', run: async (p) => {
    await p.evaluate(() => window.app.ui.setActiveTool?.('pen'));
    await settle(p, 200);
    const box = await p.evaluate(() => {
      const r = document.getElementById('main-canvas').getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const pts = [[0.35, 0.4], [0.6, 0.35], [0.65, 0.6], [0.4, 0.62]];
    for (const [fx, fy] of pts) {
      await p.mouse.click(box.x + box.w * fx, box.y + box.h * fy);
      await settle(p, 120);
    }
    await p.keyboard.press('Enter');
    await settle(p, 300);
    await p.evaluate(() => window.app.ui.setActiveTool?.('direct'));
    await settle(p, 400);
  } },
];

// ---------------------------------------------------------------------------
// In-page measurement
// ---------------------------------------------------------------------------
function measureInPage(cfg) {
  const { safe } = cfg;
  // Device viewport = documentElement.client*; on a mobile UA Chromium grows
  // the *layout* viewport (innerWidth) to fit overflowing content, so
  // innerWidth > clientWidth itself signals horizontal page overflow.
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const layoutViewport = { w: window.innerWidth, h: window.innerHeight };
  const INTERACTIVE = [
    'button', 'a[href]', 'input:not([type=hidden])', 'select', 'textarea', 'summary',
    '[role=button]', '[role=slider]', '[role=tab]', '[role=menuitem]', '[role=menuitemradio]',
    '[role=menuitemcheckbox]', '[role=option]', '[role=checkbox]', '[role=switch]', '[role=radio]',
    '[role=combobox]', '[tabindex]:not([tabindex="-1"])', '[onclick]', '[contenteditable="true"]',
  ].join(',');

  const visible = (el) => {
    if (!el.isConnected) return false;
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  };

  // Candidate set: semantic interactive + cursor:pointer roots (proxy for JS click handlers).
  const set = new Set();
  document.querySelectorAll(INTERACTIVE).forEach((el) => set.add(el));
  const all = document.body.querySelectorAll('*');
  for (const el of all) {
    if (set.has(el)) continue;
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    const cs = getComputedStyle(el);
    if (cs.cursor !== 'pointer') continue;
    const parent = el.parentElement;
    if (parent && getComputedStyle(parent).cursor === 'pointer') continue; // inherited
    if (el.closest(INTERACTIVE)) continue; // inside an already-counted control
    set.add(el);
  }
  // Drop elements nested inside another candidate whose box contains them
  // (e.g. a span[role=button] inside a button) — keep the outermost.
  const cands = Array.from(set).filter(visible).filter((el) => {
    let p = el.parentElement;
    while (p) { if (set.has(p) && visible(p) && p.tagName !== 'LABEL') return false; p = p.parentElement; }
    return true;
  });

  const cssPath = (el) => {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let cur = el;
    for (let depth = 0; cur && cur !== document.body && depth < 4; depth++) {
      let s = cur.tagName.toLowerCase();
      if (cur.id) { parts.unshift(`#${CSS.escape(cur.id)}`); break; }
      const cls = Array.from(cur.classList).filter((c) => !/^(hidden|active|open|is-|hover|focus)/.test(c) && !c.includes(':') && !c.includes('[')).slice(0, 2);
      if (cls.length) s += '.' + cls.map((c) => CSS.escape(c)).join('.');
      for (const a of ['data-tool', 'data-tab', 'data-add', 'data-action', 'data-cmd', 'name', 'type']) {
        if (cur.hasAttribute(a) && cur.getAttribute(a).length < 30) { s += `[${a}="${cur.getAttribute(a)}"]`; break; }
      }
      parts.unshift(s);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  };
  const label = (el) => {
    const t = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder')
      || (el.value && el.tagName === 'INPUT' && el.type !== 'range' ? '' : '') || (el.textContent || '').replace(/\s+/g, ' ').trim();
    return (t || el.getAttribute('name') || el.id || el.tagName.toLowerCase()).slice(0, 60);
  };

  const REGIONS = [
    ['.vectura-modal, .modal-card, .export-modal, [role=dialog], dialog[open]', 'modal'],
    ['.top-menu-panel, .menu-dropdown, #layer-add-menu, #layer-filter-menu, #palette-menu', 'menu/popover'],
    ['.ctxbar', 'context-bar'],
    ['#touch-modifier-bar', 'touch-modifier-bar'],
    ['#tool-bar', 'tool-bar'],
    ['#app-header', 'header/menubar'],
    ['#left-pane', 'left-pane'],
    ['#right-pane', 'right-pane'],
    ['#bottom-pane', 'bottom-pane'],
    ['.hud-bar, #hud-bar', 'hud'],
    ['#viewport-container', 'canvas-overlay'],
  ];
  const region = (el) => {
    for (const [sel, name] of REGIONS) { if (el.closest(sel)) return name; }
    let p = el.parentElement;
    while (p && p !== document.body) { if (p.id) return `#${p.id}`; p = p.parentElement; }
    return 'body';
  };

  // Clip by overflow ancestors -> visible rect.
  const clipRect = (el) => {
    let r = el.getBoundingClientRect();
    let x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.bottom;
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      const cs = getComputedStyle(p);
      if (/(hidden|auto|scroll|clip)/.test(cs.overflowX + cs.overflowY)) {
        const pr = p.getBoundingClientRect();
        if (/(hidden|auto|scroll|clip)/.test(cs.overflowX)) { x1 = Math.max(x1, pr.left); x2 = Math.min(x2, pr.right); }
        if (/(hidden|auto|scroll|clip)/.test(cs.overflowY)) { y1 = Math.max(y1, pr.top); y2 = Math.min(y2, pr.bottom); }
      }
      if (cs.position === 'fixed') break;
      p = p.parentElement;
    }
    x1 = Math.max(x1, 0); y1 = Math.max(y1, 0); x2 = Math.min(x2, vw); y2 = Math.min(y2, vh);
    return { x1, y1, x2, y2, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
  };

  // Safe-area protected selectors (CSSOM scan).
  const safeSel = { top: [], bottom: [], left: [], right: [] };
  const walk = (rules) => {
    for (const rule of rules) {
      if (rule.cssRules && !rule.selectorText) { try { if (!rule.media || window.matchMedia(rule.media.mediaText).matches) walk(rule.cssRules); } catch (_) {} continue; }
      if (!rule.style || !rule.selectorText) continue;
      const txt = rule.style.cssText;
      if (!txt.includes('safe-area-inset')) continue;
      for (const side of ['top', 'bottom', 'left', 'right']) if (txt.includes(`safe-area-inset-${side}`)) safeSel[side].push(rule.selectorText);
    }
  };
  for (const ss of document.styleSheets) { try { walk(ss.cssRules); } catch (_) {} }
  const safeProtected = (el, side) => {
    let p = el;
    while (p && p !== document.documentElement) {
      for (const s of safeSel[side]) { try { if (p.matches(s)) return true; } catch (_) {} }
      p = p.parentElement;
    }
    return false;
  };

  const TEXT_TYPES = new Set(['text', 'number', 'search', 'email', 'url', 'tel', 'password', '']);
  const items = [];
  for (const el of cands) {
    const r = el.getBoundingClientRect();
    const c = clipRect(el);
    const tag = el.tagName.toLowerCase();
    const type = tag === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : null;
    const onscreen = c.w > 1 && c.h > 1;
    let hitState = 'offscreen';
    let coveredBy = null;
    if (onscreen) {
      const cx = (c.x1 + c.x2) / 2; const cy = (c.y1 + c.y2) / 2;
      const hit = document.elementFromPoint(cx, cy);
      if (!hit) hitState = 'none';
      else if (hit === el || el.contains(hit) || (hit.tagName === 'LABEL' && hit.control === el)) hitState = 'ok';
      else if (hit.contains(el)) hitState = 'ok-ancestor';
      else { hitState = 'covered'; coveredBy = (hit.id ? `#${hit.id}` : hit.tagName.toLowerCase() + (hit.classList[0] ? '.' + hit.classList[0] : '')); }
    }
    const clipped = onscreen && (c.w + 1 < r.width || c.h + 1 < r.height);
    const isTextEntry = (tag === 'input' && TEXT_TYPES.has(type)) || tag === 'textarea' || tag === 'select' || el.isContentEditable;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    const inBand = {
      top: onscreen && safe.top > 0 && c.y1 < safe.top,
      bottom: onscreen && safe.bottom > 0 && c.y2 > vh - safe.bottom,
      left: onscreen && safe.left > 0 && c.x1 < safe.left,
      right: onscreen && safe.right > 0 && c.x2 > vw - safe.right,
    };
    const safeIssues = Object.keys(inBand).filter((s) => inBand[s] && !safeProtected(el, s));
    items.push({
      el, sel: cssPath(el), label: label(el), tag, type, role: el.getAttribute('role'), region: region(el),
      x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      onscreen, clipped, hitState, coveredBy,
      hig44: r.width >= 44 && r.height >= 44,
      min24: r.width >= 24 && r.height >= 24,
      textEntry: isTextEntry, fontSize: fs, iosZoom: isTextEntry && fs < 16,
      safeBands: Object.keys(inBand).filter((s) => inBand[s]), safeUnprotected: safeIssues,
    });
  }

  // Nearest neighbour gap among on-screen, reachable targets.
  const live = items.filter((i) => i.onscreen && (i.hitState === 'ok' || i.hitState === 'ok-ancestor'));
  for (const a of live) {
    let best = Infinity; let bestSel = null; let wcagSpacingOk = true;
    const acx = a.x + a.w / 2; const acy = a.y + a.h / 2;
    for (const b of live) {
      if (a === b || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const dx = Math.max(0, Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w)));
      const dy = Math.max(0, Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h)));
      const d = Math.hypot(dx, dy);
      if (d < best) { best = d; bestSel = b.sel; }
      if (!a.min24) {
        // WCAG 2.5.8 spacing exception: 24px circle on a's centre must not hit b
        // (or b's circle when b is also undersized).
        const nx = Math.max(b.x, Math.min(acx, b.x + b.w)); const ny = Math.max(b.y, Math.min(acy, b.y + b.h));
        if (Math.hypot(nx - acx, ny - acy) < 12) wcagSpacingOk = false;
        if (!b.min24 && Math.hypot((b.x + b.w / 2) - acx, (b.y + b.h / 2) - acy) < 24) wcagSpacingOk = false;
      }
    }
    a.gap = Number.isFinite(best) ? +best.toFixed(1) : null;
    a.gapTo = bestSel;
    a.crowded = a.gap !== null && a.gap < 8;
    a.wcag258 = a.min24 || wcagSpacingOk;
  }
  items.forEach((i) => { delete i.el; });

  // Canvas fitness: sampled unobstructed canvas area.
  const canvas = document.getElementById('main-canvas');
  let canvasPct = 0; let canvasBoxPct = 0;
  if (canvas) {
    const cr = canvas.getBoundingClientRect();
    const ix = Math.max(0, Math.min(cr.right, vw) - Math.max(cr.left, 0));
    const iy = Math.max(0, Math.min(cr.bottom, vh) - Math.max(cr.top, 0));
    canvasBoxPct = +(100 * ix * iy / (vw * vh)).toFixed(1);
    const N = 48; let hits = 0;
    for (let gx = 0; gx < N; gx++) for (let gy = 0; gy < N; gy++) {
      const px = (gx + 0.5) * vw / N; const py = (gy + 0.5) * vh / N;
      const h = document.elementFromPoint(px, py);
      if (h === canvas || (h && h.id === 'viewport-container')) hits++;
    }
    canvasPct = +(100 * hits / (N * N)).toFixed(1);
  }

  // Overflow.
  const de = document.documentElement;
  const hOverflow = Math.max(de.scrollWidth, document.body.scrollWidth, window.innerWidth) - vw;
  const vOverflow = Math.max(de.scrollHeight, document.body.scrollHeight) - vh;
  const overflowers = [];
  if (hOverflow > 0) {
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && r.width > 0 && visible(el)) overflowers.push({ sel: cssPath(el), right: +r.right.toFixed(0) });
      if (overflowers.length > 12) break;
    }
  }

  // Overlays / modals.
  const overlays = [];
  document.querySelectorAll('.vectura-modal, .modal-card, .export-modal, [role=dialog], dialog[open], .top-menu-panel, .menu-dropdown, #layer-add-menu, .settings-panel, .petal-designer, [class*="petal-designer-"], .color-picker, [class*="color-picker"], .preset-save-modal, [class*="cp-popover"], .gm-popover, [class*="generator-module-menu"], [class*="gm-menu"]').forEach((el) => {
    if (!visible(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 60 || r.height < 40) return;
    if (r.right <= 1 || r.left >= vw - 1 || r.bottom <= 1 || r.top >= vh - 1) return; // parked off-screen (closed drawer)
    if (overlays.some((o) => o._el.contains(el))) return;
    const closeBtn = Array.from(el.querySelectorAll('button, [role=button]')).find((b) => /close|dismiss|cancel|done|✕|×/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + (b.textContent || '').trim().slice(0, 12)) && visible(b));
    let close = null;
    if (closeBtn) {
      const br = closeBtn.getBoundingClientRect();
      const cx = br.left + br.width / 2; const cy = br.top + br.height / 2;
      const h = document.elementFromPoint(Math.min(Math.max(cx, 0), vw - 1), Math.min(Math.max(cy, 0), vh - 1));
      close = { sel: cssPath(closeBtn), label: label(closeBtn), x: +br.left.toFixed(0), y: +br.top.toFixed(0), w: +br.width.toFixed(1), h: +br.height.toFixed(1),
        inViewport: br.left >= 0 && br.top >= 0 && br.right <= vw && br.bottom <= vh,
        reachable: !!h && (h === closeBtn || closeBtn.contains(h)),
        inSafeBand: (safe.top && br.top < safe.top) || (safe.bottom && br.bottom > vh - safe.bottom) || false };
    }
    const cs = getComputedStyle(el);
    overlays.push({ _el: el, sel: cssPath(el), x: +r.left.toFixed(0), y: +r.top.toFixed(0), w: +r.width.toFixed(0), h: +r.height.toFixed(0),
      fits: r.left >= -0.5 && r.top >= -0.5 && r.right <= vw + 0.5 && r.bottom <= vh + 0.5,
      overflowY: cs.overflowY, scrollable: el.scrollHeight > el.clientHeight + 1, overscroll: cs.overscrollBehaviorY, close });
  });
  overlays.forEach((o) => { delete o._el; });

  // Scroll containment of panes.
  const scrollers = [];
  for (const el of all) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    if (!/(auto|scroll)/.test(cs.overflowY)) continue;
    if (el.scrollHeight <= el.clientHeight + 1) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 60) continue;
    scrollers.push({ sel: cssPath(el), h: +r.height.toFixed(0), scrollH: el.scrollHeight, overscroll: cs.overscrollBehaviorY, touchAction: cs.touchAction, webkitOverflowScrolling: cs.webkitOverflowScrolling || null,
      bottomBeyondViewport: r.bottom > vh + 1 });
    if (scrollers.length > 20) break;
  }

  const bodyCs = getComputedStyle(document.body);
  return {
    vw, vh, layoutViewport, dpr: window.devicePixelRatio,
    layout: ['mobile-layout', 'phone-layout', 'auto-collapsed'].filter((c) => document.body.classList.contains(c)),
    coarse: matchMedia('(pointer: coarse)').matches, hover: matchMedia('(hover: hover)').matches,
    bodyOverscroll: bodyCs.overscrollBehaviorY, htmlOverscroll: getComputedStyle(de).overscrollBehaviorY,
    canvasTouchAction: canvas ? getComputedStyle(canvas).touchAction : null,
    canvasPct, canvasBoxPct, hOverflow, vOverflow, overflowers, overlays, scrollers,
    safeSelectors: Object.fromEntries(Object.entries(safeSel).map(([k, v]) => [k, v.length])),
    items,
  };
}

// Canvas handle hit radii (probe the renderer's own hit-test functions).
function probeHandles() {
  const r = window.app?.renderer;
  if (!r) return null;
  const out = { scale: r.scale, cssPxPerScreenUnit: null };
  const canvas = document.getElementById('main-canvas');
  out.canvasCss = { w: canvas.clientWidth, h: canvas.clientHeight, backing: canvas.width };
  const layer = r.engine.layers.find((l) => r.selectedLayerIds?.has(l.id)) || r.engine.getActiveLayer?.();
  const bounds = layer ? r.getSelectionBounds([layer]) : null;
  if (bounds && typeof r.hitHandle === 'function') {
    const c = r.worldToScreen(bounds.corners.se.x, bounds.corners.se.y);
    const radius = (dx, dy, pred) => { let d = 0; for (; d < 80; d += 0.5) { if (!pred(r.hitHandle(c.x + dx * d, c.y + dy * d, bounds))) break; } return d; };
    out.resizeCornerRadius = radius(1, 0, (h) => h === 'se');
    out.rotateRadiusOutside = radius(Math.SQRT1_2, Math.SQRT1_2, (h) => h === 'se' || h === 'rotate-se');
    const n = r._edgeMidpoint ? r.worldToScreen(r._edgeMidpoint(bounds, 'n').x, r._edgeMidpoint(bounds, 'n').y) : null;
    if (n) { let d = 0; for (; d < 80; d += 0.5) { if (r.hitHandle(n.x + d, n.y, bounds) !== 'n') break; } out.edgeMidRadius = d; }
    out.selectionScreenBox = { w: +(bounds.maxX - bounds.minX || 0) * r.scale };
  }
  if (typeof r._hitControlInAnchors === 'function') {
    const w0 = r.screenToWorld(200, 200);
    const probe = (anchor, type) => { let d = 0; for (; d < 80; d += 0.25) { const w = r.screenToWorld(200 + d, 200); const h = r._hitControlInAnchors(w, [anchor]); if (!h || h.type !== type) break; } return d; };
    out.anchorRadius = probe({ x: w0.x, y: w0.y }, 'anchor');
    const far = r.screenToWorld(600, 600);
    out.bezierHandleRadius = probe({ x: far.x, y: far.y, in: { x: w0.x, y: w0.y } }, 'in');
  }
  return out;
}

// ---------------------------------------------------------------------------
async function main() {
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const results = { generatedAt: new Date().toISOString(), base: BASE, thresholds: { hig: 44, wcag: 24, crowdGap: 8, iosZoomFont: 16 }, viewports: [] };

  for (const vp of VIEWPORTS) {
    if (ONLY && !ONLY.includes(vp.id)) continue;
    const vpOut = { id: vp.id, width: vp.width, height: vp.height, dpr: vp.dpr, safe: vp.safe, states: [] };
    for (const st of STATES) {
      if (ONLY_STATES && !ONLY_STATES.includes(st.id)) continue;
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr,
        isMobile: true, hasTouch: true, userAgent: vp.ua,
      });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 200)));
      const rec = { id: st.id };
      try {
        await page.goto(BASE, { waitUntil: 'load' });
        await page.waitForFunction(() => window.app && window.app.renderer && window.app.ui, null, { timeout: 20000 });
        await settle(page, 900);
        // Dismiss a first-run tour popover if one appears so it does not skew states.
        await page.evaluate(() => { const t = document.getElementById('tutorial-popover'); if (t && t.offsetParent) t.querySelector('[data-action="close"], .tutorial-close, button')?.click(); });
        await st.run(page);
        const m = await page.evaluate(measureInPage, { safe: vp.safe });
        Object.assign(rec, m);
        if (st.id === 'layer-selected-handles' || st.id === 'pen-path-anchors') rec.handles = await page.evaluate(probeHandles);
        if (SHOTS) {
          rec.screenshot = `docs/touch-audit/evidence/layout/${vp.id}__${st.id}.png`;
          await page.screenshot({ path: path.join(ROOT, rec.screenshot), scale: 'css' });
        }
      } catch (e) {
        rec.error = String(e.message || e).split('\n')[0].slice(0, 300);
      }
      rec.pageErrors = errors.slice(0, 5);
      vpOut.states.push(rec);
      const n = rec.items ? rec.items.filter((i) => i.onscreen).length : 0;
      process.stdout.write(`${vp.id} ${st.id}: ${rec.error ? 'ERROR ' + rec.error : n + ' on-screen targets, canvas ' + rec.canvasPct + '%'}\n`);
      await ctx.close();
    }
    vpOut.summary = summarize(vpOut.states);
    results.viewports.push(vpOut);
  }
  await browser.close();
  fs.writeFileSync(OUT_JSON, JSON.stringify(results));
  console.log(`wrote ${path.relative(ROOT, OUT_JSON)}`);
}

// Unique-target summary per viewport (dedupe by selector across states).
function summarize(states) {
  const uniq = new Map();
  for (const s of states) for (const i of s.items || []) {
    if (!i.onscreen) continue;
    const prev = uniq.get(i.sel);
    const ok = (x) => x.hitState === 'ok' || x.hitState === 'ok-ancestor';
    if (!prev || (ok(i) && !ok(prev))) uniq.set(i.sel, i);
  }
  const arr = Array.from(uniq.values());
  const pct = (n) => (arr.length ? +(100 * n / arr.length).toFixed(1) : 0);
  const def = states.find((s) => s.id === 'default');
  return {
    uniqueTargets: arr.length,
    under44: arr.filter((i) => !i.hig44).length, pctUnder44: pct(arr.filter((i) => !i.hig44).length),
    under24: arr.filter((i) => !i.min24).length, pctUnder24: pct(arr.filter((i) => !i.min24).length),
    failWcag258: arr.filter((i) => i.wcag258 === false).length,
    crowded: arr.filter((i) => i.crowded).length,
    inputsUnder16: arr.filter((i) => i.iosZoom).length,
    covered: arr.filter((i) => i.hitState === 'covered').length,
    safeUnprotected: arr.filter((i) => i.safeUnprotected && i.safeUnprotected.length).length,
    defaultLayout: def ? def.layout : null,
    defaultCanvasPct: def ? def.canvasPct : null,
    canvasPctByState: Object.fromEntries(states.map((s) => [s.id, s.canvasPct ?? null])),
    hOverflowStates: states.filter((s) => s.hOverflow > 0).map((s) => `${s.id}:+${s.hOverflow}`),
    errors: states.filter((s) => s.error).map((s) => `${s.id}: ${s.error}`),
  };
}

main().catch((e) => { console.error(e); process.exit(1); });
