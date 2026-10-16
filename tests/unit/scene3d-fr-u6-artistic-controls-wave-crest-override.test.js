const { BASE, lenOf, useU6Harness } = require('../helpers/scene3d-fr-u6-harness');

/*
 * FILL-STYLE REVIEW U6 — artistic controls (item 2 crest override).
 * Split from scene3d-fr-u6-artistic-controls.test.js for CI sharding; shared
 * fixtures live in tests/helpers/scene3d-fr-u6-harness.js. Every default is
 * pinned to the output of the tree this unit started from (3d-scene/fr-u5,
 * 7d20989b; sphere r40 detail 20, orthographic, Density 50).
 */

describe('Fill-style review U6 — artistic controls', () => {
  const h = useU6Harness();
  const gen = (...a) => h.gen(...a);
  gen.fresh = (...a) => h.gen.fresh(...a);

  describe('item 2 — wave wavelength and crest phase', () => {
    it('crest phase overrides the Phase sub-control on an interlocked wave', () => {
      const anti = gen('sphere', 'hatch', 'interlockWeave');
      expect(gen('sphere', 'hatch', 'interlockWeave', { waveCrest: 'walk' }).hash).not.toBe(anti.hash);
      expect(gen('sphere', 'hatch', 'interlockWeave', { waveCrest: 'anti' }).hash).toBe(anti.hash);
    });
  });
});
