const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Ground scale — the ground plane carries per-axis size factors (scaleX = width,
 * scaleZ = depth) so the floor can be stretched far past the artboard and its
 * edges leave the frame. Covers:
 *   - normalizeParams keeps + clamps ground.scaleX / scaleZ (default 1).
 *   - assembleScene sizes the ground quad by those factors.
 *   - a perspective ground that reaches BEHIND the camera is clipped at the near
 *     plane instead of collapsing its near corners onto the vanishing point.
 *   - the sceneGround3d leaf's params survive the scene-tree flatten.
 */

const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true };

describe('scene3d — ground scale', () => {
  let runtime;
  let V;
  let Params;
  let Scene;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    Params = V.Scene3D.Params;
    Scene = V.Scene3D.Scene;
  });

  afterAll(() => runtime.cleanup());

  const extent = (rec) => {
    const xs = rec.world.map((p) => p.x);
    const zs = rec.world.map((p) => p.z);
    return { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs) };
  };

  test('normalizeParams: ground scale defaults to 1 and is clamped', () => {
    const d = Params.normalizeParams({ ground: { enabled: true } });
    expect(d.ground.scaleX).toBe(1);
    expect(d.ground.scaleZ).toBe(1);
    const c = Params.normalizeParams({ ground: { enabled: true, scaleX: 9999, scaleZ: -3 } });
    expect(c.ground.scaleX).toBe(Params.GROUND_SCALE_MAX);
    expect(c.ground.scaleZ).toBe(Params.GROUND_SCALE_MIN);
  });

  test('assembleScene: ground quad width/depth follow scaleX / scaleZ', () => {
    // A wide-open camera (zoom 0.05) keeps both quads inside the artboard, so
    // the frame cut leaves them whole and only the scale shows.
    const cam = { zoom: 0.05 };
    const base = Scene.assembleScene(Params.normalizeParams({ camera: cam, ground: { enabled: true } }), BOUNDS).ground;
    const big = Scene.assembleScene(Params.normalizeParams({ camera: cam, ground: { enabled: true, scaleX: 4, scaleZ: 2 } }), BOUNDS).ground;
    expect(base.world.length).toBe(4);
    expect(big.world.length).toBe(4);
    const b = extent(base);
    const g = extent(big);
    expect(g.w).toBeCloseTo(b.w * 4, 6);
    expect(g.d).toBeCloseTo(b.d * 2, 6);
  });

  test.each(['orthographic', 'perspective'])('%s: a huge floor is cut to the padded artboard (no off-paper ink)', (projection) => {
    const p = Params.normalizeParams({ camera: { projection, yaw: -30, pitch: 20 }, ground: { enabled: true, scaleX: 256, scaleZ: 256 } });
    const g = Scene.assembleScene(p, BOUNDS).ground;
    const pad = Math.max(BOUNDS.width, BOUNDS.height) * 0.25 + 1e-6;
    g.projected.forEach((pt) => {
      expect(pt.x).toBeGreaterThanOrEqual(-pad);
      expect(pt.x).toBeLessThanOrEqual(BOUNDS.width + pad);
      expect(pt.y).toBeGreaterThanOrEqual(-pad);
      expect(pt.y).toBeLessThanOrEqual(BOUNDS.height + pad);
    });
    // ...and it still covers the whole artboard.
    const inside = (x, y) => {
      let c = false;
      const P = g.projected;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        if ((P[i].y > y) !== (P[j].y > y) && x < ((P[j].x - P[i].x) * (y - P[i].y)) / (P[j].y - P[i].y) + P[i].x) c = !c;
      }
      return c;
    };
    if (projection === 'orthographic') {
      [[0, 0], [BOUNDS.width, 0], [0, BOUNDS.height], [BOUNDS.width, BOUNDS.height]]
        .forEach(([x, y]) => expect(inside(x, y)).toBe(true));
    } else {
      [[0, BOUNDS.height], [BOUNDS.width, BOUNDS.height]].forEach(([x, y]) => expect(inside(x, y)).toBe(true));
    }
  });

  test('perspective: a ground reaching behind the camera is near-plane clipped, never collapsed', () => {
    const p = Params.normalizeParams({
      ground: { enabled: true, scaleX: 30, scaleZ: 30 },
      camera: { projection: 'perspective', yaw: 0, pitch: 20, focalLength: 520, cameraDistance: 620 },
    });
    const g = Scene.assembleScene(p, BOUNDS).ground;
    expect(g).toBeTruthy();
    const face = g.faces[0];
    const pts = face.projected || g.projected;
    // No vertex was dropped onto the vanishing point by the behind-camera guard.
    g.projected.forEach((pt) => expect(pt.behind).toBeFalsy());
    expect(pts.length).toBeGreaterThanOrEqual(3);
    // The clipped quad still covers the bottom of the artboard (the near edge
    // projects far below the frame, not up at the centre).
    expect(Math.max(...g.projected.map((pt) => pt.y))).toBeGreaterThan(BOUNDS.height);
  });

  test('scene tree: the sceneGround3d leaf scale reaches params.ground', () => {
    const flat = Params.normalizeParams(Params.collectSceneParams({},
      [{ kind: 'ground', id: 'g1', params: { enabled: true, scaleX: 3, scaleZ: 5 } }]));
    expect(flat.ground.scaleX).toBe(3);
    expect(flat.ground.scaleZ).toBe(5);
  });
});

describe('scene3d — groundCoverScale (Fill frame)', () => {
  let runtime;
  let Params;
  let Scene;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    Params = runtime.window.Vectura.Scene3D.Params;
    Scene = runtime.window.Vectura.Scene3D.Scene;
  });
  afterAll(() => runtime.cleanup());

  const B = { width: 320, height: 220 };
  const visibleEdges = (p) => {
    const g = Scene.assembleScene(p, B).ground;
    // Count samples along the floor's projected EDGES that land inside the
    // frame (the corners can all sit outside while an edge still crosses it).
    const P = g.projected;
    let n = 0;
    P.forEach((a, i) => {
      const b = P[(i + 1) % P.length];
      for (let t = 0; t <= 1; t += 0.002) {
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        if (x > 0 && x < B.width && y > 0 && y < B.height) n += 1;
      }
    });
    return n;
  };

  test.each(['orthographic', 'perspective'])('%s: the result pushes every floor corner out of frame', (projection) => {
    const camera = { projection, yaw: -30, pitch: 20 };
    const p = Params.normalizeParams({ camera, ground: { enabled: true } });
    expect(visibleEdges(p)).toBeGreaterThan(0);
    const r = Scene.groundCoverScale(p, B);
    expect(r.covered).toBe(true);
    expect(r.scaleX).toBeGreaterThan(1);
    const after = Params.normalizeParams({ camera, ground: { enabled: true, scaleX: r.scaleX, scaleZ: r.scaleZ } });
    expect(visibleEdges(after)).toBe(0);
  });

  test('keeps the X:Z proportion of the current ground', () => {
    const p = Params.normalizeParams({ camera: { yaw: -30, pitch: 20 }, ground: { enabled: true, scaleX: 1, scaleZ: 2 } });
    const r = Scene.groundCoverScale(p, B);
    expect(r.scaleZ / r.scaleX).toBeCloseTo(2, 6);
  });

  test('perspective with the horizon in frame: an edge on the horizon counts as hidden', () => {
    const camera = { projection: 'perspective', yaw: 0, pitch: 4 };
    const p = Params.normalizeParams({ camera, ground: { enabled: true } });
    const r = Scene.groundCoverScale(p, B);
    expect(r.scaleX).toBeLessThanOrEqual(Params.GROUND_SCALE_MAX);
    expect(r.scaleX).toBeGreaterThan(1);
  });
});
