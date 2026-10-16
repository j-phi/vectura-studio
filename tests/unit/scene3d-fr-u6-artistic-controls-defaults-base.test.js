const { BASE, lenOf, useU6Harness } = require('../helpers/scene3d-fr-u6-harness');

/*
 * FILL-STYLE REVIEW U6 — artistic controls (defaults BASE table).
 * Split from scene3d-fr-u6-artistic-controls.test.js for CI sharding; shared
 * fixtures live in tests/helpers/scene3d-fr-u6-harness.js. Every default is
 * pinned to the output of the tree this unit started from (3d-scene/fr-u5,
 * 7d20989b; sphere r40 detail 20, orthographic, Density 50).
 */

describe('Fill-style review U6 — artistic controls', () => {
  const h = useU6Harness();
  const gen = (...a) => h.gen(...a);

  describe('defaults reproduce the output of the tree this unit started from', () => {
    Object.keys(BASE).forEach((key) => {
      const [prim, mapper, law] = key.split('/');
      it(key, () => {
        expect(gen(prim, mapper, law).hash).toBe(BASE[key]);
      });
    });
  });
});
