/**
 * Petalis Designer algorithm definition.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};
  const PetalisAlgorithm = window.Vectura?.PetalisAlgorithm;
  window.Vectura.AlgorithmRegistry.petalisDesigner =
    PetalisAlgorithm ||
    {
      generate: () => [],
      formula: () => 'Petalis algorithm not loaded.',
    };
})();
