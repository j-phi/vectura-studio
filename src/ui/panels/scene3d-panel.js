/* ============================================================================
 * Vectura Studio — 3D Scene panel (Phase 1)
 * ----------------------------------------------------------------------------
 * Bespoke tabbed Scene / Style / Output panel for `scene3d` layers. Replaces
 * the generic control list via the early-return hook in
 * src/ui/panels/algo-config-panel.js (same escape hatch as the Text panel).
 *
 * ── INTEGRATION CONTRACT ───────────────────────────────────────────────────
 *   window.Vectura.UI.Scene3DPanel = { build(ui, layer, container) }
 *   Param-write commit pattern (one undo step per gesture):
 *     ui.app.pushHistory(); mutate layer.params; ui.storeLayerParams(layer);
 *     ui.app.regen(); — fired ONCE per gesture (slider onCommit / click).
 *
 * Selection (CONTRACT D): tree clicks call renderer.setSceneSelection() when
 * the API exists and listen for the window 'vectura:scene-selection' event;
 * absent the API the panel keeps a panel-local selection.
 *
 * Style editing (CONTRACT C): the Style tab resolves the effective style for
 * the current scope via Vectura.Scene3D.StyleCascade and commits via
 * setStyle/clearStyle on layer.params.styleTable.
 *
 * The More… shelf flyout follows the toolbar sub-tool pattern (session-only
 * last-pick memory + icon swap; Decision 3) — the memory lives at module
 * scope so it survives panel rebuilds but never a reload.
 *
 * Every bespoke class is prefixed `vs3-` and styled by the components.css
 * "VECTURA SCENE PANEL" block.
 * ========================================================================== */
(function () {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  Vectura.UI = Vectura.UI || {};

  // ── Primitive catalog ─────────────────────────────────────────────────────
  // Curated shelf + More… flyout entries. Defaults are the CONTRACT A
  // per-primitive params bags (box/sphere fixed by contract; the rest are the
  // panel's Phase 1 curation — 1A's builders read the same keys).
  const svg = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

  const PRIMITIVES = {
    box: {
      label: 'Box',
      icon: svg('<path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="M4 7l8 4 8-4M12 11v10"/>'),
      defaults: () => ({ sx: 40, sy: 40, sz: 40 }),
    },
    // Curved primitives author the keys 1A's buildPrimitiveMesh actually reads
    // (sphere: radius + detail; the rest: sx/sy/sz + detail). `detail` is the
    // tessellation resolution — high enough that a fresh shape reads as itself,
    // and adjustable per-object via the inspector Fidelity slider.
    sphere: {
      label: 'Sphere',
      icon: svg('<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="9" ry="3.5"/>'),
      defaults: () => ({ radius: 25, detail: 28 }),
    },
    cylinder: {
      label: 'Cylinder',
      icon: svg('<ellipse cx="12" cy="5" rx="7" ry="2.6"/><path d="M5 5v14M19 5v14"/><ellipse cx="12" cy="19" rx="7" ry="2.6"/>'),
      defaults: () => ({ sx: 20, sy: 22, sz: 20, detail: 24 }),
    },
    torus: {
      label: 'Torus',
      icon: svg('<ellipse cx="12" cy="12" rx="9" ry="5.5"/><ellipse cx="12" cy="12" rx="3.6" ry="1.8"/>'),
      defaults: () => ({ sx: 34, sy: 9, sz: 9, detail: 24 }),
    },
    cone: {
      label: 'Cone',
      icon: svg('<path d="M12 3 5 19M12 3l7 16"/><ellipse cx="12" cy="19" rx="7" ry="2.6"/>'),
      defaults: () => ({ sx: 20, sy: 22, sz: 20, detail: 24 }),
    },
    plane: {
      label: 'Plane',
      icon: svg('<path d="M7 6h14l-4 12H3z"/>'),
      defaults: () => ({ sx: 60, sy: 60 }),
    },
    superellipsoid: {
      label: 'Superellipsoid',
      icon: svg('<rect x="4" y="4" width="16" height="16" rx="6"/>'),
      defaults: () => ({ sx: 26, sy: 26, sz: 26, detail: 24 }),
    },
    torusKnot: {
      label: 'Torus Knot',
      icon: svg('<path d="M8.5 5.5c5-2.5 10 1.5 10 6 0 5.5-6.5 8.5-11 6.5-4-1.8-4.5-7.5-1-9.5 3.7-2.1 8 .5 8 4 0 3-3 5-6 4"/>'),
      defaults: () => ({ sx: 30, sy: 6, sz: 6, detail: 28 }),
    },
    capsule: {
      label: 'Capsule',
      icon: svg('<path d="M8 4h8a0 0 0 0 1 0 0v16a0 0 0 0 1 0 0H8a0 0 0 0 1 0 0V4a0 0 0 0 1 0 0z" opacity="0"/><path d="M16 4a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z" transform="rotate(90 12 12)"/>'),
      defaults: () => ({ sx: 14, sy: 16, sz: 14, detail: 22 }),
    },
  };
  // Primitives whose surface tessellation the Fidelity slider controls (box and
  // plane are flat-faced — subdivision would only add coplanar interior edges).
  const FIDELITY_PRIMS = new Set(['sphere', 'cylinder', 'torus', 'cone', 'superellipsoid', 'torusKnot', 'capsule']);
  const SHELF_PRIMS = ['box', 'sphere', 'cylinder', 'torus', 'cone', 'plane'];
  const MORE_PRIMS = ['superellipsoid', 'torusKnot', 'capsule'];

  const ICON_IMPORT = svg('<path d="M12 3v10M8.5 9.5 12 13l3.5-3.5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>');
  const ICON_LIGHT = svg('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 1 3.6 10.8c-.7.6-1.1 1.3-1.1 2.2h-5c0-.9-.4-1.6-1.1-2.2A6 6 0 0 1 12 3z"/>');
  const ICON_MORE = svg('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>');

  const MAPPERS = [
    { value: 'none', label: 'None' },
    { value: 'hatch', label: 'Hatch' },
    { value: 'wireframe', label: 'Wire' },
  ];
  const HATCH_DEFAULTS = { fillAngle: 45, fillDensity: 50 };

  // Session-only last-pick memory for the More… flyout (Decision 3). Module
  // scope: survives panel rebuilds/layer switches, resets on reload.
  let moreLastPick = null;

  let CURRENT = null;
  // Set per build; tears the active panel down if its root has been detached
  // (host rebuilt the pane for a non-scene layer without calling destroy).
  let teardownIfDetached = null;

  // Canonical deep clone (Redundancy-1 PR 4). Resolved lazily so the panel
  // survives any script-order shuffle around src/core/utils.js.
  const clone = (obj) => Vectura.Utils.clone(obj);
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  // ── build ─────────────────────────────────────────────────────────────────
  const build = (ui, layer, container) => {
    if (CURRENT) { try { CURRENT.destroy(); } catch (_) { /* */ } CURRENT = null; }

    const UI = Vectura.UI;
    const SC = Vectura.Scene3D && Vectura.Scene3D.StyleCascade;
    const params = layer.params || (layer.params = {});
    // Structural normalization only (idempotent, no history): the panel reads
    // the LAYER's params, never ALGO_DEFAULTS — 1A's defaults may be absent.
    if (!Array.isArray(params.objects)) params.objects = [];

    const ensureStyleTable = () => {
      if (!params.styleTable || typeof params.styleTable !== 'object') {
        params.styleTable = { scene: { penId: null, mapper: 'none', params: {} }, byObject: {}, byFace: {} };
      }
      return params.styleTable;
    };

    // Host commit pattern — ONE undo step per gesture.
    const pushHist = () => { try { ui.app && ui.app.pushHistory && ui.app.pushHistory(); } catch (_) { /* */ } };
    const store = () => { try { ui.storeLayerParams && ui.storeLayerParams(layer); } catch (_) { /* */ } };
    const regen = () => { try { ui.app && ui.app.regen && ui.app.regen(); } catch (_) { /* */ } };
    const commit = (mutate) => { pushHist(); mutate(); store(); regen(); };

    // Panel-local selection (mirrors renderer.sceneSelection when CONTRACT D
    // exists; standalone otherwise).
    let sel = { mode: 'none', objectId: null, faceKey: null };
    const renderer = ui.app && ui.app.renderer;
    const rendererSel = renderer && typeof renderer.getSceneSelection === 'function'
      ? renderer.getSceneSelection() : null;
    if (rendererSel && rendererSel.layerId === layer.id) {
      if (rendererSel.mode === 'face' && rendererSel.faceKeys && rendererSel.faceKeys.length) {
        const fk = rendererSel.faceKeys[0];
        sel = { mode: 'face', objectId: fk.split('/')[0], faceKey: fk };
      } else if (rendererSel.objectIds && rendererSel.objectIds.length) {
        sel = { mode: 'object', objectId: rendererSel.objectIds[0], faceKey: null };
      }
    }

    const getObject = (id) => params.objects.find((o) => o && o.id === id) || null;

    // Component instances per re-renderable area, destroyed on re-render.
    let inspectorComps = [];
    let styleComps = [];
    const destroyComps = (list) => { list.forEach((c) => { try { c.destroy && c.destroy(); } catch (_) { /* */ } }); list.length = 0; };

    // ── DOM skeleton ────────────────────────────────────────────────────────
    const root = document.createElement('div');
    root.className = 'vs3-panel';
    container.appendChild(root);

    const pages = {};
    const makePage = (name) => {
      const el = document.createElement('div');
      el.className = 'vs3-page';
      el.dataset.page = name;
      pages[name] = el;
      return el;
    };

    const tabs = UI.Tabs(root, {
      tabs: [
        { value: 'scene', label: 'Scene' },
        { value: 'style', label: 'Style' },
        { value: 'output', label: 'Output' },
      ],
      active: 'scene',
      ariaLabel: '3D Scene panel tabs',
      onChange: (value) => {
        Object.keys(pages).forEach((k) => pages[k].classList.toggle('active', k === value));
        if (value === 'style') renderStyle();
      },
    });

    root.appendChild(makePage('scene'));
    root.appendChild(makePage('style'));
    root.appendChild(makePage('output'));
    pages.scene.classList.add('active');

    // ── Scene tab · Shelf ───────────────────────────────────────────────────
    let treeHost = null;
    let inspectorHost = null;
    let styleHost = null;
    let moreMenuOpen = false;
    let moreBtn = null;
    let moreMenu = null;
    let moreWrapEl = null;

    const nextOrdinal = () => {
      let max = 0;
      params.objects.forEach((o) => {
        const m = /^obj-(\d+)$/.exec(o && o.id ? o.id : '');
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
      return max + 1;
    };

    const addPrimitive = (prim) => {
      const def = PRIMITIVES[prim];
      if (!def) return;
      const n = nextOrdinal();
      const obj = {
        id: `obj-${n}`,
        name: `${def.label} ${n}`,
        primitive: prim,
        params: def.defaults(),
        transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
        visibility: 'solid',
      };
      commit(() => { params.objects.push(obj); });
      selectObject(obj.id);
      renderTree();
      renderInspector();
    };

    // The flyout is portaled to <body> and positioned with position:fixed, so
    // it escapes the Add Objects Section body's overflow:hidden clip (which
    // otherwise hides it behind the Scene Tree section). It flips above the
    // button when there is no room below.
    const positionMoreMenu = () => {
      if (!moreMenu || !moreBtn || !moreMenuOpen) return;
      const rect = moreBtn.getBoundingClientRect();
      moreMenu.style.visibility = 'hidden';
      moreMenu.style.display = 'block';
      const mh = moreMenu.offsetHeight || 0;
      const mw = moreMenu.offsetWidth || 0;
      const belowRoom = window.innerHeight - rect.bottom;
      const up = belowRoom < mh + 8 && rect.top > belowRoom;
      const top = up ? Math.max(4, rect.top - mh - 4) : rect.bottom + 4;
      let left = rect.left;
      if (left + mw > window.innerWidth - 4) left = Math.max(4, window.innerWidth - mw - 4);
      moreMenu.style.top = `${Math.round(top)}px`;
      moreMenu.style.left = `${Math.round(left)}px`;
      moreMenu.style.visibility = 'visible';
    };

    const setMoreMenuOpen = (open) => {
      moreMenuOpen = !!open;
      if (moreMenu) {
        if (moreMenuOpen) {
          if (moreMenu.parentNode !== document.body) document.body.appendChild(moreMenu);
          moreMenu.classList.add('open');
          positionMoreMenu();
        } else {
          moreMenu.classList.remove('open');
          moreMenu.style.display = '';
        }
      }
      if (moreBtn) moreBtn.setAttribute('aria-expanded', String(moreMenuOpen));
    };

    const syncMoreButton = () => {
      if (!moreBtn) return;
      const iconEl = moreBtn.querySelector('.vs3-shelf-icon');
      const labelEl = moreBtn.querySelector('.vs3-shelf-label');
      const def = moreLastPick ? PRIMITIVES[moreLastPick] : null;
      if (iconEl) iconEl.innerHTML = def ? def.icon : ICON_MORE;
      if (labelEl) labelEl.textContent = def ? def.label : 'More…';
      moreBtn.dataset.lastPick = moreLastPick || '';
      moreBtn.title = def ? `Add ${def.label} (long list: use the arrow)` : 'More primitives';
    };

    const onDocPointerDown = (e) => {
      if (teardownIfDetached && teardownIfDetached()) return;
      if (!moreMenuOpen) return;
      // The menu is portaled to <body>; the button/caret live in moreWrap.
      if (moreMenu && moreMenu.contains(e.target)) return;
      if (moreWrapEl && moreWrapEl.contains(e.target)) return;
      setMoreMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    const onWindowChange = () => {
      if (teardownIfDetached && teardownIfDetached()) return;
      if (moreMenuOpen) positionMoreMenu();
    };
    window.addEventListener('resize', onWindowChange);
    window.addEventListener('scroll', onWindowChange, true);

    const buildShelfButton = (host, { icon, label, className, title, disabled, onClick, dataset }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `vs3-shelf-btn${className ? ` ${className}` : ''}`;
      if (title) btn.title = title;
      if (disabled) { btn.disabled = true; btn.setAttribute('aria-disabled', 'true'); }
      const iconEl = document.createElement('span');
      iconEl.className = 'vs3-shelf-icon';
      iconEl.innerHTML = icon;
      const labelEl = document.createElement('span');
      labelEl.className = 'vs3-shelf-label';
      labelEl.textContent = label;
      btn.appendChild(iconEl);
      btn.appendChild(labelEl);
      if (dataset) Object.keys(dataset).forEach((k) => { btn.dataset[k] = dataset[k]; });
      if (onClick) btn.addEventListener('click', onClick);
      host.appendChild(btn);
      return btn;
    };

    const buildShelf = (body) => {
      const shelf = document.createElement('div');
      shelf.className = 'vs3-shelf';
      body.appendChild(shelf);

      SHELF_PRIMS.forEach((prim) => {
        buildShelfButton(shelf, {
          icon: PRIMITIVES[prim].icon,
          label: PRIMITIVES[prim].label,
          title: `Add ${PRIMITIVES[prim].label.toLowerCase()}`,
          dataset: { prim },
          onClick: () => addPrimitive(prim),
        });
      });

      buildShelfButton(shelf, {
        icon: ICON_IMPORT, label: 'Import', className: 'is-stub', disabled: true,
        title: 'STL import arrives in Phase 4', dataset: { stub: 'import' },
      });
      buildShelfButton(shelf, {
        icon: ICON_LIGHT, label: 'Light', className: 'is-stub', disabled: true,
        title: 'Lights arrive in Phase 2', dataset: { stub: 'light' },
      });

      // More… flyout (toolbar sub-tool pattern: session last-pick + icon swap).
      const moreWrap = document.createElement('div');
      moreWrap.className = 'vs3-more';
      moreWrapEl = moreWrap;
      shelf.appendChild(moreWrap);

      moreBtn = buildShelfButton(moreWrap, {
        icon: ICON_MORE, label: 'More…', className: 'vs3-more-btn',
        onClick: () => {
          if (moreLastPick) addPrimitive(moreLastPick);
          else setMoreMenuOpen(!moreMenuOpen);
        },
      });
      moreBtn.setAttribute('aria-haspopup', 'menu');
      moreBtn.setAttribute('aria-expanded', 'false');

      const caret = document.createElement('button');
      caret.type = 'button';
      caret.className = 'vs3-more-caret';
      caret.setAttribute('aria-label', 'More primitives');
      caret.textContent = '▾';
      caret.addEventListener('click', () => setMoreMenuOpen(!moreMenuOpen));
      moreWrap.appendChild(caret);

      moreMenu = document.createElement('div');
      moreMenu.className = 'vs3-more-menu';
      moreMenu.setAttribute('role', 'menu');
      MORE_PRIMS.forEach((prim) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'vs3-more-item';
        item.setAttribute('role', 'menuitem');
        item.dataset.prim = prim;
        item.innerHTML = `<span class="vs3-shelf-icon">${PRIMITIVES[prim].icon}</span><span>${PRIMITIVES[prim].label}</span>`;
        item.addEventListener('click', () => {
          moreLastPick = prim;
          syncMoreButton();
          setMoreMenuOpen(false);
          addPrimitive(prim);
        });
        moreMenu.appendChild(item);
      });
      moreWrap.appendChild(moreMenu);
      syncMoreButton();
    };

    // ── Scene tab · Tree ────────────────────────────────────────────────────
    const cycleVisibility = (obj) => {
      const next = obj.visibility === 'xray' ? 'solid' : 'xray';
      commit(() => { obj.visibility = next; });
      renderTree();
      renderInspector();
    };

    const deleteObject = (obj) => {
      commit(() => {
        const idx = params.objects.indexOf(obj);
        if (idx >= 0) params.objects.splice(idx, 1);
        const table = params.styleTable;
        if (table) {
          if (table.byObject) delete table.byObject[obj.id];
          if (table.byFace) {
            Object.keys(table.byFace).forEach((k) => {
              if (k.indexOf(`${obj.id}/`) === 0) delete table.byFace[k];
            });
          }
        }
      });
      if (sel.objectId === obj.id) clearSelection();
      renderTree();
      renderInspector();
    };

    const startRename = (nameEl, obj) => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'vs3-rename';
      input.value = obj.name || '';
      input.setAttribute('aria-label', 'Object name');
      nameEl.textContent = '';
      nameEl.appendChild(input);
      input.focus();
      if (input.select) input.select();
      let done = false;
      const finish = (apply) => {
        if (done) return;
        done = true;
        const next = input.value.trim();
        if (apply && next && next !== obj.name) {
          commit(() => { obj.name = next; });
        }
        renderTree();
        renderInspector();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        e.stopPropagation();
      });
      input.addEventListener('blur', () => finish(true));
      input.addEventListener('click', (e) => e.stopPropagation());
    };

    const renderTree = () => {
      if (!treeHost) return;
      treeHost.textContent = '';
      if (!params.objects.length) {
        const empty = document.createElement('p');
        empty.className = 'vs3-empty';
        empty.textContent = 'No objects yet — add one from the shelf above.';
        treeHost.appendChild(empty);
        return;
      }
      params.objects.forEach((obj) => {
        const row = document.createElement('div');
        row.className = 'vs3-tree-row';
        row.dataset.objectId = obj.id;
        if (sel.objectId === obj.id) row.classList.add('selected');

        const name = document.createElement('span');
        name.className = 'vs3-tree-name';
        name.textContent = obj.name || obj.id;
        name.title = 'Double-click to rename';
        name.addEventListener('dblclick', (e) => { e.stopPropagation(); startRename(name, obj); });
        row.appendChild(name);

        const vis = document.createElement('button');
        vis.type = 'button';
        vis.className = 'vs3-tree-vis';
        vis.dataset.visibility = obj.visibility || 'solid';
        vis.title = obj.visibility === 'xray' ? 'X-ray (click for solid)' : 'Solid (click for x-ray)';
        vis.setAttribute('aria-label', `Visibility: ${obj.visibility || 'solid'}`);
        vis.textContent = obj.visibility === 'xray' ? '◌' : '●';
        vis.addEventListener('click', (e) => { e.stopPropagation(); cycleVisibility(obj); });
        row.appendChild(vis);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'vs3-tree-del';
        del.title = 'Delete object';
        del.setAttribute('aria-label', `Delete ${obj.name || obj.id}`);
        del.textContent = '✕';
        del.addEventListener('click', (e) => { e.stopPropagation(); deleteObject(obj); });
        row.appendChild(del);

        row.addEventListener('click', () => selectObject(obj.id));
        treeHost.appendChild(row);
      });
    };

    // ── Selection (CONTRACT D consumer; guarded) ────────────────────────────
    const syncSelectionUI = () => {
      if (treeHost) {
        Array.from(treeHost.querySelectorAll('.vs3-tree-row')).forEach((row) => {
          row.classList.toggle('selected', row.dataset.objectId === sel.objectId);
        });
      }
      renderInspector();
      if (tabs.getActive() === 'style') renderStyle();
    };

    const pushSelectionToRenderer = (selection) => {
      const r = ui.app && ui.app.renderer;
      if (r && typeof r.setSceneSelection === 'function') {
        try { r.setSceneSelection(selection); return true; } catch (_) { /* */ }
      }
      return false;
    };

    const selectObject = (id) => {
      sel = { mode: 'object', objectId: id, faceKey: null };
      pushSelectionToRenderer({ layerId: layer.id, mode: 'object', objectIds: [id], faceKeys: [], edgeKeys: [] });
      syncSelectionUI();
    };

    const clearSelection = () => {
      sel = { mode: 'none', objectId: null, faceKey: null };
      pushSelectionToRenderer(null);
      syncSelectionUI();
    };

    const onSceneSelection = (e) => {
      if (teardownIfDetached && teardownIfDetached()) return;
      const d = e && e.detail;
      if (!d || d.layerId !== layer.id) {
        if (sel.mode !== 'none') { sel = { mode: 'none', objectId: null, faceKey: null }; syncSelectionUI(); }
        return;
      }
      if (d.mode === 'face' && d.faceKeys && d.faceKeys.length) {
        const fk = d.faceKeys[0];
        sel = { mode: 'face', objectId: fk.split('/')[0], faceKey: fk };
      } else if (d.objectIds && d.objectIds.length) {
        sel = { mode: 'object', objectId: d.objectIds[0], faceKey: null };
      } else {
        sel = { mode: 'none', objectId: null, faceKey: null };
      }
      syncSelectionUI();
    };
    window.addEventListener('vectura:scene-selection', onSceneSelection);

    // ── Scene tab · Inspector ───────────────────────────────────────────────
    const sliderRow = (host, comps, label, props) => {
      const row = document.createElement('div');
      row.className = 'vs3-row';
      const lbl = document.createElement('label');
      lbl.className = 'vs3-lbl';
      lbl.textContent = label;
      row.appendChild(lbl);
      const ctlHost = document.createElement('div');
      ctlHost.className = 'vs3-ctl';
      row.appendChild(ctlHost);
      host.appendChild(row);
      comps.push(UI.Slider(ctlHost, props));
      return row;
    };

    const renderInspector = () => {
      if (!inspectorHost) return;
      destroyComps(inspectorComps);
      inspectorHost.textContent = '';
      const obj = sel.objectId ? getObject(sel.objectId) : null;
      if (!obj) {
        const empty = document.createElement('p');
        empty.className = 'vs3-empty';
        empty.textContent = 'Select an object in the scene tree to edit it.';
        inspectorHost.appendChild(empty);
        return;
      }
      if (!obj.transform || typeof obj.transform !== 'object') {
        obj.transform = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
      }
      const t = obj.transform;

      // Name
      const nameRow = document.createElement('div');
      nameRow.className = 'vs3-row';
      const nameLbl = document.createElement('label');
      nameLbl.className = 'vs3-lbl';
      nameLbl.textContent = 'Name';
      nameRow.appendChild(nameLbl);
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'vs3-name-input';
      nameInput.value = obj.name || '';
      nameInput.setAttribute('aria-label', 'Object name');
      nameInput.addEventListener('change', () => {
        const next = nameInput.value.trim();
        if (next && next !== obj.name) {
          commit(() => { obj.name = next; });
          renderTree();
        } else {
          nameInput.value = obj.name || '';
        }
      });
      nameRow.appendChild(nameInput);
      inspectorHost.appendChild(nameRow);

      const posProps = (axis) => ({
        value: Number.isFinite(t[axis]) ? t[axis] : 0,
        min: -200, max: 200, step: 0.5,
        ariaLabel: `Position ${axis.toUpperCase()} (mm)`,
        onCommit: (v) => commit(() => { obj.transform[axis] = v; }),
      });
      sliderRow(inspectorHost, inspectorComps, 'X (mm)', posProps('x'));
      sliderRow(inspectorHost, inspectorComps, 'Y (mm)', posProps('y'));
      sliderRow(inspectorHost, inspectorComps, 'Z (mm)', posProps('z'));

      const rotProps = (axis, label) => ({
        value: Number.isFinite(t[axis]) ? t[axis] : 0,
        min: -180, max: 180, step: 1,
        ariaLabel: `${label} (degrees)`,
        onCommit: (v) => commit(() => { obj.transform[axis] = v; }),
      });
      sliderRow(inspectorHost, inspectorComps, 'Yaw', rotProps('yaw', 'Yaw'));
      sliderRow(inspectorHost, inspectorComps, 'Pitch', rotProps('pitch', 'Pitch'));
      sliderRow(inspectorHost, inspectorComps, 'Roll', rotProps('roll', 'Roll'));

      sliderRow(inspectorHost, inspectorComps, 'Scale', {
        value: Number.isFinite(t.scale) ? t.scale : 1,
        min: 0.1, max: 5, step: 0.05,
        ariaLabel: 'Uniform scale',
        onCommit: (v) => commit(() => { obj.transform.scale = v; }),
      });

      // Fidelity — surface tessellation for curved primitives. Higher = smoother
      // silhouette and more surface detail, at the cost of more plotted lines.
      if (FIDELITY_PRIMS.has(obj.primitive)) {
        if (!obj.params || typeof obj.params !== 'object') obj.params = {};
        const curDetail = Number.isFinite(obj.params.detail) ? obj.params.detail : 24;
        sliderRow(inspectorHost, inspectorComps, 'Fidelity', {
          value: curDetail,
          min: 6, max: 48, step: 1,
          ariaLabel: 'Surface fidelity (tessellation detail)',
          onCommit: (v) => commit(() => { obj.params.detail = Math.round(v); }),
        });
      }

      // Visibility
      const visRow = document.createElement('div');
      visRow.className = 'vs3-row';
      const visLbl = document.createElement('label');
      visLbl.className = 'vs3-lbl';
      visLbl.textContent = 'Visibility';
      visRow.appendChild(visLbl);
      const visHost = document.createElement('div');
      visHost.className = 'vs3-ctl';
      visRow.appendChild(visHost);
      inspectorHost.appendChild(visRow);
      inspectorComps.push(UI.SegCtrl(visHost, {
        options: [{ value: 'solid', label: 'Solid' }, { value: 'xray', label: 'X-ray' }],
        value: obj.visibility === 'xray' ? 'xray' : 'solid',
        ariaLabel: 'Object visibility',
        onChange: (v) => {
          commit(() => { obj.visibility = v; });
          renderTree();
        },
      }));
    };

    // ── Style tab (CONTRACT C editor) ───────────────────────────────────────
    const currentStyleScope = () => {
      if (sel.mode === 'face' && sel.faceKey) {
        const slash = sel.faceKey.indexOf('/');
        return {
          scope: 'face',
          key: sel.faceKey,
          target: { objectId: sel.faceKey.slice(0, slash), faceId: sel.faceKey.slice(slash + 1) },
        };
      }
      if (sel.objectId) {
        return { scope: 'object', key: sel.objectId, target: { objectId: sel.objectId } };
      }
      return { scope: 'scene', key: null, target: {} };
    };

    const scopeDisplayName = (scope) => {
      if (scope.scope === 'scene') return 'Scene';
      const obj = getObject(scope.target.objectId);
      const objName = obj ? (obj.name || obj.id) : scope.target.objectId;
      if (scope.scope === 'face') return `${objName} · ${scope.target.faceId}`;
      return objName;
    };

    const renderStyle = () => {
      if (!styleHost) return;
      destroyComps(styleComps);
      styleHost.textContent = '';

      if (!SC) {
        const warn = document.createElement('p');
        warn.className = 'vs3-empty';
        warn.textContent = 'Style cascade module not loaded.';
        styleHost.appendChild(warn);
        return;
      }

      const scope = currentStyleScope();
      const table = ensureStyleTable();
      const resolved = SC.resolve(table, scope.target);
      const setHere = resolved.provenance.scope === scope.scope;

      // Scope line
      const scopeLine = document.createElement('div');
      scopeLine.className = 'vs3-style-scope';
      scopeLine.textContent = `Editing: ${scopeDisplayName(scope)}`;
      styleHost.appendChild(scopeLine);

      // Provenance chip
      const chip = document.createElement('div');
      chip.className = 'vs3-prov-chip';
      chip.classList.toggle('is-inherited', !setHere);
      const chipText = document.createElement('span');
      chipText.className = 'vs3-prov-text';
      chipText.textContent = `Styled by: ${cap(resolved.provenance.scope)}`;
      chip.appendChild(chipText);
      if (setHere && scope.scope !== 'scene') {
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'vs3-prov-clear';
        clearBtn.title = 'Clear this override (inherit from broader scope)';
        clearBtn.setAttribute('aria-label', 'Clear style override');
        clearBtn.textContent = '✕';
        clearBtn.addEventListener('click', () => {
          commit(() => { SC.clearStyle(ensureStyleTable(), scope.scope, scope.key); });
          renderStyle();
        });
        chip.appendChild(clearBtn);
      }
      styleHost.appendChild(chip);

      // Whole-style commit at the CURRENT scope (CONTRACT C: no field merge —
      // every edit writes the full resolved style with the edited field).
      const commitStyle = (patch) => {
        const style = {
          penId: resolved.penId,
          mapper: resolved.mapper,
          params: clone(resolved.params || {}),
        };
        Object.keys(patch).forEach((k) => { style[k] = patch[k]; });
        commit(() => { SC.setStyle(ensureStyleTable(), scope.scope, scope.key, style); });
        renderStyle();
      };

      // Pen
      const penRow = document.createElement('div');
      penRow.className = 'vs3-row';
      const penLbl = document.createElement('label');
      penLbl.className = 'vs3-lbl';
      penLbl.textContent = 'Pen';
      penRow.appendChild(penLbl);
      const penHost = document.createElement('div');
      penHost.className = 'vs3-ctl';
      penRow.appendChild(penHost);
      styleHost.appendChild(penRow);
      const pens = (Vectura.SETTINGS && Array.isArray(Vectura.SETTINGS.pens)) ? Vectura.SETTINGS.pens : [];
      styleComps.push(UI.Select(penHost, {
        options: [{ value: '', label: 'Layer pen' }].concat(
          pens.map((p) => ({ value: p.id, label: p.name || p.id })),
        ),
        value: resolved.penId || '',
        ariaLabel: 'Style pen',
        onChange: (v) => commitStyle({ penId: v || null }),
      }));

      // Mapper
      const mapRow = document.createElement('div');
      mapRow.className = 'vs3-row';
      const mapLbl = document.createElement('label');
      mapLbl.className = 'vs3-lbl';
      mapLbl.textContent = 'Mapper';
      mapRow.appendChild(mapLbl);
      const mapHost = document.createElement('div');
      mapHost.className = 'vs3-ctl';
      mapRow.appendChild(mapHost);
      styleHost.appendChild(mapRow);
      styleComps.push(UI.SegCtrl(mapHost, {
        options: MAPPERS,
        value: resolved.mapper || 'none',
        ariaLabel: 'Style mapper',
        onChange: (v) => commitStyle({
          mapper: v,
          params: v === 'hatch'
            ? {
              fillAngle: Number.isFinite(resolved.params && resolved.params.fillAngle) ? resolved.params.fillAngle : HATCH_DEFAULTS.fillAngle,
              fillDensity: Number.isFinite(resolved.params && resolved.params.fillDensity) ? resolved.params.fillDensity : HATCH_DEFAULTS.fillDensity,
            }
            : {},
        }),
      }));

      // Hatch params
      if (resolved.mapper === 'hatch') {
        const angleRow = document.createElement('div');
        angleRow.className = 'vs3-row';
        const angleLbl = document.createElement('label');
        angleLbl.className = 'vs3-lbl';
        angleLbl.textContent = 'Angle';
        angleRow.appendChild(angleLbl);
        const angleHost = document.createElement('div');
        angleHost.className = 'vs3-ctl';
        angleRow.appendChild(angleHost);
        styleHost.appendChild(angleRow);
        const angleVal = Number.isFinite(resolved.params && resolved.params.fillAngle)
          ? resolved.params.fillAngle : HATCH_DEFAULTS.fillAngle;
        if (UI.AngleDial) {
          styleComps.push(UI.AngleDial(angleHost, {
            value: angleVal,
            ariaLabel: 'Hatch angle',
            defaultValue: HATCH_DEFAULTS.fillAngle,
            onCommit: (v) => commitStyle({ params: { ...clone(resolved.params || {}), fillAngle: v } }),
          }));
        } else {
          styleComps.push(UI.Slider(angleHost, {
            value: angleVal, min: 0, max: 360, step: 1,
            ariaLabel: 'Hatch angle',
            onCommit: (v) => commitStyle({ params: { ...clone(resolved.params || {}), fillAngle: v } }),
          }));
        }

        sliderRow(styleHost, styleComps, 'Density', {
          value: Number.isFinite(resolved.params && resolved.params.fillDensity)
            ? resolved.params.fillDensity : HATCH_DEFAULTS.fillDensity,
          min: 1, max: 100, step: 1,
          ariaLabel: 'Hatch density',
          onCommit: (v) => commitStyle({ params: { ...clone(resolved.params || {}), fillDensity: v } }),
        });
      }
    };

    // ── Sections ────────────────────────────────────────────────────────────
    const sections = [];
    sections.push(UI.Section(pages.scene, {
      title: 'Add Objects',
      children: (body) => buildShelf(body),
    }));
    sections.push(UI.Section(pages.scene, {
      title: 'Scene Tree',
      children: (body) => {
        treeHost = document.createElement('div');
        treeHost.className = 'vs3-tree';
        body.appendChild(treeHost);
      },
    }));
    sections.push(UI.Section(pages.scene, {
      title: 'Inspector',
      children: (body) => {
        inspectorHost = document.createElement('div');
        inspectorHost.className = 'vs3-inspector';
        body.appendChild(inspectorHost);
      },
    }));

    styleHost = document.createElement('div');
    styleHost.className = 'vs3-style';
    pages.style.appendChild(styleHost);

    const outMsg = document.createElement('p');
    outMsg.className = 'vs3-placeholder';
    outMsg.textContent = 'Plot stats arrive in a later phase';
    pages.output.appendChild(outMsg);

    const foot = document.createElement('div');
    foot.className = 'vs3-foot';
    foot.textContent = 'VECTURA STUDIO · SCENE';
    root.appendChild(foot);

    renderTree();
    renderInspector();
    renderStyle();

    let destroyed = false;
    const teardown = () => {
      if (destroyed) return;
      destroyed = true;
      window.removeEventListener('vectura:scene-selection', onSceneSelection);
      document.removeEventListener('pointerdown', onDocPointerDown);
      window.removeEventListener('resize', onWindowChange);
      window.removeEventListener('scroll', onWindowChange, true);
      // The flyout is portaled to <body> — remove it explicitly.
      if (moreMenu && moreMenu.parentNode) moreMenu.parentNode.removeChild(moreMenu);
      destroyComps(inspectorComps);
      destroyComps(styleComps);
      sections.forEach((s) => { try { s.destroy(); } catch (_) { /* */ } });
      try { tabs.destroy(); } catch (_) { /* */ }
      if (root.parentNode) root.parentNode.removeChild(root);
      if (CURRENT === CURRENT_SELF) CURRENT = null;
    };
    // Self-heal: when the left pane is rebuilt for a NON-scene layer, the host
    // empties the container without calling our destroy — so the global
    // listeners (and the portaled flyout) would leak. Any subsequent global
    // event tears us down once the panel root is detached from the document.
    teardownIfDetached = () => {
      if (!destroyed && root && !root.isConnected) { teardown(); return true; }
      return destroyed;
    };
    const CURRENT_SELF = { layerId: layer.id, destroy: teardown };
    CURRENT = CURRENT_SELF;
  };

  Vectura.UI.Scene3DPanel = { build };
})();
