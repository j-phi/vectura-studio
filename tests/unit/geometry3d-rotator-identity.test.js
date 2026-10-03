/*
 * U2 kernel perf (fill-style review F3) — precomputed rotator identity.
 *
 * `Geometry3D.rotatePoint` now resolves its trig once per angle set (a 4-slot
 * memo) and `makeRotator(angles)` hands back a closure with the trig resolved.
 * Both MUST be bit-identical to the legacy implementation, which is kept
 * verbatim as `rotatePointReference`. Compared with `Object.is` per component
 * so a flipped signed zero or a NaN difference also fails.
 *
 * RED: before this change `makeRotator` / `rotatePointReference` did not exist.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../..');

const loadG3 = () => {
  const context = { window: {}, console };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/core/algorithms/geometry3d.js'), 'utf8'), context);
  return context.window.Vectura.Geometry3D;
};

// Deterministic LCG so the property test is reproducible.
const lcg = (seed) => {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
};

const same = (a, b) => Object.is(a.x, b.x) && Object.is(a.y, b.y) && Object.is(a.z, b.z);

describe('Geometry3D rotator — bit-identical to the legacy rotatePoint', () => {
  const G3 = loadG3();

  test('exports makeRotator and the reference implementation', () => {
    expect(typeof G3.makeRotator).toBe('function');
    expect(typeof G3.rotatePointReference).toBe('function');
  });

  test('rotatePoint and makeRotator match the reference over 60k random points / angle sets', () => {
    const rnd = lcg(12345);
    // More than 4 distinct angle sets so the memo evicts and refills.
    const angleSets = [];
    for (let i = 0; i < 9; i += 1) {
      angleSets.push({ yaw: (rnd() - 0.5) * 720, pitch: (rnd() - 0.5) * 360, roll: (rnd() - 0.5) * 360 });
    }
    angleSets.push({ yaw: -0, pitch: 0, roll: -0 });
    angleSets.push({ yaw: 0, pitch: -0, roll: 0 });
    angleSets.push({ rotate: 33, tilt: -12 });
    angleSets.push({ yaw: '33', pitch: '-12.5', roll: '7' });
    angleSets.push({ yaw: NaN, pitch: Infinity, roll: null });
    angleSets.push({});
    angleSets.push({ yaw: 90, pitch: 90, roll: 90 });
    const rotators = angleSets.map((a) => G3.makeRotator(a));
    let mismatches = 0;
    for (let n = 0; n < 60000; n += 1) {
      const k = Math.floor(rnd() * angleSets.length);
      const p = { x: (rnd() - 0.5) * 400, y: (rnd() - 0.5) * 400, z: (rnd() - 0.5) * 400 };
      if (n % 97 === 0) { p.x = -0; p.z = 0; }
      const ref = G3.rotatePointReference(p, angleSets[k]);
      if (!same(G3.rotatePoint(p, angleSets[k]), ref)) mismatches += 1;
      if (!same(rotators[k](p), ref)) mismatches += 1;
    }
    expect(mismatches).toBe(0);
  });

  test('memo never confuses +0 and -0 angle keys', () => {
    const p = { x: 0, y: 0, z: -3 };
    const a = G3.rotatePoint(p, { yaw: 0 });
    const b = G3.rotatePoint(p, { yaw: -0 });
    expect(same(a, G3.rotatePointReference(p, { yaw: 0 }))).toBe(true);
    expect(same(b, G3.rotatePointReference(p, { yaw: -0 }))).toBe(true);
  });

  test('object-valued angles (valueOf) are recomputed, never memoised', () => {
    let v = 10;
    const ang = { yaw: { valueOf: () => v } };
    const p = { x: 1, y: 2, z: 3 };
    const a = G3.rotatePoint(p, ang);
    v = 50;
    const b = G3.rotatePoint(p, ang);
    expect(same(a, G3.rotatePointReference(p, { yaw: 10 }))).toBe(true);
    expect(same(b, G3.rotatePointReference(p, { yaw: 50 }))).toBe(true);
  });
});
