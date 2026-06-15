/**
 * Preloaded noise images for the Raster-Plane algorithm.
 *
 * Each entry is a Noise Rack `noise` descriptor — the SAME schema the universal
 * noise rack authors — so `NoiseImageRender` reproduces the exact field a noise
 * stack would for these params. The rasterPlane source widget renders a
 * thumbnail per entry and, on selection, stores the descriptor on the layer so
 * the source reloads deterministically (no embedded pixels needed for noise).
 *
 * `renderSpan` controls how much world space maps across the image; lower zoom
 * with a larger span yields broader features. Tune per-preset for a pleasing
 * relief at the default 384px source resolution.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});

  const NOISE_IMAGE_PRESETS = [
    {
      id: 'simplex-hills',
      label: 'Hills',
      noise: { type: 'simplex', zoom: 0.018, octaves: 4, gain: 0.55, lacunarity: 2, renderSpan: 512 },
    },
    {
      id: 'ridged-mountains',
      label: 'Mountains',
      noise: { type: 'ridged', zoom: 0.014, octaves: 5, gain: 0.5, lacunarity: 2.1, renderSpan: 512 },
    },
    {
      id: 'billow-clouds',
      label: 'Clouds',
      noise: { type: 'billow', zoom: 0.01, octaves: 4, gain: 0.5, lacunarity: 2, renderSpan: 512 },
    },
    {
      id: 'turbulence',
      label: 'Turbulence',
      noise: { type: 'turbulence', zoom: 0.02, octaves: 5, gain: 0.55, lacunarity: 2, renderSpan: 512 },
    },
    {
      id: 'marble',
      label: 'Marble',
      noise: { type: 'marble', zoom: 0.012, octaves: 3, gain: 0.5, lacunarity: 2, renderSpan: 512 },
    },
    {
      id: 'dunes',
      label: 'Dunes',
      noise: { type: 'dunes', zoom: 0.02, octaves: 3, gain: 0.5, lacunarity: 2, renderSpan: 512 },
    },
    {
      id: 'cellular',
      label: 'Cellular',
      noise: { type: 'cellular', zoom: 0.03, cellularScale: 1, cellularJitter: 1, renderSpan: 512 },
    },
    {
      id: 'voronoi',
      label: 'Voronoi',
      noise: { type: 'voronoi', zoom: 0.035, cellularScale: 1, cellularJitter: 0.9, renderSpan: 512 },
    },
    {
      id: 'crackle',
      label: 'Crackle',
      noise: { type: 'crackle', zoom: 0.03, cellularScale: 1, cellularJitter: 1, renderSpan: 512 },
    },
    {
      id: 'warp',
      label: 'Warp',
      noise: { type: 'warp', zoom: 0.02, octaves: 3, gain: 0.5, warpStrength: 1.2, renderSpan: 512 },
    },
    {
      id: 'swirl',
      label: 'Swirl',
      noise: { type: 'swirl', zoom: 0.02, patternScale: 1, renderSpan: 512 },
    },
    {
      id: 'ripple',
      label: 'Ripple',
      noise: { type: 'ripple', zoom: 0.04, patternScale: 1, renderSpan: 512 },
    },
  ];

  Vectura.NOISE_IMAGE_PRESETS = NOISE_IMAGE_PRESETS;
})();
