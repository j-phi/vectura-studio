/**
 * sceneGround3d algorithm — Scene-tree Increment E (data-only leaf layer).
 *
 * A sceneGround3d layer stands in for the scene GROUND fixture. Its presence
 * (and enabled flag) turns the ground on; the scene group (Increment B/E) maps
 * it back to params.ground and the shared compositor draws the ground plane +
 * cast shadows. The container itself draws NOTHING — `generate` returns [].
 *
 * Mirrors booleanGroup3d's stub: register the type + a no-op generate so the
 * layer round-trips through serialization even outside a scene group.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};

  window.Vectura.AlgorithmRegistry.sceneGround3d = {
    generate: () => [],
    formula: () => '3D scene ground: the scene group draws the ground plane + cast shadows.',
  };
})();
