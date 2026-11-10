/**
 * Scene3D.SurfaceLockMezzo — the surface-locked mezzotint baker (lawMezzoLocked, contract §9).
 *
 * SCAFFOLD STUB (docs/surface-lock-contract.md). Owned by work unit W1-C of the surface-lock plan.
 * Until that unit lands, supports() is false everywhere, so no style ever reaches this module and
 * every pose-mode render is unchanged. The other exports throw so a premature caller fails loudly.
 */
(function registerScene3DSurfaceLockMezzo() {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const Scene3D = (Vectura.Scene3D = Vectura.Scene3D || {});
  const notImplemented = (name) => () => { throw new Error('SurfaceLockMezzo.' + name + ': not implemented (surface-lock unit W1-C)'); };

  Scene3D.SurfaceLockMezzo = {
    id: 'mezzo',
    // FIT rows this baker serves (contract §12). Empty until the unit lands.
    FIT: Object.freeze([]),
    supports: () => false,
    bake: notImplemented('bake'),
    toneLUT: notImplemented('toneLUT'),
  };
})();
