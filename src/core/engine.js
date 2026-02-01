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

  class VectorEngine {
    constructor() {
      this.layers = [];
      this.activeLayerId = null;
      this.currentProfile = MACHINES.a3;
      this.addLayer('flowfield');
    }

    addLayer(type = 'flowfield') {
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

      const bounds = { width, height, m, dW, dH };

      const rot = ((p.rotation ?? 0) * Math.PI) / 180;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);

      const transform = (pt) => {
        const cx = width / 2;
        const cy = height / 2;
        let x = pt.x - cx;
        let y = pt.y - cy;
        x *= p.scaleX;
        y *= p.scaleY;
        const rx = x * cosR - y * sinR;
        const ry = x * sinR + y * cosR;
        x = rx + cx + p.posX;
        y = ry + cy + p.posY;
        return { x, y };
      };

      const algo = Algorithms[layer.type] || Algorithms.flowfield;
      const rawPaths = algo.generate(p, rng, noise, bounds) || [];
      const smooth = Math.max(0, Math.min(1, p.smoothing ?? 0));

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

      layer.paths = rawPaths.map((path) => {
        if (!Array.isArray(path)) return path;
        const transformed = path.map((pt) => transform(pt));
        if (path.meta) transformed.meta = transformMeta(path.meta);
        return smoothPath(transformed, smooth);
      });
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
