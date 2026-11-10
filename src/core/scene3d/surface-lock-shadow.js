/**
 * Scene3D.SurfaceLockShadow — the world-locked ground cast shadow and (later) the light-space receive map (contract §10).
 *
 * SCAFFOLD STUB (docs/surface-lock-contract.md). Owned by work unit W1-B of the surface-lock plan.
 * Until that unit lands, supports() is false everywhere, so no style ever reaches this module and
 * every pose-mode render is unchanged. The other exports throw so a premature caller fails loudly.
 */
(function registerScene3DSurfaceLockShadow() {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const Scene3D = (Vectura.Scene3D = Vectura.Scene3D || {});
  const notImplemented = (name) => () => { throw new Error('SurfaceLockShadow.' + name + ': not implemented (surface-lock unit W1-B)'); };

  Scene3D.SurfaceLockShadow = {
    supports: () => false,
    bakeGround: notImplemented('bakeGround'),
    frameShadow: notImplemented('frameShadow'),
    receiveMap: notImplemented('receiveMap'),
  };
})();
