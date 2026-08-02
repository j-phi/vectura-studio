const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * scene3d.generate() contract coverage (Phase 1 stream 1A).
 *
 * - Default params produce a non-empty, deterministic path set.
 * - Every path carries the CONTRACT B meta channel (kind + sceneTarget).
 * - Face outlines are emitted CLOSED (meta.closed + first point repeated).
 * - Style resolution routes through Vectura.Scene3D.StyleCascade when present
 *   (1B's module — stubbed here) and falls back to the neutral default when
 *   absent (the module-absence guard).
 */

const clone = (value) => JSON.parse(JSON.stringify(value));

const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true };

const KINDS = ['sceneFace', 'sceneEdge', 'sceneFill'];
const EDGE_CLASSES = ['silhouette', 'crease', 'boundary', 'hidden'];

const box = (id, size, z, extra = {}) => ({
  id,
  name: id,
  primitive: 'box',
  params: { sx: size, sy: size, sz: size },
  transform: { x: 0, y: 0, z, yaw: 0, pitch: 0, roll: 0, scale: 1 },
  visibility: 'solid',
  ...extra,
});

describe('scene3d generate (CONTRACT A/B)', () => {
  let runtime;
  let V;
  let algo;
  let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry && V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS && V.ALGO_DEFAULTS.scene3d;
  });

  afterAll(() => runtime.cleanup());

  afterEach(() => {
    // Tests that stub 1B's StyleCascade must not leak it into other tests.
    if (V.Scene3D) delete V.Scene3D.StyleCascade;
  });

  const sceneParams = (objects, extra = {}) => ({
    ...clone(defaults),
    seed: 1,
    objects,
    ground: { enabled: false },
    backdrop: { enabled: false },
    camera: {
      projection: 'orthographic', yaw: 0, pitch: 0, roll: 0,
      cameraDistance: 620, focalLength: 520, zoom: 1,
    },
    ...extra,
  });

  test('registers on the AlgorithmRegistry with generate + formula', () => {
    expect(algo).toBeTruthy();
    expect(typeof algo.generate).toBe('function');
    expect(typeof algo.formula).toBe('function');
    expect(typeof algo.formula(clone(defaults))).toBe('string');
  });

  test('CONTRACT A defaults ship in ALGO_DEFAULTS.scene3d', () => {
    expect(defaults).toBeTruthy();
    expect(defaults.is3d).toBe(true);
    expect(defaults.sceneVersion).toBe(1);
    expect(Array.isArray(defaults.objects)).toBe(true);
    expect(defaults.objects[0].primitive).toBe('box');
    expect(defaults.objects[0].id).toBe('obj-1');
    expect(Array.isArray(defaults.lights)).toBe(true);
    expect(defaults.lights[0].type).toBe('directional');
    expect(defaults.ground).toEqual({ enabled: true });
    expect(defaults.backdrop).toEqual({ enabled: false });
    expect(defaults.camera.projection).toBe('orthographic');
    expect(defaults.assets).toEqual({});
    expect(defaults.styleTable).toEqual({
      scene: { penId: null, mapper: 'none', params: {} },
      byObject: {},
      byFace: {},
    });
  });

  test('default params generate a non-empty path set with CONTRACT B meta on every path', () => {
    const paths = algo.generate(clone(defaults), null, null, BOUNDS) || [];
    expect(paths.length).toBeGreaterThan(0);
    paths.forEach((path) => {
      expect(Array.isArray(path)).toBe(true);
      expect(path.length).toBeGreaterThanOrEqual(2);
      const meta = path.meta || {};
      expect(KINDS).toContain(meta.kind);
      const target = meta.sceneTarget;
      expect(target).toBeTruthy();
      expect(typeof target.objectId).toBe('string');
      expect(Number.isFinite(target.depth)).toBe(true);
      expect(target.normal).toBeTruthy();
      expect(Number.isFinite(target.normal.x)).toBe(true);
      expect(Number.isFinite(target.normal.y)).toBe(true);
      expect(Number.isFinite(target.normal.z)).toBe(true);
      expect(typeof target.facingUp).toBe('boolean');
      expect(typeof target.occluded).toBe('boolean');
      if (meta.kind === 'sceneEdge') {
        expect(EDGE_CLASSES).toContain(target.edgeClass);
      } else {
        expect(target.edgeClass).toBe(null);
      }
    });
  });

  test('fully visible face outlines are closed polygons (meta.closed + repeated first point)', () => {
    const paths = algo.generate(sceneParams([box('obj-1', 40, 0)]), null, null, BOUNDS) || [];
    const faces = paths.filter((p) => p.meta && p.meta.kind === 'sceneFace' && p.meta.closed);
    expect(faces.length).toBeGreaterThan(0);
    faces.forEach((face) => {
      const first = face[0];
      const last = face[face.length - 1];
      expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeLessThan(1e-6);
    });
  });

  test('same params → byte-identical output (determinism)', () => {
    const a = algo.generate(clone(defaults), null, null, BOUNDS) || [];
    const b = algo.generate(clone(defaults), null, null, BOUNDS) || [];
    const strip = (paths) => paths.map((p) => ({ pts: p.map((q) => ({ x: q.x, y: q.y })), meta: p.meta || null }));
    expect(strip(a)).toEqual(strip(b));
  });

  test('module-absence guard: no StyleCascade → generate still works, no penId stamped', () => {
    expect(V.Scene3D.StyleCascade).toBeUndefined();
    const params = sceneParams([box('obj-1', 40, 0)]);
    params.styleTable.byObject['obj-1'] = { penId: 'pen-9', mapper: 'none', params: {} };
    const paths = algo.generate(params, null, null, BOUNDS) || [];
    expect(paths.length).toBeGreaterThan(0);
    paths.forEach((p) => expect(p.meta.penId).toBeUndefined());
  });

  describe('with a stub StyleCascade (byFace > byObject > scene)', () => {
    const installStub = () => {
      V.Scene3D.StyleCascade = {
        resolve(styleTable, { objectId, faceId }) {
          const table = styleTable || {};
          const faceKey = `${objectId}/${faceId}`;
          const style =
            (table.byFace && table.byFace[faceKey]) ||
            (table.byObject && table.byObject[objectId]) ||
            table.scene || {};
          return {
            penId: style.penId != null ? style.penId : null,
            mapper: style.mapper || 'none',
            params: { ...(style.params || {}) },
            provenance: { scope: 'test', key: faceKey },
          };
        },
      };
    };

    const sixBoxes = () => {
      const objects = [];
      for (let i = 0; i < 6; i++) {
        objects.push(box(`obj-${i + 1}`, 24, 0, {
          transform: { x: (i % 3) * 80 - 80, y: Math.floor(i / 3) * 70 - 35, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
        }));
      }
      return objects;
    };

    test('a per-object pen override lands on that object\'s paths only', () => {
      installStub();
      const params = sceneParams(sixBoxes());
      params.styleTable.byObject['obj-3'] = { penId: 'pen-9', mapper: 'none', params: {} };
      const paths = algo.generate(params, null, null, BOUNDS) || [];
      const obj3 = paths.filter((p) => p.meta.sceneTarget.objectId === 'obj-3');
      const others = paths.filter((p) => !['obj-3'].includes(p.meta.sceneTarget.objectId));
      expect(obj3.length).toBeGreaterThan(0);
      obj3.forEach((p) => expect(p.meta.penId).toBe('pen-9'));
      others.forEach((p) => expect(p.meta.penId).toBeUndefined());
    });

    test('a byFace override wins over byObject', () => {
      installStub();
      const params = sceneParams(sixBoxes());
      params.styleTable.byObject['obj-3'] = { penId: 'pen-9', mapper: 'none', params: {} };
      params.styleTable.byFace['obj-3/face:+Z'] = { penId: 'pen-2', mapper: 'none', params: {} };
      const paths = algo.generate(params, null, null, BOUNDS) || [];
      const zFaces = paths.filter((p) =>
        p.meta.kind === 'sceneFace' &&
        p.meta.sceneTarget.objectId === 'obj-3' &&
        p.meta.sceneTarget.faceId === 'face:+Z');
      expect(zFaces.length).toBeGreaterThan(0);
      zFaces.forEach((p) => expect(p.meta.penId).toBe('pen-2'));
      const otherFaces = paths.filter((p) =>
        p.meta.kind === 'sceneFace' &&
        p.meta.sceneTarget.objectId === 'obj-3' &&
        p.meta.sceneTarget.faceId !== 'face:+Z');
      otherFaces.forEach((p) => expect(p.meta.penId).toBe('pen-9'));
    });

    test('mapper hatch emits sceneFill paths carrying the face\'s sceneTarget', () => {
      installStub();
      const params = sceneParams([box('obj-1', 40, 0)]);
      params.styleTable.byObject['obj-1'] = {
        penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 80 },
      };
      const paths = algo.generate(params, null, null, BOUNDS) || [];
      const fills = paths.filter((p) => p.meta.kind === 'sceneFill');
      expect(fills.length).toBeGreaterThan(0);
      fills.forEach((p) => {
        expect(p.meta.sceneTarget.objectId).toBe('obj-1');
        expect(typeof p.meta.sceneTarget.faceId).toBe('string');
        expect(p.meta.sceneTarget.edgeClass).toBe(null);
      });
    });

    test('mapper wireframe suppresses face outlines and fills, keeps edges', () => {
      installStub();
      const params = sceneParams([box('obj-1', 40, 0)]);
      params.styleTable.byObject['obj-1'] = { penId: null, mapper: 'wireframe', params: {} };
      const paths = algo.generate(params, null, null, BOUNDS) || [];
      expect(paths.some((p) => p.meta.kind === 'sceneEdge')).toBe(true);
      expect(paths.some((p) => p.meta.kind === 'sceneFace')).toBe(false);
      expect(paths.some((p) => p.meta.kind === 'sceneFill')).toBe(false);
    });

    test('faceted hatch is per-face surface-oriented: a cube\'s visible faces hatch at distinct angles', () => {
      installStub();
      const params = sceneParams([box('obj-1', 40, 0, {
        transform: { x: 0, y: 0, z: 0, yaw: 22, pitch: 0, roll: 0, scale: 1 },
      })]);
      // A tilted camera so the three visible faces project to distinct planes.
      params.camera = { projection: 'orthographic', yaw: -25, pitch: 20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
      params.styleTable.byObject['obj-1'] = { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 55 } };
      const paths = algo.generate(params, null, null, BOUNDS) || [];
      const fills = paths.filter((p) => p.meta.kind === 'sceneFill' && p.length >= 2);
      const angleByFace = {};
      fills.forEach((p) => {
        const f = p.meta.sceneTarget.faceId;
        if (angleByFace[f] === undefined) {
          angleByFace[f] = Math.round(Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x) * 180 / Math.PI);
        }
      });
      const faces = Object.keys(angleByFace);
      expect(faces.length).toBeGreaterThanOrEqual(2);
      // At least two visible faces hatch at meaningfully different screen angles
      // (in-plane hatch foreshortens per face — not one uniform flat field).
      const angles = faces.map((f) => angleByFace[f]);
      const spread = Math.max(...angles) - Math.min(...angles);
      expect(spread).toBeGreaterThan(10);
    });

    test('draft (fastPreview) skips the plane-projected surface hatch: faces hatch at one uniform screen angle', () => {
      installStub();
      const mk = () => {
        const params = sceneParams([box('obj-1', 40, 0, {
          transform: { x: 0, y: 0, z: 0, yaw: 22, pitch: 0, roll: 0, scale: 1 },
        })]);
        params.camera = { projection: 'orthographic', yaw: -25, pitch: 20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
        params.styleTable.byObject['obj-1'] = { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 55 } };
        return params;
      };
      const faceAngles = (paths) => {
        const by = {};
        paths.filter((p) => p.meta.kind === 'sceneFill' && p.length >= 2).forEach((p) => {
          const f = p.meta.sceneTarget.faceId;
          if (by[f] === undefined) by[f] = Math.round(Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x) * 180 / Math.PI);
        });
        return Object.values(by);
      };
      // Full quality: in-plane hatch foreshortens → faces span distinct angles.
      const full = faceAngles(algo.generate(mk(), null, null, BOUNDS) || []);
      expect(Math.max(...full) - Math.min(...full)).toBeGreaterThan(10);
      // Draft: cheap screen-space hatch at the fixed fillAngle → one shared angle.
      const draft = faceAngles(algo.generate(mk(), null, null, { ...BOUNDS, fastPreview: true }) || []);
      expect(draft.length).toBeGreaterThanOrEqual(2);
      expect(Math.max(...draft) - Math.min(...draft)).toBeLessThanOrEqual(1);
    });

    test('cast shadows render at BOTH draft and full quality (objects/shadows never vanish mid-drag)', () => {
      installStub();
      const params = sceneParams([box('obj-1', 40, 0, {
        transform: { x: 0, y: 25, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
      })], {
        ground: { enabled: true },
        lights: [{ id: 'sun', type: 'directional', azimuth: 160, elevation: 45, castShadows: true }],
        camera: { projection: 'orthographic', yaw: 0, pitch: 55, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
      });
      params.tone = { ...params.tone, enabled: true };
      const shadowCount = (paths) => paths.filter((p) => p.meta
        && p.meta.sceneTarget && p.meta.sceneTarget.regionClass === 'castShadow').length;
      // Full quality casts the shadow (class union + caster-bound subtract).
      const full = algo.generate(params, null, null, BOUNDS) || [];
      expect(shadowCount(full)).toBeGreaterThan(0);
      // A draft frame (live drag) ALSO casts a shadow — via shadows.js's cheap
      // boolean-free per-caster path — so objects and their shadows keep
      // rendering while orbiting; the clean union snaps back on release.
      const draft = algo.generate(params, null, null, { ...BOUNDS, fastPreview: true }) || [];
      expect(shadowCount(draft)).toBeGreaterThan(0);
    });

    test('an explicitly emptied scene stays empty — the last-deleted object is NOT resurrected on regen (bug: delete leaves box)', () => {
      installStub();
      // normalizeParams must distinguish an ABSENT objects key (seed a box) from
      // an EXPLICIT empty array (intentionally emptied → stays empty).
      const seeded = V.Scene3D.Params.normalizeParams({ ...clone(defaults), objects: undefined });
      expect(seeded.objects.length).toBe(1); // legacy/absent → default box
      const emptied = V.Scene3D.Params.normalizeParams({ ...clone(defaults), objects: [] });
      expect(emptied.objects).toEqual([]);   // explicit empty → NO resurrection
      // …and end-to-end: generate on an emptied scene emits no object geometry.
      const paths = algo.generate(sceneParams([]), null, null, BOUNDS) || [];
      expect(paths.some((p) => p.meta && p.meta.kind === 'sceneFace')).toBe(false);
      expect(paths.some((p) => p.meta && p.meta.kind === 'sceneFill'
        && p.meta.sceneTarget && p.meta.sceneTarget.objectId !== 'ground')).toBe(false);
    });

    test('curved-surface hatch replaces the wireframe: continuous fill, no face outlines or creases, silhouette kept', () => {
      installStub();
      const torus = {
        id: 'obj-1', name: 'Torus', primitive: 'torus',
        params: { sx: 40, sy: 12, sz: 12, detail: 20 },
        transform: { x: 0, y: 0, z: 0, yaw: 16, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
      };
      const params = sceneParams([torus]);
      params.styleTable.byObject['obj-1'] = { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 60 } };
      const paths = algo.generate(params, null, null, BOUNDS) || [];
      const scene = paths.filter((p) => p.meta.sceneTarget.objectId === 'obj-1');
      // The per-face wireframe (face outlines + crease edges) is gone…
      expect(scene.some((p) => p.meta.kind === 'sceneFace')).toBe(false);
      expect(scene.some((p) => p.meta.sceneTarget.edgeClass === 'crease')).toBe(false);
      // …replaced by continuous surface hatch, and the silhouette still frames it.
      expect(scene.filter((p) => p.meta.kind === 'sceneFill').length).toBeGreaterThan(0);
      expect(scene.some((p) => p.meta.sceneTarget.edgeClass === 'silhouette')).toBe(true);
    });
  });
});

/*
 * CSG boolean end-to-end (Increment 1). A subtract group must carve a real
 * hole through the existing hidden-line pipeline: cut walls fill, the hole
 * punches through the near face, the silhouette frames the carved shape, the
 * hole object is consumed into the primary solid, and a op:'none'/ungrouped
 * scene renders byte-identically to the legacy per-object path.
 */
describe('scene3d generate — CSG subtract (Increment 1)', () => {
  let runtime;
  let V;
  let algo;
  let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });

  afterAll(() => runtime.cleanup());

  const clone2 = (value) => JSON.parse(JSON.stringify(value));
  const IB = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true };

  const solidBox = (id, size, extra = {}) => ({
    id, name: id, primitive: 'box',
    params: { sx: size, sy: size, sz: size },
    transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
    visibility: 'solid', ...extra,
  });

  // Hatch the primary solid so cut walls + the near-face frame emit sceneFill
  // runs (a default 'none' mapper draws face outlines only).
  const hatchTable = () => ({
    scene: { penId: null, mapper: 'none', params: {} },
    byObject: { 'solid-1': { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 60 } } },
    byFace: {},
  });

  const csgScene = (objects, groups, cam) => ({
    ...clone2(defaults),
    seed: 1,
    objects,
    groups: groups || [],
    styleTable: hatchTable(),
    ground: { enabled: false },
    backdrop: { enabled: false },
    camera: { projection: 'orthographic', yaw: 0, pitch: 0, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1, ...(cam || {}) },
  });

  const strip = (paths) => paths.map((p) => ({ pts: p.map((q) => ({ x: q.x, y: q.y })), meta: p.meta || null }));

  test('the hole punches through the near face: primary fills frame it, none in the bore, hole consumed', () => {
    // Straight-down-+Z camera: a through hole leaves the near +Z face an annulus.
    const p = csgScene(
      [solidBox('solid-1', 40), solidBox('hole-1', 20, { role: 'hole', params: { sx: 20, sy: 20, sz: 60 } })],
      [{ op: 'subtract', children: ['solid-1', 'hole-1'] }],
    );
    const paths = algo.generate(p, null, null, IB) || [];

    // The hole object is CONSUMED — no geometry is tagged to it.
    expect(paths.some((q) => q.meta && q.meta.sceneTarget && q.meta.sceneTarget.objectId === 'hole-1')).toBe(false);

    const primaryFills = paths.filter((q) => q.meta && q.meta.kind === 'sceneFill'
      && q.meta.sceneTarget && q.meta.sceneTarget.objectId === 'solid-1');
    expect(primaryFills.length).toBeGreaterThan(0); // the +Z frame is filled

    // No primary fill lands inside the punched-through hole (screen centre).
    const cx = IB.width / 2; const cy = IB.height / 2;
    const inHole = (pt) => Math.abs(pt.x - cx) < 6 && Math.abs(pt.y - cy) < 6;
    const anyFillInHole = primaryFills.some((run) => run.some(inHole));
    expect(anyFillInHole).toBe(false);

    // The silhouette still frames the carved shape.
    expect(paths.some((q) => q.meta && q.meta.sceneTarget
      && q.meta.sceneTarget.objectId === 'solid-1' && q.meta.sceneTarget.edgeClass === 'silhouette')).toBe(true);
  });

  test('an angled view fills the cut walls: the carve adds surface fills vs the uncarved solid', () => {
    const cam = { yaw: 28, pitch: 22 };
    const carved = csgScene(
      [solidBox('solid-1', 40), solidBox('hole-1', 20, { role: 'hole', params: { sx: 20, sy: 20, sz: 60 } })],
      [{ op: 'subtract', children: ['solid-1', 'hole-1'] }], cam,
    );
    const plain = csgScene([solidBox('solid-1', 40)], [], cam);
    const fillsOf = (paths) => paths.filter((q) => q.meta && q.meta.kind === 'sceneFill'
      && q.meta.sceneTarget && q.meta.sceneTarget.objectId === 'solid-1').length;
    const carvedFills = fillsOf(algo.generate(carved, null, null, IB) || []);
    const plainFills = fillsOf(algo.generate(plain, null, null, IB) || []);
    expect(carvedFills).toBeGreaterThan(0);
    // Cut walls + the split frame add fill runs beyond the plain 3-face box.
    expect(carvedFills).toBeGreaterThan(plainFills);
  });

  test('op:"none" and ungrouped render byte-identically (Increment-0 regression pin)', () => {
    const objects = () => [solidBox('solid-1', 40), solidBox('hole-1', 20, { role: 'hole', transform: { x: 60, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 } })];
    const ungrouped = algo.generate(csgScene(objects(), []), null, null, IB) || [];
    const noneGroup = algo.generate(
      csgScene(objects(), [{ op: 'none', children: ['solid-1', 'hole-1'] }]), null, null, IB) || [];
    expect(strip(noneGroup)).toEqual(strip(ungrouped));
  });

  test('draft frame carves nothing and does not throw (uncarved children render)', () => {
    const p = csgScene(
      [solidBox('solid-1', 40), solidBox('hole-1', 20, { role: 'hole', params: { sx: 20, sy: 20, sz: 60 } })],
      [{ op: 'subtract', children: ['solid-1', 'hole-1'] }],
    );
    let paths;
    expect(() => { paths = algo.generate(p, null, null, { ...IB, fastPreview: true }) || []; }).not.toThrow();
    // Both children render uncarved on the draft frame.
    expect(paths.some((q) => q.meta && q.meta.sceneTarget && q.meta.sceneTarget.objectId === 'solid-1')).toBe(true);
    expect(paths.some((q) => q.meta && q.meta.sceneTarget && q.meta.sceneTarget.objectId === 'hole-1')).toBe(true);
  });
});
