const { BASE, lenOf, useU6Harness } = require('../helpers/scene3d-fr-u6-harness');

/*
 * FILL-STYLE REVIEW U6 — artistic controls (item 2 wavelength).
 * Split from scene3d-fr-u6-artistic-controls.test.js for CI sharding; shared
 * fixtures live in tests/helpers/scene3d-fr-u6-harness.js. Every default is
 * pinned to the output of the tree this unit started from (3d-scene/fr-u5,
 * 7d20989b; sphere r40 detail 20, orthographic, Density 50).
 */

describe('Fill-style review U6 — artistic controls', () => {
  const h = useU6Harness();
  const gen = (...a) => h.gen(...a);

  describe('item 2 — wave wavelength and crest phase', () => {
    it('wavelength changes the wave and a shorter one adds samples', () => {
      const d = gen('sphere', 'hatch', 'ampSpacing');
      const short = gen('sphere', 'hatch', 'ampSpacing', { waveLength: 4 });
      const long = gen('sphere', 'hatch', 'ampSpacing', { waveLength: 14 });
      expect(short.hash).not.toBe(d.hash);
      expect(long.hash).not.toBe(d.hash);
      const pts = (r) => r.paths.reduce((a, p) => a + p.length, 0);
      expect(pts(short)).toBeGreaterThan(pts(d));
      expect(gen('sphere', 'hatch', 'trochoidLoop', { waveLength: 12 }).hash).not.toBe(BASE['sphere/hatch/trochoidLoop']);
    });

    it('a wave on a box is the plain ladder, so the controls are greyed there', () => {
      expect(gen('box', 'hatch', 'ampSpacing', { waveLength: 4 }).hash).toBe(BASE['box/hatch/ladder']);
    });
  });
});
