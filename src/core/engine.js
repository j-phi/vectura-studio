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

  class VectorEngine {
    constructor() {
      this.layers = [];
      this.activeLayerId = null;
      this.currentProfile = MACHINES.a3;
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
      layer.color = source.color;
      layer.strokeWidth = source.strokeWidth;
      layer.lineCap = source.lineCap;
      layer.visible = source.visible;
      layer.paths = source.paths.map((path) => {
        if (!Array.isArray(path)) return path;
        const next = path.map((pt) => ({ ...pt }));
        if (path.meta) next.meta = { ...path.meta };
        return next;
      });
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
      if (this.layers.length <= 1) return;
      this.layers = this.layers.filter((l) => l.id !== id);
      if (this.activeLayerId === id) this.activeLayerId = this.layers[this.layers.length - 1].id;
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

    setProfile(key) {
      this.currentProfile = MACHINES[key] || MACHINES.a3;
    }

    generate(layerId) {
      const layer = this.layers.find((l) => l.id === layerId);
      if (!layer) return;

      const rng = new SeededRNG(layer.params.seed);
      const noise = new SimpleNoise(layer.params.seed);

      const { width, height } = this.currentProfile;
      const m = SETTINGS.margin;
      const dW = width - m * 2;
      const dH = height - m * 2;
      const p = layer.params;

      const bounds = { width, height, m, dW, dH, truncate: SETTINGS.truncate };

      const algo = Algorithms[layer.type] || Algorithms.flowfield;
      const rawPaths = algo.generate(p, rng, noise, bounds) || [];
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
        finalPaths = transformed.map((path) => {
          if (!Array.isArray(path)) return path;
          if (path.meta && path.meta.kind === 'circle') return path;
          return simplifyPath(path, tol);
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
      this.layers.forEach((l) => {
        if (!l.visible) return;
        l.paths.forEach((p) => {
          for (let i = 1; i < p.length; i++) {
            const dx = p[i].x - p[i - 1].x;
            const dy = p[i].y - p[i - 1].y;
            dist += Math.sqrt(dx * dx + dy * dy);
          }
        });
      });
      const timeSec = dist / 1000 / (SETTINGS.speedDown / 1000);
      const m = Math.floor(timeSec / 60);
      const s = Math.floor(timeSec % 60);
      return { distance: Math.round(dist / 1000) + 'm', time: `${m}:${s.toString().padStart(2, '0')}` };
    }
  }

  window.Vectura = window.Vectura || {};
  window.Vectura.VectorEngine = VectorEngine;
})();
