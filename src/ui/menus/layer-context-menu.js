/*
 * Vectura Studio — Layer right-click context menu (Phase 3 closure).
 *
 * Composes `window.Vectura.UI.overlays.Menu` to add a per-row context menu
 * to the layer list (`#layer-list`). Items map to existing engine/UI
 * actions; no new engine surface is introduced.
 *
 * Public API:
 *   window.Vectura.UI.Menus.LayerContext.bind(deps)
 *     deps: { getEl }
 *   window.Vectura.UI.Menus.LayerContext.attach(uiInstance)
 *     Hooks the contextmenu event on #layer-list. Idempotent — safe to call
 *     after every renderLayers().
 *
 * The menu is owned by the module (singleton) and reused across opens.
 *
 * Items (only those applicable to the clicked layer are enabled):
 *   - Rename       → focus the existing inline name field
 *   - Duplicate    → engine.duplicateLayer(id)
 *   - Delete       → engine.removeLayer(id)
 *   - Toggle visibility → cascades visible flag (matches the eye-icon click)
 *   - Toggle lock  → adds/removes id from ui.layerLockedIds
 *   - Expand into group → ui.expandLayer(layer)  [for non-shape, non-group]
 *
 * Compile gate at tests/unit/menus/layer-context-compile.test.js.
 * Integration coverage at tests/integration/menus/layer-context.test.js.
 */
(() => {
  'use strict';
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = (G.Vectura = G.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});
  UI.Menus = UI.Menus || {};

  let DEPS = null;
  let _menu = null;
  let _attached = false;
  let _attachedListEl = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`LayerContextMenu.${name} invoked before bind(deps) — load order broken`);
    }
    return DEPS;
  };

  const _findLayer = (ui, id) => {
    if (!ui || !ui.app || !ui.app.engine) return null;
    const layers = ui.app.engine.layers || [];
    return layers.find((l) => l && l.id === id) || null;
  };

  // Scene-tree Increment C — is this layer a scene GROUP (the three container
  // invariants Increment B gates on)?
  const _isSceneGroup = (layer) =>
    !!(layer && layer.type === 'scene3d' && layer.isGroup && layer.containerRole === 'scene');

  // The shapes a scene group can add. Order + labels MIRROR the scene panel's
  // PRIMITIVES shelf (src/ui/panels/scene3d-panel.js: SHELF_PRIMS + MORE_PRIMS);
  // every value is a key of the engine's OBJECT3D_PRIMITIVE_DEFAULTS, which is
  // what addObjectToScene seeds the new object3d child's param bag from. `box`
  // and `solid` keep their original menu keys so existing callers/tests hold.
  const SCENE_ADD_SHAPES = [
    { prim: 'box', key: 'scene-add-object', label: 'Box' },
    { prim: 'sphere', label: 'Sphere' },
    { prim: 'cylinder', label: 'Cylinder' },
    { prim: 'torus', label: 'Torus' },
    { prim: 'cone', label: 'Cone' },
    { prim: 'plane', label: 'Plane' },
    // ellipsoid + pyramid have full creation defaults and inspector controls but
    // were absent here, so the layer menu could not add them — the ctxbar Shape
    // flyout and the panel shelf now list the same 12.
    { prim: 'ellipsoid', label: 'Ellipsoid' },
    { prim: 'superellipsoid', label: 'Superellipsoid' },
    { prim: 'torusKnot', label: 'Torus Knot' },
    { prim: 'capsule', label: 'Capsule' },
    { prim: 'pyramid', label: 'Pyramid' },
    { prim: 'solid', key: 'scene-add-solid', label: 'Polyhedron' },
  ];
  const _shapeKey = (entry) => entry.key || `scene-add-prim:${entry.prim}`;
  // Resolve a menu key back to the primitive addObjectToScene should build.
  const _primitiveForKey = (key) => {
    const hit = SCENE_ADD_SHAPES.find((s) => _shapeKey(s) === key);
    return hit ? hit.prim : null;
  };

  // The object3d leaves eligible to be fused into a boolean group: the current
  // multi-selection (or the clicked row) restricted to plain object3d layers
  // that share ONE scene-group parent (not already inside a boolean group —
  // Increment B collects direct object3d children only, no boolean nesting yet).
  const _booleanOperands = (ui, layer) => {
    const engine = ui && ui.app && ui.app.engine;
    if (!engine) return [];
    const sel = (ui.app.renderer && ui.app.renderer.selectedLayerIds) || new Set();
    let ids = Array.from(sel);
    if (layer && layer.id && !ids.includes(layer.id)) ids = [layer.id];
    const objs = ids
      .map((id) => engine.getLayerById && engine.getLayerById(id))
      .filter((l) => l && l.type === 'object3d');
    if (objs.length < 2) return [];
    const parentId = objs[0].parentId;
    if (!objs.every((o) => o.parentId === parentId)) return [];
    const parent = engine.getLayerById && engine.getLayerById(parentId);
    if (!_isSceneGroup(parent)) return []; // operands must sit loose under a scene
    return objs.map((o) => o.id);
  };

  // ── TUX-012 — shared row-action list ──────────────────────────────────────
  // ONE list feeds both the inline `.lvl-acts` / `.lvl-grp-acts` strips in
  // layers-panel.js (desktop) and the ⋯ menu (touch + right-click). Every run
  // body here is the body the inline strip used before the list existed.
  // `masked` rows (masked-v2 cards) never show the mask toggle, as before.
  const rowActions = (ui, layer, opts = {}) => {
    const out = [];
    if (!ui || !layer || !ui.app || !ui.app.engine) return out;
    const engine = ui.app.engine;
    const renderer = ui.app.renderer;
    const I = () => ui._LVL_I || {};
    const icon = (name, fallback) => () => {
      const set = I();
      const fn = set[name] || (fallback && set[fallback]);
      return typeof fn === 'function' ? fn.call(set) : '';
    };
    const add = (key, label, title, cls, iconFn, run) => out.push({ key, label, title, cls, icon: iconFn, run });
    const rerender = () => { ui.renderLayers(); ui.app.render(); };
    const select = (id) => { if (id) { renderer?.setSelection?.([id], id); engine.setActiveLayerId?.(id); } };
    const parent = layer.parentId ? engine.getLayerById?.(layer.parentId) : null;
    const masked = opts.masked != null
      ? !!opts.masked
      : !!(parent && parent.mask && parent.mask.enabled && parent.maskCapabilities && parent.maskCapabilities.canSource);

    if (layer.isGroup) {
      if (layer.groupType === 'scene' && typeof engine.addObjectToScene === 'function') {
        add('scene-add-object', 'Add box', 'Add box (right-click for more shapes)', 'lvl-add-object', icon('grpPlus'), () => {
          if (ui.app.pushHistory) ui.app.pushHistory();
          const oid = engine.addObjectToScene(layer.id);
          select(oid);
          rerender();
        });
        if (typeof engine.addLightToScene === 'function') {
          add('scene-add-light', 'Add light', 'Add light', 'lvl-add-light', icon('sceneLight3d', 'grpPlus'), () => {
            if (ui.app.pushHistory) ui.app.pushHistory();
            const lid = engine.addLightToScene(layer.id, 'directional');
            select(lid);
            rerender();
          });
        }
        if (typeof engine.addGroundToScene === 'function') {
          const hasGround = engine.getLayerDescendants?.(layer.id)?.some((l) => l && l.type === 'sceneGround3d');
          if (!hasGround) {
            add('scene-add-ground', 'Add ground', 'Add ground', 'lvl-add-ground', icon('sceneGround3d', 'grpPlus'), () => {
              if (ui.app.pushHistory) ui.app.pushHistory();
              const gid = engine.addGroundToScene(layer.id);
              select(gid);
              rerender();
            });
          }
        }
      }
      if (layer.groupType === 'modifier') {
        add('expand-modifier', 'Expand to folder', 'Expand to folder', '', icon('expand'), () => {
          if (ui.app.pushHistory) ui.app.pushHistory();
          engine.expandModifierLayer(layer.id);
          rerender();
        });
      }
      add('ungroup', 'Ungroup', 'Ungroup (⌘⇧G)', '', icon('ungroup'), () => {
        if (ui.app.pushHistory) ui.app.pushHistory();
        ui.unlockMirrorChildrenOnDelete?.(layer.id);
        const kids = (engine.layers || []).filter((l) => l.parentId === layer.id);
        kids.forEach((l) => { l.parentId = layer.parentId ?? null; });
        engine.removeLayer(layer.id);
        renderer.setSelection(kids.map((l) => l.id), kids[0]?.id);
        rerender();
      });
      add('duplicate', 'Duplicate', 'Duplicate group', '', icon('dup'), () => {
        if (ui.app.pushHistory) ui.app.pushHistory();
        engine.duplicateLayer(layer.id);
        rerender();
      });
      add('delete', 'Delete', 'Delete group', 'del', icon('trash'), () => {
        if (ui.app.pushHistory) ui.app.pushHistory();
        ui.unlockMirrorChildrenOnDelete?.(layer.id);
        engine.removeLayer(layer.id);
        rerender();
      });
      return out;
    }

    if (!masked && layer.maskCapabilities && layer.maskCapabilities.canSource) {
      const isSrc = !!(layer.mask && layer.mask.enabled);
      add('mask-toggle', isSrc ? 'Remove clipping mask' : 'Make clipping mask',
        isSrc ? 'Remove clipping mask (click to deactivate)' : 'Make clipping mask — clips layer below',
        'mask-btn' + (isSrc ? ' is-src' : ''),
        icon(isSrc ? 'maskSrcActive' : 'maskSrc'),
        () => {
          const allLayers = engine.layers || [];
          if (ui.app.pushHistory) ui.app.pushHistory();
          if (isSrc) {
            const kids = allLayers.filter((c) => c.parentId === layer.id);
            kids.forEach((c) => { c.parentId = layer.parentId ?? null; });
            layer.mask.enabled = false;
          } else {
            const sibs = allLayers.filter((s) => (s.parentId ?? null) === (layer.parentId ?? null));
            const idx = sibs.indexOf(layer);
            if (idx < sibs.length - 1) {
              ui.assignLayersToParent(layer.id, [sibs[idx + 1]], { captureHistory: false });
            }
            layer.mask.enabled = true;
          }
          engine.computeAllDisplayGeometry?.();
          ui.renderLayers();
          ui.app.render?.();
        });
      if (isSrc) {
        const isHidden = Boolean(layer.mask && layer.mask.hideLayer);
        add('mask-outline', isHidden ? 'Show mask layer outline' : 'Hide mask layer outline',
          isHidden ? 'Show mask layer outline' : 'Hide mask layer outline',
          'mask-outline-btn' + (isHidden ? ' is-hidden' : ''),
          icon(isHidden ? 'maskOutlineHide' : 'maskOutlineShow'),
          () => {
            ui.setLayerMaskHidden(layer, !isHidden, { captureHistory: true });
            ui.renderLayers();
            ui.app.render?.();
          });
      }
    }
    // The thin light/ground scene leaves have no sub-geometry to expand into a group.
    const isSceneChildLeaf = layer.type === 'sceneLight3d' || layer.type === 'sceneGround3d';
    if (layer.type !== 'shape' && !isSceneChildLeaf) {
      add('expand-into-group', 'Expand into group', 'Expand into group', '', icon('expand'), () => ui.expandLayer?.(layer));
    }
    if (layer.type === 'shape' && Array.isArray(layer.fills) && layer.fills.length > 0) {
      const n = layer.fills.length;
      add('expand-fill', 'Expand Fill', `Expand ${n} fill${n === 1 ? '' : 's'} into a group`, '', icon('expand'),
        () => ui._lvlExpandFill(layer));
    }
    if (layer.type === 'shape' && layer.sourceFillRecord && Array.isArray(layer.paths) && layer.paths.length > 0) {
      const n = layer.paths.length;
      add('explode-fill', 'Explode Fill into paths', `Explode fill into ${n} path${n === 1 ? '' : 's'}`, '', icon('expand'),
        () => ui._lvlExplodeFill(layer));
    }
    add('duplicate', 'Duplicate', 'Duplicate (⌘D)', '', icon('dup'), () => {
      if (ui.app.pushHistory) ui.app.pushHistory();
      engine.duplicateLayer(layer.id);
      rerender();
    });
    add('delete', 'Delete', 'Delete', 'del', icon('trash'), () => {
      if (ui.app.pushHistory) ui.app.pushHistory();
      ui.unlockMirrorChildrenOnDelete?.(layer.id);
      engine.removeLayer(layer.id);
      rerender();
    });
    return out;
  };

  const _itemsFor = (ui, layer) => {
    const items = [];
    // Scene-tree Increment C — scene / object actions lead the menu when the
    // clicked row is part of a 3D scene tree.
    if (_isSceneGroup(layer) && ui.app && ui.app.engine
      && typeof ui.app.engine.addObjectToScene === 'function') {
      // Every primitive the engine can seed, named. Previously this menu only
      // offered a generic "Add object" (always a BOX) plus "Add solid
      // (polyhedron)", so sphere / torus / cylinder / cone / plane and the three
      // exotics could not be added to a scene tree from anywhere in the UI.
      items.push({ category: 'Add shape' });
      SCENE_ADD_SHAPES.forEach((s) => items.push({ key: _shapeKey(s), label: s.label }));
      // Scene-tree Increment E — add lights (by type) + the ground (only when no
      // ground child exists yet) straight from the scene group's context menu.
      const engine = ui.app.engine;
      if (typeof engine.addLightToScene === 'function') {
        items.push({ category: 'Add light' });
        items.push({ key: 'scene-add-light', label: 'Sun (directional)' });
        items.push({ key: 'scene-add-light-point', label: 'Point' });
        items.push({ key: 'scene-add-light-spot', label: 'Spot' });
        items.push({ key: 'scene-add-light-area', label: 'Area' });
        items.push({ key: 'scene-add-light-ambient', label: 'Ambient' });
      }
      if (typeof engine.addGroundToScene === 'function') {
        const hasGround = typeof engine.getLayerDescendants === 'function'
          && engine.getLayerDescendants(layer.id).some((l) => l && l.type === 'sceneGround3d');
        if (!hasGround) {
          items.push({ separator: true });
          items.push({ key: 'scene-add-ground', label: 'Add ground' });
        }
      }
      items.push({ separator: true });
    }
    const operands = layer && layer.type === 'object3d' ? _booleanOperands(ui, layer) : [];
    if (operands.length >= 2 && ui.app && ui.app.engine
      && typeof ui.app.engine.createBooleanGroupFromSelection === 'function') {
      items.push({ key: 'scene-create-boolean', label: 'Create boolean group' });
      items.push({ separator: true });
    }
    items.push({ key: 'rename', label: 'Rename' });
    items.push({ key: 'duplicate', label: 'Duplicate', shortcut: '⌘D' });
    items.push({ key: 'delete', label: 'Delete', shortcut: 'Del' });
    items.push({ separator: true });
    items.push({
      key: 'toggle-visibility',
      label: layer && layer.visible === false ? 'Show layer' : 'Hide layer',
    });
    const locked = ui.layerLockedIds && ui.layerLockedIds.has && ui.layerLockedIds.has(layer.id);
    items.push({
      key: 'toggle-lock',
      label: locked ? 'Unlock' : 'Lock',
    });
    if (layer && layer.type && layer.type !== 'shape' && !layer.isGroup
      && layer.type !== 'sceneLight3d' && layer.type !== 'sceneGround3d') {
      items.push({ separator: true });
      items.push({ key: 'expand-into-group', label: 'Expand into group' });
    }
    // Convert-to-Scene (I1) — a standalone polyhedron/topoform layer can bake
    // into a 3D scene tree so the shared compositor lights/occludes/shadows it.
    if (layer && !layer.isGroup && (layer.type === 'polyhedron' || layer.type === 'topoform')
      && ui.app && ui.app.engine && typeof ui.app.engine.convertAlgoToScene === 'function') {
      items.push({ separator: true });
      items.push({ key: 'convert-to-scene', label: 'Convert to Scene' });
    }
    const hasFills = layer && !layer.isGroup && Array.isArray(layer.fills) && layer.fills.length > 0;
    if (hasFills) {
      items.push({ separator: true });
      items.push({ key: 'expand-fill', label: 'Expand Fill' });
    }
    const isBakedFill = layer && !layer.isGroup && layer.sourceFillRecord
      && Array.isArray(layer.paths) && layer.paths.length > 0;
    if (isBakedFill) {
      if (!hasFills) items.push({ separator: true });
      items.push({ key: 'explode-fill', label: 'Explode Fill into paths' });
    }
    // TUX-012 — every inline row action must be reachable from the menu. Append the
    // shared-list keys this menu does not already carry (mask-toggle, mask-outline,
    // ungroup, expand-modifier).
    const present = new Set(items.map((i) => i.key).filter(Boolean));
    const extra = rowActions(ui, layer).filter((a) => !present.has(a.key));
    if (extra.length) {
      items.push({ separator: true });
      extra.forEach((a) => items.push({ key: a.key, label: a.label }));
    }
    return items;
  };

  const _runAction = (ui, layer, key) => {
    if (!ui || !layer) return;
    const engine = ui.app && ui.app.engine;
    if (!engine) return;
    const addPrim = _primitiveForKey(key);
    if (addPrim) {
      if (typeof engine.addObjectToScene !== 'function') return;
      if (ui.app.pushHistory) ui.app.pushHistory();
      const oid = engine.addObjectToScene(layer.id, addPrim);
      if (oid) {
        ui.app.setSelection && ui.app.setSelection([oid], oid);
        engine.setActiveLayerId && engine.setActiveLayerId(oid);
      }
      ui.renderLayers && ui.renderLayers();
      ui.app.render && ui.app.render();
      return;
    }
    // Scene-tree Increment E — add a light / ground child to a scene group.
    if (key === 'scene-add-light' || key.indexOf('scene-add-light-') === 0) {
      if (typeof engine.addLightToScene !== 'function') return;
      const type = key === 'scene-add-light' ? 'directional' : key.slice('scene-add-light-'.length);
      if (ui.app.pushHistory) ui.app.pushHistory();
      const lid = engine.addLightToScene(layer.id, type);
      if (lid) {
        ui.app.setSelection && ui.app.setSelection([lid], lid);
        engine.setActiveLayerId && engine.setActiveLayerId(lid);
      }
      ui.renderLayers && ui.renderLayers();
      ui.app.render && ui.app.render();
      return;
    }
    if (key === 'scene-add-ground') {
      if (typeof engine.addGroundToScene !== 'function') return;
      if (ui.app.pushHistory) ui.app.pushHistory();
      const gid = engine.addGroundToScene(layer.id);
      if (gid) {
        ui.app.setSelection && ui.app.setSelection([gid], gid);
        engine.setActiveLayerId && engine.setActiveLayerId(gid);
      }
      ui.renderLayers && ui.renderLayers();
      ui.app.render && ui.app.render();
      return;
    }
    if (key === 'scene-create-boolean') {
      if (typeof engine.createBooleanGroupFromSelection !== 'function') return;
      const operands = _booleanOperands(ui, layer);
      if (operands.length < 2) return;
      if (ui.app.pushHistory) ui.app.pushHistory();
      const gid = engine.createBooleanGroupFromSelection(operands);
      if (gid) {
        ui.app.setSelection && ui.app.setSelection([gid], gid);
        engine.setActiveLayerId && engine.setActiveLayerId(gid);
      }
      ui.renderLayers && ui.renderLayers();
      ui.app.render && ui.app.render();
      return;
    }
    if (key === 'rename') {
      const card = document.querySelector(`[data-layer-id="${layer.id}"] .lvl-name, [data-lvl-id="${layer.id}"] .lvl-name`);
      if (card && typeof card.focus === 'function') {
        card.focus();
        if (typeof card.setSelectionRange === 'function') {
          try { card.setSelectionRange(0, (card.value || '').length); } catch (_) { /* noop */ }
        }
      }
      return;
    }
    if (key === 'duplicate') {
      if (ui.app.pushHistory) ui.app.pushHistory();
      engine.duplicateLayer(layer.id);
      ui.renderLayers && ui.renderLayers();
      ui.app.render && ui.app.render();
      return;
    }
    if (key === 'delete') {
      if (ui.app.pushHistory) ui.app.pushHistory();
      ui.unlockMirrorChildrenOnDelete?.(layer.id);
      engine.removeLayer(layer.id);
      ui.renderLayers && ui.renderLayers();
      ui.app.render && ui.app.render();
      return;
    }
    if (key === 'toggle-visibility') {
      if (ui.app.pushHistory) ui.app.pushHistory();
      const newVis = !layer.visible;
      const allLayers = engine.layers || [];
      const cascade = (l) => {
        l.visible = newVis;
        allLayers.filter((c) => c.parentId === l.id).forEach(cascade);
      };
      cascade(layer);
      engine.computeAllDisplayGeometry && engine.computeAllDisplayGeometry();
      ui.app.render && ui.app.render();
      ui.renderLayers && ui.renderLayers();
      return;
    }
    if (key === 'toggle-lock') {
      if (!ui.layerLockedIds) return;
      if (ui.layerLockedIds.has(layer.id)) ui.layerLockedIds.delete(layer.id);
      else ui.layerLockedIds.add(layer.id);
      ui.renderLayers && ui.renderLayers();
      return;
    }
    if (key === 'convert-to-scene') {
      if (typeof engine.convertAlgoToScene !== 'function') return;
      if (ui.app.pushHistory) ui.app.pushHistory();
      const result = engine.convertAlgoToScene(layer.id);
      if (!result || !result.ok) {
        // Surface the block (contours) / failure reason; leave the layer intact.
        const Toast = (typeof window !== 'undefined' ? window : globalThis)?.Vectura?.UI?.overlays?.Toast;
        const msg = (result && result.message)
          || (result && result.reason === 'unsupported' ? 'This layer type cannot be converted to a scene.' : null);
        if (Toast && msg) Toast.show({ message: msg, variant: 'warning' });
        return;
      }
      ui.app.setSelection && ui.app.setSelection([result.groupId], result.groupId);
      engine.setActiveLayerId && engine.setActiveLayerId(result.groupId);
      ui.renderLayers && ui.renderLayers();
      ui.app.render && ui.app.render();
      return;
    }
    if (key === 'expand-into-group') {
      if (typeof ui.expandLayer === 'function') ui.expandLayer(layer);
      ui.renderLayers && ui.renderLayers();
      ui.app.render && ui.app.render();
      return;
    }
    if (key === 'expand-fill') {
      const PBO = (typeof window !== 'undefined' ? window : globalThis)?.Vectura?.PaintBucketOps;
      if (!PBO?.expandFill) return;
      if (!Array.isArray(layer.fills) || !layer.fills.length) return;
      if (ui.app.pushHistory) ui.app.pushHistory();
      const result = PBO.expandFill(engine, layer);
      if (!result) return;
      ui.app.renderer?.commitActiveBatch?.();
      ui.app.setSelection?.([result.groupId], result.groupId);
      engine.setActiveLayerId?.(result.groupId);
      ui.app.paintBucketPanel?.updateExpandButton?.();
      ui.renderLayers && ui.renderLayers();
      ui.app.render && ui.app.render();
      return;
    }
    if (key === 'explode-fill') {
      const PBO = (typeof window !== 'undefined' ? window : globalThis)?.Vectura?.PaintBucketOps;
      if (!PBO?.explodeFillLayer) return;
      if (!Array.isArray(layer.paths) || !layer.paths.length) return;
      ui.app.renderer?.commitActiveBatch?.();
      if (ui.app.pushHistory) ui.app.pushHistory();
      const result = PBO.explodeFillLayer(engine, layer);
      if (!result) return;
      ui.app.setSelection?.([result.groupId], result.groupId);
      engine.setActiveLayerId?.(result.groupId);
      ui.renderLayers && ui.renderLayers();
      ui.app.render && ui.app.render();
      return;
    }
    // TUX-012 — keys that only exist in the shared row-action list.
    const act = rowActions(ui, layer).find((a) => a.key === key);
    if (act) act.run();
  };

  const _ensureMenu = () => {
    if (_menu) return _menu;
    if (!UI.overlays || !UI.overlays.Menu) {
      throw new Error('LayerContextMenu requires UI.overlays.Menu to be loaded first');
    }
    _menu = UI.overlays.Menu(document.body, { items: [], onSelect: () => {} });
    if (_menu && _menu.el && _menu.el.classList) _menu.el.classList.add('lvl-ctx-menu');
    return _menu;
  };

  // Position the singleton menu at an arbitrary {x, y} (ignoring anchor logic
  // that the primitive uses for buttons). We synthesize a 1×1 anchor.
  const _openAt = (ui, layer, x, y) => {
    const menu = _ensureMenu();
    const items = _itemsFor(ui, layer);
    menu.update({
      items,
      onSelect: (key) => _runAction(ui, layer, key),
    });
    // Synthesize a tiny zero-size element at (x, y) so the primitive's
    // viewport-aware positionAgainst() + clickOutside guard work cleanly.
    let anchor = document.getElementById('vectura-layer-ctx-anchor');
    if (!anchor) {
      anchor = document.createElement('div');
      anchor.id = 'vectura-layer-ctx-anchor';
      anchor.style.cssText = 'position:fixed;width:1px;height:1px;pointer-events:none;opacity:0;';
      document.body.appendChild(anchor);
    }
    anchor.style.top = `${y}px`;
    anchor.style.left = `${x}px`;
    if (menu.isOpen && menu.isOpen()) menu.close();
    menu.open(anchor);
  };

  // TUX-012 — open the row menu from a ⋯ button: anchored to the button rect.
  const openForLayer = (ui, layer, anchorEl) => {
    if (!ui || !layer) return;
    const r = anchorEl && anchorEl.getBoundingClientRect
      ? anchorEl.getBoundingClientRect()
      : { left: 0, right: 0, bottom: 0 };
    _openAt(ui, layer, r.left, r.bottom - 1);
  };

  const _onContextMenu = (ui) => (event) => {
    const card = event.target && event.target.closest && event.target.closest('[data-layer-id]');
    if (!card) return;
    const id = card.getAttribute('data-layer-id');
    if (!id) return;
    const layer = _findLayer(ui, id);
    if (!layer) return;
    event.preventDefault();
    _openAt(ui, layer, event.clientX, event.clientY);
  };

  const attach = (ui) => {
    requireDeps('attach');
    const list = document.getElementById('layer-list');
    if (!list) return;
    if (_attached && _attachedListEl === list) return;
    if (_attached && _attachedListEl && _attachedListEl !== list && _attachedListEl._vecturaCtxHandler) {
      _attachedListEl.removeEventListener('contextmenu', _attachedListEl._vecturaCtxHandler);
      _attachedListEl._vecturaCtxHandler = null;
    }
    const handler = _onContextMenu(ui);
    list.addEventListener('contextmenu', handler);
    list._vecturaCtxHandler = handler;
    _attached = true;
    _attachedListEl = list;
  };

  UI.Menus.LayerContext = {
    bind(deps) { DEPS = deps || {}; },
    attach,
    openForLayer,
    rowActions,
    // Test helpers (not for production code paths).
    _itemsFor,
    _runAction,
    _reset() {
      if (_menu && typeof _menu.destroy === 'function') _menu.destroy();
      _menu = null;
      _attached = false;
      _attachedListEl = null;
      DEPS = null;
    },
  };
})();
