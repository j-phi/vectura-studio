/*
 * Wallpaper groups — composable symmetry resolver.
 *
 * Covers the FEATURES tuple model added in 2026-05-21:
 *   - featuresToGroupId: exact (lattice, rotation, mirrors) → groupId
 *   - nearestValidGroup: deterministic snap when no exact match exists
 *   - cycleInFamily: canonical walk through groups sharing a lattice
 *
 * RGR: every assertion here fails against the pre-2026-05-21 export
 * (which had no FEATURES/featuresToGroupId/etc.).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('WallpaperGroups — composable symmetry resolver', () => {
  let runtime, WG;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    WG = runtime.window.Vectura.WallpaperGroups;
  });

  afterAll(() => runtime.cleanup());

  test('FEATURES covers all 17 groups and maps to GROUPS lattices', () => {
    const ids = Object.keys(WG.FEATURES);
    expect(ids).toHaveLength(17);
    // Every FEATURES entry must agree with the GROUPS lattice field.
    for (const id of ids) {
      expect(WG.GROUPS[id]).toBeTruthy();
      expect(WG.FEATURES[id].lattice).toBe(WG.GROUPS[id].lattice);
    }
  });

  test('featuresToGroupId is a perfect inverse of FEATURES for all 17 groups', () => {
    for (const id of Object.keys(WG.FEATURES)) {
      const f = WG.FEATURES[id];
      expect(WG.featuresToGroupId(f)).toBe(id);
    }
  });

  test('featuresToGroupId returns null for invalid tuples', () => {
    // square + rotation 3: no such group
    expect(WG.featuresToGroupId({ lattice: 'square', rotation: 3, mirrors: 'straight' })).toBeNull();
    // rhombic + none: cm/cmm both carry 'straight'
    expect(WG.featuresToGroupId({ lattice: 'rhombic', rotation: 2, mirrors: 'none' })).toBeNull();
    // hexagonal + rotation 4: not legal
    expect(WG.featuresToGroupId({ lattice: 'hexagonal', rotation: 4, mirrors: 'none' })).toBeNull();
    // garbage
    expect(WG.featuresToGroupId({ lattice: 'bogus', rotation: 4, mirrors: 'none' })).toBeNull();
    expect(WG.featuresToGroupId(null)).toBeNull();
  });

  test('nearestValidGroup keeps the user choice when it is exact', () => {
    expect(WG.nearestValidGroup({ lattice: 'square', rotation: 4, mirrors: 'straight' })).toBe('p4m');
    expect(WG.nearestValidGroup({ lattice: 'hexagonal', rotation: 6, mirrors: 'all' })).toBe('p6m');
    expect(WG.nearestValidGroup({ lattice: 'oblique', rotation: 1, mirrors: 'none' })).toBe('p1');
  });

  test('nearestValidGroup snaps invalid rotation to the closest legal rotation', () => {
    // square only allows rot 4; rotation 6 → snap to 4
    expect(WG.nearestValidGroup({ lattice: 'square', rotation: 6, mirrors: 'glide' })).toBe('p4g');
    // hex rotation 4 → snap to nearest of {3,6}; 4 is closer to 3 than to 6
    expect(WG.nearestValidGroup({ lattice: 'hexagonal', rotation: 4, mirrors: 'none' })).toBe('p3');
    // hex rotation 4.5 → tie between 3 and 6, prefer higher → 6
    expect(WG.nearestValidGroup({ lattice: 'hexagonal', rotation: 4.5, mirrors: 'none' })).toBe('p6');
    // rectangular rotation 99 → snap to 2 (closest of {1,2})
    expect(WG.nearestValidGroup({ lattice: 'rectangular', rotation: 99, mirrors: 'straight' })).toBe('pmm');
  });

  test('nearestValidGroup never returns null and is deterministic', () => {
    // Cross-product sweep of every plausible input — every one must land
    // on a real group ID, never null, never undefined, never loop.
    const lats = ['oblique', 'rectangular', 'rhombic', 'square', 'hexagonal', 'bogus'];
    const rots = [1, 2, 3, 4, 6, 99];
    const mirs = ['none', 'straight', 'glide', 'straight+glide', 'corners', 'edges', 'all', 'bogus'];
    for (const lattice of lats) {
      for (const rotation of rots) {
        for (const mirrors of mirs) {
          const id = WG.nearestValidGroup({ lattice, rotation, mirrors });
          expect(typeof id).toBe('string');
          expect(WG.FEATURES[id]).toBeTruthy();
        }
      }
    }
  });

  test('rhombic + no mirror → escalates to cm/cmm (never returns null or drops to oblique)', () => {
    // Rhombic has no "no-mirror" group — the resolver must escalate to
    // 'straight' rather than relax to a different lattice.
    expect(WG.nearestValidGroup({ lattice: 'rhombic', rotation: 1, mirrors: 'none' })).toBe('cm');
    expect(WG.nearestValidGroup({ lattice: 'rhombic', rotation: 2, mirrors: 'none' })).toBe('cmm');
    // Even with glide as the request, rhombic snaps to straight (the only valid mirror set).
    expect(WG.nearestValidGroup({ lattice: 'rhombic', rotation: 2, mirrors: 'glide' })).toBe('cmm');
  });

  test('hex rot 3 → 6 with corners snaps to p6m, not p6 (escalate-not-relax)', () => {
    // The plan's regression case: coming from a mirrored state to a
    // rotation that drops "corners", we should still land on a mirrored
    // group (p6m, the only mirrored option) rather than the bare p6.
    expect(WG.nearestValidGroup({ lattice: 'hexagonal', rotation: 6, mirrors: 'corners' })).toBe('p6m');
    expect(WG.nearestValidGroup({ lattice: 'hexagonal', rotation: 6, mirrors: 'edges' })).toBe('p6m');
    // But starting from none should stay on none → p6.
    expect(WG.nearestValidGroup({ lattice: 'hexagonal', rotation: 6, mirrors: 'none' })).toBe('p6');
  });

  test('square + none stays p4 (none is valid for square rot 4)', () => {
    expect(WG.nearestValidGroup({ lattice: 'square', rotation: 4, mirrors: 'none' })).toBe('p4');
  });

  test('cycleInFamily walks every group in the lattice exactly once before wrapping', () => {
    const families = ['oblique', 'rectangular', 'rhombic', 'square', 'hexagonal'];
    for (const lattice of families) {
      const memberIds = Object.keys(WG.FEATURES).filter((id) => WG.FEATURES[id].lattice === lattice);
      const start = memberIds[0];
      const visited = [start];
      let cur = start;
      for (let i = 0; i < memberIds.length; i++) {
        cur = WG.cycleInFamily(cur, 1);
        visited.push(cur);
      }
      // After N steps we should have wrapped back to start.
      expect(visited[visited.length - 1]).toBe(start);
      // The N intermediate positions must be exactly the family members.
      const uniq = new Set(visited.slice(0, memberIds.length));
      expect(uniq.size).toBe(memberIds.length);
      for (const id of memberIds) expect(uniq.has(id)).toBe(true);
    }
  });

  test('cycleInFamily(dir=-1) walks the reverse path and wraps', () => {
    // Walking forward N then backward N must return to start.
    for (const start of ['p4', 'p3', 'pm', 'cm', 'p1']) {
      const lattice = WG.FEATURES[start].lattice;
      const N = Object.keys(WG.FEATURES).filter((id) => WG.FEATURES[id].lattice === lattice).length;
      let cur = start;
      for (let i = 0; i < N; i++) cur = WG.cycleInFamily(cur, 1);
      expect(cur).toBe(start);
      cur = start;
      for (let i = 0; i < N; i++) cur = WG.cycleInFamily(cur, -1);
      expect(cur).toBe(start);
    }
  });

  test('cycleInFamily order: rotation ascending, then mirror complexity asc (none first)', () => {
    // Square family — p4 (none) → p4m (straight) → p4g (glide) → wrap.
    expect(WG.cycleInFamily('p4', 1)).toBe('p4m');
    expect(WG.cycleInFamily('p4m', 1)).toBe('p4g');
    expect(WG.cycleInFamily('p4g', 1)).toBe('p4');

    // Hex family — p3 → p3m1 → p31m → p6 → p6m → wrap.
    expect(WG.cycleInFamily('p3', 1)).toBe('p3m1');
    expect(WG.cycleInFamily('p3m1', 1)).toBe('p31m');
    expect(WG.cycleInFamily('p31m', 1)).toBe('p6');
    expect(WG.cycleInFamily('p6', 1)).toBe('p6m');
    expect(WG.cycleInFamily('p6m', 1)).toBe('p3');
  });

  test('cycleInFamily returns input unchanged for an unknown group id', () => {
    expect(WG.cycleInFamily('not-a-group', 1)).toBe('not-a-group');
  });
});
