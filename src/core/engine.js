/**
 * Core vector generation engine.
 */
(() => {
  const { MACHINES, SETTINGS, Algorithms, SeededRNG, SimpleNoise, Layer } = window.Vectura || {};

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
      const prettyType = type.charAt(0).toUpperCase() + type.slice(1);
      const name = `${prettyType} ${num}`;
      const layer = new Layer(id, type, name);
      this.layers.push(layer);
      this.activeLayerId = id;
      this.generate(id);
      return id;
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

      const transform = (pt) => {
        const cx = width / 2;
        const cy = height / 2;
        let x = pt.x - cx;
        let y = pt.y - cy;
        x *= p.scaleX;
        y *= p.scaleY;
        x += cx + p.posX;
        y += cy + p.posY;
        return { x, y };
      };

      const algo = Algorithms[layer.type] || Algorithms.flowfield;
      const rawPaths = algo.generate(p, rng, noise, bounds);
      const smooth = Math.max(0, Math.min(1, p.smoothing ?? 0));
      layer.paths = rawPaths.map((path) => smoothPath(path.map((pt) => transform(pt)), smooth));
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
