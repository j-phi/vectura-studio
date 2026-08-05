/**
 * sceneLight3d algorithm — Scene-tree Increment E (data-only leaf layer).
 *
 * A sceneLight3d layer carries exactly ONE lights[] entry (the sun / a point /
 * spot / area / ambient light). It owns no drawn geometry: the scene group
 * (Increment B/E) COLLECTS it back into params.lights and runs the single
 * shared HLR / lighting / shadow pass, which is what actually shades the scene.
 * The container therefore emits NOTHING — `generate` returns [].
 *
 * Mirrors booleanGroup3d's stub: register the type + a no-op generate so the
 * layer round-trips through serialization even outside a scene group.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};

  window.Vectura.AlgorithmRegistry.sceneLight3d = {
    generate: () => [],
    formula: (p = {}) => {
      const type = typeof p.type === 'string' && p.type ? p.type : 'directional';
      return `3D scene light (${type}): shades the scene group; the light itself draws no paths.`;
    },
  };
})();
