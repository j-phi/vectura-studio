/**
 * Deterministic RNG based on a linear congruential generator.
 */
(() => {
  class SeededRNG {
    constructor(seed) {
      // LCG constants are pinned (tests/unit/rng-noise.test.js): changing a/c/m
      // silently re-renders every saved seed.
      this.m = 0x80000000;
      this.a = 1103515245;
      this.c = 12345;
      // `seed == null`, not `!seed` — 0 is a valid, falsy seed (SVG import hard-sets
      // it, and saved seed-0 layers must stay deterministic across reopens).
      this.state = seed == null ? Math.floor(Math.random() * (this.m - 1)) : seed;
    }

    nextInt() {
      this.state = (this.a * this.state + this.c) % this.m;
      return this.state;
    }

    nextFloat() {
      return this.nextInt() / (this.m - 1);
    }

    nextRange(min, max) {
      return min + this.nextFloat() * (max - min);
    }
  }

  const Vectura = (window.Vectura = window.Vectura || {});
  window.Vectura.SeededRNG = SeededRNG;
})();
