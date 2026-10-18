const { lenOf, useFillFixture } = require('../helpers/scene3d-fill-fixture');

/*
 * Scene3D fill — mark-shape controls. Each control must move the drawing where it
 * is offered (a dead control is the defect), and must do nothing where the panel
 * greys it (a greyed control that still changes the plot is the other defect).
 * Covers nib, taper, Turing stripe, stipple jitter, dot
 * screen, crossing pass, chained marks, light-relative angle, Alt fill angle and
 * the X-ray Front line (the wave controls live in scene3d-fill-wave-controls).
 * Output drift is guarded by scene3d-fill-style-drift.
 */

describe('Scene3D fill — mark-shape controls', () => {
  const h = useFillFixture();
  const gen = (...a) => h.gen(...a);

  describe('nib angle and contrast', () => {
    it('both change the nib width law; the defaults written out are the default', () => {
      const d = gen('sphere', 'hatch', 'nibAngle');
      const a = gen('sphere', 'hatch', 'nibAngle', { nibAngleDeg: 120 });
      const c = gen('sphere', 'hatch', 'nibAngle', { nibContrast: 0.2 });
      expect(a.hash).not.toBe(d.hash);
      expect(c.hash).not.toBe(d.hash);
      expect(a.hash).not.toBe(c.hash);
      expect(gen('sphere', 'hatch', 'nibAngle', { nibAngleDeg: 45, nibContrast: 0.65 }).hash).toBe(d.hash);
    });

    it('the nib keys do nothing to tapered ends (greyed there)', () => {
      const d = gen('sphere', 'hatch', 'taperedEnds');
      expect(gen('sphere', 'hatch', 'taperedEnds', { nibAngleDeg: 120, nibContrast: 0.2 }).hash).toBe(d.hash);
    });
  });

  describe('taper length, tip width, highlight softness', () => {
    it('each changes tapered ends', () => {
      const d = gen('sphere', 'hatch', 'taperedEnds');
      Object.entries({ taperLength: 9, taperTipWidth: 0.05, taperSoftness: 0.22 }).forEach(([k, v]) => {
        expect(gen('sphere', 'hatch', 'taperedEnds', { [k]: v }).hash, k).not.toBe(d.hash);
      });
    });

    it('taper length 0 removes the end taper, and tip width then has no effect', () => {
      const d = gen('sphere', 'hatch', 'taperedEnds');
      const none = gen('sphere', 'hatch', 'taperedEnds', { taperLength: 0 });
      expect(none.hash).not.toBe(d.hash);
      expect(gen('sphere', 'hatch', 'taperedEnds', { taperLength: 0, taperTipWidth: 0.1 }).hash).toBe(none.hash);
    });

    it('the taper keys do nothing to the nib law', () => {
      const d = gen('sphere', 'hatch', 'nibAngle');
      expect(gen('sphere', 'hatch', 'nibAngle', { taperLength: 9 }).hash).toBe(d.hash);
    });
  });

  describe('Turing stripe', () => {
    it('maturity, scale and alignment each change the pattern; alignment 0 is the default', () => {
      const d = gen('sphere', 'hatch', 'turingStripe');
      expect(gen('sphere', 'hatch', 'turingStripe', { patternMaturity: 60 }).hash).not.toBe(d.hash);
      expect(gen('sphere', 'hatch', 'turingStripe', { patternMaturity: 300 }).hash).not.toBe(d.hash);
      const small = gen('sphere', 'hatch', 'turingStripe', { stripeScale: 0.6 });
      const big = gen('sphere', 'hatch', 'turingStripe', { stripeScale: 2 });
      expect(small.hash).not.toBe(d.hash);
      expect(big.hash).not.toBe(small.hash);
      expect(gen('sphere', 'hatch', 'turingStripe', { stripeAlign: 0 }).hash).toBe(d.hash);
      expect(gen('sphere', 'hatch', 'turingStripe', { stripeAlign: 0.9 }).hash).not.toBe(d.hash);
    });

    it('alignment caps at 1.2 (3.0 broke the pattern into noise)', () => {
      const hi = gen('sphere', 'hatch', 'turingStripe', { stripeAlign: 3 });
      const cap = gen('sphere', 'hatch', 'turingStripe', { stripeAlign: 1.2 });
      expect(hi.hash).toBe(cap.hash);
    });

    it('scale reaches the faceted path too', () => {
      const d = gen('box', 'hatch', 'turingStripe');
      expect(gen('box', 'hatch', 'turingStripe', { stripeScale: 2 }).hash).not.toBe(d.hash);
    });
  });

  it('curved stipple honours Jitter: absent / 0 keeps the lattice, 40 and 100 scatter it', () => {
    const none = gen('sphere', 'stipple', 'ladder');
    expect(gen('sphere', 'stipple', 'ladder', { stippleJitter: 0 }).hash).toBe(none.hash);
    const j40 = gen('sphere', 'stipple', 'ladder', { stippleJitter: 40 });
    const j100 = gen('sphere', 'stipple', 'ladder', { stippleJitter: 100 });
    expect(j40.hash).not.toBe(none.hash);
    expect(j100.hash).not.toBe(j40.hash);
  });

  it('mkDotScreen follows Dot size and Dot angle; Dot angle 0 is the default', () => {
    const d = gen('sphere', 'hatch', 'mkDotScreen');
    expect(gen('sphere', 'hatch', 'mkDotScreen', { dotSize: 0.4 }).hash).not.toBe(d.hash);
    expect(gen('sphere', 'hatch', 'mkDotScreen', { dotAngle: 45 }).hash).not.toBe(d.hash);
    expect(gen('sphere', 'hatch', 'mkDotScreen', { dotAngle: 0 }).hash).toBe(d.hash);
  });

  it('penCross follows Cross angle and Cross density on Crosshatch', () => {
    const d = gen('sphere', 'crosshatch', 'penCross');
    const a = gen('sphere', 'crosshatch', 'penCross', { crossAngleDelta: 60 });
    const r = gen('sphere', 'crosshatch', 'penCross', { crossDensityRatio: 2 });
    expect(a.hash).not.toBe(d.hash);
    expect(r.hash).not.toBe(d.hash);
    expect(a.hash).not.toBe(r.hash);
  });

  describe('chained marks', () => {
    it('maze walls: on joins walls into fewer paths with the same ink (sphere and box)', () => {
      ['sphere', 'box'].forEach((prim) => {
        const off = gen(prim, 'hatch', 'mazeFill');
        const on = gen(prim, 'hatch', 'mazeFill', { chainMarks: true });
        expect(on.n, prim).toBeLessThan(off.n);
        // A join may add a connector under 0.01 mm.
        expect(Math.abs(on.ink - off.ink), prim).toBeLessThanOrEqual(Math.max(2, off.ink * 0.001));
      });
    });

    it('Voronoi edges: on joins edges into far fewer paths and cuts pen travel', () => {
      const travelOf = (out) => {
        let t = 0; let prev = null;
        out.forEach((pth) => {
          const q = pth.points || pth;
          if (q.length < 2) return;
          if (prev) t += Math.hypot(q[0].x - prev.x, q[0].y - prev.y);
          prev = q[q.length - 1];
        });
        return t;
      };
      const off = gen('sphere', 'hatch', 'voronoiWeb');
      const on = gen('sphere', 'hatch', 'voronoiWeb', { chainMarks: true });
      expect(on.n).toBeLessThan(off.n * 0.75);
      expect(travelOf(on.out)).toBeLessThan(travelOf(off.out) * 0.2);
      // A join adds a connector under one pen width, never a new mark.
      expect(on.ink).toBeLessThanOrEqual(off.ink * 1.04);
      expect(on.ink).toBeGreaterThanOrEqual(off.ink * 0.99);
    });

    it('does nothing to a law that does not chain', () => {
      const d = gen('sphere', 'hatch', 'turingStripe');
      expect(gen('sphere', 'hatch', 'turingStripe', { chainMarks: true }).hash).toBe(d.hash);
    });
  });

  describe('light-relative hatch angle (faceted shapes)', () => {
    const lightAz = (az) => ({ light: { azimuth: az } });
    // Spacing may shift with the light, so compare line DIRECTIONS only.
    const dirSet = (r) => Array.from(new Set(r.paths.filter((p) => p.length >= 2 && lenOf(p) > 8).map((p) => {
      const a = Math.atan2(p[p.length - 1][1] - p[0][1], p[p.length - 1][0] - p[0][0]);
      return Math.round(((a * 180 / Math.PI) % 180 + 180) % 180);
    }))).sort();

    it('Face reference ignores the light; Light reference follows it', () => {
      const f1 = gen('box', 'hatch', 'ladder', { angleRef: 'face' }, lightAz(200));
      const f2 = gen('box', 'hatch', 'ladder', { angleRef: 'face' }, lightAz(120));
      expect(dirSet(f1)).toEqual(dirSet(f2));
      const l1 = gen('box', 'hatch', 'ladder', { angleRef: 'light', fillAngle: 0 }, lightAz(200));
      const l2 = gen('box', 'hatch', 'ladder', { angleRef: 'light', fillAngle: 0 }, lightAz(120));
      expect(dirSet(l1)).not.toEqual(dirSet(l2));
      // Light changes a box at the same Angle (the Light reference is offered on faceted shapes).
      expect(gen('box', 'hatch', 'ladder', { angleRef: 'light' }).hash).not.toBe(gen('box', 'hatch', 'ladder').hash);
    });

    it('Angle 0 hatches along the sun projected on the face', () => {
      // A top face lit from azimuth 90 (the +X side): its lines run along world X.
      const r = gen('box', 'hatch', 'ladder', { angleRef: 'light', fillAngle: 0 }, {
        light: { azimuth: 90, elevation: 50 },
        mut: (pp) => { pp.camera = { ...pp.camera, yaw: 0, pitch: 90 }; },
      });
      const long = r.paths.filter((p) => lenOf(p) > 20);
      expect(long.length).toBeGreaterThan(2);
      long.forEach((p) => {
        const dx = Math.abs(p[p.length - 1][0] - p[0][0]);
        const dy = Math.abs(p[p.length - 1][1] - p[0][1]);
        expect(Math.min(dx, dy) / Math.max(dx, dy, 1e-6)).toBeLessThan(0.15);
      });
    });
  });

  describe('Alt fill angle (highlight Alt fill) from the shared cross-angle source', () => {
    const alt = (extra, layers) => gen('sphere', 'hatch', 'ladder', {
      highlightTreatment: 'altFill', altFillMapper: 'lines', altFillLayers: layers, ...extra,
    }, { light: { elevation: 70 } });

    it('absent key = the fixed 45 / 135, written out the same', () => {
      [1, 2].forEach((layers) => {
        expect(alt({ altFillAngle: 45, crossAngleDelta: 90 }, layers).hash, `${layers} layers`).toBe(alt({}, layers).hash);
      });
    });

    it('Alt angle turns the lines; the second layer follows the Cross angle; one layer ignores it', () => {
      const base = alt({}, 2);
      expect(alt({ altFillAngle: 20 }, 2).hash).not.toBe(base.hash);
      expect(alt({ altFillAngle: 45, crossAngleDelta: 60 }, 2).hash).not.toBe(base.hash);
      expect(alt({ altFillAngle: 45, crossAngleDelta: 60 }, 1).hash).toBe(alt({}, 1).hash);
    });
  });

  it('X-ray Front line does nothing on a faceted shape (dotted = solid on a box)', () => {
    const xr = (extra) => gen('box', 'hatch', 'ladder', { xrayFrontLineType: 'dotted', ...extra }, {
      mut: (p) => { p.objects[0].visibility = 'xray'; },
    });
    expect(xr({}).hash).toBe(xr({ xrayFrontLineType: 'solid' }).hash);
  });
});
