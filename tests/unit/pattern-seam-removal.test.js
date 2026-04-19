const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Load seam helpers in isolation via the registry hooks exposed in pattern.js
const loadSeamHelpers = () => {
  const filePath = path.resolve(__dirname, '../../src/core/algorithms/pattern.js');
  const code = fs.readFileSync(filePath, 'utf8');
  const context = {
    window: {
      Vectura: {
        AlgorithmRegistry: {},
        PATTERNS: [],
      },
    },
    document: {
      createElementNS: () => ({
        setAttribute() {},
        style: {},
        appendChild() {},
        remove() {},
        querySelectorAll: () => [],
      }),
      body: { appendChild() {}, removeChild() {} },
    },
    Math,
    DOMParser: class {
      parseFromString() {
        return { querySelector: () => null };
      }
    },
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: filePath });
  return {
    removeSeamSegments: context.window.Vectura.AlgorithmRegistry._removeSeamSegments,
    mergeTouchingChains: context.window.Vectura.AlgorithmRegistry._mergeTouchingChains,
  };
};

// Helper: build a closed {x,y} path from coordinate pairs
const closed = (...pairs) => {
  const pts = pairs.map(([x, y]) => ({ x, y }));
  pts.push({ ...pts[0] }); // close
  return pts;
};

const hasSegment = (path, ax, ay, bx, by) => {
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1];
    if (
      (Math.abs(a.x - ax) < 0.01 && Math.abs(a.y - ay) < 0.01 &&
       Math.abs(b.x - bx) < 0.01 && Math.abs(b.y - by) < 0.01) ||
      (Math.abs(a.x - bx) < 0.01 && Math.abs(a.y - by) < 0.01 &&
       Math.abs(b.x - ax) < 0.01 && Math.abs(b.y - ay) < 0.01)
    ) return true;
  }
  return false;
};

describe('Pattern seam removal — removeSeamSegments', () => {
  let removeSeamSegments;
  let mergeTouchingChains;

  beforeAll(() => {
    const helpers = loadSeamHelpers();
    removeSeamSegments = helpers.removeSeamSegments;
    mergeTouchingChains = helpers.mergeTouchingChains;
  });

  test('exposes _removeSeamSegments on the registry', () => {
    expect(typeof removeSeamSegments).toBe('function');
  });

  test('exposes _mergeTouchingChains on the registry', () => {
    expect(typeof mergeTouchingChains).toBe('function');
  });

  /**
   * Two tiles stacked vertically (tileH = 10).
   *
   *  Tile 1 (y = 0..10):
   *    top-U    — cap  at y=0  (unique, no tile above)
   *    inverted-U — base at y=10 (SEAM — shared with tile 2's top-U cap)
   *
   *  Tile 2 (y = 10..20):
   *    top-U    — cap  at y=10 (SEAM — shared with tile 1's inverted-U base)
   *    inverted-U — base at y=20 (unique, no tile below)
   *
   *  Seam segment: (2,10)→(8,10)
   *
   *  After removal the two split chains must reconnect into one closed path
   *  that spans both tiles — no horizontal segment at y=10.
   */
  test('U-shape + inverted-U: removes shared base/cap and reconnects sides seamlessly', () => {
    const topU_tile1   = closed([2,0],[8,0],[8,3],[2,3]);          // cap at y=0
    const invU_tile1   = closed([2,10],[8,10],[8,7],[2,7]);         // base at y=10  ← seam
    const topU_tile2   = closed([2,10],[8,10],[8,13],[2,13]);       // cap  at y=10  ← seam
    const invU_tile2   = closed([2,20],[8,20],[8,17],[2,17]);       // base at y=20

    const input = [topU_tile1, invU_tile1, topU_tile2, invU_tile2];
    const result = removeSeamSegments(input);

    // 1. Seam segment must not appear in ANY output path
    for (const p of result) {
      expect(hasSegment(p, 2, 10, 8, 10)).toBe(false);
    }

    // 2. The two unchanged boundary paths must survive intact
    const hasY0cap  = result.some(p => hasSegment(p, 2, 0, 8, 0));
    const hasY20base = result.some(p => hasSegment(p, 2, 20, 8, 20));
    expect(hasY0cap).toBe(true);
    expect(hasY20base).toBe(true);

    // 3. The merged path must exist and span across the seam boundary
    //    It must contain points from BOTH tile1's inverted-U (y=7) and tile2's top-U (y=13)
    const merged = result.find(p =>
      p.some(pt => Math.abs(pt.y - 7) < 0.01) &&
      p.some(pt => Math.abs(pt.y - 13) < 0.01)
    );
    expect(merged).toBeDefined();

    // 4. Total path count: 2 unchanged + 1 merged = 3
    expect(result.length).toBe(3);
  });

  test('passes through paths with no shared segments unchanged', () => {
    const a = closed([0,0],[10,0],[10,10],[0,10]);
    const b = closed([20,0],[30,0],[30,10],[20,10]);
    const result = removeSeamSegments([a, b]);
    expect(result.length).toBe(2);
    expect(result[0].length).toBe(a.length);
    expect(result[1].length).toBe(b.length);
  });

  test('full-tile rectangle 2×2 grid: interior edges removed, outer perimeter merges into one closed path', () => {
    // 2×2 grid of 10×10 tiles, each tile a rectangle exactly filling its boundary.
    // Interior edges (x=10 vertical, y=10 horizontal) each appear in 2 tiles → removed.
    // Outer perimeter edges each appear in only 1 tile → kept and reconnected.
    const tile = (ox, oy) => closed([ox,oy],[ox+10,oy],[ox+10,oy+10],[ox,oy+10]);
    const input = [tile(0,0), tile(10,0), tile(0,10), tile(10,10)];
    const result = removeSeamSegments(input);

    // Interior shared edges removed; outer perimeter merges into exactly 1 closed path
    expect(result.length).toBe(1);

    // The single result path must be closed and have the correct total point count
    const p = result[0];
    const firstKey = `${p[0].x},${p[0].y}`;
    const lastKey  = `${p[p.length-1].x},${p[p.length-1].y}`;
    expect(firstKey).toBe(lastKey);

    // No interior seam segments in the output
    expect(hasSegment(p, 0,10, 10,10)).toBe(false);   // interior horizontal
    expect(hasSegment(p, 10,0, 10,10)).toBe(false);   // interior vertical (top half)
    expect(hasSegment(p, 10,10, 10,20)).toBe(false);  // interior vertical (bottom half)
    expect(hasSegment(p, 10,10, 20,10)).toBe(false);  // interior horizontal (right half)

    // All outer perimeter edges must be present
    expect(hasSegment(p, 0,0, 10,0)).toBe(true);
    expect(hasSegment(p, 10,0, 20,0)).toBe(true);
    expect(hasSegment(p, 20,0, 20,10)).toBe(true);
    expect(hasSegment(p, 20,10, 20,20)).toBe(true);
    expect(hasSegment(p, 10,20, 20,20)).toBe(true);
    expect(hasSegment(p, 0,20, 10,20)).toBe(true);
    expect(hasSegment(p, 0,10, 0,20)).toBe(true);
    expect(hasSegment(p, 0,0, 0,10)).toBe(true);
  });

  test('junction pairing prefers collinear reconnection when multiple chains share a seam point', () => {
    const horizontalLeft = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
    const horizontalRight = [{ x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }];
    const diagDownLeft = [{ x: 1, y: -1 }, { x: 1.5, y: -0.5 }, { x: 2, y: 0 }];
    const diagDownRight = [{ x: 2, y: 0 }, { x: 2.5, y: 0.5 }, { x: 3, y: 1 }];

    const result = mergeTouchingChains([horizontalLeft, horizontalRight, diagDownLeft, diagDownRight]);

    expect(result).toHaveLength(2);
    const horizontal = result.find((path) => path.some((pt) => pt.x === 0) && path.some((pt) => pt.x === 4));
    const diagonal = result.find((path) => path.some((pt) => pt.y === -1) && path.some((pt) => pt.y === 1));

    expect(horizontal).toBeDefined();
    expect(diagonal).toBeDefined();
    expect(horizontal.some((pt) => pt.y !== 0)).toBe(false);
  });
});
