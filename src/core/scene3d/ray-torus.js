/**
 * Scene3D.RayTorus — closed-form ray/torus intersection.
 *
 * Standalone, dependency-free math module: given a ray (origin + direction)
 * and a torus centred at the local origin with its hole axis along +z, major
 * radius R (centre-to-tube-centre) and minor radius r (tube radius), returns
 * every REAL depth `t` along the ray (P + tD, D normalized internally) where
 * the ray crosses the implicit surface
 *
 *   (x² + y² + z² + R² − r²)² = 4R²(x² + y²)
 *
 * Substituting the ray produces a quartic in t; this module solves it via
 * Ferrari's method (depressed quartic → resolvent cubic → two quadratic
 * factors), then polishes every candidate root against the ORIGINAL quartic
 * with a few Newton iterations so floating-point drift from the resolvent
 * doesn't survive into the returned value.
 *
 * Roots are returned UNFILTERED by sign — this is a full-LINE intersection
 * (both "ahead of" and "behind" the origin), because the caller (hlr.js's
 * self-occlusion depth source, see ray-torus wiring in scene3d.js) wants
 * every point along a screen pixel's full projection line where the torus
 * surface exists, not just a forward ray. A caller that wants ray semantics
 * filters for t >= 0 itself.
 *
 * Root COUNT does not encode entry/exit parity. A genuine tangency (the
 * grazing case) is a real DOUBLE root of the quartic; depending on
 * floating-point rounding after the Newton polish it may come back as one
 * value or two very-close values — callers must compare the returned DEPTHS,
 * never rely on how many of them there are, to detect a graze.
 *
 * NUMERICAL STABILITY — the whole reason this module exists (see the header
 * comment in hlr.js and CHANGELOG: the F6/F7 self-occlusion effort). Ferrari's
 * method has one classic failure mode: its resolvent cubic ties the quartic's
 * `q` (odd-symmetry) coefficient to an auxiliary variable `m` via
 * q² = 8m(m² + pm + p²/4 − r), and the two quadratic factors divide `q` by
 * `sqrt(2m)`. When the true `q` is exactly (or very nearly) zero — which
 * happens constantly for the torus, since a huge fraction of self-occlusion
 * test rays lie in or near a symmetry plane of the surface — the resolvent's
 * matching `m` root is also near zero, so `q / sqrt(2m)` becomes a near-zero
 * divided by a near-zero: catastrophic cancellation that can blow up to
 * ±10^70 or worse on a well-posed, perfectly ordinary ray (reproduced and
 * fixed here — see the SCALE-AWARE qFloor/mFloor comments below; an earlier,
 * naive ABSOLUTE 1e-9 cutoff on `q` alone was not enough, because "how small
 * is small" depends on the magnitude of the quartic's own coefficients, which
 * scale with the scene's own document-mm distances). Below that floor this
 * solver routes to the exact biquadratic solve (`u⁴ + p u² + r = 0`) instead
 * of dividing by a near-zero `s`, which is both simpler and exact for that
 * regime — never an approximation.
 */
(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});

  // ── Cubic: m³ + B m² + C m + D = 0 — ALL real roots (1 or 3). ──────────────
  // Standard depress-then-classify-by-discriminant approach (Cardano for one
  // real root, the trigonometric form for three) — no complex-number
  // arithmetic anywhere, so every returned value is already a plain real
  // double with no imaginary residue to strip.
  const solveCubicAllReal = (B, C, D) => {
    const shift = B / 3;
    const P = C - (B * B) / 3;
    const Q = ((2 * B * B * B) / 27) - ((B * C) / 3) + D;
    const disc = (Q * Q) / 4 + (P * P * P) / 27;
    const roots = [];
    if (Math.abs(P) < 1e-14 && Math.abs(Q) < 1e-14) {
      roots.push(-shift);
      return roots;
    }
    if (disc > 1e-14) {
      const sqrtDisc = Math.sqrt(disc);
      const u = Math.cbrt(-Q / 2 + sqrtDisc);
      const v = Math.cbrt(-Q / 2 - sqrtDisc);
      roots.push(u + v - shift);
    } else {
      // Three real roots (disc <= 0 within fp noise) — trigonometric form,
      // numerically stable near a triple/double root (no cancellation the
      // way a naive Cardano cube-root split would have there).
      const rad = Math.sqrt(Math.max(0, -(P * P * P) / 27));
      const phi = rad < 1e-18 ? 0 : Math.acos(Math.max(-1, Math.min(1, (-Q / 2) / rad)));
      const m2 = 2 * Math.sqrt(Math.max(0, -P / 3));
      for (let k = 0; k < 3; k++) {
        roots.push((m2 * Math.cos((phi + (2 * Math.PI * k)) / 3)) - shift);
      }
    }
    return roots;
  };

  // u⁴ + p u² + r = 0 (the q ≈ 0 / biquadratic special case) — solved exactly
  // via the quadratic formula in w = u², never via the general Ferrari path
  // (which would need to divide by a near-zero `sqrt(2m)` right here).
  const biquadraticRoots = (p, r) => {
    const out = [];
    const disc = (p * p) - (4 * r);
    if (disc < -1e-9) return out;
    const sq = Math.sqrt(Math.max(0, disc));
    [((-p) + sq) / 2, ((-p) - sq) / 2].forEach((w) => {
      if (w >= -1e-9) {
        const su = Math.sqrt(Math.max(0, w));
        out.push(su);
        if (su > 1e-12) out.push(-su);
      }
    });
    return out;
  };

  // General quartic t⁴ + a t³ + b t² + c t + d = 0 — ALL real roots.
  const solveQuartic = (a, b, c, d) => {
    // Depress: t = u - a/4, eliminating the cubic term.
    const p = b - ((3 * a * a) / 8);
    const q = ((a * a * a) / 8) - ((a * b) / 2) + c;
    const r = ((-3 * a * a * a * a) / 256) + ((a * a * b) / 16) - ((a * c) / 4) + d;

    // Scale-aware floor for "is q negligible" — see the module header. The
    // natural scale of q, given p and r, is max(|p|^1.5, sqrt(|r|)); below
    // that scale q cannot be trusted as genuinely nonzero in this arithmetic.
    const scale = Math.max(1, Math.pow(Math.abs(p), 1.5), Math.sqrt(Math.abs(r)));
    const qFloor = 1e-9 * scale;

    let uRoots;
    if (Math.abs(q) < qFloor) {
      uRoots = biquadraticRoots(p, r);
    } else {
      // Resolvent cubic (monic form of 8m³+8pm²+(2p²-8r)m-q²=0):
      //   m³ + p m² + (p²/4 - r) m - q²/8 = 0
      const cubicRoots = solveCubicAllReal(p, ((p * p) / 4) - r, -(q * q) / 8);
      // 2m must be SAFELY positive to divide q by sqrt(2m) below. A candidate
      // whose 2m rounds to ~0 relative to `scale` is indistinguishable from
      // the biquadratic case and must not be used — that division is exactly
      // the blow-up this module exists to prevent (see header).
      const mFloor = 1e-9 * scale;
      let m = null;
      cubicRoots.forEach((cand) => {
        if (cand > mFloor && (m === null || cand > m)) m = cand;
      });
      if (m === null) {
        uRoots = biquadraticRoots(p, r);
      } else {
        uRoots = [];
        const s = Math.sqrt(2 * m);
        const c1 = (p / 2) + m + (q / (2 * s));
        const c2 = (p / 2) + m - (q / (2 * s));
        const disc1 = (s * s) - (4 * c1);
        const disc2 = (s * s) - (4 * c2);
        if (disc1 >= -1e-7) {
          const sq1 = Math.sqrt(Math.max(0, disc1));
          uRoots.push((s + sq1) / 2, (s - sq1) / 2);
        }
        if (disc2 >= -1e-7) {
          const sq2 = Math.sqrt(Math.max(0, disc2));
          uRoots.push((-s + sq2) / 2, (-s - sq2) / 2);
        }
      }
    }

    // Back-substitute (t = u - a/4), then polish every candidate against the
    // ORIGINAL (non-depressed) quartic with a few Newton iterations — the
    // resolvent/depression chain accumulates fp error the closer a root sits
    // to a true double root (the grazing/tangent case), and this recovers
    // full double precision there without needing a more exotic solver.
    const f = (t) => ((((t + a) * t) + b) * t + c) * t + d;
    const fp = (t) => (((4 * t) + (3 * a)) * t + (2 * b)) * t + c;
    const roots = uRoots.map((u) => {
      let t = u - (a / 4);
      for (let i = 0; i < 6; i++) {
        const fv = f(t);
        const fpv = fp(t);
        if (Math.abs(fpv) < 1e-14) break;
        const next = t - (fv / fpv);
        if (!Number.isFinite(next)) break;
        t = next;
      }
      return t;
    });
    roots.sort((x, y) => x - y);
    return roots;
  };

  /**
   * Intersect a ray with a torus centred at the local origin, axis +z, major
   * radius R, minor radius r. `origin`/`dir` are {x,y,z} in the SAME local
   * frame as the torus (caller's responsibility — see the wiring in
   * scene3d.js for the world/camera → torus-local transform chain). `dir`
   * need not be pre-normalized; it is normalized internally so returned `t`
   * values are true Euclidean distances along the ray from `origin`.
   *
   * Returns a plain array of real roots, ascending, ZERO OR MORE of them (0,
   * 1, 2, 3 or 4) — see the module header for why root count doesn't encode
   * entry/exit parity and why negative `t` (behind `origin`) is included.
   */
  const intersect = (origin, dir, R, r) => {
    const dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const dx = dir.x / dl;
    const dy = dir.y / dl;
    const dz = dir.z / dl;
    const px = origin.x;
    const py = origin.y;
    const pz = origin.z;
    const pd = (px * dx) + (py * dy) + (pz * dz);
    const pl2 = (px * px) + (py * py) + (pz * pz);
    const k = (R * R) - (r * r);
    const r2 = R * R;

    const a3 = 4 * pd;
    const a2 = (4 * pd * pd) + (2 * (pl2 + k)) - (4 * r2) + (4 * r2 * dz * dz);
    const a1 = (4 * pd * (pl2 + k - (2 * r2))) + (8 * r2 * pz * dz);
    const a0 = ((pl2 + k) * (pl2 + k)) - (4 * r2 * (pl2 - (pz * pz)));

    return solveQuartic(a3, a2, a1, a0);
  };

  /** Point along the ray at parameter t (Euclidean distance from `origin`). */
  const pointAt = (origin, dir, t) => {
    const dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
    return {
      x: origin.x + ((dir.x / dl) * t),
      y: origin.y + ((dir.y / dl) * t),
      z: origin.z + ((dir.z / dl) * t),
    };
  };

  const api = {
    intersect,
    pointAt,
    // Exposed for the unit test's independent cross-checks only — production
    // code never calls these directly, only `intersect`.
    solveQuartic,
    solveCubicAllReal,
  };

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, { RayTorus: api });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
