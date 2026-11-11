const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const LR = require('../helpers/light-realism');
const { buildSurfaceLockScene } = require('../helpers/surface-lock-scene');

// One light vector, three consumers (light-plan.md section 1c): tone (Regions), shadow (SurfaceLockShadow.frameShadow
// footprint), sun widget (Renderer._lightHandleOffset). They must agree for any light, and a pure camera orbit must not
// re-evaluate tone (toneEvals 0, bakeMisses 0).
const LIGHTS = [
  { azimuth: 135, elevation: 45 }, { azimuth: 0, elevation: 45 }, { azimuth: 90, elevation: 10 }, { azimuth: 180, elevation: 40 },
  { azimuth: 270, elevation: 60 }, { azimuth: 45, elevation: 80 }, { azimuth: 315, elevation: 15 }, { azimuth: 200, elevation: 30 },
];

describe('scene3d light vector consistency (tone == shadow == widget)', () => {
  let rt; let V; let R; let Renderer;
  beforeAll(async () => {
    rt = await loadVecturaRuntime({ includeRenderer: true });
    V = rt.window.Vectura; R = V.Scene3D.Regions; Renderer = V.Renderer;
  });
  afterAll(() => rt && rt.cleanup());

  it('tone: Regions.combinedIntensity peaks at the toward-light vector and is 0 at its opposite', () => {
    LIGHTS.forEach((light) => {
      const t = V.Scene3D.Lighting.towardLight(light);
      const d = V.Scene3D.Lighting.lightWorldDir(light);
      expect(t.x).toBeCloseTo(-d.x, 12); expect(t.y).toBeCloseTo(-d.y, 12); expect(t.z).toBeCloseTo(-d.z, 12);
      expect(R.combinedIntensity(t, { x: 0, y: 0, z: 0 }, [light])).toBeCloseTo(1, 9);
      expect(R.combinedIntensity({ x: -t.x, y: -t.y, z: -t.z }, { x: 0, y: 0, z: 0 }, [light])).toBe(0);
    });
  });

  it('shadow: the cast footprint of a sphere is displaced along the tone light travel direction', () => {
    const SLS = V.Scene3D.SurfaceLockShadow;
    const hatch = { count: 1, dirX: 1, dirZ: 0, nX: 0, nZ: 1, scaleRef: 1, subdiv: 1 };
    LIGHTS.forEach((light) => {
      const d = V.Scene3D.Lighting.lightWorldDir(light);
      const C = { x: 3, y: 20, z: -4 };
      const out = SLS.frameShadow(hatch, [{ shape: 'sphere', center: C, radius: 10 }], d, null);
      const ring = out.footprints && out.footprints[0];
      if (!ring) return; // grazing light: no footprint by design
      const cx = ring.reduce((a, q) => a + q.x, 0) / ring.length; const cz = ring.reduce((a, q) => a + q.z, 0) / ring.length;
      const t = C.y / d.y; // footprint centre = C - t*d on the ground
      expect(cx).toBeCloseTo(C.x - t * d.x, 6); expect(cz).toBeCloseTo(C.z - t * d.z, 6);
      // the shadow lies on the side AWAY from the sun: direction centre - C . toward-light < 0 in the horizontal plane
      const tl = V.Scene3D.Lighting.towardLight(light);
      expect((cx - C.x) * tl.x + (cz - C.z) * tl.z).toBeLessThanOrEqual(1e-9);
    });
  });

  it('widget: the handle offset is the camera-space toward-light vector, same maths as tone', () => {
    const r = Object.create(Renderer.prototype);
    const baseR = 100;
    [{ yaw: -30, pitch: 20 }, { yaw: 70, pitch: -10 }].forEach((cam) => {
      const layer = { params: { camera: cam } };
      LIGHTS.forEach((light) => {
        const wd = r._lightWorldDir(light);
        const d = V.Scene3D.Lighting.lightWorldDir(light);
        expect(wd.x).toBeCloseTo(d.x, 9); expect(wd.y).toBeCloseTo(d.y, 9); expect(wd.z).toBeCloseTo(d.z, 9);
        const off = r._lightHandleOffset(layer, light, baseR);
        const c = V.Geometry3D.rotatePoint(V.Scene3D.Lighting.towardLight(light), { yaw: cam.yaw, pitch: cam.pitch, roll: 0 });
        expect(off.dx / baseR).toBeCloseTo(c.x, 6); expect(-off.dy / baseR).toBeCloseTo(c.y, 6);
      });
    });
  });

  it('widget (known limitation, pins today): the 2D offset cannot tell front from back lights', () => {
    const r = Object.create(Renderer.prototype);
    const cam = { yaw: -30, pitch: 20 };
    const layer = { params: { camera: cam } };
    // two lights mirrored through the view plane have the same camera x,y and opposite z
    const a = LR.setLightCam(buildSurfaceLockScene(V, { ground: false }), [0.5, 0.3, Math.sqrt(1 - 0.34)]);
    const b = LR.setLightCam(buildSurfaceLockScene(V, { ground: false }), [0.5, 0.3, -Math.sqrt(1 - 0.34)]);
    const oa = r._lightHandleOffset(layer, { azimuth: a.az, elevation: a.el }, 100);
    const ob = r._lightHandleOffset(layer, { azimuth: b.az, elevation: b.el }, 100);
    // same screen xy only when both were aimed under the same camera (scenes use default camera == cam above)
    const sa = V.Geometry3D.rotatePoint(V.Scene3D.Lighting.towardLight({ azimuth: a.az, elevation: a.el }), { yaw: cam.yaw, pitch: cam.pitch, roll: 0 });
    const sb = V.Geometry3D.rotatePoint(V.Scene3D.Lighting.towardLight({ azimuth: b.az, elevation: b.el }), { yaw: cam.yaw, pitch: cam.pitch, roll: 0 });
    expect(sa.z).toBeGreaterThan(0); expect(sb.z).toBeLessThan(0);
    expect(oa.dx).toBeCloseTo(ob.dx, 4); expect(oa.dy).toBeCloseTo(ob.dy, 4);
  });

  it('tone memo: tone is evaluated lazily once per revealed vertex, so a repeated orbit re-evaluates none; a light move re-tones without re-baking', () => {
    // The memo fills as rotation REVEALS vertices (surface-lock.js frame loop), so the first sweep may evaluate tone for newly
    // facing vertices; a second identical sweep must evaluate nothing and bake nothing.
    const s = LR.buildCase(V, { markSpace: 'surface', ground: false, shadow: false });
    const yaws = [-20, -10, 0, 15, 40, 80];
    const first = LR.orbitCounters(s, yaws);
    expect(first.frames).toBeGreaterThan(0);
    expect(first.bakeMisses).toBe(0);
    const again = LR.orbitCounters(s, yaws, { warm: false });
    expect(again.bakeMisses).toBe(0);
    expect(again.toneEvals).toBe(0);
    const move = LR.lightMoveCounters(s, [{ az: 60, el: 30 }, { az: 200, el: 55 }]);
    expect(move.bakeMisses).toBe(0);
    expect(move.toneEvals).toBeGreaterThan(0);
  });
});
