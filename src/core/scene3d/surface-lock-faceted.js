/**
 * Scene3D.SurfaceLockFaceted — the per-face bakers for box, plane, polyhedron, CSG and mesh objects (contract §9, §7).
 *
 * SCAFFOLD STUB (docs/surface-lock-contract.md). Owned by work unit W3-C of the surface-lock plan.
 * Until that unit lands, supports() is false everywhere, so no style ever reaches this module and
 * every pose-mode render is unchanged. The other exports throw so a premature caller fails loudly.
 */
(function registerScene3DSurfaceLockFaceted() {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const Scene3D = (Vectura.Scene3D = Vectura.Scene3D || {});
  const notImplemented = (name) => () => { throw new Error('SurfaceLockFaceted.' + name + ': not implemented (surface-lock unit W3-C)'); };

  Scene3D.SurfaceLockFaceted = {
    id: 'faceted',
    FIT: Object.freeze([]),
    supports: () => false,
    bake: notImplemented('bake'),
    toneLUT: notImplemented('toneLUT'),
  };
})();
