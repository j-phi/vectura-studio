const { BASE, lenOf, useU6Harness } = require('../helpers/scene3d-fr-u6-harness');

/*
 * FILL-STYLE REVIEW U6 — artistic controls (item 2 crest phase).
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
    it('each crest phase draws something different from the others', () => {
      const hashes = ['auto', 'in', 'anti', 'jit', 'walk'].map((c) => gen('sphere', 'hatch', 'ampSpacing', { waveCrest: c }).hash);
      expect(hashes[0]).toBe(BASE['sphere/hatch/ampSpacing']);
      expect(hashes[1]).toBe(hashes[0]); // ampSpacing is already aligned
      expect(new Set([hashes[0], hashes[2], hashes[3], hashes[4]]).size).toBe(4);
    });
  });
});
