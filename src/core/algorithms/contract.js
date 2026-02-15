/**
 * @typedef {{ x: number, y: number }} Point
 * @typedef {Array<Point> & { meta?: Record<string, any> }} Path
 * @typedef {{
 *   generate: (params: Record<string, any>, rng: import('../rng.js').SeededRNG, noise: import('../noise.js').SimpleNoise, context: Record<string, any>) => Array<Path>,
 *   formula: (params: Record<string, any>) => string
 * }} AlgorithmDefinition
 */

/**
 * Runtime no-op that provides a typed algorithm contract boundary for JSDoc tooling.
 * @param {AlgorithmDefinition} algorithm
 * @returns {AlgorithmDefinition}
 */
export const defineAlgorithm = (algorithm) => algorithm;
