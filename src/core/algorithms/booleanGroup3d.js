/**
 * booleanGroup3d algorithm — Scene-tree Increment A (container stub).
 *
 * A booleanGroup3d layer is a CONTAINER for a CSG set: it owns the boolean op
 * plus the fused-result Style / Tone / Border / visibility. Its children are
 * object3d leaves (each with a per-child role); the scene group (Increment B)
 * combines them into one carved pseudo-object and feeds it to the shared
 * compositor. The container itself emits NOTHING — `generate` returns [].
 *
 * isGroup / containerRole handling arrives with the panel/engine increments;
 * here we register only the type + a no-op generate so the layer round-trips.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};

  window.Vectura.AlgorithmRegistry.booleanGroup3d = {
    generate: () => [],
    formula: (p = {}) => {
      const op = typeof p.op === 'string' && p.op ? p.op : 'subtract';
      return `3D boolean group (${op}): fused by the scene group; the container emits no paths itself.`;
    },
  };
})();
