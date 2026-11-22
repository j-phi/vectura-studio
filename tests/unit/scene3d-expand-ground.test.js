/**
 * Monolith to tree expansion must carry the ground's size and height (scaleX / scaleZ / y) onto the ground child,
 * not only its receiveShadows flag.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('monolith to tree expansion keeps the ground size and height', () => {
  let runtime;
  let V;
  beforeAll(async () => { runtime = await loadVecturaRuntime(); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  it('copies scaleX / scaleZ / y onto the ground child (not only receiveShadows)', () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const layer = new V.Layer('mono', 'scene3d', 'Scene');
    layer.params.objects = [{ id: 'o1', name: 'o1', primitive: 'box', params: { sx: 20, sy: 20, sz: 20 }, transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' }];
    layer.params.ground = { enabled: true, scaleX: 2, scaleZ: 3, y: 10, receiveShadows: false };
    engine.layers.push(layer);
    const gid = engine.expandMonolithToTree('mono');
    const ground = engine.getLayerDescendants(gid).find((l) => l.type === 'sceneGround3d');
    expect(ground.params).toMatchObject({ scaleX: 2, scaleZ: 3, y: 10, receiveShadows: false });
  });

  it('a default ground adds no size keys that were not there', () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const layer = new V.Layer('mono', 'scene3d', 'Scene');
    layer.params.objects = [];
    layer.params.ground = { enabled: true };
    engine.layers.push(layer);
    const gid = engine.expandMonolithToTree('mono');
    const ground = engine.getLayerDescendants(gid).find((l) => l.type === 'sceneGround3d');
    expect(ground.params.scaleX).toBe(1);
    expect(ground.params.scaleZ).toBe(1);
    expect(ground.params.y === undefined || ground.params.y === 0).toBe(true);
  });
});
