/**
 * Core vector generation engine.
 */
(() => {
  const { MACHINES, SETTINGS, ALGO_DEFAULTS, Algorithms, SeededRNG, SimpleNoise, Layer } = window.Vectura || {};

  const smoothPath = (path, amount) => {
    if (!amount || amount <= 0 || path.length < 3) return path;
    const smoothed = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
      const prev = path[i - 1];
      const curr = path[i];
      const next = path[i + 1];
      const avgX = (prev.x + next.x) / 2;
      const avgY = (prev.y + next.y) / 2;
      smoothed.push({
        x: curr.x * (1 - amount) + avgX * amount,
        y: curr.y * (1 - amount) + avgY * amount,
      });
    }
    smoothed.push(path[path.length - 1]);
    if (path.meta) smoothed.meta = path.meta;
    return smoothed;
  };

  const simplifyPath = (path, tolerance) => {
    if (!tolerance || tolerance <= 0 || path.length < 3) return path;
    const sq = (n) => n * n;
    const distToSegmentSq = (p, a, b) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx === 0 && dy === 0) return sq(p.x - a.x) + sq(p.y - a.y);
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
      if (t <= 0) return sq(p.x - a.x) + sq(p.y - a.y);
      if (t >= 1) return sq(p.x - b.x) + sq(p.y - b.y);
      const projX = a.x + t * dx;
      const projY = a.y + t * dy;
      return sq(p.x - projX) + sq(p.y - projY);
    };
    const keep = new Array(path.length).fill(false);
    keep[0] = true;
    keep[path.length - 1] = true;
    const stack = [[0, path.length - 1]];
    const tolSq = tolerance * tolerance;
    while (stack.length) {
      const [start, end] = stack.pop();
      let maxDist = 0;
      let index = -1;
      for (let i = start + 1; i < end; i++) {
        const dist = distToSegmentSq(path[i], path[start], path[end]);
        if (dist > maxDist) {
          maxDist = dist;
          index = i;
        }
      }
      if (maxDist > tolSq && index !== -1) {
        keep[index] = true;
        stack.push([start, index]);
        stack.push([index, end]);
      }
    }
    const simplified = path.filter((_, i) => keep[i]);
    if (path.meta) simplified.meta = path.meta;
    return simplified.length >= 2 ? simplified : path;
  };

  const simplifyPathVisvalingam = (path, tolerance) => {
    if (!tolerance || tolerance <= 0 || path.length < 3) return path;
    const areaThreshold = tolerance * tolerance;
    const pts = path.map((pt) => ({ x: pt.x, y: pt.y }));
    const keep = new Array(pts.length).fill(true);
    const area = new Array(pts.length).fill(Infinity);
    const triArea = (a, b, c) =>
      Math.abs(
        (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) / 2
      );

    for (let i = 1; i < pts.length - 1; i++) {
      area[i] = triArea(pts[i - 1], pts[i], pts[i + 1]);
    }

    const findNext = (idx, dir) => {
      let i = idx + dir;
      while (i > 0 && i < pts.length - 1 && !keep[i]) i += dir;
      return i;
    };

    while (true) {
      let minArea = Infinity;
      let minIndex = -1;
      for (let i = 1; i < pts.length - 1; i++) {
        if (!keep[i]) continue;
        if (area[i] < minArea) {
          minArea = area[i];
          minIndex = i;
        }
      }
      if (minIndex === -1 || minArea >= areaThreshold) break;
      keep[minIndex] = false;
      const prev = findNext(minIndex, -1);
      const next = findNext(minIndex, 1);
      if (prev > 0 && next < pts.length) {
        area[prev] = triArea(pts[findNext(prev, -1)], pts[prev], pts[next]);
      }
      if (next < pts.length - 1 && prev >= 0) {
        area[next] = triArea(pts[prev], pts[next], pts[findNext(next, 1)]);
      }
    }

    const simplified = pts.filter((_, i) => keep[i]);
    if (path.meta) simplified.meta = path.meta;
    return simplified.length >= 2 ? simplified : path;
  };

  const countPathPoints = (paths) => {
    let lines = 0;
    let points = 0;
    paths.forEach((path) => {
      if (!Array.isArray(path)) return;
      lines += 1;
      points += path.length;
    });
    return { lines, points };
  };

  const clonePaths = (paths) =>
    (paths || []).map((path) => {
      if (!Array.isArray(path)) return path;
      const next = path.map((pt) => ({ ...pt }));
      if (path.meta) next.meta = { ...path.meta };
      return next;
    });

  class VectorEngine {
    constructor() {
      this.layers = [];
      this.activeLayerId = null;
      this.profileKey = SETTINGS.paperSize || 'a4';
      this.currentProfile = this.resolveProfile();
      this.addLayer('wavetable');
    }

    addLayer(type = 'wavetable') {
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
          groupType: layer.groupType,
          groupParams: layer.groupParams ? JSON.parse(JSON.stringify(layer.groupParams)) : null,
          groupCollapsed: layer.groupCollapsed,
          sourcePaths: layer.sourcePaths ? JSON.parse(JSON.stringify(layer.sourcePaths)) : null,
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
        layer.groupType = data.groupType ?? null;
        layer.groupParams = data.groupParams ? JSON.parse(JSON.stringify(data.groupParams)) : null;
        layer.groupCollapsed = Boolean(data.groupCollapsed);
        layer.sourcePaths = data.sourcePaths ? JSON.parse(JSON.stringify(data.sourcePaths)) : null;
        layer.penId = data.penId ?? layer.penId;
        layer.color = data.color || layer.color;
        layer.strokeWidth = Number.isFinite(data.strokeWidth) ? data.strokeWidth : layer.strokeWidth;
        layer.lineCap = data.lineCap || layer.lineCap;
        layer.visible = data.visible !== false;
        layer.paths = [];
        return layer;
      });
      this.activeLayerId = state.activeLayerId || (this.layers[0] ? this.layers[0].id : null);
      this.layers.forEach((l) => this.generate(l.id));
    }

    duplicateLayer(id) {
      const source = this.layers.find((l) => l.id === id);
      if (!source) return null;
      if (source.isGroup) return null;
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
      layer.parentId = source.parentId ?? null;
      layer.sourcePaths = source.sourcePaths ? JSON.parse(JSON.stringify(source.sourcePaths)) : null;
      layer.color = source.color;
      layer.strokeWidth = source.strokeWidth;
      layer.lineCap = source.lineCap;
      layer.visible = source.visible;
      layer.paths = clonePaths(source.paths);
      const idx = this.layers.findIndex((l) => l.id === id);
      if (idx >= 0) {
        this.layers.splice(idx + 1, 0, layer);
      } else {
        this.layers.push(layer);
      }
      this.activeLayerId = newId;
      return layer;
    }

    removeLayer(id) {
      const target = this.layers.find((l) => l.id === id);
      if (!target) return;
      const drawableCount = this.layers.filter((l) => !l.isGroup).length;
      if (!target.isGroup && drawableCount <= 1) return;
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
        if (remaining === 0) removeIds.add(parentId);
      }
      this.layers = this.layers.filter((l) => !removeIds.has(l.id));
      if (removeIds.has(this.activeLayerId)) {
        this.activeLayerId = this.layers.length ? this.layers[this.layers.length - 1].id : null;
      }
    }

    moveLayer(id, direction) {
      const idx = this.layers.findIndex((l) => l.id === id);
      if (idx === -1) return;
      const newIdx = idx + direction;
      if (newIdx >= 0 && newIdx < this.layers.length) {
        [this.layers[idx], this.layers[newIdx]] = [this.layers[newIdx], this.layers[idx]];
      }
    }

    getActiveLayer() {
      return this.layers.find((l) => l.id === this.activeLayerId);
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
      const p = layer.params;

      const bounds = { width, height, m, dW, dH, truncate: SETTINGS.truncate };

      const algo = Algorithms[layer.type] || Algorithms.flowfield;
      const rawPaths = layer.sourcePaths ? clonePaths(layer.sourcePaths) : algo.generate(p, rng, noise, bounds) || [];
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
        if (!meta || meta.kind !== 'circle') return meta;
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
    }

    getFormula(layerId) {
      const l = this.layers.find((x) => x.id === layerId);
      if (!l) return 'Select a layer...';
      const algo = Algorithms[l.type];
      return algo && algo.formula ? algo.formula(l.params) : 'Procedural Vector Generation';
    }

    getStats() {
      let dist = 0;
      let lines = 0;
      const optimize = Math.max(0, SETTINGS.plotterOptimize ?? 0);
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
      const pathLength = (path) => {
        if (path && path.meta && path.meta.kind === 'circle') {
          const r = path.meta.r ?? path.meta.rx ?? 0;
          return Math.max(0, 2 * Math.PI * r);
        }
        if (!Array.isArray(path)) return 0;
        let len = 0;
        for (let i = 1; i < path.length; i++) {
          const dx = path[i].x - path[i - 1].x;
          const dy = path[i].y - path[i - 1].y;
          len += Math.sqrt(dx * dx + dy * dy);
        }
        return len;
      };
      this.layers.forEach((l) => {
        if (!l.visible) return;
        const penId = l.penId || 'default';
        let seen = null;
        if (dedupe) {
          if (!dedupe.has(penId)) dedupe.set(penId, new Set());
          seen = dedupe.get(penId);
        }
        l.paths.forEach((p) => {
          if (seen) {
            const key = pathKey(p);
            if (key && seen.has(key)) return;
            if (key) seen.add(key);
          }
          dist += pathLength(p);
          lines += 1;
        });
      });
      const timeSec = dist / 1000 / (SETTINGS.speedDown / 1000);
      const m = Math.floor(timeSec / 60);
      const s = Math.floor(timeSec % 60);
      return { distance: Math.round(dist / 1000) + 'm', time: `${m}:${s.toString().padStart(2, '0')}`, lines };
    }
  }

  window.Vectura = window.Vectura || {};
  window.Vectura.VectorEngine = VectorEngine;
})();
