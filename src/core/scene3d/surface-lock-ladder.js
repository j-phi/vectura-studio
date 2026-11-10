/**
 * Scene3D.SurfaceLockLadder — the surface-locked ladder-family bakers: hatch, crosshatch, contour, spiral, stipple (contract §9).
 *
 * SCAFFOLD STUB (docs/surface-lock-contract.md). Owned by work unit W1-D of the surface-lock plan.
 * Until that unit lands, supports() is false everywhere, so no style ever reaches this module and
 * every pose-mode render is unchanged. The other exports throw so a premature caller fails loudly.
 */
(function registerScene3DSurfaceLockLadder() {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const Scene3D = (Vectura.Scene3D = Vectura.Scene3D || {});
  const notImplemented = (name) => () => { throw new Error('SurfaceLockLadder.' + name + ': not implemented (surface-lock unit W1-D)'); };

  Scene3D.SurfaceLockLadder = {
    id: 'ladder',
    FIT: Object.freeze([]),
    supports: () => false,
    bake: notImplemented('bake'),
    toneLUT: notImplemented('toneLUT'),
  };
})();
