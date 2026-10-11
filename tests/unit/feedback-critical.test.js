const fs = require('node:fs');
const path = require('node:path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const ROOT = path.resolve(__dirname, '../..');

describe('always-run critical feedback roster', () => {
  test('seed zero stays deterministic and detects the known falsy-seed fallback defect', async () => {
    const rngPath = 'src/core/rng.js';
    const original = fs.readFileSync(path.join(ROOT, rngPath), 'utf8');
    const badNeedle = 'seed == null ?';
    expect(original.split(badNeedle)).toHaveLength(2);
    const badSource = original.replace(badNeedle, '!seed ?');
    let live;
    let mutant;
    try {
      live = await loadVecturaRuntime({ profile: 'core' });
      mutant = await loadVecturaRuntime({
        profile: 'core',
        scriptOverrides: {
          [rngPath]: `Math.random = () => (window.__randomCalls = (window.__randomCalls || 0) + 1) / 100;\n${badSource}`,
        },
      });

      const sequence = (window) => {
        const rng = new window.Vectura.SeededRNG(0);
        return Array.from({ length: 8 }, () => rng.nextFloat());
      };
      const liveA = sequence(live.window);
      const liveB = sequence(live.window);
      const faultyA = sequence(mutant.window);
      const faultyB = sequence(mutant.window);

      expect(liveA).toEqual(liveB);
      expect(new Set(liveA).size).toBeGreaterThan(1);
      expect(faultyA).not.toEqual(faultyB);
      expect(mutant.window.__randomCalls).toBeGreaterThan(1);
    } finally {
      live?.cleanup();
      mutant?.cleanup();
    }
  });
});
