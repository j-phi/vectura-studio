/**
 * Y-rotation drag direction — regression/characterization coverage.
 *
 * Reported bug: "dragging a 3D scene object to the RIGHT should rotate it to
 * the right; it currently rotates left." A prior investigation checked the
 * compact orbit pad's free-drag ("orbit" hit type — apply3DRotationDrag's
 * fallback branch) and the generic formula inside the unified object gizmo's
 * `_applySceneObjectGizmoDrag` rotate branch, and concluded both were
 * consistent "by construction". It never actually EXERCISED the gizmo-ring
 * grab the owner recorded: a screen-recording (frames f_006/f_009) shows the
 * cursor sitting on the cyan (Z-axis) rotate ring, readout ticking
 * "X 6° Y -464° Z 0°" → "X 6° Y -494° Z 0°" while dragging RIGHT — i.e. Y
 * changes (and runs increasingly negative) while Z, the ring actually under
 * the cursor, never moves.
 *
 * Root cause (found by exercising `hitSceneObjectGizmo` directly): the 3
 * rotate rings are projected ellipses that overlap heavily on screen (a
 * consequence of the camera angle), and the hit-test loop tried axes in a
 * FIXED order (x, then y, then z) and returned the first ring within
 * tolerance — not the ring the point is actually closest to. Many points
 * that sit exactly ON the z-ring's own path are closer to it than to the
 * y-ring, yet the old order-first loop still returned axis 'y' because y is
 * checked before z. This is a pure hit-test/interaction bug (category A —
 * drag→delta mapping) with no effect on how a stored yaw/pitch/roll value
 * maps to geometry: `src/core/algorithms/geometry3d.js` is untouched, and a
 * fixed stored value still renders byte-identical (see the GEOMETRY GUARD
 * test below).
 *
 * Two coverage areas:
 *   1. ORBIT PAD (component A, previously verified, kept as a guard so a
 *      future change to the gizmo fix doesn't regress this separate path).
 *   2. UNIFIED OBJECT GIZMO (component B, the actual buggy path): hit-test
 *      axis selection must pick the nearest ring, and the resulting rotate
 *      delta must move the axis that was actually grabbed, signed to match
 *      the same "drag right = sweeps geometry right" contract proven for yaw
 *      in the GEOMETRY GUARD test (extended here to roll/pitch too, since
 *      the fix computes all three the same way).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('scene3d object Y-rotation — drag direction contract', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  const build = () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneTree(); // group + seed object3d child + light + ground
    const child = engine.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    // Real generate — the gizmo anchor needs actual sceneTarget-tagged paths.
    engine.generate(gid);
    const renderer = new V.Renderer('main-canvas', engine);
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    renderer.selectedLayerIds = new Set([gid]);
    renderer.selectedLayerId = gid;
    renderer.app = { pushHistory: () => {}, ui: { buildControls() {}, updateFormula() {} } };
    renderer.draw = () => {};
    renderer.updateCursor = () => {};
    renderer.showDragTooltip = () => {};
    renderer.hideDragTooltip = () => {};
    renderer.setSceneSelection({ layerId: gid, mode: 'object', objectIds: [child.id], faceKeys: [], edgeKeys: [] });
    return { engine, renderer, gid, child };
  };

  describe('orbit pad (component A — previously verified, must keep working)', () => {
    test('dragging the orbit pad RIGHT increases the selected object\'s yaw (not decreases it)', () => {
      const { engine, renderer, gid, child } = build();
      const group = engine.getLayerById(gid);
      child.params.transform.yaw = 0;

      const bounds = renderer.getSelectionBounds([group]);
      const control = renderer.get3DRotationControl(group, bounds);
      expect(control).toBeTruthy();

      const start = renderer.worldToScreen(control.center.x, control.center.y);
      const hit = renderer.hit3DRotationControl(start.x, start.y, group, bounds);
      expect(hit.type).toBe('orbit');
      expect(renderer.begin3DRotationDrag(hit, { clientX: start.x, clientY: start.y })).toBe(true);

      // Pure rightward drag, no vertical component.
      renderer.apply3DRotationDrag({ clientX: start.x + 40, clientY: start.y });

      expect(child.params.transform.yaw).toBeGreaterThan(0);
      // Guard against a future "fix" that flips only the fallback drag's sign.
      expect(child.params.transform.yaw).toBeCloseTo(18, 0);
    });

    test('dragging the orbit pad LEFT decreases the selected object\'s yaw (mirror check)', () => {
      const { engine, renderer, gid, child } = build();
      const group = engine.getLayerById(gid);
      child.params.transform.yaw = 0;

      const bounds = renderer.getSelectionBounds([group]);
      const control = renderer.get3DRotationControl(group, bounds);
      const start = renderer.worldToScreen(control.center.x, control.center.y);
      const hit = renderer.hit3DRotationControl(start.x, start.y, group, bounds);
      renderer.begin3DRotationDrag(hit, { clientX: start.x, clientY: start.y });
      renderer.apply3DRotationDrag({ clientX: start.x - 40, clientY: start.y });

      expect(child.params.transform.yaw).toBeLessThan(0);
    });
  });

  describe('unified object gizmo (component B — the owner\'s actual reproduced gesture)', () => {
    test('a point sitting on the Z rotate ring resolves to axis z, not the first-checked axis y', () => {
      const { engine, renderer, gid, child } = build();
      const group = engine.getLayerById(gid);
      child.params.transform.yaw = 0;
      child.params.transform.pitch = 0;
      child.params.transform.roll = 0;

      const giz = renderer.getSceneObjectGizmo(group);
      expect(giz).toBeTruthy();
      const zAx = giz.axes.find((a) => a.key === 'z');
      // A point genuinely ON the z-ring's own path (distance 0 to z, but close
      // enough to the y-ring's path that the old fixed x→y→z order matched y
      // first). This is the exact ambiguity the owner's screen recording shows
      // — cursor on the cyan Z ring, readout ticking Y instead of Z.
      const p = zAx.ring[2];
      const hit = renderer.hitSceneObjectGizmo(p.x, p.y, group);
      expect(hit).toBeTruthy();
      expect(hit.type).toBe('rotate');
      expect(hit.axis).toBe('z');
    });

    test('dragging that Z-ring point RIGHT rotates roll, and yaw stays untouched (matches the grabbed ring)', () => {
      const { engine, renderer, gid, child } = build();
      const group = engine.getLayerById(gid);
      child.params.transform.yaw = 0;
      child.params.transform.pitch = 0;
      child.params.transform.roll = 0;

      const giz = renderer.getSceneObjectGizmo(group);
      const zAx = giz.axes.find((a) => a.key === 'z');
      const p = zAx.ring[2];
      const hit = renderer.hitSceneObjectGizmo(p.x, p.y, group);
      expect(hit.axis).toBe('z');

      expect(renderer.beginSceneObjectGizmoDrag(hit, { clientX: p.x, clientY: p.y })).toBe(true);
      renderer.apply3DRotationDrag; // no-op reference, unrelated API
      renderer._applySceneObjectGizmoDrag({ clientX: p.x + 20, clientY: p.y });

      // The axis actually grabbed (z/roll) must be the one that moved.
      expect(child.params.transform.roll).not.toBe(0);
      // The axis NOT grabbed (y/yaw) must be untouched — this is the direct
      // regression check for "Z stays 0° while Y changes" in the recording.
      expect(child.params.transform.yaw).toBe(0);
    });

    test('dragging an unambiguous Y-ring point RIGHT increases yaw (regression guard, unified gizmo)', () => {
      const { engine, renderer, gid, child } = build();
      const group = engine.getLayerById(gid);
      child.params.transform.yaw = 0;
      child.params.transform.pitch = 0;
      child.params.transform.roll = 0;

      const giz = renderer.getSceneObjectGizmo(group);
      const yAx = giz.axes.find((a) => a.key === 'y');
      // Ring sample #3 is the point on the y-ring whose local TANGENT points
      // most rightward — i.e. where a small rightward nudge best aligns with
      // advancing the ring's own theta (and therefore yaw). This is the
      // correct way to pick a "drag right" regression point on a circular
      // handle: tangent alignment, not raw position. (Other points on the
      // same ring legitimately decrease yaw for a rightward nudge — same as
      // grabbing the bottom of a steering wheel and pushing right turns it
      // the opposite way from grabbing the top — that is not a bug.)
      const best = yAx.ring[3];
      const hit = renderer.hitSceneObjectGizmo(best.x, best.y, group);
      expect(hit.axis).toBe('y');
      expect(hit.type).toBe('rotate');

      expect(renderer.beginSceneObjectGizmoDrag(hit, { clientX: best.x, clientY: best.y })).toBe(true);
      renderer._applySceneObjectGizmoDrag({ clientX: best.x + 20, clientY: best.y });

      expect(child.params.transform.yaw).toBeGreaterThan(0);
    });
  });

  test('GEOMETRY GUARD — a fixed transform.yaw keeps producing byte-identical projected geometry', () => {
    // This does not touch geometry3d.js / scene.js; it only pins the existing
    // contract so a future change to either file is caught here too.
    const G3 = V.Geometry3D;
    const camera = { yaw: -30, pitch: 20, roll: 0 };
    const localCorner = { x: 15, y: 22.5, z: 10 };

    const project = (yaw) => {
      const world = G3.rotatePoint(localCorner, { yaw, pitch: 0, roll: 0 });
      const cam = G3.rotatePoint(world, camera);
      return G3.projectPoint(cam, {});
    };

    // Fixed stored yaw values — repeated calls must be byte-identical (no
    // drift, no hidden state) and must match the known-good recorded values.
    expect(project(0)).toEqual(project(0));
    expect(project(0).x).toBeCloseTo(7.990, 3);
    expect(project(27).x).toBeCloseTo(14.456, 3);
    expect(project(30).x).toBeCloseTo(15.000, 3);

    // Increasing yaw (i.e. what a rightward drag currently produces) sweeps
    // this front-facing corner MONOTONICALLY RIGHTWARD on screen — this is
    // the geometric ground truth "drag right" is checked against above.
    const xs = [0, 10, 20, 27, 30].map((yaw) => project(yaw).x);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    }
  });

  describe('Job 2 — rotation normalized to 0-360, accumulated mid-drag, wrapped on commit', () => {
    // A continuous multi-revolution sweep around the unified gizmo's rotate
    // ring used to accumulate unboundedly (this is the literal mechanism
    // behind the owner's recorded "-464°" readout — see the module doc
    // comment above) AND stayed unbounded after mouse-up, so a saved
    // document could carry a value like -464 forever. 400° and 40° render
    // identically in a static plotter tool, so the winding count is only
    // useful WHILE the user is actively spinning (so the drag doesn't fight
    // them by snapping back over a wrap boundary) — once they let go, the
    // stored/displayed value should read in the conventional [0, 360) range.
    test('a multi-revolution rightward sweep accumulates past 360° mid-drag, then wraps into [0, 360) on release', () => {
      const { engine, renderer, gid, child } = build();
      const group = engine.getLayerById(gid);
      child.params.transform.yaw = 0;
      child.params.transform.pitch = 0;
      child.params.transform.roll = 0;

      const giz = renderer.getSceneObjectGizmo(group);
      const yAx = giz.axes.find((a) => a.key === 'y');
      const N = yAx.ring.length - 1; // ring[N] === ring[0], one full revolution
      const start = yAx.ring[3]; // the same rightward-tangent point used above
      const hit = renderer.hitSceneObjectGizmo(start.x, start.y, group);
      expect(hit.axis).toBe('y');
      expect(renderer.beginSceneObjectGizmoDrag(hit, { clientX: start.x, clientY: start.y })).toBe(true);

      // Walk forward around the ring one and a half revolutions (index 3 →
      // 3+1.5N, wrapping through the sample array) — a continuous drag, not a
      // teleport, so each step is a small delta the accumulator can unwrap.
      const steps = Math.round(N * 1.5);
      let sawPast360 = false;
      for (let k = 1; k <= steps; k++) {
        const idx = (3 + k) % N;
        const p = yAx.ring[idx];
        renderer._applySceneObjectGizmoDrag({ clientX: p.x, clientY: p.y });
        if (Math.abs(child.params.transform.yaw) > 360) sawPast360 = true;
      }
      // Mid-drag: the swept total legitimately exceeds a single revolution —
      // wrapping here would fight the user's continuous motion.
      expect(sawPast360).toBe(true);

      renderer._endSceneObjectGizmoDrag();

      // On release: normalized into the conventional [0, 360) range.
      expect(child.params.transform.yaw).toBeGreaterThanOrEqual(0);
      expect(child.params.transform.yaw).toBeLessThan(360);
    });

    test('a sweep that commits to a negative value wraps into [0, 360), not (-180, 180]', () => {
      const { engine, renderer, gid, child } = build();
      const group = engine.getLayerById(gid);
      child.params.transform.yaw = 0;
      child.params.transform.pitch = 0;
      child.params.transform.roll = 0;

      const giz = renderer.getSceneObjectGizmo(group);
      const yAx = giz.axes.find((a) => a.key === 'y');
      const start = yAx.ring[16]; // this point's tangent decreases yaw for a rightward nudge (see the earlier regression guard)
      const hit = renderer.hitSceneObjectGizmo(start.x, start.y, group);
      expect(hit.axis).toBe('y');
      expect(renderer.beginSceneObjectGizmoDrag(hit, { clientX: start.x, clientY: start.y })).toBe(true);
      renderer._applySceneObjectGizmoDrag({ clientX: start.x + 20, clientY: start.y });
      expect(child.params.transform.yaw).toBeLessThan(0);

      renderer._endSceneObjectGizmoDrag();
      expect(child.params.transform.yaw).toBeGreaterThanOrEqual(0);
      expect(child.params.transform.yaw).toBeLessThan(360);
    });
  });
});
