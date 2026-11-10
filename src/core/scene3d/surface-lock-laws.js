/**
 * Scene3D.SurfaceLockLaws — the remaining good-fit tone laws on locked rulings (dutyConst, endShorten, creviceAO, ... contract §12).
 *
 * SCAFFOLD STUB (docs/surface-lock-contract.md). Owned by work unit W3-D of the surface-lock plan.
 * Until that unit lands, supports() is false everywhere, so no style ever reaches this module and
 * every pose-mode render is unchanged. The other exports throw so a premature caller fails loudly.
 */
(function registerScene3DSurfaceLockLaws() {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const Scene3D = (Vectura.Scene3D = Vectura.Scene3D || {});
  const notImplemented = (name) => () => { throw new Error('SurfaceLockLaws.' + name + ': not implemented (surface-lock unit W3-D)'); };

  Scene3D.SurfaceLockLaws = {
    id: 'laws',
    FIT: Object.freeze([]),
    supports: () => false,
    bake: notImplemented('bake'),
    toneLUT: notImplemented('toneLUT'),
  };
})();
