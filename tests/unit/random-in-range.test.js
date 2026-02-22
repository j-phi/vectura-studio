const { randomInRange } = require('../../src/ui/randomization-utils.js');

describe('randomInRange', () => {
  test('returns min when random returns 0', () => {
    const min = 5;
    const max = 15;
    const mockRandom = () => 0;
    expect(randomInRange(min, max, mockRandom)).toBe(5);
  });

  test('returns max when random returns 1', () => {
    const min = 5;
    const max = 15;
    const mockRandom = () => 1;
    expect(randomInRange(min, max, mockRandom)).toBe(15);
  });

  test('returns midpoint when random returns 0.5', () => {
    const min = 10;
    const max = 20;
    const mockRandom = () => 0.5;
    expect(randomInRange(min, max, mockRandom)).toBe(15);
  });

  test('handles negative ranges', () => {
    const min = -10;
    const max = -5;
    const mockRandom = () => 0.4;
    // -10 + 0.4 * (-5 - (-10)) = -10 + 0.4 * 5 = -10 + 2 = -8
    expect(randomInRange(min, max, mockRandom)).toBeCloseTo(-8);
  });

  test('handles swapped min/max', () => {
    const min = 20;
    const max = 10;
    const mockRandom = () => 0.2;
    // 20 + 0.2 * (10 - 20) = 20 + 0.2 * (-10) = 20 - 2 = 18
    expect(randomInRange(min, max, mockRandom)).toBe(18);
  });

  test('handles same min and max', () => {
    const min = 7;
    const max = 7;
    const mockRandom = () => 0.9;
    expect(randomInRange(min, max, mockRandom)).toBe(7);
  });

  test('uses Math.random by default', () => {
    const min = 0;
    const max = 100;
    const result = randomInRange(min, max);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(100);
  });
});
