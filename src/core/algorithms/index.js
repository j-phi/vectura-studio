/**
 * Procedural algorithm registry assembler.
 */
(() => {
  window.Vectura = window.Vectura || {};
  const registry = window.Vectura.AlgorithmRegistry || {};
  const PetalisAlgorithm = window.Vectura?.PetalisAlgorithm;
  const petalisFallback =
    PetalisAlgorithm ||
    {
      generate: () => [],
      formula: () => 'Petalis algorithm not loaded.',
    };

  window.Vectura.Algorithms = {
    ...registry,
    petalis: registry.petalis || petalisFallback,
    petalisDesigner: registry.petalisDesigner || registry.petalis || petalisFallback,
  };
})();
