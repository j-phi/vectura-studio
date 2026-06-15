/**
 * Randomization bias methods for the UI class — mixed into UI.prototype by ui.js.
 * randomizeLayerParams() stays in ui.js since it captures large IIFE-local noise-def arrays.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  const { clamp } = window.Vectura.AlgorithmUtils;

  window.Vectura._UIRandomizationMixin = {
    applyRandomizationBias(layer) {
      if (!layer || !layer.params) return;
      if (layer.type === 'shapePack') {
        this.applyShapePackRandomBias(layer.params);
      } else if (layer.type === 'petalisDesigner') {
        this.applyPetalisRandomBias(layer.params);
      } else if (layer.type === 'rainfall') {
        this.applyRainfallRandomBias(layer.params);
      } else if (layer.type === 'lissajous') {
        this.applyLissajousRandomBias(layer.params);
      } else if (layer.type === 'pattern') {
        this.applyPatternRandomBias(layer.params);
      }
    },

    applyShapePackRandomBias(params) {
      params.count = Math.round(clamp(params.count ?? 320, 220, 760));
      params.attempts = Math.round(clamp(params.attempts ?? 1800, 900, 5000));
      params.padding = clamp(params.padding ?? 1, 0, 2.5);
      const minR = clamp(params.minR ?? 1.5, 0.5, 9);
      const maxR = clamp(params.maxR ?? 16, minR + 2, 42);
      params.minR = minR;
      params.maxR = maxR;
      params.perspective = clamp(params.perspective ?? 0, -0.35, 0.45);
      if (Math.random() < 0.15) {
        params.maxR = clamp(params.maxR * 1.35, params.minR + 2, 55);
        params.count = Math.round(clamp(params.count * 0.8, 160, 760));
      }
    },

    applyPetalisRandomBias(params) {
      const rnd = () => Math.random();
      const between = (lo, hi) => lo + rnd() * (hi - lo);
      const intBetween = (lo, hi) => Math.round(between(lo, hi));
      const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

      params.petalSteps = intBetween(28, 48);
      params.centerType = pick(['disk', 'disk', 'dome', 'starburst', 'dot']);
      params.centerDensity = Math.round(clamp(params.centerDensity ?? 40, 6, 85));
      params.connectorCount = Math.round(clamp(params.connectorCount ?? 20, 4, 70));
      params.petalAsymmetry = rnd() < 0.55 ? intBetween(0, 45) : 0;

      // Roughly half clean few-petal whorls, half dense phyllotactic blooms.
      if (rnd() < 0.55) {
        // WHORL flower — a clean, recognizable bloom.
        params.layoutMode = 'whorl';
        params.ringMode = 'dual';
        params.petalProfile = pick(['oval', 'rounded', 'teardrop', 'heart', 'spatulate', 'spoon', 'lanceolate', 'marquise', 'notched']);
        const single = rnd() < 0.55;
        params.innerCount = single ? 0 : intBetween(3, 8);
        params.outerCount = single ? intBetween(5, 13) : intBetween(5, 14);
        params.ringSplit = clamp(between(0.3, 0.7), 0.15, 0.85);
        params.ringOffset = params.innerCount > 0 && rnd() < 0.6 ? Math.round(360 / Math.max(1, params.outerCount) / 2) : 0;
        params.petalScale = intBetween(26, 42);
        params.petalWidthRatio = clamp(between(0.6, 0.95), 0.2, 1.4);
        params.bloom = intBetween(55, 100);
        // Sometimes cup the whorl for a volumetric, incurved corolla read.
        params.petalCupping = rnd() < 0.45 ? intBetween(15, 60) : 0;
        // Often dress sparse whorls with venation.
        if (rnd() < 0.45) {
          params.shadings = [{
            id: 'designer-shade-1', enabled: true, type: 'vein', target: 'both',
            veinCount: intBetween(3, 6), veinReach: clamp(between(0.5, 0.7), 0.1, 0.95),
            lineType: 'solid', lineSpacing: 1, density: 1, widthX: 100, widthY: 100,
            posX: 50, posY: 50, gapX: 0, gapY: 0, gapPosX: 50, gapPosY: 50, jitter: 0, lengthJitter: 0, angle: 0,
          }];
        } else {
          params.shadings = [];
        }
      } else {
        // SPIRAL bloom — dense, phyllotactic (golden angle is correct here).
        params.layoutMode = 'spiral';
        params.ringMode = 'dual';
        params.petalProfile = pick(['lanceolate', 'teardrop', 'dagger', 'oval', 'spoon']);
        params.innerCount = intBetween(40, 180);
        params.outerCount = intBetween(60, 260);
        params.spiralTightness = clamp(between(0.8, 3.5), 0.7, 5);
        params.radialGrowth = clamp(between(0.5, 2.6), 0.25, 3.2);
        params.ringSplit = clamp(between(0.3, 0.55), 0.15, 0.85);
        params.petalScale = intBetween(18, 30);
        params.petalWidthRatio = clamp(between(0.45, 0.8), 0.2, 1.4);
        params.bloom = 100;
        params.petalCupping = 0;
        params.shadings = [];
        const sum = params.innerCount + params.outerCount;
        if (sum > 420) {
          const ratio = 420 / sum;
          params.innerCount = Math.max(20, Math.round(params.innerCount * ratio));
          params.outerCount = Math.max(30, Math.round(params.outerCount * ratio));
        }
      }
    },

    applyRainfallRandomBias(params) {
      params.count = Math.round(clamp(params.count ?? 320, 60, 900));
      params.traceLength = Math.round(clamp(params.traceLength ?? 90, 30, 190));
      params.traceStep = Math.round(clamp(params.traceStep ?? 5, 2, 12));
      params.dropSize = clamp(params.dropSize ?? 2, 0, 6);
      params.fillDensity = clamp(params.fillDensity ?? 1.2, 0.1, 3.5);
      params.widthMultiplier = Math.round(clamp(params.widthMultiplier ?? 1, 1, 3));
      params.turbulence = clamp(params.turbulence ?? 0.2, 0, 0.9);
      params.gustStrength = clamp(params.gustStrength ?? 0.2, 0, 0.75);
      if (Math.random() < 0.18) {
        params.count = Math.round(clamp(params.count * 1.2, 60, 1200));
        params.traceLength = Math.round(clamp(params.traceLength * 1.15, 30, 240));
      }
    },

    applyPatternRandomBias(params) {
      const bundled = window.Vectura?.BUNDLED_PATTERNS || window.Vectura?.PATTERNS || [];
      const userPatterns = window.Vectura?.PatternRegistry?.getCustomPatterns?.() || [];
      const pool = [...bundled, ...userPatterns];
      const filter = params.patternFilter || 'all';
      const candidates = filter === 'lines' ? pool.filter((p) => p.lines) :
                         filter === 'fills' ? pool.filter((p) => p.fills) :
                         pool;
      const available = candidates.length ? candidates : pool;
      if (available.length) {
        params.patternId = available[Math.floor(Math.random() * available.length)].id;
      }
    },

    applyLissajousRandomBias(params) {
      const interestingPairs = [
        [3, 4],
        [5, 7],
        [7, 9],
        [4, 9],
        [2.5, 7.5],
        [6, 11],
        [3.5, 8.5],
      ];
      const pair = interestingPairs[Math.floor(Math.random() * interestingPairs.length)] || [3, 4];
      const xJitter = (Math.random() - 0.5) * 1.4;
      const yJitter = (Math.random() - 0.5) * 1.4;
      params.freqX = clamp(pair[0] + xJitter, 0.5, 12);
      params.freqY = clamp(pair[1] + yJitter, 0.5, 12);
      if (Math.abs(params.freqX - params.freqY) < 0.6) {
        params.freqY = clamp(params.freqY + 1.2, 0.5, 12);
      }
      params.resolution = Math.round(clamp(params.resolution ?? 320, 220, 800));
      params.damping = clamp(params.damping ?? 0.002, 0.0002, 0.0058);
      params.scale = clamp(params.scale ?? 0.8, 0.35, 1.15);
      params.phase = clamp(params.phase ?? 0, 0, Math.PI * 2);
      params.closeLines = Math.random() > 0.25;
    },
  };
})();
