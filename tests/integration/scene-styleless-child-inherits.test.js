const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * collectSceneParams — A STYLE-LESS object3d CHILD MUST INHERIT THE SCENE.
 *
 * DEFECT (RGR red): `collectSceneParams` republished
 * `byObject[layerId] = normalizeStyle(child.params.style)` UNCONDITIONALLY.
 * `normalizeStyle(undefined)` yields `{ penId:null, mapper:'none', params:{} }`,
 * so a child carrying NO style bag published a hard `none` into byObject — and
 * byObject BEATS scene in the whole-style-wins cascade (byFace > byObject >
 * scene, no per-field merge). A scene styled `hatch` therefore rendered such a
 * child as a BARE UNFILLED OUTLINE: sceneFace + sceneEdge, sceneFill = 0.
 *
 * This is the same failure shape 5cfdbeb fixed for the EXPANSION path, through a
 * second door. Expansion materializes a whole style onto each child, so it never
 * produces a style-less child — but a `.vectura` document whose object3d child
 * has no `style` (or `style:{}`, or a style with no `mapper`) loads straight into
 * this state via importState, and the object body renders unfilled. Cast shadows
 * on the ground still render, because the ground/shadow path does not read the
 * object's style — which is exactly how the defect presents.
 *
 * FIX: publish a byObject entry only when the child actually declares a mapper.
 * A child with no usable style leaves the slot ABSENT, so resolution falls
 * through to `styleTable.scene` — the documented cascade ("missing table / maps /
 * keys fall through to the scene default").
 *
 * NOT a behaviour change for any UI-created child: addObjectToScene seeds
 * ALGO_DEFAULTS.object3d.style ({mapper:'wireframe'}), Convert-to-Scene seeds
 * `hatch`, and expandMonolithToTree materializes a whole resolved style. Every
 * one of those declares a mapper and is unaffected.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));

const countKind = (paths, kind) =>
  (Array.isArray(paths) ? paths : []).filter((p) => p && p.meta && p.meta.kind === kind).length;

describe('collectSceneParams — a style-less object3d child inherits the scene style', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  // A scene GROUP styled at scene scope with HATCH, holding ONE object3d child.
  // `childStyle` is spliced onto the child verbatim (undefined ⇒ no style key).
  const buildTree = (childStyle) => {
    const engine = new V.VectorEngine();

    const grp = new V.Layer('grp-1', 'scene3d', 'Scene');
    grp.params = {
      ...clone(V.ALGO_DEFAULTS.scene3d),
      seed: 7,
      objects: [],
      groups: [],
      lights: [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false }],
      ground: { enabled: false },
      styleTable: {
        scene: { penId: null, mapper: 'hatch', params: { hatchSpacing: 2.2, hatchAngle: 35 } },
        byObject: {},
        byFace: {},
      },
    };
    grp.isGroup = true;
    grp.containerRole = 'scene';
    grp.groupType = 'scene';

    const kid = new V.Layer('obj-1', 'object3d', 'Box 1');
    kid.params = {
      ...clone(V.ALGO_DEFAULTS.object3d),
      name: 'Box 1',
      primitive: 'box',
      params: { sx: 60, sy: 60, sz: 60 },
      transform: { x: 0, y: 30, z: 0, yaw: 20, pitch: 0, roll: 0, scale: 1 },
      visibility: 'solid',
      role: 'solid',
    };
    if (childStyle === undefined) delete kid.params.style;
    else kid.params.style = clone(childStyle);
    kid.parentId = grp.id;

    engine.layers = [grp, kid];
    engine.computeAllDisplayGeometry();
    return { engine, grp, kid };
  };

  // The composed ink lives on `group.scenePaths`, NOT on `layer.paths` — a scene
  // group's own `paths` is empty by design. Reading the wrong one is the standing
  // false-positive trap in this subsystem.
  const sceneInk = (grp) => {
    expect(grp.paths || []).toHaveLength(0);
    return grp.scenePaths || [];
  };

  // ── (1) THE DEFECT — no style bag at all ──────────────────────────────────
  test('a child with NO style bag renders the scene hatch, not a bare outline', () => {
    const { grp } = buildTree(undefined);
    const ink = sceneInk(grp);
    expect(countKind(ink, 'sceneEdge')).toBeGreaterThan(0);
    expect(countKind(ink, 'sceneFill')).toBeGreaterThan(0);
  });

  // ── (2) an empty style object is equally style-less ───────────────────────
  test('a child with style:{} renders the scene hatch', () => {
    const { grp } = buildTree({});
    expect(countKind(sceneInk(grp), 'sceneFill')).toBeGreaterThan(0);
  });

  // ── (3) a style bag with no mapper key ────────────────────────────────────
  test('a child with a style bag but no mapper renders the scene hatch', () => {
    const { grp } = buildTree({ penId: null, params: {} });
    expect(countKind(sceneInk(grp), 'sceneFill')).toBeGreaterThan(0);
  });

  // ── (4) the assembled table leaves the slot ABSENT so the cascade falls through ─
  test('collectSceneParams publishes no byObject entry for a style-less child', () => {
    const P = V.Scene3D.Params;
    const SC = V.Scene3D.StyleCascade;
    const { grp, kid } = buildTree(undefined);
    const assembled = P.collectSceneParams(grp.params, [
      { kind: 'object', id: kid.id, params: kid.params },
    ]);
    expect(assembled.styleTable.byObject[kid.id]).toBeUndefined();
    const resolved = SC.resolve(assembled.styleTable, { objectId: kid.id });
    expect(resolved.mapper).toBe('hatch');
    expect(resolved.provenance.scope).toBe('scene');
  });

  // ── (5) REGRESSION PIN — an EXPLICIT style still wins over the scene ───────
  test('an explicit child style still outranks the scene style', () => {
    const P = V.Scene3D.Params;
    const SC = V.Scene3D.StyleCascade;
    const { grp, kid } = buildTree({ penId: 'pen-2', mapper: 'stipple', params: { stippleDensity: 40 } });
    const assembled = P.collectSceneParams(grp.params, [
      { kind: 'object', id: kid.id, params: kid.params },
    ]);
    const resolved = SC.resolve(assembled.styleTable, { objectId: kid.id });
    expect(resolved.provenance.scope).toBe('object');
    expect(resolved.mapper).toBe('stipple');
    expect(resolved.penId).toBe('pen-2');
    expect(resolved.params.stippleDensity).toBe(40);
  });

  // ── (6) REGRESSION PIN — an explicit 'none' is still honoured ──────────────
  // 'none' is a real user choice (the None rung in the Mapper select). It must
  // NOT be swallowed by the inherit-when-absent rule.
  test("an explicit mapper:'none' still suppresses the scene fill", () => {
    const { grp } = buildTree({ penId: null, mapper: 'none', params: {} });
    const ink = sceneInk(grp);
    expect(countKind(ink, 'sceneFill')).toBe(0);
    expect(countKind(ink, 'sceneEdge')).toBeGreaterThan(0);
  });

  // ── (7) REGRESSION PIN — the UI-created default is untouched ──────────────
  test("a child carrying the factory default style still renders wireframe", () => {
    const { grp } = buildTree(clone(V.ALGO_DEFAULTS.object3d.style));
    const ink = sceneInk(grp);
    expect(countKind(ink, 'sceneFill')).toBe(0);
    expect(countKind(ink, 'sceneEdge')).toBeGreaterThan(0);
  });
});
