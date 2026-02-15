/**
 * Procedural algorithm registry assembler.
 */
import { attractor } from './attractor.js';
import { boids } from './boids.js';
import { defineAlgorithm } from './contract.js';
import { flowfield } from './flowfield.js';
import { grid } from './grid.js';
import { harmonograph } from './harmonograph.js';
import { hyphae } from './hyphae.js';
import { lissajous } from './lissajous.js';
import { petalis } from './petalis.js';
import { petalisDesigner } from './petalisdesigner.js';
import { phylla } from './phylla.js';
import { rainfall } from './rainfall.js';
import { rings } from './rings.js';
import { shapePack } from './shapepack.js';
import { spiral } from './spiral.js';
import { topo } from './topo.js';
import { wavetable } from './wavetable.js';

const defineAlgorithmMap = (algorithms) => {
  const out = {};
  Object.keys(algorithms).forEach((key) => {
    out[key] = defineAlgorithm(algorithms[key]);
  });
  return out;
};

/** @type {Record<string, import('./contract.js').AlgorithmDefinition>} */
export const Algorithms = defineAlgorithmMap({
  attractor,
  boids,
  flowfield,
  grid,
  harmonograph,
  hyphae,
  lissajous,
  petalis,
  petalisDesigner,
  phylla,
  rainfall,
  rings,
  shapePack,
  spiral,
  topo,
  wavetable,
});
