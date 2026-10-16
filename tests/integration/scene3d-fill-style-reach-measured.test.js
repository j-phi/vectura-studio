/**
 * U3 (fill-style review r3 headline 4 / r2 NEW-5) — the Fill Style picker's
 * "— no effect here" greying on a CURVED shape under Spiral / Stipple is
 * computed from the running engine, not inferred.
 *
 * The W-03 list greyed 45 of 48 engine ids as "drawing like Ladder"; measured,
 * only `deepFillTSP` (everywhere) and `fineLadder` (pyramid + Stipple) draw
 * byte-identically to Ladder there. This test renders the object fill for
 * every engine id and pins `isReachableOn` to the measurement in BOTH
 * directions: an id the picker greys must render like Ladder, and an id that
 * renders like Ladder must be greyed.
 */
const crypto = require('crypto');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Fill Style reachability on curved Spiral/Stipple is measured', () => {
  let runtime; let V; let engine; let group; let obj;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    engine = new V.VectorEngine();
    const gid = engine.addLayer('scene3d');
    group = engine.getLayerById(gid);
    obj = engine.getLayerDescendants(gid).find((l) => l && l.type === 'object3d');
    obj.params.transform.yaw = 25;
    obj.params.transform.pitch = 15;
  }, 120000);
  afterAll(() => runtime.cleanup());

  const objFillHash = (primitive, mapper, toneLaw) => {
    obj.params.primitive = primitive;
    obj.params.style = { penId: null, mapper, params: { toneLaw } };
    engine.computeAllDisplayGeometry();
    const fills = (group.scenePaths || []).filter((p) => p.meta && p.meta.kind === 'sceneFill'
      && p.meta.sceneTarget && p.meta.sceneTarget.objectId === obj.id);
    const key = fills.map((p) => {
      const m = p.meta || {};
      const metaKey = JSON.stringify(Object.keys(m).filter((k) => k !== 'sceneTarget' && k !== 'algorithm' && k !== 'anchors')
        .sort().map((k) => [k, m[k]]));
      return metaKey + '|' + p.map((pt) => `${pt.x.toFixed(3)},${pt.y.toFixed(3)}`).join(';');
    }).join('\n');
    return crypto.createHash('md5').update(key).digest('hex');
  };

  test.each([
    ['sphere', 'spiral'],
    ['sphere', 'stipple'],
    ['pyramid', 'stipple'],
  ])('%s + %s: greyed ⇔ draws exactly like Ladder', (primitive, mapper) => {
    const FS = V.SCENE_FILL_STYLES;
    const R = V.SCENE3D_TONE_LAWS;
    const ladder = objFillHash(primitive, mapper, 'ladder');
    const mismatches = [];
    R.IDS.forEach((id) => {
      const sameAsLadder = objFillHash(primitive, mapper, id) === ladder;
      const greyed = !FS.isReachableOn(id, primitive, undefined, mapper);
      if (sameAsLadder !== greyed) mismatches.push(`${id}: sameAsLadder=${sameAsLadder} greyed=${greyed}`);
    });
    expect(mismatches).toEqual([]);
  }, 300000);
});
