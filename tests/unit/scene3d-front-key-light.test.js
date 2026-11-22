const { loadSurfaceLockRuntime, buildSurfaceLockScene } = require('../helpers/surface-lock-scene');

const clone = (v) => JSON.parse(JSON.stringify(v));
describe('Scene3D v7 front key light', () => {
  let rt; let V; let P;
  beforeAll(async () => { rt = await loadSurfaceLockRuntime(); V = rt.V; P = V.Scene3D.Params; });
  afterAll(() => rt && rt.cleanup());

  // Camera-space toward-sun z (+ = in front of the subject), same math as renderer._rotateCam.
  const camZ = (light, cam) => {
    const D = Math.PI / 180; const a = light.azimuth * D; const e = light.elevation * D;
    let x = Math.cos(e) * Math.sin(a); let y = Math.sin(e); let z = Math.cos(e) * Math.cos(a);
    let c = Math.cos(cam.yaw * D); let sn = Math.sin(cam.yaw * D);
    [x, z] = [x * c + z * sn, -x * sn + z * c];
    c = Math.cos(cam.pitch * D); sn = Math.sin(cam.pitch * D);
    [y, z] = [y * c - z * sn, y * sn + z * c];
    return { x, y, z };
  };

  it('a new scene\'s key light (the tree sun child AND the inline default) is in front of the subject', () => {
    const s = buildSurfaceLockScene(V, { kind: 'sphere' });
    const cam = s.group.params.camera;
    const sun = s.eng.getLayerDescendants(s.gid).find((l) => l.type === 'sceneLight3d');
    expect(sun).toBeTruthy();
    const v = camZ(sun.params, cam);
    expect(v.z).toBeGreaterThan(0.3);
    expect(v.x).toBeLessThan(0); // upper-left key
    expect(v.y).toBeGreaterThan(0.2);
    expect(sun.params.castShadows).toBe(true);
    // az 330 / el 40: front enough for a glint (z ~0.58) yet side enough that the cast shadow clears the subject.
    expect(sun.params.azimuth).toBe(330);
    expect(sun.params.elevation).toBe(40);
    const inline = V.ALGO_DEFAULTS.scene3d.lights[0];
    expect(camZ(inline, cam).z).toBeGreaterThan(0.3);
  });

  it('a saved v6 document keeps its light (az 135 / el 45) untouched by migration', () => {
    const out = P.sanitizeSceneParams({ sceneVersion: 6, objects: [], lights: [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: true }] });
    expect(out.lights[0].azimuth).toBe(135);
    expect(out.lights[0].elevation).toBe(45);
  });

  it('a saved v6 document with NO lights key, or a light missing its angles, still gets the az-135 sun', () => {
    const none = P.sanitizeSceneParams({ sceneVersion: 6, objects: [] });
    expect(none.lights).toHaveLength(1);
    expect(none.lights[0].azimuth).toBe(135);
    expect(none.lights[0].elevation).toBe(45);
    const partial = P.sanitizeSceneParams({ sceneVersion: 6, objects: [], lights: [{ id: 'sun', type: 'directional' }] });
    expect(partial.lights[0].azimuth).toBe(135);
    expect(partial.lights[0].elevation).toBe(45);
    // a v7 payload with no lights key is a NEW scene: the front key
    expect(P.sanitizeSceneParams({ sceneVersion: 7, objects: [] }).lights[0].azimuth).toBe(330);
  });
});
