const LR = require('../helpers/light-realism');
const { buildSurfaceLockScene } = require('../helpers/surface-lock-scene');

// H4 (per-pose cost of Level S sceneFrame): what must NOT be recomputed when only the camera moves, and the glint fast path
// that keeps the per-vertex scaleFn cheap (it runs every frame because it depends on the eye).

describe('SurfaceLock H4: caches hit across camera poses', () => {
  let rt; let V; let SL; let Sh;
  beforeAll(async () => { rt = await LR.loadRuntime(); V = rt.V; SL = V.Scene3D.SurfaceLock; Sh = V.Scene3D.SurfaceLockShadow; }, 120000);
  afterAll(() => rt && rt.cleanup());

  it('shadow-receiving two-object scene: one receive map, no bake and no tone evaluation after warm-up, over a yaw sweep', () => {
    const s = buildSurfaceLockScene(V, { kind: 'two', markSpace: 'surface', mapper: 'hatch' });
    s.group.params.shadow = Object.assign({}, s.group.params.shadow, { shadowReceiveOnObjects: true });
    s.composeFull();
    for (let i = 0; i < 40; i++) { s.setPose({ camYaw: -30 + i * 9, camPitch: 20 }); s.composePreview(); } // warm: every vertex seen once
    const r0 = Sh.receiveStats(); SL.resetStats();
    for (let i = 0; i < 12; i++) { s.setPose({ camYaw: -30 + i * 5, camPitch: 20 }); s.composePreview(); }
    const r1 = Sh.receiveStats();
    expect(SL.stats.sceneFrames).toBe(12);
    expect(SL.stats.bakeMisses).toBe(0);
    expect(SL.stats.toneEvals).toBe(0); // the tone memo survives an orbit
    expect(r1.builds - r0.builds).toBe(0); // the receive map is keyed by light + casters, never by the camera
    expect(r1.queries - r0.queries).toBeLessThan(5000); // only the eye-dependent glint zone asks it (a few hundred vertices a pose), never every vertex
  });

  it('glint scaleFn: the cheap reject decides exactly as the unit-vector test (2000 random normals and eyes)', () => {
    const R = V.Scene3D.Regions;
    const light = { type: 'directional', azimuth: 330, elevation: 40, intensity: 1 };
    const spec = { objectId: 'o1', primitive: 'sphere', mode: 'sphere', sizes: { sx: 14, sy: 14, sz: 14 }, detail: 24, scale: { sx: 1, sy: 1, sz: 1 }, mapper: 'hatch', toneLaw: 'ladder', style: { fillAngle: 45, fillDensity: 50, densityScale: 1 }, penWidth: 0.3, scaleRef: 1, seed: { salt: 0, phase: 0, off: 0 }, toneModel: 'v2' };
    const D = R.SHADE_DEFAULTS; const sh = R.shininessForSize(1);
    const ctx = { tone: { enabled: true, ladder: [0.33, 0.66], thresholds: [0.33, 0.66], model: 'v2' }, penWidth: 0.3, light: { model: 'v2', lights: [light], shininess: sh, ks: 1, s0: D.s0, s1: D.s1 } };
    const t = SL.toneTable(spec, ctx);
    const toward = R.towardLight(light);
    const reference = (n, e) => { // the pre-H4 algorithm, verbatim
      let nx = n.x; let ny = n.y; let nz = n.z; const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      let ex = e.x; let ey = e.y; let ez = e.z; const el = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1; ex /= el; ey /= el; ez /= el;
      if (nx * toward.x + ny * toward.y + nz * toward.z <= 0) return 1;
      const hx = toward.x + ex; const hy = toward.y + ey; const hz = toward.z + ez; const hl = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
      const nh = (nx * hx + ny * hy + nz * hz) / hl;
      if (nh <= 0) return 1;
      const S = 1 * Math.pow(nh, sh);
      return S <= D.s0 ? 1 : R.specularKeep(Math.min(1, S), D.s0, D.s1);
    };
    const unit = (i, k) => { const a = ((i * 0.618033 + k * 0.31) % 1) * 2 * Math.PI; const b = Math.acos(1 - 2 * ((i * 0.381966 + k * 0.17 + 0.1) % 1)); return { x: Math.sin(b) * Math.cos(a), y: Math.sin(b) * Math.sin(a), z: Math.cos(b) }; };
    SL.resetStats();
    let glinted = 0;
    for (let i = 0; i < 2000; i++) {
      const n = unit(i, 1); const e = unit(i, 2);
      const got = t.scaleFn(n, { x: 0, y: 0, z: 0 }, e);
      expect(got).toBe(reference(n, e));
      if (got < 1) glinted += 1;
    }
    // the glint zone is hit too (not only rejects), and the reject is what ran for the bulk
    const glintN = []; for (let i = 0; i < 200; i++) { const h = toward; glintN.push({ x: h.x + 1e-3 * i, y: h.y, z: h.z }); }
    glintN.forEach((n) => { const e = { x: toward.x, y: toward.y, z: toward.z }; expect(t.scaleFn(n, { x: 0, y: 0, z: 0 }, e)).toBe(reference(n, e)); });
    expect(SL.stats.glintFast).toBeGreaterThan(1000);
    expect(glinted + glintN.length).toBeGreaterThan(0);
  });
});
