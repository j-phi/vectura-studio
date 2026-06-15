/**
 * Petalis algorithm definition.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};
  const PetalisAlgorithm = window.Vectura?.PetalisAlgorithm;
  const enforceDesignerParams = (params) => {
    const source = params || {};
    const widthRatio = Number.isFinite(source.petalWidthRatio) ? source.petalWidthRatio : 1;
    return {
      ...source,
      label: 'Petalis',
      ringMode: 'dual',
      // Whorl is the default layout (clean concentric rings). Spiral is opt-in
      // for dense composites. Whorl operates inside the 2-band dual structure.
      layoutMode: source.layoutMode === 'spiral' ? 'spiral' : 'whorl',
      useDesignerShapeOnly: true,
      petalWidthRatio: widthRatio,
      petalLengthRatio: 1,
      petalSizeRatio: 1,
      leafSidePos: 0.45,
      leafSideWidth: 1,
      edgeWaveAmp: 0,
      edgeWaveFreq: 0,
      centerWaveBoost: 0,
      centerSizeMorph: 0,
      centerSizeCurve: 1,
      centerShapeMorph: 0,
      centerProfile: null,
    };
  };
  window.Vectura.AlgorithmRegistry.petalisDesigner = PetalisAlgorithm
    ? {
      generate: (params, rng, noise, bounds) =>
        PetalisAlgorithm.generate(enforceDesignerParams(params), rng, noise, bounds),
      formula: (params) =>
        PetalisAlgorithm.formula
          ? PetalisAlgorithm.formula(enforceDesignerParams(params))
          : '',
    }
    : {
      generate: () => [],
      formula: () => 'Petalis algorithm not loaded.',
    };
})();
