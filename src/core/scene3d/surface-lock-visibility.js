/**
 * Scene3D.SurfaceLockVisibility — per-frame visibility from a cached object-space mesh: face-id/depth buffer occlusion and the per-frame outline (contract §7, §13).
 *
 * SCAFFOLD STUB (docs/surface-lock-contract.md). Owned by work unit W1-E of the surface-lock plan.
 * Until that unit lands, supports() is false everywhere, so no style ever reaches this module and
 * every pose-mode render is unchanged. The other exports throw so a premature caller fails loudly.
 */
(function registerScene3DSurfaceLockVisibility() {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const Scene3D = (Vectura.Scene3D = Vectura.Scene3D || {});
  const notImplemented = (name) => () => { throw new Error('SurfaceLockVisibility.' + name + ': not implemented (surface-lock unit W1-E)'); };

  Scene3D.SurfaceLockVisibility = {
    supports: () => false,
    meshBake: notImplemented('meshBake'),
    occluder: notImplemented('occluder'),
    outline: notImplemented('outline'),
  };
})();
