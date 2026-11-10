/**
 * Scene3D.SurfaceLock — surface-locked fills: bake once, frame per pose (docs/surface-lock-contract.md).
 *
 *   effectiveMarkSpace(style, ctx) -> 'pose' | 'surface'     contract §12
 *   bakerFor(spec) -> baker | null                            contract §9 (BAKER_KEYS order)
 *   bakeKey(spec) -> string                                   contract §8
 *   bake(spec) -> MarkSet (cached)                            contract §8, §9
 *   poseOf(transform, camera, bounds) -> Pose                 contract §4
 *   frame(markSets, pose, view) -> lines                      contract §5-§7 (Level F output, §6.1)
 *   frameable(p, bounds) -> boolean                           contract §13 (Level S gate)
 *   sceneFrame(p, bounds, ctx) -> paths                       contract §13 (Level S output, §6.2)
 *   stats, resetStats(), clearCache()                         contract §11
 *
 * SCAFFOLD STUB. Owned by work unit W1-A (core frame pipeline). Until it lands, effectiveMarkSpace is
 * always 'pose' and frameable is always false, so no render reaches bake/frame/sceneFrame.
 */
(function registerSceneSurfaceLock() {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const Scene3D = (Vectura.Scene3D = Vectura.Scene3D || {});
  const notImplemented = (name) => () => { throw new Error(`SurfaceLock.${name}: not implemented (surface-lock unit W1-A)`); };

  // Dispatch order (contract §9): the first baker whose supports(spec) is true bakes the spec.
  // Each is its own Scene3D namespace so Engine's sceneModuleFingerprint sees its functions.
  const BAKER_KEYS = Object.freeze(['SurfaceLockMezzo', 'SurfaceLockLadder', 'SurfaceLockLaws', 'SurfaceLockFaceted']);

  const freshStats = () => ({
    bakes: 0, bakeHits: 0, bakeMisses: 0, frames: 0, sceneFrames: 0,
    verticesIn: 0, verticesOut: 0, runsIn: 0, runsOut: 0,
    culledFacing: 0, culledGrazing: 0, culledTone: 0, culledOccluded: 0,
    msBake: 0, msFrame: 0, msFrameLast: 0, cacheBytes: 0, cacheEntries: 0, evictions: 0,
  });
  const stats = freshStats();
  const resetStats = () => { Object.assign(stats, freshStats()); return stats; };

  Scene3D.SurfaceLock = {
    VERSION: 0,
    BAKER_KEYS,
    stats,
    resetStats,
    effectiveMarkSpace: () => 'pose',
    bakerFor: () => null,
    frameable: () => false,
    bakeKey: notImplemented('bakeKey'),
    bake: notImplemented('bake'),
    poseOf: notImplemented('poseOf'),
    frame: notImplemented('frame'),
    sceneFrame: notImplemented('sceneFrame'),
    clearCache: () => {},
  };
})();
