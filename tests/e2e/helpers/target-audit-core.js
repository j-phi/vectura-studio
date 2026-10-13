// Touch target + layout audit: the single measurement core (TUX-058).
//
// Used by three callers, so every definition lives here once:
//   - tests/e2e/touch/target-audit.spec.js   (the CI ratchet)
//   - tests/e2e/helpers/touch.js             (hitArea / canvasShare delegate here)
//   - docs/touch-audit/scripts/target-audit.js (thin CLI)
//
// Two sections:
//   1. PAGE SECTION. `measureInPage`, `hitAreaInPage`, `canvasShareInPage`, `probeHandles` run
//      inside the page. They must be self-contained (no closure over Node variables). Run them
//      through `measurePage`, `probeHit`, `probeCanvasShare` (they inline the helper sources).
//   2. NODE SECTION. METRICS, SAFE_BANDS, summarizeState, compareCell, compareFinal,
//      serializeBaseline, updateBaselineCell. Pure Node. Unit-tested by
//      tests/unit/touch-target-ratchet.test.js.
'use strict';

const fs = require('fs');

// ---------------------------------------------------------------------------
// 1. PAGE SECTION
// ---------------------------------------------------------------------------

// hitAreaInPage(el, opts) -> { w, h }
// Probes elementFromPoint on a `probe` px grid around the origin, flood-fills the cells the
// element "owns" and returns the bounding box of that region. Owned means: t === el,
// el.contains(t), or t is a LABEL whose control is el. The origin is the CLIPPED-rect centre
// (the same point the covered test uses) unless opts.cx / opts.cy are given.
// opts: { probe = 2, radius = 24 (each side), stopAt = 0 (stop once both axes reach it), cx, cy }
function hitAreaInPage(el, opts) {
  const o = opts || {};
  const probe = o.probe || 2;
  const radius = o.radius || 24;
  const stopAt = o.stopAt || 0;
  let cx = o.cx;
  let cy = o.cy;
  if (typeof cx !== 'number' || typeof cy !== 'number') {
    const r = el.getBoundingClientRect();
    let x1 = r.left; let y1 = r.top; let x2 = r.right; let y2 = r.bottom;
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
    x1 = Math.max(x1, 0); y1 = Math.max(y1, 0); x2 = Math.min(x2, window.innerWidth); y2 = Math.min(y2, window.innerHeight);
    if (x2 <= x1 || y2 <= y1) { x1 = r.left; y1 = r.top; x2 = r.right; y2 = r.bottom; }
    cx = (x1 + x2) / 2;
    cy = (y1 + y2) / 2;
  }
  // Hit testing snaps to whole pixels (a point at x.5 hits the pixel x), so sample on integer
  // coordinates: the owned samples then count owned pixels exactly.
  cx = Math.round(cx);
  cy = Math.round(cy);
  const ownedAt = (dx, dy) => {
    const t = document.elementFromPoint(cx + dx, cy + dy);
    return !!t && (t === el || el.contains(t) || (t.tagName === 'LABEL' && t.control === el));
  };
  if (!ownedAt(0, 0)) return { w: 0, h: 0 };
  // Fast path (bounded cost): a 44 px span, asymmetric about the origin so it covers pixels
  // -22..+21, owned at the four EDGE MIDPOINTS and the centre has a full 44 px hit area on both
  // axes. Corners are NOT sampled: a rounded 44x44 target does not own its corner pixels.
  if (stopAt === 44 && radius >= 22) {
    if (ownedAt(-22, 0) && ownedAt(21, 0) && ownedAt(0, -22) && ownedAt(0, 21)) return { w: 44, h: 44 };
  }
  // Slow path: width = contiguous owned run along the CENTRE ROW, height = along the CENTRE
  // COLUMN, stepped at 1 px outward from the origin. Rounded corners cannot shorten either run.
  const run = (ux, uy) => {
    let pos = 0; let neg = 0;
    while (pos < radius && ownedAt(ux * (pos + 1), uy * (pos + 1))) pos += 1;
    while (neg < radius && ownedAt(-ux * (neg + 1), -uy * (neg + 1))) neg += 1;
    return pos + neg + 1;
  };
  return { w: run(1, 0), h: run(0, 1) };
}

// canvasShareInPage({ W, H, selector, cells }) -> percent 0..100
// A cells x cells grid over the SPEC viewport (W x H), sample at ((gx+.5)*W/cells, (gy+.5)*H/cells).
// A hit is the canvas, a descendant of it, or #viewport-container (default canvas only).
function canvasShareInPage(args) {
  const { W, H, selector, cells } = args;
  const N = cells || 48;
  const canvas = document.querySelector(selector || '#main-canvas');
  if (!canvas) return 0;
  const useContainer = !selector || selector === '#main-canvas';
  let hits = 0;
  for (let gx = 0; gx < N; gx += 1) {
    for (let gy = 0; gy < N; gy += 1) {
      const h = document.elementFromPoint((gx + 0.5) * W / N, (gy + 0.5) * H / N);
      if (h && (h === canvas || canvas.contains(h) || (useContainer && h.id === 'viewport-container'))) hits += 1;
    }
  }
  return +(100 * hits / (N * N)).toFixed(1);
}

// measureInPage(cfg, helpers) -> raw record. cfg: { W, H, safe, allow: [selector] }.
// helpers: { hitAreaInPage, canvasShareInPage } (injected by measurePage).
function measureInPage(cfg, helpers) {
  const { W, H, safe } = cfg;
  const allowSel = cfg.allow || [];
  const vw = W;
  const vh = H;
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
  // A semantic control nested in a cursor:pointer row is its own target (the row's eye/lock/delete
  // buttons are real, separately tappable controls). Only cursor:pointer proxies nested in another
  // candidate are folded into the ancestor.
  const SEMANTIC = [
    'button', 'a[href]', 'input:not([type=hidden])', 'select', 'textarea', 'summary',
    '[role=button]', '[role=slider]', '[role=tab]', '[role=menuitem]', '[role=menuitemradio]',
    '[role=menuitemcheckbox]', '[role=option]', '[role=checkbox]', '[role=switch]', '[role=radio]',
  ].join(',');
  const cands = Array.from(set).filter(visible).filter((el) => {
    if (el.matches(SEMANTIC)) return true;
    let p = el.parentElement;
    while (p) { if (set.has(p) && visible(p) && p.tagName !== 'LABEL') return false; p = p.parentElement; }
    return true;
  });

  // Selector for an element. Each segment carries :nth-of-type when a same-tag sibling exists,
  // so sibling buttons (the 5 #touch-modifier-bar buttons) get DISTINCT selectors. The path is
  // 4 levels deep first; if that does not match exactly one element it grows to the full chain.
  const segment = (cur) => {
    let s = cur.tagName.toLowerCase();
    const cls = Array.from(cur.classList).filter((c) => !/^(hidden|active|open|is-|hover|focus)/.test(c) && !c.includes(':') && !c.includes('[')).slice(0, 2);
    if (cls.length) s += '.' + cls.map((c) => CSS.escape(c)).join('.');
    for (const a of ['data-tool', 'data-tab', 'data-add', 'data-action', 'data-cmd', 'name', 'type']) {
      if (cur.hasAttribute(a) && cur.getAttribute(a).length < 30) { s += `[${a}="${cur.getAttribute(a)}"]`; break; }
    }
    const par = cur.parentElement;
    if (par) {
      const same = Array.from(par.children).filter((c) => c.tagName === cur.tagName);
      if (same.length > 1) s += `:nth-of-type(${same.indexOf(cur) + 1})`;
    }
    return s;
  };
  const buildPath = (el, maxDepth) => {
    const parts = [];
    let cur = el;
    for (let depth = 0; cur && cur !== document.body && depth < maxDepth; depth++) {
      if (cur.id) { parts.unshift(`#${CSS.escape(cur.id)}`); break; }
      parts.unshift(segment(cur));
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  };
  const cssPath = (el) => {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const short = buildPath(el, 4);
    try { if (document.querySelectorAll(short).length === 1) return short; } catch (_) { /* fall through */ }
    return buildPath(el, 64);
  };
  const label = (el) => {
    const t = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder')
      || (el.textContent || '').replace(/\s+/g, ' ').trim();
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

  // Clip by overflow ancestors -> visible rect (bounded by the SPEC viewport).
  const clipRect = (el) => {
    const r = el.getBoundingClientRect();
    let x1 = r.left; let y1 = r.top; let x2 = r.right; let y2 = r.bottom;
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

  // Ghost targets: interactive (or cursor:pointer root) elements that are invisible (opacity 0
  // on themselves or an ancestor) yet still receive the hit test at their clipped centre.
  // checkVisibility(opacityProperty) hides them from `cands`, so count them separately.
  let ghost = 0;
  const ghostSel = [];
  for (const el of set) {
    if (!el.isConnected) continue;
    const cs = getComputedStyle(el);
    if (cs.pointerEvents === 'none' || cs.visibility === 'hidden') continue;
    let op0 = false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      if (getComputedStyle(p).opacity === '0') { op0 = true; break; }
    }
    if (!op0) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0.5 || r.height <= 0.5) continue;
    const c = clipRect(el);
    if (!(c.w > 1 && c.h > 1)) continue;
    const hit = document.elementFromPoint((c.x1 + c.x2) / 2, (c.y1 + c.y2) / 2);
    if (hit && (hit === el || el.contains(hit))) { ghost += 1; if (ghostSel.length < 8) ghostSel.push(cssPath(el)); }
  }

  // Stranded targets: RENDERED interactive targets (not display:none, not visibility:hidden,
  // rect over 1x1) whose clipped rect is empty and that neither document scrolling nor a
  // scrollable ancestor container can bring into view. Clipping the overflow away (overflow:hidden
  // on html/body or a bar) lowers hOverflow but strands these controls; this metric catches it.
  const rootOv = (axis) => {
    const h = getComputedStyle(document.documentElement)[axis];
    return h === 'visible' ? getComputedStyle(document.body)[axis] : h;
  };
  const htmlCs = getComputedStyle(document.documentElement);
  const rootOvPropagated = htmlCs.overflowX === 'visible' && htmlCs.overflowY === 'visible';
  const rootScrollX = !/^(hidden|clip)$/.test(rootOv('overflowX'));
  const rootScrollY = !/^(hidden|clip)$/.test(rootOv('overflowY'));
  const rootW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  const rootH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  const rendered = (el) => {
    if (!el.isConnected) return false;
    if (el.checkVisibility) { if (!el.checkVisibility({ visibilityProperty: true })) return false; } else {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const isStranded = (el) => {
    const r = el.getBoundingClientRect();
    if (clipRect(el).w > 1 && clipRect(el).h > 1) return false;
    // Closed by design: aria-hidden / inert subtree is not offered to the user.
    if (el.closest('[aria-hidden="true"],[inert]')) return false;
    // Clip by ancestors only (not by the viewport). Remember a scrollable ancestor.
    let x1 = r.left; let y1 = r.top; let x2 = r.right; let y2 = r.bottom;
    let fixed = false;
    let ancScroll = false;
    let hiddenEmpty = false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.position === 'fixed') fixed = true;
      if (p === el) continue;
      // body overflow propagates to the viewport when html is `visible`: body is then no clip box.
      if (p === document.body && rootOvPropagated) continue;
      const hx = /^(hidden|clip)$/.test(cs.overflowX); const hy = /^(hidden|clip)$/.test(cs.overflowY);
      const sx = /^(auto|scroll)$/.test(cs.overflowX); const sy = /^(auto|scroll)$/.test(cs.overflowY);
      if (!(hx || hy || sx || sy)) continue;
      const pr = p.getBoundingClientRect();
      // A collapsed disclosure (clip box with a zero-size axis, e.g. .vtp-reveal-inner at height 0)
      // is closed by design, not a stranded control.
      if ((hx || hy) && !(sx || sy) && (pr.width <= 1 || pr.height <= 1)) return false;
      if ((sx || sy) && !hiddenEmpty) {
        const canScroll = (sx && p.scrollWidth > p.clientWidth + 1) || (sy && p.scrollHeight > p.clientHeight + 1);
        const onScreen = pr.right > 0 && pr.left < vw && pr.bottom > 0 && pr.top < vh && pr.width > 1 && pr.height > 1;
        if (canScroll && onScreen && rendered(p)) ancScroll = true;
      }
      if (hx || sx) { x1 = Math.max(x1, pr.left); x2 = Math.min(x2, pr.right); }
      if (hy || sy) { y1 = Math.max(y1, pr.top); y2 = Math.min(y2, pr.bottom); }
      if ((hx || hy) && !(sx || sy) && (x2 <= x1 || y2 <= y1)) hiddenEmpty = true;
    }
    if (hiddenEmpty) return !ancScroll;
    if (ancScroll) return false;
    // Clipped only by the viewport. The user can bring it into view by panning when it lies inside
    // the layout viewport (innerWidth x innerHeight: on a mobile UA this can be wider than the
    // spec viewport, and the visual viewport pans across it even when the root overflow is
    // hidden), or, when the root can scroll that axis, inside the scrollable extent.
    const sxp = fixed ? 0 : window.scrollX; const syp = fixed ? 0 : window.scrollY;
    const extW = Math.max(window.innerWidth, rootScrollX && !fixed ? rootW : 0);
    const extH = Math.max(window.innerHeight, rootScrollY && !fixed ? rootH : 0);
    const needX = r.right <= 0 || r.left >= vw;
    const needY = r.bottom <= 0 || r.top >= vh;
    if (needX && !(r.left + sxp >= -1 && r.right + sxp <= extW + 1)) return true;
    if (needY && !(r.top + syp >= -1 && r.bottom + syp <= extH + 1)) return true;
    return false;
  };
  // A parked drawer is off-canvas BY DESIGN (a closed pane or panel, reached by opening it, which
  // is a separate audit state): an absolute/fixed ancestor lying fully outside the layout viewport.
  const parkedDrawer = (el) => {
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const pos = getComputedStyle(p).position;
      if (pos !== 'fixed' && pos !== 'absolute') continue;
      const pr = p.getBoundingClientRect();
      if (pr.width > 1 && pr.height > 1 && (pr.right <= 0 || pr.left >= window.innerWidth || pr.bottom <= 0 || pr.top >= window.innerHeight)) return true;
    }
    return false;
  };
  const openMenus = Array.from(document.querySelectorAll('.top-menu-panel.open, .menu-dropdown.open')).filter(visible);
  // Q15 (hardened): a row counts as cut by its own scroller only when the scroller is visible, the row fits inside it, and the
  // scroll range really reaches the hidden part (the row can scroll fully into view). Anything else is a real clip.
  const scrollCut = (el, r) => {
    const cut = { x: false, y: false };
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      const pr = p.getBoundingClientRect();
      if (/(auto|scroll)/.test(cs.overflowY) || /(auto|scroll)/.test(cs.overflowX)) {
        if (!visible(p) || cs.visibility === 'hidden' || pr.width < 1 || pr.height < 1) continue;
      }
      if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 1 && r.height <= p.clientHeight + 0.5) {
        const above = pr.top - r.top; const below = r.bottom - pr.bottom;
        const roomDown = p.scrollHeight - p.clientHeight - p.scrollTop;
        if ((above > 0.5 && above <= p.scrollTop + 0.5) || (below > 0.5 && below <= roomDown + 0.5)) cut.y = true;
      }
      if (/(auto|scroll)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth + 1 && r.width <= p.clientWidth + 0.5) {
        const left = pr.left - r.left; const right = r.right - pr.right;
        const roomRight = p.scrollWidth - p.clientWidth - p.scrollLeft;
        if ((left > 0.5 && left <= p.scrollLeft + 0.5) || (right > 0.5 && right <= roomRight + 0.5)) cut.x = true;
      }
      if (cs.position === 'fixed') break;
    }
    return cut;
  };
  let parked = 0;
  let stranded = 0;
  const strandedSel = [];
  const renderedSet = new Set(Array.from(set).filter(rendered));
  for (const el of renderedSet) {
    let nested = false;
    for (let p = el.parentElement; p; p = p.parentElement) { if (renderedSet.has(p) && p.tagName !== 'LABEL') { nested = true; break; } }
    if (nested) continue;
    if (parkedDrawer(el)) { parked += 1; continue; }
    if (isStranded(el)) { stranded += 1; if (strandedSel.length < 12) strandedSel.push(cssPath(el)); }
  }
  const allowCounts = {};
  for (const s of allowSel) { try { allowCounts[s] = document.querySelectorAll(s).length; } catch (_) { allowCounts[s] = -1; } }

  // Safe-area protection (CSSOM scan). Pass 1 collects custom properties whose declared value
  // contains env(safe-area-inset-<side>) (e.g. --safe-top). Pass 2 treats a rule as protecting
  // a side when its cssText contains safe-area-inset-<side> OR var(--<collected name>).
  const SIDES = ['top', 'bottom', 'left', 'right'];
  const ruleList = [];
  const walk = (rules) => {
    for (const rule of rules) {
      if (rule.cssRules && !rule.selectorText) {
        try { if (!rule.media || window.matchMedia(rule.media.mediaText).matches) walk(rule.cssRules); } catch (_) { /* ignore */ }
        continue;
      }
      if (rule.style && rule.selectorText) ruleList.push(rule);
    }
  };
  for (const ss of document.styleSheets) { try { walk(ss.cssRules); } catch (_) { /* cross-origin sheet */ } }
  const safeVars = { top: [], bottom: [], left: [], right: [] };
  for (const rule of ruleList) {
    const st = rule.style;
    for (let i = 0; i < st.length; i += 1) {
      const name = st[i];
      if (!name.startsWith('--')) continue;
      const val = st.getPropertyValue(name);
      for (const side of SIDES) if (val.includes(`env(safe-area-inset-${side}`)) safeVars[side].push(name);
    }
  }
  const safeSel = { top: [], bottom: [], left: [], right: [] };
  for (const rule of ruleList) {
    const txt = rule.style.cssText;
    for (const side of SIDES) {
      const direct = txt.includes(`safe-area-inset-${side}`);
      const viaVar = safeVars[side].some((n) => txt.includes(`var(${n}`));
      if (direct || viaVar) safeSel[side].push(rule.selectorText);
    }
  }
  const safeProtected = (el, side) => {
    let p = el;
    while (p && p !== document.documentElement) {
      for (const s of safeSel[side]) { try { if (p.matches(s)) return true; } catch (_) { /* bad selector */ } }
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
    let cx = 0; let cy = 0;
    if (onscreen) {
      cx = (c.x1 + c.x2) / 2; cy = (c.y1 + c.y2) / 2;
      const hit = document.elementFromPoint(cx, cy);
      if (!hit) hitState = 'none';
      else if (hit === el || el.contains(hit) || (hit.tagName === 'LABEL' && hit.control === el)) hitState = 'ok';
      else if (hit.contains(el)) hitState = 'ok-ancestor';
      // An open dropdown menu, and the visible drawer backdrop (Jay 2026-10-12 Q13: it only dismisses), are transient
      // dismiss-on-outside-tap layers: they sit over the tools by design (TUX-001, TUX-011). A target under one is inert
      // for that state (not `reach`, not `covered`). Any other overlay still counts as `covered`.
      // Exempt only a target OUTSIDE the covering layer: an item hidden inside its own menu is a real defect.
      else if (hit.closest && hit.closest('.top-menu-panel.open, .menu-dropdown.open, #mobile-pane-backdrop.visible') && !hit.closest('.top-menu-panel.open, .menu-dropdown.open, #mobile-pane-backdrop.visible').contains(el)) { hitState = 'popup-covered'; coveredBy = 'open menu'; }
      else { hitState = 'covered'; coveredBy = (hit.id ? `#${hit.id}` : hit.tagName.toLowerCase() + (hit.classList[0] ? '.' + hit.classList[0] : '')); }
    }
    // Orchestrator decision 2026-10-12 (a), narrowed 2026-10-13 to the phone sheet (body.phone-menu-open): a control PARTLY covered by an open menu panel is not reachable while the menu
    // is open (the menu dismisses on an outside tap), the same as a control covered at its centre. Menu panels only: the
    // drawer backdrop sits behind its own drawer, so it stays a centre-point test.
    if (onscreen && (hitState === 'ok' || hitState === 'ok-ancestor')) {
      // Q14 applies to the phone menu sheet only (it swallows the outside tap). On iPad and touch-wide a tap on the uncovered
      // part of a part-covered control activates it, so it stays reachable at its probed size (orchestrator review 2026-10-13).
      for (const m of (document.body.classList.contains('phone-menu-open') ? openMenus : [])) {
        if (m.contains(el)) continue;
        const mr = m.getBoundingClientRect();
        if (mr.left < c.x2 && mr.right > c.x1 && mr.top < c.y2 && mr.bottom > c.y1) { hitState = 'popup-covered'; coveredBy = 'open menu (part)'; break; }
      }
    }
    const reach = hitState === 'ok' || hitState === 'ok-ancestor';
    // Hit dimension. EVERY reachable target is probed (a rect >= 44 can still be partly
    // occluded). Cost is bounded by stopAt 44 and the 9-sample fast path in hitAreaInPage. Unreachable targets
    // keep the rect (they are counted by `covered`, not by the size metrics).
    let pw = +r.width.toFixed(1);
    let ph = +r.height.toFixed(1);
    let probed = false;
    if (hitState === 'ok') {
      const a = helpers.hitAreaInPage(el, { probe: 2, radius: 24, stopAt: 44, cx, cy });
      pw = a.w; ph = a.h; probed = true;
    }
    // Orchestrator decision 2026-10-12 (b): a row cut by its OWN scroll container (overflow auto/scroll) is measured at its
    // full size on the cut axis. Its probed size would otherwise depend on the scroll position, not on the CSS.
    if (probed) {
      const cut = scrollCut(el, r);
      if (cut.y && ph < 49) ph = Math.max(ph, Math.min(49, Math.round(r.height)));
      if (cut.x && pw < 49) pw = Math.max(pw, Math.min(49, Math.round(r.width)));
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
    const safeIssues = SIDES.filter((s) => inBand[s] && !safeProtected(el, s));
    let allow = false;
    for (const s of allowSel) { try { if (el.matches(s)) { allow = true; break; } } catch (_) { /* bad selector */ } }
    items.push({
      el, sel: cssPath(el), label: label(el), tag, type, role: el.getAttribute('role'), region: region(el),
      x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      onscreen, clipped, hitState, coveredBy, reach, probed, pw, ph, allow,
      hig44: pw >= 44 && ph >= 44,
      min24: pw >= 24 && ph >= 24,
      textEntry: isTextEntry, fontSize: fs, iosZoom: isTextEntry && fs < 16,
      safeBands: SIDES.filter((s) => inBand[s]), safeUnprotected: safeIssues,
    });
  }

  // Nearest neighbour gap among on-screen, reachable targets. WCAG 2.5.8 uses the PROBED min24.
  const live = items.filter((i) => i.onscreen && i.reach);
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

  // Canvas fitness: 48x48 cell grid over the spec viewport.
  const canvas = document.getElementById('main-canvas');
  let canvasPct = 0; let canvasBoxPct = 0;
  if (canvas) {
    const cr = canvas.getBoundingClientRect();
    const ix = Math.max(0, Math.min(cr.right, vw) - Math.max(cr.left, 0));
    const iy = Math.max(0, Math.min(cr.bottom, vh) - Math.max(cr.top, 0));
    canvasBoxPct = +(100 * ix * iy / (vw * vh)).toFixed(1);
    canvasPct = helpers.canvasShareInPage({ W: vw, H: vh, selector: '#main-canvas', cells: 48 });
  }

  // Overflow. Denominator is the project constant (spec W x H), never innerWidth/clientWidth.
  // Chromium grows innerWidth on a mobile UA (innerWidthExcess); WebKit keeps innerWidth and
  // grows scrollWidth (scrollWidthExcess). Both count as overflow.
  const de = document.documentElement;
  const scrollWidthExcess = Math.max(de.scrollWidth, document.body.scrollWidth) - vw;
  const innerWidthExcess = window.innerWidth - vw;
  const hOverflow = Math.max(0, Math.max(de.scrollWidth, document.body.scrollWidth, window.innerWidth) - vw);
  const vOverflow = Math.max(0, Math.max(de.scrollHeight, document.body.scrollHeight, window.innerHeight) - vh);
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
    if (r.right <= 1 || r.left >= vw - 1 || r.bottom <= 1 || r.top >= vh - 1) return; // parked off-screen
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

  // Docked panes: a side pane counts as docked when it is wider than a rail, on-screen, and not
  // a fixed/absolute overlay (an overlay does not take canvas width).
  let dockedPanes = 0;
  for (const id of ['left-pane', 'right-pane']) {
    const p = document.getElementById(id);
    if (!p || !visible(p)) continue;
    const r = p.getBoundingClientRect();
    const pos = getComputedStyle(p).position;
    if (r.width > 60 && r.right > 0 && r.left < vw && pos !== 'fixed' && pos !== 'absolute') dockedPanes += 1;
  }

  const bodyCs = getComputedStyle(document.body);
  const scale = window.app && window.app.renderer ? window.app.renderer.scale : null;
  return {
    vw, vh, layoutViewport, dpr: window.devicePixelRatio,
    layout: ['mobile-layout', 'phone-layout', 'auto-collapsed'].filter((c) => document.body.classList.contains(c)),
    coarse: matchMedia('(pointer: coarse)').matches, hover: matchMedia('(hover: hover)').matches,
    bodyOverscroll: bodyCs.overscrollBehaviorY, htmlOverscroll: getComputedStyle(de).overscrollBehaviorY,
    canvasTouchAction: canvas ? getComputedStyle(canvas).touchAction : null,
    canvasPct, canvasBoxPct, hOverflow, vOverflow, innerWidthExcess, scrollWidthExcess, overflowers, overlays, scrollers,
    ghost, ghostSel, stranded, strandedSel, parkedTargets: parked, allowCounts, dockedPanes, scale, scaleOk: typeof scale === 'number' && scale > 0,
    safeSelectors: Object.fromEntries(Object.entries(safeSel).map(([k, v]) => [k, v.length])),
    safeVars: Object.fromEntries(Object.entries(safeVars).map(([k, v]) => [k, Array.from(new Set(v))])),
    probed: true,
    caught: (window.__auditErrors || []).slice(0, 5),
    caughtCount: (window.__auditErrors || []).length,
    items,
  };
}

// Canvas handle hit radii (probe the renderer's own hit-test functions). Self-contained.
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

// Run the page-side functions from Node. The expressions inline the helper sources so the
// functions stay self-contained when Playwright serialises them.
const measureExpr = () => `(cfg) => (${measureInPage.toString()})(cfg, { hitAreaInPage: ${hitAreaInPage.toString()}, canvasShareInPage: ${canvasShareInPage.toString()} })`;

// Playwright does not call a function given as a string, so evaluate the source in-page and
// invoke it. (The app ships no CSP.) Arguments may include ElementHandles.
const evalSource = (page, src, arg) => page.evaluate(({ src, arg }) => (new Function(`return (${src})`))()(arg), { src, arg });

async function measurePage(page, cfg) {
  return evalSource(page, measureExpr(), cfg);
}
async function probeHit(page, handle, opts) {
  return page.evaluate(({ src, el, opts }) => (new Function(`return (${src})`))()(el, opts), { src: hitAreaInPage.toString(), el: handle, opts });
}
async function probeCanvasShare(page, args) {
  return evalSource(page, canvasShareInPage.toString(), args);
}

// ---------------------------------------------------------------------------
// 2. NODE SECTION
// ---------------------------------------------------------------------------

// Safe-area insets the real device reports under viewport-fit=cover, keyed by device.
// (Chromium cannot emulate env(safe-area-inset-*): it resolves to 0, so geometry is measured
// against these bands and the CSSOM scan checks whether a rule pads for the side.)
// The -c devices run in browser chrome: the chrome owns top/bottom, side insets remain.
const SAFE_BANDS = {
  iPadP: { top: 24, bottom: 20, left: 0, right: 0 },
  iPadL: { top: 24, bottom: 20, left: 0, right: 0 },
  iPhP: { top: 59, bottom: 34, left: 0, right: 0 },
  iPhL: { top: 0, bottom: 21, left: 59, right: 59 },
  'iPhP-c': { top: 0, bottom: 0, left: 0, right: 0 },
  'iPhL-c': { top: 0, bottom: 0, left: 59, right: 59 },
  coarseWide: { top: 0, bottom: 0, left: 0, right: 0 },
};

const THRESHOLDS = { hig: 44, wcag: 24, crowdGap: 8, iosZoomFont: 16 };

// Metric table. dir 'lower' | 'higher' | 'bool'. tol = ratchet tolerance (absolute).
// finalMax: final-mode ceiling for lower metrics. finalStates: where final mode gates it
// (null = every state).
const METRICS = [
  { id: 'hOverflow', dir: 'lower', tol: 0, finalMax: 0, finalStates: null },
  { id: 'vOverflow', dir: 'lower', tol: 0, finalMax: 0, finalStates: null },
  { id: 'innerWidthExcess', dir: 'lower', tol: 0, finalMax: 0, finalStates: null },
  { id: 'under44', dir: 'lower', tol: 0, finalMax: 0, finalStates: null },
  { id: 'under24', dir: 'lower', tol: 0, finalMax: 0, finalStates: null },
  { id: 'wcag258Fail', dir: 'lower', tol: 0, finalMax: 0, finalStates: null },
  { id: 'iosZoom', dir: 'lower', tol: 0, finalMax: 0, finalStates: null },
  { id: 'covered', dir: 'lower', tol: 0, finalMax: 0, finalStates: ['default'] },
  { id: 'safeUnprotected', dir: 'lower', tol: 0, finalMax: 0, finalStates: null },
  { id: 'ghost', dir: 'lower', tol: 0, finalMax: 0, finalStates: null },
  { id: 'stranded', dir: 'lower', tol: 0, finalMax: 0, finalStates: null },
  { id: 'pageErrors', dir: 'lower', tol: 0, finalMax: 0, finalStates: null },
  { id: 'reachable', dir: 'higher', tol: 0 },
  { id: 'canvasPct', dir: 'higher', tol: 1.0 },
  { id: 'scaleOk', dir: 'bool' },
];
const METRIC_IDS = METRICS.map((m) => m.id);
// -c (browser chrome) projects only serve section 1.5's chrome-variants row.
const CHROME_METRICS = ['canvasPct', 'hOverflow', 'innerWidthExcess'];

// Final-mode canvas map (requirements section 1.5). iPadL is keyed by docked pane count.
const CANVAS_STATES_FINAL = ['default', 'left-pane-open', 'right-pane-layers', 'right-pane-pens'];
function finalCanvasMin(device, state, dockedPanes) {
  if (device === 'iPadP') return state === 'default' ? 70 : null;
  if (device === 'iPadL') {
    if (!CANVAS_STATES_FINAL.includes(state)) return null;
    return dockedPanes >= 2 ? 45 : dockedPanes === 1 ? 60 : 75;
  }
  if (device === 'iPhP' || device === 'iPhL') return state === 'default' ? 60 : null;
  if (device === 'iPhP-c' || device === 'iPhL-c') return state === 'default' ? 50 : null;
  return null;
}

// Per-state metric record from the raw measurement.
// rec: measurePage() result plus { pageErrors: [...] | number }.
function summarizeState(rec) {
  const items = rec.items || [];
  const reach = items.filter((i) => i.onscreen && i.reach !== false && (i.hitState === 'ok' || i.hitState === 'ok-ancestor'));
  const n = (a) => a.length;
  const pageErrors = (Array.isArray(rec.pageErrors) ? (rec.pageErrorCount ?? rec.pageErrors.length) : (rec.pageErrors || 0)) + (rec.caughtCount || 0);
  return {
    hOverflow: rec.hOverflow || 0,
    vOverflow: rec.vOverflow || 0,
    innerWidthExcess: Math.max(0, rec.innerWidthExcess || 0),
    under44: n(reach.filter((i) => !i.hig44 && !i.allow)),
    under24: n(reach.filter((i) => !i.min24)),
    wcag258Fail: n(reach.filter((i) => i.wcag258 === false)),
    iosZoom: n(reach.filter((i) => i.iosZoom)),
    covered: n(items.filter((i) => i.onscreen && i.hitState === 'covered')),
    // An allowlisted target (Jay 2026-10-12: the drawer backdrop only dismisses) is exempt from safe-area protection.
    safeUnprotected: n(items.filter((i) => i.onscreen && !i.allow && i.safeUnprotected && i.safeUnprotected.length)),
    ghost: rec.ghost || 0,
    stranded: rec.stranded || 0,
    reachable: n(reach),
    pageErrors,
    canvasPct: rec.canvasPct || 0,
    scaleOk: !!rec.scaleOk,
  };
}

// ResizeObserver loop notifications are benign browser reports (WebKit raises them as page
// errors, a count that flaps with frame timing). They are not app exceptions: not counted.
const BENIGN_PAGE_ERROR = /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/;
const isBenignPageError = (msg) => BENIGN_PAGE_ERROR.test(String(msg));

const onscreenCount = (rec) => (rec.items || []).filter((i) => i.onscreen).length;

// Pure comparator. baseline/measured are metric records. Returns { worse, better } message parts.
// metricIds limits the comparison (chrome variants).
function compareCell(baseline, measured, metrics, metricIds) {
  const worse = [];
  const better = [];
  (metrics || METRICS).forEach((m) => {
    if (metricIds && !metricIds.includes(m.id)) return;
    const b = baseline ? baseline[m.id] : undefined;
    const g = measured[m.id];
    if (b === undefined) { worse.push({ metric: m.id, base: b, got: g, kind: 'missing' }); return; }
    if (m.dir === 'bool') {
      if (b === true && g === false) worse.push({ metric: m.id, base: b, got: g, kind: 'worse' });
      else if (b === false && g === true) better.push({ metric: m.id, base: b, got: g });
      return;
    }
    const tol = m.tol || 0;
    if (m.dir === 'lower') {
      if (g > b + tol) worse.push({ metric: m.id, base: b, got: g, kind: 'worse' });
      else if (g < b - tol) better.push({ metric: m.id, base: b, got: g });
    } else {
      if (g < b - tol) worse.push({ metric: m.id, base: b, got: g, kind: 'worse' });
      else if (g > b + tol) better.push({ metric: m.id, base: b, got: g });
    }
  });
  return { worse, better };
}

function formatCompare(cellId, cmp) {
  const msgs = [];
  cmp.worse.forEach((w) => {
    if (w.kind === 'missing') msgs.push(`${cellId}|${w.metric} has no baseline value; run TOUCH_BASELINE=update`);
    else msgs.push(`${cellId}|${w.metric} ${METRICS.find((m) => m.id === w.metric).dir === 'higher' ? 'fell' : 'rose'}: baseline ${w.base}, got ${w.got}`);
  });
  cmp.better.forEach((b) => msgs.push(`ratchet down: ${cellId}|${b.metric} ${b.base} -> ${b.got}; run TOUCH_BASELINE=update`));
  return msgs;
}

// Final mode: compare to the target values instead of the baseline.
// ctx: { device, state, dockedPanes, chrome }
function compareFinal(measured, ctx) {
  const msgs = [];
  const ids = ctx.chrome ? CHROME_METRICS : METRIC_IDS;
  METRICS.forEach((m) => {
    if (!ids.includes(m.id)) return;
    const g = measured[m.id];
    if (m.dir === 'lower') {
      if (m.finalStates && !m.finalStates.includes(ctx.state)) return;
      if (g > m.finalMax) msgs.push(`final: ${m.id} ${g} > ${m.finalMax}`);
    } else if (m.dir === 'bool') {
      if (!g) msgs.push(`final: ${m.id} false`);
    } else if (m.id === 'canvasPct') {
      const min = finalCanvasMin(ctx.device, ctx.state, ctx.dockedPanes);
      if (min !== null && g < min) msgs.push(`final: canvasPct ${g} < ${min} (device ${ctx.device}, docked ${ctx.dockedPanes})`);
    }
  });
  return msgs;
}

// Update-mode merge: per metric take the BETTER of existing and measured (never worsen).
// `any` = true writes the measured values as-is (TOUCH_BASELINE=update-any).
function mergeCell(existing, measured, metricIds, any) {
  const out = {};
  METRICS.forEach((m) => {
    if (metricIds && !metricIds.includes(m.id)) return;
    const g = measured[m.id];
    const b = existing ? existing[m.id] : undefined;
    if (any || b === undefined) { out[m.id] = g; return; }
    if (m.dir === 'bool') out[m.id] = b || g;
    else if (m.dir === 'lower') out[m.id] = Math.min(b, g);
    else out[m.id] = Math.max(b, g);
  });
  return out;
}

const sortKeys = (o) => Object.keys(o).sort();
const cellJson = (cell) => `{${METRIC_IDS.filter((k) => k in cell).map((k) => `${JSON.stringify(k)}:${JSON.stringify(cell[k])}`).join(',')}}`;

// Stable serializer: sorted keys, ONE LINE per project|state cell (merge conflicts stay local).
function serializeBaseline(base) {
  const lines = ['{'];
  const top = [];
  if (base._measuredAt !== undefined) top.push(`  "_measuredAt": ${JSON.stringify(base._measuredAt)}`);
  sortKeys(base).filter((k) => k !== '_measuredAt').forEach((platform) => {
    const projects = sortKeys(base[platform]);
    const pl = [`  ${JSON.stringify(platform)}: {`];
    const pr = projects.map((proj) => {
      const states = sortKeys(base[platform][proj]);
      const rows = states.map((s) => `    ${JSON.stringify(`${proj}|${s}`)}: ${cellJson(base[platform][proj][s])}`);
      return rows.join(',\n');
    });
    pl.push(pr.join(',\n'));
    pl.push('  }');
    top.push(pl.join('\n'));
  });
  lines.push(top.join(',\n'));
  lines.push('}');
  return lines.join('\n') + '\n';
}

// The serialized file stores keys as "project|state" per platform. Parsed form is
// { _measuredAt, <platform>: { <project>: { <state>: cell } } }.
function parseBaseline(text) {
  const raw = JSON.parse(text || '{}');
  const out = {};
  if (raw._measuredAt !== undefined) out._measuredAt = raw._measuredAt;
  Object.keys(raw).filter((k) => k !== '_measuredAt').forEach((platform) => {
    out[platform] = {};
    Object.keys(raw[platform]).forEach((key) => {
      const i = key.indexOf('|');
      const proj = key.slice(0, i);
      const st = key.slice(i + 1);
      (out[platform][proj] = out[platform][proj] || {})[st] = raw[platform][key];
    });
  });
  return out;
}

function readBaseline(file) {
  try { return parseBaseline(fs.readFileSync(file, 'utf8')); } catch (_) { return {}; }
}

const sleepSync = (ms) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };

// Run fn while holding a lock directory next to `file` (cross-process: workers:2 may write at once).
function withLock(file, fn) {
  const lock = `${file}.lock`;
  const t0 = Date.now();
  for (;;) {
    try { fs.mkdirSync(lock); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (Date.now() - t0 > 10000) { try { fs.rmdirSync(lock); } catch (_) { /* stale */ } }
      sleepSync(25);
    }
  }
  try { return fn(); } finally { try { fs.rmdirSync(lock); } catch (_) { /* gone */ } }
}

const writeAtomic = (file, text) => {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
};

// Merge one cell into the baseline file. Atomic: lock, fresh read, temp file, rename.
function updateBaselineCell(file, platform, project, state, measured, { metricIds, any, measuredAt } = {}) {
  withLock(file, () => {
    const base = readBaseline(file);
    const cell = ((base[platform] || {})[project] || {})[state];
    ((base[platform] = base[platform] || {})[project] = base[platform][project] || {})[state] = mergeCell(cell, measured, metricIds, any);
    if (measuredAt) base._measuredAt = measuredAt;
    writeAtomic(file, serializeBaseline(base));
  });
}

// Merge `value` under `key` into a JSON object file (measured-values artifact).
function updateJsonKey(file, key, value) {
  withLock(file, () => {
    let obj = {};
    try { obj = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { /* new file */ }
    obj[key] = value;
    writeAtomic(file, JSON.stringify(obj, null, 1) + '\n');
  });
}

// Unique-target summary per viewport (dedupe by selector across states). Feeds the CLI's
// target-audit.json (shape read by target-audit-summarize.js).
function summarizeRun(states) {
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

// Boot helper shared by the spec and the CLI. Waits for the app, then for fonts, asserts the
// font check, dismisses the first-run tour. Throws "fonts not loaded ..." on a font failure.
async function bootApp(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => window.app && window.app.renderer && window.app.ui, null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  const fontOk = await page.evaluate(() => document.fonts.check('12px "Space Grotesk"'));
  if (!fontOk) throw new Error('fonts not loaded (network?) - target counts are not comparable');
  await page.evaluate(() => { const t = document.getElementById('tutorial-popover'); if (t && t.offsetParent) t.querySelector('[data-action="close"], .tutorial-close, button')?.click(); });
  await waitLayoutSettled(page);
}

// Wait until no CSS animation/transition is running and two frames have passed.
async function waitLayoutSettled(page, timeout = 8000) {
  await page.waitForFunction(() => new Promise((res) => {
    const anims = document.getAnimations ? document.getAnimations().filter((a) => a.playState === 'running').length : 0;
    if (anims) return res(false);
    requestAnimationFrame(() => requestAnimationFrame(() => res(true)));
  }), null, { timeout, polling: 100 });
}

// Wait until the geometry of every interactive element is unchanged for 4 consecutive samples
// (120 ms apart). waitLayoutSettled only sees CSS animations; JS-driven layout (a modal sizing
// itself, lazily rendered lists) can still be moving. Throws on timeout: a state that never
// settles is not comparable.
async function waitGeometryStable(page, timeout = 8000) {
  await page.waitForFunction(() => {
    const sel = 'button,a[href],input,select,textarea,summary,[role],[tabindex],[onclick],canvas';
    const sig = Array.from(document.querySelectorAll(sel)).map((e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`; }).join('|') + `#${document.scrollingElement ? document.scrollingElement.scrollHeight : 0}`;
    const st = window.__geomStable = window.__geomStable || { sig: null, n: 0, t: 0 };
    const now = performance.now();
    if (now - st.t < 100) return false;
    st.t = now;
    if (st.sig === sig) st.n += 1; else { st.sig = sig; st.n = 0; }
    return st.n >= 4;
  }, null, { timeout, polling: 50 });
  await page.evaluate(() => { window.__geomStable = null; });
}

module.exports = {
  // page section
  measureInPage, hitAreaInPage, canvasShareInPage, probeHandles, measurePage, probeHit, probeCanvasShare,
  // node section
  METRICS, METRIC_IDS, CHROME_METRICS, SAFE_BANDS, THRESHOLDS,
  summarizeState, isBenignPageError, onscreenCount, compareCell, formatCompare, compareFinal, mergeCell, finalCanvasMin,
  serializeBaseline, parseBaseline, readBaseline, updateBaselineCell, updateJsonKey, withLock, summarizeRun,
  bootApp, waitLayoutSettled, waitGeometryStable,
};
