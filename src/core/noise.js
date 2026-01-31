/**
 * Simple 2D simplex noise generator.
 */
(() => {
  const { SeededRNG } = window.Vectura || {};

  class SimpleNoise {
    constructor(seed) {
      this.rng = new SeededRNG(seed);
      this.perm = new Uint8Array(512);
      this.grad3 = [
        [1, 1, 0],
        [-1, 1, 0],
        [1, -1, 0],
        [-1, -1, 0],
        [1, 0, 1],
        [-1, 0, 1],
        [1, 0, -1],
        [-1, 0, -1],
        [0, 1, 1],
        [0, -1, 1],
        [0, 1, -1],
        [0, -1, -1],
      ];
      this.seed(seed);
    }

    seed(v) {
      this.rng = new SeededRNG(v);
      const p = new Uint8Array(256).map((_, i) => i);
      for (let i = 255; i > 0; i--) {
        const r = Math.floor(this.rng.nextFloat() * (i + 1));
        [p[i], p[r]] = [p[r], p[i]];
      }
      for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    }

    dot(g, x, y) {
      return g[0] * x + g[1] * y;
    }

    noise2D(xin, yin) {
      const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
      const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
      let s = (xin + yin) * F2;
      let i = Math.floor(xin + s);
      let j = Math.floor(yin + s);
      let t = (i + j) * G2;
      let X0 = i - t;
      let Y0 = j - t;
      let x0 = xin - X0;
      let y0 = yin - Y0;
      let i1 = x0 > y0 ? 1 : 0;
      let j1 = x0 > y0 ? 0 : 1;
      let x1 = x0 - i1 + G2;
      let y1 = y0 - j1 + G2;
      let x2 = x0 - 1.0 + 2.0 * G2;
      let y2 = y0 - 1.0 + 2.0 * G2;
      let ii = i & 255;
      let jj = j & 255;
      let gi0 = this.perm[ii + this.perm[jj]] % 12;
      let gi1 = this.perm[ii + i1 + this.perm[jj + j1]] % 12;
      let gi2 = this.perm[ii + 1 + this.perm[jj + 1]] % 12;
      let n0 = 0;
      let n1 = 0;
      let n2 = 0;
      let t0 = 0.5 - x0 * x0 - y0 * y0;
      let t1 = 0.5 - x1 * x1 - y1 * y1;
      let t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t0 >= 0) {
        t0 *= t0;
        n0 = t0 * t0 * this.dot(this.grad3[gi0], x0, y0);
      }
      if (t1 >= 0) {
        t1 *= t1;
        n1 = t1 * t1 * this.dot(this.grad3[gi1], x1, y1);
      }
      if (t2 >= 0) {
        t2 *= t2;
        n2 = t2 * t2 * this.dot(this.grad3[gi2], x2, y2);
      }
      return 70.0 * (n0 + n1 + n2);
    }
  }

  window.Vectura = window.Vectura || {};
  window.Vectura.SimpleNoise = SimpleNoise;
})();
