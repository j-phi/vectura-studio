const fs = require('fs');
const path = require('path');
const vm = require('vm');

const loadBuilder = () => {
  const file = path.resolve(__dirname, '../../src/ui/export-animated-svg.js');
  const window = {};
  const ctx = { window };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  return window.Vectura.AnimatedSvg;
};

describe('AnimatedSvg.buildDrawOn (draw-on SVG export core)', () => {
  let A;
  beforeAll(() => { A = loadBuilder(); });

  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

  test('emits a valid svg wrapping one <path> per polyline, each with a stroke-dashoffset <animate>', () => {
    const svg = A.buildDrawOn([square, square], { width: 20, height: 20, durationSec: 6 });
    expect(svg).toMatch(/^<\?xml/);
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 20 20"');
    expect((svg.match(/<path /g) || []).length).toBe(2);
    expect((svg.match(/<animate attributeName="stroke-dashoffset"/g) || []).length).toBe(2);
    expect(svg).toContain('repeatCount="indefinite"');
    expect(svg).toContain('dur="6s"');
  });

  test('stroke-dasharray equals the polyline length and dashoffset starts hidden', () => {
    const svg = A.buildDrawOn([square], { width: 20, height: 20 });
    const len = A.polylineLength(square); // 0->10->10->10 open = 30
    expect(len).toBeCloseTo(30, 6);
    expect(svg).toContain(`stroke-dasharray="30"`);
    expect(svg).toContain(`stroke-dashoffset="30"`); // starts fully hidden
  });

  test('keyTimes are valid SMIL: start at 0 and end at 1 for every path', () => {
    const svg = A.buildDrawOn([square, square, square], { width: 20, height: 20 });
    const keyTimes = [...svg.matchAll(/keyTimes="([^"]+)"/g)].map((m) => m[1]);
    expect(keyTimes.length).toBe(3);
    keyTimes.forEach((kt) => {
      const parts = kt.split(';').map(Number);
      expect(parts[0]).toBe(0);
      expect(parts[parts.length - 1]).toBe(1);
      // monotonic non-decreasing
      for (let i = 1; i < parts.length; i += 1) expect(parts[i]).toBeGreaterThanOrEqual(parts[i - 1]);
    });
  });

  test('multiple paths draw in sequence (cumulative begin offsets across the loop)', () => {
    // two equal-length paths -> first draws over [0,0.5], second over [0.5,1]
    const svg = A.buildDrawOn([square, square], { width: 20, height: 20 });
    const keyTimes = [...svg.matchAll(/keyTimes="([^"]+)"/g)].map((m) => m[1].split(';').map(Number));
    expect(keyTimes[0][1]).toBeCloseTo(0, 4);   // path 1 begins at 0
    expect(keyTimes[0][2]).toBeCloseTo(0.5, 4); // ...ends at 0.5
    expect(keyTimes[1][1]).toBeCloseTo(0.5, 4); // path 2 begins at 0.5
    expect(keyTimes[1][2]).toBeCloseTo(1, 4);   // ...ends at 1
  });

  test('degenerate / empty input yields a valid (empty) svg, no paths', () => {
    const svg = A.buildDrawOn([[], [{ x: 1, y: 1 }]], { width: 5, height: 5 });
    expect(svg).toContain('<svg');
    expect((svg.match(/<path /g) || []).length).toBe(0);
  });

  test('optional background rect is included when given', () => {
    expect(A.buildDrawOn([square], { width: 10, height: 10, background: '#222' })).toContain('<rect');
    expect(A.buildDrawOn([square], { width: 10, height: 10 })).not.toContain('<rect');
  });
});
