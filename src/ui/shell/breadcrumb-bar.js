/**
 * Vectura Studio — Isolation breadcrumb bar (Illustrator Tools Parity,
 * Phase 2 Lane I: ISO-1 / ISO-2).
 *
 * Renders, WHILE group / morph-child isolation is active, a slim breadcrumb
 * strip across the top of the canvas viewport:
 *   - ISO-1: a back-arrow button (exits one isolation level) followed by the
 *     ancestry chain (`Document › Group › Inner`). Each crumb is clickable —
 *     the root crumb exits isolation entirely, an ancestor group crumb jumps
 *     to (isolates) that level. The active (deepest) crumb is inert. Exiting
 *     isolation removes the bar. The existing Escape / double-click-outside
 *     exit paths in renderer.js are UNCHANGED — the back-arrow and clickable
 *     crumbs are additional affordances.
 *   - ISO-2: a thin accent line along the canvas top edge (blue, via the
 *     `--iso-edge-color` skin token), visible whenever isolation is active.
 *
 * Self-contained IIFE that SELF-MOUNTS via JS (no index.html edit by this
 * lane — the phase integrator adds the <script> tag). It creates its own DOM
 * container inside `#viewport-container` and observes isolation state without
 * touching renderer.js: the renderer exposes no enter/exit event, so a
 * lightweight requestAnimationFrame ticker (gated to document visibility,
 * DOM writes only on a diffed signature) reads `renderer.groupEditMode`. If a
 * future `vectura:isolation-changed` document CustomEvent is added by the
 * renderer owner, this module also listens for it for immediate refresh (see
 * the interface request in the lane report).
 *
 * All copy lives in `src/config/breadcrumb.js` (`Vectura.BREADCRUMB`).
 *
 * Public API (window.Vectura.UI.BreadcrumbBar):
 *   mount(app)   — attach to the given app (or window.app); idempotent.
 *   sync()       — force a synchronous read of isolation state + DOM update.
 *   getElement() — the breadcrumb bar element (or null before mount).
 *   destroy()    — teardown (removes DOM, cancels the ticker). For tests.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const cfg = () => Vectura.BREADCRUMB || {};

  const state = {
    app: null,
    mounted: false,
    started: false,
    raf: 0,
    sig: null,
    els: { root: null, edge: null, bar: null, back: null, trail: null },
  };

  const doc = () => G.document || null;
  const getApp = () => state.app || G.app || null;
  const getRenderer = () => {
    const app = getApp();
    return (app && app.renderer) || null;
  };
  const getEngine = () => {
    const app = getApp();
    return (app && app.engine) || (getRenderer() && getRenderer().engine) || null;
  };

  // ── DOM construction ──────────────────────────────────────────────────
  const findViewport = () => {
    const d = doc();
    if (!d) return null;
    const vp = d.getElementById('viewport-container');
    if (vp) return vp;
    const canvas = d.getElementById('main-canvas');
    return (canvas && canvas.parentElement) || null;
  };

  const backArrowSvg = (d) => {
    const svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('iso-bc-back-svg');
    const p = d.createElementNS('http://www.w3.org/2000/svg', 'path');
    // Left-pointing chevron.
    p.setAttribute('d', 'M10 3.5 L5.5 8 L10 12.5');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.6');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(p);
    return svg;
  };

  const ensureDom = () => {
    const d = doc();
    if (!d) return false;
    const vp = findViewport();
    if (!vp) return false;

    // Recreate if never built or detached from the live tree.
    if (!state.els.bar || !state.els.bar.isConnected) {
      const c = cfg();

      // ISO-2: top-edge accent indicator.
      const edge = d.createElement('div');
      edge.className = 'iso-edge-indicator';
      edge.setAttribute('aria-hidden', 'true');

      // ISO-1: breadcrumb bar.
      const bar = d.createElement('nav');
      bar.className = 'iso-breadcrumb';
      bar.setAttribute('aria-label', c.ariaNav || 'Isolation breadcrumb');

      const back = d.createElement('button');
      back.type = 'button';
      back.className = 'iso-bc-back';
      back.setAttribute('aria-label', c.ariaBack || 'Exit isolation level');
      back.appendChild(backArrowSvg(d));

      const trail = d.createElement('ol');
      trail.className = 'iso-bc-trail';

      bar.appendChild(back);
      bar.appendChild(trail);

      // Event delegation lives on the bar (survives trail rebuilds).
      back.addEventListener('click', (e) => { e.preventDefault(); exitOneLevel(); });
      trail.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('.iso-bc-crumb') : null;
        if (!btn || btn.classList.contains('iso-bc-current')) return;
        e.preventDefault();
        onCrumbClick(btn);
      });

      vp.appendChild(edge);
      vp.appendChild(bar);
      state.els.root = vp;
      state.els.edge = edge;
      state.els.bar = bar;
      state.els.back = back;
      state.els.trail = trail;
    }
    return true;
  };

  // ── isolation state → ancestry trail ──────────────────────────────────
  // Returns { kind, groupId, crumbs:[{ type:'root'|'group', layerId?, label,
  // active }] } or null when not isolated / unresolvable.
  const readTrail = () => {
    const renderer = getRenderer();
    const engine = getEngine();
    if (!renderer || !engine) return null;
    const gem = renderer.groupEditMode;
    if (!gem || !gem.groupId) return null;
    const groupLayer = engine.layers.find((l) => l.id === gem.groupId);
    if (!groupLayer) return null;

    // Ancestors are parent-first; reverse to top→down, then append the active
    // group itself.
    const ancestors = (engine.getLayerAncestors(groupLayer) || []).slice().reverse();
    const chain = ancestors.concat([groupLayer]);
    const c = cfg();
    const crumbs = [{ type: 'root', label: c.rootLabel || 'Document', active: false }];
    chain.forEach((layer, i) => {
      crumbs.push({
        type: 'group',
        layerId: layer.id,
        label: (layer && layer.name) || c.unnamedGroup || 'Group',
        active: i === chain.length - 1,
      });
    });
    return { kind: gem.kind || 'group', groupId: gem.groupId, crumbs };
  };

  const signatureOf = (trail) => {
    if (!trail) return 'none';
    return trail.kind + '|' + trail.crumbs
      .map((c) => `${c.type}:${c.layerId || ''}:${c.label}:${c.active ? 1 : 0}`)
      .join('>');
  };

  // ── trail rendering ───────────────────────────────────────────────────
  const renderTrail = (trail) => {
    const d = doc();
    const ol = state.els.trail;
    if (!d || !ol) return;
    const c = cfg();
    ol.textContent = '';
    trail.crumbs.forEach((crumb, i) => {
      if (i > 0) {
        const sep = d.createElement('li');
        sep.className = 'iso-bc-sep';
        sep.setAttribute('aria-hidden', 'true');
        sep.textContent = c.separator || '›';
        ol.appendChild(sep);
      }
      const li = d.createElement('li');
      li.className = 'iso-bc-item';
      const btn = d.createElement('button');
      btn.type = 'button';
      btn.className = 'iso-bc-crumb'
        + (crumb.type === 'root' ? ' iso-bc-root' : '')
        + (crumb.active ? ' iso-bc-current' : '');
      btn.textContent = crumb.label;
      if (crumb.type === 'group' && crumb.layerId) btn.dataset.layerId = crumb.layerId;
      if (crumb.type === 'root') btn.dataset.root = 'true';
      if (crumb.active) {
        btn.setAttribute('aria-current', 'true');
        btn.setAttribute('aria-label', `${crumb.label} — ${c.ariaCurrentSuffix || 'current isolation level'}`);
        btn.disabled = true;
      }
      li.appendChild(btn);
      ol.appendChild(li);
    });
  };

  // ── click actions (call renderer public APIs only) ────────────────────
  const isolateGroup = (groupLayer) => {
    const renderer = getRenderer();
    const engine = getEngine();
    if (!renderer || !engine || !groupLayer) return;
    // Morph containers consume their children — don't try to plain-isolate one.
    if (groupLayer.modifier && groupLayer.modifier.type === 'morph') {
      renderer.exitGroupEditMode();
      return;
    }
    const children = (engine.getLayerChildren(groupLayer.id) || []).filter((child) => {
      if (!child || child.visible === false) return false;
      if (renderer.isLayerLocked && renderer.isLayerLocked(child.id)) return false;
      return true;
    });
    if (!children.length) { renderer.exitGroupEditMode(); return; }
    // enterGroupEditMode(child) sets groupEditMode.groupId = child.parentId,
    // i.e. isolates `groupLayer`.
    renderer.enterGroupEditMode(children[0]);
  };

  const onCrumbClick = (btn) => {
    const renderer = getRenderer();
    const engine = getEngine();
    if (!renderer || !engine) return;
    if (btn.dataset.root === 'true') {
      renderer.exitGroupEditMode();
      return;
    }
    const layerId = btn.dataset.layerId;
    const groupLayer = layerId ? engine.layers.find((l) => l.id === layerId) : null;
    if (groupLayer) isolateGroup(groupLayer);
  };

  // Back-arrow: exit one level. Vectura's isolation state is single-level
  // (renderer.groupEditMode is a scalar, not a stack), so "one level up" from
  // the active group is: isolate its immediate group parent if it has one,
  // else exit isolation entirely.
  const exitOneLevel = () => {
    const renderer = getRenderer();
    const engine = getEngine();
    if (!renderer || !engine || !renderer.groupEditMode) return;
    const gem = renderer.groupEditMode;
    if (gem.kind === 'morph') { renderer.exitGroupEditMode(); return; }
    const groupLayer = engine.layers.find((l) => l.id === gem.groupId);
    const parent = groupLayer ? (engine.getLayerAncestors(groupLayer)[0] || null) : null;
    if (parent && parent.isGroup && (!parent.modifier || parent.modifier.type !== 'morph')) {
      isolateGroup(parent);
    } else {
      renderer.exitGroupEditMode();
    }
  };

  // ── sync pass (diffed) ────────────────────────────────────────────────
  const sync = () => {
    if (!ensureDom()) return;
    const trail = readTrail();
    const sig = signatureOf(trail);
    const active = Boolean(trail);
    // Visibility toggles are cheap and idempotent — always reconcile so an
    // externally forced classList change can't wedge the bar shown/hidden.
    state.els.bar.classList.toggle('is-visible', active);
    state.els.bar.setAttribute('aria-hidden', active ? 'false' : 'true');
    state.els.edge.classList.toggle('is-visible', active);
    if (sig === state.sig) return;
    state.sig = sig;
    if (active) renderTrail(trail);
    else if (state.els.trail) state.els.trail.textContent = '';
  };

  // ── lifecycle ─────────────────────────────────────────────────────────
  const mount = (app) => {
    if (app) state.app = app;
    if (!doc()) return false;
    const ok = ensureDom();
    if (ok) { state.mounted = true; sync(); }
    return ok;
  };

  const tryAutoMount = () => {
    if (state.mounted) return true;
    const app = getApp();
    if (!app || !app.renderer || !doc()) return false;
    return mount(app);
  };

  const tick = () => {
    const d = doc();
    if (!d || d.visibilityState !== 'hidden') {
      if (state.mounted || tryAutoMount()) sync();
    }
    state.raf = typeof G.requestAnimationFrame === 'function'
      ? G.requestAnimationFrame(tick)
      : setTimeout(tick, 120);
  };

  const start = () => {
    if (state.started) return;
    state.started = true;
    tick();
  };

  const destroy = () => {
    if (state.raf) {
      if (typeof G.cancelAnimationFrame === 'function') G.cancelAnimationFrame(state.raf);
      else clearTimeout(state.raf);
      state.raf = 0;
    }
    state.started = false;
    state.mounted = false;
    state.sig = null;
    const { edge, bar } = state.els;
    if (edge && edge.parentNode) edge.parentNode.removeChild(edge);
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    state.els = { root: null, edge: null, bar: null, back: null, trail: null };
    state.app = null;
  };

  // Immediate refresh hook if the renderer owner ever emits it (interface
  // request — see lane report). Harmless if never fired.
  if (doc() && typeof doc().addEventListener === 'function') {
    doc().addEventListener('vectura:isolation-changed', sync);
  }

  UI.BreadcrumbBar = {
    mount,
    sync,
    getElement: () => state.els.bar || null,
    destroy,
  };

  start();
})();
