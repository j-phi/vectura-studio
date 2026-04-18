/**
 * Core vector generation engine.
 */
(() => {
  const {
    MACHINES,
    SETTINGS,
    ALGO_DEFAULTS,
    MODIFIER_DEFAULTS = {},
    Algorithms,
    SeededRNG,
    SimpleNoise,
    Layer,
    GeometryUtils = {},
    OptimizationUtils = {},
    Masking = {},
    Modifiers = {},
  } = window.Vectura || {};

  const smoothPath = GeometryUtils.smoothPath || ((path) => path);
  const simplifyPath = GeometryUtils.simplifyPath || ((path) => path);
  const simplifyPathVisvalingam = GeometryUtils.simplifyPathVisvalingam || ((path) => path);
  const countPathPoints = GeometryUtils.countPathPoints || (() => ({ lines: 0, points: 0 }));
  const clonePaths =
    GeometryUtils.clonePaths ||
    ((paths) =>
      (paths || []).map((path) => {
        if (!Array.isArray(path)) return path;
        const next = path.map((pt) => ({ ...pt }));
        if (path.meta) next.meta = JSON.parse(JSON.stringify(path.meta));
        return next;
      }));

  const usesManualSourceGeometry = (layer) => Boolean(layer && !layer.isGroup && layer.type === 'expanded');

  const pathLength = OptimizationUtils.pathLength || (() => 0);
  const pathEndpoints = OptimizationUtils.pathEndpoints || (() => ({ start: { x: 0, y: 0 }, end: { x: 0, y: 0 } }));
  const pathCentroid = OptimizationUtils.pathCentroid || (() => ({ x: 0, y: 0 }));
  const isClosedPath = OptimizationUtils.isClosedPath || (() => false);
  const closePathIfNeeded = OptimizationUtils.closePathIfNeeded || ((path) => path);
  const reversePath = OptimizationUtils.reversePath || ((path) => path);
  const offsetPath = OptimizationUtils.offsetPath || ((path) => path);
  const getLayerMaskCapabilities = Masking.getLayerMaskCapabilities || (() => ({ canSource: false, reason: '', sourceType: null }));
  const getLayerSilhouette = Masking.getLayerSilhouette || (() => []);
  const buildMaskUnion = Masking.buildMaskUnion || (() => []);
  const getMaskingAncestors = Masking.getMaskingAncestors || (() => []);
  const buildLayerMaskedPaths = Masking.buildLayerMaskedPaths || ((layer) => clonePaths(layer?.effectivePaths || layer?.paths || []));
  const applyMaskToPaths = Masking.applyMaskToPaths || ((paths) => clonePaths(paths || []));
  const createModifierState = Modifiers.createModifierState || ((type) => ({ type, enabled: true, mirrors: [] }));
  const createMirrorLine = Modifiers.createMirrorLine || ((index) => ({ id: `mirror-${index + 1}`, enabled: true }));
  const isModifierLayer = Modifiers.isModifierLayer || (() => false);
  const applyModifierToPaths = Modifiers.applyModifierToPaths || ((paths) => clonePaths(paths || []));
  const isValidDrawableLayerType = (type) =>
    Boolean(
      type &&
        type !== 'group' &&
        !Object.prototype.hasOwnProperty.call(MODIFIER_DEFAULTS, type) &&
        ((Algorithms && Algorithms[type]) || (ALGO_DEFAULTS && ALGO_DEFAULTS[type]))
    );
  const resolveDrawableLayerType = (type, fallback = 'flowfield') => {
    if (isValidDrawableLayerType(type)) return type;
    if (isValidDrawableLayerType(fallback)) return fallback;
    return 'flowfield';
  };

  const clone = (obj) => JSON.parse(JSON.stringify(obj));

  class VectorEngine {
    constructor() {
      this.layers = [];
      this.activeLayerId = null;
      this.profileKey = SETTINGS.paperSize || 'a4';
      this.currentProfile = this.resolveProfile();
      this.addLayer('wavetable');
    }

    addLayer(type = 'wavetable') {
      type = resolveDrawableLayerType(type, 'wavetable');
      const id = Math.random().toString(36).substr(2, 9);
      SETTINGS.globalLayerCount++;
      const num = String(SETTINGS.globalLayerCount).padStart(2, '0');
      const defaults = ALGO_DEFAULTS && ALGO_DEFAULTS[type];
      const prettyType = defaults && defaults.label ? defaults.label : type.charAt(0).toUpperCase() + type.slice(1);
      const name = `${prettyType} ${num}`;
      const layer = new Layer(id, type, name);
      this.layers.push(layer);
      this.activeLayerId = id;
      this.generate(id);
      return id;
    }

    addModifierLayer(type = 'mirror') {
      const id = Math.random().toString(36).substr(2, 9);
      SETTINGS.globalLayerCount++;
      const num = String(SETTINGS.globalLayerCount).padStart(2, '0');
      const prettyType = type.charAt(0).toUpperCase() + type.slice(1);
      const layer = new Layer(id, 'group', `${prettyType} Modifier ${num}`);
      layer.isGroup = true;
      layer.containerRole = 'modifier';
      layer.groupType = 'modifier';
      layer.groupCollapsed = false;
      layer.visible = true;
      layer.modifier = createModifierState(type, {
        mirrors: [createMirrorLine(0)],
      });
      this.layers.push(layer);
      this.activeLayerId = id;
      this.computeAllDisplayGeometry();
      return id;
    }

    exportState() {
      return {
        activeLayerId: this.activeLayerId,
        layers: this.layers.map((layer) => ({
          id: layer.id,
          type: layer.type,
          name: layer.name,
          params: JSON.parse(JSON.stringify(layer.params)),
          paramStates: JSON.parse(JSON.stringify(layer.paramStates || {})),
          parentId: layer.parentId,
          isGroup: layer.isGroup,
          containerRole: layer.containerRole,
          groupType: layer.groupType,
          groupParams: layer.groupParams ? JSON.parse(JSON.stringify(layer.groupParams)) : null,
          groupCollapsed: layer.groupCollapsed,
          modifier: layer.modifier ? JSON.parse(JSON.stringify(layer.modifier)) : null,
          sourcePaths:
            usesManualSourceGeometry(layer) && layer.sourcePaths
              ? JSON.parse(JSON.stringify(layer.sourcePaths))
              : null,
          mask: layer.mask ? JSON.parse(JSON.stringify(layer.mask)) : null,
          penId: layer.penId,
          color: layer.color,
          strokeWidth: layer.strokeWidth,
          lineCap: layer.lineCap,
          visible: layer.visible,
        })),
      };
    }

    importState(state) {
      if (!state) return;
      this.layers = (state.layers || []).map((data) => {
        const layer = new Layer(data.id, data.type, data.name);
        layer.params = JSON.parse(JSON.stringify(data.params || {}));
        layer.paramStates = JSON.parse(JSON.stringify(data.paramStates || {}));
        layer.parentId = data.parentId ?? null;
        layer.isGroup = Boolean(data.isGroup);
        layer.containerRole = data.containerRole ?? null;
        layer.groupType = data.groupType ?? null;
        layer.groupParams = data.groupParams ? JSON.parse(JSON.stringify(data.groupParams)) : null;
        layer.groupCollapsed = Boolean(data.groupCollapsed);
        layer.modifier = data.modifier ? JSON.parse(JSON.stringify(data.modifier)) : null;
        layer.sourcePaths =
          usesManualSourceGeometry(layer) && data.sourcePaths ? JSON.parse(JSON.stringify(data.sourcePaths)) : null;
        const importedMask = data.mask ? JSON.parse(JSON.stringify(data.mask)) : null;
        const isLegacySourceMask = Array.isArray(importedMask?.sourceIds) && importedMask.sourceIds.length > 0;
        layer.mask = {
          enabled: false,
          sourceIds: [],
          mode: 'parent',
          hideLayer: false,
          invert: false,
          materialized: false,
          ...(importedMask || {}),
        };
        if (isLegacySourceMask) {
          layer.mask.enabled = false;
          layer.mask.sourceIds = [];
          layer.mask.mode = 'parent';
          layer.mask.invert = false;
        } else if (layer.mask.mode !== 'parent') {
          layer.mask.mode = 'parent';
          layer.mask.sourceIds = [];
          layer.mask.invert = false;
        }
        layer.penId = data.penId ?? layer.penId;
        layer.color = data.color || layer.color;
        layer.strokeWidth = Number.isFinite(data.strokeWidth) ? data.strokeWidth : layer.strokeWidth;
        layer.lineCap = data.lineCap || layer.lineCap;
        layer.visible = data.visible !== false;
        layer.paths = [];
        layer.displayPaths = [];
        layer.displayMaskActive = false;
        layer.helperPaths = null;
        layer.displayHelperPaths = null;
        layer.maskPolygons = null;
        layer.effectivePaths = [];
        layer.effectiveStats = null;
        return layer;
      });
      this.activeLayerId = state.activeLayerId || (this.layers[0] ? this.layers[0].id : null);
      this.layers.forEach((l) => this.generate(l.id));
      this.computeAllDisplayGeometry();
    }

    duplicateLayer(id, state = null) {
      const source = this.layers.find((l) => l.id === id);
      if (!source) return null;
      const newId = Math.random().toString(36).substr(2, 9);
      SETTINGS.globalLayerCount++;
      const baseName = `${source.name} Copy`;
      const existing = new Set(this.layers.map((l) => l.name));
      let dupName = baseName;
      let count = 2;
      while (existing.has(dupName)) {
        dupName = `${baseName} ${count}`;
        count += 1;
      }
      const layer = new Layer(newId, source.type, dupName);
      layer.params = JSON.parse(JSON.stringify(source.params));
      layer.paramStates = JSON.parse(JSON.stringify(source.paramStates || {}));
      layer.parentId = state && state.parentId !== undefined ? state.parentId : (source.parentId ?? null);
      layer.isGroup = source.isGroup;
      layer.containerRole = source.containerRole ?? null;
      layer.groupType = source.groupType ?? null;
      layer.groupParams = source.groupParams ? JSON.parse(JSON.stringify(source.groupParams)) : null;
      layer.groupCollapsed = source.groupCollapsed;
      layer.sourcePaths =
        usesManualSourceGeometry(source) && source.sourcePaths ? JSON.parse(JSON.stringify(source.sourcePaths)) : null;
      layer.modifier = source.modifier ? JSON.parse(JSON.stringify(source.modifier)) : null;
      layer.penId = source.penId;
      layer.color = source.color;
      layer.strokeWidth = source.strokeWidth;
      layer.lineCap = source.lineCap;
      layer.visible = source.visible;
      layer.paths = clonePaths(source.paths);
      layer.displayPaths = clonePaths(source.displayPaths || source.paths || []);
      layer.maskPolygons = clonePaths(source.maskPolygons || []);
      layer.effectivePaths = clonePaths(source.effectivePaths || source.paths || []);
      layer.mask = source.mask ? JSON.parse(JSON.stringify(source.mask)) : layer.mask;

      let currentState = state;
      if (!currentState) {
        const getDescendantsIds = (parentId) => {
          const out = [];
          const visit = (pid) => {
            this.layers.forEach((l) => {
              if (l.parentId === pid) {
                out.push(l.id);
                visit(l.id);
              }
            });
          };
          visit(parentId);
          return out;
        };
        const descIds = source.isGroup ? getDescendantsIds(source.id) : [];
        const allIds = new Set([source.id, ...descIds]);
        let maxIdx = -1;
        this.layers.forEach((l, i) => {
          if (allIds.has(l.id)) maxIdx = Math.max(maxIdx, i);
        });
        currentState = { insertIndex: maxIdx };
      }

      if (currentState.insertIndex >= 0) {
        currentState.insertIndex++;
        this.layers.splice(currentState.insertIndex, 0, layer);
      } else {
        this.layers.push(layer);
        currentState.insertIndex = this.layers.length - 1;
      }

      if (source.isGroup) {
        const children = this.layers.filter((l) => l.parentId === source.id && l.id !== newId);
        children.forEach((child) => {
          const childState = {
            insertIndex: currentState.insertIndex,
            parentId: newId
          };
          this.duplicateLayer(child.id, childState);
          currentState.insertIndex = childState.insertIndex;
        });
      }

      if (!state) {
        this.activeLayerId = newId;
        this.computeAllDisplayGeometry();
      }
      return layer;
    }

    removeLayer(id) {
      const targetIndex = this.layers.findIndex((l) => l.id === id);
      const target = targetIndex >= 0 ? this.layers[targetIndex] : null;
      if (!target) return;
      const drawableCount = this.layers.filter((l) => !l.isGroup).length;
      if (!target.isGroup && drawableCount <= 1) return;
      const pickNextActiveId = (remainingLayers, removedIndex, preferredIds = []) => {
        for (const preferredId of preferredIds) {
          if (remainingLayers.some((layer) => layer.id === preferredId)) return preferredId;
        }
        if (!remainingLayers.length) return null;
        const boundedIndex = Math.max(0, Math.min(removedIndex, remainingLayers.length - 1));
        return remainingLayers[boundedIndex]?.id || remainingLayers[remainingLayers.length - 1]?.id || null;
      };
      if (target.isGroup && isModifierLayer(target)) {
        const preservedChildren = this.layers.filter((layer) => layer.parentId === id);
        preservedChildren.forEach((child) => {
          child.parentId = null;
        });
        const remainingLayers = this.layers.filter((layer) => layer.id !== id);
        this.layers = remainingLayers;
        if (this.activeLayerId === id) {
          this.activeLayerId = pickNextActiveId(remainingLayers, targetIndex, preservedChildren.map((child) => child.id));
        } else if (!remainingLayers.some((layer) => layer.id === this.activeLayerId)) {
          this.activeLayerId = pickNextActiveId(remainingLayers, targetIndex);
        }
        this.computeAllDisplayGeometry();
        return;
      }
      const removeIds = new Set([id]);
      if (target.isGroup) {
        const collect = (groupId) => {
          this.layers.forEach((l) => {
            if (l.parentId === groupId) {
              removeIds.add(l.id);
              if (l.isGroup) collect(l.id);
            }
          });
        };
        collect(id);
        const childCount = Array.from(removeIds).filter((rid) => {
          const layer = this.layers.find((l) => l.id === rid);
          return layer && !layer.isGroup;
        }).length;
        if (drawableCount - childCount <= 0) return;
      } else if (target.parentId) {
        const parentId = target.parentId;
        const remaining = this.layers.filter((l) => l.parentId === parentId && l.id !== id).length;
        const parent = this.layers.find((l) => l.id === parentId);
        if (remaining === 0 && parent && parent.isGroup && !isModifierLayer(parent)) removeIds.add(parentId);
      }
      const remainingLayers = this.layers.filter((l) => !removeIds.has(l.id));
      this.layers = remainingLayers;
      if (removeIds.has(this.activeLayerId)) {
        this.activeLayerId = pickNextActiveId(remainingLayers, targetIndex);
      }
      this.computeAllDisplayGeometry();
    }

    moveLayer(id, direction) {
      const idx = this.layers.findIndex((l) => l.id === id);
      if (idx === -1) return false;
      const newIdx = idx + direction;
      if (newIdx >= 0 && newIdx < this.layers.length) {
        [this.layers[idx], this.layers[newIdx]] = [this.layers[newIdx], this.layers[idx]];
        this.computeAllDisplayGeometry();
        return true;
      }
      return false;
    }

    getActiveLayer() {
      return this.layers.find((l) => l.id === this.activeLayerId);
    }

    getBounds() {
      const { width, height } = this.currentProfile;
      const m = SETTINGS.margin;
      return {
        width,
        height,
        m,
        dW: width - m * 2,
        dH: height - m * 2,
        truncate: SETTINGS.truncate,
      };
    }

    refreshMaskCapabilities() {
      const bounds = this.getBounds();
      this.layers.forEach((layer) => {
        layer.maskCapabilities = getLayerMaskCapabilities(layer, this, bounds);
      });
    }

    getMaskEligibleLayers(targetLayerId) {
      return this.layers.filter((layer) => {
        if (!layer || layer.id === targetLayerId) return false;
        return Boolean(layer.maskCapabilities?.canSource);
      });
    }

    getLayerAncestors(layer) {
      const out = [];
      let current = layer;
      while (current?.parentId) {
        const parent = this.layers.find((entry) => entry.id === current.parentId);
        if (!parent) break;
        out.push(parent);
        current = parent;
      }
      return out;
    }

    getAncestorModifiers(layer) {
      return this.getLayerAncestors(layer)
        .filter((entry) => isModifierLayer(entry) && entry.modifier)
        .reverse();
    }

    getAncestorMaskLayers(layer) {
      return this.getLayerAncestors(layer)
        .filter((entry) => entry?.mask?.enabled && entry.maskCapabilities?.canSource)
        .reverse();
    }

    getLayerDepth(layer) {
      return this.getLayerAncestors(layer).length;
    }

    getLayerChildren(layerId) {
      return this.layers.filter((layer) => layer?.parentId === layerId);
    }

    getLayerDescendants(layerId) {
      const out = [];
      const visit = (parentId) => {
        this.getLayerChildren(parentId).forEach((child) => {
          out.push(child);
          visit(child.id);
        });
      };
      visit(layerId);
      return out;
    }

    computeLayerEffectiveGeometry(layerId) {
      const layer = this.layers.find((entry) => entry.id === layerId);
      if (!layer || layer.isGroup) return;
      const basePaths = clonePaths(layer.paths || []);
      const effective = this.getAncestorModifiers(layer).reduce(
        (current, modifierLayer) => applyModifierToPaths(current, modifierLayer.modifier, this.getBounds()),
        basePaths
      );
      layer.effectivePaths = clonePaths(effective || []);
      layer.effectiveStats = countPathPoints(layer.effectivePaths);
    }

    computeLayerDisplayGeometry(layerId) {
      const layer = this.layers.find((entry) => entry.id === layerId);
      if (!layer || layer.isGroup) return;
      const sourcePaths = clonePaths(layer.effectivePaths || layer.paths || []);
      layer.displayHelperPaths = clonePaths(layer.helperPaths || []);
      layer.displayMaskActive = false;
      if (!layer.visible) {
        layer.displayPaths = sourcePaths;
        layer.displayStats = countPathPoints(sourcePaths);
        return;
      }
      const ancestorMasks = getMaskingAncestors(layer, this, {});
      if (!ancestorMasks.length) {
        layer.displayPaths = sourcePaths;
        layer.displayStats = countPathPoints(sourcePaths);
        return;
      }
      const bounds = this.getBounds();
      const currentPaths = buildLayerMaskedPaths(layer, this, bounds, { sourcePaths });
      layer.displayMaskActive = true;
      layer.displayPaths = currentPaths;
      layer.displayStats = countPathPoints(currentPaths);
    }

    getRenderablePaths(layer, options = {}) {
      if (!layer) return [];
      if (layer.mask?.enabled && layer.mask?.hideLayer) return [];
      const { useOptimized = false } = options;
      if (layer.displayMaskActive && Array.isArray(layer.displayPaths)) return layer.displayPaths;
      if (useOptimized && Array.isArray(layer.optimizedPaths)) return layer.optimizedPaths;
      if (Array.isArray(layer.effectivePaths) && layer.effectivePaths.length) return layer.effectivePaths;
      return layer.paths || [];
    }

    computeAllDisplayGeometry() {
      this.layers.forEach((layer) => {
        if (!layer || layer.isGroup) return;
        this.computeLayerEffectiveGeometry(layer.id);
      });
      this.refreshMaskCapabilities();
      this.layers
        .filter((layer) => layer && !layer.isGroup)
        .slice()
        .sort((a, b) => this.getLayerDepth(a) - this.getLayerDepth(b))
        .forEach((layer) => {
        if (!layer || layer.isGroup) return;
        this.computeLayerDisplayGeometry(layer.id);
      });
      this.optimizeLayers(this.layers);
    }

    resolveProfile() {
      const key = this.profileKey || SETTINGS.paperSize || 'a4';
      const base = MACHINES[key] || MACHINES.a4;
      let width = base.width;
      let height = base.height;
      if (key === 'custom') {
        const customW = SETTINGS.paperWidth;
        const customH = SETTINGS.paperHeight;
        if (Number.isFinite(customW) && customW > 0) width = customW;
        if (Number.isFinite(customH) && customH > 0) height = customH;
      }
      const orientation = SETTINGS.paperOrientation || 'landscape';
      const isLandscape = orientation === 'landscape';
      if (isLandscape && width < height) {
        [width, height] = [height, width];
      }
      if (!isLandscape && width > height) {
        [width, height] = [height, width];
      }
      return { name: base.name, width, height };
    }

    setProfile(key) {
      this.profileKey = key;
      this.currentProfile = this.resolveProfile();
    }

    generate(layerId) {
      const layer = this.layers.find((l) => l.id === layerId);
      if (!layer) return;
      if (layer.isGroup) return;

      const rng = new SeededRNG(layer.params.seed);
      const noise = new SimpleNoise(layer.params.seed);

      const { width, height } = this.currentProfile;
      const m = SETTINGS.margin;
      const dW = width - m * 2;
      const dH = height - m * 2;
      const p =
        layer.type === 'petalisDesigner'
          ? { ...layer.params, lightSource: SETTINGS.lightSource }
          : layer.params;

      const bounds = { width, height, m, dW, dH, truncate: SETTINGS.truncate };

      const algo = Algorithms[layer.type] || Algorithms.flowfield;
      const rawPaths =
        usesManualSourceGeometry(layer) && layer.sourcePaths
          ? clonePaths(layer.sourcePaths)
          : algo.generate(p, rng, noise, bounds) || [];
      const helperPaths = rawPaths.helpers ? clonePaths(rawPaths.helpers) : null;
      const maskPolygons = rawPaths.maskPolygons ? clonePaths(rawPaths.maskPolygons) : null;
      const smooth = Math.max(0, Math.min(1, p.smoothing ?? 0));
      const simplify = Math.max(0, Math.min(1, p.simplify ?? 0));

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      rawPaths.forEach((path) => {
        if (!Array.isArray(path)) return;
        if (path.meta && path.meta.kind === 'circle') {
          const cx = path.meta.cx ?? path.meta.x;
          const cy = path.meta.cy ?? path.meta.y;
          const rx = path.meta.rx ?? path.meta.r;
          const ry = path.meta.ry ?? path.meta.r;
          if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(rx) && Number.isFinite(ry)) {
            minX = Math.min(minX, cx - rx);
            maxX = Math.max(maxX, cx + rx);
            minY = Math.min(minY, cy - ry);
            maxY = Math.max(maxY, cy + ry);
          }
          return;
        }
        path.forEach((pt) => {
          minX = Math.min(minX, pt.x);
          minY = Math.min(minY, pt.y);
          maxX = Math.max(maxX, pt.x);
          maxY = Math.max(maxY, pt.y);
        });
      });
      if (!Number.isFinite(minX)) {
        minX = 0;
        minY = 0;
        maxX = width;
        maxY = height;
      }
      const origin = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
      layer.origin = origin;

      const rot = ((p.rotation ?? 0) * Math.PI) / 180;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);

      const transform = (pt) => {
        let x = pt.x - origin.x;
        let y = pt.y - origin.y;
        x *= p.scaleX;
        y *= p.scaleY;
        const rx = x * cosR - y * sinR;
        const ry = x * sinR + y * cosR;
        x = rx + origin.x + p.posX;
        y = ry + origin.y + p.posY;
        return { x, y };
      };

      const transformMeta = (meta) => {
        if (!meta) return meta;
        if (meta.kind !== 'circle') return JSON.parse(JSON.stringify(meta));
        const center = transform({ x: meta.cx, y: meta.cy });
        const scaleX = p.scaleX ?? 1;
        const scaleY = p.scaleY ?? 1;
        const baseR = Number.isFinite(meta.r) ? meta.r : Math.max(meta.rx ?? 0, meta.ry ?? 0);
        return {
          ...meta,
          cx: center.x,
          cy: center.y,
          rx: Math.abs(baseR * scaleX),
          ry: Math.abs(baseR * scaleY),
          rotation: rot,
        };
      };

      const transformed = rawPaths.map((path) => {
        if (!Array.isArray(path)) return path;
        const transformed = path.map((pt) => transform(pt));
        if (path.meta) transformed.meta = transformMeta(path.meta);
        return smoothPath(transformed, smooth);
      });
      if (layer.type === 'spiral' && p.close && Array.isArray(transformed[0]) && transformed[0].length > 6) {
        const path = transformed[0];
        const resolveFeather = (val) => {
          const featherVal = Math.max(0, val ?? 0);
          if (featherVal <= 1) return featherVal * 20;
          return featherVal;
        };
        const featherMm = resolveFeather(p.closeFeather);
        const buildConnection = (fromIndex, excludeCount) => {
          const from = path[fromIndex];
          if (!from) return null;
          const fromDir = (() => {
            const nextIdx = fromIndex === 0 ? 1 : fromIndex - 1;
            const next = path[nextIdx] || from;
            const dx = fromIndex === 0 ? next.x - from.x : from.x - next.x;
            const dy = fromIndex === 0 ? next.y - from.y : from.y - next.y;
            const len = Math.hypot(dx, dy) || 1;
            return { x: dx / len, y: dy / len };
          })();
          let best = null;
          for (let i = 0; i < path.length - 1; i++) {
            if (fromIndex === 0 && i < excludeCount) continue;
            if (fromIndex === path.length - 1 && i > path.length - 2 - excludeCount) continue;
            const a = path[i];
            const b = path[i + 1];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const denom = dx * dx + dy * dy || 1;
            const t = Math.max(0, Math.min(1, ((from.x - a.x) * dx + (from.y - a.y) * dy) / denom));
            const cx = a.x + dx * t;
            const cy = a.y + dy * t;
            const dist = Math.hypot(from.x - cx, from.y - cy);
            if (!best || dist < best.dist) {
              const segLen = Math.hypot(dx, dy) || 1;
              best = {
                x: cx,
                y: cy,
                dist,
                dir: { x: dx / segLen, y: dy / segLen },
              };
            }
          }
          if (!best) return null;
          const dist = best.dist || 1;
          const feather = Math.min(dist * 0.45, featherMm || dist * 0.2);
          const c1 = {
            x: from.x + fromDir.x * feather,
            y: from.y + fromDir.y * feather,
          };
          const c2 = {
            x: best.x - best.dir.x * feather,
            y: best.y - best.dir.y * feather,
          };
          const steps = Math.max(8, Math.floor(dist / 3));
          const curve = [];
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const u = 1 - t;
            const x =
              u * u * u * from.x +
              3 * u * u * t * c1.x +
              3 * u * t * t * c2.x +
              t * t * t * best.x;
            const y =
              u * u * u * from.y +
              3 * u * u * t * c1.y +
              3 * u * t * t * c2.y +
              t * t * t * best.y;
            curve.push({ x, y });
          }
          return curve;
        };
        const skip = Math.max(4, Math.floor(path.length * 0.02));
        const endConnect = buildConnection(path.length - 1, skip);
        const startConnect = buildConnection(0, skip);
        if (endConnect) transformed.push(endConnect);
        if (startConnect) transformed.push(startConnect);
      }
      const helperTransformed = helperPaths
        ? helperPaths.map((path) => {
            if (!Array.isArray(path)) return path;
            const transformed = path.map((pt) => transform(pt));
            if (path.meta) transformed.meta = transformMeta(path.meta);
            return smoothPath(transformed, smooth);
          })
        : [];
      const transformedMaskPolygons = maskPolygons
        ? maskPolygons.map((polygon) => {
            if (!Array.isArray(polygon)) return polygon;
            const transformedPolygon = polygon.map((pt) => transform(pt));
            if (polygon.meta) transformedPolygon.meta = JSON.parse(JSON.stringify(polygon.meta));
            return transformedPolygon;
          })
        : [];
      const rawCounts = countPathPoints(transformed);
      let finalPaths = transformed;
      if (simplify > 0) {
        const tol = simplify * Math.max(dW, dH) * 0.01;
        const useCurves = Boolean(p.curves);
        finalPaths = transformed.map((path) => {
          if (!Array.isArray(path)) return path;
          if (path.meta && path.meta.kind === 'circle') return path;
          return useCurves ? simplifyPathVisvalingam(path, tol) : simplifyPath(path, tol);
        });
      }
      const simplifiedCounts = countPathPoints(finalPaths);
      layer.stats = {
        rawLines: rawCounts.lines,
        rawPoints: rawCounts.points,
        simplifiedLines: simplifiedCounts.lines,
        simplifiedPoints: simplifiedCounts.points,
      };
      layer.paths = finalPaths;
      layer.helperPaths = helperTransformed;
      layer.maskPolygons = transformedMaskPolygons;
      this.computeAllDisplayGeometry();
    }

    ensureLayerOptimization(layer) {
      if (!layer) return null;
      if (!layer.optimization) {
        const base = SETTINGS.optimizationDefaults ? clone(SETTINGS.optimizationDefaults) : { bypassAll: false, steps: [] };
        layer.optimization = base;
      }
      if (!Array.isArray(layer.optimization.steps)) layer.optimization.steps = [];
      const defaults = SETTINGS.optimizationDefaults ? clone(SETTINGS.optimizationDefaults) : { bypassAll: false, steps: [] };
      const defaultSteps = Array.isArray(defaults.steps) ? defaults.steps : [];
      const defaultMap = new Map(defaultSteps.map((step) => [step.id, step]));
      const normalized = layer.optimization.steps.map((step) => ({
        ...(defaultMap.get(step.id) || {}),
        ...step,
      }));
      defaultSteps.forEach((step) => {
        if (!normalized.some((s) => s.id === step.id)) {
          normalized.push(clone(step));
        }
      });
      layer.optimization.steps = normalized;
      if (layer.optimization.bypassAll === undefined) layer.optimization.bypassAll = defaults.bypassAll ?? false;
      return layer.optimization;
    }

    optimizeLayers(layers, options = {}) {
      const targetLayers = (layers || this.layers).filter((layer) => layer && !layer.isGroup);
      if (!targetLayers.length) return new Map();
      const includePlotterOptimize = Boolean(options.includePlotterOptimize);
      const runPipeline = (layersToProcess, config) => {
        if (!config) return new Map();
        const steps = Array.isArray(config.steps) ? config.steps : [];
        const shouldRun = !config.bypassAll && steps.some((step) => step && step.enabled && !step.bypass);
        if (!shouldRun) {
          layersToProcess.forEach((layer) => {
            layer.optimizedPaths = null;
            layer.optimizedStats = null;
          });
          return new Map();
        }

        const working = new Map();
        layersToProcess.forEach((layer) => {
          const sourcePaths = this.getAncestorModifiers(layer).length
            ? Array.isArray(layer.effectivePaths) && layer.effectivePaths.length
              ? layer.effectivePaths
              : layer.paths || []
            : layer.paths || [];
          working.set(
            layer.id,
            clonePaths(sourcePaths)
          );
        });

      const simplifyPaths = (paths, step) => {
        const tol = Math.max(0, step.tolerance ?? 0);
        if (!tol) return paths;
        const useCurves = step.mode === 'curve';
        return paths.map((path) => {
          if (!Array.isArray(path)) return path;
          if (path.meta && path.meta.kind === 'circle') return path;
          const closed = isClosedPath(path);
          const next = useCurves ? simplifyPathVisvalingam(path, tol) : simplifyPath(path, tol);
          return closePathIfNeeded(next, closed);
        });
      };

      const filterPaths = (paths, step) => {
        const minLen = Math.max(0, step.minLength ?? 0);
        const maxLen = step.maxLength > 0 ? step.maxLength : Infinity;
        const tinyThreshold = step.removeTiny ? Math.max(minLen, 0.5) : minLen;
        return paths.filter((path) => {
          const len = pathLength(path);
          if (len < tinyThreshold) return false;
          if (len > maxLen) return false;
          return true;
        });
      };

      const multipassPaths = (paths, step) => {
        const passes = Math.max(1, Math.round(step.passes ?? 1));
        if (passes <= 1) return paths;
        const offset = Math.max(0, step.offset ?? 0);
        const jitter = Math.max(0, step.jitter ?? 0);
        const seed = step.seed ?? 0;
        const passRng = new SeededRNG(seed);
        const out = [];
        paths.forEach((path) => {
          out.push(path);
          for (let i = 1; i < passes; i++) {
            const angle = (i / passes) * Math.PI * 2;
            let dx = Math.cos(angle) * offset;
            let dy = Math.sin(angle) * offset;
            if (jitter > 0) {
              dx += (passRng.nextFloat() * 2 - 1) * jitter;
              dy += (passRng.nextFloat() * 2 - 1) * jitter;
            }
            out.push(offsetPath(path, dx, dy));
          }
        });
        return out;
      };

      const sortItems = (items, step, origin) => {
        if (!items.length) return items;
        const method = step.method || 'nearest';
        const direction = step.direction || 'none';
        const grouping = step.grouping || 'layer';
        const finalizeSorted = (sortedItems) => {
          sortedItems.forEach((item, index) => {
            if (!Array.isArray(item.path)) return;
            item.path.meta = {
              ...(item.path.meta || {}),
              lineSortOrder: index,
              lineSortGrouping: grouping,
            };
          });
          return sortedItems;
        };
        const getKey = (item) => {
          const center = pathCentroid(item.path);
          if (direction === 'horizontal') return center.x;
          if (direction === 'vertical') return center.y;
          if (direction === 'radial') {
            return Math.atan2(center.y - origin.y, center.x - origin.x);
          }
          return 0;
        };
        const getNearestCandidate = (candidates, current, allowReverse) => {
          let bestIdx = 0;
          let bestDist = Infinity;
          let bestReverse = false;
          for (let i = 0; i < candidates.length; i++) {
            const item = candidates[i];
            if (!current) {
              bestIdx = i;
              bestDist = 0;
              bestReverse = false;
              break;
            }
            const { start, end } = pathEndpoints(item.path);
            const dx = start.x - current.x;
            const dy = start.y - current.y;
            let dist = dx * dx + dy * dy;
            let reverse = false;
            if (allowReverse) {
              const dx2 = end.x - current.x;
              const dy2 = end.y - current.y;
              const dist2 = dx2 * dx2 + dy2 * dy2;
              if (dist2 < dist) {
                dist = dist2;
                reverse = true;
              }
            }
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = i;
              bestReverse = reverse;
            }
          }
          return { index: bestIdx, reverse: bestReverse };
        };
        const buildDirectionalBuckets = (directionalItems) => {
          if (!directionalItems.length) return [];
          const sortedByAxis = directionalItems
            .map((item, index) => ({ item, index, axisKey: getKey(item) }))
            .sort((a, b) => {
              if (a.axisKey !== b.axisKey) return a.axisKey - b.axisKey;
              return a.index - b.index;
            });
          const positiveGaps = [];
          for (let i = 1; i < sortedByAxis.length; i++) {
            const gap = sortedByAxis[i].axisKey - sortedByAxis[i - 1].axisKey;
            if (gap > 1e-6) positiveGaps.push(gap);
          }
          const bandSize = positiveGaps.length
            ? positiveGaps[Math.floor(positiveGaps.length / 2)] * 0.5
            : 1e-6;
          const buckets = [];
          let currentBucket = [];
          let bucketStart = sortedByAxis[0].axisKey;
          sortedByAxis.forEach((entry) => {
            if (!currentBucket.length) {
              currentBucket.push(entry.item);
              bucketStart = entry.axisKey;
              return;
            }
            if (entry.axisKey - bucketStart <= bandSize) {
              currentBucket.push(entry.item);
              return;
            }
            buckets.push(currentBucket);
            currentBucket = [entry.item];
            bucketStart = entry.axisKey;
          });
          if (currentBucket.length) buckets.push(currentBucket);
          return buckets;
        };
        if (method === 'angle' || direction === 'radial') {
          return finalizeSorted(items.slice().sort((a, b) => getKey(a) - getKey(b)));
        }
        if (method === 'greedy' && direction !== 'none') {
          return finalizeSorted(items.slice().sort((a, b) => getKey(a) - getKey(b)));
        }
        const allowReverse = method === 'nearest';
        if (method === 'nearest' && (direction === 'horizontal' || direction === 'vertical')) {
          const sorted = [];
          let current = null;
          buildDirectionalBuckets(items).forEach((bucket) => {
            const remainingBucket = bucket.slice();
            while (remainingBucket.length) {
              const nextCandidate = getNearestCandidate(remainingBucket, current, allowReverse);
              const nextItem = remainingBucket.splice(nextCandidate.index, 1)[0];
              if (nextCandidate.reverse) nextItem.path = reversePath(nextItem.path);
              sorted.push(nextItem);
              current = pathEndpoints(nextItem.path).end;
            }
          });
          return finalizeSorted(sorted);
        }
        const remaining = items.slice();
        const sorted = [];
        let startIndex = 0;
        if (direction !== 'none') {
          let bestVal = Infinity;
          remaining.forEach((item, idx) => {
            const val = getKey(item);
            if (val < bestVal) {
              bestVal = val;
              startIndex = idx;
            }
          });
        }
        let currentItem = remaining.splice(startIndex, 1)[0];
        sorted.push(currentItem);
        let current = pathEndpoints(currentItem.path).end;
        while (remaining.length) {
          const nextCandidate = getNearestCandidate(remaining, current, allowReverse);
          const nextItem = remaining.splice(nextCandidate.index, 1)[0];
          if (nextCandidate.reverse) nextItem.path = reversePath(nextItem.path);
          sorted.push(nextItem);
          current = pathEndpoints(nextItem.path).end;
        }
        return finalizeSorted(sorted);
      };

      const applyLineSort = (map, step) => {
        const grouping = step.grouping || 'layer';
        const center = layersToProcess.reduce(
          (acc, layer) => {
            acc.x += layer.origin?.x ?? 0;
            acc.y += layer.origin?.y ?? 0;
            return acc;
          },
          { x: 0, y: 0 }
        );
        if (layersToProcess.length) {
          center.x /= layersToProcess.length;
          center.y /= layersToProcess.length;
        }
        if (grouping === 'combined') {
          const items = [];
          layersToProcess.forEach((layer) => {
            (map.get(layer.id) || []).forEach((path) => items.push({ layerId: layer.id, path }));
          });
          const sorted = sortItems(items, step, center);
          const nextMap = new Map(layersToProcess.map((layer) => [layer.id, []]));
          sorted.forEach((item) => {
            if (!nextMap.has(item.layerId)) nextMap.set(item.layerId, []);
            nextMap.get(item.layerId).push(item.path);
          });
          return nextMap;
        }
        if (grouping === 'pen') {
          const penGroups = new Map();
          layersToProcess.forEach((layer) => {
            const penId = layer.penId || 'default';
            if (!penGroups.has(penId)) penGroups.set(penId, []);
            (map.get(layer.id) || []).forEach((path) =>
              penGroups.get(penId).push({ layerId: layer.id, path })
            );
          });
          const nextMap = new Map(layersToProcess.map((layer) => [layer.id, []]));
          penGroups.forEach((items) => {
            const sorted = sortItems(items, step, center);
            sorted.forEach((item) => {
              if (!nextMap.has(item.layerId)) nextMap.set(item.layerId, []);
              nextMap.get(item.layerId).push(item.path);
            });
          });
          return nextMap;
        }
        const nextMap = new Map();
        layersToProcess.forEach((layer) => {
          const items = (map.get(layer.id) || []).map((path) => ({ layerId: layer.id, path }));
          const sorted = sortItems(items, step, center);
          nextMap.set(
            layer.id,
            sorted.map((item) => item.path)
          );
        });
        return nextMap;
      };

      let current = working;
      steps.forEach((step) => {
        if (!step || !step.enabled || step.bypass) return;
        switch (step.id) {
          case 'linesimplify': {
            const next = new Map();
            current.forEach((paths, id) => {
              next.set(id, simplifyPaths(paths, step));
            });
            current = next;
            break;
          }
          case 'filter': {
            const next = new Map();
            current.forEach((paths, id) => {
              next.set(id, filterPaths(paths, step));
            });
            current = next;
            break;
          }
          case 'multipass': {
            const next = new Map();
            current.forEach((paths, id) => {
              next.set(id, multipassPaths(paths, step));
            });
            current = next;
            break;
          }
          case 'linesort': {
            current = applyLineSort(current, step);
            break;
          }
          default:
            break;
        }
      });

      if (includePlotterOptimize) {
        const optimize = Math.max(0, SETTINGS.plotterOptimize ?? 0);
        const tol = optimize > 0 ? Math.max(0.001, optimize) : 0;
        if (tol > 0) {
          const quant = (v) => Math.round(v / tol) * tol;
          const pathKey = (path) => {
            if (path && path.meta && path.meta.kind === 'circle') {
              const cx = path.meta.cx ?? path.meta.x ?? 0;
              const cy = path.meta.cy ?? path.meta.y ?? 0;
              const r = path.meta.r ?? path.meta.rx ?? 0;
              return `c:${quant(cx)},${quant(cy)},${quant(r)}`;
            }
            if (!Array.isArray(path)) return '';
            return path
              .map((pt) => `${quant(pt.x)},${quant(pt.y)}`)
              .join('|');
          };
          const seenByPen = new Map();
          layersToProcess.forEach((layer) => {
            const penId = layer.penId || 'default';
            if (!seenByPen.has(penId)) seenByPen.set(penId, new Set());
            const seen = seenByPen.get(penId);
            const deduped = [];
            (current.get(layer.id) || []).forEach((path) => {
              const key = pathKey(path);
              if (key && seen.has(key)) return;
              if (key) seen.add(key);
              deduped.push(path);
            });
            current.set(layer.id, deduped);
          });
        }
      }

      layersToProcess.forEach((layer) => {
        const next = current.get(layer.id) || [];
        layer.optimizedPaths = next;
        layer.optimizedStats = countPathPoints(next);
      });
      return current;
      };

      if (options.config) {
        return runPipeline(targetLayers, options.config);
      }

      const combined = new Map();
      targetLayers.forEach((layer) => {
        const config = this.ensureLayerOptimization(layer);
        const map = runPipeline([layer], config);
        map.forEach((paths, id) => {
          combined.set(id, paths);
        });
      });
      return combined;
    }

    getFormula(layerId) {
      const l = this.layers.find((x) => x.id === layerId);
      if (!l) return 'Select a layer...';
      if (isModifierLayer(l)) {
        const mirrorCount = Array.isArray(l.modifier?.mirrors) ? l.modifier.mirrors.length : 0;
        return `Mirror Modifier · ${mirrorCount} axis${mirrorCount === 1 ? '' : 'es'} · child geometry is mirrored top-to-bottom by stack order`;
      }
      const algo = Algorithms[l.type];
      return algo && algo.formula ? algo.formula(l.params) : 'Procedural Vector Generation';
    }

    computeStats(layers, options = {}) {
      const target = (layers || []).filter((l) => l && l.visible);
      const useOptimized = Boolean(options.useOptimized);
      const includePlotterOptimize = options.includePlotterOptimize !== false;
      let dist = 0;
      let lines = 0;
      let points = 0;
      const optimize = includePlotterOptimize ? Math.max(0, SETTINGS.plotterOptimize ?? 0) : 0;
      const tol = optimize > 0 ? Math.max(0.001, optimize) : 0;
      const dedupe = optimize > 0 ? new Map() : null;
      const quant = (v) => (tol ? Math.round(v / tol) * tol : v);
      const pathKey = (path) => {
        if (path && path.meta && path.meta.kind === 'circle') {
          const cx = path.meta.cx ?? path.meta.x ?? 0;
          const cy = path.meta.cy ?? path.meta.y ?? 0;
          const r = path.meta.r ?? path.meta.rx ?? 0;
          return `c:${quant(cx)},${quant(cy)},${quant(r)}`;
        }
        if (!Array.isArray(path)) return '';
        return path
          .map((pt) => `${quant(pt.x)},${quant(pt.y)}`)
          .join('|');
      };
      target.forEach((l) => {
        const penId = l.penId || 'default';
        let seen = null;
        if (dedupe) {
          if (!dedupe.has(penId)) dedupe.set(penId, new Set());
          seen = dedupe.get(penId);
        }
        const sourcePaths = this.getRenderablePaths(l, { useOptimized });
        const visiblePaths = [];
        (sourcePaths || []).forEach((p) => {
          if (seen) {
            const key = pathKey(p);
            if (key && seen.has(key)) return;
            if (key) seen.add(key);
          }
          visiblePaths.push(p);
          dist += pathLength(p);
        });
        const count = countPathPoints(visiblePaths);
        lines += count.lines;
        points += count.points;
      });
      const timeSec = dist / 1000 / (SETTINGS.speedDown / 1000);
      const m = Math.floor(timeSec / 60);
      const s = Math.floor(timeSec % 60);
      return { distance: Math.round(dist / 1000) + 'm', time: `${m}:${s.toString().padStart(2, '0')}`, lines, points };
    }

    getStats(options = {}) {
      const layers = options.layers || this.layers;
      return this.computeStats(layers, options);
    }
  }

  window.Vectura = window.Vectura || {};
  window.Vectura.VectorEngine = VectorEngine;
})();
