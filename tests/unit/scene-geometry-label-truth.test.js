const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Geometry label truth — the object inspector's Geometry rows must READ the
 * quantity their label names.
 *
 * RGR — the labels lied. A torus's "Diameter" showed `sx`, but the chart builds
 * the ring at `major = 0.75·sx` and the tube at `minor = 0.28·min(sy,sz)`, so an
 * sx-80 torus is 125 mm across, not 80. The same half-extent lie ran through
 * cylinder/cone "Height", pyramid "Base"/"Height", capsule "Length" and both
 * torus-knot rows.
 *
 * The fix is a DISPLAY layer only (Scene3D.Params.SIZE_DISPLAY): the panel
 * converts the stored param to the labelled quantity for the readout and back
 * on edit. The stored params and every mesh builder are untouched — the tests
 * below pin that, so a saved document can never render differently.
 */

const RUNTIME = { includeRenderer: false, includeUi: false, includeApp: false, includeMain: false };

describe('Scene3D geometry — the Geometry labels tell the truth', () => {
  let runtime, V, P, Scene;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(RUNTIME);
    V = runtime.window.Vectura;
    P = V.Scene3D.Params;
    Scene = V.Scene3D.Scene;
  });

  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  // Per-axis bounding box of the UNTRANSFORMED mesh a bag produces.
  const extent = (primitive, params) => {
    const mesh = Scene.buildPrimitiveMesh({ primitive, params }, 1);
    const lo = { x: Infinity, y: Infinity, z: Infinity };
    const hi = { x: -Infinity, y: -Infinity, z: -Infinity };
    mesh.vertices.forEach((vt) => {
      ['x', 'y', 'z'].forEach((a) => { if (vt[a] < lo[a]) lo[a] = vt[a]; if (vt[a] > hi[a]) hi[a] = vt[a]; });
    });
    return { x: hi.x - lo.x, y: hi.y - lo.y, z: hi.z - lo.z };
  };
  const widest = (primitive, params) => {
    const e = extent(primitive, params);
    return Math.max(e.x, e.y, e.z);
  };
  const disp = (prim, key) => P.sizeDisplay(prim, key);

  // ── The headline case ────────────────────────────────────────────────────
  test('a torus Diameter READS the real world extent (sx 80 ⇒ 125 mm across)', () => {
    const bag = { sx: 80, sy: 9, sz: 9, detail: 48 };
    const d = disp('torus', 'sx');
    expect(d).toBeTruthy();
    expect(d.label).toBe('Diameter');
    expect(d.to(bag.sx, bag)).toBeCloseTo(extent('torus', bag).x, 3);
    expect(d.to(bag.sx, bag)).toBeCloseTo(125.04, 3);
  });

  test('typing a torus Diameter of 125 produces a torus 125 mm across', () => {
    const bag = { sx: 80, sy: 9, sz: 9, detail: 48 };
    const d = disp('torus', 'sx');
    const next = { ...bag, sx: d.from(125, bag) };
    expect(widest('torus', next)).toBeCloseTo(125, 3);
    // …and reading it back gives exactly what was typed (round trip).
    expect(d.to(next.sx, next)).toBeCloseTo(125, 9);
  });

  test('a torus Thickness READS the tube diameter (the mesh Y extent)', () => {
    const bag = { sx: 34, sy: 9, sz: 9, detail: 48 };
    const d = disp('torus', 'sy');
    expect(d.label).toBe('Thickness');
    expect(d.to(bag.sy, bag)).toBeCloseTo(extent('torus', bag).y, 3);
    // Editing it: a Thickness of 12 gives a 12 mm thick tube.
    const s = d.from(12, bag);
    const next = { ...bag, sy: s, sz: s };
    expect(extent('torus', next).y).toBeCloseTo(12, 3);
  });

  // ── Every labelled dimension agrees with the mesh it describes ───────────
  // label → (primitive, key, axis the label measures)
  const CASES = [
    ['box', 'sx', 'x', 'Width', { sx: 40, sy: 50, sz: 60 }],
    ['box', 'sy', 'y', 'Height', { sx: 40, sy: 50, sz: 60 }],
    ['box', 'sz', 'z', 'Depth', { sx: 40, sy: 50, sz: 60 }],
    ['plane', 'sx', 'x', 'Width', { sx: 60, sz: 80 }],
    ['plane', 'sz', 'z', 'Depth', { sx: 60, sz: 80 }],
    ['cylinder', 'sy', 'y', 'Height', { sx: 20, sy: 22, sz: 20, detail: 40 }],
    ['cone', 'sy', 'y', 'Height', { sx: 20, sy: 22, sz: 20, detail: 40 }],
    ['pyramid', 'sx', 'x', 'Base', { sx: 24, sy: 26, sz: 24, detail: 40 }],
    ['pyramid', 'sy', 'y', 'Height', { sx: 24, sy: 26, sz: 24, detail: 40 }],
    ['capsule', 'sy', 'y', 'Length', { sx: 14, sy: 16, sz: 14, detail: 40 }],
    ['torus', 'sx', 'x', 'Diameter', { sx: 34, sy: 9, sz: 9, detail: 48 }],
    ['torus', 'sy', 'y', 'Thickness', { sx: 34, sy: 9, sz: 9, detail: 48 }],
    ['torusKnot', 'sx', 'z', 'Span', { sx: 30, sy: 6, sz: 6, detail: 48 }],
  ];

  test('every extent-named Geometry row equals the mesh extent it names', () => {
    const bad = [];
    CASES.forEach(([prim, key, axis, label, bag]) => {
      const d = disp(prim, key);
      const shown = d ? d.to(bag[key], bag) : bag[key];
      const real = extent(prim, bag)[axis];
      if (d && d.label !== label) bad.push(`${prim}.${key} label ${d.label} ≠ ${label}`);
      // The labelled number describes the CONTINUOUS surface; a tessellated
      // chart inscribes it, so allow 0.1% for the sampled shapes.
      if (Math.abs(shown - real) > Math.max(0.02, real * 0.001)) {
        bad.push(`${prim}.${key} (${label}) shows ${shown.toFixed(3)} but the mesh is ${real.toFixed(3)}`);
      }
    });
    expect(bad).toEqual([]);
  });

  test('radius-named rows really are radii (half the extent)', () => {
    const bad = [];
    [
      ['sphere', 'radius', 'x', { radius: 25, detail: 40 }],
      ['cylinder', 'sx', 'x', { sx: 20, sy: 22, sz: 20, detail: 40 }],
      ['cone', 'sx', 'x', { sx: 20, sy: 22, sz: 20, detail: 40 }],
      ['capsule', 'sx', 'x', { sx: 14, sy: 16, sz: 14, detail: 40 }],
      ['ellipsoid', 'sx', 'x', { sx: 30, sy: 20, sz: 22, detail: 40 }],
      ['ellipsoid', 'sy', 'y', { sx: 30, sy: 20, sz: 22, detail: 40 }],
      ['superellipsoid', 'sz', 'z', { sx: 26, sy: 20, sz: 30, detail: 40 }],
    ].forEach(([prim, key, axis, bag]) => {
      const d = disp(prim, key);
      // A radius row is NOT converted — the stored value already is the radius.
      if (d) bad.push(`${prim}.${key} should not be converted`);
      if (Math.abs(bag[key] * 2 - extent(prim, bag)[axis]) > 0.02) {
        bad.push(`${prim}.${key} is not half the extent`);
      }
    });
    expect(bad).toEqual([]);
  });

  test('every conversion round-trips exactly above its clamp, and never drifts', () => {
    const bad = [];
    CASES.forEach(([prim, key, , , bag]) => {
      const d = disp(prim, key);
      if (!d) return;
      const base = d.to(bag[key], bag);
      // The smallest number this row can ever show: where the mesh floor binds.
      const floor = d.to(0, bag);
      [base, base * 1.7, base * 0.6, base * 0.1].forEach((shown) => {
        const stored = d.from(shown, bag);
        const back = d.to(stored, { ...bag, [key]: stored });
        // Exact above the clamp; at/below it the row settles on the clamped
        // value and STAYS there (a second pass must not move it again).
        const settled = d.to(d.from(back, bag), bag);
        if (Math.abs(settled - back) > 1e-9) bad.push(`${prim}.${key} drifts: ${shown} → ${back} → ${settled}`);
        if (back < shown - 1e-6) bad.push(`${prim}.${key} lost size: ${shown} → ${back}`);
        // Above the floor the round trip must be EXACT; at/below it the row is
        // pinned to the floor (the geometry genuinely cannot be smaller).
        if (shown > floor + 1e-6 && Math.abs(back - shown) > 1e-6) {
          bad.push(`${prim}.${key}: ${shown} → ${stored} → ${back}`);
        }
        if (shown <= floor && Math.abs(back - floor) > 1e-6) {
          bad.push(`${prim}.${key} did not pin to its floor ${floor}: ${shown} → ${back}`);
        }
      });
    });
    expect(bad).toEqual([]);
  });

  // ── The non-invertible clamps ────────────────────────────────────────────
  test('torus Thickness at the floor writes the canonical preimage — same mesh', () => {
    // minor = max(1, 0.28·min(sy,sz)): every sy ≤ 1/0.28 is floored to minor 1,
    // so the displayed Thickness is 2 for all of them. Editing at that floor
    // writes the LARGEST such sy (1/0.28), which builds the IDENTICAL mesh.
    const d = disp('torus', 'sy');
    const floored = { sx: 34, sy: 1, sz: 1, detail: 24 };
    expect(d.to(floored.sy, floored)).toBeCloseTo(2, 9);
    const s = d.from(2, floored);
    expect(s).toBeCloseTo(1 / 0.28, 6);
    const rewritten = { ...floored, sy: s, sz: s };
    expect(Scene.buildPrimitiveMesh({ primitive: 'torus', params: rewritten }, 1).vertices)
      .toEqual(Scene.buildPrimitiveMesh({ primitive: 'torus', params: floored }, 1).vertices);
  });

  test('capsule Length below the diameter clamps to the sphere it really is', () => {
    // length = 2·max(r, sy) with r = max(1, min(sx,sz)): a capsule with sy < r
    // IS a sphere of radius r, and its true length is 2r. The row shows 2r and
    // an edit below 2r writes sy = r — the same mesh.
    const d = disp('capsule', 'sy');
    const squat = { sx: 14, sy: 10, sz: 14, detail: 24 };
    expect(d.to(squat.sy, squat)).toBeCloseTo(28, 9);
    expect(extent('capsule', squat).y).toBeCloseTo(28, 6);
    const s = d.from(20, squat); // asking for a length shorter than the diameter
    expect(s).toBeCloseTo(14, 9);
    const rewritten = { ...squat, sy: s };
    expect(Scene.buildPrimitiveMesh({ primitive: 'capsule', params: rewritten }, 1).vertices)
      .toEqual(Scene.buildPrimitiveMesh({ primitive: 'capsule', params: squat }, 1).vertices);
  });

  // ── The hard constraint: nothing about a saved document changes ──────────
  test('the stored params and the emitted mesh of an untouched object are unchanged', () => {
    const GEOMETRIES = P.PRIMITIVES;
    GEOMETRIES.forEach((g) => {
      const bag = P.PRIMITIVE_CREATE_DEFAULTS[g];
      // normalization must not rewrite a bag because of the display layer
      const normalized = P.normalizeObjectLayerParams({ primitive: g, params: { ...bag } });
      Object.keys(bag).forEach((k) => { expect(normalized.params[k]).toEqual(bag[k]); });
    });
  });

  test('SIZE_DISPLAY is pure metadata — it never mutates the bag it is given', () => {
    const bag = { sx: 34, sy: 9, sz: 9, detail: 24 };
    const snapshot = JSON.stringify(bag);
    ['sx', 'sy'].forEach((k) => {
      const d = disp('torus', k);
      d.to(bag[k], bag);
      d.from(50, bag);
    });
    expect(JSON.stringify(bag)).toBe(snapshot);
  });

  test('the size-preserving swap still reads the STORED params (unaffected)', () => {
    // buildPrimitiveParams must be blind to the display layer: an 80 mm torus
    // swapped to a box is still an ~80 mm box.
    const torus = { ...P.PRIMITIVE_CREATE_DEFAULTS.torus, sx: 49.94 };
    expect(P.primitiveNominalSize('torus', torus)).toBeCloseTo(80, 0);
    const box = P.buildPrimitiveParams('box', 'torus', torus);
    expect(widest('box', box)).toBeGreaterThan(72);
    expect(widest('box', box)).toBeLessThan(88);
    // And the swap's own size map is still the untouched closed form.
    expect(P.primitiveNominalSize('torus', { sx: 80, sy: 9, sz: 9 })).toBeCloseTo(125.04, 6);
  });
});
