const { BASE, lenOf, useU6Harness } = require('../helpers/scene3d-fr-u6-harness');

/*
 * FILL-STYLE REVIEW U6 — artistic controls (item 4).
 * Split from scene3d-fr-u6-artistic-controls.test.js for CI sharding; shared
 * fixtures live in tests/helpers/scene3d-fr-u6-harness.js. Every default is
 * pinned to the output of the tree this unit started from (3d-scene/fr-u5,
 * 7d20989b; sphere r40 detail 20, orthographic, Density 50).
 */

describe('Fill-style review U6 — artistic controls', () => {
  const h = useU6Harness();
  const gen = (...a) => h.gen(...a);
  gen.fresh = (...a) => h.gen.fresh(...a);

  describe('item 4 — taper length, tip width, highlight softness', () => {
    it('each changes tapered ends', () => {
      const d = gen('sphere', 'hatch', 'taperedEnds');
      ['taperLength', 'taperTipWidth', 'taperSoftness'].forEach((k) => {
        const v = { taperLength: 9, taperTipWidth: 0.05, taperSoftness: 0.22 }[k];
        expect(gen('sphere', 'hatch', 'taperedEnds', { [k]: v }).hash, k).not.toBe(d.hash);
      });
    });

    it('taper length 0 removes the end taper', () => {
      const none = gen('sphere', 'hatch', 'taperedEnds', { taperLength: 0 });
      const d = gen('sphere', 'hatch', 'taperedEnds');
      expect(none.hash).not.toBe(d.hash);
      // Tip width then has no effect.
      expect(gen('sphere', 'hatch', 'taperedEnds', { taperLength: 0, taperTipWidth: 0.1 }).hash).toBe(none.hash);
    });

    it('the taper keys do nothing to the nib law', () => {
      expect(gen('sphere', 'hatch', 'nibAngle', { taperLength: 9 }).hash).toBe(BASE['sphere/hatch/nibAngle']);
    });
  });
});
