/**
 * Procedural algorithm registry assembler.
 */
(() => {
  window.Vectura = window.Vectura || {};
  const registry = window.Vectura.AlgorithmRegistry || {};
  const PetalisAlgorithm = window.Vectura?.PetalisAlgorithm;
  const petalisDesignerFallback =
    PetalisAlgorithm ||
    {
      generate: () => [],
      formula: () => 'Petalis Designer algorithm not loaded.',
    };

  window.Vectura.Algorithms = {
    ...registry,
    petalisDesigner: registry.petalisDesigner || petalisDesignerFallback,
  };
})();
