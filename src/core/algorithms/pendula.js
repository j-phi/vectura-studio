/**
 * pendula algorithm definition.
 *
 * Kinetic-harmonograph studio. Renders identically to the harmonograph
 * algorithm by delegating to its registered generator, so the two stay in
 * lock-step without duplicating the damped multi-pendulum evaluator or the
 * line/points/segments/dashed render modes (including the pendulum-guide
 * helpers attached to the returned path array). What makes Pendula its own
 * algorithm is the studio experience layered on top in the UI — the live,
 * looping virtual plotter and the Motion Rack (temporal LFOs assigned to
 * parameters via layer.params.motion) — not a different static formula.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};

  const resolveHarmonograph = () => window.Vectura?.AlgorithmRegistry?.harmonograph || null;

  window.Vectura.AlgorithmRegistry.pendula = {
    generate: (p, rng, noise, bounds) => {
      const harmonograph = resolveHarmonograph();
      if (!harmonograph || typeof harmonograph.generate !== 'function') {
        // harmonograph.js has not registered yet (load order / partial init).
        // Fail soft with an empty render rather than throwing.
        return [];
      }
      // Delegate verbatim. The returned value is the same array instance the
      // harmonograph generator builds, so any `.helpers` / `.meta` it attaches
      // (e.g. showPendulumGuides) flows through untouched — do NOT clone it.
      return harmonograph.generate(p, rng, noise, bounds);
    },
    formula: (p) => {
      const harmonograph = resolveHarmonograph();
      if (harmonograph && typeof harmonograph.formula === 'function') {
        return harmonograph.formula(p);
      }
      return `x = Σ Aᵢ sin((fᵢ+μᵢ)t + φxᵢ) e^(-dᵢ t)\ny = Σ Bᵢ sin((fᵢ+μᵢ)t + φyᵢ) e^(-dᵢ t)`;
    },
  };
})();
