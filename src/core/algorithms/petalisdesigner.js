/**
 * Petalis Designer algorithm definition.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};
  const PetalisAlgorithm = window.Vectura?.PetalisAlgorithm;
  const enforceDesignerParams = (params) => ({
    ...(params || {}),
    label: 'Petalis Designer',
    ringMode: 'dual',
    useDesignerShapeOnly: true,
  });
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
