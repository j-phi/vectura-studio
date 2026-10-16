const { BASE, lenOf, useU6Harness } = require('../helpers/scene3d-fr-u6-harness');

/*
 * FILL-STYLE REVIEW U6 — artistic controls (fresh default byte-identical).
 * Split from scene3d-fr-u6-artistic-controls.test.js for CI sharding; shared
 * fixtures live in tests/helpers/scene3d-fr-u6-harness.js. Every default is
 * pinned to the output of the tree this unit started from (3d-scene/fr-u5,
 * 7d20989b; sphere r40 detail 20, orthographic, Density 50).
 */

describe('Fill-style review U6 — artistic controls', () => {
  const h = useU6Harness();
  const gen = (...a) => h.gen(...a);
  gen.fresh = (...a) => h.gen.fresh(...a);

  it('a fresh default scene stays byte-identical after gamma and wave controls render', () => {
    const before = gen('sphere', 'hatch', 'ampSpacing');
    gen('sphere', 'hatch', 'ampSpacing', { toneGamma: 1.8 });
    const afterGamma = gen('sphere', 'hatch', 'ampSpacing');
    expect(JSON.stringify(afterGamma.out)).toBe(JSON.stringify(before.out));
    gen('sphere', 'hatch', 'ampSpacing', { waveLength: 4, waveCrest: 'walk' });
    const afterWave = gen('sphere', 'hatch', 'ampSpacing');
    expect(JSON.stringify(afterWave.out)).toBe(JSON.stringify(before.out));
  });
});
