/*
 * Shared fixture for the shadow-overlap contract (sf/shadow-overlap).
 *
 * Both the committed baseline generator and `tests/unit/scene3d-shadow-overlap
 * .test.js` build their scenes here, so the byte-identity assertions compare
 * the SAME scene definition on both sides of the change.
 *
 * Light az 90 / el 25 throws a long shadow along +x on screen. `overlap` puts
 * two ground-resting boxes 50mm apart ALONG that throw, so the far box's
 * shadow lands on the near box's shadow; `apart` offsets them across the
 * throw instead, so the two footprints stay disjoint.
 */
const clone = (value) => JSON.parse(JSON.stringify(value));

const BOUNDS = { width: 320, height: 220, penWidth: 0.3 };
const LIGHT = { azimuth: 90, elevation: 25 };

const boxObj = (id, x, z) => ({
  id, name: id, primitive: 'box', params: { sx: 30, sy: 30, sz: 30 },
  transform: { x, y: 15, z, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
});

const SCENES = {
  single: [boxObj('obj-1', 0, 0)],
  apart: [boxObj('obj-1', 0, -45), boxObj('obj-2', 0, 45)],
  overlap: [boxObj('obj-1', -25, 0), boxObj('obj-2', 25, 0)],
};

// Build + run one named scene through Scene3D.Shadows.build with an EMPTY
// occluder set (isolates the boolean work from HLR clipping).
const runScene = (V, name, shadowBag) => {
  const S = V.Scene3D;
  const params = S.Params.normalizeParams({
    ...clone(V.ALGO_DEFAULTS.scene3d),
    objects: SCENES[name],
    ground: { enabled: true },
    lights: [{ id: 'sun', type: 'directional', castShadows: true, ...LIGHT }],
    camera: { projection: 'orthographic', yaw: 0, pitch: 55, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
    ...(shadowBag ? { shadow: shadowBag } : {}),
  });
  const scene = S.Scene.assembleScene(params, BOUNDS);
  const clipper = S.HLR.createClipper([], { bias: 0.05 });
  const lightDir = S.Lighting.lightWorldDir(params.lights[0]);
  const opts = shadowBag ? { shadow: { ...params.shadow, ...shadowBag } } : { shadow: params.shadow };
  const paths = S.Shadows.build(scene, params, BOUNDS, clipper, lightDir, opts);
  return paths
    .filter((p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.regionClass === 'castShadow')
    .map((p) => ({ pts: p.map((pt) => [pt.x, pt.y]), meta: p.meta }));
};

module.exports = { BOUNDS, LIGHT, SCENES, runScene };
