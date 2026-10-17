const { useFillFixture } = require('../helpers/scene3d-fill-fixture');

/*
 * Scene3D fill — wave controls (wavelength and crest phase) on the wave laws
 * (ampSpacing, its loop and interlocked forms). Each control must move the drawing
 * where it is offered and do nothing where the panel greys it. Split from
 * scene3d-fill-mark-controls only because a wave render is the most expensive
 * fill (the file is the CI shard unit). Output drift: scene3d-fill-style-drift.
 */

describe('Scene3D fill — wave controls', () => {
  const h = useFillFixture();
  const gen = (...a) => h.gen(...a);

  describe('wave wavelength and crest phase', () => {
    it('wavelength changes the wave, a shorter one adds samples, and it reaches the loop form', () => {
      const d = gen('sphere', 'hatch', 'ampSpacing');
      const short = gen('sphere', 'hatch', 'ampSpacing', { waveLength: 4 });
      const long = gen('sphere', 'hatch', 'ampSpacing', { waveLength: 14 });
      expect(short.hash).not.toBe(d.hash);
      expect(long.hash).not.toBe(d.hash);
      const pts = (r) => r.paths.reduce((a, p) => a + p.length, 0);
      expect(pts(short)).toBeGreaterThan(pts(d));
      const loop = gen('sphere', 'hatch', 'trochoidLoop');
      expect(gen('sphere', 'hatch', 'trochoidLoop', { waveLength: 12 }).hash).not.toBe(loop.hash);
    });

    it('a wave on a box is the plain ladder, so the wave controls are greyed there', () => {
      const ladder = gen('box', 'hatch', 'ladder');
      expect(gen('box', 'hatch', 'ampSpacing', { waveLength: 4 }).hash).toBe(ladder.hash);
    });

    it('each crest phase draws something different; In is the aligned default', () => {
      const hashes = ['auto', 'in', 'anti', 'jit', 'walk'].map((c) => gen('sphere', 'hatch', 'ampSpacing', { waveCrest: c }).hash);
      expect(hashes[0]).toBe(gen('sphere', 'hatch', 'ampSpacing').hash);
      expect(hashes[1]).toBe(hashes[0]); // ampSpacing is already aligned
      expect(new Set([hashes[0], hashes[2], hashes[3], hashes[4]]).size).toBe(4);
    });

    it('crest phase overrides the Phase sub-control on an interlocked wave', () => {
      const anti = gen('sphere', 'hatch', 'interlockWeave');
      expect(gen('sphere', 'hatch', 'interlockWeave', { waveCrest: 'walk' }).hash).not.toBe(anti.hash);
      expect(gen('sphere', 'hatch', 'interlockWeave', { waveCrest: 'anti' }).hash).toBe(anti.hash);
    });
  });
});
