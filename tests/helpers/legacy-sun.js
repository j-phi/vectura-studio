/*
 * Pre-v7 sun for fixtures that are about something other than the default light.
 *
 * A NEW scene's key light is the v7 front key (az 330 / el 40, camera-space z ~ +0.58). Many older
 * suites were tuned (thresholds, golden coverage tables, fixture geometry) against the pre-v7 default
 * sun (az 135 / el 45, camera-space z ~ -0.7, i.e. BEHIND the subject). Those suites pin the old sun
 * in their fixture so their assertions keep their meaning; they do not assert the default itself.
 * Suites that DO assert the default light (scene3d-front-key-light, scene3d-tone-model-migration)
 * must not use this.
 */
const LEGACY_SUN = Object.freeze({ azimuth: 135, elevation: 45 });

// Apply to a scene built with engine.addLayer('scene3d') / addSceneTree(): every directional light
// child (the tree sun) and any inline lights[] entry. Returns the group layer.
const pinLegacySun = (engine, gid) => {
  const group = engine.getLayerById(gid);
  const apply = (l) => { if (l && (l.type === undefined || l.type === 'directional')) { l.azimuth = LEGACY_SUN.azimuth; l.elevation = LEGACY_SUN.elevation; } };
  engine.getLayerDescendants(gid).filter((l) => l && l.type === 'sceneLight3d').forEach((l) => apply(l.params));
  if (group && group.params && Array.isArray(group.params.lights)) group.params.lights.forEach(apply);
  return group;
};

// For fixtures built from a clone of ALGO_DEFAULTS.scene3d (inline lights[]): the same lights with every
// directional sun moved to the pre-v7 angles.
const legacyLights = (lights) => (Array.isArray(lights) ? lights : []).map((l) => (
  l && (l.type === undefined || l.type === 'directional') ? { ...l, azimuth: LEGACY_SUN.azimuth, elevation: LEGACY_SUN.elevation } : l));

module.exports = { LEGACY_SUN, pinLegacySun, legacyLights };
