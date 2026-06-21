/*
 * Picture-driven algorithms — Dotscreen (halftone) + Weave (imageWeave) (RGR).
 *
 * Both sample a luminance field (the built-in shaded sphere when no picture is
 * uploaded) via window.Vectura.ImageSource and emit pen-ready vector paths.
 * These tests pin the tonal response (darker → bigger dots / tighter wobble),
 * the shape/connection options, and determinism.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Picture algorithms — Dotscreen & Weave', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  const bounds = { width: 400, height: 400, m: 20, dW: 360, dH: 360 };
  const genHalftone = (extra) =>
    V.AlgorithmRegistry.halftone.generate(
      { ...V.ALGO_DEFAULTS.halftone, ...extra },
      new V.SeededRNG(2), new V.SimpleNoise(2), bounds,
    );
  const genWeave = (extra) =>
    V.AlgorithmRegistry.imageWeave.generate(
      { ...V.ALGO_DEFAULTS.imageWeave, ...extra },
      new V.SeededRNG(2), new V.SimpleNoise(2), bounds,
    );

  // A synthetic ImageData planted in the runtime store: left half black, right
  // half white. Lets us assert tone-directional behaviour deterministically.
  const plantSplitImage = (id) => {
    const w = 32; const h = 32;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const v = x < w / 2 ? 0 : 255; // left dark, right light
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    V.ImageSource.store[id] = { width: w, height: h, data };
    return id;
  };

  // A flat mid-grey field — every cell samples the same tone, so dot SIZE is
  // uniform and directional ramps (rotation / size offset) can be isolated from
  // the built-in sphere's corner-lit tonal asymmetry.
  const plantUniform = (id, value = 90) => {
    const w = 16; const h = 16;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = value;
      data[i * 4 + 3] = 255;
    }
    V.ImageSource.store[id] = { width: w, height: h, data };
    return id;
  };
  const centreX = (loop) => {
    let lo = Infinity; let hi = -Infinity;
    loop.forEach((q) => { lo = Math.min(lo, q.x); hi = Math.max(hi, q.x); });
    return (lo + hi) / 2;
  };

  test('ImageSource fallback is the built-in shaded sphere (dark centre-ish, white corners)', () => {
    const luma = V.ImageSource.resolveLuma({});
    expect(luma(0.5, 0.5)).toBeLessThan(1); // on the sphere — shaded
    expect(luma(0.02, 0.98)).toBeGreaterThan(0.95); // corner — white background
  });

  describe('Dotscreen (halftone)', () => {
    test('emits closed dot loops on the built-in source', () => {
      const paths = genHalftone({ dotSpacing: 8 });
      expect(paths.length).toBeGreaterThan(0);
      paths.forEach((p) => {
        expect(p.length).toBeGreaterThanOrEqual(4);
        expect(p.meta && p.meta.closed).toBe(true);
      });
    });

    test('darker regions produce larger dots than lighter regions', () => {
      const id = plantSplitImage('test-split-dot');
      const dotArea = (loop) => {
        let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
        loop.forEach((p) => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
        return (maxX - minX) * (maxY - minY);
      };
      const cx = bounds.m + bounds.dW / 2;
      const paths = genHalftone({ imageId: id, imageSrc: 'x', dotSpacing: 8, minDotSize: 0, maxDotSize: 6, dotThreshold: 0 });
      const left = paths.filter((p) => p[0].x < cx);
      const right = paths.filter((p) => p[0].x >= cx);
      expect(left.length).toBeGreaterThan(0);
      const avg = (arr) => arr.reduce((s, p) => s + dotArea(p), 0) / Math.max(1, arr.length);
      // Dark (left) half dots are larger than light (right) half dots (which may be absent).
      expect(avg(left)).toBeGreaterThan(avg(right));
      delete V.ImageSource.store[id];
    });

    test('polygon dot emits exactly `dotSides` corners + a closing point', () => {
      [3, 4, 5, 6, 8, 12].forEach((dotSides) => {
        const paths = genHalftone({ dotShape: 'polygon', dotSides, dotSpacing: 10 });
        expect(paths.length).toBeGreaterThan(0);
        paths.forEach((p) => {
          expect(p.length).toBe(dotSides + 1); // n corners + closing point
          expect(p.meta && p.meta.closed).toBe(true);
        });
      });
    });

    test('star point count drives the loop vertex count (2·points + close)', () => {
      [5, 6, 8].forEach((dotPoints) => {
        const paths = genHalftone({ dotShape: 'star', dotPoints, dotSpacing: 10 });
        expect(paths.length).toBeGreaterThan(0);
        paths.forEach((p) => expect(p.length).toBe(dotPoints * 2 + 1));
      });
    });

    test('gear / flower / cross / heart all emit non-empty closed loops', () => {
      [
        { dotShape: 'gear', dotTeeth: 10 },
        { dotShape: 'flower', dotPetals: 6 },
        { dotShape: 'cross' },
        { dotShape: 'heart' },
      ].forEach((extra) => {
        const paths = genHalftone({ ...extra, dotSpacing: 10 });
        expect(paths.length).toBeGreaterThan(0);
        paths.forEach((p) => {
          expect(p.length).toBeGreaterThanOrEqual(4);
          expect(p.meta && p.meta.closed).toBe(true);
          expect(p[0].x).toBeCloseTo(p[p.length - 1].x, 6); // closed
          expect(p[0].y).toBeCloseTo(p[p.length - 1].y, 6);
        });
      });
    });

    test('legacy shape ids remap onto the parametric scheme (square/diamond → 4-gon)', () => {
      ['square', 'diamond'].forEach((dotShape) => {
        const paths = genHalftone({ dotShape, dotSpacing: 10 });
        expect(paths.length).toBeGreaterThan(0);
        paths.forEach((p) => expect(p.length).toBe(5)); // 4 corners + close
      });
      // legacy 'square' (4-gon @45°) ≡ explicit polygon(4) spun 45°.
      const legacy = genHalftone({ dotShape: 'square', dotSpacing: 10 });
      const explicit = genHalftone({ dotShape: 'polygon', dotSides: 4, dotSpin: 45, dotSpacing: 10 });
      expect(JSON.stringify(legacy)).toBe(JSON.stringify(explicit));
    });

    test('unknown dot shapes fall back to a circle', () => {
      const bogus = genHalftone({ dotShape: 'octahedron-of-doom', dotSpacing: 10 });
      const circle = genHalftone({ dotShape: 'circle', dotSpacing: 10 });
      expect(JSON.stringify(bogus)).toBe(JSON.stringify(circle));
    });

    test('universal dot params at defaults leave the classic circle screen untouched', () => {
      const base = genHalftone({ dotSpacing: 9 });
      const same = genHalftone({
        dotSpacing: 9, dotSpin: 0, dotSpinAmount: 0,
        dotJitter: 0, dotAspect: 1, markerFill: 'none',
      });
      expect(JSON.stringify(same)).toBe(JSON.stringify(base));
    });

    // Mean per-dot bounding box across the screen.
    const meanBox = (paths) => {
      let w = 0; let h = 0;
      paths.forEach((p) => {
        let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
        p.forEach((q) => { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y); });
        w += maxX - minX; h += maxY - minY;
      });
      return { w: w / paths.length, h: h / paths.length };
    };

    test('base rotation reorients a polygon (4-gon stood on a corner) without changing count', () => {
      // polygon(4) is point-up by default (a diamond, 2·r·√2 wide); a 45° spin
      // flattens it to an axis-aligned square (2r wide), shrinking the box.
      const point = genHalftone({ dotShape: 'polygon', dotSides: 4, dotSpacing: 9 });
      const flat = genHalftone({ dotShape: 'polygon', dotSides: 4, dotSpin: 45, dotSpacing: 9 });
      expect(flat.length).toBe(point.length);
      const pb = meanBox(point); const fb = meanBox(flat);
      expect(pb.w).toBeGreaterThan(fb.w * 1.2); // diamond stance is measurably wider
    });

    test('rotation offset ramps the per-dot angle across the screen direction', () => {
      // Uniform tone → equal-size dots, so box width reflects only rotation. A +45°
      // offset along +X (dir 0°) rotates dots progressively toward the flat square
      // (narrower) on the right, leaving the wider diamond stance on the left.
      const id = plantUniform('test-uniform-rot');
      const cx = bounds.m + bounds.dW / 2;
      const gap = (run) => {
        const l = run.filter((p) => centreX(p) < cx);
        const r = run.filter((p) => centreX(p) >= cx);
        expect(l.length).toBeGreaterThan(0);
        expect(r.length).toBeGreaterThan(0);
        return meanBox(l).w - meanBox(r).w;
      };
      const ramped = genHalftone({
        imageId: id, imageSrc: 'x', dotThreshold: 0,
        dotShape: 'polygon', dotSides: 4, dotSpacing: 9,
        dotSpinDir: 0, dotSpinAmount: 45, dotSpinCurve: 'linear',
      });
      const flatRun = genHalftone({
        imageId: id, imageSrc: 'x', dotThreshold: 0,
        dotShape: 'polygon', dotSides: 4, dotSpacing: 9,
      });
      const rampedGap = gap(ramped);
      expect(rampedGap).toBeGreaterThan(0.5); // clear left-wide / right-narrow split
      expect(Math.abs(gap(flatRun))).toBeLessThan(0.05); // no ramp ⇒ symmetric
      delete V.ImageSource.store[id];
    });

    test('aspect stretches dots horizontally while preserving the dot count', () => {
      const round = genHalftone({ dotShape: 'polygon', dotSides: 4, dotSpacing: 10, dotAspect: 1 });
      const wide = genHalftone({ dotShape: 'polygon', dotSides: 4, dotSpacing: 10, dotAspect: 3 });
      expect(wide.length).toBe(round.length);
      const r = meanBox(round); const w = meanBox(wide);
      expect(w.w).toBeGreaterThan(r.w); // wider
      expect(w.h).toBeLessThan(r.h); // and shorter (area-preserving squash)
    });

    test('jitter perturbs the screen but stays deterministic', () => {
      const plain = genHalftone({ dotSpacing: 9 });
      const jittered = genHalftone({ dotSpacing: 9, dotJitter: 60 });
      expect(JSON.stringify(jittered)).not.toBe(JSON.stringify(plain));
      // Decorrelated spatial hash → identical across runs (no RNG-order dependence).
      expect(JSON.stringify(genHalftone({ dotSpacing: 9, dotJitter: 60 })))
        .toBe(JSON.stringify(genHalftone({ dotSpacing: 9, dotJitter: 60 })));
    });

    test('interior Fill adds hatch lines inside dots, gated by markerFill', () => {
      // Coarse, dark screen → large dots that clear the fill size gate.
      const opts = { dotSpacing: 9, maxDotSize: 10, minDotSize: 3, dotThreshold: 0, contrast: 30 };
      const none = genHalftone({ ...opts, markerFill: 'none' });
      const hatched = genHalftone({ ...opts, markerFill: 'hatch', fillDensity: 6 });
      const fills = hatched.filter((p) => p.meta && p.meta.markerFill);
      expect(fills.length).toBeGreaterThan(0); // fill lines were generated
      // The closed dot outlines themselves are unchanged in count.
      const dots = hatched.filter((p) => !(p.meta && p.meta.markerFill));
      expect(dots.length).toBe(none.length);
    });

    test('raising the white cutoff drops more (lighter) dots', () => {
      const few = genHalftone({ dotThreshold: 2, dotSpacing: 7 }).length;
      const fewer = genHalftone({ dotThreshold: 45, dotSpacing: 7 }).length;
      expect(fewer).toBeLessThan(few);
    });

    test('is deterministic', () => {
      expect(JSON.stringify(genHalftone({ dotSpacing: 9 }))).toBe(JSON.stringify(genHalftone({ dotSpacing: 9 })));
    });

    test('smart edges merges heavily-overlapping dots into fewer, still-closed outlines', () => {
      // Large dots on a tight grid overlap heavily; the union collapses stacked
      // circles into single traced blobs, so the path count drops sharply.
      const opts = { dotSpacing: 5.5, maxDotSize: 12, contrast: 30 };
      const raw = genHalftone({ ...opts, smartEdges: false });
      const merged = genHalftone({ ...opts, smartEdges: true });
      expect(merged.length).toBeGreaterThan(0);
      expect(merged.length).toBeLessThan(raw.length * 0.75);
      // Every merged outline is still a closed loop (exterior or hole ring).
      merged.forEach((p) => {
        expect(p.length).toBeGreaterThanOrEqual(4);
        expect(p.meta && p.meta.closed).toBe(true);
      });
    });
  });

  describe('Weave (imageWeave)', () => {
    test('emits one open polyline per visible row', () => {
      const paths = genWeave({ lineCount: 40 });
      expect(paths.length).toBeGreaterThan(0);
      paths.forEach((p) => {
        expect(p.length).toBeGreaterThan(1);
        expect(p.meta && p.meta.algorithm).toBe('imageWeave');
      });
    });

    test('continuity:single collapses the rows into a single boustrophedon stroke', () => {
      const joined = genWeave({ lineCount: 40, continuity: 'single' });
      expect(joined.length).toBe(1);
    });

    test('continuity:double keeps the rows and adds ladder connectors on both ends', () => {
      const plain = genWeave({ lineCount: 40, continuity: 'none' });
      const laddered = genWeave({ lineCount: 40, continuity: 'double' });
      // Every original row survives, plus two short connectors per adjacent pair.
      expect(laddered.length).toBeGreaterThan(plain.length);
      const connectors = laddered.filter((p) => p.length === 2);
      expect(connectors.length).toBe((plain.length - 1) * 2);
    });

    test('darker regions wobble with larger lateral excursion', () => {
      const id = plantSplitImage('test-split-weave');
      const cx = bounds.m + bounds.dW / 2;
      // Vertical spread of a row's points measures wobble amplitude (angle 0 → wobble is in Y).
      const spreadOnSide = (paths, leftSide) => {
        let maxAmp = 0;
        paths.forEach((p) => {
          const pts = p.filter((q) => (leftSide ? q.x < cx : q.x >= cx));
          if (pts.length < 2) return;
          let lo = Infinity; let hi = -Infinity;
          pts.forEach((q) => { lo = Math.min(lo, q.y); hi = Math.max(hi, q.y); });
          maxAmp = Math.max(maxAmp, hi - lo);
        });
        return maxAmp;
      };
      const paths = genWeave({ imageId: id, imageSrc: 'x', lineCount: 30, amplitude: 8, lineAngle: 0 });
      expect(spreadOnSide(paths, true)).toBeGreaterThan(spreadOnSide(paths, false) + 1);
      delete V.ImageSource.store[id];
    });

    test('is deterministic', () => {
      expect(JSON.stringify(genWeave({ lineCount: 50 }))).toBe(JSON.stringify(genWeave({ lineCount: 50 })));
    });
  });
});
