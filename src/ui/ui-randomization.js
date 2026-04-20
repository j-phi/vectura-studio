/**
 * Randomization bias methods for the UI class — mixed into UI.prototype by ui.js.
 * randomizeLayerParams() stays in ui.js since it captures large IIFE-local noise-def arrays.
 */
(() => {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  window.Vectura = window.Vectura || {};
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
      params.petalSteps = Math.round(clamp(params.petalSteps ?? 32, 14, 44));
      params.count = Math.round(clamp(params.count ?? 240, 40, 360));
      params.innerCount = Math.round(clamp(params.innerCount ?? 110, 20, 190));
      params.outerCount = Math.round(clamp(params.outerCount ?? 170, 30, 250));
      params.spiralTightness = clamp(params.spiralTightness ?? 1.2, 0.7, 5);
      params.radialGrowth = clamp(params.radialGrowth ?? 1, 0.25, 3.2);
      params.centerDensity = Math.round(clamp(params.centerDensity ?? 40, 6, 85));
      params.connectorCount = Math.round(clamp(params.connectorCount ?? 20, 4, 70));
      const designerDual = Boolean(
        params.useDesignerShapeOnly || params.label === 'Petalis' || params.label === 'Petalis Designer'
      );
      const dualRings = designerDual ? true : params.ringMode === 'dual';
      if (dualRings) {
        const sum = (params.innerCount || 0) + (params.outerCount || 0);
        const maxDual = 420;
        if (sum > maxDual) {
          const ratio = maxDual / Math.max(1, sum);
          params.innerCount = Math.max(20, Math.round(params.innerCount * ratio));
          params.outerCount = Math.max(30, Math.round(params.outerCount * ratio));
        }
      }
      if (Math.random() < 0.12) {
        params.count = Math.round(clamp(params.count * 1.35, 60, 520));
        params.petalSteps = Math.round(clamp(params.petalSteps + 6, 14, 56));
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
