/*
 * Wallpaper presets — curated gallery + randomizer (Team Gamma).
 *
 * Loads wallpaper-groups.js then wallpaper-presets.js into a shared global
 * with the minimal `globalThis.window = globalThis` + eval pattern, then
 * asserts the dual-write / valid-group invariants.
 *
 * RGR: the consistency assertions (featuresToGroupId(symmetry) === group) and
 * the locked-axis assertions fail against any recipe that hand-writes a
 * symmetry tuple that disagrees with its group, or that sets tileHeight/
 * tileAngle on a square/hex group.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

const loadPresets = () => {
  // Fresh isolated global so each test run is deterministic.
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.Math = Math;
  sandbox.Object = Object;
  sandbox.Array = Array;
  sandbox.Number = Number;

  const groupsSrc = fs.readFileSync(path.join(ROOT, 'src/core/wallpaper-groups.js'), 'utf8');
  const presetsSrc = fs.readFileSync(path.join(ROOT, 'src/ui/panels/wallpaper-presets.js'), 'utf8');

  // eslint-disable-next-line no-new-func
  const run = new Function('globalThis', 'window', `${groupsSrc}\n;${presetsSrc}`);
  run(sandbox, sandbox);

  return {
    WG: sandbox.Vectura.WallpaperGroups,
    WP: sandbox.Vectura.WallpaperPresets,
  };
};

describe('WallpaperPresets — curated gallery', () => {
  let WG, WP, items;

  beforeAll(() => {
    ({ WG, WP } = loadPresets());
    items = WP.list();
  });

  test('exposes list() and randomize() and dropped the phase-0 flag', () => {
    expect(typeof WP.list).toBe('function');
    expect(typeof WP.randomize).toBe('function');
    expect(WP._isPhase0Stub).toBeUndefined();
  });

  test('ships a rich gallery (14-24 recipes)', () => {
    expect(items.length).toBeGreaterThanOrEqual(14);
    expect(items.length).toBeLessThanOrEqual(24);
  });

  test('every recipe id is unique, kebab-case, prefixed wallpaper-', () => {
    const ids = items.map((it) => it.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^wallpaper-[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  test('every name is a non-empty artist-facing string (no crystallographic code)', () => {
    for (const it of items) {
      expect(typeof it.name).toBe('string');
      expect(it.name.trim().length).toBeGreaterThan(0);
      // Crystallographic codes look like p4m / pgg / p31m — names must not be one.
      expect(it.name).not.toMatch(/^p[0-9]/);
    }
  });

  test('every recipe dual-writes group + symmetry consistently, group ∈ GROUP_IDS', () => {
    for (const it of items) {
      const m = it.mirror;
      expect(WG.GROUP_IDS).toContain(m.group);
      expect(m.symmetry).toBeTruthy();
      // The consistency invariant: symmetry tuple resolves back to the group.
      expect(WG.featuresToGroupId(m.symmetry)).toBe(m.group);
      // And symmetry equals the canonical FEATURES tuple for that group.
      expect(m.symmetry).toEqual(WG.FEATURES[m.group]);
    }
  });

  test('locked-axis recipes never carry conflicting tileHeight / tileAngle', () => {
    for (const it of items) {
      const m = it.mirror;
      const locks = WG.getLockedAxes(m.group);
      if (locks.tileHeight) {
        expect(m.tileHeight).toBeUndefined();
      }
      if (locks.tileAngle) {
        expect(m.tileAngle).toBeUndefined();
      }
    }
  });

  test('tile params stay within tasteful bounds', () => {
    for (const it of items) {
      const m = it.mirror;
      expect(m.tileWidth).toBeGreaterThanOrEqual(40);
      expect(m.tileWidth).toBeLessThanOrEqual(160);
      if (m.tileHeight !== undefined) {
        expect(m.tileHeight).toBeGreaterThanOrEqual(40);
        expect(m.tileHeight).toBeLessThanOrEqual(160);
      }
      if (m.tileAngle !== undefined) {
        expect(m.tileAngle).toBeGreaterThanOrEqual(40);
        expect(m.tileAngle).toBeLessThanOrEqual(110);
      }
      if (m.domainScale !== undefined) {
        expect(m.domainScale).toBeGreaterThan(0.5);
        expect(m.domainScale).toBeLessThan(2);
      }
    }
  });

  test('Rolling Tide was renamed to Brick Path', () => {
    expect(items.find((it) => it.name === 'Rolling Tide')).toBeUndefined();
    const bp = items.find((it) => it.name === 'Brick Path');
    expect(bp).toBeTruthy();
    expect(bp.id).toBe('wallpaper-brick-path');
    expect(bp.mirror.group).toBe('pg');
  });

  test('Kaleidoscope and Star Anise are present and tilted off-axis from their group cards', () => {
    const kal = items.find((it) => it.name === 'Kaleidoscope');
    const star = items.find((it) => it.name === 'Star Anise');
    expect(kal).toBeTruthy();
    expect(star).toBeTruthy();
    expect(kal.mirror.group).toBe('p3m1');
    expect(star.mirror.group).toBe('p31m');
    expect(kal.mirror.rotation).toBeGreaterThan(0);
    expect(star.mirror.rotation).toBeGreaterThan(0);
  });

  test('no recipe duplicates a bare group card — each differs in a visible axis', () => {
    // A recipe earns its slot only by differing from its group's default look in
    // an axis the icon SHOWS: pattern angle, alternate domain (variantV1), tile
    // aspect, or a non-90° lattice skew. domainScale alone is too subtle to count.
    for (const it of items) {
      const m = it.mirror;
      const hasRotation = (m.rotation || 0) !== 0;
      const hasVariant = !!m.variantV1;
      const hasAspect = m.tileHeight !== undefined && m.tileWidth !== undefined
        && Math.abs(m.tileHeight - m.tileWidth) > 1e-6;
      const hasSkew = m.tileAngle !== undefined && Math.abs(m.tileAngle - 90) > 1e-6;
      expect(hasRotation || hasVariant || hasAspect || hasSkew).toBe(true);
    }
  });

  test('gallery spans all five lattice families', () => {
    const lattices = new Set(items.map((it) => it.mirror.symmetry.lattice));
    expect(lattices).toEqual(new Set(['oblique', 'rectangular', 'rhombic', 'square', 'hexagonal']));
  });

  test('variantV1 only set on groups that expose an alternate domain', () => {
    for (const it of items) {
      if (it.mirror.variantV1) {
        expect(WG.GROUPS[it.mirror.group].hasV1).toBe(true);
      }
    }
  });
});

describe('WallpaperPresets — randomize()', () => {
  let WG, WP;

  beforeAll(() => {
    ({ WG, WP } = loadPresets());
  });

  test('500 unconstrained rolls all yield a valid, consistent group', () => {
    for (let i = 0; i < 500; i++) {
      const r = WP.randomize();
      expect(WG.GROUP_IDS).toContain(r.group);
      expect(WG.featuresToGroupId(r.symmetry)).toBe(r.group);
      expect(r.symmetry).toEqual(WG.FEATURES[r.group]);
    }
  });

  test('500 rolls keep params within tasteful bounds and respect locked axes', () => {
    for (let i = 0; i < 500; i++) {
      const r = WP.randomize();
      const locks = WG.getLockedAxes(r.group);

      expect(r.tileWidth).toBeGreaterThanOrEqual(40);
      expect(r.tileWidth).toBeLessThanOrEqual(160);
      expect(r.tileHeight).toBeGreaterThanOrEqual(40);
      expect(r.tileHeight).toBeLessThanOrEqual(160);
      expect(r.domainScale).toBeGreaterThan(0.5);
      expect(r.domainScale).toBeLessThan(2);
      expect(r.rotation).toBeGreaterThanOrEqual(0);
      expect(r.rotation).toBeLessThanOrEqual(359);

      if (locks.tileHeight) {
        expect(r.tileHeight).toBe(r.tileWidth);
      }
      if (locks.tileAngle) {
        expect(r.tileAngle).toBe(r.symmetry.lattice === 'hexagonal' ? 60 : 90);
      } else {
        expect(r.tileAngle).toBeGreaterThanOrEqual(40);
        expect(r.tileAngle).toBeLessThanOrEqual(110);
      }

      if (r.variantV1) {
        expect(WG.GROUPS[r.group].hasV1).toBe(true);
      }
    }
  });

  test('lattice lock keeps the locked lattice across many rolls', () => {
    const current = { group: 'p6m', symmetry: WG.FEATURES.p6m };
    for (let i = 0; i < 200; i++) {
      const r = WP.randomize({ locked: { lattice: true }, current });
      expect(r.symmetry.lattice).toBe('hexagonal');
    }
  });

  test('rotation lock keeps the locked rotation when compatible', () => {
    const current = { group: 'p4m', symmetry: WG.FEATURES.p4m };
    for (let i = 0; i < 200; i++) {
      const r = WP.randomize({ locked: { lattice: true, rotation: true }, current });
      expect(r.symmetry.lattice).toBe('square');
      expect(r.symmetry.rotation).toBe(4);
    }
  });

  test('mirrors lock keeps the locked mirror chain when compatible', () => {
    const current = { group: 'pmm', symmetry: WG.FEATURES.pmm };
    for (let i = 0; i < 200; i++) {
      const r = WP.randomize({
        locked: { lattice: true, rotation: true, mirrors: true },
        current,
      });
      expect(r.group).toBe('pmm');
    }
  });
});
