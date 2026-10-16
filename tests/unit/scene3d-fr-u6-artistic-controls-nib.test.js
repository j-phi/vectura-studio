const { BASE, lenOf, useU6Harness } = require('../helpers/scene3d-fr-u6-harness');

/*
 * FILL-STYLE REVIEW U6 — artistic controls (item 3).
 * Split from scene3d-fr-u6-artistic-controls.test.js for CI sharding; shared
 * fixtures live in tests/helpers/scene3d-fr-u6-harness.js. Every default is
 * pinned to the output of the tree this unit started from (3d-scene/fr-u5,
 * 7d20989b; sphere r40 detail 20, orthographic, Density 50).
 */

describe('Fill-style review U6 — artistic controls', () => {
  const h = useU6Harness();
  const gen = (...a) => h.gen(...a);
  gen.fresh = (...a) => h.gen.fresh(...a);

  describe('item 3 — nib angle and contrast', () => {
    it('both change the nib width law; the width-only law keeps the same centrelines', () => {
      const d = gen('sphere', 'hatch', 'nibAngle');
      const a = gen('sphere', 'hatch', 'nibAngle', { nibAngleDeg: 120 });
      const c = gen('sphere', 'hatch', 'nibAngle', { nibContrast: 0.2 });
      expect(a.hash).not.toBe(d.hash);
      expect(c.hash).not.toBe(d.hash);
      expect(a.hash).not.toBe(c.hash);
      // 45 / 0.65 written out is the default.
      expect(gen('sphere', 'hatch', 'nibAngle', { nibAngleDeg: 45, nibContrast: 0.65 }).hash).toBe(d.hash);
    });

    it('the nib keys do nothing to tapered ends (the controls are greyed there)', () => {
      expect(gen('sphere', 'hatch', 'taperedEnds', { nibAngleDeg: 120, nibContrast: 0.2 }).hash).toBe(BASE['sphere/hatch/taperedEnds']);
    });
  });
});
