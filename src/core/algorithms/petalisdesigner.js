/**
 * Petalis Designer algorithm definition.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};
  const PetalisAlgorithm = window.Vectura?.PetalisAlgorithm;
  const enforceDesignerParams = (params) => {
    const source = params || {};
    const widthRatio = Number.isFinite(source.petalWidthRatio) ? source.petalWidthRatio : 1;
    return {
      ...source,
      label: 'Petalis Designer',
      ringMode: 'dual',
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
      formula: () => 'Petalis Designer algorithm not loaded.',
    };
})();
